import { FileReader, DataNode, SearchVisit, FinishCallback, ProgressCallback, ErrorCallback, formatNumberCompact} from "./driver";

const NO_ID = -1;
const NODE_PAGE_BITS = 18;
const NODE_PAGE_SIZE = 1 << NODE_PAGE_BITS;
const KEY_PAGE_BITS = 20;
const KEY_PAGE_SIZE = 1 << KEY_PAGE_BITS;
const DATA_COUNT = 1;
const MAX_KEY_POOL_OFFSET = 0x7fffffff;
const MAX_KEY_LENGTH = 0xffff;
const MAX_KEY_INTERN_CHARS = 128;
const MAX_KEY_INTERN_ENTRIES = 256 * 1024;

type KeyRef = {
    offset: number;
    length: number;
};

type FileInfoPage = {
    parent: Int32Array<ArrayBufferLike>;
    firstChild: Int32Array<ArrayBufferLike>;
    lastChild: Int32Array<ArrayBufferLike>|null;
    nextSibling: Int32Array<ArrayBufferLike>;
    size: Float64Array<ArrayBufferLike>;
    count: Uint32Array<ArrayBufferLike>;
    directory: Uint8Array<ArrayBufferLike>;
    keyOffset: Int32Array<ArrayBufferLike>;
    keyLength: Uint16Array<ArrayBufferLike>;
};

// 読み込み後のツリーは不変なので、UIには参照用のプロパティだけを公開する。
class CompactFileInfoNode implements DataNode {
    constructor(private store_: CompactFileInfoStore, private nodeId_: number) {
    }

    get children(): Record<string, DataNode>|null {
        return this.store_.getChildren(this.nodeId_);
    }

    get parent(): DataNode|null {
        return this.store_.getParent(this.nodeId_);
    }

    get key(): string {
        return this.store_.getKey(this.nodeId_);
    }

    get fileCount(): number {
        return this.store_.getCount(this.nodeId_);
    }

    get isDirectory(): boolean {
        return this.store_.isDirectory(this.nodeId_);
    }

    get id(): number {
        return this.nodeId_;
    }

    get data(): number[] {
        return this.store_.getData(this.nodeId_);
    }

    get hasChildren(): boolean {
        return this.store_.hasChildren(this.nodeId_);
    }

    walkForSearch(dataIndex = 0): Generator<SearchVisit> {
        return this.store_.walkForSearch(this.nodeId_, dataIndex);
    }

    get searchNodeCount(): number|null {
        return this.store_.getSearchNodeCount(this.nodeId_);
    }
}

// 数百万ノードをDataNodeとchildren辞書で保持しないよう、木を型付き配列へ保存する。
// DataNode互換のwrapperはUIがアクセスしたノードだけに生成する。
class CompactFileInfoStore {
    private maxId_ = 0;
    private rootId_ = NO_ID;
    private nodeCount_: number|null = null;

    private pages_: FileInfoPage[] = [];
    private keyPages_: Uint8Array<ArrayBufferLike>[] = [];
    private keyBytesSize_ = 0;
    private keyIntern_ = new Map<string, KeyRef>();
    private textEncoder_ = new TextEncoder();
    private textDecoder_ = new TextDecoder("utf-8");

    private nodeCache_ = new Map<number, DataNode>();
    private dataCache_ = new Map<number, number[]>();
    private childrenCache_ = new Map<number, Record<string, DataNode>>();

    addNode(id: number, parentId: number, key: string, isDirectory: boolean, fileCount: number, size: number) {
        this.ensurePage_(Math.max(id, parentId));

        this.maxId_ = Math.max(this.maxId_, id);
        const page = this.getPage_(id);
        const index = this.nodeIndex_(id);
        page.parent[index] = parentId;
        page.firstChild[index] = NO_ID;
        if (page.lastChild) {
            page.lastChild[index] = NO_ID;
        }
        page.nextSibling[index] = NO_ID;
        page.size[index] = size;
        page.count[index] = fileCount;
        page.directory[index] = isDirectory ? 1 : 0;
        this.setKeyBytes_(id, key);

        if (parentId === 0 && this.rootId_ === NO_ID) {
            this.rootId_ = id;
        }
        this.appendChild_(parentId, id);
    }

    finalize(progressCallback: ProgressCallback) {
        let count = 0;
        for (let id = this.maxId_; id >= 1; id--) {
            const page = this.getPage_(id);
            const index = this.nodeIndex_(id);
            if (page.keyOffset[index] === NO_ID) {
                continue;
            }

            const firstChild = page.firstChild[index];
            if (page.directory[index] !== 0 && firstChild !== NO_ID) {
                let size = 0;
                let fileCount = 0;
                for (let childId = firstChild; childId !== NO_ID;) {
                    const childPage = this.getPage_(childId);
                    const childIndex = this.nodeIndex_(childId);
                    size += childPage.size[childIndex];
                    fileCount += childPage.count[childIndex];
                    childId = childPage.nextSibling[childIndex];
                }
                page.size[index] = size;
                page.count[index] = fileCount;
            }

            if (count % (1024 * 4) === 0) {
                progressCallback?.(this.getKey(id));
            }
            count++;
        }

        if (this.rootId_ !== NO_ID) {
            const rootPage = this.getPage_(this.rootId_);
            const rootIndex = this.nodeIndex_(this.rootId_);
            if (rootPage.directory[rootIndex] !== 0 && rootPage.firstChild[rootIndex] === NO_ID) {
                rootPage.size[rootIndex] = 0;
                rootPage.count[rootIndex] = 0;
            }
        }
        this.releaseLastChild_();
        // 重複排除用の文字列索引は読み込み時だけ必要。ノードはバイト列への参照を保持する。
        this.keyIntern_.clear();
        this.dataCache_.clear();
        this.nodeCount_ = count;
    }

    getSearchNodeCount(id: number): number|null {
        return id === this.rootId_ ? this.nodeCount_ : null;
    }

    getRoot(): DataNode|null {
        if (this.rootId_ === NO_ID) {
            return null;
        }
        return this.getNode_(this.rootId_);
    }

    getChildren(id: number): Record<string, DataNode>|null {
        const firstChild = this.getFirstChildId_(id);
        if (firstChild === NO_ID) {
            return null;
        }

        const cached = this.childrenCache_.get(id);
        if (cached) {
            return cached;
        }

        const keys: string[] = [];
        const idByKey: Record<string, number> = Object.create(null);
        for (let childId = firstChild; childId !== NO_ID; childId = this.getNextSiblingId_(childId)) {
            const key = this.getKey(childId);
            keys.push(key);
            idByKey[key] = childId;
        }

        // 子のwrapperを先に生成せず、Object.keys・for-in・in・children[key]に対応する。
        const proxy = new Proxy(Object.create(null) as Record<string, DataNode>, {
            get: (_target, prop) => {
                if (typeof prop !== "string") {
                    return undefined;
                }
                if (Object.prototype.hasOwnProperty.call(idByKey, prop)) {
                    return this.getNode_(idByKey[prop]);
                }
                return undefined;
            },
            has: (_target, prop) => {
                return typeof prop === "string" && Object.prototype.hasOwnProperty.call(idByKey, prop);
            },
            ownKeys: () => keys,
            getOwnPropertyDescriptor: (_target, prop) => {
                if (typeof prop === "string" && Object.prototype.hasOwnProperty.call(idByKey, prop)) {
                    return {
                        enumerable: true,
                        configurable: true,
                    };
                }
                return undefined;
            },
        });

        this.childrenCache_.set(id, proxy);
        return proxy;
    }

    getParent(id: number): DataNode|null {
        const parentId = this.getParentId_(id);
        if (parentId <= 0 || !this.exists_(parentId)) {
            return null;
        }
        return this.getNode_(parentId);
    }

    getKey(id: number): string {
        const page = this.getPage_(id);
        const index = this.nodeIndex_(id);
        const offset = page.keyOffset[index];
        if (offset === NO_ID) {
            return "";
        }

        const length = page.keyLength[index];
        if (length === 0) {
            return "";
        }

        const pageIndex = Math.floor(offset / KEY_PAGE_SIZE);
        const pageOffset = offset % KEY_PAGE_SIZE;
        const keyPage = this.keyPages_[pageIndex];
        if (keyPage && pageOffset + length <= KEY_PAGE_SIZE) {
            return this.textDecoder_.decode(keyPage.subarray(pageOffset, pageOffset + length));
        }

        const bytes = new Uint8Array(length);
        this.copyKeyBytes_(offset, bytes);
        return this.textDecoder_.decode(bytes);
    }

    getCount(id: number): number {
        const page = this.getPage_(id);
        return page.count[this.nodeIndex_(id)];
    }

    isDirectory(id: number): boolean {
        const page = this.getPage_(id);
        return page.directory[this.nodeIndex_(id)] !== 0;
    }

    getData(id: number): number[] {
        let data = this.dataCache_.get(id);
        if (!data) {
            const page = this.getPage_(id);
            const index = this.nodeIndex_(id);
            data = [page.size[index], page.count[index], page.directory[index]];
            this.dataCache_.set(id, data);
        }
        return data;
    }

    hasChildren(id: number): boolean {
        return this.getFirstChildId_(id) !== NO_ID;
    }

    *walkForSearch(rootId: number, dataIndex: number): Generator<SearchVisit> {
        // 検索だけで全ノードのwrapperやchildren辞書を実体化しない。
        let id = rootId;
        let entering = true;
        while (true) {
            if (entering) {
                const page = this.getPage_(id);
                const values = dataIndex === DATA_COUNT ? page.count : page.size;
                yield { entering: true, id, key: this.getKey(id), size: values[this.nodeIndex_(id)] };
                const child = this.getFirstChildId_(id);
                if (child !== NO_ID) {
                    id = child;
                    continue;
                }
            }

            yield { entering: false, id };
            if (id === rootId) return;
            const sibling = this.getNextSiblingId_(id);
            if (sibling !== NO_ID) {
                id = sibling;
                entering = true;
            } else {
                id = this.getParentId_(id);
                entering = false;
            }
        }
    }

    private getNode_(id: number): DataNode {
        let node = this.nodeCache_.get(id);
        if (!node) {
            node = new CompactFileInfoNode(this, id);
            this.nodeCache_.set(id, node);
        }
        return node;
    }

    private appendChild_(parentId: number, childId: number) {
        const parentPage = this.getPage_(parentId);
        const parentIndex = this.nodeIndex_(parentId);
        const lastChild = parentPage.lastChild;
        if (!lastChild) {
            throw new Error("file_info tree was already finalized.");
        }

        if (parentPage.firstChild[parentIndex] === NO_ID) {
            parentPage.firstChild[parentIndex] = childId;
            lastChild[parentIndex] = childId;
        } else {
            const lastChildId = lastChild[parentIndex];
            const lastChildPage = this.getPage_(lastChildId);
            lastChildPage.nextSibling[this.nodeIndex_(lastChildId)] = childId;
            lastChild[parentIndex] = childId;
        }
    }

    private exists_(id: number): boolean {
        if (id <= 0 || id > this.maxId_) {
            return false;
        }

        const page = this.getPage_(id);
        return page.keyOffset[this.nodeIndex_(id)] !== NO_ID;
    }

    private getParentId_(id: number): number {
        const page = this.getPage_(id);
        return page.parent[this.nodeIndex_(id)];
    }

    private getFirstChildId_(id: number): number {
        const page = this.getPage_(id);
        return page.firstChild[this.nodeIndex_(id)];
    }

    private getNextSiblingId_(id: number): number {
        const page = this.getPage_(id);
        return page.nextSibling[this.nodeIndex_(id)];
    }

    private getPage_(id: number): FileInfoPage {
        return this.pages_[this.pageIndex_(id)];
    }

    private ensurePage_(id: number): void {
        const pageIndex = this.pageIndex_(id);
        while (pageIndex >= this.pages_.length) {
            this.pages_.push(this.createPage_());
        }
    }

    private createPage_(): FileInfoPage {
        const page: FileInfoPage = {
            parent: new Int32Array(NODE_PAGE_SIZE),
            firstChild: new Int32Array(NODE_PAGE_SIZE),
            lastChild: new Int32Array(NODE_PAGE_SIZE),
            nextSibling: new Int32Array(NODE_PAGE_SIZE),
            size: new Float64Array(NODE_PAGE_SIZE),
            count: new Uint32Array(NODE_PAGE_SIZE),
            directory: new Uint8Array(NODE_PAGE_SIZE),
            keyOffset: new Int32Array(NODE_PAGE_SIZE),
            keyLength: new Uint16Array(NODE_PAGE_SIZE),
        };
        page.parent.fill(NO_ID);
        page.firstChild.fill(NO_ID);
        page.lastChild!.fill(NO_ID);
        page.nextSibling.fill(NO_ID);
        page.keyOffset.fill(NO_ID);
        return page;
    }

    private releaseLastChild_() {
        // lastChildは追加中だけ必要。nextSibling確定後は各ページの配列を解放する。
        for (const page of this.pages_) {
            page.lastChild = null;
        }
    }

    private pageIndex_(id: number): number {
        return Math.floor(id / NODE_PAGE_SIZE);
    }

    private nodeIndex_(id: number): number {
        return id % NODE_PAGE_SIZE;
    }

    private setKeyBytes_(id: number, value: string) {
        if (this.shouldInternKey_(value)) {
            const cached = this.keyIntern_.get(value);
            if (cached) {
                this.setKeyRef_(id, cached);
                return;
            }
        }

        const bytes = this.textEncoder_.encode(value);

        if (bytes.length > MAX_KEY_LENGTH) {
            throw new Error("file_info key is too long.");
        }
        if (this.keyBytesSize_ + bytes.length > MAX_KEY_POOL_OFFSET) {
            throw new Error("file_info key byte pool is too large.");
        }

        const offset = this.keyBytesSize_;
        this.writeKeyBytes_(offset, bytes);
        const ref = { offset, length: bytes.length };
        this.setKeyRef_(id, ref);
        this.keyBytesSize_ += bytes.length;

        if (this.shouldInternKey_(value)) {
            this.rememberKey_(value, ref);
        }
    }

    private setKeyRef_(id: number, ref: KeyRef) {
        const page = this.getPage_(id);
        const index = this.nodeIndex_(id);
        page.keyOffset[index] = ref.offset;
        page.keyLength[index] = ref.length;
    }

    private shouldInternKey_(value: string): boolean {
        return value.length <= MAX_KEY_INTERN_CHARS;
    }

    private rememberKey_(value: string, ref: KeyRef) {
        // 索引を消しても既存ノードの参照は有効なので、読み込み中の索引サイズを制限できる。
        if (this.keyIntern_.size >= MAX_KEY_INTERN_ENTRIES) {
            this.keyIntern_.clear();
        }
        this.keyIntern_.set(value, ref);
    }

    private writeKeyBytes_(offset: number, bytes: Uint8Array) {
        let srcOffset = 0;
        let dstOffset = offset;

        // 巨大なバイト列を再確保・コピーせずに拡張できるよう、固定長のページへ保存する。
        while (srcOffset < bytes.length) {
            const pageIndex = Math.floor(dstOffset / KEY_PAGE_SIZE);
            const pageOffset = dstOffset % KEY_PAGE_SIZE;
            this.ensureKeyPage_(pageIndex);

            const page = this.keyPages_[pageIndex];
            const length = Math.min(bytes.length - srcOffset, KEY_PAGE_SIZE - pageOffset);
            page.set(bytes.subarray(srcOffset, srcOffset + length), pageOffset);
            srcOffset += length;
            dstOffset += length;
        }
    }

    private copyKeyBytes_(offset: number, dest: Uint8Array) {
        let destOffset = 0;
        let srcOffset = offset;

        while (destOffset < dest.length) {
            const pageIndex = Math.floor(srcOffset / KEY_PAGE_SIZE);
            const pageOffset = srcOffset % KEY_PAGE_SIZE;
            const page = this.keyPages_[pageIndex];
            if (!page) {
                break;
            }

            const length = Math.min(dest.length - destOffset, KEY_PAGE_SIZE - pageOffset);
            dest.set(page.subarray(pageOffset, pageOffset + length), destOffset);
            destOffset += length;
            srcOffset += length;
        }
    }

    private ensureKeyPage_(pageIndex: number) {
        while (pageIndex >= this.keyPages_.length) {
            this.keyPages_.push(new Uint8Array(KEY_PAGE_SIZE));
        }
    }
}

class FileInfoDriver {

    count = 0;

    constructor() {
    }

    load(reader: FileReader, finishCallback: FinishCallback, progressCallback: ProgressCallback, errorCallback: ErrorCallback) {
        const store = new CompactFileInfoStore();

        let lineNum = 1;
        let isFileInfo = true;
        
        reader.onReadLine((line: string) => {
            if (!isFileInfo) {
                return;
            }

            const args = line.split(/\t/);
            if (args.length != 6) {
                errorCallback("This file may not be a file information file.");
                isFileInfo = false;
                return;
            }

            const id = Number(args[0]);
            const parentID = Number(args[1]);
            const key = this.decodeKey_(args[2]);
            const directoryValue = Number(args[3]);
            const fileCount = Number(args[4]);
            const size = Number(args[5]);
            if (
                !Number.isInteger(id) ||
                !Number.isInteger(parentID) ||
                id <= 0 ||
                parentID < 0 ||
                key === null ||
                (directoryValue !== 0 && directoryValue !== 1) ||
                !Number.isFinite(fileCount) ||
                !Number.isFinite(size)
            ) {
                errorCallback("This file may not be a file information file.");
                isFileInfo = false;
                return;
            }

            store.addNode(id, parentID, key, directoryValue === 1, fileCount, size);

            if (lineNum % (1024 * 128) == 0) {
                this.count = lineNum;
                progressCallback(key);
            }
            lineNum++;
        });

        reader.onClose(() => {
            if (!isFileInfo || reader.isCanceled()) {
                return;
            }

            const root = store.getRoot();
            if (!root) {
                errorCallback("This file may not be a file information file.");
                return;
            }

            this.count = 0;
            progressCallback(root.key);

            setTimeout(() => {
                if (reader.isCanceled()) {
                    return;
                }

                store.finalize(progressCallback);
    
                if (reader.isCanceled()) {
                    return;
                }

                this.count = root.data[DATA_COUNT];
                progressCallback(root.key);
                finishCallback(root);
            }, 0);
        });
        reader.load();
    }

    private decodeKey_(encodedKey: string): string|null {
        try {
            const key = JSON.parse(`"${encodedKey}"`);
            return typeof key === "string" ? key : null;
        } catch {
            return null;
        }
    }

    fileNodeToStr(fileNode: DataNode, rootNode: DataNode, dataIndex: number, detailed: boolean) {
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

        const rootSize = rootNode.data[dataIndex];
        const percentage =
            rootSize > 0 ? ((fileNode.data[dataIndex] / rootSize) * 100).toFixed(2) : "0.00";

        const fmt = formatNumberCompact;
        if (detailed) {
            return ` [size: ${str}${dataIndex === 0 ? ` (${percentage}%)` : ""}, count: ${fmt(fileNode.data[1])}${dataIndex === DATA_COUNT ? ` (${percentage}%)` : ""}]`;
        } else {
            return ` [${dataIndex === DATA_COUNT ? `${fmt(fileNode.data[1])} items` : str} (${percentage}%)]`;
        }
        
    }

    itemNames() {
        return ["size", "count"];
    }
};

export default FileInfoDriver;
