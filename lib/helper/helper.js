const fs = require('fs');
const path = require('path');
const ScreencastGif = require('screencast-gif');
const playwright = require('playwright');
const EventEmitter = require('events');
const pageEvent = new EventEmitter();

const Util = require('../core/util.js');
const EC = require('eight-colors');

const CodeCoverage = require('./code-coverage.js');
const RequestCapturer = require('./request-capturer.js');

let fileIndex = {};

const Helper = {

    getOutput: function() {
        if (Util.config) {
            return Util.config.output;
        }
        return Util.getTempPath();
    },

    //============================================================================================
    //job API

    onJobStart: function(job) {
        //init job report
        job.report = {
            cases: {},
            orderIssues: []
        };
        global.job = job;
        fileIndex = {};
    },

    onJobFinish: async (job) => {
        global.currentTest = null;
        global.job = null;
        fileIndex = {};

        //GC page and browser
        const page = global.page;
        global.page = null;

        if (!page) {
            return;
        }

        Util.logMsg('[page]', 'closing ...');
        await page.close();
        const target = page.target();
        if (target) {
            const browser = target.browser();
            if (browser) {
                Util.logMsg('[browser]', 'closing ...');
                await browser.close();
                Util.finishBrowserUserDataDir(browser.userDataDir);
            }
        }

    },

    //============================================================================================

    //requestList, summary, tests, codeCoverage
    setJobReport: function(key, value) {
        const job = global.job;
        if (!job) {
            return;
        }
        if (key) {
            job.report[key] = value;
        }
    },

    //cases
    getJobReport: function(key) {
        const job = global.job;
        if (!job) {
            return;
        }
        if (key) {
            return job.report[key];
        }
        return job.report;
    },

    //============================================================================================
    //current test

    setCurrentTest: function(test) {
        global.currentTest = test;
    },

    getCurrentTest: function() {
        return global.currentTest;
    },

    //============================================================================================
    //test report

    setTestReport: function(key, value) {
        const currentTest = Helper.getCurrentTest();
        if (!currentTest) {
            return;
        }
        if (!currentTest.report) {
            currentTest.report = {};
        }
        if (key) {
            currentTest.report[key] = value;
        }
    },

    //============================================================================================
    //test logList
    addTestLog: function(item) {
        const currentTest = Helper.getCurrentTest();
        if (!currentTest) {
            return;
        }
        if (!currentTest.logList) {
            currentTest.logList = [];
        }
        currentTest.logList.push(item);
    },

    //save log
    saveTestLog: (filename) => {
        const currentTest = Helper.getCurrentTest();
        if (!currentTest) {
            return;
        }
        const logList = currentTest.logList;
        if (!Util.isList(logList)) {
            return;
        }

        if (!filename) {
            filename = Helper.getJobFileName(Util.token());
        }

        let str = logList.join('\r\n\r\n');
        str = Util.removeColor(str);

        filename += '.log';
        const filePath = `${Helper.getOutput()}/${filename}`;
        fs.writeFileSync(filePath, str);
        console.log(`saved log ${filePath}`);

        return filename;
    },

    //============================================================================================
    //test common API
    getJobFileName: function(title) {

        title = Util.getFileName(title);

        const jobId = Util.jobId;
        if (!fileIndex[jobId]) {
            fileIndex[jobId] = 1;
        }

        let filename = ['job', jobId, fileIndex[jobId], title].join('-');
        filename = filename.replace(/-+/g, '-');

        fileIndex[jobId] += 1;

        return filename;
    },

    //============================================================================================
    //test hook
    defaultBeforeEach: async () => {
        await Helper.addBrowserScript();
    },

    defaultAfterEach: async () => {
        const currentTest = Helper.getCurrentTest();
        if (!currentTest) {
            return;
        }
        //pending
        if (currentTest.isPending()) {
            return;
        }

        //screencast
        Helper.stopScreencast();

        //request capturer
        Helper.stopRequestCapturer();

        //failed
        if (currentTest.isFailed()) {
            Helper.requiredTestHandler(currentTest);
            await Helper.screenshotHandler(currentTest);
        }
        //passed

        currentTest.frames = null;
        currentTest.capturerList = null;
        currentTest.logList = null;

    },

    //============================================================================================

    addBrowserScript: async () => {
        const page = global.page;
        if (!page) {
            return;
        }

        const browser = Util.config.browser;
        if (!browser || !browser.buildFile) {
            return;
        }
        const hasComponent = await page.evaluate(function(componentName) {
            if (window[componentName]) {
                return true;
            }
            return false;
        }, browser.componentName);
        if (hasComponent) {
            return;
        }
        await page.addScriptTag({
            path: browser.buildFile
        });
    },

    //============================================================================================
    //screenshot API

    screenshotHandler: async (currentTest) => {
        const time_start = Date.now();
        const title = currentTest.title;
        Util.logMsg('[screenshot]', 'start ...');
        let screenshot;
        if (Util.isList(currentTest.frames)) {
            //add last frame
            await Helper.saveScreencastFrame({
                message: title,
                delay: 5000
            });
            screenshot = await Helper.saveScreencast(title);
        } else {
            screenshot = await Helper.saveScreenshot(title);
        }
        if (screenshot) {
            Helper.setTestReport('screenshot', screenshot);
        }
        Util.logMsg('[screenshot]', `finished${Util.getCost(time_start, 5000)}`);
    },

    //============================================================================================

    getScreenshotMessage: (title) => {
        const job = global.job;
        return `job-${job.jobId}, ${job.title || job.name}: ${title}`;
    },

    generateScreenshot: async (filePath, message) => {
        const page = global.page;
        if (!page) {
            return;
        }
        let ok = false;
        if (message) {
            message = Helper.getScreenshotMessage(message);
            ok = await page.evaluate(function(msg) {
                if (!document || !document.body) {
                    return false;
                }
                let elem = document.querySelector('.monocart-screenshot-helper');
                if (!elem) {
                    elem = document.createElement('div');
                    elem.className = 'monocart-screenshot-helper';
                    elem.style.cssText = `pointer-events: none;
                    position: absolute;
                    opacity: 0.68;
                    z-index: 999998;
                    left: 20px;
                    bottom: 20px;
                    right: 20px;
                    text-align: center;
                    font-size: 20px;
                    font-weight: bold;
                    color: #ff0000;
                    text-shadow: -1px 0 #fff, 0 1px #fff, 1px 0 #fff, 0 -1px #fff;`;
                    document.body.appendChild(elem);
                }
                elem.innerHTML = msg;
                elem.style.display = 'block';
                return true;
            }, message);
        }

        const option = {};
        if (filePath) {
            option.path = filePath;
        }
        const buffer = await page.screenshot(option);

        if (ok) {
            await page.evaluate(function() {
                const elem = document.querySelector('.monocart-screenshot-helper');
                if (elem) {
                    elem.style.display = 'none';
                    return true;
                }
                return false;
            });
        }
        return buffer;
    },

    addScreencastFrame: (frame) => {
        const currentTest = Helper.getCurrentTest();
        if (!currentTest) {
            return;
        }
        if (!currentTest.frames) {
            currentTest.frames = [];
        }

        const frames = currentTest.frames;
        frames.push(frame);

        //max frame fixing
        const maxFrame = currentTest.maxFrame;
        if (maxFrame && frames.length > maxFrame) {
            currentTest.frames = frames.slice(frames.length - maxFrame);
        }

        //Util.logYellow(currentTest.frames.length);
    },

    //============================================================================================
    //screenshot API

    saveScreencast: async (title) => {
        const currentTest = Helper.getCurrentTest();
        if (!currentTest) {
            return;
        }
        const frames = currentTest.frames;

        let filename = Helper.getJobFileName(title);
        const ext = path.extname(filename);
        if (ext !== '.gif') {
            filename += '.gif';
        }
        const time_start = Date.now();
        const filePath = `${Helper.getOutput()}/${filename}`;

        const buf = await ScreencastGif({
            frame: {
                //default delay for each frame
                delay: 500
            },
            frames: frames
        });
        fs.writeFileSync(filePath, buf);
        console.log(`saved screencast gif (${frames.length} frames): ${filePath}${Util.getCost(time_start, 3000)}`);
        return filename;
    },

    //just save a screenshot
    saveScreenshot: async (title) => {
        if (!global.page) {
            return;
        }
        if (!title) {
            const currentTest = Helper.getCurrentTest();
            if (currentTest) {
                title = currentTest.title;
            } else {
                title = `screenshot-${Util.token(5)}`;
            }
        }
        let filename = Helper.getJobFileName(title);
        const ext = path.extname(filename);
        if (ext !== '.png') {
            filename += '.png';
        }
        const time_start = Date.now();
        const filePath = `${Helper.getOutput()}/${filename}`;
        await Helper.generateScreenshot(filePath, title);
        console.log(`saved screenshot: ${filePath}${Util.getCost(time_start, 1000)}`);
        return filename;
    },

    //save a screencast frame
    saveScreencastFrame: async (frame = {}) => {
        if (!global.page) {
            return;
        }
        const buffer = await Helper.generateScreenshot(null, frame.message);
        frame.buffer = buffer;
        Helper.addScreencastFrame(frame);
    },

    pageScreencastFrameHandler: (e) => {
        //data: string - Base64-encoded compressed image.
        //metadata: ScreencastFrameMetadata - Screencast frame metadata.
        //sessionId: integer - Frame number.
        const frame = {
            buffer: Buffer.from(e.data, 'base64')
        };
        Helper.addScreencastFrame(frame);
    },

    startScreencast: async (option) => {
        const page = global.page;
        if (!page) {
            return;
        }
        //stop previous
        Helper.stopScreencast();

        const currentTest = Helper.getCurrentTest();
        if (!currentTest) {
            return;
        }

        //option
        option = {
            maxFrame: 15, ... option
        };
        currentTest.maxFrame = Math.min(30, option.maxFrame);

        const client = page._client;
        await client.send('Page.startScreencast', {
            format: 'png'
        });
        Helper.screencastStarted = true;
    },

    stopScreencast: async () => {
        if (!Helper.screencastStarted) {
            return;
        }
        const page = global.page;
        if (!page) {
            return;
        }
        const client = page._client;
        await client.send('Page.stopScreencast');
        Helper.screencastStarted = false;
    },

    //============================================================================================
    //require test API

    requiredTestHandler: (currentTest) => {
        const title = (`${currentTest.title}`).trim();
        if (title.substr(-1) !== '*') {
            return;
        }
        Helper.setNextPendingFailed(currentTest);
    },

    setNextPendingFailed: function(currentTest) {
        if (!currentTest) {
            return;
        }
        //parent suite
        const suite = currentTest.parent;
        if (!suite) {
            return;
        }
        const index = suite.tests.indexOf(currentTest) + 1;
        Helper.setPendingFailed(suite, index);
    },

    setPendingFailed: function(suite, index = 0) {
        //next tests
        const tests = suite.tests;
        while (index < tests.length) {
            const t = tests[index];
            if (!t.pending) {
                t.pending = true;
                t.failed = true;
            }
            index += 1;
        }
        //all suites
        const suites = suite.suites;
        let j = 0;
        while (j < suites.length) {
            const s = suites[j];
            if (!s.pending) {
                s.pending = true;
                s.failed = true;
                Helper.setPendingFailed(s, 0);
            }
            j += 1;
        }
    },

    //============================================================================================
    //pdf API

    generatePdf: async (pdfPath, html, pdfOption = {}, browserOption = {}) => {

        if (!html) {
            Util.logRed('ERROR: Invalid html content');
            return false;
        }

        const browserType = 'chromium';
        //pdf require headless mode
        browserOption.headless = true;
        const browser = await Helper.launchBrowser(browserType, browserOption);
        if (!browser) {
            return false;
        }

        const base64 = Buffer.from(html).toString('base64');
        //console.log(base64);

        Util.logMsg('[page]', 'generating pdf ...');

        const page = await browser.newPage();
        await page.goto(`data:text/html;base64,${base64}`);

        pdfOption = {
            path: pdfPath,
            format: 'A4',
            // headerTemplate: "<p>Header</p>",
            // footerTemplate: "<p>Footer</p>",
            // displayHeaderFooter: true,
            margin: {
                left: '10px',
                right: '10px',
                top: '20px',
                bottom: '20px'
            },
            printBackground: true,
            ... pdfOption
        };

        await page.pdf(pdfOption);
        await page.close();
        await browser.close();
        Util.finishBrowserUserDataDir(browser.userDataDir);
        return true;
    },

    //============================================================================================
    //page API
    pageEvent: pageEvent,
    createPage: async (config, browserOption = {}) => {
        config = config || Util.config;
        //ui test browser
        if (config.debug) {
            browserOption.headless = false;
            let slowMo = parseInt(config.debug);
            if (slowMo) {
                slowMo = Math.max(1, slowMo);
                slowMo = Math.min(1000, slowMo);
                browserOption.slowMo = slowMo;
            }
        }

        const browserType = Util.getBrowserType(config.browserType);

        const browser = await Helper.launchBrowser(browserType, browserOption);
        if (!browser) {
            return;
        }

        const defaultPages = await browser.pages();

        const page = await browser.newPage();
        //for report screenshot when err
        global.page = page;

        //remove default pages
        defaultPages.forEach((dp) => {
            dp.close();
        });

        await Helper.initPageEvents(page, browser, config);
        await Util.delay(500);
        Util.logMsg('[page]', 'created success');

        return page;
    },

    createPageDownloadPath: async (client, pageDownloadPath) => {
        //create dir in sub process may cause sync issue with others
        if (!fs.existsSync(pageDownloadPath)) {
            pageDownloadPath = Helper.getOutput();
        }
        //require absolute path
        pageDownloadPath = path.resolve(pageDownloadPath);
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: pageDownloadPath
        });
        Helper.pageDownloadPath = pageDownloadPath;
        Util.logMsg('[page]', `set pageDownloadPath: ${Util.relativePath(pageDownloadPath)}`);
    },

    getPageDownloadPath: function() {
        return Helper.pageDownloadPath;
    },

    getPageMainFrameId: function(page) {
        page = page || global.page;
        if (page) {
            return page.mainFrame()._id;
        }
    },

    //============================================================================================
    initPageEvents: async (page, browser, config) => {

        Util.logGreen('init page events ...');

        const client = page._client;

        //page properties
        page.setDefaultTimeout(5 * 1000);

        //page log
        page.on('close', function() {
            Util.logMsg('[page]', EC.green('closed'));
        });

        page.on('pageerror', (msg) => {
            Util.logMsg('[page]', msg);
            Helper.addTestLog(msg);
        });

        //only dom loaded
        page.on('domcontentloaded', function() {
            //console.log(EC.magenta("page domcontentloaded"));
            Helper.addBrowserScript();
        });
        //dom css image and so on loaded
        //page.on('load', function() {
        //console.log(EC.magenta("page load"));
        //});

        page.on('console', (msg) => {
            const type = msg.type().toUpperCase();
            //remove debug msg
            if (type === 'DEBUG' || type === 'INFO' || type === 'WARNING') {
                return;
            }
            Helper.pageLogHandler(msg, type);
        });

        //page network
        page.on('request', (request) => {
            RequestCapturer.eventHandler(request, 'request');
        });
        page.on('requestfinished', (request) => {
            RequestCapturer.eventHandler(request, 'requestfinished');
        });
        page.on('requestfailed', (request) => {
            RequestCapturer.eventHandler(request, 'requestfailed');
        });


        //https://chromedevtools.github.io/devtools-protocol/tot/Inspector/#event-targetReloadedAfterCrash

        //already handle by puppeteer
        //Fired when debugging target has crashed
        // client.on('Inspector.targetCrashed', () => {
        //     let msg = "debugging target has crashed";
        //     Util.logMsg("[page]", EC.red(msg));
        //     Helper.addTestLog(msg);
        // });
        //catch crash error
        page.on('error', (msg) => {
            msg += ` ${page.url()}`;
            Util.logMsg('[page]', EC.red(msg));
            Helper.addTestLog(msg);
        });

        //Fired when debugging target has reloaded after crash
        client.on('Inspector.targetReloadedAfterCrash', () => {
            const msg = 'debugging target has reloaded after crash';
            Util.logMsg('[page]', msg);
            Helper.addTestLog(msg);
        });
        //Fired when remote debugging connection is about to be terminated. Contains detach reason.
        client.on('Inspector.detached', (reason) => {
            const msg = `debugging detached: ${reason}`;
            Util.logMsg('[page]', msg);
            Helper.addTestLog(msg);
        });

        //screencast events
        client.on('Page.screencastFrame', (e) => {
            client.send('Page.screencastFrameAck', {
                sessionId: e.sessionId
            });
            Helper.pageScreencastFrameHandler(e);
        });

        //page loading event
        Helper.pageLoading = false;
        client.on('Page.frameStartedLoading', (e) => {
            if (e.frameId === Helper.getPageMainFrameId()) {
                Helper.pageLoading = true;
                page.emit('loading', Helper.pageLoading);
            }
        });

        client.on('Page.frameStoppedLoading', (e) => {
            if (e.frameId === Helper.getPageMainFrameId()) {
                Helper.pageLoading = false;
                page.emit('loading', Helper.pageLoading);
            }
        });

        //download
        await Helper.createPageDownloadPath(client, config.download);

        //browser events
        browser.on('targetdestroyed', () => {
            Util.logMsg('[browser]', 'a target is destroyed (a page is closed)');
        });
        browser.on('disconnected', () => {
            Util.logMsg('[browser]', EC.green('disconnected'));
        });

    },

    waitForPageLoaded: (timeout = 120000) => {
        if (!Helper.pageLoading) {
            return true;
        }
        return global.ready(() => {
            return !Helper.pageLoading;
        }, timeout, `${timeout}ms timeout to wait for page loading`);
    },

    pageLogHandler: function(msg, type) {
        if (type === 'ERROR') {
            type = EC.red(type);
        } else if (type === 'WARNING') {
            type = EC.yellow(type);
        }

        let detail = EC.magenta(`[PAGE ${type}] `);

        const text = msg.text();
        // if (!Util.config.debug) {
        //     text = text.split(/\n+/).shift();
        // }
        detail += text;

        const loc = msg.location();
        if (loc.url) {
            detail += ` (${loc.url}`;
            if (loc.lineNumber) {
                detail += `:${loc.lineNumber}`;
            }
            if (loc.columnNumber) {
                detail += `:${loc.columnNumber}`;
            }
            detail += ')';
        }

        console.log(detail);
        Helper.addTestLog(detail);
    },

    //============================================================================================
    //request capturer API

    //for single test level
    createRequestCapturer: (option) => {
        return RequestCapturer.create(option);
    },

    stopRequestCapturer: () => {
        return RequestCapturer.stop();
    },

    //============================================================================================
    //request report API

    //for job global level
    startRequestReport: (option) => {
        Helper.stopRequestReport();
        option.report = true;
        Helper.requestCapturer = RequestCapturer.create(option);
        return Helper.requestCapturer;
    },

    stopRequestReport: () => {
        if (Helper.requestCapturer) {
            Helper.requestCapturer.destroy();
            Helper.requestCapturer = null;
        }
    },

    addRequestMatch: (match) => {
        if (!Helper.requestCapturer) {
            return;
        }
        return Helper.requestCapturer.addMatch(match);
    },

    removeRequestMatch: (match) => {
        if (!Helper.requestCapturer) {
            return;
        }
        return Helper.requestCapturer.removeMatch(match);
    },

    generateRequestReport: (option) => {
        if (!Helper.requestCapturer) {
            return;
        }
        let requestList = Helper.requestCapturer.getRequestList();
        Helper.stopRequestReport();

        requestList = requestList.filter(function(item) {
            if (!item || item.requestType === 'request') {
                return false;
            }
            item.requestType = item.requestType.replace('request', '');
            return true;
        });

        if (!requestList.length) {
            return;
        }

        if (option && option.sortField) {
            //sort by sortField
            const sortField = option.sortField;
            requestList.sort(function(a, b) {
                return a[sortField] - b[sortField];
            });
        }

        Helper.setJobReport('requestList', requestList);

        return requestList;
    },

    //============================================================================================
    //code coverage API
    startCodeCoverage: () => {
        return CodeCoverage.startCodeCoverage();
    },

    generateCodeCoverage: (list) => {
        return CodeCoverage.generateCodeCoverage(list, Helper);
    },

    //============================================================================================
    //browser API
    getDefaultViewport: function() {
        return Util.getDefaultViewport(Util.config.defaultViewport);
    },

    launchBrowser: (browserType, browserOption) => {
        return new Promise((resolve) => {
            let resolved = false;
            const timeout = 60 * 1000;
            const timeid = setTimeout(() => {
                Util.logRed(`[browser] ${timeout}ms timeout to launch browser`);
                resolved = true;
                resolve();
            }, timeout);
            Helper.initBrowser(browserType, browserOption).then((browser) => {
                if (resolved) {
                    Util.logRed('[browser] already resolved by timeout');
                    return;
                }
                clearTimeout(timeid);
                resolve(browser);
            });
        });
    },

    initBrowser: async (browserType, browserOption) => {
        const time_start = Date.now();
        Util.logMsg('[browser]', 'launch ...');
        const defaultViewport = Helper.getDefaultViewport();
        browserOption = {
            userDataDir: Util.getBrowserUserDataDir(),
            args: Util.getBrowserLaunchArgs(),
            ignoreDefaultArgs: Util.getBrowserLaunchIgnoreArgs(),
            defaultViewport: defaultViewport,
            ... browserOption
        };

        const browser = await playwright[browserType].launch(browserOption);

        const chromiumVersion = await browser.version();
        Util.logMsg('[browser]', `${EC.green('launched')} ${chromiumVersion}${Util.getCost(time_start, 3000)}`);
        browser.userDataDir = browserOption.userDataDir;
        return browser;
    }
};

module.exports = Helper;
