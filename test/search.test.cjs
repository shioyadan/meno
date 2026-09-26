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

test('wide compact trees cross node pages and yield to other event-loop work', async () => {
    const rows = [row(1, 0, '/', true, 0)];
    for (let id = 2; id <= 270001; id++) rows.push(row(id, 1, 'item-' + id, false, 1));
    const root = await load(rows.join(''));
    let ticks = 0;
    const timer = setInterval(() => { ticks++; }, 1);
    try {
        const result = await search(root, 'item');
        assert.equal(result.count, 270000);
        assert.equal(result.totalSize, 270000);
        assert.equal(result.descendantCounts.size, 1);
        assert.ok(ticks > 2, `Only ${ticks} event-loop ticks occurred`);
        assert.equal(root.store_.nodeCache_.size, 1);
        assert.equal(root.store_.childrenCache_.size, 0);
    } finally { clearInterval(timer); }
});

test('ordinary and compact trees support very deep hierarchies', async () => {
    let ordinary = node(15000, 'match', 1);
    const rows = [];
    for (let id = 14999; id >= 1; id--) ordinary = node(id, 'match', 1, [ordinary]);
    for (let id = 1; id <= 15000; id++) rows.push(row(id, id - 1, 'match', id < 15000, 1));
    for (const root of [ordinary, await load(rows.join(''))]) {
        const result = await search(root, 'match');
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

test('search errors leave the store responsive and a subsequent search can succeed', async () => {
    const root = fixture(); const original = root.walkForSearch;
    root.walkForSearch = function* () { throw new Error('Expected traversal failure'); };
    const store = storeFor(root); const originalError = console.error;
    try {
        console.error = () => {};
        store.trigger(ACTION.SEARCH_NODES, 'match'); await settled(store);
        assert.equal(store.searchError, 'Search failed');
    } finally { console.error = originalError; }
    root.walkForSearch = original;
    store.trigger(ACTION.SEARCH_NODES, 'match'); await settled(store);
    assert.equal(store.searchError, null);
    assert.equal(store.searchResults.count, 3);
});

test('renderer highlights direct and omitted descendant matches using visible areas only', async () => {
    const root = fixture(); const result = await search(root, 'match');
    const renderer = new Renderer();
    const areas = [root, root.children['MATCH-dir'], root.children['match-outside']].map((fileNode, i) => ({
        fileNode, key: fileNode.key, rect: [i * 100, 0, i * 100 + 90, 80], level: i ? 1 : 0, isLeaf: i > 0
    }));
    renderer.treeMap_.createTreeMap = () => areas;
    const outlines = [];
    const context = {
        fillRect() {}, fillText() {}, strokeText() {},
        strokeRect(...rect) { outlines.push({ color: this.strokeStyle, rect }); }
    };
    const canvas = { width: 1000, height: 800, getContext: () => context };
    renderer.render(canvas, root, null, 1000, 800, [0, 0, 1000, 800], 0, () => '', 'dark', result);
    assert.equal(outlines.filter(x => x.color === '#FFD700').length, 2);
    assert.deepEqual(outlines.filter(x => x.color === '#FFA500').map(x => x.rect), [[100, 0, 90, 80]]);
    outlines.length = 0;
    renderer.render(canvas, root, null, 1000, 800, [0, 0, 1000, 800], 0, () => '', 'dark', new SearchResults());
    assert.equal(outlines.filter(x => ['#FFD700', '#FFA500'].includes(x.color)).length, 0);
});
