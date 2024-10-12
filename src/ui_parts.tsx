import React, { useRef, useEffect, useState } from "react";
import Store, { ACTION, CHANGE } from "./store";
import { FileNode, fileNodeToStr } from "./file_info";


import {Nav, Navbar, NavDropdown, Form, FormControl} from "react-bootstrap";
import { Modal } from "react-bootstrap";

const ToolBar = (props: {store: Store;}) => {
    let store = props.store;

    const openFile = async () => {
        // ファイルを読み込む
        const [fileHandle] = await (window as any).showOpenFilePicker();
        const file = await fileHandle.getFile();
        const contents = await file.text();
        
        console.log(contents); // ファイル内容を表示
    }

    const Dispatch = (selectedKey: string|null) => {
        switch (selectedKey) {
            case "zoom-in": store.trigger(ACTION.CANVAS_ZOOM_IN); break;
            case "zoom-out": store.trigger(ACTION.CANVAS_ZOOM_OUT); break;
            case "version":  store.trigger(ACTION.DIALOG_VERSION_OPEN); break;
            case "import":
                openFile();
                break;
        }
    };
    return (
        <Navbar variant="dark" expand={true} style={{ backgroundColor: "#272a31" }}>
            <Navbar.Toggle aria-controls="responsive-navbar-nav" />
            <Navbar.Collapse id="responsive-navbar-nav">
            <Nav onSelect={Dispatch}>
                <NavDropdown menuVariant="dark" title={<i className="bi bi-list"></i>} id="collapsible-nav-dropdown">
                    <NavDropdown.Item eventKey="import">
                        Import file
                    </NavDropdown.Item>
                    <NavDropdown.Item eventKey="version">
                        Version information
                    </NavDropdown.Item>
                </NavDropdown>
            </Nav>
            <Nav onSelect={Dispatch}
                style={{ color: "#C9CACB" }} className="me-auto" // このクラスでリンクが左側に配置される
            >
                <Nav.Link className="nav-link tool-bar-link" eventKey="zoom-in">
                    <i className="bi bi-zoom-in"></i> Zoom In                
                </Nav.Link>
                <Nav.Link className="nav-link tool-bar-link" eventKey="zoom-out">                    
                    <i className="bi bi-zoom-out"></i> Zoom Out                
                </Nav.Link>
            </Nav>
            </Navbar.Collapse>
        </Navbar>
    );
};

const StatusBar = (props: {store: Store;}) => {
    const [statusBarMessage, setStatusBarMessage] = useState("");
    let store = props.store;

    useEffect(() => { // マウント時
        store.on(CHANGE.CANVAS_POINTER_CHANGED, () => {
            if (!store.pointedPath || !store.pointedFileNode) { return;}
            setStatusBarMessage(store.pointedPath + fileNodeToStr(store.pointedFileNode, store.isSizeMode));
        });
    }, []);

    return (
        // {/* <div style={{ height: "40px", backgroundColor: "#eee", padding: "10px", textAlign: "left", borderTop: "1px solid #ccc" }}>
        //     <span>{statusBarMessage}</span> */}
        <div style={{ height: "30px", minHeight: "30px", 
            backgroundColor: "#272a31", 
            paddingLeft: "10px", 
            textAlign: "left", borderTop: "0.5px solid #383B41" }}
        >
            <span style={{ color: "#C9CACB", fontSize: "15px" }}>{statusBarMessage}</span>
        </div>
    );
};

const VersionDialog = (props: {store: Store;}) => {
    const [show, setShow] = useState(false);
    const handleClose = () => {setShow(false)};
    
    useEffect(() => { // マウント時
        props.store.on(CHANGE.DIALOG_VERSION_OPEN, () => {setShow(true)});
    }, []);
    
    return (
        <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
            <Modal.Title>Version Information</Modal.Title>
        </Modal.Header>  
        <Modal.Body>Meno Version 0.0</Modal.Body>             
        </Modal>
    );
};

export {ToolBar, StatusBar, VersionDialog};
