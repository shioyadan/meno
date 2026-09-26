import type { DataNode } from "./driver/driver";

class SearchResults {
    count = 0;
    totalSize = 0;
    descendantCounts = new Map<number, number>();
    readonly term: string;

    constructor(query = "") {
        this.term = query.trim() ? query.toLowerCase() : "";
    }

    matches(node: DataNode): boolean {
        return this.term !== "" && node.key.toLowerCase().includes(this.term);
    }
}

const SEARCH_SLICE_MS = 8;
// 読み込み後のツリーは不変。再検索のための総数はツリーと一緒に解放できる。
const nodeCounts = new WeakMap<DataNode, number>();
type SearchProgressCallback = (progress: number|null) => void;

function searchTree(root: DataNode, query: string, signal: AbortSignal,
    onProgress?: SearchProgressCallback): Promise<SearchResults|null> {
    if (signal.aborted) return Promise.resolve(null);
    const results = new SearchResults(query);
    if (!results.term) return Promise.resolve(results);

    return new Promise((resolve, reject) => {
        let visits = root.walkForSearch();
        let total = root.searchNodeCount ?? nodeCounts.get(root) ?? null;
        let counting = onProgress !== undefined && total === null;
        let counted = 0;
        let processed = 0;
        let lastPercent: number|null|undefined;
        const stack: { matched: boolean; covered: boolean; count: number }[] = [];
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
                            visits = root.walkForSearch();
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
                        const matched = visit.key.toLowerCase().includes(results.term);
                        const covered = stack[stack.length - 1]?.covered ?? false;
                        if (matched) {
                            results.count++;
                            // 一致した祖先の容量には子孫も含まれるため、重複加算しない。
                            if (!covered) results.totalSize += visit.size;
                        }
                        stack.push({ matched, covered: covered || matched, count: matched ? 1 : 0 });
                    } else {
                        const frame = stack.pop()!;
                        const descendantCount = frame.count - (frame.matched ? 1 : 0);
                        if (descendantCount > 0) results.descendantCounts.set(visit.id, descendantCount);
                        if (stack.length) stack[stack.length - 1].count += frame.count;
                    }
                } while (performance.now() < deadline);
                if (!counting && total !== null) {
                    // 最後の子孫集計が終わるまでは100%にしない。
                    reportProgress(Math.min(0.99, processed / Math.max(1, total)));
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
