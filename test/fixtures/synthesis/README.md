# Synthetic synthesis-format fixtures

All report and JSON files in this directory are hand-authored parser fixtures.
They are not tool output or modified copies of generated reports. Names,
hierarchy, cell definitions, and values were chosen independently for parser
tests. Text reports contain no vendor banners, product names, library names,
or tool versions; column headers identify their grammar.
The fixtures use Meno's BSD 3-Clause license.

| Files | Cases covered |
| --- | --- |
| `area_indented.rpt`, `area_paths.rpt` | Indented and full paths for the same mock tree; omitted top module; indexed and long names; zero values; direct area/count remainders |
| `power.rpt` | Units, exponent notation, derived dynamic power, indexed paths, zero values, and per-metric remainders |
| `area_local.rpt` | Inclusive totals with local combinational/noncombinational/black-box areas; implicit parents; long paths |
| `yosys/mapped.json` | Reused module definitions; invented cells with areas 1.5, 4, and 0; blackbox/whitebox attributes; direct cells |
| `yosys/generic.json` | The same invented hierarchy using generic cell types without area attributes |

Values are fixed and deliberately easy to check by hand. They are not estimates
of a real circuit's area, power, or implementation quality:

- Hierarchical area: the root is `[total=100, cell=80, net=20, count=40]`.
  Its nonzero children contribute totals 12 + 50 + 38 and counts 5 + 20 + 15.
  The worker contains a stage with total 30 and count 12, leaving total 20 and
  count 8 directly in the worker.
- Power: total power is 12 uW = 2 leakage + 7 internal + 3 switching.
  Dynamic power is therefore 10 uW. The root has 60 cells; its immediate
  children have 30 + 20, leaving 10 directly in the root.
- Local area: the root's inclusive total is 80 = 10 local + 30 frontend + 40 port.
  Category sums over the explicit rows are 47 combinational, 19
  noncombinational, and 14 black-box area. Their sum is also 80.
- Yosys mapped: each repeated unit contains five cells with area
  `1.5 + 4 + 1.5 + 1.5 + 0 = 8.5`. Two units and one direct 1.5-area cell give
  11 cells and area 18.5. The generic variant also has 11 cells, without area.

Real-tool compatibility checks are separate. The scripts under `test/synthesis/`
write local outputs to `work/synthesis/`. Generated reports, manifests, library
files, and tool versions are not copied into these committed fixtures. Keep any
real-tool output local and check the applicable terms before sharing it.
