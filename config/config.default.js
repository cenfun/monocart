module.exports = function(option) {
    const metadata = {
        name: 'Project Name',
        env: 'dev/qa/prod',
        type: 'Smoke/Regression',
        // test url
        url: '',
        debug: false,
        spec: '',

        option,

        info: {

        },

        // client helper
        client: {
            name: 'monocart',
            entry: './client/index.js'
        },

        password: '.passwordrc.json',
        user: {
            // userid: {
            //     username: ""
            // }
        },

        
    };

    // playwright runner config
    return {
        timeout: 30 * 1000,
        globalTimeout: 10 * 60 * 1000,
        // reporter: 'list',
        testDir: './tests',
        testMatch: [/.*(job|test|spec)\.js/],
        retries: 1,
        projects: [{
            name: 'Desktop Chromium',
            use: {
                browserName: 'chromium',
                viewport: {
                    width: 1280,
                    height: 720
                }
            }
        }],
        use: {
            screenshot: 'only-on-failure',
            video: 'on-first-retry',
            trace: 'retain-on-failure'
        },
        metadata
    };
};

