import { FileReader, DataNode, FinishCallback, ProgressCallback, ErrorCallback, fileNodeToStr, formatNumberCompact } from "./driver";

class DC_AreaDriver {

    count_ = 0; // プログレスバー用
    GIVE_UP_LINE_ = 100; // 100 行以上読んだら諦める

    constructor() {
    }
    
    isValidFloat(str: string) {
        return /^-?\d+(\.\d+)?$/.test(str);
    }

    load(reader: FileReader, finishCallback: FinishCallback, progressCallback: ProgressCallback, errorCallback: ErrorCallback) {

        let tree = new DataNode();
        // ドットで繋がった部分は擬似ノードと見なすため，それの記録 ID->isPseudo
        let pseudoMap: Record<number, boolean> = {};    
        let nextID = 1;
        let lastLine = ""; 
        let top = "";        // トップモジュール名
        let lineNum = 0;
        let isDC_ = false;

        reader.onReadLine((line: string) => {
            lineNum++;

            if (lineNum > this.GIVE_UP_LINE_ && !isDC_) {
                errorCallback("This file may not be a DC area report file.");
                return;
            }

            // 各行をスペースで分割して単語にする
            let words = line.trim().split(/\s+/);
            if (words.length != 7 || !this.isValidFloat(words[1])) { // 要素が7個かつ，2つめが数字のときのみ処理
                words = (lastLine + line).trim().split(/\s+/);
                if (words.length != 7 || !this.isValidFloat(words[1])) { // 要素が7個かつ，2つめが数字のときのみ処理
                    lastLine = line;
                    return;
                }
                else {
                    // 結合した結果マッチ
                }
            }
            lastLine = "";
            
            isDC_ = true;

            let instance = words[0];
            if (top == "") {    // １行目だけはトップモジュール名を表す
                top = instance;
            }
            else {  // トップモジュール名を含める
                instance = top + "/" + instance;
            }

            const nodeNames = instance.split(/[\/]/);
            const absTotal = Number(words[1]);    // Cell area
            const combArea = Number(words[3]);
            const nonCombArea = Number(words[4]);
            const blackBoxArea = Number(words[5]);

            // 目的となるノードを探す
            let node = tree;
            for (let i of nodeNames) {
                // const subNodeNames = i.split(/\./);
                // const subNodeNames = i.split(/(\[.*?\])|\./).filter(Boolean);
                const subNodeNames = i.split(/(\[.*?\])/).filter(Boolean);  // filter boolean で空文字を除去
                // const subNodeNames = i.split(/(?=\[\d+\])/);
                for (let j of subNodeNames) {
                    if (node.children == null) {
                        node.children = {};
                    }
                    if (!(j in node.children)) {
                        let n = new DataNode();
                        n.key = j;
                        n.parent = node;
                        n.id = nextID;
                        n.data = [0, 0, 0, 0]; // 子ノードのデータを初期化
                        node.children[j] = n;
                        pseudoMap[n.id] =
                            subNodeNames.length > 1 && j != subNodeNames[subNodeNames.length-1]; // ドットで区切ったときは pseudo node
                        nextID++;
                    }
                    node = node.children[j];
                }
            }
            node.data[0] = absTotal;
            node.data[1] = combArea;
            node.data[2] = nonCombArea;
            node.data[3] = blackBoxArea;
        });

        reader.onClose(() => {
            function finalize(node: DataNode) {
                // 各ノードが子供全員のサイズを含んでいるので，子供分を引いていく
                // total 以外は子供サイズをもともと含まないので引かない
                let size = 0;
                for (let i in node.children) {
                    size += finalize(node.children[i]);
                }

                let orgSize = node.data[0];
                if (node.id in pseudoMap && pseudoMap[node.id]) { 
                    // ドットで区切られているノードは擬似ノードなので，子のサイズを含まない
                    // 擬似ノードの場合，子供サイズをそのまま返す
                    node.data[0] = size;
                    return size;
                }
                else {
                    // 子のサイズを引いた後に，残りがあれば others ノードを作成
                    // node.data[0] -= size;
                    let remainingSize = node.data[0] - size;
                    if (node.children && Object.keys(node.children).length != 0 && remainingSize > 0) {
                        let n = new DataNode();
                        n.data = [remainingSize, 0, 0, 0]; // others ノードも data を持つ
                        n.key = "others";
                        n.parent = node;
                        n.id = nextID;
                        node.children["others"] = n;
                        nextID++;
                    }
                    return orgSize;
                }

            }
            if (isDC_) {
                finalize(tree);
                finishCallback(tree.children ? tree.children[Object.keys(tree.children)[0]] : null);
            }
            else {
                errorCallback("This file may not be a DC area report file.");
            }
        });

        reader.load();
    }

    fileNodeToStr(fileNode: DataNode, rootNode: DataNode, dataIndex: number, detailed: boolean) {
        const rootSize = rootNode.data[0];
        const percentage =
            rootSize > 0 ? ((fileNode.data[dataIndex] / rootSize) * 100).toFixed(2) : "0.00";

        const fmt = formatNumberCompact;
        if (detailed) {
            return ` [total: ${fmt(fileNode.data[0])} (${percentage}%), comb: ${fmt(fileNode.data[1])}, non-comb: ${fmt(fileNode.data[2])}, black-box: ${fmt(fileNode.data[3])}]`;
        } else {
            return ` [${fmt(fileNode.data[0])} (${percentage}%)]`;
        }
    }

    itemNames() {
        return ["total", "comb", "non-comb", "black-box"];
    }
};

export default DC_AreaDriver;
