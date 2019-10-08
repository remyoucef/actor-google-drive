const Apify = require('apify');
const DriveService = require('./service');
const parseInput = require('./input');

Apify.main(async () => {
    const input = await Apify.getInput();
    console.log('Input:');
    console.dir(input);

    const { isSetupMode, operations } = parseInput(input);

    const driveService = new DriveService();
    await driveService.init();
    if (!isSetupMode) await driveService.execute(operations);
});
