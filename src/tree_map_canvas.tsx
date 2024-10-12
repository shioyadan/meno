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

    ZOOM_RATIO = 0.8;
    ZOOM_ANIMATION_SPEED = 0.07;
    zoomAnimationID: number|null = null;
};


const TreeMapCanvas = (props: {store: Store;}) => {
    const store = props.store;
    const canvasRef = useRef(null); // canvas の DOM
    const divRef = useRef(null); // div の DOM
    const context = useRef(new TreeMapCanvasContext);

    useEffect(() => {   // マウント時
        const canvas: any = canvasRef.current;
        const ctx = context.current;

        const handleMouseDoubleClick = (e: MouseEvent) => {
            if (!store.tree) return;
            const zoomIn = !e.shiftKey;
            startZoom(zoomIn, e.clientX, e.clientY);
        };

        const handleMouseWheel = (e: WheelEvent) => {
            if (!store.tree) return;
            startZoom(e.deltaY < 0, e.offsetX, e.offsetY);
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

        canvas.ondblclick = handleMouseDoubleClick;
        canvas.onmousewheel = handleMouseWheel;
        canvas.onmousemove = handleMouseMove;
        canvas.onmousedown = handleMouseDown;
        canvas.onmouseup = handleMouseUp;

        document.onkeydown = (e) => {
            if (!store.tree) return;
            let key = e.key;
            if (key === "ArrowUp") {
                ctx.viewPoint = [ctx.viewPoint[0], ctx.viewPoint[1] - 50];
                draw();
            } else if (key === "ArrowDown") {
                ctx.viewPoint = [ctx.viewPoint[0], ctx.viewPoint[1] + 50];
                draw();
            } else if (key === "ArrowLeft") {
                ctx.viewPoint = [ctx.viewPoint[0] - 50, ctx.viewPoint[1]];
                draw();
            } else if (key === "ArrowRight") {
                ctx.viewPoint = [ctx.viewPoint[0] + 50, ctx.viewPoint[1]];
                draw();
            } else if (key === "+") {
                startZoom(true, canvas.offsetWidth / 2, canvas.offsetHeight / 2);
            } else if (key === "-") {
                startZoom(false, canvas.offsetWidth / 2, canvas.offsetHeight / 2);
            }
        };

        store.on(CHANGE.CANVAS_ZOOM_IN, () => {
            startZoom(true, canvas.offsetWidth / 2, canvas.offsetHeight / 2);
        });
        store.on(CHANGE.CANVAS_ZOOM_OUT, () => {
            startZoom(false, canvas.offsetWidth / 2, canvas.offsetHeight / 2);
        });
        store.on(CHANGE.TREE_LOADED, () => {
            draw();
        });
    
        // リサイズ時のリスナー
        const observer = new ResizeObserver((entries) => {
            handleResize();
        });
        if (divRef.current) {
            observer.observe(divRef.current);
        }

        // Canvas の初期化
        ctx.BASE_SIZE = [canvas.offsetWidth * 0.7, (canvas.offsetWidth * 0.7) / 16 * 9];
        ctx.viewPoint = [-(canvas.offsetWidth - ctx.BASE_SIZE[0]) / 2, -(canvas.offsetHeight - ctx.BASE_SIZE[1]) / 2];

        // コンポーネントのアンマウント時にリスナーを削除
        return () => {
            if (divRef.current) {
                observer.unobserve(divRef.current);
            }
            if (ctx.zoomAnimationID) {
                clearInterval(ctx.zoomAnimationID); 
            }
        };
    }, []);


    const handleResize = () => {

        const canvas: any = canvasRef.current;
        const div: any = divRef.current;
        const ctx = context.current;

        // High DPI 対策
        // サイズを変更すると canvas の中身が破棄されるので，
        // 本当に変わったときだけ反映する
        if (ctx.oldSize[0] != div.offsetWidth || ctx.oldSize[1] != div.offsetHeight){

            // High DPI 対策
            let canvasCtx = canvas.getContext("2d");
            let devicePixelRatio = window.devicePixelRatio || 1;
            let backingStoreRatio = canvasCtx.backingStorePixelRatio || 1;
            
            if (devicePixelRatio !== backingStoreRatio) {
                let ratio = devicePixelRatio / backingStoreRatio;
                canvas.width = div.offsetWidth * ratio;
                canvas.height = div.offsetHeight * ratio;
                canvas.style.width = div.offsetWidth + "px";
                canvas.style.height = div.offsetHeight + "px";
                canvasCtx.scale(ratio, ratio);
            }
            else{
                canvas.width = div.offsetWidth;
                canvas.height = div.offsetHeight;
                canvas.style.width = div.offsetWidth + "px";
                canvas.style.height = div.offsetHeight + "px";
                canvasCtx.scale(1, 1);
            }
            ctx.oldSize[0] = div.offsetWidth;
            ctx.oldSize[1] = div.offsetHeight;
        }
        draw();

    };


    const calcZoomRatio = (level: number) => Math.pow(2, level);

    const startZoom = (direction: boolean, offsetX: number, offsetY: number) => {
        const ctx = context.current;
        if (!ctx.inZoomAnimation) {
            ctx.zoomAnimationDirection = direction;
            ctx.zoomEndLevel = ctx.zoomLevel + (direction ? ctx.ZOOM_RATIO : -ctx.ZOOM_RATIO);
            ctx.zoomBasePoint = [offsetX, offsetY];
            ctx.inZoomAnimation = true;
            ctx.zoomAnimationID = window.setInterval(animateZoom, 16);
        }
    };

    const animateZoom = () => {
        const ctx = context.current;
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
        const ctx = context.current;
        const newZoomRatio = calcZoomRatio(newZoomLevel);
        const oldZoomRatio = calcZoomRatio(ctx.zoomLevel);

        const newAbsPosX = (offsetX + ctx.viewPoint[0]) / oldZoomRatio * newZoomRatio;
        const newAbsPosY = (offsetY + ctx.viewPoint[1]) / oldZoomRatio * newZoomRatio;

        ctx.viewPoint = [newAbsPosX - offsetX, newAbsPosY - offsetY];
        ctx.zoomLevel = newZoomLevel;
    };

    const draw = () => {
        const ctx = context.current;
        const canvas: any = canvasRef.current;  // DOM
        const width = canvas.width;
        const height = canvas.height;
        const zoom = calcZoomRatio(ctx.zoomLevel);
        const virtualWidth = ctx.BASE_SIZE[0] * zoom;
        const virtualHeight = ctx.BASE_SIZE[1] * zoom;

        props.store.treeMapRenderer.render(
            canvas,
            props.store.tree,
            virtualWidth,
            virtualHeight,
            [ctx.viewPoint[0], ctx.viewPoint[1], ctx.viewPoint[0] + width, ctx.viewPoint[1] + height],
            ctx.isSizeMode
        );
    };

    // 外側の要素に 100% で入るようにする
    // canvas をインライン要素ではなく block にしておかないと div との間に隙間ができる
    // canvas の高解像度対応時にサイズを決定するために div で囲む
    return (
        <div ref={divRef} style={{ width: "100%", height: "100%" }} >
            <canvas ref={canvasRef} style={{ 
                width: "100%", height: "100%", display: "block", margin: 0, padding: 0 
            }} />
        </div>
        
    );
};

export default TreeMapCanvas;
