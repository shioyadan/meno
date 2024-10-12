import React, { useRef, useEffect, useState } from "react";
import Store, { ACTION, CHANGE } from "./store";

import {StatusBar, ToolBar, VersionDialog} from "./ui_parts";
import TreeMapCanvas from "./tree_map_canvas";

import { Modal } from "react-bootstrap";

let store = new Store();

const App = () => {
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
