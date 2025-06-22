import TreeMap from "./tree_map";
import {FileNode} from "./loader";

type FileNodeToStrFunction = (fileNode: FileNode, isSizeMode: boolean) => string;
type ThemeName = "dark" | "light";

class TreeMapRenderer {
    // タイル内の文字のフォントサイズ
    FONT_SIZE = 15;

    // カラーテーマ
    THEME: Record<ThemeName, any> = {
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
    TILE_MARGIN = [8, 8 + this.FONT_SIZE, -8, -8];

    treeMap_ = new TreeMap();

    constructor() {
    }

    clear() {
        this.treeMap_.clear();
    }

    getFileNodeFromPoint(pos: number[]) {
        return this.treeMap_.getFileNodeFromPoint(pos);
    };

    getPathFromFileNode(fileNode: FileNode) {
        return this.treeMap_.getPathFromFileNode(fileNode);
    };    // canvas に対し，tree のファイルツリーを
    // virtualWidth/virtualHeight に対応した大きさの tree map を生成し，
    // そこの上の viewPort を描画する．
    render(canvas: any, tree: FileNode|null, pointedFileNode: FileNode|null,
        virtualWidth: number, virtualHeight: number, viewPort: number[], isSizeMode: boolean,
        fileNodeToStr: FileNodeToStrFunction, themeName: string, searchResults: FileNode[] = []
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
            let c = canvas.getContext("2d");
            c.fillStyle = theme.backgroundColor;
            c.fillRect(0, 0, width, height);
            return;
        }

        let areas = self.treeMap_.createTreeMap(
            tree, 
            virtualWidth, 
            virtualHeight, 
            viewPort,
            self.TILE_MARGIN,
            isSizeMode
        );

        let fillStyle = [];
        //let fillFileStyle = "hsl(" + 0 + ", 70%, 70%)";
        let strokeStyle = [];
        for (let i = 0; i < 20; i++) {
            fillStyle.push(theme.innerColor(i));
            strokeStyle.push(theme.strokeColor(i));
        }

        let c = canvas.getContext("2d");

        c.fillStyle = theme.backgroundColor;
        c.fillRect(0, 0, width, height);


        let prevLevel = -1;
        for (let a of areas) {
            let rect = a.rect;
            // レベルに応じた色にする
            if (prevLevel != a.level) {
                c.fillStyle = fillStyle[a.level];
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
            if (!a.fileNode.children) {
                // c.lineWidth = 2; 
                prevLevel = -1;
            }
            c.strokeRect(rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]);
        }        // ポインタが指しているファイルをハイライト
        // ループが異なるのは描画を上書きされないようにするため
        c.lineWidth = 6; 
        for (let a of areas) {
            if (a.fileNode == pointedFileNode) {
                // c.strokeStyle = "rgb(230,230,250)";
                c.strokeStyle = strokeStyle[a.level];
                let rect = a.rect;
                c.strokeRect(rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]);
                break;
            }
        }        // 検索結果のノードをハイライト
        c.lineWidth = 4; 
        c.strokeStyle = "#FFD700"; // ゴールド色でハイライト
        for (let a of areas) {
            if (searchResults.includes(a.fileNode)) {
                let rect = a.rect;
                c.strokeRect(rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]);
                
                // 検索結果のノードには半透明のオーバーレイを追加
                c.fillStyle = "rgba(255, 215, 0, 0.3)"; // 半透明のゴールド
                c.fillRect(rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]);
            }
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
                let rect = a.rect;
                if (prevLevel != a.level) {
                    c.strokeStyle = strokeStyle[a.level];
                    prevLevel = a.level;
                }
                let pos = [Math.max(0, rect[0]) + self.TILE_MARGIN[0]/2, rect[1] + self.FONT_SIZE];
    
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
            let rect = a.rect;
            let pos = [Math.max(0, rect[0]) + self.TILE_MARGIN[0]/2, rect[1] + self.FONT_SIZE];
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
