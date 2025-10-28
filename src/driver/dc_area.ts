import { FileReader, FileNode, FinishCallback, ProgressCallback, ErrorCallback, fileNodeToStr } from "./driver";

class DC_AreaDriver {

    count_ = 0; // プログレスバー用
    GIVE_UP_LINE_ = 100; // 100 行以上読んだら諦める

    constructor() {
    }
    
    isValidFloat(str: string) {
        return /^-?\d+(\.\d+)?$/.test(str);
    }

    load(reader: FileReader, finishCallback: FinishCallback, progressCallback: ProgressCallback, errorCallback: ErrorCallback) {

        let tree = new FileNode();
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
            // const nodeSize = Math.floor(Number(words[1]));    // Cell area
            const nodeSize = Number(words[1]);    // Cell area
            
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
                        let n = new FileNode();
                        n.key = j;
                        n.parent = node;
                        n.id = nextID;
                        node.children[j] = n;
                        pseudoMap[n.id] =
                            subNodeNames.length > 1 && j != subNodeNames[subNodeNames.length-1]; // ドットで区切ったときは pseudo node
                        nextID++;
                    }
                    node = node.children[j];
                }
            }
            node.size = nodeSize;
        });

        reader.onClose(() => {
            function finalize(node: FileNode) {
                // 各ノードが子供全員のサイズを含んでいるので，子供分を引いていく
                let size = 0;
                for (let i in node.children) {
                    size += finalize(node.children[i]);
                }

                let orgSize = node.size;
                if (node.id in pseudoMap && pseudoMap[node.id]) { 
                    // ドットで区切られているノードは擬似ノードなので，子のサイズを含まない
                    // 擬似ノードの場合，子供サイズをそのまま返す
                    node.size = size;
                    return size;
                }
                else {
                    // 子のサイズを引いた後に，残りがあれば others ノードを作成
                    // node.size -= size;
                    let remainingSize = node.size - size;
                    if (node.children && Object.keys(node.children).length != 0 && remainingSize > 0) {
                        let n = new FileNode();
                        n.size = remainingSize;
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

    fileNodeToStr(fileNode: FileNode, rootNode: FileNode, isSizeMode: boolean) {
        return fileNodeToStr(fileNode, rootNode, isSizeMode);
    }
};

export default DC_AreaDriver;
