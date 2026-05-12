import { FileReader, DataNode, FinishCallback, ProgressCallback, ErrorCallback, formatNumberCompact} from "./driver";

const NO_ID = -1;
const INITIAL_CAPACITY = 1024;
const DATA_SIZE = 0;
const DATA_COUNT = 1;
const DATA_IS_DIRECTORY = 2;

type ChildrenMeta = {
    proxy: Record<string, DataNode>;
    keys: string[];
    idByKey: Record<string, number>;
};

class CompactFileInfoNode {
    constructor(private store_: CompactFileInfoStore, private nodeId_: number) {
    }

    get children(): Record<string, DataNode>|null {
        return this.store_.getChildren(this.nodeId_);
    }

    set children(_value: Record<string, DataNode>|null) {
    }

    get parent(): DataNode|null {
        return this.store_.getParent(this.nodeId_);
    }

    set parent(_value: DataNode|null) {
    }

    get key(): string {
        return this.store_.getKey(this.nodeId_);
    }

    set key(value: string) {
        this.store_.setKey(this.nodeId_, value);
    }

    get fileCount(): number {
        return this.store_.getCount(this.nodeId_);
    }

    set fileCount(value: number) {
        this.store_.setCount(this.nodeId_, value);
    }

    get isDirectory(): boolean {
        return this.store_.isDirectory(this.nodeId_);
    }

    set isDirectory(value: boolean) {
        this.store_.setDirectory(this.nodeId_, value);
    }

    get id(): number {
        return this.nodeId_;
    }

    set id(_value: number) {
    }

    get data(): number[] {
        return this.store_.getData(this.nodeId_);
    }

    set data(value: number[]) {
        this.store_.setData(this.nodeId_, value);
    }

    get hasChildren(): boolean {
        return this.store_.hasChildren(this.nodeId_);
    }
}

// file_info dumps can contain millions of entries. Keeping every entry as a
// DataNode object plus a children object is much larger than the raw data, so
// this store keeps the tree in ArrayBuffer-backed typed arrays and exposes
// DataNode-compatible wrappers only when the UI actually touches a node.
class CompactFileInfoStore {
    private capacity_ = INITIAL_CAPACITY;
    private maxId_ = 0;
    private rootId_ = NO_ID;

    private parent_: Int32Array<ArrayBufferLike> = new Int32Array(this.capacity_);
    private firstChild_: Int32Array<ArrayBufferLike> = new Int32Array(this.capacity_);
    private lastChild_: Int32Array<ArrayBufferLike> = new Int32Array(this.capacity_);
    private nextSibling_: Int32Array<ArrayBufferLike> = new Int32Array(this.capacity_);
    private size_: Float64Array<ArrayBufferLike> = new Float64Array(this.capacity_);
    private count_: Float64Array<ArrayBufferLike> = new Float64Array(this.capacity_);
    private directory_: Uint8Array<ArrayBufferLike> = new Uint8Array(this.capacity_);
    private keys_: string[] = new Array(this.capacity_);

    private nodeCache_ = new Map<number, DataNode>();
    private dataCache_ = new Map<number, number[]>();
    private childrenCache_ = new Map<number, ChildrenMeta>();

    constructor() {
        this.parent_.fill(NO_ID);
        this.firstChild_.fill(NO_ID);
        this.lastChild_.fill(NO_ID);
        this.nextSibling_.fill(NO_ID);
        this.keys_[0] = "";
    }

    addNode(id: number, parentId: number, key: string, isDirectory: boolean, fileCount: number, size: number) {
        this.ensureCapacity_(Math.max(id, parentId));

        this.maxId_ = Math.max(this.maxId_, id);
        this.parent_[id] = parentId;
        this.firstChild_[id] = NO_ID;
        this.lastChild_[id] = NO_ID;
        this.nextSibling_[id] = NO_ID;
        this.size_[id] = size;
        this.count_[id] = fileCount;
        this.directory_[id] = isDirectory ? 1 : 0;
        this.keys_[id] = key;

        if (parentId === 0 && this.rootId_ === NO_ID) {
            this.rootId_ = id;
        }
        this.appendChild_(parentId, id);
    }

    finalize(progressCallback: ProgressCallback) {
        let count = 0;
        for (let id = this.maxId_; id >= 1; id--) {
            if (!this.exists_(id)) {
                continue;
            }

            if (this.directory_[id] !== 0 && this.firstChild_[id] !== NO_ID) {
                let size = 0;
                let fileCount = 0;
                for (let childId = this.firstChild_[id]; childId !== NO_ID; childId = this.nextSibling_[childId]) {
                    size += this.size_[childId];
                    fileCount += this.count_[childId];
                }
                this.size_[id] = size;
                this.count_[id] = fileCount;
            }

            if (count % (1024 * 4) === 0) {
                progressCallback?.(this.getKey(id));
            }
            count++;
        }

        if (this.rootId_ !== NO_ID && this.directory_[this.rootId_] !== 0 && this.firstChild_[this.rootId_] === NO_ID) {
            this.size_[this.rootId_] = 0;
            this.count_[this.rootId_] = 0;
        }
        this.dataCache_.clear();
    }

    getRoot(): DataNode|null {
        if (this.rootId_ === NO_ID) {
            return null;
        }
        return this.getNode_(this.rootId_);
    }

    getChildren(id: number): Record<string, DataNode>|null {
        if (this.firstChild_[id] === NO_ID) {
            return null;
        }

        let meta = this.childrenCache_.get(id);
        if (meta) {
            return meta.proxy;
        }

        const keys: string[] = [];
        const idByKey: Record<string, number> = Object.create(null);
        for (let childId = this.firstChild_[id]; childId !== NO_ID; childId = this.nextSibling_[childId]) {
            const key = this.getKey(childId);
            keys.push(key);
            idByKey[key] = childId;
        }

        // Existing code expects "children" to behave like Record<string, DataNode>
        // and uses Object.keys(), for-in, "in", and children[key]. A Proxy gives
        // that surface without materializing child DataNode wrappers up front.
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

        meta = { proxy, keys, idByKey };
        this.childrenCache_.set(id, meta);
        return proxy;
    }

    getParent(id: number): DataNode|null {
        const parentId = this.parent_[id];
        if (parentId <= 0 || !this.exists_(parentId)) {
            return null;
        }
        return this.getNode_(parentId);
    }

    getKey(id: number): string {
        return this.keys_[id] ?? "";
    }

    setKey(id: number, value: string) {
        this.keys_[id] = value;
    }

    getCount(id: number): number {
        return this.count_[id];
    }

    setCount(id: number, value: number) {
        this.count_[id] = value;
        this.dataCache_.delete(id);
    }

    isDirectory(id: number): boolean {
        return this.directory_[id] !== 0;
    }

    setDirectory(id: number, value: boolean) {
        this.directory_[id] = value ? 1 : 0;
        this.dataCache_.delete(id);
    }

    getData(id: number): number[] {
        let data = this.dataCache_.get(id);
        if (!data) {
            data = [this.size_[id], this.count_[id], this.directory_[id]];
            this.dataCache_.set(id, data);
        }
        return data;
    }

    setData(id: number, value: number[]) {
        this.size_[id] = value[DATA_SIZE] ?? 0;
        this.count_[id] = value[DATA_COUNT] ?? 0;
        this.directory_[id] = value[DATA_IS_DIRECTORY] ? 1 : 0;
        this.dataCache_.set(id, [this.size_[id], this.count_[id], this.directory_[id]]);
    }

    hasChildren(id: number): boolean {
        return this.firstChild_[id] !== NO_ID;
    }

    private getNode_(id: number): DataNode {
        let node = this.nodeCache_.get(id);
        if (!node) {
            node = new CompactFileInfoNode(this, id) as unknown as DataNode;
            this.nodeCache_.set(id, node);
        }
        return node;
    }

    private appendChild_(parentId: number, childId: number) {
        if (this.firstChild_[parentId] === NO_ID) {
            this.firstChild_[parentId] = childId;
            this.lastChild_[parentId] = childId;
        } else {
            this.nextSibling_[this.lastChild_[parentId]] = childId;
            this.lastChild_[parentId] = childId;
        }
    }

    private exists_(id: number): boolean {
        return id > 0 && id <= this.maxId_ && this.keys_[id] !== undefined;
    }

    private ensureCapacity_(id: number) {
        if (id < this.capacity_) {
            return;
        }

        let nextCapacity = this.capacity_;
        while (id >= nextCapacity) {
            nextCapacity *= 2;
        }

        const oldCapacity = this.capacity_;
        this.parent_ = this.growInt32_(this.parent_, nextCapacity, oldCapacity);
        this.firstChild_ = this.growInt32_(this.firstChild_, nextCapacity, oldCapacity);
        this.lastChild_ = this.growInt32_(this.lastChild_, nextCapacity, oldCapacity);
        this.nextSibling_ = this.growInt32_(this.nextSibling_, nextCapacity, oldCapacity);
        this.size_ = this.growFloat64_(this.size_, nextCapacity);
        this.count_ = this.growFloat64_(this.count_, nextCapacity);
        this.directory_ = this.growUint8_(this.directory_, nextCapacity);
        this.keys_.length = nextCapacity;
        this.capacity_ = nextCapacity;
    }

    private growInt32_(source: Int32Array, nextCapacity: number, oldCapacity: number): Int32Array {
        const next = new Int32Array(nextCapacity);
        next.set(source);
        next.fill(NO_ID, oldCapacity);
        return next;
    }

    private growFloat64_(source: Float64Array, nextCapacity: number): Float64Array {
        const next = new Float64Array(nextCapacity);
        next.set(source);
        return next;
    }

    private growUint8_(source: Uint8Array, nextCapacity: number): Uint8Array {
        const next = new Uint8Array(nextCapacity);
        next.set(source);
        return next;
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
            if (!Number.isInteger(id) || !Number.isInteger(parentID) || id <= 0 || parentID < 0) {
                errorCallback("This file may not be a file information file.");
                isFileInfo = false;
                return;
            }

            const key = args[2];
            const isDirectory = Number(args[3]) == 1;
            const fileCount = Number(args[4]);
            const size = Number(args[5]);
            store.addNode(id, parentID, key, isDirectory, fileCount, size);

            if (lineNum % (1024 * 128) == 0) {
                this.count = lineNum;
                progressCallback(key);
            }
            lineNum++;
        });

        reader.onClose(() => {
            if (!isFileInfo) {
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
                store.finalize(progressCallback);
    
                this.count = root.data[DATA_COUNT];
                progressCallback(root.key);
                finishCallback(root);
            }, 0);
        });
        reader.load();
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
