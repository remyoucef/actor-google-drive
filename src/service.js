const Apify = require('apify');
const { apifyGoogleAuth } = require('apify-google-auth');
const { google } = require('googleapis');
const { CopyFilesOperation, DeleteFolderOperation } = require('./operations');

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
            root = true,
            trashed = false,
        } = settings;

        console.log('Getting root folders...');

        const rootFolders = await this.listFolders({
            extraQ,
            pageSize,
            token,
            fields,
            root,
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

    async getFolderInfo(folderPath) {
        console.log(`Getting folder info ${folderPath}...`);

        if (folderPath.indexOf('/') === 0) throw new Error(`DriveService.getFolderInfo(): Folder path shouldn't start with "/" character! provided value was ${folderPath}`);

        const result = { folderId: null };

        const foldersNames = folderPath.split('/').map(str => str.trim());
        const parentFolder = { id: 'root', name: foldersNames[0] };
        const rootFolders = await this.listRootFolders({
            extraQ: `name = '${parentFolder.name}'`,
        });
        for (const folderName of foldersNames) {
            let folder;
            if (parentFolder.id === 'root') {
                folder = rootFolders.find(f => f.name === parentFolder.name);
            } else {
                const searchFolders = await this.listFolders({
                    extraQ: `name = '${folderName}'`,
                });

                folder = searchFolders.find(f => f.name === folderName && f.parents[0] === parentFolder.id);
            }
            if (!folder) {
                result.folderId = null;
                break;
            }
            parentFolder.id = folder.id;
            parentFolder.name = folder.name;
            result.folderId = parentFolder.id;
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

        return result;
    }

    async createFolder(folderPath) {
        console.log(`Creating folder ${folderPath}...`);

        if (folderPath.indexOf('/') === 0) throw new Error(`DriveService.createFolder(): Folder path shouldn't start with "/" character! provided value was ${folderPath}`);
        const rootFolders = await this.listRootFolders();
        const foldersNames = folderPath.split('/').map(str => str.trim());
        let parentFolderId = 'root';
        for (const folderName of foldersNames) {
            const settings = {
                resource: {
                    name: folderName,
                    mimeType: 'application/vnd.google-apps.folder',
                } };
            let folder;
            if (parentFolderId === 'root') {
                folder = rootFolders.find(f => f.name === folderName);
            } else {
                // folder = allFolders.find(f => f.name === folderName && f.parents[0] === parentFolderId);
                settings.resource.parents = [parentFolderId];
            }
            if (!folder) {
                ({ data: folder } = await this.createFile(settings));
            }
            parentFolderId = folder.id;
        }

        const result = { folderId: parentFolderId };

        console.log(`Folder created ${folderPath} with id "${result.folderId}"`);

        return result;
    }
}

module.exports = DriveService;
