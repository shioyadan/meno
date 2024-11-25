import {Loader, FileReader, FileNode} from "./loader";
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
    FIT_TO_CANVAS,
    CHANGE_UI_THEME,
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
    FIT_TO_CANVAS,
    CHANGE_UI_THEME,
};

class Store {
    loader_: Loader;
    handlers_: { [key: number]: Array<(...args: any[]) => void> } = {};

    // レンダラ
    treeMapRenderer: TreeMapRenderer;
    tree: FileNode|null = null;

    // canvas におけるマウスポインタの位置
    pointedPath: string = "";
    pointedFileNode: FileNode|null = null;

    // UI color theme
    uiTheme = "dark";

    // Agate 由来で現在は使われていない
    isSizeMode = true;


    fileNodeToStr(fileNode: FileNode, isSizeMode: boolean) {
        return this.loader_ ? this.loader_.fileNodeToStr(fileNode, isSizeMode) : "";
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
                    this.trigger(CHANGE.TREE_LOADED);
                },
                (filePath)  => { // 読み込み状態の更新
                    // this.trigger(CHANGE.TREE_LOADING, this, context, filePath);       
                },
                (errorMessage) => { // error handler
                    fileReader.cancel();
                    this.tree = null;
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
        this.on(ACTION.FIT_TO_CANVAS, () => {this.trigger(CHANGE.FIT_TO_CANVAS);}); 
        this.on(ACTION.CHANGE_UI_THEME, (theme: string) => {
            this.uiTheme = theme;
            this.trigger(CHANGE.CHANGE_UI_THEME);
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
