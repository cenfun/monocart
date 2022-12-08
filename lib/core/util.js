const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const rimraf = require('rimraf');
const shelljs = require('shelljs');

// 'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'
const EC = require('eight-colors');

const CG = require('console-grid');

// get system number of cpus
const numCPUs = os.cpus().length;
// test single process
// numCPUs = 1;

const Util = {
    name: 'monocart',
    CG: CG,

    numCPUs: numCPUs,
    option: {},

    // global cache
    projectConf: null,
    projectBranch: '',

    // global property
    root: '',
    cliRoot: '',
    nmRoot: '',
    projectConfPath: '',
    config: {},
    workerLength: 0,
    jobLength: 0,

    initRoot: function() {
        // project root
        Util.root = Util.formatPath(process.cwd());

        // cli root
        Util.cliRoot = Util.formatPath(path.resolve(__dirname, '../../'));

        // node modules root
        Util.nmRoot = Util.cliRoot;

        const rel = Util.formatPath(path.relative(Util.root, Util.cliRoot));
        // console.log(`rel root: ${rel}`);
        if (rel === `node_modules/${Util.name}`) {
            // has been installed in local
            Util.nmRoot = Util.root;
        }
        // console.log(`root: ${Util.root}`);
        // console.log(`cliRoot: ${Util.cliRoot}`);
        // console.log(`nmRoot: ${Util.nmRoot}`);
    },

    initProject: function() {

        Util.projectConfPath = path.resolve(Util.root, 'package.json');

        // check project package.json file
        if (!fs.existsSync(Util.projectConfPath)) {
            Util.logRed(`ERROR: Not found package.json: ${Util.projectConfPath}`);
            return false;
        }

        const pc = Util.getProjectConf();
        if (!pc) {
            Util.logRed(`ERROR: Can NOT read package.json: ${Util.projectConfPath}`);
            return false;
        }

        return true;
    },

    getCLIVersion: () => {
        if (Util.cliVersion) {
            return Util.cliVersion;
        }
        const cliConf = Util.require(`${Util.cliRoot}/package.json`);
        if (cliConf) {
            Util.cliVersion = cliConf.version;
        }
        return Util.cliVersion;
    },

    getTempPath: function() {
        if (Util.tempPath) {
            return Util.tempPath;
        }
        Util.tempPath = Util.formatPath(path.resolve(Util.root, '.temp'));
        if (!fs.existsSync(Util.tempPath)) {
            shelljs.mkdir('-p', Util.tempPath);
        }
        return Util.tempPath;
    },

    getTemplate: function(templatePath) {
        if (!Util.templateCache) {
            Util.templateCache = {};
        }
        let template = Util.templateCache[templatePath];
        if (!template) {
            template = Util.readFileContentSync(templatePath);
            if (template) {
                Util.templateCache[templatePath] = template;
            } else {
                Util.logRed(`ERROR: Not found template: ${templatePath}`);
            }
        }
        return template;
    },

    getAbout: function(apiId, apiName) {
        const template = Util.getTemplate(`${__dirname}/about.html`);
        return Util.replace(template, {
            apiId: apiId,
            apiName: apiName,
            version: Util.getHSVersion(),
            timestamp: Util.getTimestamp()
        });
    },

    // ============================================================================

    getProjectConf: function(force) {
        if (force === true) {
            Util.projectConf = null;
        }
        if (!Util.projectConf) {
            if (!Util.projectConfPath) {
                Util.projectConfPath = `${Util.root}/package.json`;
            }
            Util.projectConf = Util.readJSONSync(Util.projectConfPath);
        }
        if (force && typeof (force) === 'string') {
            return Util.projectConf[force];
        }
        return Util.projectConf;
    },

    saveProjectConf: function(pc) {
        Util.writeJSONSync(Util.projectConfPath, pc);
    },

    getConfModule: function(name) {
        const key = `${name}Conf`;
        if (Util[key]) {
            return Util[key];
        }
        const filename = `conf.${name}.js`;
        let conf = Util.require(`${Util.root}/${filename}`);
        if (!conf) {
            conf = Util.require(`${Util.cliRoot}/${filename}`);
        }
        Util[key] = conf;
        return conf;
    },

    createConf: function(name, option) {
        const confModule = Util.getConfModule(name);
        let conf = {};
        if (confModule) {
            try {
                conf = confModule.create(option);
            } catch (e) {
                console.log(e);
            }
        }
        return conf;
    },

    mergeOption: function(... args) {
        const option = {};
        args.forEach((item) => {
            if (!item) {
                return;
            }
            Object.keys(item).forEach((k) => {
                const nv = item[k];
                if (Util.hasOwn(option, k)) {
                    const ov = option[k];
                    if (ov && typeof ov === 'object') {
                        if (nv && typeof nv === 'object' && !Array.isArray(nv)) {
                            option[k] = Util.mergeOption(ov, nv);
                            return;
                        }
                    }
                }
                option[k] = nv;
            });
        });
        return option;
    },

    getBeautifyOption: function() {
        let option = Util.readJSONSync(`${Util.root}/.jsbeautifyrc`);
        if (!option) {
            option = Util.readJSONSync(`${Util.cliRoot}/.jsbeautifyrc`);
        }
        if (!option) {
            option = {
                'indent_size': 4,
                'indent_char': ' ',
                'indent_with_tabs': false,
                'editorconfig': false,
                'eol': '\n',
                'end_with_newline': true,
                'indent_level': 0,
                'preserve_newlines': true,
                'max_preserve_newlines': 10,
                'space_in_paren': false,
                'space_in_empty_paren': false,
                'jslint_happy': false,
                'space_after_anon_function': false,
                'space_after_named_function': false,
                'brace_style': 'collapse',
                'unindent_chained_methods': false,
                'break_chained_methods': false,
                'keep_array_indentation': false,
                'unescape_strings': false,
                'wrap_line_length': 0,
                'e4x': false,
                'comma_first': false,
                'operator_position': 'before-newline',
                'indent_empty_lines': false,
                'templating': ['auto']
            };
        }
        return option;
    },

    // ============================================================================

    getHash: function(hash) {
        if (!hash) {
            return '';
        }
        let len = Util.toNum(hash) || 8;
        len = Util.clamp(len, 3, 32);
        return Util.generateGUID().split('-').join('').substr(0, len);
    },

    getFilenameWithHash: function(file, hash) {
        file = String(file);
        if (!hash) {
            return file;
        }
        let extname = path.extname(file);
        if (extname === '.map') {
            const ctx = file.substr(0, file.length - extname.length);
            extname = path.extname(ctx) + extname;
        }
        const left = file.substr(0, file.length - extname.length);
        return `${left}.${hash}${extname}`;
    },

    getMapFile: function(filePath) {
        const mapFile = `${filePath}.map`;
        const isExists = fs.existsSync(mapFile);
        if (isExists) {
            return mapFile;
        }
        return '';
    },

    getFileName: function(title, maxLen = 60) {
        title = String(title);
        title = title.toLowerCase();
        title = title.replace(/[\\/":|*?<>]/g, '');
        // remove chinese
        title = title.replace(/[\u4e00-\u9fa5]/g, '');
        title = title.trim();
        title = title.replace(/[^0-9a-zA-Z-]/g, '-');
        title = title.replace(/\s+/g, '-');
        if (title.length > maxLen) {
            title = title.substr(0, maxLen);
        }
        return title;
    },

    // \ to /
    formatPath: function(str) {
        if (str) {
            str = str.replace(/\\/g, '/');
        }
        return str;
    },

    relativePath: function(p, root) {
        p = `${p}`;
        root = `${root || Util.root}`;
        let rp = path.relative(root, p);
        rp = Util.formatPath(rp);
        return rp;
    },

    require: function(filePath) {
        // console.log("require conf path: " + filePath);
        const isExists = fs.existsSync(filePath);
        if (isExists) {
            // console.log("fileModule", fileModule);
            return require(filePath);
        }
    },

    getGitCommit: function(silent) {
        if (!Util.isGitProject()) {
            return '';
        }

        const sh = shelljs.exec('git log -1 --pretty=format:%h', {
            silent: silent
        });
        if (sh.code) {
            Util.logRed(sh.stderr);
            return '';
        }
        let commit = `${sh.stdout}`;
        commit = commit.replace(/\n/g, '');
        return commit;
    },

    parseBranchName: function(stdout) {
        let branchName = `${stdout}`;
        branchName = branchName.trim();
        branchName = branchName.split(/\n/).pop();
        // if met HEAD: origin/HEAD -> origin/develop
        branchName = branchName.split('->').pop();
        branchName = branchName.split('origin/').pop();
        branchName = branchName.trim();
        return branchName;
    },

    getGitBranch: async () => {
        if (!Util.isGitProject()) {
            return '';
        }

        if (Util.projectBranch) {
            return Util.projectBranch;
        }

        const tasks = [];

        tasks.push('git rev-parse --abbrev-ref HEAD');

        // for local branch
        tasks.push((option) => {
            const branchName = Util.parseBranchName(option.stdout);
            if (branchName === 'HEAD') {
                return 'git branch -r --points-at HEAD';
            }
            option.branchName = branchName;
            option.cmd = '';
            return 0;
        });

        // for points at branch
        tasks.push((option) => {
            if (option.cmd) {
                const branchName = Util.parseBranchName(option.stdout);
                if (!branchName) {
                    return 'git branch -r --contains HEAD --sort=committerdate';
                }
                option.branchName = branchName;
                option.cmd = '';
            }
            return 0;
        });

        // for contains branch
        tasks.push((option) => {
            if (option.cmd) {
                const branchName = Util.parseBranchName(option.stdout);
                option.branchName = branchName;
            }
            return 0;
        });

        const option = {
            branchName: '',
            silent: true
        };
        await Util.tasksResolver(tasks, option);

        const branch = option.branchName || 'master';
        Util.projectBranch = branch;
        return branch;
    },

    isGitProject: function() {
        const pathHooksTo = `${Util.root}/.git`;
        if (fs.existsSync(pathHooksTo)) {
            return true;
        }
        return false;
    },

    // ============================================================================

    updateVersion: (version) => {
        // update project version
        const pc = Util.getProjectConf(true);
        pc.version = version;
        Util.saveProjectConf(pc);
    },

    // ============================================================================

    isDebugging: () => {
        const debugArgRegex = /--inspect(?:-brk|-port)?|--debug-port/;
        const execArgv = process.execArgv.slice();
        if (execArgv.some((arg) => arg.match(debugArgRegex))) {
            return true;
        }
        if (Util.option.debug) {
            return true;
        }
        return false;
    },


    // ============================================================================
    goTo: (p) => {
        Util.logCyan(`go to: ${p}`);
        const sh = shelljs.cd(p);
        if (sh.code) {
            Util.logRed(sh.stderr);
        }
        return sh.code;
    },

    open: async (p, msg) => {
        console.log(msg || 'try to open report ... ');
        await open(p);
        // wait for app opened then close process
        await Util.delay(2000);
    },

    exec: (cmd, option) => {
        const silent = Boolean(option.silent);
        if (!silent) {
            Util.logCyan(`exec: ${cmd}`);
        }
        const sh = shelljs.exec(cmd, {
            silent: silent
        });
        option.stderr = sh.stderr;
        option.stdout = sh.stdout;
        if (sh.code) {
            Util.logRed(sh.stderr);
        }
        return sh.code;
    },

    tasksResolver: async function(list, option = {}) {

        const itemHandler = async (item) => {
            // change string to exec(cmd)
            if (typeof (item) === 'string') {
                option.cmd = item;
                item = (o) => {
                    return Util.exec(o.cmd, o);
                };
            }

            const exitCode = await item.call(this, option);

            if (typeof (exitCode) === 'function' || (typeof (exitCode) === 'string' && exitCode.length > 1)) {
                return itemHandler(exitCode);
            }

            return exitCode;
        };

        for (const item of list) {
            const exitCode = await itemHandler(item);
            // return if has error and not ignore error
            if (exitCode !== 0 && !option.ignoreError) {
                return exitCode;
            }
        }

        return 0;
    },

    // ============================================================================

    readdir(p) {
        return new Promise((resolve) => {
            fs.readdir(p, (err, list) => {
                if (err) {
                    resolve([]);
                    return;
                }
                resolve(list);
            });
        });
    },

    stat(p) {
        return new Promise((resolve) => {
            fs.lstat(p, (err, stats) => {
                if (err) {
                    resolve(null);
                    return;
                }
                resolve(stats);
            });
        });
    },

    rm(f, option = {}) {
        return new Promise((resolve) => {
            rimraf(f, option, function(err) {
                if (err) {
                    console.log(err);
                    resolve(false);
                    return;
                }
                resolve(true);
            });
        });
    },

    rmSync(f, option = {}) {
        let res;
        try {
            res = rimraf.sync(f, option);
        } catch (e) {
            console.log(e);
        }
        return res;
    },

    forEachTree: function(tree, callback) {
        if (!tree) {
            return;
        }
        Object.keys(tree).forEach(function(item) {
            Util.forEachTree(tree[item], callback);
            callback(item);
        });
    },

    forEachFile: function(p, extList, callback) {
        const list = fs.readdirSync(p);
        list.forEach(function(fileName) {
            const info = fs.statSync(`${p}/${fileName}`);
            if (info.isDirectory()) {
                Util.forEachFile(`${p}/${fileName}`, extList, callback);
            } else {
                const extname = path.extname(fileName);
                if (!extList.length || Util.inList(extname, extList)) {
                    callback(fileName, p);
                }
            }
        });
    },

    forEachModule: function(p, callback, nested) {
        const nm = path.resolve(p, 'node_modules');
        if (!fs.existsSync(nm)) {
            return;
        }
        const list = fs.readdirSync(nm);
        list.forEach(function(moduleName) {
            const modulePath = path.resolve(nm, moduleName);
            const info = fs.statSync(modulePath);
            if (!info.isDirectory()) {
                return;
            }
            // scoped module
            if (moduleName.indexOf('@') === 0) {
                const scopedList = fs.readdirSync(modulePath);
                scopedList.forEach(function(scopedModuleName) {
                    const scopedModulePath = path.resolve(modulePath, scopedModuleName);
                    const stat = fs.statSync(scopedModulePath);
                    if (!stat.isDirectory()) {
                        return;
                    }
                    scopedModuleName = `${moduleName}/${scopedModuleName}`;
                    callback(scopedModuleName, scopedModulePath, nested);
                    Util.forEachModule(scopedModulePath, callback, true);
                });
                return;
            }
            // normal module
            callback(moduleName, modulePath, nested);
            Util.forEachModule(modulePath, callback, true);
        });
    },

    // ============================================================================

    editFile: function(p, callback) {
        const content = Util.readFileContentSync(p);
        const editedContent = callback.call(this, content);
        // compare string
        if (editedContent === content) {
            return content;
        }
        Util.writeFileContentSync(p, editedContent, true);
        return editedContent;
    },

    editJSON: function(p, callback) {
        const json = Util.readJSONSync(p);
        const editedJson = callback.call(this, json);
        // can not compare json object
        Util.writeJSONSync(p, editedJson, true);
        return editedJson;
    },

    // ============================================================================

    readFileContentSync: function(filePath) {
        let content = null;
        const isExists = fs.existsSync(filePath);
        if (isExists) {
            content = fs.readFileSync(filePath);
            if (Buffer.isBuffer(content)) {
                content = content.toString('utf8');
            }
        }
        return content;
    },

    writeFileContentSync: function(filePath, content, force) {
        const isExists = fs.existsSync(filePath);
        if (force || isExists) {
            fs.writeFileSync(filePath, content);
            return true;
        }
        return false;
    },

    // ============================================================================

    readJSONSync: function(filePath) {
        // do NOT use require, it has cache
        const content = Util.readFileContentSync(filePath);
        let json = null;
        if (content) {
            json = JSON.parse(content);
        }
        return json;
    },

    writeJSONSync: function(filePath, json, force) {
        let content = Util.jsonString(json, 4);
        if (!content) {
            Util.logRed('Invalid JSON object');
            return false;
        }
        // end of line
        const EOL = Util.getEOL();
        content = content.replace(/\r|\n/g, EOL);
        content += EOL;
        return Util.writeFileContentSync(filePath, content, force);
    },

    jsonParse: function(str) {

        if (typeof (str) !== 'string') {
            return str;
        }

        if (!str) {
            return null;
        }

        let json = null;

        // remove BOM \ufeff
        str = str.replace(/^\uFEFF/, '');

        // remove comments
        const reg = /("([^\\"]*(\\.)?)*")|('([^\\']*(\\.)?)*')|(\/{2,}.*?(\r|\n))|(\/\*(\n|.)*?\*\/)/g;
        str = str.replace(reg, function(word) {
            return (/^\/{2,}/).test(word) || (/^\/\*/).test(word) ? '' : word;
        });

        str = str.replace(/\r/g, '');
        str = str.replace(/\n/g, '');

        try {
            json = JSON.parse(str);
        } catch (e) {
            console.log(e);
        }

        return json;
    },

    jsonString: function(obj, spaces) {

        if (typeof (obj) === 'string') {
            return obj;
        }

        if (!spaces) {
            spaces = 2;
        }

        let str = '';
        try {
            str = JSON.stringify(obj, null, spaces);
        } catch (e) {
            console.log(e);
        }

        return str;
    },

    // ============================================================================

    getAscKeyObject: function(obj) {
        const ascObj = {};
        if (obj) {
            Object.keys(obj).sort().forEach(function(k) {
                ascObj[k] = obj[k];
            });
        }
        return ascObj;
    },

    getEOL: function(content) {
        if (!content) {
            return os.EOL;
        }
        const nIndex = content.lastIndexOf('\n');
        if (nIndex === -1) {
            return os.EOL;
        }
        if (content.substr(nIndex - 1, 1) === '\r') {
            return '\r\n';
        }
        return '\n';
    },

    getCost: function(time_start, red_duration) {
        const duration = Date.now() - time_start;
        const cost = ` (cost ${Util.DTF(duration)})`;
        if (red_duration && duration >= red_duration) {
            return EC.red(cost);
        }
        return cost;
    },

    shortGuid: function(guid, last) {
        guid = String(guid);
        if (guid) {
            const list = guid.split('-');
            if (last) {
                guid = list.pop();
            } else {
                guid = list.shift();
            }
        }
        return guid;
    },

    generateGUID: function() {
        return [8, 4, 4, 4, 12].map(function(idx) {
            const double = idx * 2;
            return Math.ceil(Math.random() * parseFloat(`1e${double > 18 ? 18 : double}`))
                .toString(16)
                .substring(0, idx);
        }).join('-');
    },

    generatePort: (startPort) => {
        return new Promise((resolve) => {
            const server = net.createServer().listen(startPort);
            server.on('listening', function() {
                server.close();
                resolve(startPort);
            });
            server.on('error', function(err) {
                if (err.code === 'EADDRINUSE') {
                    Util.generatePort(startPort + 1).then((port) => {
                        resolve(port);
                    });
                } else {
                    resolve(startPort);
                }
            });
        });
    },

    // ===================================================================================

    getBrowserType: function(str = '') {
        const b = `${str}`.toLowerCase().trim();
        const browsers = {
            cr: 'chromium',
            chrome: 'chromium',
            chromium: 'chromium',
            ff: 'firefox',
            firefox: 'firefox',
            wk: 'webkit',
            webkit: 'webkit'
        };
        return browsers[b] || browsers.chromium;
    },

    getUserDataDir: function() {
        return `${Util.getTempPath()}/user-data-dir`;
    },

    getBrowserUserDataDir: function() {
        return `${Util.getUserDataDir()}/chromium-${Util.token(8)}`;
    },

    cleanBrowserUserDataDir: function() {
        const udd = Util.getUserDataDir();
        if (!fs.existsSync(udd)) {
            return;
        }
        const dirs = fs.readdirSync(udd);
        if (!dirs.length) {
            return;
        }
        Util.logMsg('cleaning up ...');
        dirs.forEach(function(folderName) {
            const dir = `${udd}/${folderName}`;
            const info = fs.statSync(dir);
            if (info.isDirectory()) {
                // mark as finished
                const finished = `${dir}/finished`;
                if (fs.existsSync(finished)) {
                    Util.rmSync(dir);
                    return;
                }
                // out time 2h
                const duration = Date.now() - new Date(info.mtime).getTime();
                // console.log(duration);
                if (duration > 2 * 60 * 60 * 1000) {
                    Util.rmSync(dir);

                }
            }
        });

    },

    finishBrowserUserDataDir: function(dir) {
        if (!dir) {
            return;
        }
        if (!fs.existsSync(dir)) {
            return;
        }
        Util.writeFileContentSync(`${dir}/finished`, '', true);
    },

    // https://github.com/GoogleChrome/puppeteer/blob/master/lib/Launcher.js#L38
    getBrowserLaunchArgs: function(list = []) {
        return [
            '--no-sandbox',
            '--no-default-browser-check',
            '--disable-setuid-sandbox',
            '--disable-translate',
            '--disable-gpu',
            '--disable-infobars',
            '--disable-notifications',
            '--disable-save-password-bubble',
            '--start-maximized'
        ].concat(list);
    },

    // https://github.com/GoogleChrome/puppeteer/blob/master/lib/Launcher.js#L246
    getBrowserLaunchIgnoreArgs: function(list = []) {
        return [
            '--hide-scrollbars',
            '--enable-automation'
        ].concat(list);
    },

    getDefaultViewport: function(defaultViewport = {}) {
        return {
            width: 1260,
            height: 900,
            ... defaultViewport
        };
    },

    getGridContent: function() {
        const gridFile = 'turbogrid/dist/turbogrid.js';
        const gridPath = `${Util.nmRoot}/node_modules/${gridFile}`;
        return Util.readFileContentSync(gridPath);
    },

    // ===================================================================================

    removeColor: function(char) {
        return (`${char}`).replace(/\033\[(\d+)m/g, '');
    },

    addColor: function(text, color, html) {
        if (html) {
            return `<span style="color:${color};">${text}</span>`;
        }
        const colorNameMap = {
            orange: 'yellow'
        };
        color = colorNameMap[color] || color;
        const fn = EC[color];
        if (typeof (fn) === 'function') {
            return fn(text);
        }
        return text;
    },

    min: function(current, value) {
        if (typeof (current) !== 'number' || isNaN(current)) {
            return value;
        }
        if (typeof (value) !== 'number' || isNaN(value)) {
            return current;
        }
        return Math.min(current, value);
    },

    max: function(current, value) {
        if (typeof (current) !== 'number' || isNaN(current)) {
            return value;
        }
        if (typeof (value) !== 'number' || isNaN(value)) {
            return current;
        }
        return Math.max(current, value);
    },

    getCoveragePercent: (v, t) => {
        let per = 0;
        if (t) {
            per = v / t;
        }
        const str = Util.PF(v, t);
        if (per >= 0.8) {
            return EC.green(str);
        }
        if (per >= 0.5) {
            return EC.yellow(str);
        }
        if (per >= 0) {
            return EC.red(str);
        }
        return str;
    },


    // ============================================================================

    logMsg: function() {
        const logs = [];
        const greenList = [{
            type: 'workerId',
            length: 'workerLength',
            name: 'worker'
        }, {
            type: 'jobId',
            length: 'jobLength',
            name: 'job'
        }];
        greenList.forEach((item) => {
            let v = Util[item.type];
            if (v) {
                v = `${v}`;
                const l = (`${Util[item.length]}`).length;
                const str = v.padStart(l, ' ');
                logs.push(EC.bg.green(`[${item.name}${str}]`));
            }
        });
        for (let i = 0, l = arguments.length; i < l; i++) {
            const v = arguments[i];
            if (i === l - 1) {
                logs.push(v);
            } else {
                logs.push(EC.magenta(v));
            }

        }
        const msg = logs.join(' ');
        console.log(msg);
        return msg;
    },


    logWorker: function() {
        const list = [];
        if (Util.jobName) {
            list.push(Util.jobName);
        }
        if (Util.componentName) {
            list.push(Util.componentName);
        }
        if (arguments.length) {
            list.push(arguments[0]);
        }
        return Util.logMsg.apply(Util, list);
    },

    logLine: function(before = '', after = '') {
        let msg = '';
        if (before) {
            msg += `${before}\n`;
        }
        msg += '================================================================================';
        if (after) {
            msg += `\n${after}`;
        }
        console.log(msg);
        return msg;
    },


    logStart: function(msg) {
        return Util.logLine('', `${msg}\n`);
    },

    logEnd: function(msg) {
        return Util.logLine(`\n${msg}`, '\n');
    },

    logColor: function(color, msg) {
        const fn = EC[color];
        if (typeof (fn) === 'function') {
            msg = fn(msg);
        }
        console.log(msg);
        return msg;
    },

    logRed: function(msg) {
        return Util.logColor('red', msg);
    },

    logYellow: function(msg) {
        return Util.logColor('yellow', msg);
    },

    logGreen: function(msg) {
        return Util.logColor('green', msg);
    },

    logCyan: function(msg) {
        return Util.logColor('cyan', msg);
    },

    logList: function(list, force) {
        if (list.length < 2 && !force) {
            console.log(list);
            return list;
        }
        const rows = [];
        list.forEach((item, i) => {
            rows.push({
                index: i + 1,
                name: item
            });
        });
        return CG({
            columns: [{
                id: 'index',
                name: 'No.',
                type: 'number',
                maxWidth: 5
            }, {
                id: 'name',
                name: 'Name'
            }],
            rows: rows
        });
    },

    logObject: function(obj, align) {
        const rows = [];
        const forEachAll = (o, list) => {
            for (const name in o) {
                const value = o[name];
                const item = {
                    name: name,
                    value: value
                };
                if (value && typeof (value) === 'object') {
                    item.value = '';
                    item.subs = [];
                    forEachAll(value, item.subs);
                }
                list.push(item);
            }
        };
        forEachAll(obj, rows);

        return CG({
            options: {
                headerVisible: false
            },
            columns: [{
                id: 'name',
                maxWidth: 300,
                align: align ? align : ''
            }, {
                id: 'value',
                maxWidth: 300
            }],
            rows: rows
        });
    },

    logOS: function(version) {

        const rows = [];

        rows.push({
            name: 'monocart',
            value: `v${version}`
        });

        rows.push({
            name: 'Node.js',
            value: process.version
        });

        rows.push({
            name: 'Hostname',
            value: os.hostname()
        });

        rows.push({
            name: 'Platform',
            value: os.platform()
        });

        rows.push({
            name: 'CPUs',
            value: os.cpus().length
        });

        // https://juejin.im/post/5c71324b6fb9a049d37fbb7c
        const totalmem = os.totalmem();
        const totalmemStr = Util.BF(totalmem);
        const freemem = os.freemem();
        const freememStr = Util.BF(freemem);
        const sysUsageStr = Util.PF(totalmem - freemem, totalmem);
        rows.push({
            name: 'Memory',
            value: `free: ${freememStr} / total: ${totalmemStr} = ${sysUsageStr}`
        });

        const memoryUsage = process.memoryUsage();
        const nodeUsageList = [];
        nodeUsageList.push(`rss: ${Util.BF(memoryUsage.rss)}`);
        nodeUsageList.push(`ext: ${Util.BF(memoryUsage.external)}`);
        nodeUsageList.push(`heap: ${Util.PF(memoryUsage.heapUsed, memoryUsage.heapTotal)}`);
        const nodeUsageStr = nodeUsageList.join(' ');
        rows.push({
            name: 'Process',
            value: nodeUsageStr
        });

        CG({
            options: {
                headerVisible: false
            },
            columns: [{
                id: 'name'
            }, {
                id: 'value',
                maxWidth: 100
            }],
            rows: rows
        });
    },

    // ============================================================================
    // string
    token: function(len) {
        let str = Math.random().toString().substr(2);
        if (len) {
            str = str.substr(0, Util.toNum(len));
        }
        return str;
    },

    replace: function(str, obj, defaultValue) {
        str = `${str}`;
        if (!obj) {
            return str;
        }
        str = str.replace(/\{([^}{]+)\}/g, function(match, key) {
            if (!Util.hasOwn(obj, key)) {
                if (typeof (defaultValue) !== 'undefined') {
                    return defaultValue;
                }
                return match;
            }
            let val = obj[key];
            if (typeof (val) === 'function') {
                val = val(obj, key);
            }
            if (typeof (val) === 'undefined') {
                val = '';
            }
            return val;
        });
        return str;
    },

    zero: function(s, l = 2) {
        s = `${s}`;
        return s.padStart(l, '0');
    },

    hasOwn: function(obj, key) {
        return Object.prototype.hasOwnProperty.call(obj, key);
    },

    // ============================================================================
    // number
    isNum: function(num) {
        if (typeof (num) !== 'number' || isNaN(num)) {
            return false;
        }
        const isInvalid = function(n) {
            if (n === Number.MAX_VALUE || n === Number.MIN_VALUE || n === Number.NEGATIVE_INFINITY || n === Number.POSITIVE_INFINITY) {
                return true;
            }
            return false;
        };
        if (isInvalid(num)) {
            return false;
        }
        return true;
    },

    // format to a valid number
    toNum: function(num, toInt) {
        if (typeof (num) !== 'number') {
            num = parseFloat(num);
        }
        if (isNaN(num)) {
            num = 0;
        }
        if (toInt) {
            num = Math.round(num);
        }
        return num;
    },

    clamp: function(num, min, max) {
        return Math.max(Math.min(num, max), min);
    },

    // ============================================================================
    // date
    isDate: function(date) {
        if (!date || !(date instanceof Date)) {
            return false;
        }
        // is Date Object but Date {Invalid Date}
        if (isNaN(date.getTime())) {
            return false;
        }
        return true;
    },

    toDate: function(input) {
        if (Util.isDate(input)) {
            return input;
        }
        // fix time zone issue by use "/" replace "-"
        const inputHandler = function(it) {
            if (typeof (it) !== 'string') {
                return it;
            }
            // do NOT change ISO format: 2020-03-20T19:10:38.358Z
            if (it.indexOf('T') !== -1) {
                return it;
            }
            it = it.split('-').join('/');
            return it;
        };
        input = inputHandler(input);
        let date = new Date(input);
        if (Util.isDate(date)) {
            return date;
        }
        date = new Date();
        return date;
    },

    dateFormat: function(date, format) {
        date = Util.toDate(date);
        // default format
        format = format || 'yyyy-MM-dd';
        // year
        if ((/([Y|y]+)/).test(format)) {
            const yyyy = `${date.getFullYear()}`;
            format = format.replace(RegExp.$1, yyyy.substr(4 - RegExp.$1.length));
        }
        const o = {
            'M+': date.getMonth() + 1,
            '[D|d]+': date.getDate(),
            '[H|h]+': date.getHours(),
            'm+': date.getMinutes(),
            's+': date.getSeconds(),
            '[Q|q]+': Math.floor((date.getMonth() + 3) / 3),
            'S': date.getMilliseconds()
        };
        const doubleNumberHandler = function() {
            for (const k in o) {
                if (Util.hasOwn(o, k)) {
                    const reg = new RegExp(`(${k})`).test(format);
                    if (!reg) {
                        continue;
                    }
                    const str = `${o[k]}`;
                    format = format.replace(RegExp.$1, (RegExp.$1.length === 1) ? str : (`00${str}`).substr(str.length));
                }
            }
        };
        doubleNumberHandler();
        return format;
    },

    getTimestamp: function(date = new Date(), option = {}) {
        option = {
            weekday: 'short',
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric',
            hour12: false,
            timeZoneName: 'short',
            ... option
        };
        return new Intl.DateTimeFormat('en-US', option).format(date);
    },

    // ============================================================================
    // array
    isList: function(data) {
        if (data && data instanceof Array && data.length > 0) {
            return true;
        }
        return false;
    },

    inList: function(item, list) {
        if (!Util.isList(list)) {
            return false;
        }
        for (let i = 0, l = list.length; i < l; i++) {
            if (list[i] === item) {
                return true;
            }
        }
        return false;
    },

    toList: function(data, separator) {
        if (data instanceof Array) {
            return data;
        }
        if (typeof (data) === 'string' && (typeof (separator) === 'string' || separator instanceof RegExp)) {
            return data.split(separator);
        }
        if (typeof (data) === 'undefined' || data === null) {
            return [];
        }
        return [data];
    },

    isMatch: function(item, attr) {
        if (item === attr) {
            return true;
        }
        if (item && attr && typeof (attr) === 'object') {
            for (const k in attr) {
                if (item[k] !== attr[k]) {
                    return false;
                }
            }
            return true;
        }
        return false;
    },

    getListItem: function(list, attr) {
        if (Util.isList(list)) {
            for (let i = 0, l = list.length; i < l; i++) {
                const item = list[i];
                if (Util.isMatch(item, attr)) {
                    return item;
                }
            }
        }
        return null;
    },

    delListItem: function(list, attr) {
        if (!Util.isList(list)) {
            return list;
        }
        const matchIndexList = [];
        for (let i = 0; i < list.length; i++) {
            const item = list[i];
            if (Util.isMatch(item, attr)) {
                matchIndexList.push(i);
            }
        }
        matchIndexList.reverse();
        matchIndexList.forEach(function(index) {
            list.splice(index, 1);
        });
        return list;
    },

    doubleMerge: function(a, b) {
        if (a && b) {
            for (const k in b) {
                let v = b[k];
                if (v && typeof (v) === 'object' && !Array.isArray(v)) {
                    v = {
                        ... a[k], ... v
                    };
                }
                a[k] = v;
            }
        }
        return a;
    },

    // ============================================================================
    // object
    getValue: function(data, dotPathStr, defaultValue) {
        if (!dotPathStr) {
            return defaultValue;
        }
        let current = data;
        const list = dotPathStr.split('.');
        const lastKey = list.pop();
        while (current && list.length) {
            const item = list.shift();
            current = current[item];
        }
        if (current && Util.hasOwn(current, lastKey)) {
            const value = current[lastKey];
            if (typeof (value) !== 'undefined') {
                return value;
            }
        }
        return defaultValue;
    },

    // ============================================================================
    // async
    delay: function(ms) {
        return new Promise((resolve) => {
            if (ms) {
                setTimeout(resolve, ms);
            } else {
                setImmediate(resolve);
            }
        });
    },

    // ============================================================================
    // formatters

    // byte
    BF: function(v, digits = 1, base = 1024) {
        v = Util.toNum(v, true);
        if (v === 0) {
            return '0B';
        }
        let prefix = '';
        if (v < 0) {
            v = Math.abs(v);
            prefix = '-';
        }
        const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
        for (let i = 0, l = units.length; i < l; i++) {
            const min = Math.pow(base, i);
            const max = Math.pow(base, i + 1);
            if (v > min && v < max) {
                const unit = units[i];
                v = prefix + (v / min).toFixed(digits) + unit;
                break;
            }
        }
        return v;
    },

    // date
    DF: function(timestamp) {
        const t = Util.toDate(timestamp);
        let d = t.getFullYear().toString();
        d += `-${Util.zero(t.getMonth() + 1)}`;
        d += `-${Util.zero(t.getDate())}`;
        return d;
    },

    // percent
    PF: function(v, t = 1, digits = 1) {
        v = Util.toNum(v);
        t = Util.toNum(t);
        let per = 0;
        if (t) {
            per = v / t;
        }
        return `${(per * 100).toFixed(digits)}%`;
    },

    // time
    TF: function(v, unit, digits = 1) {
        v = Util.toNum(v, true);
        if (unit) {
            if (unit === 's') {
                v = (v / 1000).toFixed(digits);
            } else if (unit === 'm') {
                v = (v / 1000 / 60).toFixed(digits);
            } else if (unit === 'h') {
                v = (v / 1000 / 60 / 60).toFixed(digits);
            }
            return Util.NF(v) + unit;
        }
        const s = v / 1000;
        const hours = Math.floor(s / 60 / 60);
        const minutes = Math.floor((s - (hours * 60 * 60)) / 60);
        const seconds = Math.round(s - (hours * 60 * 60) - (minutes * 60));
        return `${hours}:${Util.zero(minutes)}:${Util.zero(seconds)}`;
    },

    // duration time
    DTF: function(v, maxV) {
        maxV = maxV || v;
        if (maxV > 60 * 1000) {
            return Util.TF(v);
        }
        return Util.TF(v, 'ms');
    },

    // number
    NF: function(v) {
        v = Util.toNum(v);
        return v.toLocaleString();
    }

};

module.exports = Util;
