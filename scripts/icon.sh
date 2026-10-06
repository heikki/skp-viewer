#!/usr/bin/env bash
#
# Render resources/icon.svg into resources/icon.iconset at every size macOS
# wants. Chrome draws one 1024px master (it handles the SVG's gradients and
# filters, and keeps the rounded corners transparent); sips scales it down.
#
# Usage:
#   bun run icon
#   CHROME=/path/to/chrome bun run icon    # if Chrome is installed elsewhere

set -euo pipefail

chrome=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
if [[ ! -x $chrome ]]; then
  echo "Chrome not found at: $chrome (set CHROME)" >&2
  exit 1
fi

cd "$(dirname "$0")/../resources"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

cat >"$tmp/icon.html" <<HTML
<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;background:transparent}img{display:block;width:1024px;height:1024px}</style>
<img src="file://$PWD/icon.svg">
HTML

"$chrome" --headless=new --disable-gpu --hide-scrollbars \
  --default-background-color=00000000 --window-size=1024,1024 \
  --screenshot="$tmp/master.png" "file://$tmp/icon.html" >/dev/null 2>&1

# name:pixels
sizes=(
  16x16:16 16x16@2x:32
  32x32:32 32x32@2x:64
  128x128:128 128x128@2x:256
  256x256:256 256x256@2x:512
  512x512:512 512x512@2x:1024
)

rm -rf icon.iconset
mkdir icon.iconset

for entry in "${sizes[@]}"; do
  name=${entry%%:*}
  px=${entry##*:}
  sips -z "$px" "$px" "$tmp/master.png" --out "icon.iconset/icon_$name.png" >/dev/null
done

echo "Rendered ${#sizes[@]} sizes into resources/icon.iconset"
