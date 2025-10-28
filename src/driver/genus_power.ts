import { FileReader, DataNode, FinishCallback, ProgressCallback, ErrorCallback, fileNodeToStr } from "./driver";

class GenusPowerFlatpathDriver {

    count_ = 0;                 // プログレス用途（任意）
    GIVE_UP_LINE_ = 200;        // 200行以内にヘッダが見つからないなら諦める

    constructor() {}

    private isValidFloat(str: string) {
        return /^-?\d+(?:\.\d+)?$/.test(str);
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
        let isFlat = true;              // 先頭空白行があれば階層表示＝非フラットと判定
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
                    for (let i = 0; i < headers.length; i++) {
                        if (headers[i] === "Total") { totalCol = i; break; }
                    }
                    if (totalCol === -1) {
                        errorCallback("Could not find 'Total' column in header.");
                        return;
                    }
                    detectedHeader = true;
                }
                return;
            }

            // データ行
            // 行頭に空白があればフラットでない（ツリー表）と判定して中断
            if (/^\s/u.test(line)) {
                isFlat = false;
                return;
            }

            const words = trimmed.split(/\s+/);
            if (words.length <= totalCol) return;

            // Total 値
            const totalStr = words[totalCol];
            if (!this.isValidFloat(totalStr)) return;
            const totalVal = Number(totalStr);
            if (!Number.isFinite(totalVal)) return;

            // Instance は最後のトークン想定（列幅が固定でインスタンスに空白は入らない前提）
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

            // 葉に Total を加算（同一インスタンスが複数回出た場合を考慮して加算）
            node.data[0] = (node.data[0] || 0) + totalVal;
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

                const orgSize = node.data[0] || 0;

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
                        n.data[0] = remaining;
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

            if (!detectedHeader || !sawData || !includePowerMark || !isFlat) {
                errorCallback("This file may not be Genus power report file (flat path).");
                return;
            }

            finalize(tree);

            // ルート直下の最初のノードをトップとして返す（元コードと同様の挙動）
            const top =
                tree.children ? tree.children[Object.keys(tree.children)[0]] : null;

            finishCallback(top);
        });

        reader.load();
    }

    fileNodeToStr(fileNode: DataNode, rootNode: DataNode, dataIndex: number, detailed: boolean) {
        return fileNodeToStr(fileNode, rootNode, dataIndex);
    }
}

export default GenusPowerFlatpathDriver;
