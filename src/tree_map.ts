//
// baseAspectX/baseAspectY: 生成するツリーマップ絶対のアスペクト比
//
import {DataNode} from "./loader";

type Point = [number, number];
type Rect = [number, number, number, number];
type Margin = Rect;
type ViewPort = Rect;
type AreasMap = Record<string, Rect>;

class DivNode {
    fileNode: DataNode|null = null;
    children: DivNode[]|null = [];
    size = 0;
    key = "";

    constructor() {
    }
}

class TreeMapCacheEntry {
    rect: Rect;
    areas: AreasMap|null;
    constructor(rect: Rect, areas: AreasMap|null) {
        this.rect = rect;
        this.areas = areas;
    }
}

interface AreaEntry {
    key: string;
    rect: Rect;
    level: number;
    fileNode: DataNode|null;
    // 末端の矩形かどうか（子が存在しても省略されている場合は true）
    isLeaf: boolean;
}

class TreeMap {
    cachedAspectRatio_ = 1.0;   // (幅)/(高さ)
    cachedDataIndex = 0; // どのエントリを参照するか
    /** @type {} */
    treeMapCache_: Record<string,TreeMapCacheEntry> = {}; // ファイルパスから分割情報へのキャッシュ
    areas_: AreaEntry[]|null = null; // 生成済み領域情報
    root_: DataNode|null = null;
    
    constructor() {
    }

    clear() {
        this.treeMapCache_ = {};
        this.areas_ = null;
        this.root_ = null;
    }

    getCriteria(fileNode: DataNode) {
        // if (!fileNode) {
        //     console.log("fileNode is null");
        // }
        return fileNode.data[fileNode.data.length > this.cachedDataIndex ? this.cachedDataIndex : 0];
    }

    // ファイルノードからパスを得る
    getPathFromFileNode(fileNode: DataNode){
        // file tree からパスを生成
        let path: string|null = fileNode?.key ?? null;
        let f = fileNode?.parent ?? null;
        while (f) {
            path = f.key + "/" + path;
            f = f.parent;
        }
        return path;
    };


    // キャッシュされたバイナリツリーを得る
    // キャッシュは fileTree 内部に直に保持される
    getDivTree(fileNode: DataNode, aspectRatio: number){
        let self = this;

        // アスペクト比が大きく変わった場合，キャッシュを無効化
        if (Math.abs(aspectRatio - self.cachedAspectRatio_) > 0.1){
            self.treeMapCache_ = {};
        }
        self.cachedAspectRatio_ = aspectRatio;

        // 上位から2階層分のキャッシュを作っていくので，ここにくるのは最上位の時のみ
        let path = self.getPathFromFileNode(fileNode);
        if (path && !(path in self.treeMapCache_)){
            let entry = new TreeMapCacheEntry(
                [0, 0, aspectRatio*1.0, 1.0],
                null
            );
            self.treeMapCache_[path] = entry;
        }

        if (!path) {
            return null as TreeMapCacheEntry|null;
        }

        let cache = self.treeMapCache_[path];

        // area が未生成の場合，ここで生成
        if (!cache.areas) {

            // 分割木を生成
            let divTree = self.makeDivTree(fileNode);

            // 分割木を元に分割領域を生成
            let areas: AreasMap = {};
            let baseRect = cache.rect;
            self.divideRects(divTree, areas, baseRect);

            // 子階層に縦横比を伝える
            if (fileNode.children) {
                for (let key in areas) {
                    let childPath = self.getPathFromFileNode(fileNode.children[key]); 
                    let r = areas[key];
                    if (childPath) {
                        self.treeMapCache_[childPath] = new TreeMapCacheEntry(
                            [0, 0, r[2] - r[0], r[3] - r[1]],
                            null
                        );
                    }
                }
            }

            // 縦横それぞれ0 から 1.0 に正規化して保存
            for (let key in areas) {
                let r = areas[key];
                r[0] /= baseRect[2] - baseRect[0];
                r[1] /= baseRect[3] - baseRect[1];
                r[2] /= baseRect[2] - baseRect[0];
                r[3] /= baseRect[3] - baseRect[1];
            }
            cache.areas = areas;
        }
        return cache;
    };

    // tree から分割木を作る
    // この分割木はバイナリツリーであり，フォルダの中のファイルの分割方法を表す．
    // このバイナリツリーは各ノードにおける左右の大きさ（ファイル容量の合計）
    // がなるべくバランスするようにしてある．これによってタイルのアスペクト比
    // が小さくなる･･･ と思う
    makeDivTree(fileNode: DataNode) {

        let fileChildren: Record<string, DataNode> = fileNode.children ?? {};
        let keys = Object.keys(fileChildren);

        // 空ディレクトリ or 容量0のファイルははずしておかないと無限ループする
        keys = keys.filter((key) => {
            return !(this.getCriteria(fileChildren[key]) <= 0);
        });
        // フィルタ結果を反映させる
        let fileChildrenFiltered: Record<string, DataNode> = {};
        for (let key of keys) {
            fileChildrenFiltered[key] = fileChildren[key];
        }

        // tree 直下のファイル/ディレクトリのサイズでソート
        keys.sort((a, b) => {
            let sizeA = this.getCriteria(fileChildren[a]);
            let sizeB = this.getCriteria(fileChildren[b]);
            if (sizeA > sizeB) return -1;
            if (sizeA < sizeB) return 1;
            return 0;
        });

        // 再帰的にツリーを作成
        // 渡された node の中身を書き換える必要があるので注意
        let self = this;
        function makeDivNode(divNode: DivNode, fileNames: string[], fileChildren: Record<string,DataNode>) {

            // 末端
            if (fileNames.length <= 1) {
                divNode.size = self.getCriteria(fileChildren[fileNames[0]]);
                divNode.key = fileNames[0];
                divNode.children = null;
                divNode.fileNode = fileChildren[fileNames[0]];
                return;
            }

            let left: string[] = [];
            let right: string[] = [];
            let leftSize = 0;
            let rightSize = 0;

            // ファイルネームは大きいものから降順にソートされてる
            for (let fileName of fileNames) {
                // 左右のうち，現在小さい方に加えることでバランスさせる
                if (leftSize < rightSize) {
                    left.push(fileName);
                    leftSize += self.getCriteria(fileChildren[fileName]);
                }
                else{
                    right.push(fileName);
                    rightSize += self.getCriteria(fileChildren[fileName]);
                }
            }

            divNode.size = leftSize + rightSize;
            divNode.children = [new DivNode, new DivNode];
            divNode.key = "";
            divNode.fileNode = null;

            makeDivNode(divNode.children[0], left, fileChildren);
            makeDivNode(divNode.children[1], right, fileChildren);
        }

        let divTree = new DivNode;
        makeDivNode(divTree, keys, fileChildrenFiltered);
        return divTree;
    };


    // 分割木から矩形のリストを再帰的に作成する
    // divNode: バイナリツリーのノード
    // divided: 分割結果の矩形のハッシュ（ファイル名 -> 矩形）
    // rect: 分割対象の矩形．これを divNode に従い再帰的に分割
    divideRects(divNode: DivNode, divided: AreasMap, rect: Rect) {
        let self = this;

        if (!divNode.children) {
            divided[divNode.key] = rect;
            return;
        }
        
        let left = rect[0];
        let top = rect[1];
        let right = rect[2];
        let bottom = rect[3];
        let width = right - left;
        let height = bottom - top;
        let ratio = 
            1.0 * 
            divNode.children[0].size / 
            (divNode.children[0].size + divNode.children[1].size);

        // 長い辺の方を分割
        let result: Rect[] = 
            (width * 1.02 > height) ?   // ラベルを考慮して少しだけ縦長に
            [
                [left, top, left + width*ratio, bottom],
                [left + width*ratio, top, right, bottom],
            ] :
            [
                [left, top, right, top + height*ratio],
                [left, top + height*ratio, right, bottom],
            ];
        self.divideRects(divNode.children[0], divided, result[0]);
        self.divideRects(divNode.children[1], divided, result[1]);
    };

    // 描画領域の作成
    createTreeMap(
        fileNode: DataNode, virtWidth: number, virtHeight: number, 
        viewPort: ViewPort, margin: Margin, dataIndex: number
    ) {
        let self = this;
        self.root_ = fileNode;
        
        // モードが変わった際はキャッシュを破棄
        if (this.cachedDataIndex != dataIndex){
            this.cachedDataIndex = dataIndex;
            self.treeMapCache_ = {};
        }

        function traverse(fileNode: DataNode, areas: AreaEntry[], virtRect: Rect, level: number) {
            let cache = self.getDivTree(fileNode, virtWidth/virtHeight);
            let width = virtRect[2] - virtRect[0];
            let height = virtRect[3] - virtRect[1];
            if (!cache) {
                return;
            }

            for (let key in cache.areas!) {
                let ar = cache.areas![key];

                let r: Rect = [
                    virtRect[0] + ar[0] * width, 
                    virtRect[1] + ar[1] * height, 
                    virtRect[0] + ar[2] * width, 
                    virtRect[1] + ar[3] * height
                ];

                // 範囲外なら，これ以上は探索しない
                if (r[0] > viewPort[2] || r[2] < viewPort[0] || 
                    r[1] > viewPort[3] || r[3] < viewPort[1]) {
                    continue;
                }
                // あまりに多い & 小さい場合はカット
                if (areas.length > 100 && (r[2] - r[0] < 4 && r[3] - r[1] < 4)){
                    continue;
                }

                areas.push({
                    key: key,
                    rect: r,
                    level: level,
                    fileNode: fileNode.children?.[key] || null,
                    isLeaf: true // いったん末端と仮定し，後段で子を展開した場合に false に更新
                });
            }

        }

        
        let rootAreaEntry: AreaEntry = {
            key: fileNode.key,
            rect: [0, 0, virtWidth, virtHeight],
            level: 0,
            fileNode: fileNode,
            isLeaf: true
        };
        let curAreas: AreaEntry[] = [rootAreaEntry];
        let wholeAreas: AreaEntry[] = [rootAreaEntry];

        for (let level = 1; level < 100; level++) {
            let nextAreas: AreaEntry[] = [];
            for (let a of curAreas) {
                if (a.fileNode && a.fileNode.children && Object.keys(a.fileNode.children).length > 0) {
                    let r: Rect = [
                        a.rect[0] + margin[0],
                        a.rect[1] + margin[1],
                        a.rect[2] + margin[2],
                        a.rect[3] + margin[3],
                    ];

                    // 一定以上の大きさなら探索
                    if (r[2] - r[0] > 40 && r[3] - r[1] > 40){
                        // 子を展開できる＝描画上は末端ではない
                        a.isLeaf = false;
                        traverse(a.fileNode, nextAreas, r, level);
                    }
                }
            }
            curAreas = nextAreas;

            // 新規追加エリアがないので抜ける
            if (nextAreas.length == 0) {
                break;
            }

            wholeAreas = wholeAreas.concat(curAreas);
        }

        // ビューポートの場所に更新
        for (let a of wholeAreas) {
            a.rect[0] -= viewPort[0];
            a.rect[1] -= viewPort[1];
            a.rect[2] -= viewPort[0];
            a.rect[3] -= viewPort[1];
        }

        // 位置判定のためにとっておく
        self.areas_ = wholeAreas;
        return wholeAreas;
    };

    // 座標からその場所のパスを得る
    getFileNodeFromPoint(pos: Point) : DataNode|null{
        let self = this;
        if (!self.areas_) {
            return null;
        }

        // 逆順にみていく
        let fileNode: DataNode|null = null;
        for (let i = self.areas_.length - 1; i >= 0; i--) {
            let r = self.areas_[i].rect;
            if (r[0] < pos[0] && pos[0] < r[2] && 
                r[1] < pos[1] && pos[1] < r[3]) {
                fileNode = self.areas_[i].fileNode;   // hit
                break;
            }
        }

        // 範囲外だった場合は ROOT を返す
        if (!fileNode) {
            fileNode = this.root_;
        }
        return fileNode;
    };

    // 座標からその場所のパスを得る
    getPathFromPoint(pos: Point) : string|null {
        let self = this;
        let fileNode = self.getFileNodeFromPoint(pos);

        // ポイントされている位置にみつからなかった
        if (!fileNode) {
            return null;
        }

        // file tree からパスを生成
        return self.getPathFromFileNode(fileNode);
    }

    // 指定した DataNode が描画範囲(viewPort)に含まれるかどうかを判定
    // 範囲チェックは virtualWidth, virtualHeight, viewPort のみで行う
    isDataNodeInView(fileNode: DataNode, virtualWidth: number, virtualHeight: number, viewPort: ViewPort): boolean {
        // 内部ユーティリティ
        function isFullyInside(r: Rect, vp: ViewPort): boolean {
            return (r[0] >= vp[0] && r[1] >= vp[1] && r[2] <= vp[2] && r[3] <= vp[3]);
        }
        function intersects(r: Rect, vp: ViewPort): boolean {
            return !(r[2] < vp[0] || r[0] > vp[2] || r[3] < vp[1] || r[1] > vp[3]);
        }

        // fileNode が属するルートを取得（描画時の root_ と異なっても計算可能）
        let root: DataNode|null = fileNode;
        while (root && root.parent && root.parent.id !== -1) {
            root = root.parent;
        }
        if (!root) {
            return false;
        }

        // ルートの仮想矩形
        let rect: Rect = [0, 0, virtualWidth, virtualHeight];
        let aspect = virtualWidth / virtualHeight;

        // ルート自身なら全体矩形
        if (fileNode === root) {
            // 交差しなければ子も不可視
            if (!intersects(rect, viewPort)) return false;
            // 親が完全に含まれていれば即 true（最適化）
            if (isFullyInside(rect, viewPort)) return true;
            // 交差のみで可視
            return true;
        }

        // 祖先から対象ノードまでのチェーンを作る（root -> ... -> fileNode）
        let chain: DataNode[] = [];
        {
            let cur: DataNode|null = fileNode;
            while (cur && cur !== root) {
                chain.push(cur);
                cur = cur.parent ?? null;
            }
            // 途中で root に辿り着けなかった場合は不可視とする
            if (!cur) {
                return false;
            }
            chain.reverse();
        }

        // 各階層で getDivTree の正規化されたエリアを辿って絶対矩形を復元
        // 親が完全にビューポートに含まれていればその時点で true を返し、
        // 交差していなければその時点で false を返す（両方とも最適化）
        let parent: DataNode = root;
        for (let child of chain) {
            // 親矩形が交差していなければ子も不可視
            if (!intersects(rect, viewPort)) {
                return false;
            }
            // 親矩形が完全包含されていれば子は必ず可視
            if (isFullyInside(rect, viewPort)) {
                return true;
            }

            let cache = this.getDivTree(parent, aspect);
            if (!cache || !cache.areas) {
                return false;
            }
            let key = child.key;
            let ar = cache.areas[key];
            // フィルタ（サイズ0など）により領域が存在しない場合は描画対象外
            if (!ar) {
                return false;
            }
            let w = rect[2] - rect[0];
            let h = rect[3] - rect[1];
            // 正規化 -> 絶対座標へ
            rect = [
                rect[0] + ar[0] * w,
                rect[1] + ar[1] * h,
                rect[0] + ar[2] * w,
                rect[1] + ar[3] * h
            ];
            parent = child;
        }

        // 最終矩形についての可視判定（交差していれば可視）
        return intersects(rect, viewPort);
    }
}
export default TreeMap;
export {TreeMap, AreaEntry, Point, Rect};
