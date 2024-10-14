import React, { useRef, useEffect, useState } from "react";
import Store, { ACTION, CHANGE } from "./store";

import {StatusBar, ToolBar, VersionDialog} from "./ui_parts";
import TreeMapCanvas from "./tree_map_canvas";

import { Modal } from "react-bootstrap";

let store = new Store();

const App = () => {
    useEffect(() => { // マウント時
        // もし埋め込みのデフォルトデータが存在する場合はそれを読み込む
        const data = (window as any).MENO_INITIAL_LOADING_DATA;
        if (data && data != "" && !data.includes("__MENO_INITIAL_LOADING_DATA_PLACE_HOLDER__")) {
            store.trigger(ACTION.FILE_IMPORT, data);
        }
    }, []);

    return (
        <div >
            {/* // flexDirection: "column" と flexGrow: 1 を使うことで，Canvas が画面いっぱいに広がるようにしている */}
            <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
                <ToolBar store={store}/>
                <div style={{ flexGrow: 1, minHeight: 0 }}>
                    <TreeMapCanvas store={store} />
                </div>
                <StatusBar store={store}/>
            </div>
            <VersionDialog store={store}/>
        </div>
    );
};

export default App;
