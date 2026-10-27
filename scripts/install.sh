#!/bin/zsh
# Builds and tests the plugin, then copies it into the true vision vault (never touching data.json) and restarts Obsidian.
set -e
cd "${0:A:h}/.."
VAULT_PLUGIN="$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/true vision/.obsidian/plugins/truevision-journal"
scripts/build.sh
node tests/test.cjs "$PWD/plugin/main.js" | tail -1 | grep -q ", 0 failed" || { echo "Tests failed: not installed."; exit 1; }
was_running=0
if pgrep -x Obsidian >/dev/null; then
  was_running=1
  osascript -e 'tell application "Obsidian" to quit'
  for i in {1..40}; do pgrep -x Obsidian >/dev/null || break; sleep 0.5; done
  pgrep -x Obsidian >/dev/null && { echo "Obsidian did not quit: not installed."; exit 1; }
fi
rsync -a --exclude data.json --exclude .DS_Store plugin/ "$VAULT_PLUGIN/"
find "$VAULT_PLUGIN" -type f ! -name data.json -exec chmod 600 {} +
echo "Installed $(grep '"version"' plugin/manifest.json | tr -d ' ,')."
[ $was_running = 1 ] && open "obsidian://open?vault=true%20vision"
exit 0
