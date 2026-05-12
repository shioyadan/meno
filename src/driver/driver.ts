import { FileLineReader } from "../file_line_reader";

type FinishCallback = (fileNode: DataNode|null) => void;
type ErrorCallback = (errorMessage: string) => void;
type ProgressCallback = (s: string) => void;
type ReadLineHandler = (line: string) => void;
type CloseHandler = () => void;
type FileReadErrorHandler = (error: unknown) => void;
type FileReaderSource = string | File;

class DataNode {

    children: Record<string, DataNode>|null = {};
    parent: DataNode | null = null;
    key = "";  // ノードに対応するファイル名
    fileCount = 1;
    isDirectory = false;
    id = -1;

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
    errorHandler_: FileReadErrorHandler|null = null;
    content_: string|null = null;
    file_: File|null = null;
    lineReader_: FileLineReader|null = null;
    cancel_ = false;
    
    constructor(source: FileReaderSource) {
        if (typeof source === "string") {
            this.content_ = source;
        } else {
            this.file_ = source;
        }
    }

    clone() {
        return new FileReader(this.content_ ?? this.file_!);
    }

    cancel() {
        this.cancel_ = true;
        this.lineReader_?.cancel();
    }

    onReadLine(readLineHandler: ReadLineHandler) {
        this.readLineHandler_ = readLineHandler;
    }
    onClose(closeHandler: CloseHandler) {
        this.closeHandler_ = closeHandler;
    }
    onError(errorHandler: FileReadErrorHandler) {
        this.errorHandler_ = errorHandler;
    }
    
    private loadFromString_() {
        const content = (this.content_ ?? "").trim();
        let start = 0;
        while (!this.cancel_ && start < content.length) {
            let end = content.indexOf("\n", start);
            if (end === -1) {
                end = content.length;
            }
            let line = content.slice(start, end);
            if (line.endsWith("\r")) {
                line = line.slice(0, -1);
            }
            if (line.length > 0 || end < content.length) {
                this.readLineHandler_?.(line);
            }
            start = end + 1;
        }
        if (!this.cancel_) {
            this.closeHandler_?.();
        }
    }

    private async loadFromFile_() {
        if (!this.file_) {
            this.closeHandler_?.();
            return;
        }

        this.lineReader_ = new FileLineReader({ file: this.file_ });
        await this.lineReader_.load(
            (line) => {
                if (line.endsWith("\r")) {
                    line = line.slice(0, -1);
                }
                if (!this.cancel_) {
                    this.readLineHandler_?.(line);
                }
            },
            () => {
                if (!this.cancel_) {
                    this.closeHandler_?.();
                }
            },
            (error) => {
                console.error("Failed to read file:", error);
                if (!this.cancel_) {
                    this.cancel();
                    this.errorHandler_?.(error);
                }
            }
        );
    }

    load() {
        if (this.content_ !== null) {
            this.loadFromString_();
        } else {
            void this.loadFromFile_();
        }
    }
}

// ルートノードのサイズを取得
const getRootSize = (fileNode: DataNode): number => {
    let cur = fileNode;
    while (cur.parent && cur.parent.id !== -1) cur = cur.parent;
    return cur.data[0];
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

const fileNodeToStr = (fileNode: DataNode, rootNode: DataNode, dataIndex: number, unit: string = "") => {

    const rootSize = rootNode.data[dataIndex];
    const percentage =
        rootSize > 0 ? ((fileNode.data[dataIndex] / rootSize) * 100).toFixed(2) : "0.00";

    return ` [${formatNumberCompact(fileNode.data[dataIndex])} ${unit}, ${percentage}%]`;
}

// 祖先の重複を排除して合計サイズを出す
const calcDedupedTotalSize = (results: DataNode[] = [], dataIndex: number) => {
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
    return topLevel.reduce((acc, n) => acc + (n?.data[dataIndex] || 0), 0);
};

export { FileReader, DataNode, FinishCallback, 
    ProgressCallback, ErrorCallback, CloseHandler, ReadLineHandler, FileReadErrorHandler, fileNodeToStr, getRootSize, calcDedupedTotalSize, formatNumberCompact };
