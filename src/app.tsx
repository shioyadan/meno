import React, { useRef, useEffect, useState } from "react";
import Store, { ACTION, CHANGE } from "./store";

import {StatusBar, ToolBar, VersionDialog, ContextMenu, Breadcrumb} from "./ui_parts";
import TreeMapCanvas from "./tree_map_canvas";

import { Modal } from "react-bootstrap";

let store = new Store();

const App = () => {
    const [contextMenu, setContextMenu] = useState({
        show: false,
        x: 0,
        y: 0,
        targetNode: null as any
    });

    useEffect(() => { // マウント時
        // もし埋め込みのデフォルトデータが存在する場合はそれを読み込む
        const data = (window as any).MENO_INITIAL_LOADING_DATA;
        if (data && data != "" && !data.includes("__MENO_INITIAL_LOADING_DATA_PLACE_HOLDER__")) {
            store.trigger(ACTION.FILE_IMPORT, data);
        }

        // コンテキストメニューを閉じるためのクリックリスナー
        const handleClickOutside = () => {
            setContextMenu(prev => ({ ...prev, show: false }));
        };

        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    const showContextMenu = (x: number, y: number, targetNode: any) => {
        setContextMenu({
            show: true,
            x,
            y,
            targetNode
        });
    };

    const hideContextMenu = () => {
        setContextMenu(prev => ({ ...prev, show: false }));
    };

    return (
        <div >
            {/* // flexDirection: "column" と flexGrow: 1 を使うことで，Canvas が画面いっぱいに広がるようにしている */}
            <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
                <ToolBar store={store}/>
                <div style={{ flexGrow: 1, minHeight: 0, position: "relative" }}>
                    <TreeMapCanvas store={store} onContextMenu={showContextMenu} />
                    <Breadcrumb store={store} />
                </div>
                <StatusBar store={store}/>
            </div>
            <VersionDialog store={store}/>
            <ContextMenu 
                store={store}
                show={contextMenu.show}
                x={contextMenu.x}
                y={contextMenu.y}
                targetNode={contextMenu.targetNode}
                onClose={hideContextMenu}
            />
        </div>
    );
};

export default App;
