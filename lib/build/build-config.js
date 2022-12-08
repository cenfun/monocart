const StatsReportPlugin = require('webpack-stats-report').StatsReportPlugin;
module.exports = function(option) {

    const {
        // 'development' | 'production'
        mode = 'development',
        entry,
        outputPath,
        outputFilename,
        outputLibrary,
        // inline-source-map | source-map
        devtool = false
    } = option;

    // console.log(option);

    // create webpack conf
    return {
        mode: mode,
        // replace with component entry
        entry: entry,
        output: {
            // the target directory for all output files
            path: outputPath,
            // the filename template for entry
            filename: outputFilename,
            // the name of the exported library
            library: outputLibrary,
            // the type of the exported library
            libraryTarget: 'umd',
            // use a named AMD module in UMD library
            umdNamedDefine: true
        },
        // https://webpack.js.org/configuration/devtool/#devtool
        devtool: devtool,

        module: {
        },
        plugins: [new StatsReportPlugin({
            title: `Stats Report - ${outputLibrary}`,
            output: `.temp/stats-report-${outputLibrary}.html`
        })],
        externals: []
    };
};
