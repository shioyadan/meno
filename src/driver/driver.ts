type FinishCallback = (fileNode: DataNode|null) => void;
type ErrorCallback = (errorMessage: string) => void;
type ProgressCallback = (s: string) => void;
type ReadLineHandler = (line: string) => void;
type CloseHandler = () => void;

class DataNode {

    children: Record<string, DataNode>|null = {};
    parent: DataNode | null = null;
    key = "";  // ノードに対応するファイル名
    fileCount = 1;
    isDirectory = false;
    id = -1;

    get size() {
        return this.data[0];
    }
    set size(s: number) {
        this.data[0] = s;
    }
    data: number[] = [0]; 

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

// ルートノードのサイズを取得
const getRootSize = (fileNode: DataNode): number => {
    let cur = fileNode;
    while (cur.parent && cur.parent.id !== -1) cur = cur.parent;
    return cur.size;
};

const formatNumberCompact = (num: number): string => {
    let str = "";
    if (num > 1000 * 1000 * 1000) {
        str = (num / 1000 / 1000 / 1000).toFixed(2) + "G";
    } else if (num > 1000 * 1000) {
        str = (num / 1000 / 1000).toFixed(2) + "M";
    } else if (num > 1000) {
        str = (num / 1000).toFixed(2) + "K";
    } else {
        str = "" + num;
    }
    return str;
}

const fileNodeToStr = (fileNode: DataNode, rootNode: DataNode, isSizeMode: boolean, unit: string = "") => {

    const rootSize = rootNode.size;
    const percentage =
        rootSize > 0 ? ((fileNode.size / rootSize) * 100).toFixed(2) : "0.00";

    return ` [${formatNumberCompact(fileNode.size)} ${unit}, ${percentage}%]`;
}

// 祖先の重複を排除して合計サイズを出す
const calcDedupedTotalSize = (results: DataNode[] = []) => {
    if (!results.length) return 0;
    const idSet = new Set<number>(results.map(n => n?.id));
    // 祖先がヒットしていない最上位ノードのみを残す
    const topLevel = results.filter(n => {
        let p = n?.parent;
        while (p) {
            if (idSet.has(p.id)) return false; // 親(祖先)がヒットしている → 除外
            p = p.parent;
        }
        return true;
    });
    return topLevel.reduce((acc, n) => acc + (n?.size || 0), 0);
};

export { FileReader, DataNode, FinishCallback, 
    ProgressCallback, ErrorCallback, CloseHandler, ReadLineHandler, fileNodeToStr, getRootSize, calcDedupedTotalSize, formatNumberCompact };

