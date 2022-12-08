const fs = require('fs');
const path = require('path');
const lodash = require('lodash');
const shelljs = require('shelljs');
// 'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'
const EC = require('eight-colors');
const Util = require('../core/util.js');

const lintHandler = require('./lint.js');
const clientHandler = require('./client.js');
const runner = require('./runner.js');

const testStart = async (config) => {
    console.log('start test ...');
    Util.cleanBrowserUserDataDir();
    const exitCode = await runner(config);
    Util.cleanBrowserUserDataDir();
    return exitCode;
};

// ========================================================================================

const caseHandler = function(str, type = 'L') {
    str = `${str}`;
    // Upper
    if (type === 'U') {
        return str.toUpperCase();
    }
    // UpperLower
    if (type === 'UL') {
        str = str.toLowerCase();
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
    // Lower
    return str.toLowerCase();
};

// ========================================================================================

const optionHandler = (config) => {

    const projectConfig = config.use;

    console.log('init test options ...');

    // related info
    projectConfig.date = new Date();
    projectConfig.percent = '0%';

    // debug mode
    projectConfig.debug = Util.option.debug;
    projectConfig.spec = Util.option.spec;

    if (Util.option.grep) {
        projectConfig.grep = Util.option.grep;
    }

    return 0;
};

const infoHandler = (config) => {
    console.log('init test info ...');
    const args = getArgs(Util.option.info);
    // console.log(args);
    const projectConfig = config.use;

    // merge info, conf.info <= default info <= args info
    const info = {
        ... projectConfig.info,
        name: projectConfig.name,
        env: caseHandler(projectConfig.env, 'U'),
        type: caseHandler(projectConfig.type, 'UL'),
        debug: projectConfig.debug,
        projectPath: Util.root,
        nmPath: Util.nmRoot,
        ... args
    };

    Util.logObject(info);
    // save new info
    projectConfig.info = info;

    return 0;
};

// ========================================================================================

const outputHandler = async (config) => {
    console.log('init test output ...');

    const outputDir = Util.formatPath(path.resolve(Util.getTempPath(), 'report'));
    if (fs.existsSync(outputDir)) {
        await Util.rm(outputDir);
        shelljs.mkdir('-p', outputDir);
    }
    config.outputDir = outputDir;
    console.log(`output dir: ${EC.cyan(Util.relativePath(outputDir))}`);

    // init test page download
    const projectConfig = config.use;
    const downloadPath = Util.relativePath(path.resolve(Util.getTempPath(), 'download'));
    shelljs.mkdir('-p', downloadPath);
    projectConfig.downloadPath = downloadPath;
    console.log(`download path: ${EC.cyan(downloadPath)}`);

    return 0;
};

const getArgs = (str) => {
    if (!str) {
        return null;
    }
    return JSON.parse(str);
};

const passwordHandler = (config) => {
    const projectConfig = config.use;
    const user = projectConfig.user;
    if (!user) {
        // no need user maybe
        return 0;
    }

    const args = getArgs(Util.option.password);
    if (!args) {
        return 0;
    }

    console.log('init test user password ...');
    // update user password
    Object.keys(user).forEach((k) => {
        const u = user[k];
        if (u && args[k]) {
            u.password = args[k];
        }
    });

    return 0;
};

// ========================================================================================

const loadConfig = async (configPath) => {
    const configModule = Util.require(configPath);
    if (!configModule) {
        Util.logRed(`ERROR: Fail to load config: ${configPath}`);
        return;
    }
    const option = {
        root: Util.root,
        cliRoot: Util.cliRoot,
        nmRoot: Util.nmRoot,
        ... Util.option
    };

    const config = await configModule(option, lodash);
    if (!config) {
        Util.logRed(`ERROR: Invalid config from: ${configPath}`);
        return;
    }
    return config;
};

const getConfig = async (configFile) => {
    const defaultConfigFile = 'config/config.default.js';
    let configPath = configFile || defaultConfigFile;
    if (path.extname(configPath) !== '.js') {
        configPath += '.js';
    }
    const configCurrentPath = path.resolve(configPath);
    console.log(`load config: ${EC.cyan(Util.relativePath(configCurrentPath))} ...`);
    const configDefaultPath = path.resolve(Util.cliRoot, defaultConfigFile);
    const configCurrent = await loadConfig(configCurrentPath);
    const configDefault = await loadConfig(configDefaultPath);
    return lodash.merge(configDefault, configCurrent);
};

const testModule = async (configFile) => {

    const config = await getConfig(configFile);
    if (!config) {
        process.exit(1);
        return;
    }

    // console.log(config);
    console.log('init test config ...');
    const tasks = [() => {
        return optionHandler(config);
    }, () => {
        return infoHandler(config);
    }, () => {
        return lintHandler(config);
    }, () => {
        return outputHandler(config);
    }, () => {
        return passwordHandler(config);
    }, () => {
        return clientHandler(config);
    }, () => {
        // run job list
        return testStart(config);
    }];

    const exitCode = await Util.tasksResolver(tasks);
    // always exit no matter exit code is 0
    process.exit(exitCode);

};

module.exports = testModule;
