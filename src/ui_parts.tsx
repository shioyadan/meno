import React, { useRef, useEffect, useState } from "react";
import Store, { ACTION, CHANGE } from "./store";
import { FileNode } from "./loader";

import { fileOpen } from "browser-fs-access";

import { Nav, Navbar, NavDropdown, Form, FormControl, InputGroup, Button, Dropdown } from "react-bootstrap";
import { Modal } from "react-bootstrap";

// react-icons 経由でアイコンをインポートすると，webpack でのビルド時に必要なアイコンのみがバンドルされる
import {
    BsList,
    BsX,
    BsArrowsFullscreen,
    BsZoomIn,
    BsZoomOut,
    BsArrowUpRightCircle,
    BsArrowUp,
    BsHouse,
    BsChevronRight,
    BsCheck
} from 'react-icons/bs';

const ToolBar = (props: {store: Store;}) => {
    let store = props.store;
    const [searchQuery, setSearchQuery] = useState("");
    const searchInputRef = useRef<HTMLInputElement>(null);

    const openFile = async () => {
        try {
            const file = await fileOpen();
            const contents = await file.text();
            store.trigger(ACTION.FILE_IMPORT, contents);
        } catch (error) {
            console.error("Error opening file:", error);
        }
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
            <NavDropdown menuVariant={theme} title={<BsList />} id="collapsible-nav-dropdown">
                <NavDropdown.Item eventKey="import">
                    Import file
                </NavDropdown.Item>
                <NavDropdown.Divider />
                <NavDropdown.Item eventKey="set-dark" active={theme === "dark"}>
                    {theme === "dark" && <BsCheck />} Dark
                </NavDropdown.Item>
                <NavDropdown.Item eventKey="set-light" active={theme === "light"}>
                    {theme === "light" && <BsCheck />} Light
                </NavDropdown.Item>
                <NavDropdown.Divider />
                {/* コンパクト時はズーム関連もドロップダウンに格納 */}
                {isCompact && (
                    <>
                        <NavDropdown.Item eventKey="zoom-in">
                            <BsZoomIn /> Zoom In
                        </NavDropdown.Item>
                        <NavDropdown.Item eventKey="zoom-out">
                            <BsZoomOut /> Zoom Out
                        </NavDropdown.Item>
                        <NavDropdown.Item eventKey="fit">
                            <BsArrowsFullscreen /> Fit
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
                <BsZoomIn /> Zoom In                
            </Nav.Link>
            <Nav.Link className="nav-link tool-bar-link" eventKey="zoom-out">
                <BsZoomOut /> Zoom Out                
            </Nav.Link>
            <Nav.Link className="nav-link tool-bar-link" eventKey="fit">
                <BsArrowsFullscreen /> Fit
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
                            <BsX />
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
    const [searchResultsCount, setSearchResultsCount] = useState(0);
    const [searchQuery, setSearchQuery] = useState("");
    const [theme, setTheme] = useState(store.uiTheme); // 現在のテーマを管理
    const [searchTotalSize, setSearchTotalSize] = useState(0);
    const [rootSize, setRootSize] = useState(0);

    // 重複排除して合計を出す
    const calcDedupedTotalSize = (results: FileNode[] = []) => {
        if (!results.length) return 0;
        const idSet = new Set<number>(results.map(n => n?.id));
        // 祖先がヒットしていない最上位ノードのみを残す
        const topLevel = results.filter(n => {
            let p = n?.parent;
            while (p) {
                if (idSet.has(p.id)) return false; // 親(祖先)がヒットしている → 除外
                p = p.parent;
            }
            return true;
        });
        return topLevel.reduce((acc, n) => acc + (n?.size || 0), 0);
    };

    useEffect(() => { // マウント時
        store.on(CHANGE.CANVAS_POINTER_CHANGED, () => {
            if (!store.pointedPath || !store.pointedFileNode) { return;}
            setStatusBarMessage(store.pointedPath + store.fileNodeToStr(store.pointedFileNode, store.isSizeMode));
        });
        store.on(CHANGE.CHANGE_UI_THEME, () => {
            setTheme(store.uiTheme);
        });
        store.on(CHANGE.ROOT_NODE_CHANGED, () => {  // ルートノードサイズを更新
            setRootSize((store.currentRootNode && store.currentRootNode.size) ? store.currentRootNode.size : 0);
        });
        store.on(CHANGE.TREE_LOADED, () => {
            setRootSize((store.currentRootNode && store.currentRootNode.size) ? store.currentRootNode.size : 0);
        });
        store.on(CHANGE.SEARCH_RESULTS_CHANGED, () => {
            setSearchResultsCount(store.searchResults.length);
            setSearchQuery(store.searchQuery);
            // 親子重複を除外した合計（素の値のまま）
            const total = calcDedupedTotalSize(store.searchResults || []);
            setSearchTotalSize(total);
        });
        setRootSize((store.currentRootNode && store.currentRootNode.size) ? store.currentRootNode.size : 0);
    }, []);

    const toPercent = (part: number, whole: number): string => {
        if (!whole || whole <= 0) return "0%";
        const pct = (part / whole) * 100;
        return pct >= 100 || Number.isInteger(pct) ? `${Math.round(pct)}%` : `${pct.toFixed(2)}%`;
    };

    const getSearchMessage = () => {
        if (!searchQuery) return "";
        if (searchResultsCount === 0) return ` | Search: "${searchQuery}" - No results found`;
        return ` | Search: "${searchQuery}" - ${searchResultsCount} result${searchResultsCount > 1 ? 's' : ''} found (Total: ${searchTotalSize}, ${toPercent(searchTotalSize, rootSize)} of root)`;
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
    const isAtOriginalRoot = store.currentRootNode === store.originalTree; // ★ 追加: ルートかどうか

    return (
        <div
            className={`context-menu ${theme === "dark" ? "dark" : "light"}`}
            style={{ position: 'fixed', top: y, left: x }}
        >
            <div className="context-menu__body">
                <div className="context-menu__header">
                    {targetNode.key}
                </div>
                
                {canSetAsRoot && (
                    <div onClick={handleSetAsRoot} className="context-menu__item">
                        <BsArrowUpRightCircle /> Set as Root
                    </div>
                )}
                <div
                    onClick={!isAtOriginalRoot && hasParent ? handleSetParentAsRoot : undefined}
                    className={`context-menu__item ${isAtOriginalRoot || !hasParent ? "is-disabled" : ""}`}
                    aria-disabled={isAtOriginalRoot || !hasParent}
                    style={isAtOriginalRoot || !hasParent ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
                >
                    <BsArrowUp /> Go Up One Level
                </div>
                {isNotOriginalRoot && (
                    <div onClick={handleResetRoot} className="context-menu__item">
                        <BsHouse /> Reset to Original Root
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
        store.on(CHANGE.CHANGE_UI_THEME,    () => { setTheme(store.uiTheme); });
        store.on(CHANGE.ROOT_NODE_CHANGED,  () => { setBreadcrumbPath(store.getBreadcrumbPath()); });
        store.on(CHANGE.TREE_LOADED,        () => { setBreadcrumbPath(store.getBreadcrumbPath()); });
        setBreadcrumbPath(store.getBreadcrumbPath());   // 初期値を設定
    }, []);

    const handleBreadcrumbClick = (node: FileNode) => {
        if (node !== store.currentRootNode) {
            store.trigger(ACTION.SET_ROOT_NODE, node);
        }
    };

    if (breadcrumbPath.length <= 2) {
        return null; // ルートレベルでは表示しない
    }

    return (
        <div
            className={`breadcrumb-overlay ${theme === "dark" ? "dark" : "light"}`}
            style={{
                position: 'absolute',
                right: '10px',
                bottom: '10px',
            }}
        >
            <div className="breadcrumb-list">
                {breadcrumbPath.map((node, index) => (
                    <span key={index} className="breadcrumb-item">
                        {index > 0 && (
                            <BsChevronRight className="breadcrumb-sep" />
                        )}
                        <span
                            onClick={() => handleBreadcrumbClick(node)}
                            className={[
                                "breadcrumb-link",
                                index < breadcrumbPath.length - 1 ? "is-interactive" : "is-current"
                            ].join(" ")}
                            onMouseEnter={(e) => {
                                if (index < breadcrumbPath.length - 1) {
                                    (e.currentTarget as HTMLElement).style.opacity = '0.7';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (index < breadcrumbPath.length - 1) {
                                    (e.currentTarget as HTMLElement).style.opacity = '1';
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
