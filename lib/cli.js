#!/usr/bin/env node

const semver = require('semver');
const Util = require('./core/util.js');

//check node version
const nv = process.versions.node;

//check required version 12
const lowest = '12.13.0';
if (semver.lt(nv, lowest)) {
    Util.logRed(`Current NodeJS is ${nv}, requires version ${lowest} or newer`);
    process.exit(1);
}

//check latest version
const latest = '16.13.1';
if (semver.lt(nv, latest)) {
    Util.logYellow(`Current NodeJS is ${nv}, recommended version available: ${latest}`);
}

//===============================================================

Util.initRoot();

//===============================================================
//version checking
const version = Util.getCLIVersion();

//===============================================================
//log error
process.on('exit', (code) => {
    if (code) {
        Util.logOS(version);
    }
});

//===============================================================
//https://github.com/tj/commander.js
const program = require('commander');

program.version(version, '-v, --version');

//===============================================================

const initArgs = function(list) {
    const args = [];
    for (let i = 0, l = list.length; i < l; i++) {
        args.push(list[i]);
    }
    //commander 7, last one is Commander
    args.pop();
    //and option
    Util.option = args.pop();
    //and args
    return args;
};

const runTask = function(cmd, argList) {

    //run project task
    Util.command = cmd;

    const tasks = {
        test: true
    };
    const task = tasks[cmd];
    if (!task) {
        Util.logRed(`Invalid command: ${cmd}`);
        process.exit(1);
        return;
    }

    //no need init as component/monorepo project
    const noProjectTasks = {

    };

    //init project package.json and components path
    if (!noProjectTasks[cmd] && !Util.initProject()) {
        Util.logRed('Please execute command in your project root.');
        process.exit(1);
        return;
    }

    //console.log(Util.root, Util.cliRoot, Util.componentsRoot);

    let taskModule = null;
    try {
        taskModule = require(`./${cmd}/${cmd}.js`);
    } catch (e) {
        console.log(e);
    }
    if (!taskModule) {
        process.exit(1);
        return;
    }

    const args = initArgs(argList);
    //console.log(argList);
    //console.log(Util.option);
    //console.log(args);

    Util.logStart(`monocart ${cmd} ${args.join(' ')}`);
    taskModule.apply(this, args);
};

//===============================================================
program
    .command('test [config-file]')
    .alias('t')
    .description('test specs')
    .option('-d, --debug [slowMo]', 'debug mode')
    .option('-s, --spec <spec-path>', 'spec path')
    .option('-g, --grep <string>', 'only run matched tests')
    .option('-b, --build', 'build client and report')
    .option('-p, --password <password-json>', 'password: {id1:"pass1",id2:"pass2"}')
    .option('-i, --info <info-json>', 'info: {k1:"v1",k2:"v2"}')
    .action(function() {
        runTask('test', arguments);
    });

program.parse();

//last one if no args
if (program.rawArgs.length < 3) {
    program.help();
}
