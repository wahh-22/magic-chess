#!/usr/bin/env bash
# Captures the running dev server with headless Chrome (software WebGL).
# Usage: scripts/screenshot.sh <output.png> [url] [wait-ms]
set -euo pipefail
output="$1"
url="${2:-http://localhost:5173/}"
wait_ms="${3:-8000}"
mkdir -p "$(dirname "$output")"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader \
  --hide-scrollbars --window-size=1280,800 --virtual-time-budget="$wait_ms" \
  --user-data-dir="$(mktemp -d)" --screenshot="$output" "$url" 2>/dev/null
echo "saved $output"
