type FinishCallback = (fileNode: FileNode|null) => void;
type ErrorCallback = (errorMessage: string) => void;
type ProgressCallback = (s: string) => void;
type ReadLineHandler = (line: string) => void;
type CloseHandler = () => void;

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

    get hasChildren() {
        return this.children != null && Object.keys(this.children).length > 0;
    }
}

// 生データをファイル的に読み込むためのプロクシ
class FileReader {
    readLineHandler_: ReadLineHandler|null = null;
    closeHandler_: CloseHandler|null = null;
    content_ = "";
    cancel_ = false;
    
    constructor(content: string) {
        this.content_ = content;
    }

    clone() {
        return new FileReader(this.content_);
    }

    cancel() {
        this.cancel_ = true;
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
            if (this.cancel_) {
                break;
            }
            this.readLineHandler_?.(i);
        }
        if (!this.cancel_)
            this.closeHandler_?.();
    }
}

const fileNodeToStr = (fileNode: FileNode, isSizeMode: boolean, unit: string = "") => {
    // ルートノードを取得
    const getRoot = (n: FileNode) => {
        let cur = n;
        while (cur.parent && cur.parent.id !== -1) cur = cur.parent;
        return cur;
    };

    let str = "";
    const num = fileNode.size;
    if (num > 1000 * 1000 * 1000) {
        str = Math.ceil(num / 1000 / 1000 / 1000) + "G";
    } else if (num > 1000 * 1000) {
        str = Math.ceil(num / 1000 / 1000) + "M";
    } else if (num > 1000) {
        str = Math.ceil(num / 1000) + "K";
    } else {
        str = "" + num;
    }

    const root = getRoot(fileNode);
    const rootSize = root.size;
    const percentage =
        rootSize > 0 ? ((fileNode.size / rootSize) * 100).toFixed(2) : "0.00";

    return ` [${str} unit, ${percentage}%]`;
}


export { FileReader, FileNode, FinishCallback, 
    ProgressCallback, ErrorCallback, CloseHandler, ReadLineHandler, fileNodeToStr };

