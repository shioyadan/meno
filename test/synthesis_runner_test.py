import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('synthesis_runner', Path(__file__).parent / 'synthesis/run.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class RunnerTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='meno-synthesis-test-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.output = self.root / 'runs with spaces'
        tools = self.root / 'bin'
        tools.mkdir()
        for name in ['genus', 'dc_shell', 'yosys']:
            script = tools / name
            script.write_text(f'#!{sys.executable}\n' + '''
import json, os, sys
from pathlib import Path
Path('received.json').write_text(json.dumps({k:v for k,v in os.environ.items() if k.startswith('MENO_')}))
for name in ['area.rpt', 'area_full.rpt', 'power.rpt', 'stats.json', 'design.json', 'netlist.v']:
    Path(name).write_text('test output')
mode = os.environ.get('MENO_TEST_FAILURE', '')
if mode != 'missing-marker': Path('complete.txt').write_text('complete')
if mode == 'error-message': print('Error: synthesis failed')
print('Version: test-version')
sys.exit(1 if mode == 'nonzero' else 0)
''')
            script.chmod(0o755)
        self.env = self.enterContext(patch.dict(os.environ, {
            'PATH': str(tools), 'MENO_LIBERTY_FILES': '', 'MENO_DB_FILES': '',
            'MENO_CLOCK_PERIOD': '2000', 'MENO_TEST_FAILURE': '',
        }))
        self.enterContext(contextlib.redirect_stdout(io.StringIO()))

    def library(self, name):
        path = self.root / name
        path.write_text('library input')
        return path

    def test_library_paths_preserve_spaces_and_resolve_before_changing_directory(self):
        paths = [self.library('first cells.lib'), self.library('second.lib')]
        os.environ['MENO_LIBERTY_FILES'] = ':'.join(os.path.relpath(path) for path in paths)
        run = runner.generate('genus', self.output)
        received = json.loads((run / 'received.json').read_text())
        aliases = received['MENO_LIBERTY_FILES'].split(':')
        self.assertEqual([str((run / alias).resolve()) for alias in aliases], list(map(str, paths)))
        self.assertTrue(all(' ' not in alias and not Path(alias).is_absolute() for alias in aliases))
        manifest = json.loads((run / 'manifest.json').read_text())
        self.assertEqual([item['file'] for item in manifest['libraries']], [path.name for path in paths])
        self.assertEqual(manifest['version'], 'test-version')

    def test_invalid_configuration_fails_before_creating_outputs(self):
        with self.assertRaisesRegex(ValueError, 'MENO_DB_FILES'):
            runner.generate('dc', self.output)
        library = self.library('cells.lib')
        os.environ['MENO_LIBERTY_FILES'] = str(library) + ':'
        with self.assertRaisesRegex(ValueError, 'empty path'):
            runner.generate('genus', self.output)
        os.environ['MENO_LIBERTY_FILES'] = str(library)
        for period in ['nan', 'inf', '-1', '0']:
            os.environ['MENO_CLOCK_PERIOD'] = period
            with self.assertRaisesRegex(ValueError, 'positive finite'):
                runner.generate('genus', self.output)
        self.assertFalse(self.output.exists())

    def test_failed_runs_never_reuse_previous_reports(self):
        os.environ['MENO_DB_FILES'] = str(self.library('cells.db'))
        good = runner.generate('dc', self.output)
        for mode in ['nonzero', 'error-message', 'missing-marker']:
            os.environ['MENO_TEST_FAILURE'] = mode
            with self.assertRaisesRegex(ValueError, 'Synthesis failed'):
                runner.generate('dc', self.output)
        self.assertEqual(len(list(self.output.iterdir())), 4)
        self.assertEqual((good / 'area.rpt').read_text(), 'test output')
        self.assertEqual(len(list(self.output.glob('*/manifest.json'))), 1)

    def test_yosys_runs_without_a_library_and_missing_tools_fail_clearly(self):
        run = runner.generate('yosys', self.output)
        self.assertEqual(json.loads((run / 'manifest.json').read_text())['libraries'], [])
        os.environ['PATH'] = ''
        with self.assertRaisesRegex(ValueError, 'not found on PATH'):
            runner.generate('yosys', self.output)


if __name__ == '__main__':
    unittest.main()
