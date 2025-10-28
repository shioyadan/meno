import { FileReader, DataNode, FinishCallback, ProgressCallback, ErrorCallback, fileNodeToStr } from "./driver";

class VivadoAreaDriver {

    count_ = 0; // プログレスバー用
    GIVE_UP_LINE_ = 100; // 100 行以上読んだら諦める

    constructor() {
    }

    isValidFloat(str: string) {
        return /^-?\d+(\.\d+)?$/.test(str.trim());
    }

    load(reader: FileReader, finishCallback: FinishCallback, progressCallback: ProgressCallback, errorCallback: ErrorCallback) {

        let tree = new DataNode();
        // ドットで繋がった部分は擬似ノードと見なすため，それの記録 ID->isPseudo
        let pseudoMap: Record<number, boolean> = {};    
        let nextID = 1;
        let lineNum = 0;
        let isVivado_ = false;
        let curNodes = [];

        reader.onReadLine((line: string) => {
            lineNum++;

            if (lineNum > this.GIVE_UP_LINE_ && !isVivado_) {
                errorCallback("This file may not be a Vivado area report file.");
                return;
            }

            // 各行を | で分割して単語にする
            const words = line.trim().split(/\|/);
            if (words.length != 12 || !this.isValidFloat(words[3])) { // 要素が8個かつ，3つめが数字のときのみ処理
                return;
            }

            isVivado_ = true;

            const match = words[1].match(/^ */);
            const level = match ? ((match[0].length - 1) / 2) : 0;
    
            const instance = words[1].trim();
            curNodes[level] = instance;
            const fullPath = curNodes.slice(0, level+1).join("/");
    
            const nodeNames = fullPath.split(/[\/]/);
            const nodeSize = Number(words[3]);    // Total LUTs
                
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
            if (isVivado_) {
                finalize(tree);
                finishCallback(tree.children ? tree.children[Object.keys(tree.children)[0]] : null);
            }
            else {
                errorCallback("This file may not be a Vivado area report file.");
            }
        });

        reader.load();
    }

    fileNodeToStr(fileNode: DataNode, rootNode: DataNode, dataIndex: number, detailed: boolean) {
        return fileNodeToStr(fileNode, rootNode, dataIndex, "LUTs");
    }
};

export default VivadoAreaDriver;
