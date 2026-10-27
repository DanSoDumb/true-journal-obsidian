# True Journal

A trade journal for Obsidian: log trades as Markdown notes, review them with branching questions, track prop firm
accounts and payouts, and see your stats, all inside your vault.

## Install

1. Download the newest `truevision-journal-obsidian-<version>.zip` from [Releases](../../releases).
2. Unzip it. You get a folder called `truevision-journal`.
3. Put that folder in your vault's plugins folder: `<your vault>/.obsidian/plugins/`
   (In Finder press Cmd+Shift+. to see the hidden `.obsidian` folder.)
4. Restart Obsidian, then Settings → Community plugins → turn on "True Journal".

## Source

The source of the True Journal Obsidian plugin. `plugin/` is the plugin as it ships; the copy inside the
true vision vault is installed from here.

`plugin/main.js` is built: edit the section files in `src/` (one per part of the plugin, joined in file-name order;
`08b-vietnamese-words.js` is the Vietnamese word list). `scripts/build.sh` joins them and refuses to overwrite a hand
edit to `plugin/main.js`. The other scripts build first.

- `scripts/build.sh` joins `src/` into `plugin/main.js`.
- `scripts/test.sh` builds, then runs the test kit (`tests/test.cjs`).
- `scripts/install.sh` tests, then copies `plugin/` into the vault (never `data.json`) and restarts Obsidian.
- `scripts/release.sh <version>` builds the zip and the patch in Downloads after bumping `plugin/manifest.json`.
- The prop firm list is not part of the public source (see `src/41-prop-firm-list.js`); the release zips include it.
- `scripts/test.sh`, `scripts/release.sh` and the patch need files that are not public (the tests and the patch base).
