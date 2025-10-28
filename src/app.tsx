import React, { useRef, useEffect, useState } from "react";
import Store, { ACTION, CHANGE } from "./store";

import {StatusBar, ToolBar, VersionDialog, ContextMenu, Breadcrumb} from "./ui_parts";
import TreeMapCanvas from "./tree_map_canvas";

import { Modal } from "react-bootstrap";


const App = () => {
    const storeRef = useRef(new Store());
    const [contextMenu, setContextMenu] = useState({
        show: false,
        x: 0,
        y: 0,
        targetNode: null as any
    });
    const divRef = useRef<HTMLDivElement>(null);

    useEffect(() => { // マウント時
        // もし埋め込みのデフォルトデータが存在する場合はそれを読み込む
        const data = (window as any).MENO_INITIAL_LOADING_DATA;
        if (data && data != "" && !data.includes("__MENO_INITIAL_LOADING_DATA_PLACE_HOLDER__")) {
            storeRef.current.trigger(ACTION.FILE_IMPORT, data);
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

    const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault(); // デフォルト動作を防止（ブラウザがファイルを開かないようにする）
    };

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        const file = event.dataTransfer.files[0]; // ドロップされた最初のファイルを取得
        if (!file) {
            // setError("No file dropped");
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            storeRef.current.trigger(ACTION.FILE_IMPORT, reader.result as string);   
        };
        reader.onerror = () => {
            // setError("Failed to read the file");
        };
        reader.readAsText(file); // ファイルをテキストとして読み込み
    };

    return (
        <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            ref={divRef}
        >
            {/* // flexDirection: "column" と flexGrow: 1 を使うことで，Canvas が画面いっぱいに広がるようにしている */}
            <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
                <ToolBar store={storeRef.current}/>
                <div style={{ flexGrow: 1, minHeight: 0, position: "relative" }}>
                    <TreeMapCanvas store={storeRef.current} onContextMenu={showContextMenu} />
                    <Breadcrumb store={storeRef.current} />
                </div>
                <StatusBar store={storeRef.current}/>
            </div>
            <VersionDialog store={storeRef.current}/>
            <ContextMenu 
                store={storeRef.current}
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
