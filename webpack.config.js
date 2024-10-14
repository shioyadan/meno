const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const HtmlInlineScriptPlugin = require("html-inline-script-webpack-plugin");


module.exports = (env, argv) => {
    // npx webpack --mode production で isProduction=true に

    const isProduction = argv.mode === "production";
    return {
                // productionにしたい場合は "production" に変更
        mode: isProduction ? "production" : "development", 

        // Source map の有効化（開発時のみ）
        devtool: isProduction ? false : "inline-source-map",

        entry: "./src/index.tsx", // エントリーポイント
        output: {
            path: path.resolve(__dirname, "dist"),
            clean: true, // 出力ディレクトリをクリーンアップする
            filename: "bundle.js",
            publicPath: ''
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
                    use: ["style-loader", "css-loader"]
                },
                {
                    // フォントや画像の処理
                    test: /\.(woff(2)?|ttf|eot|svg)$/,
                    type: 'asset/inline',
                }
            ],
        },
        // HTML 内にスクリプトを埋め込むためのプラグインの設定
        plugins: [
            new HtmlWebpackPlugin({
                template: "./src/index.html", // HTMLテンプレート
                inject: "body", // スクリプトをbodyに挿入
                minify: isProduction
            }),
            // bundle.js を HTML に埋め込む
            // これを有効にするとホットリロードが無限ループになってバグるので，開発中は無効に
            ...(isProduction ? [new HtmlInlineScriptPlugin({})] : []),
        ],
        // Docker でビルドする場合にはキャッシュは tmp の方がよい
        // cache: {
        //     type: "filesystem", 
        //     cacheDirectory: "/tmp/webpack"
        // },
        performance: { 
            hints: false 
        }, // ビルド時のパフォーマンス警告を無効化
        devServer: {
            hot: false,
            liveReload: true,
        },
    };
};

