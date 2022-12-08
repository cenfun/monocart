const fs = require('fs');
const path = require('path');
// 'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'
const EC = require('eight-colors');

const Util = require('../core/util.js');
const build = require('../build/build.js');


module.exports = async (config) => {
    const projectConfig = config.use;

    const entry = projectConfig.client.entry;
    if (!entry) {
        return 0;
    }

    if (!fs.existsSync(entry)) {
        return 0;
    }

    const componentName = projectConfig.client.name;
    if (!componentName) {
        Util.logRed(`Invalid client name: ${componentName}`);
        return 1;
    }

    const outputPath = path.resolve(Util.getTempPath(), 'client');
    const outputFilename = `${componentName}.js`;
    const clientFile = path.resolve(outputPath, outputFilename);

    projectConfig.clientPath = Util.formatPath(clientFile);

    if (!Util.option.build && fs.existsSync(clientFile)) {
        return 0;
    }

    console.log('building client dist ...');
    const exitCode = await build({
        nmRoot: Util.nmRoot,
        entry,
        outputPath,
        outputFilename,
        outputLibrary: componentName
    });
    if (exitCode) {
        return exitCode;
    }

    console.log(`built client dist: ${EC.green(Util.relativePath(clientFile))}`);

    return 0;
};
