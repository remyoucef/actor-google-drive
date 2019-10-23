const { apifyGoogleAuth } = require('apify-google-auth');
const { google } = require('googleapis');
const { CopyFilesOperation, DeleteFolderOperation } = require('./operations/index');
const { Folder } = require('./operations/helper');

const DRIVE_ERROR_MESSAGES = {
    insufficientPermissions: 'The user does not have sufficient permissions for this file',
};
class DriveService {
    async init(settings = {}) {
        console.log('Initializing drive service...');

        const { tokensStore = 'google-auth-tokens' } = settings;
        /**
         * auth An authorized OAuth2 client.
         * @type {google.auth.OAuth2}
         * @private
         */
        this._auth = await apifyGoogleAuth({
            scope: 'drive',
            tokensStore,
        });
        this._drive = google.drive({ version: 'v3', auth: this._auth });
    }

    /**
     * Lists the names and IDs of files.
     */
    listFiles(settings) {
        const {
            pageSize = 10,
            fields = 'nextPageToken, files(id, name)',
        } = settings;
        return this._drive.files.list(
            {
                pageSize,
                fields,
            },
        );
    }

    /**
     * Lists folders.
     */
    async listFolders(settings = {}) {
        const defaults = {
            preListLogMsgFunction: ({ page, enableLog = false }) => enableLog && console.log(`Getting folders (page ${page})...`),
            afterListLogMsgFunction: ({ folders, enableLog = false }) => enableLog && console.log(`We found ${folders.length} folders`),
        };
        const {
            extraQ,
            pageSize = 1000,
            token = '',
            fields = 'nextPageToken, files(id, name, parents)',
            root = false,
            trashed = false,
            spaces = 'drive',
            enableLog = false,
            folderList = [],
            page = 1,
            preListLogMsgFunction = defaults.preListLogMsgFunction,
            afterListLogMsgFunction = defaults.afterListLogMsgFunction,
        } = settings;
        const mimeType = 'application/vnd.google-apps.folder';

        preListLogMsgFunction({ page, enableLog });

        const q = this.buildQuery({
            mimeType,
            root,
            trashed,
            extraQ,
        });
        const { data } = await this._drive.files.list(
            {
                q,
                spaces,
                pageToken: token,
                pageSize,
                fields,
            },
        );
        Array.prototype.push.apply(folderList, data.files);
        const folders = data.nextPageToken
            ? await this.listFolders({
                extraQ,
                pageSize,
                token,
                fields,
                root,
                trashed,
                spaces,
                folderList,
                page: page + 1,
            })
            : folderList;

        if (folderList.length === data.files.length) {
            afterListLogMsgFunction({ folders, enableLog });
        }
        return folders;
    }

    /**
     * Lists root folders.
     */
    async listRootFolders(settings = {}) {
        const {
            extraQ,
            pageSize = 1000,
            token = '',
            fields = 'nextPageToken, files(id, name, parents)',
            trashed = false,
        } = settings;

        console.log('Getting root folders...');

        const rootFolders = await this.listFolders({
            extraQ,
            pageSize,
            token,
            fields,
            root: true,
            trashed,
        });
        console.log(`We found ${rootFolders.length} root folders.`);
        return rootFolders;
    }

    buildQuery({ mimeType, root, trashed, extraQ }) {
        return `mimeType='${mimeType}' ${root ? 'and \'root\' in parents ' : ''} and trashed=${trashed} ${extraQ ? `and ${extraQ}` : ''}`;
    }

    createFile(settings) {
        const {
            resource,
            media,
            fields = 'id',
        } = settings;

        return this._drive.files.create({
            resource,
            media,
            fields,
        });
    }

    async copyFile(file, parentFolderId, filesProvider) {
        if (typeof file !== 'object') throw new Error(`DriveService.copyFile(): Parameter "file" must be of type object, provided value was "${file}"`);
        const name = filesProvider.getFileName(file.key);
        console.log(`Copying file ${name}...`);

        const settings = {
            resource: {
                ...file.options.resource,
                name,
                parents: [parentFolderId],
            },
            media: {
                ...file.options.media,
                body: await filesProvider.getFileStream(file.key),
            },
        };
        await this.createFile(settings);
    }

    async execute(operations) {
        console.log('Executing operations...');

        for (const operation of operations) {
            switch (true) {
                case (
                    operation instanceof CopyFilesOperation
                || operation instanceof DeleteFolderOperation
                ): break;

                default: {
                    throw new Error(`DriveService.execute(): The operation type "${operation}" is not recognized!`);
                }
            }
            await operation.execute(this);
        }
    }

    /**
     *
     * @param folder<Folder>
     * @return {Promise<{folderId: null}>}
     */
    async getFolderInfo(folder) {
        console.log(`Getting folder info ${folder}...`);

        this.checkFolderOrThrow(folder);

        const result = { folderId: null };

        const folders = folder.getFolders();

        let currentFolder;

        for (const folderEl of folders) {
            let searchedFolder;
            if (folderEl.root) {
                const searchFolders = await this.listFolders({
                    extraQ: `name='${folderEl.name}'`,
                });
                searchedFolder = searchFolders.find((f) => {
                    if (folderEl.id) return f.id === folderEl.id;
                    return f.name === folderEl.name;
                });
            } else {
                const searchFolders = await this.listFolders({
                    extraQ: `name = '${folderEl.name}' and '${currentFolder.id}' in parents` });


                searchedFolder = searchFolders.find(f => f.name === folderEl.name && f.parents[0] === currentFolder.id);
            }
            if (!searchedFolder) {
                result.folderId = null;
                break;
            }
            currentFolder = searchedFolder;
            result.folderId = currentFolder.id;
        }
        return result;
    }

    async deleteFolder(folderId) {
        if (!folderId) throw new Error('Parameter "folderId" is not defined!');

        console.log(`Deleting folder with id ${folderId}...`);

        try {
            const result = await this._drive.files.delete({
                fileId: folderId,
            });
            if (result.code === 404 && result.message.includes('File not found')) console.log(`Couldn't delete folder with id "${folderId}" because it doesn't exist`);
        } catch (e) {
            if (e.message.includes(DRIVE_ERROR_MESSAGES.insufficientPermissions)) {
                throw new Error(`${DRIVE_ERROR_MESSAGES.insufficientPermissions} (id="${folderId}")`);
            }
            throw e;
        }
    }

    /**
     *
     * @param folder<Folder>
     * @return {Promise<{folderId: *}>}
     */
    async createFolder(folder) {
        this.checkFolderOrThrow(folder);

        console.log(`Creating folder ${folder}...`);

        const result = { folderId: null };

        const folders = folder.getFolders();

        let currentFolder;

        for (const folderEl of folders) {
            const settings = {
                resource: {
                    name: folderEl.name,
                    mimeType: 'application/vnd.google-apps.folder',
                } };
            let searchedFolder;
            if (folderEl.root) {
                const searchFolders = await this.listFolders({
                    extraQ: `name='${folderEl.name}'`,
                });
                searchedFolder = searchFolders.find((f) => {
                    if (folderEl.id) return f.id === folderEl.id;
                    return f.name === folderEl.name;
                });
            } else {
                const searchFolders = await this.listFolders({
                    extraQ: `name = '${folderEl.name}' and '${currentFolder.id}' in parents` });

                searchedFolder = searchFolders.find(f => f.name === folderEl.name && f.parents[0] === currentFolder.id);
            }
            if (!searchedFolder) {
                if (currentFolder) settings.resource.parents = [currentFolder.id];
                ({ data: currentFolder } = await this.createFile(settings));
            } else {
                currentFolder = searchedFolder;
            }

            result.folderId = currentFolder.id;
        }

        console.log(`Folder created: folder="${folder}"\nid="${result.folderId}"`);

        return result;
    }

    checkFolderOrThrow(folder) {
        if (!folder || !(folder instanceof Folder)) throw new Error(`Parameter "folder" must be an instance of Folder! provided value was ${JSON.stringify(folder)}`);
    }
}

module.exports = DriveService;
