#!/usr/bin/env bash
set -eu

# 従来の入口を残し、埋め込み処理は自己更新されるlauncherへ統一する。
script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
exec "$script_dir/meno.sh" --embed "$@"
