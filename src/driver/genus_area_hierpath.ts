import { FileReader, FileNode, FinishCallback, ProgressCallback, ErrorCallback} from "./driver";

// HierarchicalPath
class GenusAreaHierpathDriver {

    count_ = 0; // プログレスバー用
    GIVE_UP_LINE_ = 100; // 100 行以上読んだら諦める

    constructor() {
    }

    isValidFloat(str: string) {
        return /^-?\d+(\.\d+)?$/.test(str.trim());
    }

    load(reader: FileReader, finishCallback: FinishCallback, progressCallback: ProgressCallback, errorCallback: ErrorCallback) {

        let tree = new FileNode();
        // ドットで繋がった部分は擬似ノードと見なすため，それの記録 ID->isPseudo
        let pseudoMap: Record<number, boolean> = {};    
        let nextID = 1;
        let lineNum = 0;
        let includeGenus = false;
        let isGenus_ = false;
        let curNodes = [];

        reader.onReadLine((line: string) => {
            lineNum++;

            if (lineNum > this.GIVE_UP_LINE_ && !isGenus_) {
                errorCallback("This file may not be a Genus area report file (hierarchical path).");
                return;
            }

            if (line.match(/Genus/)) {
                includeGenus = true;
            }
            if (!includeGenus) {
                return;
            }


            // 各行をスペースで分割して単語にする
            // 要素が6個かつ，5個目が数字のときのみ処理
            const result = line.match(/^(\s*)(\S.*)$/);
            if (!result) return []; // 入力が空の場合などの処理

            const leadingSpaces = result[1]; // 先頭のスペース
            const level = leadingSpaces.length / 2;

            const rest = result[2]; // 残りの部分
            const words = rest.split(/\s+/);    // 残りの部分をスペース区切りで分割

            let headLine = words.length == 5 && this.isValidFloat(words[4]) && level == 0;
            let remainingLine = words.length == 6 && this.isValidFloat(words[5]);
            if (!headLine && !remainingLine) { 
                return;
            }

            isGenus_ = true;
    
            const instance = words[0].trim();
            curNodes[level] = instance;
            const fullPath = curNodes.slice(0, level+1).join("/");
    
            const nodeNames = fullPath.split(/[\/]/);
            const nodeSize = headLine ? Number(words[4]) : Number(words[5]);    // Total Area
                
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

export default GenusAreaHierpathDriver;
