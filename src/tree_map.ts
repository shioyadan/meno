//
// baseAspectX/baseAspectY: 生成するツリーマップ絶対のアスペクト比
//
import {FileNode} from "./file_info";

class DivNode {
    fileNode: FileNode|null = null;
    children: DivNode[]|null = [];
    size = 0;
    key = "";

    constructor() {
    }
}

class TreeMapCacheEntry {
    rect: number[];
    areas: any;
    constructor(rect: number[], areas: any) {
        this.rect = rect;
        this.areas = areas;
    }
}

class TreeMap {
    cachedAspectRatio_ = 1.0;   // (幅)/(高さ)
    cachedSizeMode = true; // size で描画するかどうか
    /** @type {} */
    treeMapCache_: Record<string,TreeMapCacheEntry> = {}; // ファイルパスから分割情報へのキャッシュ
    areas_: any = null; // 生成済み領域情報
    root_: FileNode|null = null;
    
    constructor() {
    }

    clear() {
        this.treeMapCache_ = {};
        this.areas_ = null;
        this.root_ = null;
    }

    getCriteria(fileNode: FileNode) {
        return this.cachedSizeMode ? fileNode.size : fileNode.fileCount;
    }

    // ファイルノードからパスを得る
    getPathFromFileNode(fileNode: FileNode){
        // if (!fileNode) {
        //     return null;
        // }

        // file tree からパスを生成
        let path = fileNode.key;
        let f = fileNode.parent;
        while (f) {
            path = f.key + "/" + path;
            f = f.parent;
        }
        return path;
    };


    // キャッシュされたバイナリツリーを得る
    // キャッシュは fileTree 内部に直に保持される
    getDivTree(fileNode: FileNode, aspectRatio: number){
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
            return null;
        }

        let cache = self.treeMapCache_[path];

        // area が未生成の場合，ここで生成
        if (!cache.areas) {

            // 分割木を生成
            let divTree = self.makeDivTree(fileNode);

            // 分割木を元に分割領域を生成
            let areas: Record<string, number[]> = {};
            let baseRect = cache.rect;
            self.divideRects(divTree, areas, baseRect);

            // 子階層に縦横比を伝える
            if (fileNode.children) {
                for (let key in areas) {
                    let childPath = self.getPathFromFileNode(fileNode.children[key]); 
                    let r = areas[key];
                    self.treeMapCache_[childPath] = new TreeMapCacheEntry(
                        [0, 0, r[2] - r[0], r[3] - r[1]],
                        null
                    );
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
    makeDivTree(fileNode: FileNode) {
        let fileChildren = fileNode.children;
        if (!fileChildren) {
            fileChildren = {};
        }
        let keys = Object.keys(fileChildren);

        // 空ディレクトリ or 容量0のファイルははずしておかないと無限ループする
        keys = keys.filter((key) => {
            return !(this.getCriteria(fileChildren[key]) < 1);
        });

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
        function makeDivNode(divNode: DivNode, fileNames: string[], fileChildren: Record<string,FileNode>) {

            // 末端
            if (fileNames.length <= 1) {
                divNode.size = self.getCriteria(fileChildren[fileNames[0]]);
                divNode.key = fileNames[0];
                divNode.children = null;
                divNode.fileNode = fileChildren[fileNames[0]];
                return;
            }

            let left = [];
            let right = [];
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
        makeDivNode(divTree, keys, fileChildren);
        return divTree;
    };


    // 分割木から矩形のリストを再帰的に作成する
    // divNode: バイナリツリーのノード
    // divided: 分割結果の矩形のハッシュ（ファイル名 -> 矩形）
    // rect: 分割対象の矩形．これを divNode に従い再帰的に分割
    divideRects(divNode: DivNode, divided: Record<string,number[]>, rect: number[]) {
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
        let result = 
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
        fileNode: FileNode, virtWidth: number, virtHeight: number, 
        viewPort: number[], margin: number[], isSizeMode: boolean
    ) {
        let self = this;
        self.root_ = fileNode;
        
        // モードが変わった際はキャッシュを破棄
        if (this.cachedSizeMode != isSizeMode){
            this.cachedSizeMode = isSizeMode;
            self.treeMapCache_ = {};
        }

        function traverse(fileNode: FileNode, areas: any, virtRect: number[], level: number) {
            let cache = self.getDivTree(fileNode, virtWidth/virtHeight);
            let width = virtRect[2] - virtRect[0];
            let height = virtRect[3] - virtRect[1];
            if (!cache) {
                return;
            }

            for (let key in cache.areas) {
                let ar = cache.areas[key];

                let r = [
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
                    fileNode: fileNode.children?.[key] || null
                });
            }

        }

        
        let wholeAreas: any[] = []; // {key, rect, level, fileNode}
        let curAreas: any[] = [];
        traverse(fileNode, curAreas, [0, 0, virtWidth, virtHeight], 0);
        wholeAreas = wholeAreas.concat(curAreas);

        for (let level = 1; level < 100; level++) {
            let nextAreas: any[] = [];
            for (let a of curAreas) {
                if (a.fileNode.children) {
                    let r = [
                        a.rect[0] + margin[0],
                        a.rect[1] + margin[1],
                        a.rect[2] + margin[2],
                        a.rect[3] + margin[3],
                    ];

                    // 一定以上の大きさなら探索
                    if (r[2] - r[0] > 40 && r[3] - r[1] > 40){
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
    getFileNodeFromPoint(pos: number[]){
        let self = this;
        if (!self.areas_) {
            return null;
        }

        // 逆順にみていく
        let fileNode = null;
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
    getPathFromPoint(pos: number[]){
        let self = this;
        let fileNode = self.getFileNodeFromPoint(pos);

        // ポイントされている位置にみつからなかった
        if (!fileNode) {
            return null;
        }

        // file tree からパスを生成
        return self.getPathFromFileNode(fileNode);
    }
}
export default TreeMap;


