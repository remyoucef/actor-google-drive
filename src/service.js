const { apifyGoogleAuth } = require('apify-google-auth');
const { google } = require('googleapis');
const { CopyFilesOperation, DeleteFolderOperation } = require('./operations/index');
const { Folder } = require('./operations/helper');

const DRIVE_ERROR_MESSAGES = {
    insufficientPermissions: 'The user does not have sufficient permissions for this file',
};
class DriveService {
    async init(params = {}) {
        console.log('Initializing drive service...');

        const { tokensStore = 'google-auth-tokens' } = params;

        /**
         * auth An authorized OAuth2 client.
         * @type {google.auth.OAuth2}
         * @private
         */
        this._auth = await apifyGoogleAuth({
            scope: 'drive',
            tokensStore,
        });
        /**
         * drive api endpoint.
         * @type {drive_v3.Drive}
         * @private
         */
        this._drive = google.drive({ version: 'v3', auth: this._auth });
    }


    /**
     * Lists files.
     */
    async listFiles(params = {}) {
        const defaults = {
            preListLogMsgFunction: ({ page, enableLog = false }) => enableLog && console.log(`Getting files (page ${page})...`),
            afterListLogMsgFunction: ({ files, enableLog = false }) => enableLog && console.log(`We found ${files.length} files`),
        };
        const {
            extraQ,
            pageSize = 1000,
            token = '',
            fields = 'nextPageToken, files(*)',
            root = false,
            trashed = false,
            spaces = 'drive',
            enableLog = false,
            filesList = [],
            page = 1,
            preListLogMsgFunction = defaults.preListLogMsgFunction,
            afterListLogMsgFunction = defaults.afterListLogMsgFunction,
        } = params;

        preListLogMsgFunction({ page, enableLog });

        const q = this.buildQuery({
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
        Array.prototype.push.apply(filesList, data.files);
        const files = data.nextPageToken
            ? await this.listFiles({
                extraQ,
                pageSize,
                token,
                fields,
                root,
                trashed,
                spaces,
                filesList,
                page: page + 1,
            })
            : filesList;

        if (filesList.length === data.files.length) {
            afterListLogMsgFunction({ files, enableLog });
        }
        return files;
    }

    createFile(params) {
        const {
            resource,
            media,
            fields = '*',
        } = params;

        return this._drive.files.create({
            resource,
            media,
            fields,
        });
    }

    updateFile(params) {
        const {
            fileId,
            media,
            fields = '*',
        } = params;

        return this._drive.files.update({
            fileId,
            media,
            fields,
        });
    }

    /**
     * Lists files without folders.
     */
    async listFilesWithoutFolders(params = {}) {
        let { extraQ = '' } = params;
        if (extraQ === '') extraQ = 'mimeType != \'application/vnd.google-apps.folder\'';

        if (!extraQ.includes('mimeType')) extraQ += ' and mimeType != \'application/vnd.google-apps.folder\'';
        const files = await this.listFiles({
            ...params,
            extraQ,
        });

        return files;
    }

    /**
     * Lists folders.
     */
    async listFolders(params = {}) {
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
        } = params;
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
    async listRootFolders(params = {}) {
        const {
            extraQ,
            pageSize = 1000,
            token = '',
            fields = 'nextPageToken, files(id, name, parents)',
            trashed = false,
        } = params;

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
        const qArr = [];
        if (mimeType) qArr.push(`mimeType='${mimeType}'`);
        if (root) qArr.push('\'root\' in parents');
        if (typeof trashed === 'boolean') qArr.push(`trashed=${trashed}`);
        if (extraQ) qArr.push(`${extraQ}`);
        return qArr.join(' and ');
    }

    /**
     *
     * @param {Object} params
     * @return {GaxiosPromise<Schema$File>}
     */
    async createOrUpdateFile(params) {
        const searchFiles = await this.getFileData({ ...params });

        if (searchFiles.length > 0) return this.updateFile({ fileId: searchFiles[0].id, ...params });

        return this.createFile(params);
    }

    async getFileData(params) {
        const {
            resource: { name, parents },
        } = params;

        let extraQ = `name = '${name}'`;
        if (parents && parents.length > 0) {
            extraQ += ` and (${parents.map(p => `'${p}' in parents`)
                .join(' or ')})`;
        }
        const searchFiles = await this.listFilesWithoutFolders({ ...params, extraQ });
        return searchFiles;
    }

    async copyFile(file, parentFolderId, filesProvider) {
        if (typeof file !== 'object') throw new Error(`DriveService.copyFile(): Parameter "file" must be of type object, provided value was "${file}"`);
        const name = filesProvider.getFileName(file.key);
        console.log(`Copying file ${name}...`);

        const params = {
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
        const copiedFile = await this.createOrUpdateFile(params);
        return copiedFile;
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
            const params = {
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
                if (currentFolder) params.resource.parents = [currentFolder.id];
                ({ data: currentFolder } = await this.createFile(params));
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
