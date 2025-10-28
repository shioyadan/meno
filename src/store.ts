import {Loader, FileReader, DataNode} from "./loader";
import TreeMapRenderer from "./tree_map_renderer";

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
    ACTION_END, // 末尾
};

enum CHANGE {
    TREE_LOADED = ACTION.ACTION_END+1,
    TREE_LOADING,
    TREE_RELEASED,
    TREE_MODE_CHANGED,
    FOLDER_OPEN,
    FILE_IMPORT,
    CANVAS_ZOOM_IN,
    CANVAS_ZOOM_OUT,
    CANVAS_POINTER_CHANGED,
    DIALOG_VERSION_OPEN,
    DIALOG_HELP_OPEN,
    FIT_TO_CANVAS,
    CHANGE_UI_THEME,
    ROOT_NODE_CHANGED,
    SEARCH_RESULTS_CHANGED,
};

class Store {
    loader_: Loader;
    handlers_: { [key: number]: Array<(...args: any[]) => void> } = {};

    // レンダラ
    treeMapRenderer: TreeMapRenderer;
    tree: DataNode|null = null;
    originalTree: DataNode|null = null; // 元のツリーを保持
    currentRootNode: DataNode|null = null; // 現在のルートノード

    // canvas におけるマウスポインタの位置
    pointedPath: string = "";
    pointedFileNode: DataNode|null = null;

    // UI color theme
    uiTheme = "dark";

    // Agate 由来で現在は使われていない
    isSizeMode = true;

    // 検索機能
    searchQuery: string = "";
    searchResults: DataNode[] = [];


    fileNodeToStr(fileNode: DataNode, isSizeMode: boolean, detailed: boolean): string {
        return this.loader_ ? this.loader_.fileNodeToStr(fileNode, this.currentRootNode ? this.currentRootNode : fileNode, isSizeMode, detailed) : "";
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

    constructor() {
        this.treeMapRenderer = new TreeMapRenderer();
        this.loader_ = new Loader();

        this.on(ACTION.FILE_IMPORT, (inputStr: string) => {
            let fileReader = new FileReader(inputStr);

            this.treeMapRenderer.clear();
            this.loader_.load(
                fileReader, 
                (tree) => { // finish handler
                    this.tree = tree;
                    this.originalTree = tree; // 元のツリーを保存
                    this.currentRootNode = tree; // 初期状態では元のツリーがルート
                    this.trigger(CHANGE.TREE_LOADED);
                },
                (filePath)  => { // 読み込み状態の更新
                    // this.trigger(CHANGE.TREE_LOADING, this, context, filePath);       
                },
                (errorMessage) => { // error handler
                    fileReader.cancel();
                    this.tree = null;
                    this.originalTree = null;
                    this.currentRootNode = null;
                    console.log(`error: ${errorMessage}`);
                    this.trigger(CHANGE.TREE_LOADED);
                }
            );
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
            this.uiTheme = theme;
            this.trigger(CHANGE.CHANGE_UI_THEME);
        });

        this.on(ACTION.SET_ROOT_NODE, (nodeToSetAsRoot: DataNode) => {
            if (nodeToSetAsRoot && nodeToSetAsRoot.children) {
                this.currentRootNode = nodeToSetAsRoot;
                this.tree = nodeToSetAsRoot;
                this.treeMapRenderer.clear(); // キャッシュをクリア
                this.trigger(CHANGE.ROOT_NODE_CHANGED);
            }
        });

        this.on(ACTION.RESET_ROOT_NODE, () => {
            this.currentRootNode = this.originalTree;
            this.tree = this.originalTree;
            this.treeMapRenderer.clear(); // キャッシュをクリア
            this.trigger(CHANGE.ROOT_NODE_CHANGED);
        });

        this.on(ACTION.SET_PARENT_AS_ROOT, () => {
            if (this.currentRootNode && this.currentRootNode.parent) {
                this.currentRootNode = this.currentRootNode.parent;
                this.tree = this.currentRootNode;
                this.treeMapRenderer.clear(); // キャッシュをクリア
                this.trigger(CHANGE.ROOT_NODE_CHANGED);
            }
        });

        this.on(ACTION.SEARCH_NODES, (query: string) => {
            this.searchQuery = query;
            this.searchResults = this.searchNodesByName(query);
            this.trigger(CHANGE.SEARCH_RESULTS_CHANGED);
        });

        this.on(ACTION.CLEAR_SEARCH, () => {
            this.searchQuery = "";
            this.searchResults = [];
            this.trigger(CHANGE.SEARCH_RESULTS_CHANGED);
        });
    }

    // ノード名で検索する関数
    searchNodesByName(query: string): DataNode[] {
        if (!this.tree || !query.trim()) {
            return [];
        }

        const results: DataNode[] = [];
        const searchTerm = query.toLowerCase();

        const searchRecursive = (node: DataNode) => {
            if (node.key.toLowerCase().includes(searchTerm)) {
                results.push(node);
            }

            if (node.children) {
                for (const childKey in node.children) {
                    searchRecursive(node.children[childKey]);
                }
            }
        };

        searchRecursive(this.tree);
        return results;
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
