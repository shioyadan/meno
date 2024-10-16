import { FileReader, FileNode, FinishCallback, ProgressCallback, ErrorCallback} from "./driver";

class GenusAreaDriver {

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
        let top = "";        // トップモジュール名
        let lineNum = 0;
        let isGenus_ = false;

        reader.onReadLine((line: string) => {
            lineNum++;

            if (lineNum > this.GIVE_UP_LINE_ && !isGenus_) {
                errorCallback("This file may not Genus DC area report file.");
                return;
            }

            // 各行をスペースで分割して単語にする
            const words = line.trim().split(/\s+/);
            if (words.length != 8 || !this.isValidFloat(words[2])) { // 要素が8個かつ，3つめが数字のときのみ処理
                return;
            }
            
            isGenus_ = true;

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
            finalize(tree);
            finishCallback(tree.children ? tree.children[Object.keys(tree.children)[0]] : null);
        });

        reader.load();
    }

    fileNodeToStr(fileNode: FileNode, isSizeMode: boolean) {
        let str = "";
        let num = fileNode.size;
        if (num > 1000*1000*1000) {
            str = "" + Math.ceil(num/1000/1000/1000) + "G";
        }
        else if (num > 1000*1000) {
            str = "" + Math.ceil(num/1000/1000) + "M";
        }
        else if (num > 1000) {
            str = "" + Math.ceil(num/1000) + "K";
        }
        else {
            str = "" + num;
        }
        return " [" + str + "]";
    }
};

export default GenusAreaDriver;
