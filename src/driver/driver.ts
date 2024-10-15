type FinishCallback = (fileContext: FileContext, fileNode: FileNode|null) => void;
type ProgressCallback = (fileContext: FileContext, s: string) => void;
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

export { FileReader, FileNode, FileContext, FinishCallback, ProgressCallback, CloseHandler, ReadLineHandler};

