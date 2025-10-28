import { FileReader, DataNode, FinishCallback, ProgressCallback, ErrorCallback, formatNumberCompact} from "./driver";

class FileInfoDriver {

    count = 0;

    constructor() {
    }

    // tree で渡されてくるツリーにおいて，
    // 各ディレクトリが含む合計サイズを計算して適用する
    finalizeTree_(tree: DataNode, progressCallback: ProgressCallback) {
        if (this.count % (1024*4) == 0) {
            progressCallback?.(tree.key);
        }
        this.count += 1;

        let sizeAndCount = [0,0];
        for(let key in tree.children) {
            let val = tree.children[key];
            if (val.data[2] != 0 && val.children) {
                let child = this.finalizeTree_(val, progressCallback);
                val.data[0] = child[0];
                val.data[1] = child[1];
            }
            sizeAndCount[0] += val.data[0];
            sizeAndCount[1] += val.data[1];
        }
        return sizeAndCount;
    };

    load(reader: FileReader, finishCallback: FinishCallback, progressCallback: ProgressCallback, errorCallback: ErrorCallback) {

        // 各ノードに id をふり，各ノードは自分の親の id をダンプする
        // id=0 は実際には存在しない仮のルートノードとなる
        let idToNodeMap: Record<number, DataNode> = {};
        idToNodeMap[0] = new DataNode();

        let lineNum = 1;
        let mode = "import";
        let isFileInfo = true;
        
        reader.onReadLine((line: string) => {
            let node = new DataNode();
            node.data = [0, 0, 0]; // size, count, isDirectory

            // process.stdout.write(`${id}\t${parent}\t${src.key}\t${src.isDirectory?1:0}\t${src.fileCount}\t${src.size}\n`);
            let args = line.split(/\t/);
            if (args.length != 6) {
                // console.log(`invalid line: ${line}`);
                errorCallback("This file may not be a file information file.");
                isFileInfo = false;
                return;
            }

            let id = Number(args[0]);
            let parentID = Number(args[1]);

            idToNodeMap[id] = node;
            node.key = args[2];
            node.data[2] = Number(args[3]) == 1 ? 1 : 0;    // isDirectory
            node.data[1] = Number(args[4])
            node.data[0] = Number(args[5]);
            node.children = null;   // 子供がない場合は null に

            // 親 -> 子の接続
            if (parentID in idToNodeMap) {
                let parentNode = idToNodeMap[parentID];
                node.parent = parentNode;
                if (!parentNode.children) {
                    parentNode.children = {};
                }
                parentNode.children[node.key] = node;
            }
            else {
                console.log(`Invalid parent id: ${parentID}`);
            }

            if (lineNum % (1024 * 128) == 0) {
                this.count = lineNum;
                progressCallback(node.key);
            }
            lineNum++;
        });

        reader.onClose(() => {
            if (!isFileInfo) {
                return;
            }

            let root = idToNodeMap[0];
            if (idToNodeMap[0].children) {
                // id=0 は実際には存在しないルートのノードなので，取り除く
                let keys = Object.keys(idToNodeMap[0].children);
                root = idToNodeMap[0].children[keys[0]];
                root.parent = null;
            }

            mode = "parsed";
            this.count = 0;
            progressCallback(root.key);

            setTimeout(() => {
                let sizeAndCount = this.finalizeTree_(root, progressCallback);
                root.data[0] = sizeAndCount[0];
                root.data[1] = sizeAndCount[1];
    
                mode = "finalize";
                this.count = root.data[1];
                progressCallback(root.key);
                finishCallback(root);
            }, 0);
        });
        reader.load();
    }

    fileNodeToStr(fileNode: DataNode, rootNode: DataNode, isSizeMode: boolean, detailed: boolean) {
        let str = "";
        let num = fileNode.data[0];
        if (num > 1024*1024*1024) {
            str = "" + Math.ceil(num/1024/1024/1024) + "G";
        }
        else if (num > 1024*1024) {
            str = "" + Math.ceil(num/1024/1024) + "M";
        }
        else if (num > 1024) {
            str = "" + Math.ceil(num/1024) + "K";
        }
        else {
            str = "" + num;
        }
        str += "B";

        const rootSize = rootNode.data[0];
        const percentage =
            rootSize > 0 ? ((fileNode.data[0] / rootSize) * 100).toFixed(2) : "0.00";

        const fmt = formatNumberCompact;
        if (detailed) {
            return ` [size: ${str} (${percentage}%), count: ${fmt(fileNode.data[1])}]`;
        } else {
            return ` [${str} (${percentage}%)]`;
        }
        
    }

    itemNames() {
        return ["size", "count"];
    }
};

export default FileInfoDriver;
