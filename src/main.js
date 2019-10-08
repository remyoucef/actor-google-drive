const Apify = require('apify');
const DriveService = require('./service');
const parseInput = require('./input');

Apify.main(async () => {
    const input = await Apify.getInput();
    console.log('Input:');
    console.dir(input);

    const operations = parseInput(input);

    const driveService = new DriveService();
    await driveService.init();
    await driveService.execute(operations);
});
