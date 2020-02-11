const { GOOGLE_APIS } = require('./consts');
const { validateAndParseInput } = require('./utils');

module.exports = class Config {
    constructor(input) {
        const { isSetupMode, operations, timeoutSecs } = validateAndParseInput(input);
        this.isSetupMode = isSetupMode;
        this.operations = operations;
        this.timeoutSecs = timeoutSecs;

        this.tokensStore = input.tokensStore || 'google-auth-tokens';

        this.googleApisCredentials = {
            client_id: GOOGLE_APIS.CLIENT_ID,
            client_secret: process.env.GOOGLE_APIS_CLIENT_SECRET,
            redirect_uri: GOOGLE_APIS.REDIRECT_URI,
        };
    }
};
