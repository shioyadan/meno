type FinishCallback = (fileContext: FileContext, fileNode: FileNode|null) => void;
type ProgressCallback = (fileContext: FileContext, s: string) => void;
type ReadLineHandler = (line: string) => void;
type CloseHandler = () => void;

// 生データをファイル的に読み込むためのプロクシ
class FileReader {
    readLineHandler_: ReadLineHandler|null = null;
    closeHandler_: CloseHandler|null = null;
    content_ = "";
    
    constructor(content: string) {
        this.content_ = content;
    }

    onReadLine(readLineHandler: ReadLineHandler) {
        this.readLineHandler_ = readLineHandler;
    }
    onClose(closeHandler: CloseHandler) {
        this.closeHandler_ = closeHandler;
    }
    
    load() {
        const lines = this.content_.trim().split("\n");
        // const lines = rawStr.trim().split("\n");
        for (let i of lines) {
            this.readLineHandler_?.(i);
        }
        this.closeHandler_?.();
    }
}


class FileNode {

    children: Record<string, FileNode>|null = {};
    parent: FileNode | null = null;
    key = "";  // ノードに対応するファイル名
    size = 0;
    fileCount = 1;
    isDirectory = false;
    id = -1;

    constructor() {
    }
}


class FileContext {
    count = 0;

    finishCallback: FinishCallback|null = null;
    progressCallback: ProgressCallback|null = null;

    searchingFileNum = 0;
    searchingDirNum = 1;
    runningReadDirNum = 0;
    runningLstatNum = 0;
    sleepNum = 0;
    tree: FileNode|null  = null;
    callCount = 0;
    mode = "";

    constructor() {
    }
}

class FileInfo {
    canceled = false;
    nextID_ = 1;
    constructor() {
    }

    get nextID() {
        return this.nextID_;
    }

    // キャンセル
    Cancel() {
        this.canceled = true;
    }

    // tree で渡されてくるツリーにおいて，
    // 各ディレクトリが含む合計サイズを計算して適用する
    finalizeTree_(context: FileContext, tree: FileNode) {
        if (context.count % (1024*4) == 0) {
            context.progressCallback?.(context, tree.key);
        }
        context.count += 1;

        let sizeAndCount = [0,0];
        for(let key in tree.children) {
            let val = tree.children[key];
            if (val.isDirectory && val.children) {
                let child = this.finalizeTree_(context, val);
                val.size = child[0];
                val.fileCount = child[1];
            }
            sizeAndCount[0] += val.size;
            sizeAndCount[1] += val.fileCount;
        }
        return sizeAndCount;
    };

    import(reader: FileReader, finishCallback: FinishCallback, progressCallback: ProgressCallback) {

        // 各ノードに id をふり，各ノードは自分の親の id をダンプする
        // id=0 は実際には存在しない仮のルートノードとなる
        let idToNodeMap: Record<number, FileNode> = {};
        idToNodeMap[0] = new FileNode();

        let lineNum = 1;
        let context = new FileContext;
        context.mode = "import";
        context.progressCallback = progressCallback;
        
        reader.onReadLine((line: string) => {
            let node = new FileNode();

            // process.stdout.write(`${id}\t${parent}\t${src.key}\t${src.isDirectory?1:0}\t${src.fileCount}\t${src.size}\n`);
            let args = line.split(/\t/);
            if (args.length != 6) {
                console.log(`invalid line: ${line}`);
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
                context.count = lineNum;
                progressCallback(context, node.key);
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

            let context = new FileContext();
            context.progressCallback = progressCallback;
            context.mode = "parsed";
            context.count = 0;
            progressCallback(context, root.key);

            setTimeout(() => {
                let sizeAndCount = this.finalizeTree_(context, root);
                root.size = sizeAndCount[0];
                root.fileCount = sizeAndCount[1];
    
                context.mode = "finalize";
                context.count = root.fileCount;
                progressCallback(context, root.key);
                finishCallback(context, root);
            }, 0);
        });
    }
};

function fileNodeToStr(fileNode: FileNode, isSizeMode: boolean) {
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


export { FileReader, FileInfo, FileNode, FileContext, fileNodeToStr };