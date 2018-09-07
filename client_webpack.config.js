const path = require('path');

module.exports = {
    entry: './src/utils/ClientTraceTracker.ts',
    devtool: 'inline-source-map',
    module: {
        rules: [{
            test: /\.tsx?$/,
            use: 'ts-loader',
            exclude: /node_modules/
        }]
    },
    resolve: {
        extensions: [ '.ts', '.js' ]
    },
    output: {
        filename: 'client_bundle.js',
        path: path.resolve(__dirname, 'build')
    },
    externals: {
        't2sm': 't2sm'
    }
};