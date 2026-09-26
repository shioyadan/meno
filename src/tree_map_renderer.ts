import TreeMap, { AreaEntry, Rect, Point } from "./tree_map";
import {DataNode} from "./loader";
import {SearchResults} from "./search";

type FileNodeToStrFunction = (fileNode: DataNode, dataIndex: number) => string;
type ThemeName = "dark" | "light";

type Theme = {
    backgroundColor: string;
    innerColor: (i: number) => string;
    strokeColor: (i: number) => string;
    textBodyColor: string;
    outlineText: boolean;
};

class TreeMapRenderer {
    // タイル内の文字のフォントサイズ
    FONT_SIZE = 15;

    // カラーテーマ
    THEME: Record<ThemeName, Theme> = {
        "dark": {
            backgroundColor: "#1C1E23",
            innerColor: (i: number) => ("hsl(" + ((0+i*28)%360) + ", 25%, 40%)"),
            strokeColor: (i: number) => ("hsl(" + ((0+i*28)%360) + ", 50%, 70%)"),
            textBodyColor: "rgb(225,225,225)",
            outlineText: false
        },
        "light": {
            backgroundColor: "#F0F0F0",
            innerColor: (i: number) => ("hsl(" + ((0+i*28)%360) + ", 50%, 80%)"),
            strokeColor: (i: number) => ("hsl(" + ((0+i*28)%360) + ", 20%, 40%)"),
            textBodyColor: "rgb(255,255,255)",
            outlineText: true
        },
    };


    // 各タイルの中の子タイルへのマージン
    // rect の各方向に足される
    TILE_MARGIN: Rect = [8, 8 + this.FONT_SIZE, -8, -8];

    treeMap_ = new TreeMap();

    constructor() {
    }

    clear() {
        this.treeMap_.clear();
    }

    getFileNodeFromPoint(pos: Point) {
        return this.treeMap_.getFileNodeFromPoint(pos);
    };

    getPathFromFileNode(fileNode: DataNode) {
        return this.treeMap_.getPathFromFileNode(fileNode);
    };    

    // canvas に対し，tree のファイルツリーを
    // virtualWidth/virtualHeight に対応した大きさの tree map を生成し，
    // そこの上の viewPort を描画する．
    render(canvas: HTMLCanvasElement, tree: DataNode|null, pointedFileNode: DataNode|null,
        virtualWidth: number, virtualHeight: number, viewPort: Rect, dataIndex: number,
        fileNodeToStr: FileNodeToStrFunction, themeName: string, searchResults = new SearchResults()
    ) {
        let self = this;
        // let theme = this.THEME["light"];
        if (!(themeName in this.THEME)) {
            themeName = "dark";
        }
        let theme = this.THEME[themeName as ThemeName];

        let width = canvas.width;
        let height = canvas.height;

        if (!tree) {
            let c = canvas.getContext("2d") as CanvasRenderingContext2D;
            c.fillStyle = theme.backgroundColor;
            c.fillRect(0, 0, width, height);
            return;
        }

        let areas: AreaEntry[] = self.treeMap_.createTreeMap(
            tree, 
            virtualWidth, 
            virtualHeight, 
            viewPort,
            self.TILE_MARGIN,
            dataIndex
        );

        let fillStyle: string[] = [];
        //let fillFileStyle = "hsl(" + 0 + ", 70%, 70%)";
        let strokeStyle: string[] = [];
        for (let i = 0; i < 20; i++) {
            fillStyle.push(theme.innerColor(i));
            strokeStyle.push(theme.strokeColor(i));
        }

        let c = canvas.getContext("2d") as CanvasRenderingContext2D;

        c.fillStyle = theme.backgroundColor;
        c.fillRect(0, 0, width, height);


        let prevLevel = -1;
        for (let a of areas) {
            let rect = a.rect;
            // レベルに応じた色にする
            if (prevLevel != a.level) {
                c.fillStyle = fillStyle[a.level % 20];
                prevLevel = a.level;
            }
            c.fillRect(rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]);
        }

        prevLevel = -1;
        c.lineWidth = 2; 
        for (let a of areas) {
            let rect = a.rect;
            if (prevLevel != a.level) {
                // 枠線の太さもレベルに応じる?
                //c.lineWidth = Math.max(2 - a.level/2, 0.5); 
                // c.lineWidth = 1; 
                // 枠線の色は，基準色から明度をおとしたものに
                c.strokeStyle = strokeStyle[a.level % 20];
                prevLevel = a.level;
            }
            if (!a.fileNode || !a.fileNode.children) {
                // c.lineWidth = 2; 
                prevLevel = -1;
            }
            c.strokeRect(rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]);
        }       
        
        // ポインタが指しているファイルをハイライト
        // ループが異なるのは描画を上書きされないようにするため
        c.lineWidth = 6; 
        for (let a of areas) {
            if (a.fileNode == pointedFileNode) {
                // c.strokeStyle = "rgb(230,230,250)";
                c.strokeStyle = strokeStyle[a.level % 20];
                let rect = a.rect;
                c.strokeRect(rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]);
                break;
            }
        }        
        
        // 全ヒットを毎フレーム走査せず、描画対象の一致と子孫の集計だけを参照する。
        const hiddenMatches = new Map<number, number>();
        for (const area of areas) {
            if (area.fileNode) {
                hiddenMatches.set(area.fileNode.id,
                    searchResults.descendantCounts.get(area.fileNode.id) ?? 0);
            }
        }
        c.lineWidth = 4;
        c.strokeStyle = "#FFD700";
        for (const area of areas) {
            const node = area.fileNode;
            if (!node) continue;
            const matched = searchResults.matches(node);
            const parent = node.parent;
            if (parent && hiddenMatches.has(parent.id)) {
                const count = (searchResults.descendantCounts.get(node.id) ?? 0) + (matched ? 1 : 0);
                hiddenMatches.set(parent.id, hiddenMatches.get(parent.id)! - count);
            }
            if (matched) {
                const rect = area.rect;
                c.strokeRect(rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]);
                c.fillStyle = "rgba(255, 215, 0, 0.3)";
                c.fillRect(rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]);
            }
        }

        // 直接描画されない子孫のヒットを、最も近い表示中の祖先で知らせる。
        c.lineWidth = 3;
        c.strokeStyle = "#FFA500";
        c.fillStyle = "rgba(255, 165, 0, 0.20)";
        for (const area of areas) {
            if (!area.fileNode || (hiddenMatches.get(area.fileNode.id) ?? 0) <= 0) continue;
            const rect = area.rect;
            c.strokeRect(rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]);
            c.fillRect(rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]);
        }


        // 文字領域が確保できた場合は描画
        let strAreas = areas.filter((a) => {
            let rect = a.rect;
            return (rect[2] - rect[0] > 80 && rect[3] - rect[1] > 40) || a.fileNode == pointedFileNode;
        });

        // 1回太めに文字の枠線を書く
        c.font = "bold " + self.FONT_SIZE + "px 'Century Gothic', Arial, sans-serif";
        c.lineWidth = 4; 
        if (theme.outlineText) {
            prevLevel = -1;
            for (let a of strAreas) {
                if (!a.fileNode) continue;
                let rect = a.rect;
                if (prevLevel != a.level) {
                    c.strokeStyle = strokeStyle[a.level % 20];
                    prevLevel = a.level;
                }
                let pos: [number, number] = [Math.max(0, rect[0]) + (self.TILE_MARGIN[0] / 2), rect[1] + self.FONT_SIZE];
    
                if (!a.fileNode.hasChildren) {
                    // ファイル
                    pos[0] += 10;
                    pos[1] += (rect[3] - rect[1] - self.FONT_SIZE*3) / 2;
                }
                let key = a.key;
                if (a.fileNode == pointedFileNode && a.fileNode.hasChildren) {
                    key += "" + fileNodeToStr(a.fileNode, dataIndex);  // ポイントされてるところだけは表示する
                }
                c.strokeText(key, pos[0], pos[1]);
    
                if (!a.fileNode.hasChildren) {
                    c.strokeText(fileNodeToStr(a.fileNode, dataIndex), pos[0], pos[1] + self.FONT_SIZE*1.2);
                }
            }
        }
        // 次に白を重ねて書く（canvas のコンテキストをなるべく固定した方が速いので別のループに）
        c.fillStyle = theme.textBodyColor;
        for (let a of strAreas) {
            if (!a.fileNode) continue;
            let rect = a.rect;
            let pos: [number, number] = [Math.max(0, rect[0]) + (self.TILE_MARGIN[0] / 2), rect[1] + self.FONT_SIZE];
            if (!a.fileNode.hasChildren) {
                // ファイル
                pos[0] += 10;
                pos[1] += (rect[3] - rect[1] - self.FONT_SIZE*3) / 2;
            }

            let key = a.key;
            if (a.fileNode == pointedFileNode && a.fileNode.hasChildren) {
                key += "" + fileNodeToStr(a.fileNode, dataIndex);
            }
            c.fillText(key, pos[0], pos[1]);

            if (!a.fileNode.hasChildren) {
                c.fillText(fileNodeToStr(a.fileNode, dataIndex), pos[0], pos[1] + self.FONT_SIZE*1.2);
            }
        }
    }
}

export default TreeMapRenderer;
