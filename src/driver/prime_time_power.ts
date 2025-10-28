import { FileReader, FileNode, FinishCallback, ProgressCallback, ErrorCallback, fileNodeToStr } from "./driver";

class PrimeTimePowerDriver {

    count_ = 0; // プログレスバー用
    GIVE_UP_LINE_ = 100; // 早期判定のため

    constructor() {
    }

    // 10進/負号/指数表記を許容
    isValidFloat(str: string) {
        return /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][-+]?\d+)?$/.test(str);
    }

    // 先頭空白数を返す
    leadingSpaces(line: string): number {
        const m = line.match(/^(\s*)/);
        return m ? m[1].length : 0;
    }

    load(reader: FileReader, finishCallback: FinishCallback, progressCallback: ProgressCallback, errorCallback: ErrorCallback) {

        let tree = new FileNode();
        let nextID = 1;

        let lineNum = 0;
        let buffer = "";          // 行折返し結合用
        let isPX_ = false;        // Averaged Power レポート判定
        let sawSeparator = false; // 水平線(----)検出済みか
        let started = false;      // データ開始（水平方線の“次の行”で true）
        let top = "";             // トップ名

        // 階層管理スタック（レベル -> FileNode）
        let stack: FileNode[] = [];

        reader.onReadLine((line: string) => {
            lineNum++;

            // PX レポートの判定（ヘッダ部で一度でもヒットしたら OK）
            if (!isPX_) {
                if (/^Report\s*:\s*Averaged Power/i.test(line)) {
                    isPX_ = true;
                }
            }

            // PX と判定できず、ヘッダが続くようなら一定行数で打ち切り
            if (!isPX_ && lineNum > this.GIVE_UP_LINE_) {
                errorCallback("This file may not be a PrimeTime-PX averaged power (hierarchy) report.");
                return;
            }

            // PX 判定後：水平線(----)を探す
            if (isPX_ && !sawSeparator) {
                if (/^-{5,}/.test(line.trim())) {
                    sawSeparator = true;
                    // 「次の行」が実データなので、ここでは started にしない
                }
                return;
            }

            // 水平線の次の行からがデータ
            if (isPX_ && sawSeparator && !started) {
                // 空行はスキップ、最初の非空行から開始
                if (line.trim() === "") return;
                started = true;
                // ここから下はデータとして処理
            }

            if (!started) return; // まだデータ部でない

            // ---------- データ部の処理 ----------
            // 長行折返し対策：直前までの buffer を結合
            let candidate = buffer + line;

            // 末尾5カラム（Int, Switch, Leak, Total, %）を空白 split で取得
            // 1) 末尾の改行や余分な空白を落とす
            let raw = candidate.replace(/\s+$/g, "");
            if (raw === "") return;

            // トークン化（空白で split）
            const tokens = raw.trim().split(/\s+/);

            // 数値末尾5つが揃っているかチェック
            if (tokens.length < 6) {
                // 名前や括弧が改行で折返している途中とみなしてバッファリング
                buffer = candidate;
                return;
            }

            const last5 = tokens.slice(-5);
            const areLast5Nums = last5.every(t => this.isValidFloat(t));
            if (!areLast5Nums) {
                // まだ数字列が揃っていない → 折返し継続
                buffer = candidate;
                return;
            }

            // ここまで来たら 末尾5 は数値。名前部はそれ以外（トークン）を結合
            const nameTokens = tokens.slice(0, tokens.length - 5);
            if (nameTokens.length === 0) {
                // 想定外：名前がない
                buffer = candidate;
                return;
            }

            // インデントは先頭空白数から算出（raw の先頭側を見る）
            const indent = this.leadingSpaces(raw);
            // 一般的に 2 スペース刻みのため /2
            const level = Math.max(0, Math.floor(indent / 2));

            // 表示名（括弧内はあってもなくても OK そのまま保持）
            const nameRaw = nameTokens.join(" ");

            // 数値
            const intPower    = Number(last5[0]);
            const switchPower = Number(last5[1]);
            const leakPower   = Number(last5[2]);
            const totalPower  = Number(last5[3]);
            // const percent      = Number(last5[4]); // 必要なら利用

            if (!isFinite(totalPower)) {
                // 想定外
                buffer = candidate;
                return;
            }

            // トップ名の記録（最初の0レベル行）
            if (top === "" && level === 0) {
                top = nameRaw;
            }

            // 親決定
            while (stack.length > level) stack.pop();
            let parentNode: FileNode = stack.length === 0 ? tree : stack[stack.length - 1];
            if (parentNode.children == null) parentNode.children = {};

            // 同名キーの衝突回避
            let key = nameRaw;
            if (key in parentNode.children) {
                let suf = 1;
                while ((key + `#${suf}`) in parentNode.children) suf++;
                key = key + `#${suf}`;
            }

            // ノード生成
            const node = new FileNode();
            node.key = key;
            node.parent = parentNode;
            node.id = nextID++;
            node.size = totalPower; // ノードサイズは Total Power

            parentNode.children[key] = node;

            // スタックに積む
            stack.push(node);

            // 正常に処理できたのでバッファをクリア
            buffer = "";
        });

        reader.onClose(() => {
            // finalize: 親が子の合計を含む前提で残差 > 0 なら others を作る
            const finalize = (node: FileNode): number => {
                let sum = 0;
                if (node.children) {
                    for (const k in node.children) {
                        sum += finalize(node.children[k]);
                    }
                }
                const org = node.size ?? 0;
                const remaining = org - sum;
                if (node.children && Object.keys(node.children).length !== 0 && remaining > 0) {
                    const n = new FileNode();
                    n.size = remaining;
                    n.key = "others";
                    n.parent = node;
                    n.id = nextID++;
                    node.children["others"] = n;
                }
                return org;
            };

            if (isPX_) {
                finalize(tree);
                const root = tree.children ? tree.children[Object.keys(tree.children)[0]] : null;
                finishCallback(root);
            } else {
                errorCallback("This file may not be a PrimeTime-PX averaged power (hierarchy) report.");
            }
        });

        reader.load();
    }

    fileNodeToStr(fileNode: FileNode, rootNode: FileNode, isSizeMode: boolean) {
        return fileNodeToStr(fileNode, rootNode, isSizeMode);
    }

};

export default PrimeTimePowerDriver;
