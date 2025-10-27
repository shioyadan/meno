import React, { useRef, useEffect, useState } from "react";
import Store, { ACTION, CHANGE } from "./store";
import { FileNode } from "./loader";


import {Nav, Navbar, NavDropdown, Form, FormControl, InputGroup, Button, Dropdown} from "react-bootstrap";
import { Modal } from "react-bootstrap";

const ToolBar = (props: {store: Store;}) => {
    let store = props.store;
    const [searchQuery, setSearchQuery] = useState("");
    const searchInputRef = useRef<HTMLInputElement>(null);

    const openFile = async () => {
        if (typeof (window as any).showOpenFilePicker !== 'function') {
            console.log("showOpenFilePicker is not supported");
            return;
        }
        
        // ファイルを読み込む
        const [fileHandle] = await (window as any).showOpenFilePicker();
        const file = await fileHandle.getFile();
        const contents = await file.text();
        store.trigger(ACTION.FILE_IMPORT, contents);   
        // console.log(contents); // ファイル内容を表示
    };

    // 検索処理
    const handleSearch = (query: string) => {
        setSearchQuery(query);
        if (query.trim()) {
            store.trigger(ACTION.SEARCH_NODES, query);
        } else {
            store.trigger(ACTION.CLEAR_SEARCH);
        }
    };

    const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const query = e.target.value;
        handleSearch(query);
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape') {
            setSearchQuery("");
            store.trigger(ACTION.CLEAR_SEARCH);
            searchInputRef.current?.blur();
        }
    };

    const handleSearchClear = () => {
        setSearchQuery("");
        store.trigger(ACTION.CLEAR_SEARCH);
    };

    // メニューアイテムの選択時の処理
    const dispatch = (selectedKey: string|null, event: React.SyntheticEvent<unknown>) => {
        event.preventDefault();    // ページ遷移を防ぐ
        switch (selectedKey) {
            case "zoom-in": store.trigger(ACTION.CANVAS_ZOOM_IN); break;
            case "zoom-out": store.trigger(ACTION.CANVAS_ZOOM_OUT); break;
            case "version":  store.trigger(ACTION.DIALOG_VERSION_OPEN); break;
            case "fit":  store.trigger(ACTION.FIT_TO_CANVAS); break;
            case "import": openFile(); break;
            case "set-dark": store.trigger(ACTION.CHANGE_UI_THEME, "dark"); break;
            case "set-light": store.trigger(ACTION.CHANGE_UI_THEME, "light"); break;
        }
        setSelectedKey(0);
    };
    const [selectedKey, setSelectedKey] = useState(0);

    const [theme, setTheme] = useState(store.uiTheme); // 現在のテーマを管理
    // 画面幅に応じてコンパクト表示（サーチ以外をドロップダウン内に集約）
    const [isCompact, setIsCompact] = useState<boolean>(() => {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
        return window.matchMedia("(max-width: 576px)").matches; // Bootstrap sm 未満
    });

    useEffect(() => { // マウント時
        store.on(CHANGE.CHANGE_UI_THEME, () => {
            setTheme(store.uiTheme);
        });

        // キーボードショートカットのイベントリスナーを追加
        const handleKeydown = (event: KeyboardEvent) => {
            // / キーが押されたときに検索ボックスにフォーカス
            if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) {
                // input要素やtextarea要素にフォーカスがある場合は無視
                const activeElement = document.activeElement;
                if (activeElement && (
                    activeElement.tagName === 'INPUT' || 
                    activeElement.tagName === 'TEXTAREA' ||
                    (activeElement as HTMLElement).contentEditable === 'true'
                )) {
                    return;
                }
                
                event.preventDefault();
                searchInputRef.current?.focus();
            }
        };

        document.addEventListener('keydown', handleKeydown);

        // 画面幅監視（sm 未満でコンパクト表示）
        let mql: MediaQueryList | null = null;
        const setupMql = () => {
            if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
                mql = window.matchMedia("(max-width: 576px)");
                const listener = (e: MediaQueryListEvent) => setIsCompact(e.matches);
                // Safari 14 対応のため addEventListener と addListener 両対応
                if (typeof mql.addEventListener === "function") {
                    mql.addEventListener("change", listener);
                } else if (typeof (mql as any).addListener === "function") {
                    (mql as any).addListener(listener);
                }
            }
        };
        setupMql();

        // クリーンアップ
        return () => {
            document.removeEventListener('keydown', handleKeydown);
            if (mql) {
                const listener = (e: MediaQueryListEvent) => setIsCompact(e.matches);
                if (typeof mql.removeEventListener === "function") {
                    mql.removeEventListener("change", listener);
                } else if (typeof (mql as any).removeListener === "function") {
                    (mql as any).removeListener(listener);
                }
            }
        };
    }, []);

    const renderMenuDropdown = () => (
        <Nav onSelect={dispatch} activeKey={selectedKey}>
            <NavDropdown menuVariant={theme} title={<i className="bi bi-list"></i>} id="collapsible-nav-dropdown">
                <NavDropdown.Item eventKey="import">
                    Import file
                </NavDropdown.Item>
                <NavDropdown.Divider />
                <NavDropdown.Item eventKey="set-dark" active={theme === "dark"}>
                    {theme === "dark" && <i className="bi bi-check"></i>} Dark
                </NavDropdown.Item>
                <NavDropdown.Item eventKey="set-light" active={theme === "light"}>
                    {theme === "light" && <i className="bi bi-check"></i>} Light
                </NavDropdown.Item>
                <NavDropdown.Divider />
                {/* コンパクト時はズーム関連もドロップダウンに格納 */}
                {isCompact && (
                    <>
                        <NavDropdown.Item eventKey="zoom-in">
                            <i className="bi bi-zoom-in"></i> Zoom In
                        </NavDropdown.Item>
                        <NavDropdown.Item eventKey="zoom-out">
                            <i className="bi bi-zoom-out"></i> Zoom Out
                        </NavDropdown.Item>
                        <NavDropdown.Item eventKey="fit">
                            <i className="bi bi-arrows-fullscreen"></i> Fit
                        </NavDropdown.Item>
                        <NavDropdown.Divider />
                    </>
                )}
                <NavDropdown.Item eventKey="version">
                    Version information
                </NavDropdown.Item>
            </NavDropdown>
        </Nav>
    );

    const renderZoomLinks = () => (
        <Nav onSelect={dispatch} activeKey={selectedKey}
            style={{ color: theme == "dark" ? "#C9CACB" : "#ffffff" }} className="me-auto" // このクラスでリンクが左側に配置される
        >
            <Nav.Link className="nav-link tool-bar-link" eventKey="zoom-in">
                <i className="bi bi-zoom-in"></i> Zoom In                
            </Nav.Link>
            <Nav.Link className="nav-link tool-bar-link" eventKey="zoom-out">
                <i className="bi bi-zoom-out"></i> Zoom Out                
            </Nav.Link>
            <Nav.Link className="nav-link tool-bar-link" eventKey="fit">
                <i className="bi bi-arrows-fullscreen"></i> Fit
            </Nav.Link>
        </Nav>
    );

    const renderSearchBox = () => (
        // 検索ボックス
        <Nav className="ms-auto">
            <div style={{ paddingRight: "8px" }}>
                <InputGroup size="sm" style={{ width: "250px" }}>
                    <FormControl
                        className={`search-input ${theme === "dark" ? "dark" : "light"}`}
                        ref={searchInputRef}
                        placeholder="Search nodes... (Press '/' to focus)"
                        value={searchQuery}
                        onChange={handleSearchInputChange}
                        onKeyDown={handleSearchKeyDown}
                    />
                    {searchQuery && (
                        <Button 
                            variant="outline-secondary" 
                            size="sm"
                            onClick={handleSearchClear}
                            className={`search-clear ${theme === "dark" ? "is-dark" : "is-light"}`}
                        >
                            <i className="bi bi-x"></i>
                        </Button>
                    )}
                </InputGroup>
            </div>
        </Nav>
    );

    return (
        <Navbar 
            expand={true} 
            variant="dark" // ここは dark のままの方がいいかも
            style={{ backgroundColor: theme == "dark" ? "#272a31": "#3E455E"}}
        >
            <Navbar.Toggle aria-controls="responsive-navbar-nav" />
            <Navbar.Collapse id="responsive-navbar-nav">
                {renderMenuDropdown()}
                {/* 横幅が狭い時はサーチ以外のアイテムをドロップダウン内に寄せる */}
                {!isCompact && renderZoomLinks()}
                {renderSearchBox()}
            </Navbar.Collapse>
        </Navbar>
    );
};

const StatusBar = (props: {store: Store;}) => {
    let store = props.store;
    const [statusBarMessage, setStatusBarMessage] = useState("");
    const [currentRootPath, setCurrentRootPath] = useState("");
    const [searchResultsCount, setSearchResultsCount] = useState(0);
    const [searchQuery, setSearchQuery] = useState("");
    const [theme, setTheme] = useState(store.uiTheme); // 現在のテーマを管理

    useEffect(() => { // マウント時
        store.on(CHANGE.CANVAS_POINTER_CHANGED, () => {
            if (!store.pointedPath || !store.pointedFileNode) { return;}
            setStatusBarMessage(store.pointedPath + store.fileNodeToStr(store.pointedFileNode, store.isSizeMode));
        });
        store.on(CHANGE.CHANGE_UI_THEME, () => {
            setTheme(store.uiTheme);
        });
        store.on(CHANGE.ROOT_NODE_CHANGED, () => {
            if (store.currentRootNode === store.originalTree) {
                setCurrentRootPath("");
            } else if (store.currentRootNode) {
                // ルートノードまでのパスを構築
                let path = store.currentRootNode.key;
                let parent = store.currentRootNode.parent;
                while (parent) {
                    path = parent.key + "/" + path;
                    parent = parent.parent;
                }
                setCurrentRootPath(path);
            }
        });
        store.on(CHANGE.SEARCH_RESULTS_CHANGED, () => {
            setSearchResultsCount(store.searchResults.length);
            setSearchQuery(store.searchQuery);
        });
    }, []);

    const getSearchMessage = () => {
        if (!searchQuery) return "";
        if (searchResultsCount === 0) return ` | Search: "${searchQuery}" - No results found`;
        return ` | Search: "${searchQuery}" - ${searchResultsCount} result${searchResultsCount > 1 ? 's' : ''} found`;
    };

    return (
        // {/* <div style={{ height: "40px", backgroundColor: "#eee", padding: "10px", textAlign: "left", borderTop: "1px solid #ccc" }}>
        //     <span>{statusBarMessage}</span> */}
        <div style={{ height: "30px", minHeight: "30px", 
            backgroundColor: theme == "dark" ? "#272a31": "#FAFAFA", 
            paddingLeft: "10px", 
            paddingRight: "10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            textAlign: "left", borderTop: "0.5px solid " + theme == "dark" ? "#383B41" : "#C6C6C6" }}
        >
            <span style={{ color: theme == "dark" ? "#C9CACB" : "#191919", fontSize: "15px" }}>
                {statusBarMessage}{getSearchMessage()}
            </span>
            {currentRootPath && (
                <span style={{ 
                    color: theme == "dark" ? "#ffc107" : "#856404", 
                    fontSize: "13px",
                    fontStyle: "italic"
                }}>
                    Root: /{currentRootPath}
                </span>
            )}
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
        <Modal.Body>Meno Version 0.0.3</Modal.Body>             
        </Modal>
    );
};

const ContextMenu = (props: {
    store: Store;
    show: boolean;
    x: number;
    y: number;
    targetNode: FileNode | null;
    onClose: () => void;
}) => {
    const { store, show, x, y, targetNode, onClose } = props;
    const [theme, setTheme] = useState(store.uiTheme);

    useEffect(() => {
        store.on(CHANGE.CHANGE_UI_THEME, () => {
            setTheme(store.uiTheme);
        });
    }, []);

    const handleSetAsRoot = () => {
        if (targetNode && targetNode.children) {
            store.trigger(ACTION.SET_ROOT_NODE, targetNode);
        }
        onClose();
    };

    const handleSetParentAsRoot = () => {
        store.trigger(ACTION.SET_PARENT_AS_ROOT);
        onClose();
    };

    const handleResetRoot = () => {
        store.trigger(ACTION.RESET_ROOT_NODE);
        onClose();
    };

    if (!show || !targetNode) {
        return null;
    }

    const canSetAsRoot = targetNode.children && Object.keys(targetNode.children).length > 0;
    const isNotOriginalRoot = store.currentRootNode !== store.originalTree;
    const hasParent = store.currentRootNode && store.currentRootNode.parent;

    return (
        <div
            style={{
                position: 'fixed',
                top: y,
                left: x,
                zIndex: 1050,
                backgroundColor: theme === "dark" ? "#343a40" : "#ffffff",
                border: `1px solid ${theme === "dark" ? "#495057" : "#dee2e6"}`,
                borderRadius: '4px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
                minWidth: '200px'
            }}
        >
            <div style={{ padding: '8px 0' }}>
                <div
                    style={{
                        padding: '8px 16px',
                        fontSize: '12px',
                        color: theme === "dark" ? "#adb5bd" : "#6c757d",
                        borderBottom: `1px solid ${theme === "dark" ? "#495057" : "#dee2e6"}`,
                        marginBottom: '4px'
                    }}
                >
                    {targetNode.key}
                </div>
                
                {canSetAsRoot && (
                    <div
                        onClick={handleSetAsRoot}
                        style={{
                            padding: '8px 16px',
                            cursor: 'pointer',
                            color: theme === "dark" ? "#ffffff" : "#000000",
                            backgroundColor: 'transparent'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = theme === "dark" ? "#495057" : "#f8f9fa";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                    >
                        <i className="bi bi-arrow-up-right-circle"></i> Set as Root
                    </div>
                )}
                
                {hasParent && (
                    <div
                        onClick={handleSetParentAsRoot}
                        style={{
                            padding: '8px 16px',
                            cursor: 'pointer',
                            color: theme === "dark" ? "#ffffff" : "#000000",
                            backgroundColor: 'transparent'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = theme === "dark" ? "#495057" : "#f8f9fa";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                    >
                        <i className="bi bi-arrow-up"></i> Go Up One Level
                    </div>
                )}
                
                {isNotOriginalRoot && (
                    <div
                        onClick={handleResetRoot}
                        style={{
                            padding: '8px 16px',
                            cursor: 'pointer',
                            color: theme === "dark" ? "#ffffff" : "#000000",
                            backgroundColor: 'transparent'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = theme === "dark" ? "#495057" : "#f8f9fa";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                    >
                        <i className="bi bi-house"></i> Reset to Original Root
                    </div>
                )}
            </div>
        </div>
    );
};

const Breadcrumb = (props: {store: Store;}) => {
    const { store } = props;
    const [breadcrumbPath, setBreadcrumbPath] = useState<FileNode[]>([]);
    const [theme, setTheme] = useState(store.uiTheme);

    useEffect(() => {
        store.on(CHANGE.CHANGE_UI_THEME, () => {
            setTheme(store.uiTheme);
        });
        
        store.on(CHANGE.ROOT_NODE_CHANGED, () => {
            setBreadcrumbPath(store.getBreadcrumbPath());
        });

        store.on(CHANGE.TREE_LOADED, () => {
            setBreadcrumbPath(store.getBreadcrumbPath());
        });

        // 初期値を設定
        setBreadcrumbPath(store.getBreadcrumbPath());
    }, []);

    const handleBreadcrumbClick = (node: FileNode) => {
        if (node !== store.currentRootNode) {
            store.trigger(ACTION.SET_ROOT_NODE, node);
        }
    };

    if (breadcrumbPath.length <= 1) {
        return null; // ルートレベルでは表示しない
    }

    return (
        <div
            style={{
                position: 'absolute',
                top: '10px',
                left: '10px',
                zIndex: 10,
                backgroundColor: theme === "dark" ? "#2e3641" : "#e0e0e0",
                border: `0.5px solid ${theme === "dark" ? "#495057" : "#dee2e6"}`,
                borderRadius: '3px',
                padding: '6px 6px',
                fontSize: '12px',
                fontFamily: 'monospace',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                backdropFilter: 'blur(4px)',
                maxWidth: '60%',
                overflow: 'hidden'
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                {breadcrumbPath.map((node, index) => (
                    <span key={index} style={{ display: 'flex', alignItems: 'center' }}>
                        {index > 0 && (
                            <i className="bi bi-chevron-right" style={{ 
                                margin: '0 6px', 
                                fontSize: '12px',
                                color: theme === "dark" ? "#6c757d" : "#adb5bd"
                            }}></i>
                        )}
                        <span
                            onClick={() => handleBreadcrumbClick(node)}
                            style={{
                                cursor: index < breadcrumbPath.length - 1 ? 'pointer' : 'default',
                                color: index === breadcrumbPath.length - 1 
                                    ? (theme === "dark" ? "#909192" : "#000000")
                                    : (theme === "dark" ? "#17a2b8" : "#507bdf"),
                                fontWeight: index === breadcrumbPath.length - 1 ? 'bold' : 'normal',
                                textDecoration: index < breadcrumbPath.length - 1 ? 'underline' : 'none',
                                maxWidth: '120px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                            }}
                            onMouseEnter={(e) => {
                                if (index < breadcrumbPath.length - 1) {
                                    e.currentTarget.style.opacity = '0.7';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (index < breadcrumbPath.length - 1) {
                                    e.currentTarget.style.opacity = '1';
                                }
                            }}
                        >
                            {node.key}
                        </span>
                    </span>
                ))}
            </div>
        </div>
    );
};

export {ToolBar, StatusBar, VersionDialog, ContextMenu, Breadcrumb};
