const Apify = require('apify');
const Config = require('./Config');
const Service = require('./Service');
const { throwIfTimeout } = require('./utils');

Apify.main(async () => {
    const input = await Apify.getInput();
    console.log('Input:');
    console.dir(input, { depth: 8 });


    const config = new Config(input);

    const service = new Service(config);
    await service.init();

    const { isSetupMode, timeoutSecs } = config;
    if (!isSetupMode) {
        await Promise.race([
            service.execute(),
            throwIfTimeout(timeoutSecs),
        ]);
    }
    console.log('Actor finish');
});
