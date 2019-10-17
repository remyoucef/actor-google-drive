const { OPERATIONS_TYPES, CopyFilesOperation, DeleteFolderOperation } = require('./operations/index');
const { Folder } = require('./operations/helper');

const parseInput = (input) => {
    console.log('Parsing input...');

    const defaults = {
        isSetupMode: false,
        timeoutSecs: 5 * 60,
    };
    const ERROR_LABEL = '[PARSE_INPUT__ERROR]';
    if (!input) {
        throw new Error(`${ERROR_LABEL} Input must be a JSON object`);
    }
    const isSetupMode = input.isSetupMode || defaults.isSetupMode;
    const timeoutSecs = input.timeoutSecs
        ? Number(input.timeoutSecs)
        : defaults.timeoutSecs;

    const parsedOperations = [];
    let constants = {};
    if (!input.isSetupMode) {
        // TODO: Validate constants and parse them
        if (typeof input.constants === 'object') {
            constants = input.constants;
        }

        if (!input.operations) {
            throw new Error(`${ERROR_LABEL} Input must have the "operations" field!`);
        }
        if (!Array.isArray(input.operations) || input.operations.length === 0) throw new Error(`${ERROR_LABEL} Input field "operations" must be of type array and has at least one operation!`);

        for (const operation of input.operations) {
            const { type } = operation;
            if (!type || !Object.values(OPERATIONS_TYPES).includes(type)) throw new Error(`${ERROR_LABEL} Input operation type must be of type string and is a valid type, provided value was ${type}`);
            // eslint-disable-next-line default-case
            switch (type) {
                case OPERATIONS_TYPES.FILES_COPY: {
                    const { source, destination: inputDestination } = operation;
                    const destination = Folder.make({ folder: inputDestination, constants });
                    parsedOperations.push(new CopyFilesOperation({ source, destination }));
                    break;
                }
                case OPERATIONS_TYPES.FOLDERS_DELETE: {
                    const { folder: inputFolder } = operation;
                    const folder = Folder.make({ folder: inputFolder, constants });
                    parsedOperations.push(new DeleteFolderOperation({ folder }));
                    break;
                }
            }
        }
    }
    return { isSetupMode, constants, operations: parsedOperations, timeoutSecs };
};

module.exports = parseInput;
