const Apify = require('apify');
const DriveService = require('./service');
const parseInput = require('./input');

Apify.main(async () => {
    const input = await Apify.getInput();
    console.log('Input:');
    console.dir(input);

    const { isSetupMode, operations, timeoutSecs } = parseInput(input);

    const driveService = new DriveService();
    await driveService.init();
    if (!isSetupMode) {
        await Promise.race([
            driveService.execute(operations),
            new Promise(resolve => setTimeout(resolve, timeoutSecs * 1000)),
        ]);
    }
});
