const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

// NodeではwebpackのWorker変換がないため、非圧縮入力の検証用に境界だけを置き換える。
require.extensions['.ts'] = (module, filename) => {
    if (filename.endsWith('/zstd_worker.ts')) {
        module.exports = { __esModule: true, default: class {
            constructor() { throw new Error('Compressed input requires the browser test runner'); }
        } };
        return;
    }
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
    }).outputText;
    module._compile(source, filename);
};
global.localStorage = { getItem: () => null };
const { DataNode, FileReader } = require('../src/driver/driver.ts');
const FileInfoDriver = require('../src/driver/file_info.ts').default;
const { searchTree, SearchResults } = require('../src/search.ts');
const { default: Store, ACTION, CHANGE } = require('../src/store.ts');
const Renderer = require('../src/tree_map_renderer.ts').default;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const search = (root, query) => searchTree(root, query, new AbortController().signal);
const row = (id, parent, key, directory, size) =>
    [id, parent, JSON.stringify(key).slice(1, -1), +directory, 1, size].join('\t') + '\n';
function load(text) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader(text);
        reader.onError(reject);
        new FileInfoDriver().load(reader, resolve, () => {}, error => { reader.cancel(); reject(new Error(error)); });
    });
}
function node(id, key, size, children = []) {
    const value = new DataNode();
    Object.assign(value, { id, key, data: [size], children: Object.create(null) });
    for (const child of children) { value.children[child.key] = child; child.parent = value; }
    return value;
}
function fixture() {
    return node(1, '/root', 35, [node(2, 'MATCH-dir', 30, [
        node(3, 'match.txt', 10), node(4, 'other', 20)
    ]), node(5, 'match-outside', 5)]);
}
function storeFor(root) {
    const store = new Store();
    store.tree = store.originalTree = store.currentRootNode = root;
    return store;
}
async function settled(store) {
    for (let i = 0; i < 2000; i++) {
        if (!store.searching) { await delay(0); return; }
        await delay(2);
    }
    throw new Error('Search did not settle');
}

function paceTraversal(t, root) {
    // 小さな木でも入退場ごとに時間枠を越え、途中表示と取消を再現できるようにする。
    let now = 0;
    t.mock.method(performance, 'now', () => now);
    const walk = root.walkForSearch.bind(root);
    root.walkForSearch = function* () {
        for (const visit of walk()) { now += 9; yield visit; }
    };
    return milliseconds => { now += milliseconds; };
}

function createHighlightRenderer(root, visible) {
    const renderer = new Renderer();
    renderer.treeMap_.createTreeMap = () => visible.map((fileNode, i) => ({
        fileNode, key: fileNode.key, rect: [i * 100, 0, i * 100 + 90, 80], level: i ? 1 : 0, isLeaf: i > 0
    }));
    const outlines = [];
    const context = {
        fillRect() {}, fillText() {}, strokeText() {},
        strokeRect(...rect) { outlines.push({ color: this.strokeStyle, rect }); }
    };
    const canvas = { width: 1000, height: 800, getContext: () => context };
    return results => {
        outlines.length = 0;
        renderer.render(canvas, root, null, 1000, 800, [0, 0, 1000, 800], 0, () => '', 'dark', results);
        return outlines;
    };
}

test('search preserves case-insensitive matching and excludes overlapping ancestor totals', async () => {
    const root = fixture();
    const result = await search(root, 'mAtCh');
    assert.equal(result.count, 3);
    assert.equal(result.totalSize, 35);
    assert.equal(result.descendantCounts.get(1), 3);
    assert.equal(result.descendantCounts.get(2), 1);
    assert.equal(result.matches(root.children['MATCH-dir']), true);
    assert.equal(result.matches(root), false);
    assert.equal((await search(root, 'absent')).count, 0);
    assert.equal((await search(root, '   ')).count, 0);
    assert.equal((await search(root, ' match')).count, 0);
});

test('compact traversal agrees with ordinary nodes without materializing children or wrappers', async () => {
    const text = row(1, 0, '/root', true, 0) + row(2, 1, 'MATCH-dir', true, 0)
        + row(3, 2, 'match.txt', false, 10) + row(4, 2, 'other', false, 20) + row(5, 1, 'match-outside', false, 5);
    const compact = await load(text);
    const ordinary = fixture();
    const cacheCounts = () => [compact.store_.nodeCache_.size, compact.store_.childrenCache_.size, compact.store_.dataCache_.size];
    const before = cacheCounts();
    for (const query of ['match', 'other', '/root', 'absent']) {
        const actual = await search(compact, query);
        const expected = await search(ordinary, query);
        assert.deepEqual(actual, expected);
    }
    assert.deepEqual(cacheCounts(), before);
});

test('Unicode and special property names remain searchable', async () => {
    const root = await load(row(1, 0, '/', true, 0) + row(2, 1, '__proto__', false, 5)
        + row(3, 1, '日本語😀', false, 7) + row(4, 1, 'space name', false, 11));
    assert.equal((await search(root, '__proto__')).totalSize, 5);
    assert.equal((await search(root, '本語😀')).totalSize, 7);
    assert.equal((await search(root, 'space name')).totalSize, 11);
});

test('matched IDs remain distinct across bit and page boundaries and sparse IDs', async () => {
    const ids = [-1, 0, 31, 32, 4095, 4096, 2147483647];
    const children = ids.map(id => node(id, 'match-' + id, 1));
    const root = node(100, '/root', children.length, children);
    const result = await search(root, 'match');
    assert.equal(result.count, ids.length);
    for (const child of children) assert.equal(result.matches(child), true);
    for (const id of [1, 30, 33, 4094, 4097, 2147483646]) {
        assert.equal(result.matches(node(id, 'match-unvisited', 1)), false);
    }
    assert.equal(result.matches(root), false);
});

test('partial results include only discovered matches and consistent open ancestor totals', async t => {
    const root = fixture();
    const directory = root.children['MATCH-dir'];
    const nodes = [root, directory, ...Object.values(directory.children), root.children['match-outside']];
    paceTraversal(t, root);
    const snapshots = [];
    const result = await searchTree(root, 'match', new AbortController().signal, () => {}, partial => {
        const matches = nodes.filter(value => partial.matches(value));
        assert.equal(partial.count, matches.length);
        let total = 0;
        for (const value of matches) {
            let parent = value.parent;
            while (parent && !partial.matches(parent)) parent = parent.parent;
            if (!parent) total += value.data[0];
        }
        assert.equal(partial.totalSize, total);
        for (const value of nodes) {
            const descendants = matches.filter(match => {
                let parent = match.parent;
                while (parent && parent !== value) parent = parent.parent;
                return parent === value;
            }).length;
            assert.equal(partial.descendantCounts.get(value.id) ?? 0, descendants);
        }
        snapshots.push({ count: partial.count, time: performance.now(), ids: matches.map(value => value.id) });
    });
    assert.deepEqual(snapshots[0].ids, [directory.id]);
    assert.ok(snapshots.every((snapshot, i) => !i || snapshot.time - snapshots[i - 1].time >= 50));
    assert.equal(result.count, 3);
    assert.equal(result.totalSize, 35);
    assert.equal(result.descendantCounts.get(root.id), 3);
});

test('slow partial-result listeners leave time for traversal between redraws', async t => {
    const root = node(1, '/root', 20,
        Array.from({ length: 20 }, (_, i) => node(i + 2, 'match-' + i, 1)));
    const advance = paceTraversal(t, root);
    const updates = [];
    await searchTree(root, 'match', new AbortController().signal, undefined, () => {
        updates.push(performance.now());
        advance(80);
    });
    assert.ok(updates.length > 1);
    assert.ok(updates.every((time, i) => !i || time - updates[i - 1] >= 80 + 50));
});

test('wide compact trees cross node pages and yield to other event-loop work', async () => {
    const rows = [row(1, 0, '/', true, 0)];
    for (let id = 2; id <= 270001; id++) rows.push(row(id, 1, 'item-' + id, false, 1));
    const root = await load(rows.join(''));
    let ticks = 0;
    const progress = [];
    const timer = setInterval(() => { ticks++; }, 1);
    try {
        const result = await searchTree(root, 'item', new AbortController().signal, value => progress.push(value));
        assert.equal(result.count, 270000);
        assert.equal(result.totalSize, 270000);
        assert.equal(result.descendantCounts.size, 1);
        assert.ok(ticks > 2, `Only ${ticks} event-loop ticks occurred`);
        assert.equal(root.store_.nodeCache_.size, 1);
        assert.equal(root.store_.childrenCache_.size, 0);
        assert.equal(root.store_.keyIntern_.size, 0);
        assert.equal(root.searchNodeCount, 270001);
        assert.equal(progress[0], 0);
        assert.equal(progress.at(-1), 1);
        assert.ok(progress.some(value => value > 0 && value < 1));
        assert.ok(progress.every((value, index) => value !== null && value >= 0 && value <= 1
            && (index === 0 || value > progress[index - 1])));
    } finally { clearInterval(timer); }
});

test('unknown totals are counted asynchronously and reused on the next search', async () => {
    const root = fixture();
    const original = root.walkForSearch.bind(root);
    let traversals = 0;
    root.walkForSearch = () => { traversals++; return original(); };
    const first = [];
    const result = await searchTree(root, 'match', new AbortController().signal, value => first.push(value));
    assert.equal(traversals, 2);
    assert.equal(first[0], null);
    assert.ok(first.includes(0));
    assert.equal(first.at(-1), 1);
    assert.equal(result.count, 3);
    const second = [];
    await searchTree(root, 'other', new AbortController().signal, value => second.push(value));
    assert.equal(traversals, 3);
    assert.equal(second[0], 0);
    assert.equal(second.at(-1), 1);
});

test('subtree progress counts the selected subtree including directories', async () => {
    const root = await load(row(1, 0, '/', true, 0) + row(2, 1, 'dir', true, 0)
        + row(3, 2, 'match', false, 5) + row(4, 1, 'other', false, 1));
    assert.equal(root.searchNodeCount, 4);
    const subtree = root.children.dir;
    assert.equal(subtree.searchNodeCount, null);
    const progress = [];
    const result = await searchTree(subtree, 'match', new AbortController().signal, value => progress.push(value));
    assert.equal(result.count, 1);
    assert.equal(result.totalSize, 5);
    assert.equal(progress[0], null);
    assert.equal(progress.at(-1), 1);
});

test('empty directory roots have one search node despite containing no files', async () => {
    const root = await load(row(1, 0, '/empty', true, 0));
    assert.equal(root.searchNodeCount, 1);
    assert.equal(root.fileCount, 0);
    const progress = [];
    const result = await searchTree(root, 'empty', new AbortController().signal, value => progress.push(value));
    assert.equal(result.count, 1);
    assert.deepEqual(progress, [0, 1]);
});

test('canceling during counting does not publish further progress', async () => {
    const controller = new AbortController();
    const progress = [];
    const result = await searchTree(fixture(), 'match', controller.signal, value => {
        progress.push(value);
        controller.abort();
    });
    assert.equal(result, null);
    await delay(15);
    assert.deepEqual(progress, [null]);
});

test('search progress events do not publish results and stop when a query is replaced', async () => {
    const root = fixture();
    const store = storeFor(root);
    const updates = []; const completions = [];
    store.on(CHANGE.SEARCH_RESULTS_CHANGED, () => {
        if (!store.searching) completions.push(store.searchQuery);
    });
    store.on(CHANGE.SEARCH_PROGRESS, () => {
        assert.equal(store.searchResults.count, 0);
        updates.push({ query: store.searchQuery, value: store.searchProgress });
        if (store.searchQuery === 'match') store.trigger(ACTION.SEARCH_NODES, 'other');
    });
    store.trigger(ACTION.SEARCH_NODES, 'match');
    await settled(store);
    assert.deepEqual(completions, ['other']);
    assert.equal(updates.filter(update => update.query === 'match').length, 1);
    assert.equal(updates.at(-1).query, 'other');
    assert.equal(updates.at(-1).value, 1);
    assert.equal(store.searchProgress, 1);
    store.trigger(ACTION.CLEAR_SEARCH);
    assert.equal(store.searchProgress, 0);
    store.releaseCurrentTree_();
    assert.equal(store.searchProgress, 0);
});

test('ordinary and compact trees support very deep hierarchies', async () => {
    let ordinary = node(15000, 'match', 1);
    const rows = [];
    for (let id = 14999; id >= 1; id--) ordinary = node(id, 'match', 1, [ordinary]);
    for (let id = 1; id <= 15000; id++) rows.push(row(id, id - 1, 'match', id < 15000, 1));
    for (const root of [ordinary, await load(rows.join(''))]) {
        const result = await searchTree(root, 'match', new AbortController().signal, undefined, partial => {
            assert.equal(partial.descendantCounts.get(root.id) ?? 0, partial.count - 1);
        });
        assert.equal(result.count, 15000);
        assert.equal(result.totalSize, 1);
        assert.equal(result.descendantCounts.get(1), 14999);
    }
});

test('an already aborted search does not begin traversal', async () => {
    const controller = new AbortController(); controller.abort();
    const root = fixture(); root.walkForSearch = () => { throw new Error('Traversal started'); };
    assert.equal(await searchTree(root, 'match', controller.signal), null);
});

test('canceling a running search stops traversal and releases its iterator', async () => {
    const controller = new AbortController();
    let visits = 0; let closed = false;
    const root = fixture();
    root.walkForSearch = function* () {
        try {
            for (let id = 1; id <= 1000000; id++) {
                visits++;
                yield { entering: true, id, key: 'match', size: 1 };
                yield { entering: false, id };
            }
        } finally { closed = true; }
    };
    const pending = searchTree(root, 'match', controller.signal);
    setTimeout(() => controller.abort(), 0);
    assert.equal(await pending, null);
    assert.ok(visits > 0 && visits < 1000000);
    assert.equal(closed, true);
    const stoppedAt = visits; await delay(15); assert.equal(visits, stoppedAt);
});

test('a newer query replaces pending results and exposes a searching state', async () => {
    const store = storeFor(fixture()); const completed = [];
    store.on(CHANGE.SEARCH_RESULTS_CHANGED, () => { if (!store.searching) completed.push(store.searchQuery); });
    store.trigger(ACTION.SEARCH_NODES, 'match');
    assert.equal(store.searching, true);
    assert.equal(store.searchResults.count, 0);
    store.trigger(ACTION.SEARCH_NODES, 'other');
    await settled(store);
    assert.deepEqual(completed, ['other']);
    assert.equal(store.searchResults.count, 1);
    assert.equal(store.searchResults.totalSize, 20);
});

test('clearing a pending search prevents late results from reappearing', async () => {
    const store = storeFor(fixture());
    store.trigger(ACTION.SEARCH_NODES, 'match');
    store.trigger(ACTION.CLEAR_SEARCH);
    await delay(20);
    assert.equal(store.searching, false);
    assert.equal(store.searchQuery, '');
    assert.equal(store.searchResults.count, 0);
    assert.equal(store.searchResults.matches(fixture()), false);
});

test('releasing a tree cancels its pending search', async () => {
    const store = storeFor(fixture());
    store.trigger(ACTION.SEARCH_NODES, 'match');
    store.releaseCurrentTree_();
    await delay(20);
    assert.equal(store.tree, null);
    assert.equal(store.searching, false);
    assert.equal(store.searchResults.count, 0);
});

test('published partial highlights are cleared or replaced without late updates', async t => {
    for (const action of ['clear', 'release', 'query', 'root', 'file']) {
        await t.test(action, async t => {
            const root = fixture();
            paceTraversal(t, root);
            const store = storeFor(root);
            let partial;
            let stoppedCount;
            const completions = [];
            store.on(CHANGE.SEARCH_RESULTS_CHANGED, () => {
                if (!store.searching) completions.push(store.searchQuery);
                if (partial || !store.searching || !store.searchResults.count) return;
                partial = store.searchResults;
                assert.equal(partial.matches(root.children['MATCH-dir']), true);
                assert.equal(partial.matches(root.children['match-outside']), false);
                stoppedCount = partial.count;
                if (action === 'clear') store.trigger(ACTION.CLEAR_SEARCH);
                if (action === 'release') store.releaseCurrentTree_();
                if (action === 'query') store.trigger(ACTION.SEARCH_NODES, 'other');
                if (action === 'root') store.trigger(ACTION.SET_ROOT_NODE, root.children['MATCH-dir']);
                if (action === 'file') store.trigger(ACTION.FILE_IMPORT,
                    row(1, 0, 'replacement', true, 0) + row(2, 1, 'match-new', false, 99));
                assert.notEqual(store.searchResults, partial);
                assert.equal(store.searchResults.count, 0);
            });
            store.trigger(ACTION.SEARCH_NODES, 'match');
            if (action === 'file') await new Promise(resolve => store.on(CHANGE.TREE_LOADED, resolve));
            await settled(store);
            await delay(20);
            assert.ok(partial);
            assert.equal(partial.count, stoppedCount);
            const expectedCount = { clear: 0, release: 0, query: 1, root: 2, file: 1 }[action];
            assert.equal(store.searchResults.count, expectedCount);
            if (action === 'query') assert.deepEqual(completions, ['other']);
            if (action === 'root') assert.equal(store.searchResults.matches(root.children['match-outside']), false);
            if (action === 'file') assert.equal(store.searchResults.totalSize, 99);
        });
    }
});

test('a search failure removes already published partial highlights', async t => {
    const root = fixture();
    paceTraversal(t, root);
    const walk = root.walkForSearch.bind(root);
    root.walkForSearch = function* () {
        for (const visit of walk()) {
            if (visit.entering && visit.id === 3) throw new Error('Expected partial traversal failure');
            yield visit;
        }
    };
    Object.defineProperty(root, 'searchNodeCount', { value: 5 });
    t.mock.method(console, 'error', () => {});
    const store = storeFor(root);
    let hadPartial = false;
    store.on(CHANGE.SEARCH_RESULTS_CHANGED, () => {
        if (store.searching && store.searchResults.count) hadPartial = true;
    });
    store.trigger(ACTION.SEARCH_NODES, 'match');
    await settled(store);
    assert.equal(hadPartial, true);
    assert.equal(store.searchError, 'Search failed');
    assert.equal(store.searchResults.count, 0);
    assert.equal(store.searchResults.matches(root.children['MATCH-dir']), false);
});

test('loading another file searches the replacement tree only', async () => {
    const store = storeFor(fixture());
    store.trigger(ACTION.SEARCH_NODES, 'match');
    await new Promise(resolve => {
        store.on(CHANGE.TREE_LOADED, resolve);
        store.trigger(ACTION.FILE_IMPORT, row(1, 0, 'replacement', true, 0) + row(2, 1, 'match-new', false, 99));
    });
    await settled(store);
    assert.equal(store.tree.key, 'replacement');
    assert.equal(store.searchResults.count, 1);
    assert.equal(store.searchResults.totalSize, 99);
});

test('changing the displayed root restarts the query within the new subtree', async () => {
    const root = fixture(); const store = storeFor(root);
    store.trigger(ACTION.SEARCH_NODES, 'match');
    store.trigger(ACTION.SET_ROOT_NODE, root.children['MATCH-dir']);
    await settled(store);
    assert.equal(store.searchResults.count, 2);
    assert.equal(store.searchResults.totalSize, 30);
    store.trigger(ACTION.SET_PARENT_AS_ROOT);
    await settled(store);
    assert.equal(store.searchResults.count, 3);
    store.trigger(ACTION.SET_ROOT_NODE, root.children['MATCH-dir']);
    store.trigger(ACTION.RESET_ROOT_NODE);
    await settled(store);
    assert.equal(store.searchResults.count, 3);
});

test('search errors leave the store responsive and a subsequent search can succeed', async t => {
    const root = fixture(); const original = root.walkForSearch;
    root.walkForSearch = function* () { throw new Error('Expected traversal failure'); };
    const store = storeFor(root);
    t.mock.method(console, 'error', () => {});
    store.trigger(ACTION.SEARCH_NODES, 'match'); await settled(store);
    assert.equal(store.searchError, 'Search failed');
    root.walkForSearch = original;
    store.trigger(ACTION.SEARCH_NODES, 'match'); await settled(store);
    assert.equal(store.searchError, null);
    assert.equal(store.searchResults.count, 3);
});

test('renderer highlights direct and omitted descendant matches using visible areas only', async () => {
    const root = fixture(); const result = await search(root, 'match');
    const render = createHighlightRenderer(root, [root, root.children['MATCH-dir'], root.children['match-outside']]);
    const outlines = render(result);
    assert.equal(outlines.filter(x => x.color === '#FFD700').length, 2);
    assert.deepEqual(outlines.filter(x => x.color === '#FFA500').map(x => x.rect), [[100, 0, 90, 80]]);
    assert.equal(render(new SearchResults()).filter(x => ['#FFD700', '#FFA500'].includes(x.color)).length, 0);
});

test('renderer updates discovered direct and hidden matches before the search finishes', async t => {
    const root = fixture();
    const directory = root.children['MATCH-dir'];
    for (let id = 10; id < 20; id++) {
        const padding = node(id, 'padding-' + id, 0);
        padding.parent = directory;
        directory.children[padding.key] = padding;
    }
    paceTraversal(t, root);
    const render = createHighlightRenderer(root, [root, directory, root.children['match-outside']]);
    let sawHidden = false;
    await searchTree(root, 'match', new AbortController().signal, () => {}, partial => {
        if (partial.count > 2) return;
        const outlines = render(partial);
        assert.deepEqual(outlines.filter(x => x.color === '#FFD700').map(x => x.rect), [[100, 0, 90, 80]]);
        const orange = outlines.filter(x => x.color === '#FFA500').map(x => x.rect);
        assert.deepEqual(orange, partial.count === 2 ? [[100, 0, 90, 80]] : []);
        if (partial.count === 2) sawHidden = true;
    });
    assert.equal(sawHidden, true);
});
