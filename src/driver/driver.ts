import { FileLineReader } from "../file_line_reader";

type FinishCallback = (fileNode: DataNode|null) => void;
type ErrorCallback = (errorMessage: string) => void;
type ProgressCallback = (s: string, progress?: number) => void;
type ReadLineHandler = (line: string) => void;
type CloseHandler = () => void;
type FileReadErrorHandler = (error: unknown) => void;
type FileReaderSource = string | File;

const EMBEDDED_FILE_NAME = "embedded.log";
const TEXT_STREAM_CHUNK_SIZE = 1024 * 1024;

type SearchVisit =
    | { entering: true; id: number; key: string; size: number }
    | { entering: false; id: number };

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

    *walkForSearch(): Generator<SearchVisit> {
        function* children(node: DataNode): Generator<DataNode> {
            for (const key in node.children) {
                yield node.children[key];
            }
        }

        // 深い階層でも再帰スタックを使わず、各ノードの入退場で中断できる。
        const stack = [{ node: this as DataNode, children: children(this) }];
        yield { entering: true, id: this.id, key: this.key, size: this.data[0] ?? 0 };
        while (stack.length) {
            const frame = stack[stack.length - 1];
            const child = frame.children.next();
            if (child.done) {
                stack.pop();
                yield { entering: false, id: frame.node.id };
            } else {
                const node = child.value;
                stack.push({ node, children: children(node) });
                yield { entering: true, id: node.id, key: node.key, size: node.data[0] ?? 0 };
            }
        }
    }
}

const isWhitespace = (char: string): boolean => /\s/.test(char);

// 以前の埋め込みデータ読み込みは text.trim() してから行分割していたため、
// stream 化しても先頭末尾の空白を落とす挙動はここで維持する。
const getTrimBounds = (text: string): { start: number, end: number } => {
    let start = 0;
    let end = text.length;
    while (start < end && isWhitespace(text[start])) start++;
    while (end > start && isWhitespace(text[end - 1])) end--;
    return { start, end };
};

// embed.sh が HTML に埋め込むデータは、起動時点では巨大な string として存在する。
// その string 自体の保持は避けられないが、ここで ReadableStream に変換しておくと、
// FileReader 側に生テキスト専用の行分割経路を持たずに済み、通常の File 入力と同じ
// FileLineReader の backpressure/cancel/error 処理を使える。
const createTextStream = (text: string): { stream: ReadableStream<Uint8Array>, size: number } => {
    const { start, end } = getTrimBounds(text);
    const encoder = new TextEncoder();
    let offset = start;

    return {
        stream: new ReadableStream<Uint8Array>({
            pull(controller) {
                if (offset >= end) {
                    controller.close();
                    return;
                }

                let chunkEnd = Math.min(offset + TEXT_STREAM_CHUNK_SIZE, end);
                if (chunkEnd < end) {
                    // TextEncoder に渡すチャンク境界で surrogate pair を分断しない。
                    // 分断すると非 ASCII 文字が置換文字に化ける可能性がある。
                    const lastCode = text.charCodeAt(chunkEnd - 1);
                    if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
                        chunkEnd--;
                    }
                }

                controller.enqueue(encoder.encode(text.slice(offset, chunkEnd)));
                offset = chunkEnd;
            },
            cancel() {
                offset = end;
            },
        }),
        size: end - start,
    };
};

// 生データをファイル的に読み込むためのプロクシ
class FileReader {
    readLineHandler_: ReadLineHandler|null = null;
    closeHandler_: CloseHandler|null = null;
    errorHandler_: FileReadErrorHandler|null = null;
    source_: FileReaderSource;
    lineReader_: FileLineReader|null = null;
    cancel_ = false;
    
    constructor(source: FileReaderSource) {
        this.source_ = source;
    }

    clone() {
        return new FileReader(this.source_);
    }

    cancel(onCanceled?: () => void) {
        this.cancel_ = true;
        this.clearHandlers_();
        const lineReader = this.lineReader_;
        this.lineReader_ = null;
        if (lineReader) {
            lineReader.cancel(onCanceled);
        } else {
            onCanceled?.();
        }
    }

    getProgress(): number {
        return this.lineReader_?.getProgress() ?? 0;
    }

    isCanceled(): boolean {
        return this.cancel_;
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

    private clearHandlers_() {
        this.readLineHandler_ = null;
        this.closeHandler_ = null;
        this.errorHandler_ = null;
    }

    private createLineReader_(): FileLineReader {
        if (typeof this.source_ === "string") {
            // 埋め込み入力も擬似的なファイル stream として扱う。
            // zstd 判定は fileName ベースなので、通常ログ名にして圧縮入力とは区別する。
            const { stream, size } = createTextStream(this.source_);
            return new FileLineReader({
                stream,
                fileName: EMBEDDED_FILE_NAME,
                fileSize: size,
            });
        }

        return new FileLineReader({ file: this.source_ });
    }

    private async loadFromSource_() {
        this.lineReader_ = this.createLineReader_();
        try {
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
                        this.errorHandler_?.(error);
                        this.cancel();
                    }
                }
            );
        } finally {
            this.clearHandlers_();
        }
    }

    load() {
        if (this.cancel_) return;
        this.loadFromSource_().catch((error) => {
            console.error("Failed to read file:", error);
            if (!this.cancel_) {
                this.errorHandler_?.(error);
                this.cancel();
            }
        });
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

export { FileReader, DataNode, SearchVisit, FinishCallback,
    ProgressCallback, ErrorCallback, CloseHandler, ReadLineHandler, FileReadErrorHandler, fileNodeToStr, getRootSize, calcDedupedTotalSize, formatNumberCompact };
