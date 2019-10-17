const { typeCheck } = require('type-check');

class Folder {
    constructor(params) {
        this.validate(params);
        for (const paramKey of Object.keys(params)) {
            this[paramKey] = params[paramKey];
        }
    }

    validate(params) {
        if (!typeCheck('Object', params)) {
            throw new Error(`Folder: Parameter "params" must be of type string or object, provided value was ${JSON.stringify(params)}`);
        }
        if (!typeCheck('String', params.parentFolderId)
            || !typeCheck('String', params.parentFolderName)) {
            throw new Error('Folder: Parameter "params" must have at least one this fields: "parentFolderId", "parentFolderName".');
        }
        if (params.relativePath && !typeCheck('Maybe String', params.relativePath)) {
            throw new Error('Folder: Parameter "params" must have the field "relativePath" as "String".');
        }
        // TODO: Add support for folder path as String
        // if (typeCheck('String', params) && params === '') throw new Error(`Folder: Parameter "params" must not be empty string`);
    }

    getFolders() {
        const folders = [];
        folders.push({
            id: this.parentFolderId,
            name: this.parentFolderName,
            root: true,
        });
        if (this.relativePath) {
            for (const folderName of this.relativePath.split('/')) {
                folders.push({
                    name: folderName,
                    root: false,
                });
            }
        }
        return folders;
    }

    toString() {
        if (this.folderAsString) return this.folderAsString;
        const parent = (this.parentFolderName || '') + (this.parentFolderId ? `::${this.parentFolderId}` : '');
        const relative = this.relativePath ? `/${this.relativePath}` : '';
        const folderAsString = `{${parent}}${relative}`;
        this.folderAsString = folderAsString;
        return folderAsString;
    }

    static make({ folder, constants }) {
        let folderParams = folder;

        if (typeCheck('String', folderParams) && folderParams.includes('constants.')) folderParams = constants[folderParams.split('.')[1]];

        return new Folder(folderParams);
    }
}

module.exports = { Folder };
