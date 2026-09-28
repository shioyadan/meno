import contextlib
import http.client
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import selectors
import signal
import subprocess
import tempfile
import unittest
import urllib.parse
import zipfile

REPO = Path(__file__).resolve().parent.parent
LAUNCHER = (REPO / "meno.sh").read_text()
TEMPLATE = (REPO / "src/index.html").read_text()


class Scripts(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.scripts = []
        self.in_script = False
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        if tag == "script":
            self.in_script = True
            self.scripts.append("")

    def handle_endtag(self, tag):
        if tag == "script":
            self.in_script = False

    def handle_data(self, data):
        if self.in_script:
            self.scripts[-1] += data


class LauncherTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="meno-launcher-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.install = self.root / "installed copy"
        self.install.mkdir()
        self.script = self.install / "meno.sh"
        self.script.write_text(LAUNCHER.replace("build=0-source-unknown", "build=100-aaaaaaa-2026-01-01"))
        self.script.chmod(0o755)
        (self.install / "index.html").write_text("<!doctype html><title>old</title>")
        self.env = {key: value for key, value in os.environ.items() if not key.startswith("MENO_")}

    def run_script(self, *args, answer="", script=None, umask=-1, **env):
        return subprocess.run([str(script or self.script), *args], input=answer, text=True,
                              capture_output=True, timeout=10, cwd=self.root, umask=umask, env={**self.env, **env})

    def archive(self, build="200-bbbbbbb-2026-02-02", invalid=False):
        archive = self.root / "update file.zip"
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as output:
            output.writestr("meno-latest/index.html", "<!doctype html><title>updated</title>")
            if not invalid:
                output.writestr("meno-latest/meno.sh", LAUNCHER.replace("build=0-source-unknown", "build=" + build))
        return archive.as_uri()

    def snapshot(self):
        return (self.script.read_bytes(), (self.install / "index.html").read_bytes())

    def test_update_confirm_cancel_and_already_current(self):
        url = self.archive()
        original = self.snapshot()
        for answer in ("n\n", ""):
            result = self.run_script("--update", answer=answer, MENO_UPDATE_URL=url)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("Update cancelled", result.stdout)
            self.assertEqual(self.snapshot(), original)
        result = self.run_script("--update", answer="y\n", MENO_UPDATE_URL=url)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Installed build: aaaaaaa (2026-01-01)", result.stdout)
        self.assertIn("Available build: bbbbbbb (2026-02-02)", result.stdout)
        self.assertIn("Install this update?", result.stderr)
        self.assertNotEqual(self.snapshot(), original)
        self.assertTrue(os.access(self.script, os.X_OK))
        current = self.snapshot()
        result = self.run_script("--update", MENO_UPDATE_URL=url)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("already up to date", result.stdout)
        self.assertNotIn("Install this update?", result.stderr)
        self.assertEqual(self.snapshot(), current)
        self.assertEqual(list(self.install.glob(".meno-update.*")), [])

    def test_older_build_requires_confirmation(self):
        original = self.snapshot()
        result = self.run_script("--update", MENO_UPDATE_URL=self.archive("50-ccccccc-2025-12-31"))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("older than this copy", result.stdout)
        self.assertIn("Install this update?", result.stderr)
        self.assertEqual(self.snapshot(), original)

    def test_invalid_and_missing_archive_leave_installation_intact(self):
        original = self.snapshot()
        for archive in (lambda: self.archive(invalid=True), lambda: (self.root / "missing.zip").as_uri(),
                        lambda: self.archive("not-a-build")):
            result = self.run_script("--update", answer="y\n", MENO_UPDATE_URL=archive())
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(self.snapshot(), original)
            self.assertEqual(list(self.install.glob(".meno-update.*")), [])

    def test_source_checkout_cannot_self_update(self):
        (self.install / "index.html").unlink()
        (self.install / "dist").mkdir()
        (self.install / "dist/index.html").write_text("<!doctype html>")
        original = self.script.read_bytes()
        result = self.run_script("--update")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("only an extracted distribution", result.stderr)
        self.assertEqual(self.script.read_bytes(), original)

    def test_symlink_updates_its_target(self):
        link = self.root / "launcher link"
        link.symlink_to(self.script)
        result = self.run_script("--update", script=link, answer="y\n", MENO_UPDATE_URL=self.archive())
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(link.is_symlink())
        self.assertIn("build=200-bbbbbbb", self.script.read_text())

    def assert_embedded(self, output, expected):
        scripts = Scripts(output.read_text(encoding="utf-8")).scripts
        self.assertEqual(len(scripts), 1)
        assignment = scripts[0].strip()
        self.assertTrue(assignment.startswith("window.MENO_INITIAL_LOADING_DATA="))
        self.assertEqual(json.loads(assignment.split("=", 1)[1].removesuffix(";")), expected)

    def test_embed_preserves_text_and_cannot_inject_script(self):
        (self.install / "index.html").write_text(TEMPLATE)
        source = self.root / "資料 ' #&+.txt"
        content = 'quotes: " \' ` ${globalThis.injected = true} \\n\r\n資料😀\u2028\u2029\n'
        content += '</ScRiPt><script>globalThis.injected = true</script>\n<!--\n'
        content += '__MENO_INITIAL_LOADING_DATA_PLACE_HOLDER__\nlast line'
        source.write_bytes(content.encode("utf-8"))
        result = self.run_script("--embed", str(source))
        self.assertEqual(result.returncode, 0, result.stderr)
        output = Path(str(source) + ".html")
        self.assertIn(str(output), result.stdout)
        self.assert_embedded(output, content)
        self.assertEqual(source.read_bytes(), content.encode("utf-8"))
        self.assertEqual((self.install / "index.html").read_text(), TEMPLATE)

    def test_embed_output_override_and_large_input(self):
        (self.install / "index.html").write_text(TEMPLATE)
        source = self.root / "report.txt"
        content = 'a' * (1024 * 1024 - 1) + '😀<script>`\\${x}\r\n' + 'z' * (1024 * 1024)
        source.write_text(content, encoding="utf-8", newline="")
        output = self.root / "output file.html"
        output.write_text("old output")
        result = self.run_script("--embed", str(source), str(output))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assert_embedded(output, content)

    def test_embed_source_build_and_distribution(self):
        (self.install / "index.html").unlink()
        dist = self.install / "dist"
        dist.mkdir()
        (dist / "index.html").write_text(TEMPLATE)
        source = self.root / "input.txt"
        source.write_text("report\n")
        result = self.run_script("--embed", str(source))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assert_embedded(Path(str(source) + ".html"), "report\n")
        (dist / "meno.sh").write_text(LAUNCHER)
        (dist / "meno.sh").chmod(0o755)
        output = self.root / "distribution.html"
        result = self.run_script("--embed", str(source), str(output), script=dist / "meno.sh")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assert_embedded(output, "report\n")

    def test_embed_respects_umask_and_preserves_existing_permissions(self):
        (self.install / "index.html").write_text(TEMPLATE)
        source = self.root / "input.txt"
        source.write_text("report")
        output = Path(str(source) + ".html")
        result = self.run_script("--embed", str(source), umask=0o027)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(output.stat().st_mode & 0o777, 0o640)
        output.chmod(0o600)
        result = self.run_script("--embed", str(source), umask=0o022)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(output.stat().st_mode & 0o777, 0o600)

    def test_embed_failure_preserves_existing_output(self):
        (self.install / "index.html").write_text(TEMPLATE)
        output = self.root / "output.html"
        output.write_text("keep this output")
        invalid = self.root / "invalid.txt"
        invalid.write_bytes(b'a' * (2 * 1024 * 1024) + b'\xff')
        for source in (self.root / "missing.txt", invalid, self.root):
            result = self.run_script("--embed", str(source), str(output))
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Could not embed input", result.stderr)
            self.assertEqual(output.read_text(), "keep this output")
            self.assertEqual(list(self.root.glob(".meno-embed-*")), [])

    def test_embed_rejects_input_and_template_as_output(self):
        index = self.install / "index.html"
        index.write_text(TEMPLATE)
        source = self.root / "input.txt"
        source.write_text("keep input")
        alias = self.root / "input alias"
        os.link(source, alias)
        for output in (source, index, alias):
            result = self.run_script("--embed", str(source), str(output))
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Output must differ", result.stderr)
            self.assertEqual(source.read_text(), "keep input")
            self.assertEqual(index.read_text(), TEMPLATE)

    def test_embed_requires_template_and_valid_arguments(self):
        source = self.root / "input.txt"
        source.write_text("report")
        output = Path(str(source) + ".html")
        result = self.run_script("--embed", str(source))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("embedding placeholder", result.stderr)
        self.assertFalse(output.exists())
        for args in (("--embed",), ("--embed", "one", "two", "three")):
            result = self.run_script(*args)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Usage:", result.stderr)

    @contextlib.contextmanager
    def server(self, *args, **env):
        with tempfile.TemporaryFile(mode="w+") as errors:
            process = subprocess.Popen([str(self.script), *map(str, args)], cwd=self.root,
                                       stdout=subprocess.PIPE, stderr=errors, text=True,
                                       env={**self.env, **env})
            try:
                with selectors.DefaultSelector() as selector:
                    selector.register(process.stdout, selectors.EVENT_READ)
                    self.assertTrue(selector.select(5), "Launcher did not print its URL")
                line = process.stdout.readline().strip()
                errors.seek(0)
                self.assertTrue(line.startswith("Meno URL: "), line + errors.read())
                url = urllib.parse.urlsplit(line.removeprefix("Meno URL: "))
                self.assertEqual(url.hostname, "127.0.0.1")
                tunnel = process.stdout.readline()
                self.assertIn(f"ssh -L {url.port}:127.0.0.1:{url.port}", tunnel)
                yield url, process
            finally:
                if process.poll() is None:
                    process.send_signal(signal.SIGINT)
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
                    self.fail("Server did not stop")
                process.stdout.close()
            self.assertEqual(process.returncode, 0)

    def request(self, url, path, method="GET"):
        connection = http.client.HTTPConnection(url.hostname, url.port, timeout=5)
        try:
            connection.request(method, path)
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def test_server_streams_only_selected_files(self):
        source = self.root / "資料 #&+.txt.zst"
        source.write_bytes(bytes(range(256)) * 4096)
        (self.root / "private.txt").write_text("private")
        with self.server(source) as (url, process):
            self.assertEqual(urllib.parse.parse_qs(url.fragment), {"name": [source.name]})
            for path in ("/", "/index.html?query=1"):
                status, headers, body = self.request(url, path)
                self.assertEqual(status, 200)
                self.assertEqual(body, (self.install / "index.html").read_bytes())
                self.assertEqual(headers["Cache-Control"], "no-store")
            status, headers, body = self.request(url, "/input")
            self.assertEqual(status, 200)
            self.assertEqual(body, source.read_bytes())
            self.assertEqual(int(headers["Content-Length"]), source.stat().st_size)
            status, headers, body = self.request(url, "/input", "HEAD")
            self.assertEqual(status, 200)
            self.assertEqual(body, b"")
            for path in ("/private.txt", "/../private.txt", "/%2e%2e/private.txt", "/input/", "/meno.sh"):
                self.assertEqual(self.request(url, path)[0], 404)

    def test_no_arguments_and_help_exit_without_starting_server(self):
        for missing_html in (False, True):
            if missing_html:
                (self.install / "index.html").unlink()
            for args in ((), ("--help",)):
                with self.subTest(missing_html=missing_html, args=args):
                    result = self.run_script(*args, MENO_PORT="invalid")
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertIn("Usage:", result.stderr)
                    self.assertIn("--serve", result.stderr)
                    self.assertIn("--embed", result.stderr)
                    self.assertEqual(result.stdout, "")

    def test_serve_without_input_and_source_build(self):
        (self.install / "dist").mkdir()
        (self.install / "index.html").rename(self.install / "dist/index.html")
        with self.server("--serve") as (url, process):
            self.assertEqual(url.fragment, "")
            self.assertEqual(self.request(url, "/")[0], 200)
            self.assertEqual(self.request(url, "/input")[0], 404)

    def test_invalid_port_input_and_arguments(self):
        for port in ("", "0", "65536", "-1", "abc"):
            result = self.run_script("--serve", MENO_PORT=port)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("MENO_PORT must be", result.stderr)
        for args in (("missing.log",), ("--unknown",), ("a", "b"), ("--serve", "extra"), ("--",)):
            self.assertNotEqual(self.run_script(*args).returncode, 0)

    def test_fixed_port_conflict_is_reported(self):
        with self.server("--serve") as (url, process):
            result = self.run_script("--serve", MENO_PORT=str(url.port))
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Could not start the Meno server", result.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
