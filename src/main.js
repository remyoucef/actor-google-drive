const Apify = require('apify');
const DriveService = require('./service');
const parseInput = require('./input');

function throwIfTimeout(timeoutSecs) {
    return new Promise(resolve => setTimeout(resolve, timeoutSecs * 1000))
        .then(() => {
            throw new Error(`Actor didn't finish in required time (${timeoutSecs}).`);
        });
}

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
            throwIfTimeout(timeoutSecs),
        ]);
    }
});
