"""Generate local synthesis reports using tools on PATH."""

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

SOURCE = Path(__file__).resolve().parent
TOOLS = {
    'genus': ('genus', ['-no_gui', '-batch', '-files', 'genus.tcl'],
              ['area.rpt', 'area_full.rpt', 'power.rpt', 'netlist.v']),
    'dc': ('dc_shell', ['-f', 'dc.tcl'], ['area.rpt', 'power.rpt', 'netlist.v']),
    'yosys': ('yosys', ['-T', '-c', 'yosys.tcl'], ['stats.json', 'design.json', 'netlist.v']),
}


def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def generate(tool, output):
    command, arguments, reports = TOOLS[tool]
    if not shutil.which(command):
        raise ValueError(f'{command} was not found on PATH.')
    env = os.environ.copy()
    variable = 'MENO_DB_FILES' if tool == 'dc' else 'MENO_LIBERTY_FILES'
    setting = env.get(variable, '')
    if not setting and tool != 'yosys':
        raise ValueError(f'Set {variable} to a colon-separated list of library files.')
    libraries = []
    if setting:
        for entry in setting.split(':'):
            if not entry:
                raise ValueError(f'{variable} contains an empty path.')
            library = Path(entry).expanduser().resolve(strict=True)
            if not library.is_file():
                raise ValueError(f'Not a library file: {library}')
            libraries.append(library)
    period = float(env.get('MENO_CLOCK_PERIOD', '2000'))
    if not math.isfinite(period) or period <= 0:
        raise ValueError('MENO_CLOCK_PERIOD must be a positive finite number.')
    env['MENO_CLOCK_PERIOD'] = str(period)
    output.mkdir(parents=True, exist_ok=True)
    # 実行ごとに分離し、失敗時に古いreportを今回の成功結果と取り違えない。
    run = Path(tempfile.mkdtemp(prefix=f'{tool}-', dir=output))
    # 一部のCADツールはTcl list内の空白も分割するため、安全な相対名で渡す。
    aliases = []
    if libraries:
        (run / 'libraries').mkdir()
        for index, library in enumerate(libraries):
            alias = Path('libraries') / f'{index}{".db" if tool == "dc" else ".lib"}'
            (run / alias).symlink_to(library)
            aliases.append(str(alias))
    env[variable] = ':'.join(aliases)
    for name in ['hierarchy.sv', 'constraints.sdc', f'{tool}.tcl']:
        shutil.copyfile(SOURCE / name, run / name)
    print(f'Running {command}. Output: {run}', flush=True)
    with (run / 'run.log').open('w') as log:
        result = subprocess.run([command, *arguments], cwd=run, env=env,
                                stdout=log, stderr=subprocess.STDOUT)
    log_text = (run / 'run.log').read_text(errors='replace')
    # DC等はTcl内でerrorを表示してもexit codeが0になる場合がある。
    failed = re.search(r'^(?:Error\s*:|Fatal\s*:|ERROR:)', log_text, re.M)
    if result.returncode or failed or not (run / 'complete.txt').is_file():
        raise ValueError(f'Synthesis failed. See {run / "run.log"}')
    for name in reports:
        if not (run / name).is_file() or not (run / name).stat().st_size:
            raise ValueError(f'Missing synthesis output: {run / name}')
    versions = re.findall(r'^\s*(?:Version:?\s+|Yosys\s+)([^\n]+)', log_text, re.M)
    manifest = {
        'tool': tool,
        'version': versions[0].strip() if versions else 'See run.log',
        'clock_period': period if tool != 'yosys' else None,
        'libraries': [{'file': path.name, 'sha256': digest(path)} for path in libraries],
        'inputs': {name: digest(run / name) for name in ['hierarchy.sv', 'constraints.sdc', f'{tool}.tcl']},
    }
    (run / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'Generated {tool} reports: {run}')
    return run


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('tool', choices=TOOLS)
    parser.add_argument('--output', type=Path, default=SOURCE.parents[1] / 'work' / 'synthesis')
    parser.add_argument('--check', action='store_true', help='Check a fresh Yosys netlist with Meno and tool statistics.')
    args = parser.parse_args()
    if args.check and args.tool != 'yosys':
        parser.error('--check is only supported for Yosys.')
    try:
        run = generate(args.tool, args.output.resolve())
        if args.check:
            test = SOURCE.parent / 'synthesis_reports.test.cjs'
            if subprocess.call(['node', str(test), str(run / 'design.json')]):
                raise ValueError('Generated Yosys report failed validation.')
    except (OSError, ValueError) as error:
        sys.exit(str(error))


if __name__ == '__main__':
    main()
