
const path = require('path');
const shelljs = require('shelljs');
const Util = require('../core/util.js');
//'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'
const EC = require('eight-colors');

const namingHandler = (dir) => {

    //check file name
    console.log(`${EC.magenta('check naming')} ${dir}`);

    const folder = Util.formatPath(path.relative(Util.root, dir));

    const invalidList = [];
    Util.forEachFile(dir, [], function(fileName, filePath) {

        const itemList = [folder];
        let invalid = false;
        //file path check

        filePath = path.relative(dir, filePath);
        if (filePath) {
            filePath = Util.formatPath(filePath);
            filePath.split('/').forEach(function(folderName) {
                const pathReg = /^[a-z0-9-]+$/g;
                const pathTest = pathReg.test(folderName);
                if (pathTest) {
                    itemList.push(folderName);
                } else {
                    itemList.push(EC.red(folderName));
                    invalid = true;
                }
            });
        }

        //file name check
        const nameReg = /^[a-z0-9-.]+$/g;
        const nameTest = nameReg.test(fileName);
        //console.log(nameTest);
        if (nameTest) {
            itemList.push(fileName);
        } else {
            itemList.push(EC.red(fileName));
            invalid = true;
        }

        if (invalid) {
            invalidList.push(itemList.join('/'));
        }

    });

    if (invalidList.length) {
        Util.logYellow('Expecting folder/file names to be: lowercase-dashed/lowercase-dashed.ext');
        invalidList.forEach(function(item) {
            console.log(item);
        });
        return 1;
    }

    return 0;
};


module.exports = async (config) => {

    const projectConfig = config.use.config;

    if (projectConfig.debug) {
        return 0;
    }
    const testDir = config.testDir;
    const code = await namingHandler(testDir);
    if (code !== 0) {
        return code;
    }
    const lintFiles = Util.relativePath(path.resolve(testDir));
    console.log(`${EC.magenta('check eslint')} ${lintFiles}`);
    const cmd = `npx eslint ./${lintFiles}/ --ext .js --env node --color --fix`;
    console.log(cmd);
    const sh = shelljs.exec(cmd);
    if (sh.code !== 0) {
        return sh.code;
    }

    return 0;
};
