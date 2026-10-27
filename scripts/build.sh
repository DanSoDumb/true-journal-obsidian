#!/bin/zsh
# Joins src/*.js (in file-name order) into plugin/main.js, the one file Obsidian loads.
# Edit the files in src/, never plugin/main.js: a hand edit there is refused rather than overwritten.
set -e
cd "${0:A:h}/.."
mkdir -p dist
cat src/*.js > dist/main.new.js
node --check dist/main.new.js
STAMP=dist/.built-sha
if [ -e plugin/main.js ] && ! cmp -s dist/main.new.js plugin/main.js; then
  current=$(shasum -a 256 plugin/main.js | cut -d' ' -f1)
  if [ ! -e $STAMP ] || [ "$(cat $STAMP)" != "$current" ]; then
    git diff --quiet -- plugin/main.js 2>/dev/null || { echo "plugin/main.js was edited by hand: move the change into src/ first."; rm dist/main.new.js; exit 1; }
  fi
fi
mv dist/main.new.js plugin/main.js
shasum -a 256 plugin/main.js | cut -d' ' -f1 > $STAMP
