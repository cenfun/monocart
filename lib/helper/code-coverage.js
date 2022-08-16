const fs = require('fs');
const path = require('path');
const beautify = require('js-beautify');

const Util = require('../core/util.js');
const EC = require('eight-colors');
const Table = require('../core/table.js');

const CodeCoverage = {

    //code coverage API
    startCodeCoverage: async () => {
        Util.logMsg('page', 'start code coverage ...');
        if (!global.page) {
            console.log('ERROR: Not found page instance for startCodeCoverage');
            return;
        }
        await Promise.all([
            global.page.coverage.startJSCoverage(),
            global.page.coverage.startCSSCoverage()
        ]);
        global.page.coverage.enabled = true;
    },

    stopCodeCoverage: async () => {
        if (!global.page) {
            console.log('ERROR: Not found page instance for stopCodeCoverage');
            return;
        }
        //require enabled start
        if (!global.page.coverage.enabled) {
            return;
        }
        const [jsCoverage, cssCoverage] = await Promise.all([
            global.page.coverage.stopJSCoverage(),
            global.page.coverage.stopCSSCoverage()
        ]);
        const coverage = {
            js: jsCoverage,
            css: cssCoverage
        };
        Util.logMsg('[page]', 'stopped code coverage.');
        return coverage;
    },

    generateCodeCoverage: async (list, Helper) => {
        if (!Util.isList(list)) {
            console.log(EC.red('Invalid code coverage list.'));
            return;
        }

        const coverageInfo = await CodeCoverage.stopCodeCoverage();
        if (!coverageInfo) {
            return;
        }

        Util.logMsg('page', 'generate code coverage ...');

        const coverageList = [];
        const outputPath = Helper.getOutput();

        const keys = Object.keys(coverageInfo);
        for (const item of list) {
            item.outputPath = outputPath;
            if (keys.indexOf(item.type) === -1) {
                item.type = 'js';
            }
            await CodeCoverage.codeCoverageHandler(item, coverageInfo[item.type], coverageList);
        }

        console.log('code coverage:');
        const rows = [];
        coverageList.forEach(function(item) {
            rows.push({
                type: item.type,
                name: item.name,
                coverage: item.coverage
            });
        });

        Util.CG({
            columns: [{
                id: 'type',
                name: 'Type'
            }, {
                id: 'name',
                name: 'Name',
                maxWidth: 300,
                formatter: function(v, rowItem) {
                    if (!rowItem.coverage) {
                        return EC.red(v);
                    }
                    return v;
                }
            }, {
                id: 'coverage',
                name: 'Coverage',
                align: 'right',
                formatter: function(v) {
                    return Util.PF(v);
                }
            }],
            rows: rows
        });

        Helper.setJobReport('codeCoverage', coverageList);
    },

    getCoverageEntryList: (item, coverageInfo) => {
        let match = item.match;
        const list = [];
        for (const entry of coverageInfo) {
            if (entry.matched) {
                continue;
            }
            const url = entry.url;
            if (match instanceof RegExp) {
                item.match = match.toString();
                if (url.match(match)) {
                    entry.matched = true;
                    list.push(entry);
                }
            } else {
                match = String(match);
                if (url.indexOf(match) !== -1) {
                    entry.matched = true;
                    list.push(entry);
                }
            }
        }
        return list;
    },

    getCoverageCode: function(item, entry) {
        const ranges = entry.ranges;
        const text = entry.text;
        const list = [];
        let pos = 0;
        ranges.forEach(function(range) {
            if (range.start > pos) {
                const f = text.substring(pos, range.start);
                list.push(f);
            }
            const t = text.substring(range.start, range.end);
            list.push(`/*used-start*/${t}/*used-end*/`);
            pos = range.end;
        });

        const code = list.join('');

        //https://github.com/beautify-web/js-beautify
        let str = code;
        if (item.type === 'js') {
            str = beautify.js(code, Util.getBeautifyOption());
        } else if (item.type === 'css') {
            str = beautify.css(code);
        }

        //encode html
        str = str.replace(/</g, '&lt;');
        str = str.replace(/>/g, '&gt;');

        str = str.replace(/ ?\/\*used-start\*\/ ?/g, '<span>');
        str = str.replace(/\/\*used-end\*\/ ?/g, '</span>');

        return str;
    },

    htmlCoverageHandler: function(item, entry) {
        const list = [];

        const percent = Util.PF(entry.coverage);
        const table = Table.generateHtml({
            option: {
                hideHeaders: true
            },
            columns: [{
                id: 'name'
            }, {
                id: 'value'
            }],
            rows: [{
                name: 'URL',
                value: `<a href="${entry.url}" target="_blank">${entry.url}</a>`
            }, {
                name: 'Name',
                value: entry.name
            }, {
                name: 'Total Bytes',
                value: `${Util.NF(entry.totalBytes)} (${Util.BF(entry.totalBytes)})`
            }, {
                name: 'Used Bytes',
                value: `${Util.NF(entry.usedBytes)} (${Util.BF(entry.usedBytes)})`
            }, {
                name: 'Coverage',
                name_rowspan: 2,
                value: percent
            }, {
                name: '',
                value: Table.generateBarChart(entry.totalBytes, entry.usedBytes, entry.totalBytes - entry.usedBytes)
            }]
        });

        list.push(table);

        const code = CodeCoverage.getCoverageCode(item, entry);
        list.push(`<pre><code>${code}</code></pre>`);

        const content = list.join('\n');

        const header = `<div><a href="job-${Util.jobId}-report.html">&lt;&lt; Job Report</a></div>`;

        const coverageTemplate = Util.getTemplate(`${Util.cliRoot}/lib/template.html`);
        return Util.replace(coverageTemplate, {
            title: 'Code Coverage Report',
            header: header,
            content: content,
            footer: ''
        });
    },

    codeCoverageHandler: (item, coverageInfo, coverageList) => {

        const entryList = CodeCoverage.getCoverageEntryList(item, coverageInfo);

        if (!entryList.length) {
            coverageList.push({
                type: item.type,
                name: `Not found match: ${item.match}`
            });
            return;
        }

        entryList.forEach(function(entry) {

            const name = `${path.basename(entry.url)}`;
            entry.name = name;

            const totalBytes = entry.text.length || 1;
            entry.totalBytes = totalBytes;

            let usedBytes = 0;
            for (const range of entry.ranges) {
                usedBytes += range.end - range.start - 1;
            }
            entry.usedBytes = usedBytes;

            const coverage = usedBytes / totalBytes;
            entry.coverage = coverage;

            const index = coverageList.length + 1;
            const filename = ['job', Util.jobId, 'coverage', index, name.toLowerCase()].join('-');

            //save coverage json
            // var json = filename + ".json";
            // entry.json = json;

            const outputPath = item.outputPath;
            // var jsonPath = outputPath + "/" + json;
            // fs.writeFileSync(jsonPath, JSON.stringify(entry, null, 2));
            // console.log("saved: " + jsonPath);

            //TODO
            //generate html
            const htmlContent = CodeCoverage.htmlCoverageHandler(item, entry);
            const html = `${filename}.html`;
            const htmlPath = `${outputPath}/${html}`;
            fs.writeFileSync(htmlPath, htmlContent);
            console.log(`saved: ${htmlPath}`);

            coverageList.push({
                index: index,
                type: item.type,
                match: item.match,
                url: entry.url,
                name: name,
                totalBytes: totalBytes,
                usedBytes: usedBytes,
                coverage: coverage,
                //json: json,
                html: html
            });

        });

    }

};

module.exports = CodeCoverage;
