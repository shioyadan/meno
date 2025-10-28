import TreeMap, { AreaEntry, Rect, Point } from "./tree_map";
import {DataNode} from "./loader";

type FileNodeToStrFunction = (fileNode: DataNode, isSizeMode: boolean) => string;
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
        virtualWidth: number, virtualHeight: number, viewPort: Rect, isSizeMode: boolean,
        fileNodeToStr: FileNodeToStrFunction, themeName: string, searchResults: DataNode[] = []
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
            isSizeMode
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
        
        // 検索結果のノードをハイライト
        c.lineWidth = 4; 
        const searchSet = new Set<DataNode>(searchResults);
        c.strokeStyle = "#FFD700"; // ゴールド色でハイライト
        for (let a of areas) {
            if (a.fileNode && searchSet.has(a.fileNode)) {
                searchSet.delete(a.fileNode); // 重複描画防止のため削除
                let rect = a.rect;
                c.strokeRect(rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]);
                
                // 検索結果のノードには半透明のオーバーレイを追加
                c.fillStyle = "rgba(255, 215, 0, 0.3)"; // 半透明のゴールド
                c.fillRect(rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]);
            }
        }

        // 子ノードに検索結果が含まれている場合もハイライト
        // 検索にヒットしたノードが描画範囲にある場合でかつ，小さすぎて描画が省略されている場合，
        // その祖先ノードもハイライトする
        const collectHighlightAreas = (areas: AreaEntry[], searchSet: Set<DataNode>): AreaEntry[] => {

            // areas の id(a.fileNode.id) -> area のマップを用意
            const areaById = new Map<number, AreaEntry>();
            for (const a of areas) {
                if (a.fileNode && a.fileNode.id != -1) {
                    areaById.set(a.fileNode.id, a);
                }
            }

            // ノード s の祖先を親方向にたどり，最初に見つかった描画対象エリアを返す
            const getHighlightArea = (s: DataNode): AreaEntry | null => {
                if (!self.treeMap_.isDataNodeInView(s, virtualWidth, virtualHeight, viewPort)) {
                    return null; // ビューポート外なら無視
                }
                let p = s.parent;
                while (p) {
                    const pid = p.id;
                    if (pid === -1) break; // ルート想定（または終端）
                    const hitArea = areaById.get(pid);
                    if (hitArea) return hitArea; // 最初に見つかった祖先エリア
                    p = p.parent;
                }
                return null;
            };

            // ハイライト対象エリアを重複なく収集
            // すでに描画した親ノードの重複描画を避ける
            const painted = new Set<number>();
            const list: AreaEntry[] = [];
            for (let s of searchSet) {
                const hitArea = getHighlightArea(s);
                if (!hitArea) continue;

                const pid = hitArea.fileNode?.id;
                if (pid == null || pid === -1) continue;

                if (!painted.has(pid)) {  // 祖先のヒット確認をやった後じゃないと同一階層の別のものが無視される
                    list.push(hitArea);
                    painted.add(pid);
                }
            }
            return list;
        };

        // 収集したエリアを描画
        c.lineWidth = 3;
        c.strokeStyle = "#FFA500"; // 直接一致より少しオレンジ寄り
        const highlightAreas = collectHighlightAreas(areas, searchSet);
        for (const a of highlightAreas) {
            const rect = a.rect;
            c.strokeRect(rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]);

            // 子に検索結果がいることを示すため，やや弱めのオーバーレイ
            c.fillStyle = "rgba(255, 165, 0, 0.20)"; // 半透明のオレンジ
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
                    key += "" + fileNodeToStr(a.fileNode, isSizeMode);  // ポイントされてるところだけは表示する
                }
                c.strokeText(key, pos[0], pos[1]);
    
                if (!a.fileNode.hasChildren) {
                    c.strokeText(fileNodeToStr(a.fileNode, isSizeMode), pos[0], pos[1] + self.FONT_SIZE*1.2);
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
                key += "" + fileNodeToStr(a.fileNode, isSizeMode);
            }
            c.fillText(key, pos[0], pos[1]);

            if (!a.fileNode.hasChildren) {
                c.fillText(fileNodeToStr(a.fileNode, isSizeMode), pos[0], pos[1] + self.FONT_SIZE*1.2);
            }
        }
    }
}

export default TreeMapRenderer;
