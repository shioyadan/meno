import { FileReader, DataNode, FinishCallback, ProgressCallback, ErrorCallback, fileNodeToStr } from "./driver";

// HierarchicalPath
class GenusAreaHierpathDriver {

    count_ = 0; // プログレスバー用
    GIVE_UP_LINE_ = 100; // 100 行以上読んだら諦める

    constructor() {
    }

    isValidFloat(str: string) {
        return /^-?\d+(\.\d+)?$/.test(str.trim());
    }

    // ハイフンじゃなくてスペースの場合があるので結合
    concatHeaderTokens(tokens: string[]): string[] {
        const target = new Set(["Cell-Count", "Cell-Area", "Net-Area", "Total-Area"]);
        const result: string[] = [];
        for (let i = 0; i < tokens.length;) {
            const pair = tokens.slice(i, i + 2).join("-");
            if (target.has(pair)) {
                result.push(pair);
                i += 2;
            } else {
                result.push(tokens[i]);
                i++;
            }
        }
        return result;
    }
    

    load(reader: FileReader, finishCallback: FinishCallback, progressCallback: ProgressCallback, errorCallback: ErrorCallback) {

        let tree = new DataNode();
        // ドットで繋がった部分は擬似ノードと見なすため，それの記録 ID->isPseudo
        let pseudoMap: Record<number, boolean> = {};    
        let nextID = 1;
        let lineNum = 0;
        let curNodes = [];

        // パースの状態
        let includeGenusMark = false;   // "Genus" という文字列が含まれているか
        let isGenus_ = false;           // Genus と判断
        let detectGenusHeader = false;  // Genus のヘッダを検出したかどうか
        let totalAreaCol = -1;
        let headerColNum = -1; // header の列の個数
        
        reader.onReadLine((line: string) => {
            lineNum++;

            if (lineNum > this.GIVE_UP_LINE_ && !isGenus_) {
                errorCallback("This file may not be a Genus area report file (hierarchical path).");
                return;
            }

            // Genus のヘッダを検出
            if (line.match(/Genus/)) {
                includeGenusMark = true;
            }
            if (!includeGenusMark) {
                return;
            }

            // Instance Module という行があれば，それ以降はレポート
            let headWords = line.trim().split(/\s+/);
            headWords = this.concatHeaderTokens(headWords);
            if (headWords[0] == "Instance" && headWords[1] == "Module") {
                detectGenusHeader = true;
                // "Total-Area" の列を探す
                for (let i = 0; i < headWords.length; i++) {
                    if (headWords[i] == "Total-Area") {
                        totalAreaCol = i;
                        break;
                    }
                }
                headerColNum = headWords.length;
                return;
            }
            if (!detectGenusHeader || totalAreaCol == -1) {
                return;
            }

            // 先頭の空白と，それ以降の非空白にわける
            const preWords = line.match(/^(\s*)(\S.*)$/);
            if (!preWords) return []; // 入力が空の場合などの処理
            const leadingSpaces = preWords[1]; // 先頭のスペース
            const level = leadingSpaces.length / 2; // インデントのレベル

            const rest = preWords[2]; // 残りの部分
            const words = rest.split(/\s+/);    // 残りの部分をスペース区切りで分割
            if (words.length < 3) {
                return; // トークンが3つより少ない場合は無効
            }

            let curLineTotalAreaCol = totalAreaCol;
            if (level == 0) {   
                // 先頭行だけ Module の部分が空の時がある(=[1]が数値）ので，その場合は1列ずらす
                if (words.length == headerColNum - 1) { 
                    curLineTotalAreaCol--;
                }
            }

            // totalAreaCol が見つからない場合は無視する
            if (curLineTotalAreaCol >= words.length || !this.isValidFloat(words[curLineTotalAreaCol])) {
                return;
            }

            // Genus で確定
            isGenus_ = true;

            const instance = words[0].trim();
            curNodes[level] = instance;
            const fullPath = curNodes.slice(0, level+1).join("/");
    
            const nodeNames = fullPath.split(/[\/]/);
            const nodeSize = Number(words[curLineTotalAreaCol]);    // Total Area
                
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
            node.data[0] = nodeSize;
        });

        reader.onClose(() => {
            function finalize(node: DataNode) {
                // 各ノードが子供全員のサイズを含んでいるので，子供分を引いていく
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
                    // node.size -= size;
                    let remainingSize = node.data[0] - size;
                    if (node.children && Object.keys(node.children).length != 0 && remainingSize > 0) {
                        let n = new DataNode();
                        n.data[0] = remainingSize;
                        n.key = "others";
                        n.parent = node;
                        n.id = nextID;
                        node.children["others"] = n;
                        nextID++;
                    }
                    return orgSize;
                }

            }
            if (isGenus_) {
                finalize(tree);
                finishCallback(tree.children ? tree.children[Object.keys(tree.children)[0]] : null);
            }
            else {
                errorCallback("This file may not be a Genus area report file (hierarchical path).");
            }
        });

        reader.load();
    }

    fileNodeToStr(fileNode: DataNode, rootNode: DataNode, dataIndex: number, detailed: boolean) {
        return fileNodeToStr(fileNode, rootNode, dataIndex);
    }
};

export default GenusAreaHierpathDriver;
