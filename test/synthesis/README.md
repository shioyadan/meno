# Local synthesis checks

The RTL in this directory was independently written for Meno's local synthesis checks.
It contains two registered arithmetic lanes, repeated modules, generate indices,
and a long instance name. It does not use a product design or private report.
The RTL and scripts use the repository's BSD 3-Clause license.

Run the tools from the repository root after configuring your local environment:

```sh
export MENO_LIBERTY_FILES='/path/to/combinational.lib:/path/to/sequential.lib'
make synth-genus
make synth-yosys

export MENO_DB_FILES='/path/to/combinational.db:/path/to/sequential.db'
make synth-dc

# Yosys can also generate generic-cell statistics without a library.
env -u MENO_LIBERTY_FILES make synth-yosys
```

`genus`, `dc_shell`, and `yosys` must be on PATH. Python 3 is required by the
runner; Yosys must include Tcl support. Tool installation, license setup, and
container setup belong to the local environment and are not performed here.

Library settings are **colon-separated lists of individual files**. Relative
paths are resolved against the directory where the command was invoked. Spaces
in a path are supported; colons in filenames are not. List only one compatible
library corner. Genus/Yosys read Liberty files, while DC reads compiled `.db`
files. The repository does not bundle either library format or convert Liberty
to a DC database. Multiple Liberty files were tested with Yosys 0.68.

For Genus and DC, `MENO_CLOCK_PERIOD` defaults to `2000` in the loaded library's
time unit (for example, 2000 ps with a picosecond-based library). Input/output delays and
input transition are fractions of this value. Yosys performs area mapping
without these timing constraints. These flows produce local compatibility-check inputs, not
comparable timing or power benchmarks.

Each run creates a new `work/synthesis/<tool>-<unique suffix>/` directory:

| Tool | Outputs |
| --- | --- |
| Genus | `area.rpt`, `area_full.rpt`, `power.rpt`, timing, netlist |
| DC | `area.rpt`, `power.rpt`, timing, netlist |
| Yosys | `stats.txt`, `stats.json`, `design.json`, netlist |

These outputs provide independent inputs for parser regression tests. DC power
is generated for inspection; Meno's existing PrimeTime parser is not a DC power
parser. Yosys `stat -json` is retained as an independent statistics check.

`run.log` retains tool diagnostics. `manifest.json` records the tool version,
input hashes, and library filenames and hashes. A failed run exits with an
error and keeps its directory for diagnosis. Reports from earlier runs are
never treated as outputs of a failed invocation.
The runner passes relative symlinks under `libraries/` to the tools so that
spaces in the original library paths do not depend on a tool's Tcl parsing.
These links require the original library files to remain available.

Genus uses `auto_ungroup none`; DC disables ungrouping; Yosys does not flatten
the design. Actual hierarchy and cell counts can still differ between tools
and versions. Genus/DC power reports use vectorless activity. No LEF is loaded,
so the flow does not validate physical interconnect area or post-route power.

## Local outputs and committed fixtures

Keep generated logs, reports, netlists, manifests, and library links in `work/`.
They may contain machine paths, library names, tool versions, and other
installation details. The runner does not sanitize them for publication.

Committed fixtures under `test/fixtures/synthesis/` are independently
hand-authored mock reports and JSON. Do not replace them with generated reports
or copies that only substitute names or numbers. Add coverage using invented
hierarchies and fixed values with hand-checkable totals. The source circuit
here and the mock fixture hierarchies are intentionally independent.

Real-tool checks remain explicit local runs and are not required by normal
tests or CI.
Each externally supplied library and commercial tool's terms apply to local
runs and to any sharing of their outputs independently of Meno's license.
