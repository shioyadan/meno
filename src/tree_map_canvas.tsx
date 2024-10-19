import React, { useRef, useEffect, useState } from "react";
import Store, { ACTION, CHANGE } from "./store";

class TreeMapCanvasContext {
    BASE_SIZE = [0, 0];
    tree = null;
    isSizeMode = true;
    zoomLevel = 0;
    viewPoint = [0, 0];
    curSize = [0, 0];
    oldSize = [0, 0];
    
    inZoomAnimation = false;
    zoomAnimationDirection = true;
    zoomEndLevel = 0;
    zoomBasePoint = [0, 0];
    inDrag = false;
    prevMousePoint = [0, 0];

    // タッチ関係
    inPinch = false;
    inSwipe = false;
    initialTouchDistance = 0;
    initialZoomLevel = 0;
    lastTouchCenter: { x: number; y: number } = {x: 0, y: 0};    // ２本指でのタッチ中心
    lastTouchPosition: { x: number; y: number } = {x: 0, y: 0}; // 一本指でのタッチ位置

    resizeObserver: ResizeObserver|null = null;

    ZOOM_RATIO = 0.8;
    ZOOM_ANIMATION_SPEED = 0.07;
    zoomAnimationID: number|null = null;
};


const TreeMapCanvas = (props: {store: Store;}) => {
    const store = props.store;
    const contextRef = useRef(new TreeMapCanvasContext);
    const ctx = contextRef.current; // 再レンダリングのたびにクロージャーが作られるので，参照をここでとっても問題がない

    const divRef = useRef(null); // div の DOM
    const canvasRef = useRef<HTMLCanvasElement>(null); // canvas の DOM

    useEffect(() => {   
        initialize();       // [] で依存なしで useEffect を使うとマウント時に呼ばれる
        return finalize;    // useEffect は終了処理への参照を返すことになっている
    }, []);

    const initialize = () => {   // マウント時
        const canvas: HTMLCanvasElement = canvasRef.current!;  // canvas の DOM

        canvas.ondblclick = handleMouseDoubleClick;
        canvas.addEventListener("wheel", handleMouseWheel);
        canvas.onmousemove = handleMouseMove;
        canvas.onmousedown = handleMouseDown;
        canvas.onmouseup = handleMouseUp;

        canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
        canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
        canvas.addEventListener("touchend", handleTouchEnd, { passive: false });
        
        document.onkeydown = handleKeydown

        store.on(CHANGE.CANVAS_ZOOM_IN, () => {
            startZoomInOrOut(true, canvas.offsetWidth / 2, canvas.offsetHeight / 2);
        });
        store.on(CHANGE.CANVAS_ZOOM_OUT, () => {
            startZoomInOrOut(false, canvas.offsetWidth / 2, canvas.offsetHeight / 2);
        });
        store.on(CHANGE.TREE_LOADED, () => {
            draw();
        });
        store.on(CHANGE.CANVAS_POINTER_CHANGED, () => {
            draw();
        });    
        store.on(CHANGE.FIT_TO_CANVAS, function(){
            fitToCanvas();
        });

        // リサイズ時のリスナー
        const observer = new ResizeObserver((entries) => {
            // handleResize 内で DOM をいじる必要があるが，ResizeObserver がそれを許さないので非同期で遅延実行
            setTimeout(handleResize, 0); 
        });
        if (divRef.current) {
            observer.observe(divRef.current);
        }
        ctx.resizeObserver = observer;

        // Canvas の初期化
        ctx.BASE_SIZE = [canvas.offsetWidth * 0.7, (canvas.offsetWidth * 0.7) / 16 * 9];
        ctx.viewPoint = [-(canvas.offsetWidth - ctx.BASE_SIZE[0]) / 2, -(canvas.offsetHeight - ctx.BASE_SIZE[1]) / 2];
    };

    // コンポーネントのアンマウント時にリスナーを削除
    const finalize = () => {
        if (divRef.current) {
            ctx.resizeObserver?.unobserve(divRef.current);
        }
        if (ctx.zoomAnimationID) {
            clearInterval(ctx.zoomAnimationID); 
        }
    };
    
    const handleMouseDoubleClick = (e: MouseEvent) => {
        if (!store.tree) return;
        const zoomIn = !e.shiftKey;
        startZoomInOrOut(zoomIn, e.offsetX, e.offsetY);
    };

    const handleMouseWheel = (e: WheelEvent) => {
        if (!store.tree) return;
        startZoomInOrOut(e.deltaY < 0, e.offsetX, e.offsetY);
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!store.tree) return;
        if (ctx.inDrag) {
            const newViewPoint = [
                ctx.viewPoint[0] + ctx.prevMousePoint[0] - e.offsetX,
                ctx.viewPoint[1] + ctx.prevMousePoint[1] - e.offsetY,
            ];
            ctx.viewPoint = newViewPoint;
            ctx.prevMousePoint = [e.offsetX, e.offsetY];
            draw();
        }
        let pointedFileNode = 
            store.treeMapRenderer.getFileNodeFromPoint([e.offsetX, e.offsetY]);
        let pointedPath = 
            store.treeMapRenderer.getPathFromFileNode(pointedFileNode);
        //console.log(self.pointedPath);
        store.trigger(ACTION.CANVAS_POINTER_CHANGE, pointedPath, pointedFileNode);

    };

    const handleMouseDown = (e: MouseEvent) => {
        if (!store.tree) return;
        if (e.buttons & 1) {
            ctx.inDrag = true
            ctx.prevMousePoint = [e.offsetX, e.offsetY];
        }
    };

    const handleMouseUp = (e: MouseEvent) => {
        ctx.inDrag = false;
    };

    // ピンチズームおよびタッチ移動対応用のタッチイベントハンドラ
    const handleTouchStart = (e: TouchEvent) => {
        if (e.touches.length == 2) { // 2本指でのタッチ開始
            ctx.initialTouchDistance = getTouchDistance(e.touches[0], e.touches[1]);
            ctx.lastTouchCenter = getTouchCenter(e.touches[0], e.touches[1]);
            ctx.initialZoomLevel = ctx.zoomLevel; // ズームレベルを保存
            ctx.inPinch = true;
        } else if (e.touches.length == 1) { // 1本指でのタッチ開始
            ctx.lastTouchPosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            ctx.inSwipe = true;
        }
    }

    const handleTouchMove = (e: TouchEvent) => {
        e.preventDefault(); // デフォルトのタッチスクロールを無効化
        if (e.touches.length == 2 && ctx.inPinch) {
            const newDistance = getTouchDistance(e.touches[0], e.touches[1]);
            const zoomFactor = newDistance / ctx.initialTouchDistance;

            // ピンチ操作に応じたズーム処理
            let zoomLevel = ctx.initialZoomLevel + Math.log2(zoomFactor);
            let center = getTouchCenter(e.touches[0], e.touches[1]);
            setZoomRatio(zoomLevel, center.x, center.y);

            // ビューを移動
            const dx = center.x - ctx.lastTouchCenter.x;
            const dy = center.y - ctx.lastTouchCenter.y;
            ctx.viewPoint = [ctx.viewPoint[0] - dx, ctx.viewPoint[1] - dy];
            ctx.lastTouchCenter = getTouchCenter(e.touches[0], e.touches[1]);
            draw();
        } 
        else if (e.touches.length == 1 && ctx.inSwipe) {
            // 1本指の移動操作
            const currentTouchPosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            const dx = currentTouchPosition.x - ctx.lastTouchPosition.x;
            const dy = currentTouchPosition.y - ctx.lastTouchPosition.y;

            // ビューを移動
            ctx.viewPoint = [ctx.viewPoint[0] - dx, ctx.viewPoint[1] - dy];
            draw();

            // タッチ位置を更新
            ctx.lastTouchPosition = currentTouchPosition;
        }
    }

    const handleTouchEnd = (e: TouchEvent) =>{
        if (e.touches.length < 2) {  // 2本指での操作が終わったらリセット
            ctx.inPinch = false;
        }
        if (e.touches.length == 1) { // 1本指のタッチが残っている場合はスクロールに移行するために位置を更新
            ctx.lastTouchPosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
        if (e.touches.length < 1) { // 1本指のタッチが終了した場合もリセット
            ctx.inSwipe = false;
        }
    }        
    // 2つのタッチ間の距離を計算
    const getTouchDistance = (touch1: Touch, touch2: Touch): number => {
        const dx = touch1.clientX - touch2.clientX;
        const dy = touch1.clientY - touch2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // 2つのタッチの中心点を取得
    const getTouchCenter = (touch1: Touch, touch2: Touch): { x: number; y: number } => {
        return {
            x: (touch1.clientX + touch2.clientX) / 2,
            y: (touch1.clientY + touch2.clientY) / 2,
        };
    }

    const handleKeydown = (e: KeyboardEvent) => {
        const canvas: any = canvasRef.current;
        if (!store.tree) return;
        let key = e.key;
        if (key === "ArrowUp") {
            ctx.viewPoint = [ctx.viewPoint[0], ctx.viewPoint[1] - 50];
            draw();
        } 
        else if (key === "ArrowDown") {
            ctx.viewPoint = [ctx.viewPoint[0], ctx.viewPoint[1] + 50];
            draw();
        } 
        else if (key === "ArrowLeft") {
            ctx.viewPoint = [ctx.viewPoint[0] - 50, ctx.viewPoint[1]];
            draw();
        } 
        else if (key === "ArrowRight") {
            ctx.viewPoint = [ctx.viewPoint[0] + 50, ctx.viewPoint[1]];
            draw();
        } 
        else if (key === "+") {
            startZoomInOrOut(true, canvas.offsetWidth / 2, canvas.offsetHeight / 2);
        } 
        else if (key === "-") {
            startZoomInOrOut(false, canvas.offsetWidth / 2, canvas.offsetHeight / 2);
        }
    }

    const handleResize = () => {

        const canvas: any = canvasRef.current;
        // const div: any = divRef.current;
        let width = canvas.clientWidth;
        let height = canvas.clientHeight;

        // High DPI 対策
        // サイズを変更すると canvas の中身が破棄されるので，
        // 本当に変わったときだけ反映する
        if (ctx.oldSize[0] != width || ctx.oldSize[1] != height){

            // High DPI 対策
            let canvasCtx = canvas.getContext("2d");
            let devicePixelRatio = window.devicePixelRatio || 1;
            if (devicePixelRatio < 1) { // 縮小表示の時の対応
                devicePixelRatio = 1;
            }            
            let ratio = devicePixelRatio;
            canvas.width = width * ratio;
            canvas.height = height * ratio;
            canvasCtx.scale(ratio, ratio);
            ctx.oldSize[0] = width;
            ctx.oldSize[1] = height;
            draw();
        }
    };


    const calcZoomRatio = (level: number) => Math.pow(2, level);

    const startZoomInOrOut = (direction: boolean, offsetX: number, offsetY: number) => {
        if (!ctx.inZoomAnimation) {
            ctx.zoomAnimationDirection = direction;
            ctx.zoomEndLevel = ctx.zoomLevel + (direction ? ctx.ZOOM_RATIO : -ctx.ZOOM_RATIO);
            ctx.zoomBasePoint = [offsetX, offsetY];
            ctx.inZoomAnimation = true;
            ctx.zoomAnimationID = window.setInterval(animateZoom, 16);
        }
    };

    const animateZoom = () => {
        const newZoomLevel = ctx.zoomLevel + 
            (ctx.zoomAnimationDirection ? ctx.ZOOM_ANIMATION_SPEED : -ctx.ZOOM_ANIMATION_SPEED);
        setZoomRatio(newZoomLevel, ctx.zoomBasePoint[0], ctx.zoomBasePoint[1]);
        draw();
        if ((ctx.zoomAnimationDirection && newZoomLevel > ctx.zoomEndLevel) || 
            (!ctx.zoomAnimationDirection && newZoomLevel < ctx.zoomEndLevel)
        ) {
            if (ctx.zoomAnimationID !== null) {
                clearInterval(ctx.zoomAnimationID);
                ctx.zoomAnimationID = null;
            }
            ctx.inZoomAnimation = false;
        }
    };

    const setZoomRatio = (newZoomLevel: number, offsetX: number, offsetY: number) => {
        const newZoomRatio = calcZoomRatio(newZoomLevel);
        const oldZoomRatio = calcZoomRatio(ctx.zoomLevel);

        const newAbsPosX = (offsetX + ctx.viewPoint[0]) / oldZoomRatio * newZoomRatio;
        const newAbsPosY = (offsetY + ctx.viewPoint[1]) / oldZoomRatio * newZoomRatio;

        ctx.viewPoint = [newAbsPosX - offsetX, newAbsPosY - offsetY];
        ctx.zoomLevel = newZoomLevel;
    };

    const draw = () => {
        const canvas: any = canvasRef.current;  // DOM
        const width = canvas.width;
        const height = canvas.height;
        const zoom = calcZoomRatio(ctx.zoomLevel);
        const virtualWidth = ctx.BASE_SIZE[0] * zoom;
        const virtualHeight = ctx.BASE_SIZE[1] * zoom;

        props.store.treeMapRenderer.render(
            canvas,
            props.store.tree,
            props.store.pointedFileNode,
            virtualWidth,
            virtualHeight,
            [ctx.viewPoint[0], ctx.viewPoint[1], ctx.viewPoint[0] + width, ctx.viewPoint[1] + height],
            ctx.isSizeMode,
            (fileNode, isSizeMode) => props.store.fileNodeToStr(fileNode, isSizeMode)
        );
    };
    
    const fitToCanvas = () => {
        const canvas: any = canvasRef.current;  // DOM
        let targetScale = Math.min(
            canvas.offsetWidth / ctx.BASE_SIZE[0],
            canvas.offsetHeight / ctx.BASE_SIZE[1]
        );

        ctx.zoomLevel = Math.log2(targetScale);
        ctx.viewPoint = [
            -(canvas.offsetWidth - (ctx.BASE_SIZE[0]*targetScale)) / 2,
            -(canvas.offsetHeight - (ctx.BASE_SIZE[1]*targetScale)) / 2
        ];
        draw();
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
            store.trigger(ACTION.FILE_IMPORT, reader.result as string);   
        };
        reader.onerror = () => {
            // setError("Failed to read the file");
        };
        reader.readAsText(file); // ファイルをテキストとして読み込み
    };

    // 外側の要素に 100% で入るようにする
    // canvas をインライン要素ではなく block にしておかないと div との間に隙間ができる
    // canvas の高解像度対応時にサイズを決定するために div で囲む
    return (
        <div ref={divRef} style={{ width: "100%", height: "100%" }} 
            onDrop={handleDrop} onDragOver={handleDragOver}>
            <canvas ref={canvasRef} style={{ 
                width: "100%", height: "100%", display: "block", margin: 0, padding: 0 
            }} />
        </div>
        
    );
};

export default TreeMapCanvas;
