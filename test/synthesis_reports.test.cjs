const { test, after, before, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { stopWorkers } = require('./register.cjs');
const { Loader, FileReader } = require('../src/loader.ts');
const GenusArea = require('../src/driver/genus_area.ts').default;
const GenusPower = require('../src/driver/genus_power.ts').default;
const JoulesPowerCategory = require('../src/driver/joules_power_category.ts').default;

before(() => mock.method(console, 'log', () => {}));
after(async () => { await stopWorkers(); mock.restoreAll(); });
const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures/synthesis', name), 'utf8');
const heading = 'Synthetic area fixture\nInstance Module Cell-Count Cell-Area Net-Area Total-Area\n';
const stage = 'stage_with_an_intentionally_long_mock_instance_name';
const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

function load(input, driver = new Loader()) {
    const reader = typeof input === 'string' ? new FileReader(input) : input;
    return new Promise((resolve, reject) => driver.load(reader,
        root => resolve({ root, driver }), () => {},
        (message, recognized) => reject(Object.assign(new Error(message), { recognized }))));
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

test('indexed name prefixes stay distinct from real hierarchy parents', async () => {
    const rows = [
        'unit[2] 10.0 0 4.0 0.0 0.0 cell',
        'unit[2]/leaf 6.0 0 6.0 0.0 0.0 cell',
        'unit[2].lane 20.0 0 20.0 0.0 0.0 cell',
        'unit[3].lane 5.0 0 5.0 0.0 0.0 cell',
    ];
    for (const ordered of [rows, [...rows].reverse()]) {
        const { root } = await load('root 35.0 100 0.0 0.0 0.0 top\n' + ordered.join('\n'));
        assert.deepEqual(root.data, [35, 35, 0, 0]);
        const group = root.children.unit;
        assert.deepEqual(group.data, root.data);
        assert.deepEqual(group.children['[2]'].data, [10, 10, 0, 0]);
        assert.deepEqual(group.children['[2]'].children.leaf.data, [6, 6, 0, 0]);
        assert.deepEqual(group.children['[2]'].children.others.data, [4, 4, 0, 0]);
        assert.deepEqual(group.children['[2].lane'].data, [20, 20, 0, 0]);
        assert.deepEqual(group.children['[3]'].children['.lane'].data, [5, 5, 0, 0]);
        assert.equal(group.children['[2]'].children['.lane'], undefined);
        checkMetrics(root, 4);
    }
});

test('array display groups do not absorb a sibling with the same base name', async () => {
    const { root } = await load(heading + 'root top 3 9.0 0.0 9.0\n' +
        'root/unit[0].leaf cell 1 2.0 0.0 2.0\nroot/unit cell 1 3.0 0.0 3.0\n' +
        'root/unit[1].leaf cell 1 4.0 0.0 4.0\n');
    assert.deepEqual(Object.keys(root.children).sort(), ['unit', 'unit[0].leaf', 'unit[1].leaf']);
    assert.deepEqual(root.children.unit.data, [3, 3, 0, 1]);
    assert.deepEqual(root.children['unit[0].leaf'].data, [2, 2, 0, 1]);
    assert.deepEqual(root.children['unit[1].leaf'].data, [4, 4, 0, 1]);
    checkMetrics(root, 4);
});

test('synthetic power preserves units and derives missing dynamic power', async () => {
    const { root, driver } = await load(fixture('power.rpt'));
    assert.equal(driver.driver_.constructor.name, 'GenusPowerDriver');
    assert.equal(root.key, 'mock_power');
    assert.deepEqual(root.data, [12, 10, 7, 3, 2, 60]);
    assert.deepEqual(root.children.others.data, [3.5, 3, 2, 1, 0.5, 10]);
    assert.equal(root.children.engine.data[5], 30);
    assert.match(driver.fileNodeToStr(root.children.engine, root, 5, false), /30.*50\.00%/);
    assert.equal(driver.itemNames()[0], 'total (uW)');
    checkMetrics(root, 6);
});

test('synthetic Yosys netlists aggregate repeated modules and direct cells', async () => {
    const mapped = await load(fixture('yosys/mapped.json'));
    assert.equal(mapped.root.key, 'mock_netlist');
    assert.deepEqual(mapped.root.data, [18.5, 11]);
    assert.deepEqual(mapped.driver.itemNames(), ['cell-area', 'cell-count']);
    for (const index of ['[2]', '[7]']) {
        const unit = mapped.root.children.tiles.children[index].children['.unit'];
        assert.deepEqual(unit.data, [8.5, 5]);
        assert.deepEqual(unit.children.u_comb.data, [3, 3]);
        assert.deepEqual(unit.children.others.data, [5.5, 2]);
    }
    assert.deepEqual(mapped.root.children.others.data, [1.5, 1]);
    checkMetrics(mapped.root, 2);
    const generic = await load(fixture('yosys/generic.json'));
    assert.deepEqual(generic.root.data, [11]);
    assert.deepEqual(generic.root.children.tiles.children['[2]'].children['.unit'].data, [5]);
    assert.deepEqual(generic.root.children.others.data, [1]);
    assert.deepEqual(generic.driver.itemNames(), ['cell-count']);
    checkMetrics(generic.root, 1);
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

test('power levels distinguish repeated short instance names under different parents', async () => {
    const rows = [
        [0, 8, 2, 4, 6, 12, '/mock_tree'],
        [1, 4, 1, 2, 3, 6, '/mock_tree/left'],
        [2, 2, 0.5, 1, 1.5, 3, '/mock_tree/left/shared'],
        [1, 4, 1, 2, 3, 6, '/mock_tree/right'],
        [2, 2, 0.5, 1, 1.5, 3, '/mock_tree/right/shared'],
    ];
    const input = (shortNames, levels) => 'Power Unit: mW\n' +
        (levels ? 'Lvl ' : '') + 'Cells Leakage Internal Switching Total Instance\n' +
        rows.map(([level, ...values]) => {
            if (shortNames && level) values[5] = ' '.repeat(level * 3) + values[5].split('/').at(-1);
            return [...(levels ? [level] : []), ...values].join(' ');
        }).join('\n');
    const flat = await load(input(false, true));
    const indented = await load(input(true, true));
    const withoutLevels = await load(input(false, false));
    assert.deepEqual(snapshot(indented.root), snapshot(flat.root));
    assert.deepEqual(snapshot(withoutLevels.root), snapshot(flat.root));
    assert.deepEqual(indented.root.data, [12, 10, 4, 6, 2, 8]);
    for (const branch of ['left', 'right']) {
        const parent = indented.root.children[branch];
        assert.deepEqual(parent.children.shared.data, [3, 2.5, 1, 1.5, 0.5, 2]);
        assert.deepEqual(parent.children.others.data, [3, 2.5, 1, 1.5, 0.5, 2]);
    }
    checkMetrics(indented.root, 6);
    await assert.rejects(load(input(true, false)), /require a Lvl column/);
});

test('power hierarchy rejects invalid levels, missing parents and duplicate siblings', async () => {
    const header = 'Lvl Cells Leakage Internal Switching Total Instance\n';
    const root = '0 4 1 2 3 6 /mock_tree\n';
    for (const level of ['-1', '0.5', 'invalid', '1e999']) {
        await assert.rejects(load(header + root + `${level} 2 0.5 1 1.5 3 leaf\n`), /Invalid Lvl/);
    }
    await assert.rejects(load(header + root + '2 2 0.5 1 1.5 3 leaf\n'), /Missing parent/);
    const child = '1 2 0.5 1 1.5 3 leaf\n';
    await assert.rejects(load(header + root + child + child), /Duplicate instance path/);
});

test('power category totals exclude summary rows and derive dynamic power', async () => {
    const { root, driver } = await load(fixture('power_categories.rpt'));
    assert.equal(driver.driver_.constructor.name, 'JoulesPowerCategoryDriver');
    assert.equal(root.key, 'Total');
    assert.deepEqual(driver.itemNames(), ['total (uW)', 'dynamic (uW)', 'int (uW)', 'sw (uW)', 'leak (uW)']);
    assert.deepEqual(root.data, [15, 12, 6, 6, 3]);
    assert.deepEqual(Object.keys(root.children).sort(), ['group_a', 'group_b', 'unused']);
    assert.deepEqual(root.children.group_a.data, [9, 8, 5, 3, 1]);
    assert.deepEqual(root.children.unused.data, [0, 0, 0, 0, 0]);
    assert.match(driver.fileNodeToStr(root.children.group_a, root, 1, false), /8.*66\.67%/);
    checkMetrics(root, 5);
});

test('power categories expose only available power, cell count and area metrics', async () => {
    const { root, driver } = await load(fixture('power_categories_columns.rpt'));
    assert.equal(driver.driver_.constructor.name, 'JoulesPowerCategoryDriver');
    assert.deepEqual(driver.itemNames(), ['total (uW)', 'dynamic (uW)', 'leak (uW)', 'cell-count', 'cell-area']);
    assert.deepEqual(root.data, [15, 12, 3, 5, 18]);
    assert.deepEqual(root.children.group_a.data, [9, 8, 1, 3, 11]);
    assert.deepEqual(root.children.group_b.data, [6, 4, 2, 2, 7]);
    assert.equal(root.children.others, undefined);
    assert.match(driver.fileNodeToStr(root.children.group_a, root, 3, false), /3.*60\.00%/);
    assert.match(driver.fileNodeToStr(root.children.group_a, root, 4, false), /11.*61\.11%/);
    checkMetrics(root, 5);
    const reordered = await load('Power Unit: nW\nTotal Category Dynamic Leakage Area Cells\n' +
        '9 group_a 8 1 11 3\n6 group_b 4 2 7 2\n15 Subtotal 12 3 18 5\n');
    assert.deepEqual(reordered.root.data, root.data);
    assert.deepEqual(reordered.root.children.group_a.data, root.children.group_a.data);
    assert.equal(reordered.driver.itemNames()[0], 'total (nW)');
});

test('power categories reject incomplete tables, invalid metrics and inconsistent totals', async () => {
    const text = fixture('power_categories_columns.rpt');
    await assert.rejects(load(text.replace('group_a 3', 'group_a 1.5')), /Invalid Cells/);
    await assert.rejects(load(text.replace('11.000', '-1.000')), /Invalid Area/);
    await assert.rejects(load(text.replace('11.000', 'NaN')), /Invalid Area/);
    await assert.rejects(load(text.replace('group_b', 'group_a')), /Duplicate instance path/);
    await assert.rejects(load(text.replace('Subtotal 5', 'Subtotal 4')), /Child totals/);
    await assert.rejects(load(text.replace('Subtotal 5 18.000', 'Subtotal 5 12.000')), /Child totals/);
    await assert.rejects(load(text.replace(/^Subtotal.*\n|^Percentage.*\n/gm, '')), /no subtotal/);
    await assert.rejects(load(text.replace(/^Subtotal.*\n/gm, '')), /percentages precede/);
    await assert.rejects(load(text.replace('Dynamic', 'Unspecified')), /Missing Dynamic/);
    await assert.rejects(load(text.replace('Dynamic', 'Leakage')), /Duplicate power column/);
    await assert.rejects(load(text.replace('group_a 3 11.000', 'group_a 3')), /Incomplete power row/);
    await assert.rejects(load(text + 'extra 1 1 1 1 2 0%\n'), /Unexpected row after/);
    await assert.rejects(load(text + 'Category Cells Area Leakage Dynamic Total Row%\n'), /Multiple power tables/);
});

test('power drivers leave other table structures unrecognized', async () => {
    const preamble = 'Power Unit: mW\nScope: Instance /mock_tree\n' + 'Report preamble\n'.repeat(160);
    await assert.rejects(load(preamble + fixture('power_categories.rpt'), new GenusPower()), { recognized: false });
    await assert.rejects(load(preamble + fixture('power.rpt'), new JoulesPowerCategory()), { recognized: false });
    await assert.rejects(load(preamble, new GenusPower()), { recognized: false });
    await assert.rejects(load(preamble, new JoulesPowerCategory()), { recognized: false });
    const { driver } = await load(preamble + fixture('power_categories.rpt'));
    assert.equal(driver.driver_.constructor.name, 'JoulesPowerCategoryDriver');
    assert.equal(driver.itemNames()[0], 'total (uW)');
});

test('recognized power corruption and mixed tables do not fall back to another driver', async () => {
    const hierarchy = fixture('power.rpt');
    const category = fixture('power_categories_columns.rpt');
    for (const [text, wrongTable, expected] of [
        [hierarchy, category, 'GenusPowerDriver'],
        [category, hierarchy, 'JoulesPowerCategoryDriver'],
    ]) {
        for (const [input, message] of [
            [text.replace('Leakage', 'Unspecified'), /Missing Leakage column/],
            [text + wrongTable.split('\n').find(line => line.includes('Total')) + '\n', /Multiple power tables/],
        ]) {
            const driver = new Loader();
            await assert.rejects(load(input, driver), message);
            assert.equal(driver.driver_.constructor.name, expected);
        }
    }
});

test('power drivers reset metrics, units and table state on a new load', async () => {
    for (const [driver, first, next] of [
        [new GenusPower(), 'power.rpt', 'power.rpt'],
        [new JoulesPowerCategory(), 'power_categories.rpt', 'power_categories_columns.rpt'],
    ]) {
        await load(fixture(first), driver);
        const input = fixture(next).replace(/^Power Unit:.*\n/m, '');
        const reloaded = await load(input, driver);
        const fresh = await load(input);
        assert.deepEqual(snapshot(reloaded.root), snapshot(fresh.root));
        assert.deepEqual(driver.itemNames(), fresh.driver.itemNames());
        assert.equal(driver.itemNames()[0], 'total');
    }
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

test('Yosys rejects cycles, ambiguous roots, invalid area and incompatible JSON', async () => {
    const netlist = modules => JSON.stringify({ creator: 'Yosys test', modules });
    await assert.rejects(load(netlist({ a: { attributes: { top: 1 }, cells: { u: { type: 'a' } } } })), /Recursive/);
    await assert.rejects(load(netlist({ a: { cells: {} }, b: { cells: {} } })), /one Yosys top/);
    await assert.rejects(load(netlist({ a: { cells: { u: { type: 'g' } } }, g: { attributes: { blackbox: 1, area: '-1' } } })), /Invalid cell area/);
    await assert.rejects(load(netlist({ a: { num_cells: 1 } })), /Expected write_json/);
    await assert.rejects(load('{"creator":"Yosys test", "modules":'), /Invalid Yosys JSON/);
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
    for (const [name, design] of [['Category', 'Total'], ['Cells', 'Instance']]) {
        const named = await load(`${name} 12 100 4 2 0 ${design}\nleaf 6 50 4 2 0 unit\n`);
        assert.equal(named.driver.driver_.constructor.name, 'DcAreaDriver');
        assert.deepEqual(named.root.data, [12, 8, 4, 0]);
    }
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

// 指定された新規生成物は、別コマンドstatの結果とも比較する。
for (const [index, filename] of process.argv.slice(2).entries()) {
    test(`fresh Yosys netlist agrees with independent statistics (${index + 1})`, async () => {
        const { root, driver } = await load(fs.readFileSync(filename, 'utf8'));
        const statistics = JSON.parse(fs.readFileSync(path.join(path.dirname(filename), 'stats.json'), 'utf8')).design;
        assert.equal(root.key, 'sample_top');
        const countIndex = driver.itemNames().indexOf('cell-count');
        assert.equal(root.data[countIndex], statistics.num_cells);
        const areaIndex = driver.itemNames().indexOf('cell-area');
        if (areaIndex >= 0) close(root.data[areaIndex], statistics.area, 1e-6);
        const lanes = root.children.lanes;
        assert.deepEqual(Object.keys(lanes.children).sort(), ['[0]', '[1]']);
        checkMetrics(root, driver.itemNames().length);
    });
}

test('PrimeTime metric selection includes direct power and selected percentages', async () => {
    const { root, driver } = await load('Report : Averaged Power\n--------------------\n' +
        'root 3 2 1 6 100\n  leaf (sample) 1 1 0.5 2.5 41.7\n');
    assert.deepEqual(root.children.others.data, [3.5, 2, 1, 0.5]);
    assert.match(driver.fileNodeToStr(root.children['leaf (sample)'], root, 1, false), /1.*33\.33%/);
    assert.match(driver.fileNodeToStr(root.children['leaf (sample)'], root, 3, false), /0\.5.*50\.00%/);
});
