import { FileReader, DataNode, FinishCallback, ProgressCallback, ErrorCallback, fileNodeToStr } from "./driver";

class GenusAreaFlatpathDriver {

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
        let top = "";        // トップモジュール名
        let lineNum = 0;
        
        // パースの状態
        let includeGenusMark = false;   // "Genus" という文字列が含まれているか
        let isGenusFlat_ = true;        // flat パス形式かどうか
        let isGenus_ = false;           // Genus と判断
        let detectGenusHeader = false;  // Genus のヘッダを検出したかどうか
        let totalAreaCol = -1;
        
        reader.onReadLine((line: string) => {
            lineNum++;

            if (lineNum > this.GIVE_UP_LINE_ && (!isGenus_ || !isGenusFlat_)) {
                errorCallback("This file may not be Genus area report file (flat path).");
                return;
            }
            if (line.match(/Genus/)) {
                includeGenusMark = true;
            }
            if (!includeGenusMark) {
                return;
            }

            // 各行をスペースで分割して単語にする
            const words = line.trim().split(/\s+/);

            // Genus のヘッダを検出
            // Instance Module という行があれば，それ以降はレポート
            if (words[0] == "Instance" && words[1] == "Module") {
                detectGenusHeader = true;
                // "Total-Area" の列を探す
                for (let i = 0; i < words.length; i++) {
                    if (words[i] == "Total-Area") {
                        totalAreaCol = i;
                        break;
                    }
                }
                return;
            }
            if (!detectGenusHeader || totalAreaCol == -1) {
                return;
            }

            // totalAreaCol が見つからない場合は無視する
            if (totalAreaCol >= words.length || !this.isValidFloat(words[totalAreaCol])) {
                return;
            }
            
            // Genus で確定
            isGenus_ = true;
            //行頭にスペースがあれば，それは flat ではない
            if (line.match(/^\s/)) {
                isGenusFlat_ = false;
                return;
            }

            const instance = words[0];
            const nodeNames = instance.split(/[\/]/);
            const nodeSize = Number(words[3]);    // Cell area
                
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
            function finalize(node: DataNode) {
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
                        let n = new DataNode();
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
            if (isGenus_ && isGenusFlat_) {
                finalize(tree);
                finishCallback(tree.children ? tree.children[Object.keys(tree.children)[0]] : null);
            }
            else {
                errorCallback("This file may not be Genus area report file (flat path).");
            }
        });

        reader.load();
    }

    fileNodeToStr(fileNode: DataNode, rootNode: DataNode, dataIndex: number, detailed: boolean) {
        return fileNodeToStr(fileNode, rootNode, dataIndex);
    }
};

export default GenusAreaFlatpathDriver;
