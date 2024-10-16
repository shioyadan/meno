import { FileReader, FileNode, FinishCallback, ProgressCallback, ErrorCallback} from "./driver";

class FileInfoDriver {

    count = 0;

    constructor() {
    }

    // tree で渡されてくるツリーにおいて，
    // 各ディレクトリが含む合計サイズを計算して適用する
    finalizeTree_(tree: FileNode, progressCallback: ProgressCallback) {
        if (this.count % (1024*4) == 0) {
            progressCallback?.(tree.key);
        }
        this.count += 1;

        let sizeAndCount = [0,0];
        for(let key in tree.children) {
            let val = tree.children[key];
            if (val.isDirectory && val.children) {
                let child = this.finalizeTree_(val, progressCallback);
                val.size = child[0];
                val.fileCount = child[1];
            }
            sizeAndCount[0] += val.size;
            sizeAndCount[1] += val.fileCount;
        }
        return sizeAndCount;
    };

    load(reader: FileReader, finishCallback: FinishCallback, progressCallback: ProgressCallback, errorCallback: ErrorCallback) {

        // 各ノードに id をふり，各ノードは自分の親の id をダンプする
        // id=0 は実際には存在しない仮のルートノードとなる
        let idToNodeMap: Record<number, FileNode> = {};
        idToNodeMap[0] = new FileNode();

        let lineNum = 1;
        let mode = "import";
        
        reader.onReadLine((line: string) => {
            let node = new FileNode();

            // process.stdout.write(`${id}\t${parent}\t${src.key}\t${src.isDirectory?1:0}\t${src.fileCount}\t${src.size}\n`);
            let args = line.split(/\t/);
            if (args.length != 6) {
                // console.log(`invalid line: ${line}`);
                errorCallback("This files may not be file info file.");
                return;
            }

            let id = Number(args[0]);
            let parentID = Number(args[1]);

            idToNodeMap[id] = node;
            node.key = args[2];
            node.isDirectory = Number(args[3]) == 1 ? true : false;
            node.fileCount = Number(args[4])
            node.size = Number(args[5]);
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
                root.size = sizeAndCount[0];
                root.fileCount = sizeAndCount[1];
    
                mode = "finalize";
                this.count = root.fileCount;
                progressCallback(root.key);
                finishCallback(root);
            }, 0);
        });
        reader.load();
    }

    fileNodeToStr(fileNode: FileNode, isSizeMode: boolean) {
        let str = "";
        let num = isSizeMode ? fileNode.size : fileNode.fileCount;
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
        str += isSizeMode ? "B" : " files";
    
        if (isSizeMode && num == 1) {
            return "";
        }
        else {
            return " [" + str + "]";
        }
    }
};

export default FileInfoDriver;
