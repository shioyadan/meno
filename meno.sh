#!/usr/bin/env bash

# リモートやWSL上の入力を、SSH port forwarding先のbrowserからMenoで開く。
# PythonでHTMLと指定ファイルだけを固定URLへ対応付け、元のdirectory全体は公開しない。
# 配布済みdirectoryでは、Pages上の検証済みlatest archiveから自分自身を更新できる。
set -eu

# archive生成時にcommit時刻、hash、日付へ置換し、updateの表示と新旧判定に使う。
build=0-source-unknown

usage() {
    echo "Usage:" >&2
    echo "  $0 [FILE]" >&2
    echo "  $0 --embed FILE [OUTPUT.html]" >&2
    echo "  $0 --update" >&2
    exit "${1:-2}"
}

if [ "$#" -eq 1 ] && [ "$1" = "--help" ]; then
    usage 0
fi

# symlink経由でも配布本体を更新し、起動時にも同じHTMLを参照する。
script_path="$(realpath -- "$0")"
script_dir="$(CDPATH= cd -- "$(dirname -- "$script_path")" && pwd)"

if [ "$#" -eq 1 ] && [ "$1" = "--update" ]; then
    index_path="$script_dir/index.html"
    if [ ! -f "$index_path" ]; then
        echo "Meno can update only an extracted distribution with index.html next to meno.sh." >&2
        exit 1
    fi

    update_dir="$(mktemp -d "$script_dir/.meno-update.XXXXXX")"
    trap 'rm -rf -- "$update_dir"' EXIT
    trap 'exit 1' HUP INT TERM

    echo "Downloading the latest Meno development build..."
    update_url="${MENO_UPDATE_URL:-https://shioyadan.github.io/meno/meno-latest.zip}"
    archive_path="$update_dir/meno-latest.zip"
    if ! python3 -c \
        'import socket,sys; from urllib.request import urlretrieve; socket.setdefaulttimeout(30); urlretrieve(*sys.argv[1:])' \
        "$update_url" "$archive_path" ||
        ! python3 -m zipfile -e "$archive_path" "$update_dir"; then
        echo "Could not download and unpack the Meno update." >&2
        exit 1
    fi

    payload_dir="$update_dir/meno-latest"
    payload_build="$(sed -n 's/^build=//p' "$payload_dir/meno.sh" 2>/dev/null || true)"
    if [[ ! "$payload_build" =~ ^[0-9]+-[0-9a-f]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] ||
        [ "$(head -n 1 "$payload_dir/meno.sh")" != '#!/usr/bin/env bash' ] ||
        ! bash -n "$payload_dir/meno.sh" ||
        ! head -c 64 "$payload_dir/index.html" | grep -qi '^<!doctype html>'; then
        echo "The downloaded Meno update is invalid." >&2
        exit 1
    fi

    IFS=- read -r current_time current_hash current_date <<< "$build"
    IFS=- read -r payload_time payload_hash payload_date <<< "$payload_build"
    printf 'Installed build: %s (%s)\n' "$current_hash" "$current_date"
    printf 'Available build: %s (%s)\n' "$payload_hash" "$payload_date"
    if cmp -s "$payload_dir/meno.sh" "$script_path" &&
        cmp -s "$payload_dir/index.html" "$index_path"; then
        echo "Meno is already up to date."
        exit 0
    fi
    if [ "$payload_time" -gt "$current_time" ]; then
        echo "A newer Meno build is available:"
    elif [ "$payload_time" -lt "$current_time" ]; then
        echo "The available Meno build is older than this copy:"
    else
        echo "The available Meno build differs from this copy:"
    fi
    cmp -s "$payload_dir/meno.sh" "$script_path" || echo "  meno.sh"
    cmp -s "$payload_dir/index.html" "$index_path" || echo "  index.html"
    printf 'Install this update? [y/N] ' >&2
    if ! read -r answer; then
        echo >&2
        answer=
    fi
    case "$answer" in
        y|Y|yes|Yes|YES) ;;
        *)
            echo "Update cancelled."
            exit 0
            ;;
    esac

    chmod 755 "$payload_dir/meno.sh"
    chmod 644 "$payload_dir/index.html"

    # scriptを先に置換し、2つ目で中断しても--updateを再実行できるようにする。
    mv -f "$payload_dir/meno.sh" "$script_path"
    mv -f "$payload_dir/index.html" "$index_path"
    echo "Meno was updated to the latest development build."
    exit 0
fi

embed=0
if [ "${1:-}" = "--embed" ]; then
    embed=1
    shift
    if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then usage; fi
elif [ "${1:-}" = "--" ]; then
    shift
elif [[ "${1:-}" = -* ]]; then
    usage
fi
if [ "$embed" -eq 0 ] && [ "$#" -gt 1 ]; then usage; fi

# 配布版とsource treeで同じlauncherを使う。
if [ -f "$script_dir/index.html" ]; then
    index_file="$script_dir/index.html"
elif [ -f "$script_dir/dist/index.html" ]; then
    index_file="$script_dir/dist/index.html"
else
    echo "index.html was not found. Extract Meno or run make production first." >&2
    exit 1
fi

if [ "$embed" -eq 1 ]; then
    exec python3 - "$index_file" "$@" <<'PY'
import json
import os
from pathlib import Path
import sys
import tempfile

index = Path(sys.argv[1]).resolve()
source = Path(sys.argv[2]).resolve()
output = Path(sys.argv[3] if len(sys.argv) == 4 else sys.argv[2] + ".html").resolve()
temporary = None
try:
    if output in (source, index) or (output.exists() and any(output.samefile(path) for path in (source, index))):
        sys.exit("Output must differ from the input file and Meno's index.html.")
    template = index.read_text(encoding="utf-8")
    marker = "`\n__MENO_INITIAL_LOADING_DATA_PLACE_HOLDER__\n`"
    if template.count(marker) != 1:
        sys.exit("The Meno HTML does not contain an embedding placeholder. Run make production or extract a fresh distribution.")
    before, after = template.split(marker)
    # 入力は小分けにJSON文字列へ変換し、全体の複製をメモリ上へ保持しない。
    # 途中の読み込み失敗でも既存の出力を壊さないよう、同じdirectoryで生成後に置換する。
    with source.open(encoding="utf-8", newline="") as data:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="", dir=output.parent,
                                         prefix=".meno-embed-", suffix=".html", delete=False) as result:
            temporary = Path(result.name)
            result.write(before + '"')
            while chunk := data.read(1024 * 1024):
                # HTML parserによるscript終端と、JavaScriptの文字列解釈をともに避ける。
                encoded = json.dumps(chunk, ensure_ascii=False)[1:-1]
                result.write(encoded.replace("<", "\\u003c").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029"))
            result.write('"' + after)
        # 通常のファイル生成と同じumaskを使い、既存出力の権限は維持する。
        mask = os.umask(0o077)
        os.umask(mask)
        mode = output.stat().st_mode & 0o777 if output.exists() else 0o666 & ~mask
        os.chmod(temporary, mode)
        os.replace(temporary, output)
        temporary = None
    print(f"Created: {output}")
except (OSError, UnicodeError) as error:
    sys.exit(f"Could not embed input: {error}")
finally:
    if temporary is not None:
        temporary.unlink(missing_ok=True)
PY
fi

# port 0でbindしたserverから実際のportを取得し、空きport探索との競合を避ける。
# execによりCtrl+Cや終了signalをserverへ直接届ける。
exec python3 - "$index_file" "$@" <<'PY'
import http.server
import os
from pathlib import Path
import sys
import urllib.parse

port = os.environ.get("MENO_PORT")
if port is not None and (not port.isascii() or not port.isdecimal() or not 1 <= int(port) <= 65535):
    sys.exit("MENO_PORT must be an integer from 1 to 65535.")

files = {"/": sys.argv[1], "/index.html": sys.argv[1]}
fragment = ""
if len(sys.argv) == 3:
    source = Path(sys.argv[2]).resolve()
    if not source.is_file() or not os.access(source, os.R_OK):
        sys.exit("Input is not a readable file: " + str(source))
    if any(ord(char) < 32 or ord(char) == 127 for char in source.name):
        sys.exit("Input names must not contain control characters.")
    files["/input"] = str(source)
    fragment = "#" + urllib.parse.urlencode({"name": source.name})


class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, url):
        return files[urllib.parse.urlsplit(url).path]

    def send_head(self):
        if urllib.parse.urlsplit(self.path).path not in files:
            self.send_response(404)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None
        return super().send_head()

    def end_headers(self):
        # 同じportで別の入力を開いた場合も、以前の内容をcacheから読まない。
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def handle(self):
        try:
            super().handle()
        except (BrokenPipeError, ConnectionResetError):
            # 形式の自動判定や入力切り替えでは、browserが途中で通信を取り消す。
            pass


try:
    with http.server.ThreadingHTTPServer(("127.0.0.1", int(port) if port else 0), Handler) as server:
        port = server.server_port
        cyan = green = reset = ""
        if sys.stdout.isatty() and os.environ.get("TERM", "dumb") != "dumb" and not os.environ.get("NO_COLOR"):
            cyan, green, reset = "\033[1;36m", "\033[1;32m", "\033[0m"
        print(f"Meno URL: {cyan}http://127.0.0.1:{port}/{fragment}{reset}")
        print(f"SSH tunnel: {green}ssh -L {port}:127.0.0.1:{port} <host>{reset}")
        print("Press Ctrl+C to stop the server.", flush=True)
        server.serve_forever()
except KeyboardInterrupt:
    pass
except OSError as error:
    sys.exit(f"Could not start the Meno server: {error}")
PY
