#!/bin/bash
# Render a weekly report at phone (390px, via iframe because Chrome enforces a
# minimum window width) and desktop (1280px). Usage: ./render.sh kulka-weekly-02.html
set -euo pipefail
FILE="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
DIR="$(dirname "$FILE")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# The artifact pipeline injects doctype/head at publish; add them for local render.
{ echo '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'; cat "$FILE"; } > "$DIR/render.html"

cat > "$DIR/mobile-frame.html" <<EOF
<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#888}iframe{display:block;width:390px;height:3400px;border:0}</style></head>
<body><iframe src="render.html"></iframe></body></html>
EOF

"$CHROME" --headless=new --disable-gpu --virtual-time-budget=8000 --hide-scrollbars \
  --screenshot="$DIR/shot-mobile.png" --window-size=600,3400 "file://$DIR/mobile-frame.html" 2>/dev/null
"$CHROME" --headless=new --disable-gpu --virtual-time-budget=8000 --hide-scrollbars \
  --screenshot="$DIR/shot-desktop.png" --window-size=1280,2400 "file://$DIR/render.html" 2>/dev/null

echo "Rendered: $DIR/shot-mobile.png and $DIR/shot-desktop.png"
