import React, { useRef, useEffect, useState } from "react";
import Store, { ACTION, CHANGE } from "./store";
import TreeMapCanvas from "./tree_map_canvas";
import { FileNode } from "./file_info";

let store = new Store();


const App = () => {
    const [statusBarMessage, setStatusBarMessage] = useState("");

    store.on(CHANGE.CANVAS_POINTER_CHANGED, function(store){
        let path = store.pointedPath;
        let fileNode = store.pointedFileNode;
        if (!path) {
            return;
        }
    
        function fileNodeToStr(fileNode: FileNode, isSizeMode: boolean) {
            let str = "";
            let num = isSizeMode ? fileNode.size : fileNode.fileCount;
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
            str += isSizeMode ? "B" : " files";
    
            if (isSizeMode && num == 1) {
                return "";
            }
            else {
                return " [" + str + "]";
            }
        }
        setStatusBarMessage(path + fileNodeToStr(fileNode, store.isSizeMode));
    });

    return (
        // flexDirection: "column" と flexGrow: 1 を使うことで，Canvas が画面いっぱいに広がるようにしている
        <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
            <div style={{ flexGrow: 1 }}>
                <TreeMapCanvas store={store} />
            </div>
            <div style={{ height: "40px", backgroundColor: "#eee", padding: "10px", textAlign: "left", borderTop: "1px solid #ccc" }}>
                <span>{statusBarMessage}</span>
            </div>
        </div>
    );
};

export default App;
