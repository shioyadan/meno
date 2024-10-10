const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const HtmlInlineScriptPlugin = require("html-inline-script-webpack-plugin");

module.exports = {
    // productionにしたい場合は "production" に変更
    mode: "development", 
    // mode: "production", 

    // Source map の有効化
    devtool: "inline-source-map",

    entry: "./src/index.tsx", // エントリーポイント
    output: {
        path: path.resolve(__dirname, "dist"),
        clean: true, // 出力ディレクトリをクリーンアップする
        // publicPath: ''
    },
    // import 時に解決するファイルの拡張子
    resolve: {
        extensions: [".ts", ".tsx", ".js"],
    },
    // JS 内から import したときに .tsx/.css を JS に変換する
    module: {
    rules: [
    {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
    },
    {
        test: /\.css$/, // CSSファイルの読み込み
        use: ["style-loader", "css-loader"],
        exclude: /node_modules/,
    },
    ],
    },
    // HTML 内にスクリプトを埋め込むためのプラグインの設定
    plugins: [
        new HtmlWebpackPlugin({
            template: "./src/index.html", // HTMLテンプレート
            inject: "body", // スクリプトをbodyに挿入
        //   minify: { // production を指定するとこのあたりはなくてもいける？
        //     removeComments: false,
        //     collapseWhitespace: false,
        //   },
        }),
        new HtmlInlineScriptPlugin({}),
    ],
    // Docker でビルドする場合にはキャッシュは tmp の方がよい
    cache: {
        type: "filesystem", 
        cacheDirectory: "/tmp/webpack"
    },
    performance: { 
        hints: false 
    }, // ビルド時のパフォーマンス警告を無効化
    devServer: {
        hot: false,
    }    
};
