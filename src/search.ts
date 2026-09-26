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

function searchTree(root: DataNode, query: string, signal: AbortSignal): Promise<SearchResults|null> {
    if (signal.aborted) return Promise.resolve(null);
    const results = new SearchResults(query);
    if (!results.term) return Promise.resolve(results);

    return new Promise((resolve, reject) => {
        const visits = root.walkForSearch();
        const stack: { matched: boolean; covered: boolean; count: number }[] = [];
        let timer: ReturnType<typeof setTimeout>;

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
                const deadline = performance.now() + SEARCH_SLICE_MS;
                do {
                    const next = visits.next();
                    if (next.done) {
                        cleanup();
                        resolve(results);
                        return;
                    }
                    const visit = next.value;
                    if (visit.entering) {
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
