#!/bin/zsh
# Builds a release: scripts/release.sh 0.33.2 (the version must already be in plugin/manifest.json).
# Makes ~/Downloads/truevision-journal-obsidian-<version>.zip (no data.json) and a fresh
# ~/Downloads/true-journal-changes.patch against 0.31.1 (text files; the old patch goes to the Trash), and checks both.
set -e
cd "${0:A:h}/.."
V="$1"; [ -n "$V" ] || { echo "Usage: scripts/release.sh <version>"; exit 1; }
grep -q "\"version\": \"$V\"" plugin/manifest.json || { echo "plugin/manifest.json is not at $V."; exit 1; }
scripts/build.sh
node tests/test.cjs "$PWD/plugin/main.js" | tail -1 | grep -q ", 0 failed" || { echo "Tests failed: no release."; exit 1; }
ZIP="$HOME/Downloads/truevision-journal-obsidian-$V.zip"
[ -e "$ZIP" ] && { echo "$ZIP already exists."; exit 1; }
rm -rf dist && mkdir -p dist/stage
rsync -a --exclude data.json --exclude .DS_Store plugin/ dist/stage/truevision-journal/
(cd dist/stage && zip -r -X -q "$ZIP" truevision-journal)
mkdir dist/check && unzip -q "$ZIP" -d dist/check && diff -r dist/check/truevision-journal dist/stage/truevision-journal >/dev/null && echo "zip ok: $ZIP"
PATCH="$HOME/Downloads/true-journal-changes.patch"
[ -e "$PATCH" ] && mv "$PATCH" "$HOME/.Trash/true-journal-changes (before $V).patch"
mkdir -p dist/p/a/art dist/p/b/art
for f in README.md main.js manifest.json styles.css art/art.json; do cp "reference/0.31.1/$f" "dist/p/a/$f"; cp "plugin/$f" "dist/p/b/$f"; done
(cd dist/p && git diff --no-index --no-prefix a b > "$PATCH" || true)
cp -R reference/0.31.1 dist/apply && (cd dist/apply && patch -p1 -s < "$PATCH")
for f in README.md main.js manifest.json styles.css art/art.json; do cmp -s "dist/apply/$f" "plugin/$f" || { echo "patch check failed on $f"; exit 1; }; done
echo "patch ok: $PATCH"

# the shared iCloud folder (its link goes to people who install the plugin) always gets the newest zip
SHARED="$HOME/Library/Mobile Documents/com~apple~CloudDocs/True Journal releases"
if [ -d "$SHARED" ]; then cp "$ZIP" "$SHARED/" && echo "shared: $SHARED/$(basename "$ZIP")"; fi
