const path = require('path');
const { getLocalUserInfo } = require('apify-cli/src/lib/utils');
const { ENV_VARS } = require('apify-shared/consts');

const prepareEnv = () => {
    const userInfo = getLocalUserInfo();
    const { proxy, id: userId, token } = userInfo;
    if (proxy && proxy.password) process.env[ENV_VARS.PROXY_PASSWORD] = proxy.password;
    if (userId) process.env[ENV_VARS.USER_ID] = userId;
    if (token) process.env[ENV_VARS.TOKEN] = token;
    process.env[ENV_VARS.LOCAL_STORAGE_DIR] = path.join(process.cwd(), './apify_storage');
};

prepareEnv();

const Apify = require('apify');

const { log } = Apify.utils;

const cleanAndGetKeyValueStore = async (idOrName, options = {}) => {
    let kvs = await Apify.openKeyValueStore(idOrName, options);
    await kvs.drop();
    kvs = await Apify.openKeyValueStore(idOrName, options);
    return kvs;
};


Apify.main(async () => {
    prepareEnv();
    log.info('Preparing Apify platform for tests...');
    const LOCAL_GD_TEST_KVS_NAME = 'gd-test';
    const REMOTE_GD_TEST_KVS_NAME = 'gd-test-store';
    const localKvs = await Apify.openKeyValueStore(LOCAL_GD_TEST_KVS_NAME);
    const platformKvs = await cleanAndGetKeyValueStore(REMOTE_GD_TEST_KVS_NAME, { forceCloud: true });
    await localKvs.forEachKey(async (key, index, info) => {
        log.info(`[KVS: ${REMOTE_GD_TEST_KVS_NAME}] Writing content "${key}" (info: ${JSON.stringify(info)})`);
        await platformKvs.setValue(key, await localKvs.getValue(key));
    });
});
