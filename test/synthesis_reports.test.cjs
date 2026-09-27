const { test, after, before, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { stopWorkers } = require('./register.cjs');
const { Loader, FileReader } = require('../src/loader.ts');
const GenusArea = require('../src/driver/genus_area.ts').default;

before(() => mock.method(console, 'log', () => {}));
after(async () => { await stopWorkers(); mock.restoreAll(); });
const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures/synthesis', name), 'utf8');
const heading = 'Synthetic area fixture\nInstance Module Cell-Count Cell-Area Net-Area Total-Area\n';
const stage = 'stage_with_an_intentionally_long_mock_instance_name';
const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

function load(input, driver = new Loader()) {
    const reader = typeof input === 'string' ? new FileReader(input) : input;
    return new Promise((resolve, reject) => driver.load(reader,
        root => resolve({ root, driver }), () => {}, message => reject(new Error(message))));
}
function snapshot(node) {
    return { key: node.key, data: node.data,
        children: Object.values(node.children ?? {}).map(snapshot).sort((a, b) => a.key.localeCompare(b.key)) };
}
function checkMetrics(root, count) {
    const pending = [root];
    while (pending.length) {
        const node = pending.pop();
        assert.equal(node.data.length, count);
        assert.ok(node.data.every(value => Number.isFinite(value) && value >= 0));
        for (const child of Object.values(node.children ?? {})) {
            assert.equal(child.parent, node);
            pending.push(child);
        }
    }
}

test('synthetic area variants produce the same complete hierarchy', async () => {
    const indented = await load(fixture('area_indented.rpt'));
    const flat = await load(fixture('area_paths.rpt'));
    assert.equal(indented.driver.driver_.constructor.name, 'GenusAreaDriver');
    assert.deepEqual(snapshot(indented.root), snapshot(flat.root));
    assert.equal(flat.root.key, 'mock_chip');
    assert.deepEqual(flat.root.data, [100, 80, 20, 40]);
    const worker = flat.root.children.banks.children['[3]'].children['.worker'];
    assert.deepEqual(worker.data, [50, 40, 10, 20]);
    assert.deepEqual(worker.children[stage].data, [30, 24, 6, 12]);
    assert.deepEqual(worker.children.others.data, [20, 16, 4, 8]);
    assert.deepEqual(flat.root.children.idle.data, [0, 0, 0, 0]);
    assert.equal(flat.root.children.others, undefined);
    assert.match(flat.driver.fileNodeToStr(worker.children[stage], flat.root, 3, false), /12.*30\.00%/);
    checkMetrics(flat.root, 4);
});

test('synthetic local area sums local categories through hierarchy', async () => {
    const { root, driver } = await load(fixture('area_local.rpt'));
    assert.equal(driver.driver_.constructor.name, 'DcAreaDriver');
    assert.equal(root.key, 'mock_system');
    assert.deepEqual(root.data, [80, 47, 19, 14]);
    assert.deepEqual(root.children.frontend.data, [30, 22, 6, 2]);
    assert.deepEqual(root.children.frontend.children.others.data, [15, 10, 5, 0]);
    assert.deepEqual(root.children.others.data, [10, 5, 3, 2]);
    assert.deepEqual(root.children.fabric.children.ports.children['[5]'].children['.stage'].data, [40, 20, 10, 10]);
    checkMetrics(root, 4);
});

test('synthetic power preserves units and derives missing dynamic power', async () => {
    const { root, driver } = await load(fixture('power.rpt'));
    assert.equal(root.key, 'mock_power');
    assert.deepEqual(root.data, [12, 10, 7, 3, 2, 60]);
    assert.deepEqual(root.children.others.data, [3.5, 3, 2, 1, 0.5, 10]);
    assert.equal(root.children.engine.data[5], 30);
    assert.match(driver.fileNodeToStr(root.children.engine, root, 5, false), /30.*50\.00%/);
    assert.equal(driver.itemNames()[0], 'total (uW)');
    checkMetrics(root, 6);
});

test('area headers control column order and accept exponent values and an omitted root module', async () => {
    const input = 'Synthetic area fixture\nInstance Module Total-Area Cell-Count Net-Area Cell-Area\n' +
        'root 1e1 3 1.0 9.0\nroot/leaf cell 7e0 2 1e0 6e0';
    const { root } = await load(input);
    assert.deepEqual(root.data, [10, 9, 1, 3]);
    assert.deepEqual(root.children.leaf.data, [7, 6, 1, 2]);
    assert.deepEqual(root.children.others.data, [3, 3, 0, 1]);
});

test('area input tolerates long preambles, CRLF, small HTTP chunks and missing final newline', async t => {
    const input = ('Report preamble\n'.repeat(160) + fixture('area_indented.rpt')).trimEnd().replace(/\n/g, '\r\n');
    const bytes = new TextEncoder().encode(input);
    t.mock.method(global, 'fetch', async () => {
        let position = 0;
        return new Response(new ReadableStream({ pull(controller) {
            if (position === bytes.length) { controller.close(); return; }
            controller.enqueue(bytes.slice(position, position + 3));
            position = Math.min(bytes.length, position + 3);
        } }));
    });
    const { root } = await load(new FileReader({ url: '/report', name: 'area.rpt' }));
    assert.equal(root.data[0], 100);
});

test('implicit nodes aggregate every metric and preserve special names and existing others', async () => {
    const { root } = await load(heading + 'root top 4 10.0 0.0 10.0\n' +
        'root/others cell 1 2.0 0.0 2.0\nroot/__proto__/constructor cell 1 3.0 0.0 3.0\n');
    assert.deepEqual(root.children.__proto__.data, [3, 3, 0, 1]);
    assert.deepEqual(root.children.others.data, [2, 2, 0, 1]);
    assert.deepEqual(root.children['others (2)'].data, [5, 5, 0, 2]);
    checkMetrics(root, 4);
});

test('rounded area totals do not create spurious remainders or reject valid children', async () => {
    for (const value of ['0.333', '0.334']) {
        const { root } = await load(heading + 'root top 3 1.00 0.00 1.00\n' +
            ['a', 'b', 'c'].map(name => `root/${name} cell 1 ${value} 0.000 ${value}\n`).join(''));
        assert.deepEqual(root.data, [1, 1, 0, 3]);
        assert.deepEqual(Object.keys(root.children).sort(), ['a', 'b', 'c']);
    }
});

test('recognized area corruption is reported without falling back to another parser', async () => {
    for (const value of ['NaN', '1e999', '-1', 'invalid']) {
        const driver = new Loader();
        await assert.rejects(load(heading + `root top 1 ${value} 0 1\n`, driver), /Line 3: Invalid Cell-Area/);
        assert.equal(driver.driver_.constructor.name, 'GenusAreaDriver');
    }
    await assert.rejects(load(heading + 'root top 1 1 0\n'), /Invalid/);
    await assert.rejects(load(heading), /contains no rows/);
    await assert.rejects(load(heading + 'root top 2 2 0 2\nroot/a cell 1 1 0 1\nroot/a cell 1 1 0 1'), /Duplicate/);
    await assert.rejects(load(heading + 'root top 1 1 0 1\nroot/a cell 2 4 0 4'), /Child totals/);
    await assert.rejects(load(heading.replace('Net-Area', 'Cell-Area')), /Duplicate area column/);
    await assert.rejects(load(heading + 'root top 0 0e999 0 0'), /Invalid numeric precision/);
});

test('zero-area roots remain valid and aggregate overflow is rejected', async () => {
    const { root } = await load(heading + 'root top 0 0.0 0.0 0.0\n');
    assert.deepEqual(root.data, [0, 0, 0, 0]);
    await assert.rejects(load(heading + 'root top 2 1e308 0 1e308\nroot/a m 1 1e308 0 1e308\nroot/b m 1 1e308 0 1e308'), /overflow/);
});

test('power columns are resolved by name and decimal rows are not mistaken for area', async () => {
    const text = 'Power Unit: mW\n' +
        'Instance Cells Leakage Internal Switching Total Lvl\n/root 2 1.0 2.0 3.0 6.0 0\n/root/a 1 0.5 1.0 1.5 3.0 1\n';
    const { root, driver } = await load(text);
    assert.deepEqual(root.data, [6, 5, 2, 3, 1, 2]);
    assert.deepEqual(root.children.a.data, [3, 2.5, 1, 1.5, 0.5, 1]);
    assert.equal(driver.itemNames()[0], 'total (mW)');
});

test('power duplicates, repeated tables, invalid numbers and truncated rows fail', async () => {
    const text = fixture('power.rpt');
    const row = text.split('\n').find(line => /\/mock_power\s*$/.test(line));
    await assert.rejects(load(text + row + '\n'), /Duplicate/);
    const header = text.split('\n').find(line => line.startsWith('Cells '));
    await assert.rejects(load(text + header + '\n'), /Multiple power tables/);
    await assert.rejects(load(text.replace('1.200e+01', '1e999')), /Invalid Total/);
    await assert.rejects(load(text.replace(row, row.trim().split(/\s+/).slice(0, -1).join(' '))), /Incomplete power row/);
    await assert.rejects(load(text.replace('Pct_cells', 'Cells')), /Duplicate power column/);
});

test('deep area paths finalize without recursion', async () => {
    const path = ['root', ...Array.from({ length: 10000 }, (_, i) => `level${i}`)].join('/');
    const { root } = await load(heading + `root top 1 1.0 0.0 1.0\n${path} m 1 1.0 0.0 1.0\n`);
    let node = root;
    for (let i = 0; i < 10000; i++) node = node.children[`level${i}`];
    assert.deepEqual(node.data, [1, 1, 0, 1]);
});

test('cancel from report progress prevents success and further notifications', async () => {
    const text = heading + 'root top 2000 2000.0 0.0 2000.0\n' +
        Array.from({ length: 2000 }, (_, i) => `root/a${i} m 1 1.0 0.0 1.0\n`).join('');
    const reader = new FileReader(text);
    let progress = 0, finish = 0, errors = 0;
    await new Promise(resolve => {
        new GenusArea().load(reader, () => finish++, () => {
            progress++;
            reader.cancel(resolve);
        }, () => errors++);
    });
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(progress, 1);
    assert.equal(finish, 0);
    assert.equal(errors, 0);
});

test('local area wrapped paths and headerless legacy input remain supported', async () => {
    const source = fixture('area_local.rpt');
    const report = source.replace(/(frontend\/\S+) +15\.0/, '$1\n    15.0');
    assert.notEqual(report, source);
    const { root } = await load(report);
    assert.deepEqual(root.data, [80, 47, 19, 14]);
    const legacy = await load('top 25 100 20 5 0 1\nchild 10 40 8 2 0 1\n');
    assert.equal(legacy.root.data[0], 25);
    assert.equal(legacy.root.children.child.data[0], 10);
});

test('Vivado and PrimeTime inputs still select their original drivers', async () => {
    const vivado = await load('| root | root_type | 100 | 90 | 0 | 0 | 20 | 0 | 0 | 0 |\n' +
        '|   leaf | leaf_type | 40 | 30 | 0 | 0 | 10 | 0 | 0 | 0 |\n');
    assert.equal(vivado.driver.driver_.constructor.name, 'VivadoAreaDriver');
    assert.equal(vivado.root.data[0], 100);
    assert.equal(vivado.root.children.leaf.data[0], 40);
    assert.deepEqual(vivado.driver.itemNames(), ['LUTs']);
    const power = await load('Report : Averaged Power\n--------------------\n' +
        'root 3 2 1 6 100\n  leaf (sample) 1 1 0.5 2.5 41.7\n');
    assert.equal(power.driver.driver_.constructor.name, 'PrimeTimePowerDriver');
    assert.equal(power.root.data[0], 6);
});

