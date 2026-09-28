import type { DataNode } from "./driver/driver";

const MATCH_PAGE_BITS = 12;
const MATCH_PAGE_SIZE = 1 << MATCH_PAGE_BITS;

class SearchResults {
    count = 0;
    totalSize = 0;
    descendantCounts = new Map<number, number>();
    // 未走査の同名ノードを光らせず、巨大なヒット配列も作らないようIDをビットで記録する。
    private readonly matchedPages_ = new Map<number, Uint32Array>();

    matches(node: DataNode): boolean {
        const page = this.matchedPages_.get(Math.floor(node.id / MATCH_PAGE_SIZE));
        const index = node.id & (MATCH_PAGE_SIZE - 1);
        return page !== undefined && (page[index >>> 5] & (1 << (index & 31))) !== 0;
    }

    addMatch(id: number): void {
        const pageId = Math.floor(id / MATCH_PAGE_SIZE);
        let page = this.matchedPages_.get(pageId);
        if (!page) {
            page = new Uint32Array(MATCH_PAGE_SIZE / 32);
            this.matchedPages_.set(pageId, page);
        }
        const index = id & (MATCH_PAGE_SIZE - 1);
        page[index >>> 5] |= 1 << (index & 31);
        this.count++;
    }
}

const SEARCH_SLICE_MS = 8;
const SEARCH_UPDATE_MS = 50;
// 読み込み後のツリーは不変。再検索のための総数はツリーと一緒に解放できる。
const nodeCounts = new WeakMap<DataNode, number>();
type SearchProgressCallback = (progress: number|null) => void;

function searchTree(root: DataNode, query: string, signal: AbortSignal,
    onProgress?: SearchProgressCallback,
    onPartialResults?: (results: SearchResults) => void,
    dataIndex = 0): Promise<SearchResults|null> {
    if (signal.aborted) return Promise.resolve(null);
    const results = new SearchResults();
    if (!query.trim()) return Promise.resolve(results);
    const term = query.toLowerCase();

    return new Promise((resolve, reject) => {
        let visits = root.walkForSearch(dataIndex);
        let total = root.searchNodeCount ?? nodeCounts.get(root) ?? null;
        let counting = onProgress !== undefined && total === null;
        let counted = 0;
        let processed = 0;
        let lastPercent: number|null|undefined;
        let lastReportedCount = 0;
        let lastResultTime = -Infinity;
        const stack: { id: number; matched: boolean; covered: boolean; count: number }[] = [];
        let timer: ReturnType<typeof setTimeout>;

        const reportProgress = (value: number|null) => {
            const percent = value === null ? null : Math.floor(value * 100);
            if (percent === lastPercent) return;
            lastPercent = percent;
            onProgress?.(percent === null ? null : percent / 100);
        };

        const cleanup = () => {
            clearTimeout(timer);
            signal.removeEventListener("abort", cancel);
            visits.return(undefined);
        };
        const cancel = () => {
            cleanup();
            resolve(null);
        };
        const step = () => {
            try {
                if (signal.aborted) return;
                if (lastPercent === undefined) reportProgress(counting ? null : 0);
                if (signal.aborted) return;
                const deadline = performance.now() + SEARCH_SLICE_MS;
                do {
                    const next = visits.next();
                    if (counting) {
                        if (next.done) {
                            total = counted;
                            nodeCounts.set(root, counted);
                            counting = false;
                            visits = root.walkForSearch(dataIndex);
                            reportProgress(0);
                            if (signal.aborted) return;
                        } else if (next.value.entering) {
                            counted++;
                        }
                        continue;
                    }
                    if (next.done) {
                        cleanup();
                        reportProgress(1);
                        resolve(signal.aborted ? null : results);
                        return;
                    }
                    const visit = next.value;
                    if (visit.entering) {
                        processed++;
                        const matched = visit.key.toLowerCase().includes(term);
                        const covered = stack[stack.length - 1]?.covered ?? false;
                        if (matched) {
                            results.addMatch(visit.id);
                            // 一致した祖先の容量には子孫も含まれるため、重複加算しない。
                            if (!covered) results.totalSize += visit.size;
                        }
                        stack.push({ id: visit.id, matched, covered: covered || matched, count: matched ? 1 : 0 });
                    } else {
                        const frame = stack.pop()!;
                        const descendantCount = frame.count - (frame.matched ? 1 : 0);
                        if (descendantCount > 0) results.descendantCounts.set(visit.id, descendantCount);
                        if (stack.length) stack[stack.length - 1].count += frame.count;
                    }
                } while (performance.now() < deadline);
                if (onPartialResults && results.count !== lastReportedCount) {
                    // 公開後も同じ結果を更新する。制御を返す前に、走査中の祖先にもヒットを反映する。
                    // 各ヒットから祖先をたどらず、開いている経路だけを下から集計する。
                    let count = 0;
                    for (let i = stack.length - 1; i >= 0; i--) {
                        const frame = stack[i];
                        count += frame.count;
                        const descendants = count - (frame.matched ? 1 : 0);
                        if (descendants > 0) results.descendantCounts.set(frame.id, descendants);
                    }
                }
                if (!counting && total !== null) {
                    // 最後の子孫集計が終わるまでは100%にしない。
                    reportProgress(Math.min(0.99, processed / Math.max(1, total)));
                }
                if (signal.aborted) return;
                const now = performance.now();
                if (onPartialResults && results.count !== lastReportedCount && now - lastResultTime >= SEARCH_UPDATE_MS) {
                    lastReportedCount = results.count;
                    onPartialResults(results);
                    // 重い描画の直後に再通知せず、次の更新まで検索に使える時間を確保する。
                    lastResultTime = performance.now();
                }
                if (signal.aborted) return;
                // Promiseのmicrotaskだけでは入力や描画へ制御が戻らない。
                timer = setTimeout(step, 0);
            } catch (error) {
                cleanup();
                reject(error);
            }
        };

        signal.addEventListener("abort", cancel, { once: true });
        // 初回も遅延し、検索中の表示と新しい入力を先に処理できるようにする。
        timer = setTimeout(step, 0);
    });
}

export { SearchResults, searchTree };
