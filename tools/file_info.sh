#!/usr/bin/env bash
set -euo pipefail

[ $# -eq 1 ] || { echo "Usage: $0 <path>" >&2; exit 2; }
[ -d "$1" ] || { echo "Error: $1 is not a directory." >&2; exit 1; }

script_dir=$(cd -- "$(dirname -- "$0")" && pwd)
target=$(cd -- "$1" && pwd -P)
date=$(date +%Y%m%d)

name=${target#/}
[ "$name" = home ] && name=home-all
[ -n "$name" ] || name=root
name=${name//\//-}

out="$name.$date.log.zst"
n=2
while [ -e "$out" ]; do
    out="$name.$date-$n.log.zst"
    n=$((n + 1))
done

nodejs --max-old-space-size=8192 "$script_dir/file_info.js" "$target" | zstd -q -T0 > "$out"
echo "$out" >&2
