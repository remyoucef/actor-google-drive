const { Duplex } = require('stream');
const { OPERATIONS_TYPES } = require('./consts');
const { Folder } = require('./operations/helper');

const validateAndParseInput = (input) => {
    console.log('Validating and parsing input...');

    const defaults = {
        isSetupMode: false,
        timeoutSecs: 5 * 60,
    };
    const ERROR_LABEL = '[PARSE_INPUT__ERROR]';
    if (typeof input !== 'object') {
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
            // eslint-disable-next-line prefer-destructuring
            constants = input.constants;
        }

        if (!input.operations) {
            throw new Error(`${ERROR_LABEL} Input must have the "operations" field!`);
        }
        if (!Array.isArray(input.operations) || input.operations.length === 0) {
            throw new Error(`${ERROR_LABEL} Input field "operations" must be of type array and has at least one operation!`);
        }

        for (const operation of input.operations) {
            const { type } = operation;
            if (!type || !Object.values(OPERATIONS_TYPES).includes(type)) {
                throw new Error(`${ERROR_LABEL} Input operation type must be of type string and is a valid type, provided value was ${type}`);
            }
            // eslint-disable-next-line default-case
            switch (type) {
                case OPERATIONS_TYPES.FILES_COPY: {
                    const { source, destination: inputDestination } = operation;
                    const folderParams = Folder.validateAndParse({ folder: inputDestination, constants });
                    parsedOperations.push({ type, source, destination: folderParams });
                    break;
                }
                case OPERATIONS_TYPES.FOLDERS_DELETE: {
                    const { folder: inputFolder } = operation;
                    const folderParams = Folder.validateAndParse({ folder: inputFolder, constants });
                    parsedOperations.push({ type, folder: folderParams });
                    break;
                }
            }
        }
    }
    return { isSetupMode, constants, operations: parsedOperations, timeoutSecs };
};

const bufferToStream = (buffer) => {
    const stream = new Duplex();
    stream.push(buffer);
    stream.push(null);
    return stream;
};

const throwIfTimeout = async (timeoutSecs = 60) => {
    await new Promise(resolve => setTimeout(resolve, timeoutSecs * 1000));
    throw new Error(`Actor didn't finish in required time (${timeoutSecs}).`);
};

module.exports = { validateAndParseInput, bufferToStream, throwIfTimeout };
