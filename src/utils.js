const { Duplex } = require('stream');

function getFolderTree(drive, nextPageToken, folderList) {
    drive.files.list({
        pageToken: nextPageToken || '',
        pageSize: 1000,
        q: "mimeType='application/vnd.google-apps.folder'",
        fields: 'files(id,name,parents),nextPageToken',
    }, (err, { data }) => {
        if (err) return console.log(`The API returned an error: ${err}`);
        const token = data.nextPageToken;
        Array.prototype.push.apply(folderList, data.files);
        if (token) {
            getFolderTree(drive, token, folderList);
        } else {
            // This script retrieves a folder tree under this folder ID.
            const folderId = '### Top folder ID ###';

            const folderTree = (function c(folder, folderSt, res) {
                const ar = folderList.filter(e => e.parents[0] == folder);
                folderSt += `${folder}#_aabbccddee_#`;
                const arrayFolderSt = folderSt.split('#_aabbccddee_#');
                arrayFolderSt.pop();
                res.push(arrayFolderSt);
                ar.length == 0 && (folderSt = '');
                ar.forEach(e => c(e.id, folderSt, res));
                return res;
            }(folderId, '', []));

            // Output the folder tree.
            console.log(folderTree);
        }
    });
}

const bufferToStream = (buffer) => {
    const stream = new Duplex();
    stream.push(buffer);
    stream.push(null);
    return stream;
};
module.exports = { bufferToStream };
