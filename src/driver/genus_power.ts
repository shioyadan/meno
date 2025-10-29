import { FileReader, DataNode, FinishCallback, ProgressCallback, ErrorCallback, formatNumberCompact } from "./driver";

class GenusPowerFlatpathDriver {

    count_ = 0;                 // プログレス用途（任意）
    GIVE_UP_LINE_ = 200;        // 200行以内にヘッダが見つからないなら諦める

    constructor() {}

    // 科学表記 (1.23e-4) と % を含む数値も許可
    private isValidFloatToken_(str: string) {
        return /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+\-]?\d+)?%?$/.test(str);
    }

    private toNumber_(str: string): number {
        if (!str) return 0;
        const s = str.endsWith("%") ? str.slice(0, -1) : str;
        const n = Number(s);
        return Number.isFinite(n) ? n : 0;
    }

    load(
        reader: FileReader,
        finishCallback: FinishCallback,
        progressCallback: ProgressCallback,
        errorCallback: ErrorCallback
    ) {
        let lineNum = 0;

        // ルートツリーと擬似ノードの印（ID -> isPseudo）
        let tree = new DataNode();
        let pseudoMap: Record<number, boolean> = {};
        let nextID = 1;

        // ヘッダ検出とカラム位置
        let detectedHeader = false;
        let totalCol = -1;
        let instanceCol = -1;
        let cellsCol = -1;
        let leakCol = -1;       // "Leakage"
        let internalCol = -1;   // "Internal"
        let switchingCol = -1;  // "Switching"
        let dynamicCol = -1;    // "Dynamic"（ある場合）
        // let lvlCol = -1;     // Lvl は使用しない

        let sawData = false;

        // キーワードが入っているか
        let includePowerMark = false;

        reader.onReadLine((line: string) => {
            lineNum++;

            if (/PDB Frame/u.test(line)) includePowerMark = true;

            if (lineNum > this.GIVE_UP_LINE_ && !detectedHeader) {
                errorCallback("This file may not be a Genus power report (flat path with Total column).");
                return;
            }

            // 区切り線や空行はスキップ
            const trimmed = line.trim();
            if (!trimmed || /^-+$/u.test(trimmed)) return;

            // ヘッダ検出：先頭が "Cells" で "Total" と "Instance" を含む
            if (!detectedHeader) {
                if (/^Cells\s+/u.test(trimmed) && /\bTotal\b/u.test(trimmed) && /\bInstance\b/u.test(trimmed)) {
                    const headers = trimmed.split(/\s+/);
                    // 小文字にして検索
                    const lower = headers.map(h => h.toLowerCase());
                    const findIdx = (name: string) => lower.indexOf(name);

                    cellsCol = findIdx("cells");
                    leakCol = findIdx("leakage");
                    internalCol = findIdx("internal");
                    switchingCol = findIdx("switching");
                    dynamicCol = findIdx("dynamic");
                    totalCol = findIdx("total");
                    instanceCol = findIdx("instance");
                    // lvlCol = findIdx("lvl"); // 不使用

                    if (cellsCol === -1 || totalCol === -1 || instanceCol === -1) {
                        errorCallback("Could not resolve required columns in header (need Cells/Total/Instance).");
                        return;
                    }
                    detectedHeader = true;
                }
                return;
            }

            // データ行

            const words = trimmed.split(/\s+/);
            if (words.length <= totalCol) return;

            // Total 値
            const totalStr = words[totalCol];
            if (!this.isValidFloatToken_(totalStr)) return;
            const totalVal = this.toNumber_(totalStr);
            if (!Number.isFinite(totalVal)) return;

            // 各列（存在しなければ 0）
            const cell = (cellsCol >= 0 && cellsCol < words.length) ? this.toNumber_(words[cellsCol]) : 0;
            const leak = (leakCol >= 0 && leakCol < words.length && this.isValidFloatToken_(words[leakCol])) ? this.toNumber_(words[leakCol]) : 0;
            const internal = (internalCol >= 0 && internalCol < words.length && this.isValidFloatToken_(words[internalCol])) ? this.toNumber_(words[internalCol]) : 0;
            const switching = (switchingCol >= 0 && switchingCol < words.length && this.isValidFloatToken_(words[switchingCol])) ? this.toNumber_(words[switchingCol]) : 0;
            const dynamic = (dynamicCol >= 0 && dynamicCol < words.length && this.isValidFloatToken_(words[dynamicCol])) ? this.toNumber_(words[dynamicCol]) : 0;

            // Instance は基本的に最後のトークン（列幅固定でスペースを含まない前提）
            const instance = words[words.length - 1];

            // パスを '/' で分割して辿る
            const nodeNames = instance.split(/[\/]/).filter(Boolean);

            // ツリーを掘っていく（[] 添字を括弧ごとに分離し、中間を擬似ノード扱い：元コードと同様）
            let node = tree;
            for (const part of nodeNames) {
                // 例: "g_ic_bank[3]" -> ["g_ic_bank", "[3]"]
                const subNodeNames = part.split(/(\[.*?\])/).filter(Boolean);
                for (let idx = 0; idx < subNodeNames.length; idx++) {
                    const key = subNodeNames[idx];
                    if (!node.children) node.children = {};
                    if (!(key in node.children)) {
                        const n = new DataNode();
                        n.data = [0, 0, 0, 0, 0, 0];    // total, dynamic, int, sw, leak, cell-count
                        n.key = key;
                        n.parent = node;
                        n.id = nextID++;
                        node.children[key] = n;
                        // 括弧分割の中間は擬似ノード（サイズは子合計とする）
                        pseudoMap[n.id] = subNodeNames.length > 1 && idx !== subNodeNames.length - 1;
                    }
                    node = node.children[key];
                }
            }

            // 葉に値を加算（同一インスタンスが複数回出た場合を考慮して加算）
            node.data[0] += totalVal;        // total
            node.data[1] += dynamic;         // dynamic
            node.data[2] += internal;        // int
            node.data[3] += switching;       // sw
            node.data[4] += leak;            // leak
            node.data[5] += cell;            // cell-count
            sawData = true;

            // 進捗コール
            this.count_++;
            // if ((this.count_ & 0x3FF) === 0 && progressCallback) progressCallback(this.count_.toString());
        });

        reader.onClose(() => {

            function finalize(node: DataNode): number {
                // 子を先に確定
                let childSum = 0;
                if (node.children) {
                    for (const k of Object.keys(node.children)) {
                        childSum += finalize(node.children[k]);
                    }
                }

                const orgSize = node.data[0];

                if (node.id && pseudoMap[node.id]) {
                    // 擬似ノードは子サイズの合計＝自身のサイズ
                    node.data[0] = childSum;
                    return childSum;
                } else {
                    // 非擬似ノードは「自身（org）＝そのノードのトータル」と扱う
                    // 子がある場合、子合計を差し引いた残差を others に入れる
                    const remaining = orgSize - childSum;
                    if (node.children && Object.keys(node.children).length !== 0 && remaining > 0) {
                        const n = new DataNode();
                        n.data = [remaining, 0, 0, 0, 0, 0];
                        n.key = "others";
                        n.parent = node;
                        n.id = (nextID++);
                        if (!node.children) node.children = {};
                        node.children["others"] = n;
                    }
                    // finalize は「そのノードが元々持っていた合計」を親へ返す
                    return orgSize;
                }
            }

            if (!detectedHeader || !sawData || !includePowerMark) {
                errorCallback("This file may not be Genus power report file.");
                return;
            }

            finalize(tree);

            // ルート直下の最初のノードをトップとして返す
            const top =
                tree.children ? tree.children[Object.keys(tree.children)[0]] : null;

            finishCallback(top);
        });

        reader.load();
    }

    fileNodeToStr(fileNode: DataNode, rootNode: DataNode, dataIndex: number, detailed: boolean) {
        const rootSize = rootNode.data[0];
        const percentage =
            rootSize > 0 ? ((fileNode.data[0] / rootSize) * 100).toFixed(2) : "0.00";

        const fmt = formatNumberCompact;
        if (detailed) {
            return ` [total: ${fmt(fileNode.data[0])} (${percentage}%), dynamic: ${fmt(fileNode.data[1])}, int: ${fmt(fileNode.data[2])}, sw: ${fmt(fileNode.data[3])}, leak: ${fmt(fileNode.data[4])}, cell: ${fmt(fileNode.data[5])}]`;
        } else {
            return ` [${fmt(fileNode.data[0])} (${percentage}%)]`;
        }
    }

    itemNames() {
        return ["total", "dynamic", "int", "sw", "leak", "cell-count"];
    }
}

export default GenusPowerFlatpathDriver;
