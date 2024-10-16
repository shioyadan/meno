type FinishCallback = (fileNode: FileNode|null) => void;
type ErrorCallback = (error: boolean, errorMessage: string) => void;
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

export { FileReader, FileNode, FinishCallback, 
    ProgressCallback, ErrorCallback, CloseHandler, ReadLineHandler};

