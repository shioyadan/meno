import {Loader, FileReader, DataNode} from "./loader";
import type { FileReaderSource } from "./driver/driver";
import TreeMapRenderer from "./tree_map_renderer";
import {Settings} from "./settings";
import {SearchResults, searchTree} from "./search";

enum ACTION {
    TREE_LOAD,
    TREE_IMPORT,
    FOLDER_OPEN,
    FILE_IMPORT,
    CANVAS_RESIZED,
    CANVAS_POINTER_CHANGE,
    CANVAS_ZOOM_IN,
    CANVAS_ZOOM_OUT,
    MODE_CHANGE,
    DIALOG_VERSION_OPEN,
    DIALOG_HELP_OPEN,
    FIT_TO_CANVAS,
    CHANGE_UI_THEME,
    SET_ROOT_NODE,
    RESET_ROOT_NODE,
    SET_PARENT_AS_ROOT,
    SEARCH_NODES,
    CLEAR_SEARCH,
    SET_DATA_INDEX,
    ACTION_END, // 末尾
};

enum CHANGE {
    TREE_LOADED = ACTION.ACTION_END+1,
    TREE_LOADING,
    TREE_RELEASED,
    TREE_MODE_CHANGED,
    FOLDER_OPEN,
    FILE_IMPORT,
    FILE_LOADING_START,
    FILE_LOAD_PROGRESS,
    FILE_LOADING_END,
    CANVAS_ZOOM_IN,
    CANVAS_ZOOM_OUT,
    CANVAS_POINTER_CHANGED,
    DIALOG_VERSION_OPEN,
    DIALOG_HELP_OPEN,
    FIT_TO_CANVAS,
    CHANGE_UI_THEME,
    CHANGE_DATA_INDEX,
    ROOT_NODE_CHANGED,
    SEARCH_RESULTS_CHANGED,
    SEARCH_PROGRESS,
};

class Store {
    loader_: Loader;
    handlers_: { [key: number]: Array<(...args: any[]) => void> } = {};
    fileLoadId_ = 0;

    // レンダラ
    treeMapRenderer: TreeMapRenderer;
    tree: DataNode|null = null;
    originalTree: DataNode|null = null; // 元のツリーを保持
    currentRootNode: DataNode|null = null; // 現在のルートノード

    // canvas におけるマウスポインタの位置
    pointedPath: string = "";
    pointedFileNode: DataNode|null = null;

    // UI color theme
    get uiTheme() { return this.settings.uiTheme; }

    // 表示データのインデックス
    dataIndex = 0;
    fileLoadError: string|null = null;

    get itemNames(): string[] {
        return this.originalTree ? this.loader_.itemNames() : [];
    }

    // 検索機能
    searchQuery: string = "";
    searchResults = new SearchResults();
    searching = false;
    searchProgress: number|null = 0;
    searchError: string|null = null;
    private searchController_: AbortController|null = null;

    // アプリ設定
    settings = new Settings();
    saveSetting() {
        this.settings.save();
    };

    fileNodeToStr(fileNode: DataNode, dataIndex: number, detailed: boolean): string {
        return this.loader_ ? this.loader_.fileNodeToStr(fileNode, this.currentRootNode ? this.currentRootNode : fileNode, dataIndex, detailed) : "";
    }

    // パンくずリストのパス配列を取得
    getBreadcrumbPath(): DataNode[] {
        if (!this.currentRootNode || !this.originalTree) {
            return [];
        }

        const path: DataNode[] = [];
        let current: DataNode | null = this.currentRootNode;
        
        while (current) {
            path.unshift(current);
            current = current.parent;
        }

        return path;
    }

    releaseCurrentTree_() {
        this.searchController_?.abort();
        this.searchController_ = null;
        this.tree = null;
        this.originalTree = null;
        this.currentRootNode = null;
        this.pointedPath = "";
        this.pointedFileNode = null;
        this.fileLoadError = null;
        this.searchResults = new SearchResults();
        this.searching = false;
        this.searchProgress = 0;
        this.searchError = null;
        this.treeMapRenderer.clear();
        this.trigger(CHANGE.TREE_RELEASED);
    }

    importFile_(input: FileReaderSource) {
        const fileLoadId = ++this.fileLoadId_;
        this.dataIndex = 0; // デフォルトのデータインデックスを設定
        this.releaseCurrentTree_();
        this.trigger(CHANGE.FILE_LOADING_START);

        this.loader_.cancel(() => {
            if (fileLoadId !== this.fileLoadId_) return;
            this.startFileImport_(input, fileLoadId);
        });
    }

    startFileImport_(input: FileReaderSource, fileLoadId: number) {
        let fileReader = new FileReader(input);
        const isActiveLoad = () => this.fileLoadId_ === fileLoadId && !fileReader.isCanceled();

        this.loader_.load(
            fileReader,
            (tree) => { // finish handler
                if (!isActiveLoad()) return;
                this.trigger(CHANGE.FILE_LOADING_END);
                this.tree = tree;
                this.originalTree = tree; // 元のツリーを保存
                this.currentRootNode = tree; // 初期状態では元のツリーがルート
                this.trigger(ACTION.SEARCH_NODES, this.searchQuery); // 検索結果を更新
                this.trigger(CHANGE.TREE_LOADED);
            },
            (_filePath, progress)  => { // 読み込み状態の更新
                if (!isActiveLoad()) return;
                this.trigger(CHANGE.FILE_LOAD_PROGRESS, progress ?? 0);
                // this.trigger(CHANGE.TREE_LOADING, this, context, filePath);
            },
            (errorMessage) => { // error handler
                if (!isActiveLoad()) return;
                this.trigger(CHANGE.FILE_LOADING_END);
                fileReader.cancel();
                this.tree = null;
                this.originalTree = null;
                this.currentRootNode = null;
                this.fileLoadError = `Failed to load input: ${errorMessage}`;
                console.log(`error: ${errorMessage}`);
                this.trigger(CHANGE.TREE_LOADED);
            }
        );
    }

    constructor() {
        this.treeMapRenderer = new TreeMapRenderer();
        this.loader_ = new Loader();
        this.settings.load();

        this.on(ACTION.FILE_IMPORT, (input: FileReaderSource) => {
            this.importFile_(input);
        });

        this.on(ACTION.CANVAS_POINTER_CHANGE, (path, fileNode) => {
            this.pointedPath = path;
            this.pointedFileNode = fileNode;
            this.trigger(CHANGE.CANVAS_POINTER_CHANGED, this);       
        });

        this.on(ACTION.CANVAS_ZOOM_IN, () => { this.trigger(CHANGE.CANVAS_ZOOM_IN); });
        this.on(ACTION.CANVAS_ZOOM_OUT, () => { this.trigger(CHANGE.CANVAS_ZOOM_OUT); });
        this.on(ACTION.DIALOG_VERSION_OPEN, () => { this.trigger(CHANGE.DIALOG_VERSION_OPEN); });
        this.on(ACTION.DIALOG_HELP_OPEN, () => { this.trigger(CHANGE.DIALOG_HELP_OPEN); });
        this.on(ACTION.FIT_TO_CANVAS, () => {this.trigger(CHANGE.FIT_TO_CANVAS);}); 
        this.on(ACTION.CHANGE_UI_THEME, (theme: string) => {
            this.settings.uiTheme = theme;
            this.saveSetting();
            this.trigger(CHANGE.CHANGE_UI_THEME);
        });

        this.on(ACTION.SET_DATA_INDEX, (index: number) => {
            if (!this.tree || !Number.isInteger(index) || index < 0 || index >= this.itemNames.length || index === this.dataIndex) return;
            this.dataIndex = index;
            this.treeMapRenderer.clear();
            this.trigger(CHANGE.CHANGE_DATA_INDEX);
            this.startSearch_(this.searchQuery);
        });

        this.on(ACTION.SET_ROOT_NODE, (nodeToSetAsRoot: DataNode) => {
            if (nodeToSetAsRoot && nodeToSetAsRoot.children) {
                this.currentRootNode = nodeToSetAsRoot;
                this.tree = nodeToSetAsRoot;
                this.treeMapRenderer.clear(); // キャッシュをクリア
                this.startSearch_(this.searchQuery);
                this.trigger(CHANGE.ROOT_NODE_CHANGED);
            }
        });

        this.on(ACTION.RESET_ROOT_NODE, () => {
            this.currentRootNode = this.originalTree;
            this.tree = this.originalTree;
            this.treeMapRenderer.clear(); // キャッシュをクリア
            this.startSearch_(this.searchQuery);
            this.trigger(CHANGE.ROOT_NODE_CHANGED);
        });

        this.on(ACTION.SET_PARENT_AS_ROOT, () => {
            if (this.currentRootNode && this.currentRootNode.parent) {
                this.currentRootNode = this.currentRootNode.parent;
                this.tree = this.currentRootNode;
                this.treeMapRenderer.clear(); // キャッシュをクリア
                this.startSearch_(this.searchQuery);
                this.trigger(CHANGE.ROOT_NODE_CHANGED);
            }
        });

        this.on(ACTION.SEARCH_NODES, (query: string) => {
            this.startSearch_(query);
        });

        this.on(ACTION.CLEAR_SEARCH, () => {
            this.startSearch_("");
        });
    }

    private startSearch_(query: string) {
        this.searchController_?.abort();
        const controller = new AbortController();
        this.searchController_ = controller;
        this.searchQuery = query;
        this.searchResults = new SearchResults();
        this.searchError = null;
        this.searchProgress = 0;
        const tree = this.tree;
        this.searching = tree !== null && query.trim() !== "";
        this.trigger(CHANGE.SEARCH_RESULTS_CHANGED);
        if (!tree || !this.searching) return;

        searchTree(tree, query, controller.signal, progress => {
            if (controller.signal.aborted || this.searchController_ !== controller) return;
            this.searchProgress = progress;
            // 進捗だけの更新ではCanvasを再描画しない。
            this.trigger(CHANGE.SEARCH_PROGRESS);
        }, results => {
            if (controller.signal.aborted || this.searchController_ !== controller) return;
            this.searchResults = results;
            this.trigger(CHANGE.SEARCH_RESULTS_CHANGED);
        }, this.dataIndex).then(results => {
            if (!results || this.searchController_ !== controller) return;
            this.searchResults = results;
            this.searching = false;
            this.searchProgress = 1;
            this.searchController_ = null;
            this.trigger(CHANGE.SEARCH_RESULTS_CHANGED);
        }).catch(error => {
            if (this.searchController_ !== controller) return;
            console.error("Search failed:", error);
            this.searchResults = new SearchResults();
            this.searching = false;
            this.searchProgress = 0;
            this.searchError = "Search failed";
            this.searchController_ = null;
            this.trigger(CHANGE.SEARCH_RESULTS_CHANGED);
        });
    }

    on(event: CHANGE|ACTION, handler: (...args: any[]) => void): void {
        if (!(event in CHANGE || event in ACTION)) {
            console.log(`Unknown event ${event}`);
        }
        if (!(event in this.handlers_ )) {
            this.handlers_[event] = [];
        }
        this.handlers_[event].push(handler);
        // console.log(`on() is called {event: ${event}, handler: ${handler}}`);
    }
    
    off(event: CHANGE | ACTION, handler?: (...args: any[]) => void): void {
        if (!(event in CHANGE || event in ACTION)) {
            console.warn(`Unknown event ${event}`);
            return;
        }
        const list = this.handlers_[event];
        if (!list || list.length === 0) {
            return;
        }
        if (handler) {
            this.handlers_[event] = list.filter(h => h !== handler);
        } else {
            delete this.handlers_[event];
        }
    }
    trigger(event: CHANGE|ACTION, ...args: any[]) {
        if (!(event in CHANGE || event in ACTION)) {
            console.log(`Unknown event ${event}`);
        }
        if (event in this.handlers_) {
            let handlers = this.handlers_[event];
            for (let h of handlers) {
                h.apply(null, args);
            }
        }
    }
};

export default Store;
export { ACTION, CHANGE };
