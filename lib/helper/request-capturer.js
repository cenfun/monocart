const Util = require('../core/util.js');
const EC = require('eight-colors');

const capturerCache = {};

class RequestCapturer {

    constructor(option) {
        this.id = `capturer_${Util.token(8)}`;
        this.option = Object.assign(this.defaultOption(), option);
        this.requestCache = {};
        this.requestList = [];
        this.testBindHandler();
    }

    testBindHandler() {
        if (this.option.report) {
            return;
        }
        // to remove capturer automatically when case ends if not report level
        RequestCapturer.addCapturerToTest(this);
    }

    defaultOption() {
        return {
            match: 'http',
            report: false,
            onRequest: () => {},
            onResponse: () => {}
        };
    }

    eventHandler(eventData, requestType) {
        if (this.stopped) {
            this.destroy();
            return;
        }
        const handlers = {
            request: this.pageRequestHandler,
            requestfinished: this.pageRequestFinishedHandler,
            requestfailed: this.pageRequestFailedHandler
        };
        const handler = handlers[requestType];
        if (handler) {
            handler.call(this, eventData, requestType);
        }
    }

    // ====================================================================================================

    // 'request' emitted when the request is issued by the page.
    pageRequestHandler(request, requestType) {
        if (!this.isMatchedRequest(request, this.option.match)) {
            return;
        }
        this.setMatchedRequest(request);
        this.currentRequest = request;

        // request info
        const info = RequestCapturer.generateRequestInfo(request, requestType, this.id);
        this.currentRequestInfo = info;
        this.requestList.push(info);
        if (this.option.report) {
            return;
        }

        // using to disable common events
        request.captured = true;

        RequestCapturer.showRequestInfo(info);
        this.option.onRequest.call(this, request);
    }

    // 'requestfinished' emitted when the response body is downloaded and the request is complete.
    // 'requestfinished' HTTP Error responses, such as 404 or 503, are still successful responses from HTTP standpoint
    // 'requestfinished' If request gets a 'redirect' response, the request is successfully finished, and a new request is issued to a redirected url.
    pageRequestFinishedHandler(request, requestType) {
        if (!this.getMatchedRequest(request)) {
            return;
        }
        this.currentRequest = request;

        const info = RequestCapturer.generateRequestFinishedInfo(request, requestType, this.id);
        if (info.isFailed) {
            RequestCapturer.generateFailedRequestData(request, info);
            RequestCapturer.addFailedRequestIdToTest(info.requestId);
        }
        this.currentRequestInfo = info;
        this.requestList.push(info);
        if (this.option.report) {
            return;
        }

        RequestCapturer.showRequestFinishedInfo(info);
        const response = request.response();
        this.option.onResponse.call(this, response, request);
    }

    // 'requestfailed' Emitted when a request fails, for example abort or timeout.
    pageRequestFailedHandler(request, requestType) {
        if (!this.getMatchedRequest(request)) {
            return;
        }
        request.end_time = Date.now();
        this.currentRequest = request;

        const info = RequestCapturer.generateRequestFailedInfo(request, requestType, this.id);
        if (info.isFailed) {
            RequestCapturer.generateFailedRequestData(request, info);
            RequestCapturer.addFailedRequestIdToTest(info.requestId);
        }
        this.currentRequestInfo = info;
        this.requestList.push(info);
        if (this.option.report) {
            return;
        }

        RequestCapturer.showRequestFailedInfo(info);
        const response = request.response();
        this.option.onResponse.call(this, response, request);
    }

    // ====================================================================================================

    getRequestList() {
        return this.requestList;
    }

    getRequestCount() {
        return Object.keys(this.requestCache).length;
    }

    // ====================================================================================================
    getRequestId(request) {
        return RequestCapturer.getRequestId(request);
    }

    isOk(request) {
        return RequestCapturer.isOk(request);
    }

    isRedirect(request) {
        return RequestCapturer.isRedirect(request);
    }

    isFailed(request) {
        return RequestCapturer.isFailed(request);
    }

    isAbort(request) {
        return RequestCapturer.isAbort(request);
    }

    isTimeout(request) {
        return RequestCapturer.isTimeout(request);
    }

    // ====================================================================================================

    setMatchedRequest(request) {
        const requestId = this.getRequestId(request);
        if (!requestId) {
            Util.logRed('Not found requestId: setMatchedRequest');
            return;
        }
        this.requestCache[requestId] = request;
    }

    getMatchedRequest(request) {
        const requestId = this.getRequestId(request);
        if (requestId) {
            return this.requestCache[requestId];
        }
    }

    getMatchedRequestById(requestId) {
        return this.requestCache[requestId];
    }

    // ====================================================================================================

    getCurrentRequest() {
        return this.currentRequest;
    }

    getCurrentRequestInfo() {
        return this.currentRequestInfo;
    }

    // ====================================================================================================

    isMatchedRequest(request, match) {
        if (!match) {
            return true;
        }
        const url = request.url();
        if (typeof (match) === 'string') {
            if (url.indexOf(match) !== -1) {
                return true;
            }
            return false;
        }
        if (match instanceof RegExp) {
            if (url.match(match)) {
                return true;
            }
            return false;
        }
        if (typeof (match) === 'function') {
            return match.call(this, request);
        }
        if (typeof (match) === 'object') {
            return this.isMatchedRequestObject(request, match);
        }
        return false;
    }

    isMatchedRequestObject(request, match) {

        if (Array.isArray(match)) {
            for (const item of match) {
                const matched = this.isMatchedRequest(request, item);
                if (matched) {
                    return true;
                }
            }
            return false;
        }

        const method = request.method();
        const resourceType = request.resourceType();
        if (match.resourceType) {
            const resourceTypeList = Util.toList(match.resourceType, ',');
            if (!Util.inList(resourceType, resourceTypeList)) {
                return false;
            }
        }
        if (match.method) {
            const methodList = Util.toList(match.method, ',');
            if (!Util.inList(method, methodList)) {
                return false;
            }
        }
        return this.isMatchedRequest(request, match.url);
    }

    addMatch(match) {
        if (!match) {
            return this;
        }
        const o = this.option;
        o.match = Util.toList(o.match);
        o.match = o.match.concat(match);
        return this;
    }

    removeMatch(match) {
        Util.delListItem(this.option.match, match);
        return this;
    }

    // ====================================================================================================

    stop() {
        this.stopped = true;
        delete capturerCache[this.id];
    }

    destroy() {
        this.stop();
        this.requestCache = null;
        this.requestList = null;
        this.currentRequest = null;
        this.currentRequestInfo = null;
        this.option = null;

        // Util.logGreen("capturer destroy");
    }

    // ====================================================================================================
    // static

    static create(option) {
        const capturer = new RequestCapturer(option);
        capturerCache[capturer.id] = capturer;
        return capturer;
    }

    static addCapturerToTest(capturer) {
        const currentTest = RequestCapturer.getCurrentTest();
        if (!currentTest) {
            return;
        }
        if (!currentTest.capturerList) {
            currentTest.capturerList = [];
        }
        currentTest.capturerList.push(capturer);
    }

    static addFailedRequestIdToTest(requestId) {
        const currentTest = RequestCapturer.getCurrentTest();
        if (!currentTest) {
            return;
        }
        if (!currentTest.failedRequestIdList) {
            currentTest.failedRequestIdList = [];
        }
        if (currentTest.failedRequestIdList.includes(requestId)) {
            return;
        }
        currentTest.failedRequestIdList.push(requestId);
    }

    // stop for current test
    static stop() {
        const currentTest = RequestCapturer.getCurrentTest();
        if (!currentTest) {
            return;
        }
        if (currentTest.capturerList) {
            currentTest.capturerList.forEach(function(capturer) {
                capturer.destroy();
            });
            currentTest.capturerList = null;
        }
        if (currentTest.failedRequestIdList) {
            currentTest.failedRequestIdList = null;
        }
    }

    static eventHandler(eventData, requestType) {
        Object.keys(capturerCache).forEach(function(id) {
            const capturer = capturerCache[id];
            capturer.eventHandler(eventData, requestType);
        });
        RequestCapturer.commonFailedHandler(eventData, requestType);
    }

    static commonFailedHandler(request, requestType) {
        // already captured by test capturer
        if (request.captured) {
            return;
        }
        const capturerId = 'capturer_common';
        if (requestType === 'request') {
            RequestCapturer.generateRequestInfo(request, requestType, capturerId);
            return;
        }
        if (requestType === 'requestfinished') {
            const info = RequestCapturer.generateRequestFinishedInfo(request, requestType, capturerId);
            if (info.isFailed) {
                RequestCapturer.showRequestFinishedInfo(info);
            }
            return;
        }
        if (requestType === 'requestfailed') {
            const info = RequestCapturer.generateRequestFailedInfo(request, requestType, capturerId);
            RequestCapturer.showRequestFailedInfo(info);
        }
    }

    // ====================================================================================================

    static filterDataUrl(url) {
        if (url && url.indexOf('data:') === 0) {
            url = url.substr(0, url.indexOf(','));
        }
        return url;
    }

    static showRequestInfo(info) {
        const msg = `[${info.resourceType}] ${info.method}: ${RequestCapturer.filterDataUrl(info.url)}`;
        RequestCapturer.addTestLog(`[${info.requestType}] ${msg}`);
        Util.logMsg(`[${info.requestType}]`, msg);
    }

    static showRequestFinishedInfo(info) {
        let msg = `[${info.resourceType}] ${info.method}: ${RequestCapturer.filterDataUrl(info.url)}`;
        if (info.status) {
            msg += ` - status: ${info.status} (${info.statusText})`;
        }
        if (info.isFailed) {
            msg = EC.red(msg);
        }
        RequestCapturer.addTestLog(`[${info.requestType}] ${msg}`);
        Util.logMsg(`[${info.requestType}]`, msg);
    }

    static showRequestFailedInfo(info) {
        let msg = `[${info.resourceType}] ${info.method}: ${RequestCapturer.filterDataUrl(info.url)}`;
        if (info.isAbort) {
            msg = `${EC.yellow('[abort]')} ${msg}`;
        } else {
            if (info.statusText) {
                msg += ` - ${info.statusText}`;
            }
            msg = EC.red(msg);
        }
        RequestCapturer.addTestLog(`[${info.requestType}] ${msg}`);
        Util.logMsg(`[${info.requestType}]`, msg);
    }

    // ====================================================================================================

    static generateRequestInfo(request, requestType, capturerId) {
        const info = {
            requestType: requestType,
            requestId: RequestCapturer.getRequestId(request),
            url: request.url(),
            method: request.method(),
            resourceType: request.resourceType(),
            start_time: Date.now()
        };
        // cache start_time for finish or failed
        request[capturerId] = info;
        return info;
    }

    static getItemFromHeaders(key, headers) {
        if (!headers) {
            return;
        }
        for (let k in headers) {
            const v = headers[k];
            k = k.toLowerCase();
            if (k === key) {
                return v;
            }
        }
    }

    static async generateFailedResponseBody(response, filename) {
        let body;
        try {
            body = await response.json();
        } catch (e) {
            body = await response.text();
        }

        // remove big meta
        if (body && body._meta) {
            delete body._meta;
        }
        const info = {
            headers: response.headers(),
            fromCache: response.fromCache(),
            fromServiceWorker: response.fromServiceWorker(),
            remoteAddress: response.remoteAddress(),
            body: body
        };

        // response body handler
        const isHtml = function(headers, bd) {
            if (!bd) {
                return false;
            }
            if (typeof (bd) !== 'string') {
                return false;
            }
            const ct = headers['content-type'];
            if (!ct) {
                return false;
            }
            if (ct.indexOf('text/html') !== -1) {
                return true;
            }
            return false;
        };

        if (isHtml(info.headers, body)) {
            const htmlPath = `${RequestCapturer.getOutput()}/${filename}.html`;
            Util.writeJSONSync(htmlPath, body, true);
            console.log(`${EC.green('saved')} response html: ${htmlPath}`);
            info.body = `${filename}.html`;
        }

        return info;
    }

    static async generateFailedRequestData(request, info) {

        // only for failed xhr
        if (info.resourceType !== 'xhr') {
            return;
        }

        const requestData = {};
        Object.assign(requestData, info);

        // request
        requestData.request = {
            headers: request.headers(),
            isNavigationRequest: request.isNavigationRequest()
        };
        let postData = request.postData();
        if (postData) {
            try {
                postData = JSON.parse(postData);
            } catch (e) {
                // ignore
            }
            requestData.request.postData = postData;
        }

        const filename = `job-${Util.jobId}-request-${info.requestId}`;

        // response
        const response = request.response();
        if (response) {
            requestData.response = await RequestCapturer.generateFailedResponseBody(response, filename);
        }

        // save json
        const logFilename = `${filename}.json`;
        info.log = logFilename;
        const logPath = `${RequestCapturer.getOutput()}/${logFilename}`;
        Util.writeJSONSync(logPath, requestData, true);
        console.log(`${EC.green('saved')} request log: ${logPath}`);
    }

    static generateTracingInfo(request, info) {
        // keep x-api-requestid headers
        const headerKey = 'x-api-requestid';

        // try from request headers
        let xApiRequestId = RequestCapturer.getItemFromHeaders(headerKey, request.headers());

        // try from response headers, only for request finished
        if (!xApiRequestId) {
            const response = request.response();
            if (response) {
                xApiRequestId = RequestCapturer.getItemFromHeaders(headerKey, response.headers());
            }
        }

        if (xApiRequestId) {
            info[headerKey] = xApiRequestId;
        }

    }

    static generateRequestFinishedInfo(request, requestType, capturerId) {
        const isOk = RequestCapturer.isOk(request);
        const isRedirect = RequestCapturer.isRedirect(request);
        const isFailed = !isOk && !isRedirect;

        let start_time = Date.now();
        const end_time = Date.now();
        const startInfo = request[capturerId];
        if (startInfo) {
            start_time = startInfo.start_time;
        }

        // requestfinished info
        const info = {
            requestId: RequestCapturer.getRequestId(request),
            requestType: requestType,

            resourceType: request.resourceType(),
            method: request.method(),
            url: request.url(),

            status: '(finished)',
            statusText: '',

            isOk: isOk,
            isFailed: isFailed,
            isRedirect: isRedirect,

            start_time: start_time,
            end_time: end_time,
            duration: end_time - start_time
        };

        // response info
        const response = request.response();
        if (response) {
            info.status = response.status();
            info.statusText = response.statusText();
        }

        RequestCapturer.generateTracingInfo(request, info);

        return info;
    }

    static generateRequestFailedInfo(request, requestType, capturerId) {
        let isFailed = true;
        const isAbort = RequestCapturer.isAbort(request);
        if (isAbort) {
            isFailed = false;
        }
        const isTimeout = RequestCapturer.isTimeout(request);

        let start_time = Date.now();
        const end_time = Date.now();
        const startInfo = request[capturerId];
        if (startInfo) {
            start_time = startInfo.start_time;
        }

        // requestfailed info
        const info = {
            requestId: RequestCapturer.getRequestId(request),
            requestType: requestType,

            resourceType: request.resourceType(),
            method: request.method(),
            url: request.url(),

            status: '(failed)',
            statusText: '',

            isOk: false,
            isFailed: isFailed,
            isAbort: isAbort,
            isTimeout: isTimeout,

            start_time: start_time,
            end_time: end_time,
            duration: end_time - start_time
        };

        // errorText => statusText, only for requestfailed
        const failure = request.failure();
        if (failure && failure.errorText) {
            info.statusText = failure.errorText;
        }

        RequestCapturer.generateTracingInfo(request, info);

        return info;
    }

    // ====================================================================================================

    static getRequestId(request) {
        if (request) {
            return request._requestId;
        }
    }

    static isOk(request) {
        const response = request.response();
        if (response) {
            // successful 200-299
            if (!response.ok()) {
                return false;
            }
        }
        return true;
    }

    static isRedirect(request) {
        const response = request.response();
        if (response) {
            // redirect 300 - 399
            const statusCode = response.status();
            if (statusCode >= 300 && statusCode < 400) {
                return true;
            }
        }
        return false;
    }

    static isFailed(request) {
        const isOk = RequestCapturer.isOk(request);
        const isRedirect = RequestCapturer.isRedirect(request);
        return !isOk && !isRedirect;
    }

    static isAbort(request) {
        const failure = request.failure();
        if (failure) {
            if (failure.errorText === 'net::ERR_ABORTED') {
                return true;
            }
        }
        return false;
    }

    static isTimeout(request) {
        const failure = request.failure();
        if (failure) {
            if (failure.errorText === 'net::ERR_TIMED_OUT') {
                return true;
            }
        }
        return false;
    }

    // global hs helper API
    static getCurrentTest() {
        return global.hs.Helper.getCurrentTest();
    }

    static addTestLog(item) {
        return global.hs.Helper.addTestLog(item);
    }

    static getOutput() {
        return global.hs.Helper.getOutput();
    }

}

module.exports = RequestCapturer;
