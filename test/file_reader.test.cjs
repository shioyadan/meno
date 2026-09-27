const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { stopWorkers } = require('./register.cjs');
const { FileReader } = require('../src/driver/driver.ts');
const { Loader } = require('../src/loader.ts');
const getZstdReader = require('../src/zstd_reader.ts').default;

afterEach(stopWorkers);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const source = { url: '/input', name: 'report.txt' };
const encoder = new TextEncoder();
const row = '1\t0\t/root\t1\t1\t0\n2\t1\tfile\t0\t1\t25\n';

function collect(reader) {
    return new Promise((resolve, reject) => {
        const lines = [];
        reader.onReadLine(line => lines.push(line));
        reader.onError(reject);
        reader.onClose(() => resolve(lines));
        reader.load();
    });
}
function load(reader) {
    return new Promise((resolve, reject) => new Loader().load(reader, resolve, () => {}, reject));
}
function chunks(bytes, size = 1) {
    let offset = 0;
    return new ReadableStream({ pull(controller) {
        if (offset === bytes.length) { controller.close(); return; }
        controller.enqueue(new Uint8Array(bytes.slice(offset, offset + size)));
        offset = Math.min(bytes.length, offset + size);
    } });
}

test('HTTP input delivers lines before EOF and reports byte progress', { timeout: 3000 }, async t => {
    let controller;
    const body = new ReadableStream({ start(value) { controller = value; } });
    t.mock.method(global, 'fetch', async () => new Response(body, { headers: { 'Content-Length': '12' } }));
    const reader = new FileReader(source);
    const lines = [];
    const done = new Promise((resolve, reject) => {
        reader.onReadLine(line => lines.push(line));
        reader.onClose(resolve);
        reader.onError(reject);
    });
    reader.load();
    controller.enqueue(encoder.encode('first\n'));
    for (let i = 0; i < 100 && !lines.length; i++) await delay(1);
    assert.deepEqual(lines, ['first']);
    assert.equal(reader.getProgress(), 0.5);
    controller.enqueue(encoder.encode('last\r\n'));
    controller.close();
    await done;
    assert.deepEqual(lines, ['first', 'last']);
    assert.equal(reader.getProgress(), 1);
});

test('HTTP input preserves UTF-8 across byte boundaries and loads a tree', async t => {
    t.mock.method(global, 'fetch', async () => new Response(chunks(encoder.encode(row.replace('file', '資料😀')))));
    const root = await load(new FileReader(source));
    assert.equal(root.data[0], 25);
    assert.equal(root.children['資料😀'].data[0], 25);
});

test('format detection opens a fresh HTTP stream for the next driver', async t => {
    const fetch = t.mock.method(global, 'fetch', async () => new Response('top 25 100 20 5 0 1\nchild 10 40 8 2 0 1\n'));
    const root = await load(new FileReader(source));
    assert.equal(root.key, 'top');
    assert.equal(root.data[0], 25);
    assert.equal(root.children.child.data[0], 10);
    assert.equal(fetch.mock.callCount(), 2);
});

test('HTTP errors and body failures reach the error callback', async t => {
    t.mock.method(console, 'error', () => {});
    let bodyCanceled = false;
    t.mock.method(global, 'fetch', async () => new Response(new ReadableStream({
        cancel() { bodyCanceled = true; }
    }), { status: 404 }));
    await assert.rejects(collect(new FileReader(source)), /HTTP 404/);
    assert.equal(bodyCanceled, true);
    t.mock.method(global, 'fetch', async () => new Response(new ReadableStream({
        pull(controller) { controller.error(new Error('Connection failed')); }
    })));
    await assert.rejects(collect(new FileReader(source)), /Connection failed/);
});

test('cancel aborts a pending fetch without publishing callbacks', async t => {
    let signal, callbackCount = 0;
    t.mock.method(global, 'fetch', (_, options) => new Promise((resolve, reject) => {
        signal = options.signal;
        signal.addEventListener('abort', () => reject(new Error('Aborted')));
    }));
    const reader = new FileReader(source);
    reader.onReadLine(() => callbackCount++);
    reader.onClose(() => callbackCount++);
    reader.onError(() => callbackCount++);
    reader.load();
    reader.cancel();
    await delay(0);
    assert.equal(signal.aborted, true);
    assert.equal(callbackCount, 0);
});

test('cancel releases a response that arrives after cancellation', async t => {
    let respond, canceled = false;
    t.mock.method(global, 'fetch', () => new Promise(resolve => { respond = resolve; }));
    const reader = new FileReader(source);
    reader.load();
    reader.cancel();
    respond(new Response(new ReadableStream({ cancel() { canceled = true; } })));
    await delay(0);
    assert.equal(canceled, true);
});

test('cancel interrupts a pending body read and clone starts a fresh request', async t => {
    let canceled = false, calls = 0;
    t.mock.method(global, 'fetch', async () => ++calls === 1
        ? new Response(new ReadableStream({ cancel() { canceled = true; } }))
        : new Response('replacement\n'));
    const reader = new FileReader(source);
    let callbacks = 0;
    reader.onClose(() => callbacks++);
    reader.onError(() => callbacks++);
    reader.load();
    await delay(0);
    await new Promise(resolve => reader.cancel(resolve));
    assert.equal(canceled, true);
    assert.equal(callbacks, 0);
    assert.deepEqual(await collect(reader.clone()), ['replacement']);
});

// zstd CLIで圧縮した固定の最小入力。test実行時にはCLIへ依存しない。
const compressed = Buffer.from('KLUv/QRYAQEAMQkwCS9yb290CTEJMQkwCjIJMQlmaWxlCTAJMQkyNQoNqTAt', 'base64');

test('HTTP zstd input tolerates one-byte compressed chunks', { timeout: 5000 }, async t => {
    t.mock.method(global, 'fetch', async () => new Response(chunks(compressed), {
        headers: { 'Content-Length': String(compressed.length) }
    }));
    const reader = new FileReader({ ...source, name: 'report.txt.zst' });
    assert.deepEqual(await collect(reader), row.trimEnd().split('\n'));
    assert.equal(reader.getProgress(), 1);
});

test('corrupt zstd and interrupted compressed transport report errors', { timeout: 5000 }, async t => {
    t.mock.method(console, 'error', () => {});
    t.mock.method(global, 'fetch', async () => new Response(chunks(encoder.encode('not zstd'))));
    await assert.rejects(collect(new FileReader({ ...source, name: 'bad.zstd' })));
    t.mock.method(global, 'fetch', async () => new Response(new ReadableStream({
        pull(controller) { controller.error(new Error('Compressed transport failed')); }
    })));
    await assert.rejects(collect(new FileReader({ ...source, name: 'bad.zst' })), /Compressed transport failed/);
});

test('zstd cancellation settles an outstanding read and cancels its source', { timeout: 3000 }, async () => {
    let canceled = false;
    const reader = getZstdReader(new ReadableStream({ cancel() { canceled = true; } }), 'input.zst', 0, () => {});
    const pending = reader.read();
    await reader.cancel();
    assert.equal((await pending).done, true);
    assert.equal(canceled, true);
});

test('zstd decoding applies backpressure to compressed input', { timeout: 3000 }, async () => {
    let reads = 0;
    const reader = getZstdReader(new ReadableStream({ pull(controller) {
        reads++;
        controller.enqueue(new Uint8Array(compressed));
    } }), 'input.zst', 0, () => {});
    const first = await reader.read();
    assert.equal(new TextDecoder().decode(first.value), row);
    await delay(100);
    assert.ok(reads <= 4, `Read ${reads} compressed frames without a consumer`);
    await reader.cancel();
});
