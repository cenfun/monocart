const path = require('path');
const shelljs = require('shelljs');
const serialize = require('serialize-javascript');
const Util = require('../core/util.js');

module.exports = (config) => {

    config.reporter = [
        ['list'],
        ['json', {
            outputFile: '.temp/json/report.json'
        }],
        ['html', {
            open: 'never',
            outputFolder: '.temp/html'
        }],
        ['monocart-reporter', {
            outputFile: '.temp/report/report.html'
        }]
    ];

    // config serialize string
    let configStr = serialize(config, {
        space: 4,
        unsafe: true
    });
    configStr = `const config = ${configStr};\nmodule.exports = config;`;

    // temp config
    const configTempPath = Util.relativePath(path.resolve(Util.root, '.config.runner.js'));
    Util.writeFileContentSync(configTempPath, configStr, true);

    const configSavePath = Util.relativePath(path.resolve(Util.getTempPath(), 'config.runner.js'));
    Util.writeFileContentSync(configSavePath, configStr, true);

    const list = ['npx playwright test'];

    const projectConfig = config.metadata;
    if (projectConfig.spec) {
        list.push(projectConfig.spec);
    }

    list.push(`-c ${configTempPath}`);

    if (projectConfig.debug) {
        list.push('--headed');
        list.push('--timeout=0');
        // list.push('--max-failures=1');
        list.push('--workers=1');
    }

    const cmd = list.join(' ');
    Util.logCyan(cmd);

    const sh = shelljs.exec(cmd);

    // remove temp config always
    Util.rmSync(configTempPath);

    return sh.code;
};
