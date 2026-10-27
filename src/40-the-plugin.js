class TrueVisionJournalPlugin extends Plugin {
  async onload() {
    const saved = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
    await this.loadChallengeCatalog();
    this.source = 'own'; // 'own' or the folder of an imported package being reviewed
    this.applyLanguage();
    this.applyStyle();
    CARD_CHIP = (this.settings.cardShow || {}).chip !== false;
    COPY_SHOW = { names: (this.settings.cardShow || {}).copyNames === true, balances: (this.settings.cardShow || {}).copyBalances !== false };
    payoutsSource = () => this.settings.payouts || [];
    demoAccountsNow = () => demoAccountsOf(this.settings.accountInfo);
    // the Copy desk card shows each account's balance
    cardBalances = () => {
      const all = this.getTrades().map((x) => x.trade), out = {};
      for (const a of this.allAccounts(all)) { const b = accountBalance(a, all, this.settings.accountInfo, this.settings.payouts); if (b) out[a] = b.balance; }
      return out;
    };
    this.app.workspace.onLayoutReady(() => this.applyWallpaper()); // the vault's files are listed by then
    // a background video follows the screens: opened, closed, moved or brought to the front (a moment later, once a
    // new screen has drawn itself)
    const syncVideos = () => { if (this.wallVideoUrl) window.setTimeout(() => this.syncWallVideos(), 60); };
    this.registerEvent(this.app.workspace.on('layout-change', syncVideos));
    this.registerEvent(this.app.workspace.on('active-leaf-change', syncVideos));
    this.registerDomEvent(document, 'visibilitychange', syncVideos);
    // how far a screen has scrolled, 0 at the top to 1 after 48px: the glass theme's fade under the nav follows it,
    // so it phases in and out with the page
    this.registerDomEvent(document, 'scroll', (evt) => {
      const el = evt.target;
      if (!el || !el.classList || !el.classList.contains('tvj-dashboard')) return;
      el.style.setProperty('--tvj-edge-o', String(Math.min(1, Math.max(0, el.scrollTop / 48)).toFixed(3)));
      el.classList.toggle('is-scrolled', el.scrollTop > 4);
    }, { capture: true, passive: true });
    // Reading every note's properties is the costly part of a screen, so inside Obsidian the lists of trades and
    // gym sessions are kept until a note changes. (A site that hosts the journal has a small vault of its own.)
    this.dataCache = new Map();
    this.journalPaths = new Set();
    this.inObsidian = !!(this.manifest && this.manifest.dir);
    if (this.inObsidian) {
      const stale = () => this.dataCache.clear();
      for (const name of ['changed', 'resolved']) this.registerEvent(this.app.metadataCache.on(name, stale));
      for (const name of ['create', 'modify', 'delete', 'rename']) this.registerEvent(this.app.vault.on(name, stale));
      BRAND = 'TRUE JOURNAL';
      // the card pictures are not needed to start Obsidian: read them once the workspace is up
      this.app.workspace.onLayoutReady(() => window.setTimeout(() => this.loadBundledArt(), 500));
    }
    this.addCommand({ id: 'style', name: tx('Style: theme and colours'), callback: () => new StyleModal(this.app, this).open() });
    this.registerView(VIEW_TYPE, (leaf) => new DashboardView(leaf, this));
    this.registerView(JOURNAL_VIEW_TYPE, (leaf) => new JournalView(leaf, this));
    this.registerView(GYM_VIEW_TYPE, (leaf) => new GymView(leaf, this));
    this.registerView(LOBBY_VIEW_TYPE, (leaf) => new LobbyView(leaf, this));
    this.registerView(TROPHY_VIEW_TYPE, (leaf) => new TrophyView(leaf, this));
    this.registerView(LESSONS_VIEW_TYPE, (leaf) => new LessonsView(leaf, this));
    this.registerView(NHAN_VIEW_TYPE, (leaf) => new NhanView(leaf, this));
    this.registerView(HOM_VIEW_TYPE, (leaf) => new HomView(leaf, this));
    this.addCommand({ id: 'open-hom', name: tx('Open a study case'), callback: () => this.openView(HOM_VIEW_TYPE) });
    this.addCommand({ id: 'open-nhan', name: tx('Nhẫn: practise patience'), callback: () => this.openView(NHAN_VIEW_TYPE) });
    this.addCommand({ id: 'open-lessons', name: tx('Open lessons (study notes drawn in Excalidraw)'), callback: () => this.openView(LESSONS_VIEW_TYPE) });
    // the lobby's certificates are kept by path: they follow a file (or its folder) that is renamed or moved
    this.registerEvent(this.app.vault.on('rename', (file, before) => {
      const list = this.settings.certificates;
      if (!Array.isArray(list) || !list.some((p) => p === before || p.startsWith(`${before}/`))) return;
      this.settings.certificates = list.map((p) => (p === before || p.startsWith(`${before}/`) ? file.path + p.slice(before.length) : p));
      this.saveData(this.settings);
    }));
    // a lesson's study mark is kept by its path: it follows the note when it (or its folder) is renamed
    this.registerEvent(this.app.vault.on('rename', (file, before) => {
      const marks = this.settings.lessonStatus || {};
      let changed = false;
      for (const path of Object.keys(marks)) {
        if (path !== before && !path.startsWith(`${before}/`)) continue;
        marks[file.path + path.slice(before.length)] = marks[path];
        delete marks[path];
        changed = true;
      }
      if (changed) this.saveData(this.settings);
    }));
    this.registerView(ACCOUNTS_VIEW_TYPE, (leaf) => new AccountsView(leaf, this));
    this.registerView(MUSIC_VIEW_TYPE, (leaf) => new MusicView(leaf, this));
    this.addCommand({ id: 'open-music', name: tx('Open the Music pane'), callback: () => this.openView(MUSIC_VIEW_TYPE) });
    this.addCommand({ id: 'open-accounts', name: tx('Open accounts (challenges and rules)'), callback: () => this.openView(ACCOUNTS_VIEW_TYPE) });
    this.addCommand({ id: 'open-trophies', name: tx('Open the trophy room'), callback: () => this.openView(TROPHY_VIEW_TYPE) });
    this.addCommand({ id: 'open-lobby', name: tx('Open lobby (profile and rank)'), callback: () => this.openView(LOBBY_VIEW_TYPE) });
    this.registerView(LOGIC_VIEW_TYPE, (leaf) => new LogicView(leaf, this));
    this.addCommand({ id: 'share', name: tx('Share for review: export or import a package'), callback: () => new PackageModal(this.app, this).open() });
    this.addCommand({ id: 'import-csv', name: tx('Import trades'), callback: () => new ImportCsvModal(this.app, this).open() }); // id kept for hotkeys
    this.addCommand({ id: 'combine-pyramids', name: tx('Combine trades (pyramid entries, partial exits)'), callback: () => new PyramidModal(this.app, this).open() });
    this.addCommand({ id: 'open-gym', name: tx('Open gym tracking'), callback: () => this.openView(GYM_VIEW_TYPE) });
    this.addCommand({ id: 'log-gym', name: tx('Log a gym session'), callback: () => new LogGymModal(this.app, this).open() });
    this.addCommand({ id: 'open-logic', name: tx('Open logic tree'), callback: () => this.openView(LOGIC_VIEW_TYPE) });
    // Quick access, one click each, to the two places used all day: the dashboard and the journal (trade list).
    // Review and flex card live inside them. The ribbon gets two icons; the status bar gets the same two with text.
    addIcon(ICON_ID, ICON_SVG);
    const openJournal = () => this.openView(JOURNAL_VIEW_TYPE);
    this.addRibbonIcon(ICON_ID, tx('TrueVision: Dashboard'), () => this.openDashboard());
    this.addRibbonIcon('notebook-pen', tx('TrueVision: Journal'), openJournal);
    this.addCommand({ id: 'open-journal', name: tx('Open journal (trade list)'), callback: openJournal });
    this.addCommand({ id: 'layout', name: tx('Choose a pane layout'), callback: () => new LayoutModal(this.app, this).open() });
    this.addCommand({
      id: 'open-chart',
      name: tx('Draw / open chart for this trade note (Excalidraw)'),
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const cache = file && this.app.metadataCache.getFileCache(file);
        if (!file || !tradeFromFrontmatter(cache && cache.frontmatter)) return false;
        if (!checking) this.openChart(file);
        return true;
      },
    });
    const quick = (icon, label, title, run) => {
      const el = this.addStatusBarItem();
      el.addClass('mod-clickable', 'tvj-quick');
      el.setAttribute('aria-label', title);
      setIcon(el.createSpan({ cls: 'tvj-quick-icon' }), icon);
      el.createSpan({ text: label });
      el.addEventListener('click', run);
    };
    quick(ICON_ID, tx('Dashboard'), tx('TrueVision: Dashboard'), () => this.openDashboard());
    quick('notebook-pen', tx('Journal'), tx('TrueVision: Journal'), openJournal);
    this.addCommand({ id: 'flex-card', name: tx('Flex card'), callback: () => new FlexCardModal(this.app, this).open() });
    this.addCommand({ id: 'open-dashboard', name: tx('Open dashboard'), callback: () => this.openDashboard() });
    this.addCommand({ id: 'new-trade', name: tx('New trade'), callback: () => new NewTradeModal(this.app, this).open() });
    this.addCommand({ id: 'review-trade', name: tx('Review a trade'), callback: () => new PendingTradeSuggest(this.app, this).open() });
    this.addCommand({
      id: 'download-video',
      name: tx('Download video (TikTok / YouTube)'),
      callback: async () => {
        const clip = (await navigator.clipboard.readText().catch(() => '')).trim();
        new VideoModal(this.app, this, isVideoUrl(clip) ? clip : '').open();
      },
    });
    this.registerView(SIDEBAR_VIEW_TYPE, (leaf) => new SidebarView(leaf, this));
    this.addCommand({ id: 'open-side-panel', name: tx('Open the side panel'), callback: () => this.openSidebar() });
    this.addRibbonIcon('panel-left', tx('True Journal: side panel'), () => this.openSidebar());
    // the first time, the panel is put in the left sidebar; after that it stays wherever you move or close it
    this.app.workspace.onLayoutReady(() => { if (!this.settings.sidePanelAdded) this.openSidebar(); });
    // the trade overview: a small card at the top of every open trade note, in place of its list of properties
    const decorate = (file) => this.decorateTradeNotes(file);
    this.registerEvent(this.app.workspace.on('file-open', () => decorate()));
    this.registerEvent(this.app.workspace.on('layout-change', () => decorate()));
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => decorate()));
    this.registerEvent(this.app.metadataCache.on('changed', (file) => decorate(file)));
    this.app.workspace.onLayoutReady(() => decorate());
    this.register(() => this.decorateTradeNotes(null, true));
    // the today panel: the same, in the right sidebar
    this.registerView(GLANCE_VIEW_TYPE, (leaf) => new GlanceView(leaf, this));
    this.addCommand({ id: 'open-today-panel', name: tx('Open the today panel'), callback: () => this.openTodayPanel() });
    this.app.workspace.onLayoutReady(() => { if (!this.settings.todayPanelAdded) this.openTodayPanel(); });
    // a first install (no settings saved yet, no trades in the vault): the welcome guide, once
    if (!saved) this.app.workspace.onLayoutReady(() => window.setTimeout(() => {
      if (!this.settings.guideShown && !this.getTrades(null, true).length) new WelcomeGuideModal(this.app, this).open();
    }, 1200));
    this.addCommand({ id: 'welcome-guide', name: tx('Show the welcome guide'), callback: () => new WelcomeGuideModal(this.app, this).open() });
    // this week's economic calendar, once a day (see calendar())
    this.app.workspace.onLayoutReady(() => window.setTimeout(() => { if (!this.settings.lobbyCalendarHidden) this.calendar(); }, 2000));
    this.addSettingTab(new JournalSettingTab(this.app, this));
  }

  /** Shows the side panel: puts it in the left sidebar when it is not open anywhere. */
  async openSidebar() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getLeftLeaf(false);
      if (!leaf) return;
      await leaf.setViewState({ type: SIDEBAR_VIEW_TYPE, active: true });
    }
    if (!this.settings.sidePanelAdded) {
      this.settings.sidePanelAdded = true;
      await this.saveData(this.settings);
    }
    workspace.revealLeaf(leaf);
  }
  /** Puts the trade overview (see renderTradeOverview) at the top of every open note that is a trade, under its
   *  title, and hides that note's properties (Show properties brings them back). `changed`: only redraw the notes
   *  of that file. `off`: take every overview away (Settings, or the plugin unloading). */
  decorateTradeNotes(changed, off) {
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      const view = leaf.view, file = view && view.file;
      if (!view || !view.containerEl) continue;
      if (changed && file !== changed) continue;
      const cache = file ? this.app.metadataCache.getFileCache(file) : null;
      const trade = !off && this.settings.tradeOverview !== false ? tradeFromFrontmatter(cache && cache.frontmatter) : null;
      for (const old of view.containerEl.querySelectorAll('.tvj-trade-overview')) old.remove();
      view.containerEl.toggleClass('tvj-trade-note', !!trade);
      if (!trade) { view.containerEl.removeClass('tvj-show-props'); continue; }
      const item = { file, trade };
      const shown = view.containerEl.hasClass('tvj-show-props');
      // under the note's title in both reading and editing view; above the note when the title is hidden
      const spots = [...view.containerEl.querySelectorAll('.inline-title')];
      for (const spot of spots.length ? spots : [view.contentEl.firstElementChild]) {
        if (!spot) continue;
        const card = createDiv();
        renderTradeOverview(card, trade, {
          edit: () => new NewTradeModal(this.app, this, item).open(),
          review: () => new ReviewModal(this.app, this, item).open(),
          properties: () => { view.containerEl.toggleClass('tvj-show-props', !view.containerEl.hasClass('tvj-show-props')); this.decorateTradeNotes(file); },
          propertiesShown: shown,
        });
        if (spots.length) spot.after(card); else view.contentEl.prepend(card);
      }
    }
  }

  /** Shows the today panel: puts it in the right sidebar when it is not open anywhere. */
  async openTodayPanel() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(GLANCE_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (!leaf) return;
      await leaf.setViewState({ type: GLANCE_VIEW_TYPE, active: true });
    }
    if (!this.settings.todayPanelAdded) {
      this.settings.todayPanelAdded = true;
      await this.saveData(this.settings);
    }
    workspace.revealLeaf(leaf);
  }
  /** Redraws the side panel's highlight (a screen changed what it shows without changing pane). */
  markSidebar() {
    for (const leaf of this.app.workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE)) if (leaf.view && leaf.view.markActive) leaf.view.markActive();
  }
  /** Opens the plugin's settings. */
  openSettings() {
    const setting = this.app.setting;
    if (!setting) return;
    setting.open();
    setting.openTabById(this.manifest.id);
  }
  /** Opens the Accounts screen on one of its tabs ('accounts' or 'tracker'). */
  async openAccountsTab(tab) {
    await this.openView(ACCOUNTS_VIEW_TYPE);
    const leaf = this.app.workspace.getLeavesOfType(ACCOUNTS_VIEW_TYPE)[0];
    if (leaf && leaf.view && leaf.view.render) {
      leaf.view.tab = tab;
      leaf.view.render();
    }
    this.markSidebar();
  }
  /** The view a "today" shortcut opens: the account of today's latest trade, else the last account you used,
   *  else All accounts. */
  todayScope() {
    const today = isoDay(new Date());
    const mine = this.getTrades().map((x) => x.trade).filter((t) => t.date === today && t.account).sort(byTime);
    if (mine.length) return `account:${mine[mine.length - 1].account}`;
    return this.settings.lastAccount ? `account:${this.settings.lastAccount}` : 'all';
  }
  /** Trades (newest first) and day notes that match a search: { trades: [{ file, trade }], days: [{ file, date,
   *  scope, owner }] }. A trade matches on its symbol, side, date, account, setups, mistakes, tags and what is
   *  written in its note; a day note on its date, whose it is and what is written in it. */
  async searchJournal(query, limit = 50) {
    const out = { trades: [], days: [] };
    if (!String(query || '').trim()) return out;
    for (const x of this.getTrades(null, true).sort((a, b) => byTime(b.trade, a.trade))) {
      if (out.trades.length >= limit) break;
      const t = x.trade;
      const fields = [t.symbol, t.direction, t.date, t.time, t.account, ...(t.setups || []), ...(t.mistakes || []), ...(t.tags || [])].join(' ');
      if (matchesQuery(fields, query) || (x.file instanceof TFile && matchesQuery(`${fields}\n${searchableBody(await this.app.vault.cachedRead(x.file))}`, query))) out.trades.push(x);
    }
    const shared = !!this.settings.dayNotesShared;
    const walk = async (folder) => {
      for (const f of folder.children) {
        if (f instanceof TFolder) { if (!shared) await walk(f); continue; } // per-account notes only show when notes are not shared
        if (!(f instanceof TFile) || f.extension !== 'md' || !/^\d{4}-\d{2}-\d{2}$/.test(f.basename)) continue;
        const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
        const kind = fm.account ? 'account' : fm.group ? 'group' : '';
        const owner = kind ? String(fm[kind]) : '';
        if (!matchesQuery(`${f.basename} ${owner} ${fm.bias || ''} ${fm.outcome || ''}\n${searchableBody(await this.app.vault.cachedRead(f))}`, query)) continue;
        out.days.push({ file: f, date: f.basename, owner, scope: kind ? `${kind}:${owner}` : 'all' });
      }
    };
    const days = this.app.vault.getAbstractFileByPath(normalizePath(`${this.settings.folder}/Days`));
    if (days instanceof TFolder) await walk(days);
    out.days.sort((a, b) => b.date.localeCompare(a.date) || a.owner.localeCompare(b.owner));
    out.days = out.days.slice(0, limit);
    return out;
  }

  /** Downloads the video behind a link into the folder `dir` with yt-dlp: { file } with where it is, or
   *  { error, missing } (`missing`: yt-dlp is not installed). */
  async fetchVideo(url, dir, name) {
    const s = this.settings;
    const got = await runTool(s.ytdlp, [...(s.ffmpeg !== DEFAULT_SETTINGS.ffmpeg ? ['--ffmpeg-location', s.ffmpeg] : []), ...ytArgs(url, dir, s.videoFormat, name)]);
    if (got.ok && got.out.trim()) return { file: got.out.trim().split('\n').pop().trim() };
    return { missing: !!got.missing, error: got.missing ? tx('yt-dlp not found: set its path in the plugin settings') : (got.err.trim().split('\n').pop() || '?') };
  }

  /** The post an Instagram share link leads to ('https://www.instagram.com/reel/<id>/'), from where it redirects
   *  or, when it does not, from the page's own address in it (og:url, canonical); '' when it cannot be learned.
   *  Desktop only: the redirects are read with Node, which (unlike a web request) shows where they go. */
  async followInstagramShare(link) {
    const https = window.require('https');
    const get = (url) => new Promise((resolve) => {
      const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', Accept: 'text/html' }, timeout: 15000 }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (d) => { if (body.length < 500000) body += d; });
        res.on('end', () => resolve({ location: res.headers.location || '', body }));
      });
      req.on('timeout', () => req.destroy(new Error('timed out')));
      req.on('error', () => resolve(null));
    });
    let url = String(link).trim();
    for (let hop = 0; hop < 5; hop++) {
      const res = await get(url);
      if (!res) return '';
      if (res.location) {
        const next = new URL(res.location, url).href;
        const post = instagramPost(new URL(next).pathname === '/accounts/login/' ? new URL(next).searchParams.get('next') : next);
        if (post) return post;
        url = next;
        continue;
      }
      const named = (res.body.match(/property="og:url" content="([^"]+)"/) || [])[1] || (res.body.match(/rel="canonical" href="([^"]+)"/) || [])[1];
      return instagramPost(named);
    }
    return '';
  }

  /** Saves the video behind a link into <folder>/Videos with yt-dlp, and embeds it in the note being edited. */
  async downloadVideo(url) {
    if (!isVideoUrl(url)) { new Notice(tx('Not a valid http(s) link')); return; }
    if (!canRunTools(this.app)) { new Notice(tx('Downloading videos works on desktop only')); return; }
    const folder = normalizePath(`${this.settings.folder}/Videos`);
    await this.ensureFolder(folder);
    const editor = this.app.workspace.activeEditor && this.app.workspace.activeEditor.editor;
    const busy = new Notice(tx('Downloading video…'), 0);
    const got = await this.fetchVideo(url, this.app.vault.adapter.getFullPath(folder));
    busy.hide();
    if (!got.file) { new Notice(`${tx('Download failed')}: ${got.error}`, 10000); return; }
    const name = window.require('path').basename(got.file);
    if (editor) editor.replaceSelection(`![[${name}]]\n`);
    new Notice(`${tx('Saved')} ${folder}/${name}`);
  }

  /** Downloads the video behind a YouTube or TikTok link and makes it the flex card's video file, so the card
   *  plays it with its sound and Save video renders it at its full size. true / false as setCardPicture; null
   *  when the video could not be downloaded (no yt-dlp, a private video…) and the link has to play in a frame. */
  async cardVideoFromLink(link, take) {
    const fs = window.require('fs'), path = window.require('path');
    const dir = fs.mkdtempSync(path.join(window.require('os').tmpdir(), 'tvj-'));
    const busy = new Notice(tx('Downloading video…'), 0);
    try {
      if (isInstagramShare(link)) link = (await this.followInstagramShare(link)) || link;
      const got = await this.fetchVideo(link, dir, 'card.%(ext)s');
      if (!got.file) {
        // Instagram gives some posts only to someone logged in (a private account, an age limit)
        const login = /instagram/i.test(link) && /log(ged)?[ -]?in|cookies|not granting access|empty media/i.test(got.error) ? ` ${tx('(Instagram only shows this post to someone logged in: it may be private.)')}` : '';
        if (!got.missing) new Notice(`${tx('Download failed')}: ${got.error}${login}`, 12000);
        else if (!isTikTok(link) && !youtubeTarget(link)) notify('yt-dlp not found: set its path in the plugin settings'); // only yt-dlp reads other sites
        return null;
      }
      const file = await this.playableVideo(got.file);
      const read = async () => { const b = fs.readFileSync(file); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
      const picked = { name: path.basename(file), size: fs.statSync(file).size, arrayBuffer: read };
      return await (take ? take(picked) : this.setCardPicture(picked));
    } catch (e) {
      console.error('TrueVision Journal: could not use the video behind a link', e);
      new Notice(`${tx('Download failed')}: ${e.message}`, 10000);
      return null;
    } finally {
      busy.hide();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  /** A downloaded video as one Obsidian can show. TikTok serves its sharpest picture as H.265, which Obsidian
   *  plays as sound with no picture: ffmpeg turns that into H.264 at the same size. Resolves to the file to use
   *  (the one given when nothing had to be done, or ffmpeg is missing). */
  async playableVideo(file) {
    const seen = await runTool(this.settings.ffmpeg, ['-hide_banner', '-i', file]);
    if (!isH265(seen.err)) return file;
    const out = file.replace(/\.[^.\\/]+$/, '-h264.mp4');
    return (await runTool(this.settings.ffmpeg, h264Args(file, out))).ok ? out : file;
  }

  /** Save video without recording: ffmpeg lays the card (drawn see-through by `overlay(canvas)`) over the video
   *  file itself and writes an MP4 where clips go, at the video's own size (see renderSize), whole, with its
   *  sound. `progress(0..1)` is told how far it is. Resolves to whether the video was written.
   *  `counted`: the card's numbers count up over the video's first seconds — `overlay(canvas, progress)` is then
   *  drawn once per frame of the count (see countProgress), and the last picture stays on to the end. */
  async renderCardVideo(file, video, overlay, title, progress, counted) {
    const fs = window.require('fs'), path = window.require('path');
    const [w, h] = renderSize(video.videoWidth, video.videoHeight);
    const sheet = document.createElement('canvas');
    sheet.width = w;
    sheet.height = h;
    sheet.getContext('2d').scale(w / CARD_W, h / CARD_H);
    const RATE = 30;
    const frames = counted ? Math.ceil(COUNT_LENGTH * RATE) + 1 : 1;
    const base = path.join(window.require('os').tmpdir(), `tvj-card-${Date.now()}`);
    const pngs = [];
    try {
      for (let i = 0; i < frames; i++) {
        overlay(sheet, counted && i < frames - 1 ? countProgress(i / RATE) : null);
        const blob = await new Promise((resolve) => sheet.toBlob(resolve, 'image/png'));
        const png = counted ? `${base}-${String(i).padStart(3, '0')}.png` : `${base}.png`;
        fs.writeFileSync(png, Buffer.from(await blob.arrayBuffer()));
        pngs.push(png);
      }
      const folder = this.gifFolder();
      fs.mkdirSync(folder, { recursive: true });
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const out = path.join(folder, `${stamp} ${safeName(title)}.mp4`);
      const length = video.duration;
      const sheetArg = counted ? `${base}-%03d.png` : pngs[0];
      const got = await runTool(this.settings.ffmpeg, ffmpegArgs(this.app.vault.adapter.getFullPath(file.path), sheetArg, out, w, h, counted ? RATE : 0), (text) => {
        const m = text.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
        if (m && length > 0) progress(Math.min(1, (m[1] * 3600 + m[2] * 60 + Number(m[3])) / length));
      });
      if (!got.ok) {
        new Notice(got.missing ? tx('ffmpeg not found: the card is recorded instead') : `${tx('The video could not be rendered')}: ${got.err.trim().split('\n').pop()}`, 10000);
        return false;
      }
      this.lastGif = out;
      notify(`Saved: ${out}`);
      return true;
    } catch (e) {
      return false;
    } finally {
      for (const png of pngs) fs.rm(png, { force: true }, () => {});
    }
  }

  /** 'auto' follows the language Obsidian itself is set to. */
  applyLanguage() {
    const choice = this.settings.language;
    const obsidian = (window.localStorage.getItem('language') || (window.moment && window.moment.locale()) || 'en').toLowerCase();
    LANG = choice === 'vi' || (choice !== 'en' && obsidian.startsWith('vi')) ? 'vi' : 'en';
  }

  /** Writes the chosen theme / colours onto <body>; with everything on "auto" it removes them all. */
  applyStyle() {
    const values = styleValues(this.settings);
    for (const key of STYLE_VARS) {
      if (values[key]) document.body.style.setProperty(`--tvj-${key}`, values[key]);
      else document.body.style.removeProperty(`--tvj-${key}`);
    }
    document.body.classList.toggle('tvj-custom', !!themeOf(this.settings.theme));
    // the glass look: a class on <body>, and once, the SVG filter its panels bend the background through
    document.body.classList.toggle('tvj-glass', !!this.settings.glass);
    if (this.settings.glass && !document.getElementById('tvj-glass-defs')) {
      const holder = document.body.createDiv({ attr: { id: 'tvj-glass-defs', 'aria-hidden': 'true' } });
      holder.innerHTML = '<svg width="0" height="0" style="position:absolute"><filter id="tvj-refract" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.006 0.009" numOctaves="2" seed="11" result="noise"/><feGaussianBlur in="noise" stdDeviation="3" result="soft"/><feDisplacementMap in="SourceGraphic" in2="soft" scale="46" xChannelSelector="R" yChannelSelector="G"/></filter></svg>';
    }
  }

  /** Puts the uploaded background picture (Style panel) behind every screen of the plugin, or takes it away. */
  async applyWallpaper() {
    const file = this.pictureFile('wallpaper');
    const video = !!file && CARD_VIDEO_EXTS.includes(file.extension);
    let url = '';
    if (file) {
      try {
        const type = video ? (file.extension === 'webm' ? 'video/webm' : 'video/mp4') : `image/${file.extension === 'jpg' ? 'jpeg' : file.extension}`;
        url = URL.createObjectURL(new Blob([await this.app.vault.readBinary(file)], { type }));
      } catch (e) { url = ''; }
    }
    const old = this.wallpaperUrl;
    this.wallpaperUrl = url;
    this.wallVideoUrl = url && video ? url : '';
    if (url && !video) document.body.style.setProperty('--tvj-wallpaper', `url("${url}")`);
    else document.body.style.removeProperty('--tvj-wallpaper');
    if (url) document.body.style.setProperty('--tvj-wallpaper-dim', `${this.settings.wallpaperDim || 55}%`);
    else document.body.style.removeProperty('--tvj-wallpaper-dim');
    document.body.classList.toggle('tvj-wallpaper', !!url);
    document.body.classList.toggle('tvj-wallvideo', !!this.wallVideoUrl);
    document.body.classList.toggle('tvj-wallfit', !!url && this.settings.wallpaperFit === 'fit');
    this.syncWallVideos();
    if (old) URL.revokeObjectURL(old); // after the videos moved to the new one
  }

  /** With a video as the background, every open screen of the plugin plays it behind its page, under the same wash
   *  as a picture. Only the screens you can see play (a tab in the background pauses), and with Reduce motion on, or
   *  while Obsidian is hidden, it holds still. */
  syncWallVideos() {
    const url = this.wallVideoUrl || '';
    const still = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const away = document.visibilityState === 'hidden';
    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view, host = view && view.containerEl;
      if (!host || !host.querySelector) return;
      let video = host.querySelector(':scope > video.tvj-wallvideo');
      const ours = !!(view.contentEl && view.contentEl.classList.contains('tvj-dashboard'));
      if (!url || !ours) {
        if (video) { video.pause(); video.removeAttribute('src'); video.load(); video.remove(); }
        return;
      }
      if (!video) {
        video = document.createElement('video');
        video.className = 'tvj-wallvideo';
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.setAttribute('aria-hidden', 'true');
        host.prepend(video);
      }
      if (video.dataset.src !== url) { video.src = url; video.dataset.src = url; }
      const shown = host.offsetParent !== null; // a tab in the background is display: none
      if (shown && !still && !away) { const playing = video.play(); if (playing && playing.catch) playing.catch(() => {}); } else video.pause();
    });
  }

  /** Obsidian calls this when data.json was changed from outside — another device saving it through iCloud or
   *  Sync. The settings are read again, so this device never later saves its older copy over what the other one
   *  set (a setting, a new account, today's Nhẫn). */
  async onExternalSettingsChange() {
    const saved = await this.loadData();
    if (!saved) return;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
    CARD_CHIP = (this.settings.cardShow || {}).chip !== false;
    COPY_SHOW = { names: (this.settings.cardShow || {}).copyNames === true, balances: (this.settings.cardShow || {}).copyBalances !== false };
    this.applyLanguage();
    this.applyStyle();
    this.refreshViews();
  }

  onunload() {
    for (const key of STYLE_VARS) document.body.style.removeProperty(`--tvj-${key}`);
    for (const key of ['wallpaper', 'wallpaper-dim']) document.body.style.removeProperty(`--tvj-${key}`);
    this.wallVideoUrl = '';
    this.syncWallVideos(); // takes the background videos out
    if (this.wallpaperUrl) URL.revokeObjectURL(this.wallpaperUrl);
    document.body.classList.remove('tvj-custom', 'tvj-wallpaper', 'tvj-wallvideo', 'tvj-wallfit', 'tvj-glass');
    const glassDefs = document.getElementById('tvj-glass-defs');
    if (glassDefs) glassDefs.remove();
  }

  openDashboard() {
    return this.openView(VIEW_TYPE);
  }

  /** Opens the view in a new tab, or over the current one when Settings → Open screens in says so; jumps to it
   *  instead when it is already open. The side pane trade notes open in is never replaced. */
  async openView(type, select) {
    const { workspace } = this.app;
    this.pendingLogic = type === LOGIC_VIEW_TYPE ? select : undefined; // which tree the Logic screen should show
    const existing = workspace.getLeavesOfType(type);
    if (existing.length) {
      if (select && existing[0].view && existing[0].view.render) {
        existing[0].view.current = select;
        existing[0].view.render();
      }
      workspace.revealLeaf(existing[0]);
      return;
    }
    // getLeaf(false) only reuses a tab showing a note, so the tab you are on is taken directly: the last one used in
    // the main area (not a sidebar), unless it is pinned
    const here = this.settings.openIn === 'current' && workspace.getMostRecentLeaf ? workspace.getMostRecentLeaf(workspace.rootSplit) : null;
    const usable = here && here !== this.sideLeaf && !(here.getViewState && here.getViewState().pinned);
    const leaf = usable ? here : workspace.getLeaf('tab');
    await leaf.setViewState({ type, active: true });
    workspace.revealLeaf(leaf);
  }

  /** Accounts added by hand plus every account that appears on a trade. */
  allAccounts(trades) {
    return [...new Set([...(this.settings.accounts || []), ...trades.map(accountName)])].sort((a, b) => a.localeCompare(b));
  }

  /** Synced lyrics for what is playing, from LRCLIB (lrclib.net, an open lyrics library: no account, nothing kept
   *  in the vault). Resolves to [{ t, text }] or null when the song has none there. Asked once per song. */
lyricsFor(now) {
    if (!now || !now.title) return Promise.resolve(null);
    const queries = songQueries(now.title, now.by);
    if (!queries.length) return Promise.resolve(null);
    const key = `${now.title}|${now.by || ''}`.toLowerCase();
    this.lyricCache = this.lyricCache || new Map();
    if (this.lyricCache.has(key)) return this.lyricCache.get(key);
    const disk = (() => {
      if (!canRunTools(this.app)) return null;
      try {
        const c = this.audioCache();
        const file = c.path.join(c.dir, 'lyrics.json');
        if (!this.lyricsKept) { try { this.lyricsKept = JSON.parse(c.fs.readFileSync(file, 'utf8')); } catch (e) { this.lyricsKept = {}; } }
        return { get: () => this.lyricsKept[key], put: (lines) => { this.lyricsKept[key] = lines; const keys = Object.keys(this.lyricsKept); for (const k of keys.slice(0, Math.max(0, keys.length - 300))) delete this.lyricsKept[k]; c.fs.writeFileSync(file, JSON.stringify(this.lyricsKept)); } };
      } catch (e) { return null; }
    })();
    if (disk && Array.isArray(disk.get()) && disk.get().length) { const kept = Promise.resolve(disk.get()); this.lyricCache.set(key, kept); return kept; }
    const ask = async (params) => {
      const url = `https://lrclib.net/api/search?${new URLSearchParams(params).toString()}`;
      const res = typeof requestUrl === 'function'
        ? await requestUrl({ url, headers: { 'User-Agent': 'TrueJournal-Obsidian (https://lrclib.net)' }, throw: false })
        : await fetch(url);
      const rows = typeof requestUrl === 'function' ? (res.status === 200 ? res.json : []) : (res.ok ? await res.json() : []);
      return Array.isArray(rows) ? rows : [];
    };
    const best = (rows, length) => {
      const synced = rows.filter((r) => r && r.syncedLyrics && !r.instrumental);
      // the closest in length; a video with an intro or an outro is longer than the song, so none is ruled out
      synced.sort((a, b) => (length ? Math.abs((a.duration || 0) - length) - Math.abs((b.duration || 0) - length) : 0));
      return synced[0] || null;
    };
    const found = (async () => {
      const length = Number(now.duration) || 0;
      for (const q of queries) {
        try {
          let pick = q.artist ? best(await ask({ track_name: q.track, artist_name: q.artist }), length) : null;
          if (!pick) pick = best(await ask({ q: `${q.track} ${q.artist}`.trim() }), length);
          const lines = pick ? parseLrc(pick.syncedLyrics) : [];
          if (lines.length) { try { if (disk) disk.put(lines); } catch (e) { /* kept in memory only */ } return lines; }
        } catch (e) {
          // try the next reading
        }
      }
      return null;
    })();
    this.lyricCache.set(key, found);
    return found;
  }

  /** The playing position now, in seconds: the last one reported, carried on by the clock while playing. */
  playingTime() {
    const now = this.nowPlaying;
    if (!now) return 0;
    const moved = now.playing && this.nowStamp ? (Date.now() - this.nowStamp) / 1000 : 0;
    return (Number(now.time) || 0) + moved;
  }

  /** A lyrics box in `parent`: the line being sung, the next one under it, following the music. `view` owns it. */
  mountLyrics(parent, view, sayMissing = false) {
    const box = parent.createDiv({ cls: 'tvj-lyrics is-empty' });
    const current = box.createDiv({ cls: 'tvj-lyrics-now' });
    const next = box.createDiv({ cls: 'tvj-lyrics-next' });
    let lines = null, songKey = '', shown = -2;
    // the song's own offset, in seconds: lyrics show that much later (a video's intro) or earlier
    const offsets = () => (this.settings.lyricOffsets && typeof this.settings.lyricOffsets === 'object' ? this.settings.lyricOffsets : {});
    const offset = () => Number(offsets()[songKey.toLowerCase()]) || 0;
    let offsetLabel = null;
    const setOffset = async (value) => {
      const all = { ...offsets() };
      const v = Math.round(value * 10) / 10;
      if (v) all[songKey.toLowerCase()] = v; else delete all[songKey.toLowerCase()];
      const keys = Object.keys(all);
      for (const k of keys.slice(0, Math.max(0, keys.length - 300))) delete all[k]; // keep the newest 300 songs
      this.settings.lyricOffsets = all;
      shown = -2;
      await this.saveData(this.settings);
      for (const l of this.nowListeners || []) l();
    };
    const load = () => {
      const now = this.nowPlaying;
      const key = now ? `${now.title}|${now.by}` : '';
      if (key === songKey) return;
      songKey = key;
      lines = null;
      shown = -2;
      box.addClass('is-empty');
      box.removeClass('has-lines');
      current.setText('');
      next.setText('');
      if (!now) return;
      if (sayMissing) { box.removeClass('is-empty'); box.addClass('is-note'); current.setText(tx('Looking for lyrics…')); }
      this.lyricsFor(now).then((found) => {
        if (songKey !== key) return;
        lines = found;
        if (!found && sayMissing) { box.removeClass('is-empty'); box.addClass('is-note'); current.setText(tx('No synced lyrics found for this song.')); next.setText(''); return; }
        box.removeClass('is-note');
        box.addClass('has-lines');
        tick();
      });
    };
    const tick = () => {
      if (!box.isConnected) return;
      if (!lines) { if (!box.hasClass('is-note')) box.addClass('is-empty'); return; }
      if (offsetLabel) offsetLabel.setText(offset() ? `${offset() > 0 ? '+' : ''}${offset().toFixed(1)}s` : '0s');
      const at = lyricIndex(lines, this.playingTime() - offset());
      if (at === shown) return;
      shown = at;
      box.removeClass('is-empty');
      const line = (i) => (i >= 0 && i < lines.length ? lines[i].text || '♪' : '');
      current.setText(at < 0 ? '♪' : line(at));
      next.setText(line(at + 1));
      current.removeClass('is-in');
      void current.offsetWidth; // restart the fade for the new line
      current.addClass('is-in');
    };
    if (sayMissing) {
      // in the Music pane: put the lyrics in time with the music
      const keys = box.createDiv({ cls: 'tvj-lyrics-sync' });
      const key = (text, label, run) => keys.createEl('button', { text, attr: { 'aria-label': tx(label) } }).addEventListener('click', run);
      key('−1s', 'Lyrics earlier by a second', () => setOffset(offset() - 1));
      offsetLabel = keys.createSpan({ cls: 'tvj-muted', text: '0s' });
      key('+1s', 'Lyrics later by a second', () => setOffset(offset() + 1));
      key(tx('Lyrics start now'), 'Press when the singing starts', () => {
        if (!lines) return;
        const first = lines.find((l) => l.text) || lines[0];
        setOffset(this.playingTime() - first.t);
      });
      key(tx('Reset'), 'Back to the lyrics\' own timing', () => setOffset(0));
    }
    this.nowListeners = this.nowListeners || new Set();
    const listener = () => { load(); tick(); };
    this.nowListeners.add(listener);
    view.register(() => this.nowListeners.delete(listener));
    view.registerInterval(window.setInterval(tick, 200));
    load();
    return box;
  }


  // ---- the link player: the sound of any link (YouTube, SoundCloud and most music and video sites), read with
  // yt-dlp and played by the plugin itself: no web page, so no ads and no sign-in. It belongs to the plugin, so it
  // goes on whatever screen is drawn. ----

  /** Whether the link player can run here: a computer with yt-dlp (Settings → yt-dlp path). */
  linkReady() {
    return canRunTools(this.app) && this.settings.linkPlayer !== false;
  }
  linkState() {
    if (!this.linkQueue) {
      const kept = this.settings.linkQueue;
      this.linkQueue = kept && Array.isArray(kept.items) ? { items: kept.items.filter((x) => x && x.link), index: Number(kept.index) || 0 } : { items: [], index: 0 };
    }
    return this.linkQueue;
  }
  saveLinkQueue() {
    const q = this.linkState();
    this.settings.linkQueue = { items: q.items.slice(0, 500).map((x) => ({ link: x.link, title: x.title || '', by: x.by || '', cover: x.cover || '', duration: x.duration || 0, ...(x.collection ? { collection: true } : {}) })), index: q.index };
    window.clearTimeout(this.linkSaveTimer);
    this.linkSaveTimer = window.setTimeout(() => this.saveData(this.settings), 800);
  }
  refreshLinkViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(MUSIC_VIEW_TYPE)) if (leaf.view && leaf.view.paintLink) leaf.view.paintLink();
  }
  /** The plugin's own audio element for links (made once). */
  linkAudio() {
    if (!this.linkEl) {
      const a = new Audio();
      a.preload = 'auto';
      const v = Number(this.settings.musicVolume);
      a.volume = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
      a.addEventListener('ended', () => {
        const repeat = this.settings.linkRepeat;
        if (repeat === 'one') { a.currentTime = 0; a.play().catch(() => {}); return; }
        const q = this.linkState();
        if (q.index + 1 >= q.items.length && repeat === 'all' && q.items.length) { this.linkPlayAt(0); return; }
        this.linkStep(1, true);
      });
      a.addEventListener('error', () => {
        if (!a.getAttribute('src')) return;
        const q = this.linkState();
        const item = q.items[q.index];
        if (item) this.streamCache && this.streamCache.delete(item.link); // a stream link that ran out: asked again next time
        notify('That song could not be played. Going on to the next one.');
        this.linkStep(1, true);
      });
      let last = -1;
      a.addEventListener('timeupdate', () => { const s = Math.floor(a.currentTime || 0); if (s !== last) { last = s; this.linkReport(); } });
      for (const event of ['play', 'pause', 'playing', 'loadedmetadata']) a.addEventListener(event, () => { this.linkReport(); this.refreshLinkViews(); });
      this.register(() => { a.pause(); a.removeAttribute('src'); });
      this.linkEl = a;
    }
    return this.linkEl;
  }
  /** Tells the lobby's music card, the lyrics and the keys what the link player is playing. */
  linkReport() {
    const q = this.linkState();
    const item = q.items[q.index];
    const a = this.linkEl;
    if (!item || !a || !a.getAttribute('src')) return;
    this.linkMediaSession(item);
    this.setNowPlaying({ title: item.title || item.link, by: item.by || '', cover: item.cover || '', link: item.link, playing: !a.paused,
      time: Math.floor(a.currentTime || 0), duration: Number.isFinite(a.duration) ? Math.floor(a.duration) : Math.floor(item.duration || 0) }, {
      toggle: () => this.linkToggle(),
      previous: () => { if (a.currentTime > 4) a.currentTime = 0; else this.linkStep(-1); },
      next: () => this.linkStep(1),
      seek: (share) => { if (Number.isFinite(a.duration)) a.currentTime = share * a.duration; },
      volume: (share) => { a.volume = Math.max(0, Math.min(1, share)); },
    });
  }
  /** The songs behind a link: one song, or every song of a playlist, set, album or profile (listed, not played). */
  async streamInfo(link) {
    const got = await runTool(this.settings.ytdlp, ['-J', '--flat-playlist', '--no-warnings', '--', link]); // "--": a link can never be read as an option
    if (!got.ok) { if (got.missing) notify('yt-dlp not found: set its path in the plugin settings'); return { title: '', items: [] }; }
    let j;
    try { j = JSON.parse(got.out); } catch (e) { return { title: '', items: [] }; }
    const entries = j._type === 'playlist' ? (j.entries || []) : [j];
    const youtube = /youtube/i.test(String(j.extractor || j.extractor_key || ''));
    const items = entries.filter(Boolean).map((e) => {
      const url = e.webpage_url || (/^https?:/.test(String(e.url || '')) ? e.url : youtube && e.id ? `https://www.youtube.com/watch?v=${e.id}` : e.url);
      const thumbs = Array.isArray(e.thumbnails) ? e.thumbnails : [];
      return { link: url, title: e.title || '', by: e.uploader || e.channel || j.uploader || j.channel || '', cover: (thumbs.length ? thumbs[thumbs.length - 1].url : e.thumbnail) || '', duration: e.duration || 0 };
    }).filter((x) => x.link);
    return { title: j.title || '', items };
  }
  /** The folder songs are kept in once fetched, with an index from link to file, so a song heard before starts at
   *  once (no yt-dlp call) and plays without a connection. Kept to the newest 600 MB. */
  audioCache() {
    const fs = window.require('fs'), path = window.require('path'), os = window.require('os');
    const dir = path.join(os.tmpdir(), 'tvj-music');
    fs.mkdirSync(dir, { recursive: true });
    const indexFile = path.join(dir, 'index.json');
    if (!this.audioIndex) { try { this.audioIndex = JSON.parse(fs.readFileSync(indexFile, 'utf8')); } catch (e) { this.audioIndex = {}; } }
    const save = () => { try { fs.writeFileSync(indexFile, JSON.stringify(this.audioIndex)); } catch (e) { /* the cache only speeds things up */ } };
    const trim = () => {
      const all = fs.readdirSync(dir).filter((f) => f !== 'index.json' && f !== 'lyrics.json' && !f.endsWith('.part'))
        .map((f) => { const st = fs.statSync(path.join(dir, f)); return { f, t: st.mtimeMs, size: st.size }; }).sort((a, b) => b.t - a.t);
      let bytes = 0;
      for (const x of all) { bytes += x.size; if (bytes > 600 * 1024 * 1024) fs.rmSync(path.join(dir, x.f), { force: true }); }
      for (const [link, f] of Object.entries(this.audioIndex)) if (!fs.existsSync(path.join(dir, f))) delete this.audioIndex[link];
      save();
    };
    return { fs, path, dir, save, trim };
  }
  /** A kept song as something the player can play (or null when it is not kept). */
  cachedAudio(link) {
    try {
      const c = this.audioCache();
      const f = this.audioIndex[link];
      if (!f || !c.fs.existsSync(c.path.join(c.dir, f))) return null;
      const now = new Date();
      c.fs.utimesSync(c.path.join(c.dir, f), now, now); // most recently used: kept longest
      const ext = f.split('.').pop().toLowerCase();
      const type = ext === 'mp3' ? 'audio/mpeg' : ext === 'opus' || ext === 'webm' ? 'audio/webm' : ext === 'ogg' ? 'audio/ogg' : 'audio/mp4';
      return URL.createObjectURL(new Blob([c.fs.readFileSync(c.path.join(c.dir, f))], { type }));
    } catch (e) {
      return null;
    }
  }
  /** Fetches a song's sound into the cache (in the background, or before playing a stream the player cannot read). */
  keepAudio(link, id) {
    this.keeping = this.keeping || new Map();
    if (this.keeping.has(link)) return this.keeping.get(link);
    const s = this.settings;
    const pre = s.ffmpeg !== DEFAULT_SETTINGS.ffmpeg ? ['--ffmpeg-location', s.ffmpeg] : [];
    const job = (async () => {
      const c = this.audioCache();
      const name = String(id || Date.now()).replace(/[^\w-]/g, '').slice(0, 80);
      const dl = await runTool(s.ytdlp, [...pre, '-f', 'bestaudio[ext=m4a]/bestaudio/best', '-N', '16', '--no-playlist', '--no-warnings', '--no-part', '-o', c.path.join(c.dir, `${name}.%(ext)s`), '--print', 'after_move:filepath', '--', link]);
      if (!dl.ok || !dl.out.trim()) return false;
      this.audioIndex[link] = c.path.basename(dl.out.trim().split('\n').pop().trim());
      c.trim();
      return true;
    })().catch(() => false).finally(() => this.keeping.delete(link));
    this.keeping.set(link, job);
    return job;
  }
  /** A playable source for one song: a kept copy first; else the stream itself when the player can read it
   *  (YouTube, then kept in the background for next time); else the sound fetched into the cache (SoundCloud). */
  streamSource(item) {
    const kept = this.cachedAudio(item.link);
    if (kept) return Promise.resolve({ title: '', by: '', cover: '', duration: 0, src: kept, local: true });
    this.streamCache = this.streamCache || new Map();
    const known = this.streamCache.get(item.link);
    if (known && Date.now() - known.at < 2 * 3600 * 1000) return known.promise;
    const s = this.settings;
    const promise = (async () => {
      const got = await runTool(s.ytdlp, ['-f', 'bestaudio[protocol^=http][ext=m4a]/bestaudio[protocol^=http]/bestaudio/best', '-j', '--no-playlist', '--no-warnings', '--', item.link]);
      if (!got.ok) { if (got.missing) notify('yt-dlp not found: set its path in the plugin settings'); return null; }
      const j = JSON.parse(got.out.trim().split('\n').pop());
      const meta = { title: j.title || '', by: j.uploader || j.channel || j.artist || '', cover: j.thumbnail || '', duration: j.duration || 0, id: `${String(j.extractor_key || 'x').replace(/\W/g, '')}-${j.id || ''}` };
      if (/^https?$/.test(String(j.protocol || ''))) return { ...meta, src: j.url };
      if (!await this.keepAudio(item.link, meta.id)) return null;
      const src = this.cachedAudio(item.link);
      return src ? { ...meta, src, local: true } : null;
    })().catch(() => null);
    this.streamCache.set(item.link, { at: Date.now(), promise });
    promise.then((r) => { if (!r || r.local) this.streamCache.delete(item.link); });
    return promise;
  }
  /** Fades the link player's volume to `to` over `ms`; resolves when done. */
  linkFade(to, ms = 250) {
    const a = this.linkEl;
    if (!a) return Promise.resolve();
    window.clearInterval(this.fadeTimer);
    const from = a.volume, steps = Math.max(1, Math.round(ms / 25));
    let n = 0;
    return new Promise((done) => {
      this.fadeTimer = window.setInterval(() => {
        n++;
        a.volume = Math.max(0, Math.min(1, from + ((to - from) * n) / steps));
        if (n >= steps) { window.clearInterval(this.fadeTimer); done(); }
      }, 25);
    });
  }
  linkVolume() {
    const v = Number(this.settings.musicVolume);
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
  }
  linkToggle() {
    const a = this.linkEl;
    if (!a) return;
    if (a.paused) { a.volume = 0; a.play().catch(() => {}); this.linkFade(this.linkVolume()); }
    else this.linkFade(0, 200).then(() => a.pause());
  }
  /** The system's media controls (keyboard media keys, the Windows / macOS now-playing panel) drive the link player. */
  linkMediaSession(item) {
    const ms = navigator.mediaSession;
    if (!ms || typeof MediaMetadata === 'undefined' || !item) return;
    if (this.mediaFor !== item.link) {
      this.mediaFor = item.link;
      try { ms.metadata = new MediaMetadata({ title: item.title || '', artist: item.by || '', artwork: item.cover ? [{ src: item.cover, sizes: '512x512' }] : [] }); } catch (e) { /* no media panel here */ }
    }
    if (!this.mediaHandlers) {
      this.mediaHandlers = true;
      const set = (action, run) => { try { ms.setActionHandler(action, run); } catch (e) { /* not offered here */ } };
      set('play', () => this.linkToggle());
      set('pause', () => this.linkToggle());
      set('nexttrack', () => this.linkStep(1));
      set('previoustrack', () => this.linkStep(-1));
      set('seekto', (d) => { if (this.linkEl && Number.isFinite(d.seekTime)) this.linkEl.currentTime = d.seekTime; });
    }
  }

  /** Stops every other player: the Music pane's radio and files, the YouTube and SoundCloud pages. */
  stopOtherPlayers() {
    if (this.chrome && this.chrome.running) this.chrome.evaluate("(() => { const v = document.querySelector('video'); if (v) v.pause(); })()");
    for (const leaf of this.app.workspace.getLeavesOfType(MUSIC_VIEW_TYPE)) {
      const view = leaf.view;
      if (!view) continue;
      if (view.audio && !view.audio.paused) view.audio.pause();
      if (view.shownKey === 'youtube' || view.shownKey === 'soundcloud') { this.settings.musicSource = 'link'; view.render(); }
    }
  }
  /** Plays the song at `index` of the link queue; a playlist link there is first opened into its songs. */
  async linkPlayAt(index) {
    const q = this.linkState();
    if (index < 0 || index >= q.items.length) return;
    const turn = (this.linkTurn = (this.linkTurn || 0) + 1);
    q.index = index;
    let item = q.items[index];
    if (isCollectionLink(item.link)) {
      const busy = new Notice(tx('Opening the playlist…'), 0);
      const info = await this.streamInfo(item.link);
      busy.hide();
      if (turn !== this.linkTurn) return;
      if (!info.items.length) { notify('That playlist could not be opened.'); q.items.splice(index, 1); this.saveLinkQueue(); this.refreshLinkViews(); if (index < q.items.length) this.linkPlayAt(index); return; }
      q.items.splice(index, 1, ...info.items);
      item = q.items[index];
    }
    this.linkLoading = true;
    this.saveLinkQueue();
    this.refreshLinkViews();
    const got = await this.streamSource(item);
    if (turn !== this.linkTurn) return;
    this.linkLoading = false;
    if (!got) {
      notify(`${tx('Could not play')}: ${item.title || item.link}`);
      this.refreshLinkViews();
      if (index + 1 < q.items.length) this.linkPlayAt(index + 1);
      return;
    }
    item.title = item.title || got.title;
    item.by = item.by || got.by;
    item.cover = item.cover || got.cover;
    item.duration = got.duration || item.duration;
    this.stopOtherPlayers();
    const a = this.linkAudio();
    if (!a.paused && a.getAttribute('src')) await this.linkFade(0, 180);
    if (turn !== this.linkTurn) return;
    a.volume = 0;
    a.src = got.src;
    a.play().catch(() => {});
    this.linkFade(this.linkVolume(), 400);
    if (!got.local && got.id) window.setTimeout(() => this.keepAudio(item.link, got.id), 2000);
    this.saveLinkQueue();
    this.refreshLinkViews();
    // the next song is made ready in the background, so it starts without a wait
    const following = q.items[index + 1];
    if (following && !isCollectionLink(following.link)) window.setTimeout(() => this.streamSource(following), 4000);
  }
  linkStep(step, auto) {
    const q = this.linkState();
    const index = q.index + step;
    if (index < 0) return;
    if (index >= q.items.length) { if (auto) this.refreshLinkViews(); return; }
    this.linkPlayAt(index);
  }
  /** A pasted link: played now (it replaces the queue), or added to the end of it. */
  linkOpen(link, mode) {
    // a YouTube song link keeps only the song: its list, index, radio and start-time parts are dropped
    if (/youtube\.com\/watch/i.test(link) && /[?&]v=/.test(link)) {
      try { const u = new URL(link); link = `https://www.youtube.com/watch?v=${u.searchParams.get('v')}`; } catch (e) { /* kept as pasted */ }
    }
    const q = this.linkState();
    const item = { link, title: '', by: '', cover: '', ...(isCollectionLink(link) ? { collection: true } : {}) };
    if (mode === 'queue') {
      q.items.push(item);
      this.saveLinkQueue();
      this.refreshLinkViews();
      if (!this.linkEl || !this.linkEl.getAttribute('src')) this.linkPlayAt(q.items.length - 1);
      return;
    }
    q.items = [item];
    q.index = 0;
    this.linkPlayAt(0);
  }
  /** A whole list (a playlist of yours) into the link queue, playing from `index`. */
  linkPlayList(items, index) {
    const q = this.linkState();
    q.items = items.map((x) => ({ ...x }));
    q.index = index;
    this.linkPlayAt(index);
  }


  /** A finished study task, added to <journal folder>/Study/<date>.md. */
  async logStudy(task, exp) {
    try {
      const folder = normalizePath(`${this.settings.folder}/Study`);
      await this.ensureFolder(folder);
      const date = isoDay(new Date());
      const path = normalizePath(`${folder}/${date}.md`);
      const subject = (HOM_SUBJECTS.find((x) => x.key === task.subject) || {}).name || '';
      const rarity = (HOM_RARITIES.find((r) => r.key === task.rarity) || {}).label || '';
      const line = `- [x] **${task.title}** · ${subject} · ${rarity} · ${task.minutes} phút · +${exp} EXP\n  ${task.text}\n`;
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) await this.app.vault.process(file, (c) => `${c.replace(/\s*$/, '\n')}${line}`);
      else await this.app.vault.create(path, `# Học ${date}\n\n${line}`);
    } catch (e) {
      // the EXP is kept even when the note could not be written
    }
  }


  /** Your playlists, Favorites first (it is always there): [{ id, name, items: [{ link, title, by, cover }] }]. */
  playlists() {
    const lists = Array.isArray(this.settings.playlists) ? this.settings.playlists.filter((p) => p && p.id && Array.isArray(p.items)) : [];
    if (!lists.some((p) => p.id === FAV_ID)) lists.unshift({ id: FAV_ID, name: 'Favorites', items: [] });
    this.settings.playlists = lists;
    return lists;
  }
  async savePlaylists() {
    await this.saveData(this.settings);
    for (const listener of this.nowListeners || []) listener(); // the heart buttons follow
    for (const m of this.playlistModals || []) m.render();
  }
  async createPlaylist(name) {
    const clean = String(name || '').trim().slice(0, 60);
    if (!clean) return null;
    const list = { id: `pl${Date.now().toString(36)}`, name: clean, items: [] };
    this.settings.playlists = [...this.playlists(), list];
    await this.savePlaylists();
    return list;
  }
  /** Title, artist and cover for a YouTube or SoundCloud link, from each site's public "oEmbed" address. */
  async linkInfo(link) {
    const source = musicSourceOf(link);
    const info = { link, title: '', by: '', cover: '' };
    if (!source) return info;
    const target = source.key === 'youtube' ? youtubeTarget(link) : null;
    if (target && target.video) info.cover = `https://i.ytimg.com/vi/${target.video}/hqdefault.jpg`;
    const url = source.key === 'youtube'
      ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(link)}`
      : `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(link)}`;
    try {
      const res = typeof requestUrl === 'function' ? await requestUrl({ url, throw: false }) : await fetch(url);
      const data = typeof requestUrl === 'function' ? (res.status === 200 ? res.json : null) : (res.ok ? await res.json() : null);
      if (data) {
        info.title = String(data.title || '').slice(0, 160);
        info.by = String(data.author_name || '').slice(0, 80);
        if (!info.cover && data.thumbnail_url) info.cover = String(data.thumbnail_url);
        // SoundCloud names a track "Title by Artist": the artist is kept apart
        if (info.by && info.title.endsWith(` by ${info.by}`)) info.title = info.title.slice(0, -(` by ${info.by}`).length);
      }
    } catch (e) {
      // the link is kept with its address as its name
    }
    if (!info.title) info.title = String(link).replace(/^https?:\/\/(www\.|m\.)?/, '').slice(0, 80);
    if (isCollectionLink(link)) info.collection = true;
    return info;
  }
  async addToPlaylist(id, item) {
    const list = this.playlists().find((p) => p.id === id);
    if (!list || !item || !item.link) return false;
    if (list.items.some((x) => x.link === item.link)) { notify('Already in this playlist.'); return false; }
    list.items.push({ link: item.link, title: item.title || '', by: item.by || '', cover: item.cover || '', ...(item.collection ? { collection: true } : {}) });
    await this.savePlaylists();
    return true;
  }
  async addLinkToPlaylist(id, link) {
    const clean = String(link || '').trim();
    if (!musicSourceOf(clean)) { notify('Paste a YouTube or SoundCloud link.'); return false; }
    return this.addToPlaylist(id, await this.linkInfo(clean));
  }
  /** What is playing now, as a playlist item (null for the radio and your files: they have no link). */
  nowItem() {
    const now = this.nowPlaying;
    return now && now.link ? { link: now.link, title: now.title || '', by: now.by || '', cover: now.cover || '' } : null;
  }
  isFavorite(link) {
    return !!link && this.playlists().find((p) => p.id === FAV_ID).items.some((x) => x.link === link);
  }
  async toggleFavorite() {
    const item = this.nowItem();
    if (!item) { notify('Play a song from YouTube or SoundCloud to keep it.'); return; }
    const fav = this.playlists().find((p) => p.id === FAV_ID);
    if (fav.items.some((x) => x.link === item.link)) fav.items = fav.items.filter((x) => x.link !== item.link);
    else fav.items.push(item);
    await this.savePlaylists();
  }
  /** Plays a playlist item in the Music pane; `run` ({ id, index }) lets the playlist go on to the next item. */
  async playMusicItem(item, run) {
    if (this.linkReady() && run) {
      const list = this.playlists().find((p) => p.id === run.id);
      if (list && list.items.length) {
        this.playlistRun = null;
        this.settings.musicSource = 'link';
        await this.openView(MUSIC_VIEW_TYPE);
        this.linkPlayList(list.items, run.index);
        for (const m of this.playlistModals || []) m.render();
        return;
      }
    }
    const source = musicSourceOf(item && item.link);
    if (!source) { notify('That link is not from YouTube or SoundCloud.'); return; }
    this.playlistRun = run || null;
    this.playlistRunAt = Date.now();
    for (const m of this.playlistModals || []) m.render();
    // leaving YouTube for SoundCloud: the browser that plays YouTube in the background is paused first
    if (source.key !== 'youtube' && this.chrome && this.chrome.running) this.chrome.evaluate("(() => { const v = document.querySelector('video'); if (v) v.pause(); })()");
    this.settings.musicSource = source.key;
    await this.openView(MUSIC_VIEW_TYPE);
    const leaf = this.app.workspace.getLeavesOfType(MUSIC_VIEW_TYPE)[0];
    const view = leaf && leaf.view;
    if (!view || !view.openLink) return;
    view.autoplayOnce = true;
    await view.openLink(source, item.link);
  }
  /** The playlist being played moves on by `step`. A whole collection (a playlist link) is left only when `force`
   *  is set: inside it, its own player goes on. Returns whether it moved. */
  advancePlaylist(step = 1, force = false) {
    const run = this.playlistRun;
    if (!run) return false;
    const list = this.playlists().find((p) => p.id === run.id);
    const here = list && list.items[run.index];
    if (!list || (!force && here && isCollectionLink(here.link))) return false;
    const index = run.index + step;
    if (index < 0 || index >= list.items.length) { if (step > 0) this.playlistRun = null; return false; }
    this.playMusicItem(list.items[index], { id: run.id, index });
    return true;
  }
  /** A heart (keep the song in Favorites) and a "+" (add it to one of your playlists) in `parent`. */
  mountSaveButtons(parent, view, cls = 'tvj-music-key') {
    const heart = parent.createEl('button', { cls: `${cls} tvj-music-heart`, attr: { 'aria-label': 'Keep in Favorites' } });
    setIcon(heart, 'heart');
    const plus = parent.createEl('button', { cls: `${cls} tvj-music-plus`, attr: { 'aria-label': 'Add to a playlist' } });
    setIcon(plus, 'list-plus');
    heart.addEventListener('click', (e) => { e.stopPropagation(); this.toggleFavorite(); });
    plus.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = this.nowItem();
      if (!item) { new PlaylistsModal(this.app, this).open(); return; }
      const menu = new Menu();
      for (const p of this.playlists().filter((x) => x.id !== FAV_ID)) {
        menu.addItem((m) => m.setTitle(`${tx('Add to')} ${p.name}`).setIcon('list-music').onClick(() => this.addToPlaylist(p.id, item)));
      }
      menu.addItem((m) => m.setTitle(tx('Open your playlists')).setIcon('list-music').onClick(() => new PlaylistsModal(this.app, this).open()));
      menu.addItem((m) => m.setTitle(tx('New playlist…')).setIcon('plus').onClick(() => {
        new TextPromptModal(this.app, 'Playlist name', '', async (name) => { const p = await this.createPlaylist(name); if (p) this.addToPlaylist(p.id, item); }).open();
      }));
      menu.showAtMouseEvent(e);
    });
    const paint = () => {
      if (!heart.isConnected) return;
      const item = this.nowItem();
      const on = !!item && this.isFavorite(item.link);
      heart.classList.toggle('is-on', on);
      heart.setAttribute('aria-label', tx(on ? 'Remove from Favorites' : 'Keep in Favorites'));
      heart.disabled = !item;
      };
    this.nowListeners = this.nowListeners || new Set();
    this.nowListeners.add(paint);
    view.register(() => this.nowListeners.delete(paint));
    paint();
  }


  /** What the Music pane is playing, for other screens to show (the lobby's music card):
   *  { title, by, cover, playing, time, duration } or null. `controls`: { toggle, previous, next, seek(share) },
   *  any of which may be missing (a radio station has no "next"). */
  setNowPlaying(now, controls) {
    const before = JSON.stringify(this.nowPlaying || null);
    this.nowPlaying = now;
    if (now && (!before || before === 'null' || JSON.parse(before).time !== now.time)) this.nowStamp = Date.now();
    this.musicControls = controls || {};
    if (JSON.stringify(now || null) === before) return;
    for (const listener of this.nowListeners || []) listener();
  }

  /** The lobby's music card: a record that turns while music plays (the song's cover is its label), and beside
   *  it the title, a time line and Previous / Play / Next for what the Music pane is playing. With nothing
   *  playing, the record opens the Music pane. `view` owns it. */
  certificateFolder() {
    return normalizePath(`${this.settings.folder}/Certificates`);
  }
  /** Every certificate (pictures and PDFs in <journal folder>/Certificates), newest first. */
  certificateFiles() {
    const prefix = `${this.certificateFolder()}/`;
    return this.app.vault.getFiles().filter((f) => f.path.startsWith(prefix) && CERT_EXT.test(f.extension)).sort((a, b) => b.name.localeCompare(a.name));
  }
  /** The certificates the lobby shows, in their order (files that were deleted drop out). */
  shownCertificates() {
    return (Array.isArray(this.settings.certificates) ? this.settings.certificates : [])
      .map((path) => this.app.vault.getAbstractFileByPath(path)).filter((f) => f instanceof TFile);
  }
  async setCertificateShown(path, on) {
    const list = (Array.isArray(this.settings.certificates) ? this.settings.certificates : []).filter((p) => p !== path);
    this.settings.certificates = on ? [...list, path] : list;
    await this.saveData(this.settings);
    this.refreshViews();
  }
  /** Copies picked pictures or PDFs into the Certificates folder as "<date> <title>.<ext>" (the file name is the
   *  title); `show` also puts them in the lobby. Returns how many were added. */
  async addCertificates(fileList, show) {
    const folder = this.certificateFolder();
    await this.ensureFolder(folder);
    const added = [];
    for (const picked of Array.from(fileList || [])) {
      const ext = (picked.name.split('.').pop() || '').toLowerCase();
      if (!CERT_EXT.test(ext)) { notify(`Not a picture or PDF: ${picked.name}`); continue; }
      if (picked.size > CERT_MAX_BYTES) { notify(`Too large (over 15 MB): ${picked.name}`); continue; }
      const title = safeName(picked.name.replace(/\.[^.]+$/, '')) || 'Certificate';
      let path = normalizePath(`${folder}/${isoDay(new Date())} ${title}.${ext}`);
      for (let n = 2; this.app.vault.getAbstractFileByPath(path); n++) path = normalizePath(`${folder}/${isoDay(new Date())} ${title} ${n}.${ext}`);
      await this.app.vault.createBinary(path, await picked.arrayBuffer());
      added.push(path);
    }
    if (!added.length) return 0;
    if (show) {
      this.settings.certificates = [...(Array.isArray(this.settings.certificates) ? this.settings.certificates : []), ...added];
      await this.saveData(this.settings);
    }
    notify(added.length === 1 ? 'Certificate added.' : `${added.length} certificates added.`);
    this.refreshViews();
    return added.length;
  }
  /** Puts a certificate's picture into `frame`: the file itself, or a PDF's first page (drawn once, then kept). */
  certificateThumb(frame, file) {
    if (file.extension.toLowerCase() !== 'pdf') {
      frame.createEl('img', { attr: { src: this.app.vault.getResourcePath(file), alt: certTitle(file), loading: 'lazy' } });
      return;
    }
    const img = frame.createEl('img', { attr: { alt: certTitle(file) } });
    this.pdfThumbs = this.pdfThumbs || new Map();
    const key = `${file.path}|${file.stat ? file.stat.mtime : ''}`;
    const show = (url) => { if (url) img.setAttribute('src', url); else { img.remove(); setIcon(frame.createSpan({ cls: 'tvj-mcert-pdf' }), 'file-text'); } };
    if (this.pdfThumbs.has(key)) { this.pdfThumbs.get(key).then(show); return; }
    const made = (async () => {
      try {
        if (typeof loadPdfJs !== 'function') return '';
        const pdfjs = await loadPdfJs();
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await this.app.vault.readBinary(file)) }).promise;
        const page = await doc.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: 900 / Math.max(base.width, base.height) });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        doc.destroy();
        return canvas.toDataURL('image/jpeg', 0.88);
      } catch (e) {
        return '';
      }
    })();
    this.pdfThumbs.set(key, made);
    made.then(show);
  }
  /** The lobby's certificates: the ones you picked, under the flex and gym cards, and Choose… to pick them. */
  renderCertificates(parent) {
    const shown = this.shownCertificates();
    const box = parent.createDiv({ cls: 'tvj-member-certs' });
    const head = box.createDiv({ cls: 'tvj-mcerts-head' });
    head.createDiv({ cls: 'tvj-card-title', text: 'Certificates' });
    const choose = () => new CertificatesModal(this.app, this).open();
    if (!shown.length) {
      const empty = box.createEl('button', { cls: 'tvj-mcerts-empty' });
      setIcon(empty.createSpan({ cls: 'tvj-mcerts-empty-icon' }), 'award');
      empty.createDiv({ cls: 'tvj-mcerts-empty-title', text: 'Show your certificates' });
      empty.createDiv({ cls: 'tvj-muted', text: 'Funded accounts, payouts, passed evaluations: pick the ones to show here.' });
      empty.addEventListener('click', choose);
      return;
    }
    head.createEl('button', { cls: 'tvj-link', text: 'Choose…' }).addEventListener('click', choose);
    const grid = box.createDiv({ cls: 'tvj-mcerts' });
    for (const file of shown) {
      const tile = grid.createEl('button', { cls: 'tvj-mcert', attr: { 'aria-label': `Open ${certTitle(file)}` } });
      this.certificateThumb(tile.createDiv({ cls: 'tvj-mcert-frame' }), file);
      tile.createDiv({ cls: 'tvj-mcert-name', text: certTitle(file) });
      tile.addEventListener('click', () => {
        if (file.extension.toLowerCase() === 'pdf') this.app.workspace.getLeaf('tab').openFile(file);
        else new ShotModal(this.app, file, certTitle(file)).open();
      });
    }
  }

  /** Forex Factory's calendar for this week ({ fetchedOn, fetchedAt, events }), kept in the settings so it shows
   *  offline too. It is fetched again at most once a day: the first time True Journal opens on a new day (and only
   *  then — the feed asks not to be fetched often). Resolves to what is kept when the fetch fails. */
  async calendar() {
    const kept = this.settings.calendarCache && Array.isArray(this.settings.calendarCache.events) ? this.settings.calendarCache : null;
    const today = isoDay(new Date());
    if (kept && kept.fetchedOn === today) return kept;
    if (!this.calendarJob) {
      this.calendarJob = (async () => {
        try {
          const res = await requestUrl({ url: FF_CALENDAR_URL, throw: false });
          const rows = res && res.status === 200 ? res.json : null;
          if (!Array.isArray(rows)) return kept;
          const next = { fetchedOn: today, fetchedAt: Date.now(), events: readCalendar(rows) };
          this.settings.calendarCache = next;
          await this.saveData(this.settings);
          this.refreshViews();
          return next;
        } catch (e) {
          return kept; // offline: the week kept from before, tried again next time
        } finally {
          this.calendarJob = null;
        }
      })();
    }
    return this.calendarJob;
  }

  /** The lobby's calendar card: the week's events from today on, by day, in this computer's time, with the impact
   *  and currency to show (kept in the settings). Today's past events are dimmed. */
  renderCalendarCard(parent) {
    const s = this.settings, vi = LANG === 'vi';
    const box = parent.createDiv({ cls: 'tvj-card tvj-calendar' });
    const head = box.createDiv({ cls: 'tvj-card-head' });
    head.createDiv({ cls: 'tvj-card-title', text: 'Economic calendar' });
    const tools = head.createDiv({ cls: 'tvj-options tvj-calendar-tools' });
    const impacts = Array.isArray(s.calendarImpacts) ? s.calendarImpacts : ['High', 'Medium'];
    const currency = typeof s.calendarCurrency === 'string' ? s.calendarCurrency : 'USD';
    const save = async () => { await this.saveData(s); this.refreshViews(); };
    for (const level of ['High', 'Medium', 'Low']) {
      const on = impacts.includes(level);
      tools.createEl('button', { cls: `tvj-chip tvj-impact-chip is-${level.toLowerCase()} ${on ? 'is-on' : ''}`, text: level, attr: { 'aria-pressed': String(on) } })
        .addEventListener('click', () => { s.calendarImpacts = on ? impacts.filter((x) => x !== level) : [...impacts, level]; save(); });
    }
    const pick = tools.createEl('select', { cls: 'dropdown', attr: { 'aria-label': 'Currency' } });
    for (const [value, text] of [['', 'All'], ...FF_CURRENCIES.map((x) => [x, x])]) pick.createEl('option', { value, text });
    pick.value = currency;
    pick.addEventListener('change', () => { s.calendarCurrency = pick.value; save(); });
    const body = box.createDiv({ cls: 'tvj-calendar-body' });
    const draw = (cal) => {
      body.empty();
      if (!cal) { body.createEl('p', { cls: 'tvj-muted', text: 'Getting this week\'s calendar from Forex Factory…' }); return; }
      const now = new Date();
      const days = calendarDays(cal.events, { currency, impacts, now });
      if (!days.length) body.createEl('p', { cls: 'tvj-muted', text: impacts.length ? 'Nothing left this week for these filters.' : 'Pick an impact to show.' });
      const today = isoDay(now), tomorrow = isoDay(new Date(now.getTime() + 86400000));
      const clock = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
      for (const { day, events } of days) {
        const d = new Date(`${day}T12:00:00`);
        const label = day === today ? tx('Today') : day === tomorrow ? tx('Tomorrow')
          : d.toLocaleDateString(vi ? 'vi-VN' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short' });
        body.createDiv({ cls: 'tvj-calendar-day', text: label });
        for (const e of events) {
          const row = body.createDiv({ cls: `tvj-calendar-row${e.at < now.getTime() ? ' is-past' : ''}` });
          row.createSpan({ cls: 'tvj-calendar-time', text: clock(e.at) });
          row.createSpan({ cls: `tvj-impact is-${e.impact.toLowerCase()}`, attr: { 'aria-label': `${tx(e.impact)} impact`, title: `${tx(e.impact)} impact` } });
          row.createSpan({ cls: 'tvj-calendar-ccy', text: e.country });
          row.createSpan({ cls: 'tvj-calendar-title', text: e.title });
          const figures = [e.forecast && `${vi ? 'Dự báo' : 'F'} ${e.forecast}`, e.previous && `${vi ? 'Trước' : 'P'} ${e.previous}`].filter(Boolean).join(' · ');
          if (figures) row.createSpan({ cls: 'tvj-muted tvj-calendar-figures', text: figures, attr: { title: vi ? 'Dự báo · kỳ trước' : 'Forecast · previous' } });
        }
      }
      const when = new Date(cal.fetchedAt);
      box.createDiv({ cls: 'tvj-muted tvj-calendar-note', text: vi ? `Từ Forex Factory · cập nhật ${when.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric' })} · giờ trên máy này`
        : `From Forex Factory · updated ${when.toLocaleString('en-US', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })} · times on this computer's clock` });
    };
    const kept = s.calendarCache && Array.isArray(s.calendarCache.events) ? s.calendarCache : null;
    draw(kept);
    if (!kept || kept.fetchedOn !== isoDay(new Date())) this.calendar().then((cal) => { if (box.isConnected && cal && cal !== kept) draw(cal); });
  }

  renderMusicCard(parent, view) {
    const card = parent.createDiv({ cls: 'tvj-card tvj-music-card' });
    const hide = card.createEl('button', { cls: 'tvj-music-hide', attr: { 'aria-label': 'Hide the music card' } });
    setIcon(hide, 'x');
    hide.addEventListener('click', async (e) => {
      e.stopPropagation();
      this.settings.lobbyMusicHidden = true;
      await this.saveData(this.settings);
      notify('Music card hidden. Settings → "Music card in the lobby" brings it back.');
      this.refreshViews();
    });
    const disc = card.createEl('button', { cls: 'tvj-disc', attr: { 'aria-label': 'Play or pause the music' } });
    const plate = disc.createSpan({ cls: 'tvj-disc-plate' });
    const art = plate.createEl('img', { cls: 'tvj-disc-art', attr: { alt: '' } });
    plate.createSpan({ cls: 'tvj-disc-hole' });
    const side = card.createDiv({ cls: 'tvj-music-card-side' });
    const label = side.createDiv({ cls: 'tvj-eyebrow', text: 'Music' });
    const title = side.createDiv({ cls: 'tvj-disc-title' });
    const by = side.createDiv({ cls: 'tvj-muted' });
    const line = side.createDiv({ cls: 'tvj-player-line', attr: { role: 'slider', 'aria-label': 'Position in the song', tabindex: '0' } });
    const fill = line.createDiv({ cls: 'tvj-player-fill' });
    const times = side.createDiv({ cls: 'tvj-player-times' });
    const at = times.createSpan({ text: '0:00' });
    const total = times.createSpan({ text: '0:00' });
    this.mountLyrics(side, view);
    // the keys are bare glyphs, as on a music player: no boxes around them
    const glyph = (el, name) => {
      el.empty();
      const svg = el.createSvg('svg', { attr: { viewBox: '0 0 24 24', 'aria-hidden': 'true' } });
      for (const [d, line] of MUSIC_GLYPHS[name]) svg.createSvg('path', { attr: line ? { d, fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round' } : { d, fill: 'currentColor' } });
      el.dataset.glyph = name;
    };
    const keys = side.createDiv({ cls: 'tvj-music-card-keys' });
    const previous = keys.createEl('button', { cls: 'tvj-music-key', attr: { 'aria-label': 'Previous' } });
    const toggle = keys.createEl('button', { cls: 'tvj-music-key is-main', attr: { 'aria-label': 'Play or pause the music' } });
    const next = keys.createEl('button', { cls: 'tvj-music-key', attr: { 'aria-label': 'Next' } });
    glyph(previous, 'previous');
    glyph(toggle, 'play');
    glyph(next, 'next');
    this.mountSaveButtons(keys, view);
    // loudness: a quiet speaker, a line to drag, a loud speaker
    const loud = side.createDiv({ cls: 'tvj-music-volume' });
    glyph(loud.createSpan({ cls: 'tvj-music-volume-icon' }), 'quiet');
    const volumeLine = loud.createDiv({ cls: 'tvj-player-line', attr: { role: 'slider', 'aria-label': txIn('music', 'Volume'), tabindex: '0', 'aria-valuemin': '0', 'aria-valuemax': '100' } });
    const volumeFill = volumeLine.createDiv({ cls: 'tvj-player-fill' });
    glyph(loud.createSpan({ cls: 'tvj-music-volume-icon' }), 'loud');
    const volumeNow = () => { const v = Number(this.settings.musicVolume); return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1; };
    const showVolume = (share) => { volumeFill.style.width = `${share * 100}%`; volumeLine.setAttribute('aria-valuenow', String(Math.round(share * 100))); };
    const setVolume = (share, keep) => {
      this.settings.musicVolume = share;
      showVolume(share);
      const c = this.musicControls || {};
      if (c.volume) c.volume(share);
      if (keep) this.saveData(this.settings);
    };
    showVolume(volumeNow());
    let volumeHeld = false;
    const volumeAt = (e) => { const box = volumeLine.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)); };
    volumeLine.addEventListener('pointerdown', (e) => {
      volumeHeld = true;
      volumeLine.addClass('is-held');
      try { volumeLine.setPointerCapture(e.pointerId); } catch (err) { /* the drag still works while over the line */ }
      setVolume(volumeAt(e), false);
      e.preventDefault();
    });
    volumeLine.addEventListener('pointermove', (e) => { if (volumeHeld) setVolume(volumeAt(e), false); });
    for (const event of ['pointerup', 'pointercancel']) volumeLine.addEventListener(event, () => { if (!volumeHeld) return; volumeHeld = false; volumeLine.removeClass('is-held'); this.saveData(this.settings); });
    volumeLine.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      setVolume(Math.max(0, Math.min(1, volumeNow() + (e.key === 'ArrowRight' ? 0.05 : -0.05))), true);
      e.preventDefault();
    });
    const clock = (seconds) => { const t = Math.max(0, Math.floor(seconds || 0)); const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60); return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(t % 60).padStart(2, '0')}`; };
    let held = false, settleUntil = 0;
    const paint = () => {
      if (!card.isConnected) return;
      const now = this.nowPlaying;
      const controls = this.musicControls || {};
      disc.classList.toggle('is-playing', !!(now && now.playing));
      disc.classList.toggle('is-empty', !now);
      if (now && now.cover) { if (art.getAttribute('src') !== now.cover) art.setAttribute('src', now.cover); } else art.removeAttribute('src');
      label.setText(tx(now ? (now.playing ? 'Now playing' : 'Paused') : 'Music'));
      const name = now ? now.title : tx('Nothing is playing');
      if (title.textContent !== name) title.setText(name);
      const who = now ? now.by || '' : tx('Open Music to pick a song');
      if (by.textContent !== who) by.setText(who);
      const known = !!(now && now.duration > 0 && Number.isFinite(now.duration));
      // while the line is being dragged (and for a moment after, until the player has jumped) the hand leads
      if (!held && Date.now() > settleUntil) {
        fill.style.width = `${known ? Math.min(100, (now.time / now.duration) * 100) : 0}%`;
        at.setText(clock(now ? now.time : 0));
      }
      total.setText(known ? clock(now.duration) : '–:––');
      const want = now && now.playing ? 'pause' : 'play';
      if (toggle.dataset.glyph !== want) glyph(toggle, want);
      if (!volumeHeld) showVolume(volumeNow());
      previous.disabled = !controls.previous;
      next.disabled = !controls.next;
      toggle.disabled = false;
    };
    const play = () => {
      const controls = this.musicControls || {};
      if (this.nowPlaying && controls.toggle) controls.toggle();
      else this.openView(MUSIC_VIEW_TYPE);
    };
    disc.addEventListener('click', play);
    toggle.addEventListener('click', play);
    previous.addEventListener('click', () => { const c = this.musicControls || {}; if (c.previous) c.previous(); });
    next.addEventListener('click', () => { const c = this.musicControls || {}; if (c.next) c.next(); });
    // The time line: press anywhere or drag along it; the song jumps when the pointer is let go.
    const canSeek = () => { const c = this.musicControls || {}; const now = this.nowPlaying; return !!(c.seek && now && now.duration > 0 && Number.isFinite(now.duration)); };
    const shareAt = (e) => { const box = line.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)); };
    const show = (share) => { fill.style.width = `${share * 100}%`; at.setText(clock(share * this.nowPlaying.duration)); };
    const jump = (share) => { settleUntil = Date.now() + 1500; show(share); this.musicControls.seek(share); };
    line.addEventListener('pointerdown', (e) => {
      if (!canSeek()) return;
      held = true;
      line.addClass('is-held');
      try { line.setPointerCapture(e.pointerId); } catch (err) { /* the drag still works while over the line */ }
      show(shareAt(e));
      e.preventDefault();
    });
    line.addEventListener('pointermove', (e) => { if (held && canSeek()) show(shareAt(e)); });
    const release = (e, cancelled) => {
      if (!held) return;
      held = false;
      line.removeClass('is-held');
      if (!cancelled && canSeek()) jump(shareAt(e));
      else paint();
    };
    line.addEventListener('pointerup', (e) => release(e, false));
    line.addEventListener('pointercancel', (e) => release(e, true));
    line.addEventListener('keydown', (e) => {
      if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || !canSeek()) return;
      const now = this.nowPlaying;
      jump(Math.max(0, Math.min(1, (now.time + (e.key === 'ArrowRight' ? 5 : -5)) / now.duration)));
      e.preventDefault();
    });
    this.nowListeners = this.nowListeners || new Set();
    this.nowListeners.add(paint);
    view.register(() => this.nowListeners.delete(paint));
    paint();
    return card;
  }

  /** The Chrome the YouTube player may play in (see ChromeLink): one for the plugin, closed when it unloads. */
  chromeLink() {
    if (!this.chrome) {
      this.chrome = new ChromeLink();
      this.register(() => this.chrome.quit());
    }
    return this.chrome;
  }

  /** Re-draws a screen when journal data changed: a trade, a gym session, or a file in the journal folder.
   *  Edits to the other notes of the vault are ignored, so writing elsewhere does not redraw the journal. */
  watchData(view, render) {
    let timer = null;
    const refresh = (file, _data, cache) => {
      if (!this.concerns(file, cache)) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(render, 300);
    };
    view.registerEvent(this.app.metadataCache.on('changed', refresh));
    view.registerEvent(this.app.vault.on('delete', refresh));
    view.registerEvent(this.app.vault.on('rename', refresh));
  }

  /** Whether a changed file is part of the journal. */
  concerns(file, cache) {
    if (!file || !file.path) return true; // the host did not say which file changed
    if (file.path.startsWith(`${this.settings.folder}/`) || this.journalPaths.has(file.path)) return true;
    if (this.source !== 'own' && file.path.startsWith(`${this.source}/`)) return true;
    const fm = cache && cache.frontmatter;
    return !!(fm && (tradeFromFrontmatter(fm) || gymFromFrontmatter(fm)));
  }

  /** In Obsidian the card emblems and rank pictures come from the plugin's own folder (art/, listed in
   *  art/art.json). On a site the site hands them over instead (see setCardArt, setRankArt). */
  async loadBundledArt() {
    const dir = this.manifest && this.manifest.dir;
    const adapter = this.app.vault.adapter;
    if (!dir || !adapter || !adapter.readBinary) return;
    let spec;
    try {
      spec = JSON.parse(await adapter.read(`${dir}/art/art.json`));
    } catch (e) {
      return;
    }
    const load = async (path, type) => {
      try {
        const url = URL.createObjectURL(new Blob([await adapter.readBinary(path)], { type }));
        return await new Promise((resolve) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => resolve(null);
          image.src = url;
        });
      } catch (e) {
        return null;
      }
    };
    // the italic accent face (Instrument Serif Italic, OFL) for accent words; it falls back to a system serif italic
    try {
      const face = new FontFace('TJ Accent', await adapter.readBinary(`${dir}/fonts/InstrumentSerif-Italic.ttf`), { style: 'italic', weight: '400' });
      document.fonts.add(await face.load());
    } catch (e) { /* the fallback serif italic is used */ }
    const cards = {};
    const ranks = {};
    const certs = {};
    const firms = {};
    await Promise.all([
      // each firm's logo, by its name on the list (two names can share one picture)
      ...Object.entries(spec.firms || {}).map(async ([name, key]) => {
        const image = await load(`${dir}/art/firm/${key}.png`, 'image/png');
        if (image) firms[name] = image.src;
      }),
      ...(spec.certs || []).map(async (key) => {
        const image = await load(`${dir}/art/cert/${key}.jpg`, 'image/jpeg');
        if (image) certs[key] = image;
      }),
      ...Object.entries(spec.cards || {}).map(async ([key, card]) => {
        const image = await load(`${dir}/art/card/${key}.jpg`, 'image/jpeg');
        if (image) cards[key] = { ...card, image };
      }),
      ...(spec.ranks || []).map(async (tier) => {
        const image = await load(`${dir}/art/rank/${tier}.png`, 'image/png');
        if (image) ranks[tier] = { src: image.src, image };
      }),
    ]);
    // Not ranked yet (too few trades): the set has no picture for that, so the lowest emblem is shown in grey.
    // Without it an unranked profile fell back to the old drawn crest.
    if (!ranks.unranked && ranks.iron) {
      try {
        const from = ranks.iron.image;
        const grey = document.createElement('canvas');
        grey.width = from.width;
        grey.height = from.height;
        const g = grey.getContext('2d');
        g.filter = 'grayscale(1) brightness(0.8)';
        g.globalAlpha = 0.7;
        g.drawImage(from, 0, 0);
        const blob = await new Promise((resolve) => grey.toBlob(resolve, 'image/png'));
        const url = URL.createObjectURL(blob);
        const image = await new Promise((resolve) => {
          const picture = new Image();
          picture.onload = () => resolve(picture);
          picture.onerror = () => resolve(null);
          picture.src = url;
        });
        if (image) ranks.unranked = { src: url, image };
      } catch (e) {
        // the drawn crest stays for an unranked profile
      }
    }
    CARD_ART = cards;
    ART_CACHE.clear();
    RANK_ART = ranks;
    CERT_ART = certs;
    FIRM_LOGOS = firms;
    await this.loadCertPicture();
    this.refreshViews();
  }

  /** Your rank over all your own trades, with penalties: what card designs and the trophy room go by. */
  ownRank() {
    const s = this.settings;
    const trades = this.getTrades('own').map((x) => x.trade);
    const gym = this.getGymSessions().map((x) => x.session);
    const streaks = computeStreaks(trades, gym, Math.max(1, Number(s.gymTarget) || 3), Math.max(1, Number(s.journalTarget) || 3));
    const demo = demoAccountsOf(s.accountInfo); // Demo accounts do not count towards your rank
    return computeRank(trades.filter((t) => !demo.has(accountName(t))), streaks, { accountInfo: s.accountInfo, accounts: this.allAccounts(trades).filter((a) => a !== NO_ACCOUNT && !demo.has(a)), maxTradesPerDay: s.maxTradesPerDay });
  }

  /** Your profile picture: <journal folder>/Profile/avatar.<png|jpg|webp|gif>, if there is one. */
  avatarFile() {
    for (const ext of ['png', 'jpg', 'jpeg', 'webp', 'gif']) {
      const file = this.app.vault.getAbstractFileByPath(normalizePath(`${this.settings.folder}/Profile/avatar.${ext}`));
      if (file instanceof TFile) return file;
    }
    return null;
  }

  /** A background picture you uploaded for one kind of card: <journal folder>/Profile/<name>.<png|jpg|webp>.
   *  `name` is 'profile-card' or 'gym-card' (the flex card's own picture keeps its older helpers below). */
  pictureFile(name) {
    for (const ext of ['png', 'jpg', 'jpeg', 'webp', ...(MOVING_PICTURES.includes(name) ? CARD_VIDEO_EXTS : [])]) {
      const file = this.app.vault.getAbstractFileByPath(normalizePath(`${this.settings.folder}/Profile/${name}.${ext}`));
      if (file instanceof TFile) return file;
    }
    return null;
  }

  /** A video file from the vault as a <video> stopped on its first frame (silent, looping); null if unreadable. */
  async loadVideo(file) {
    try {
      const url = URL.createObjectURL(new Blob([await this.app.vault.readBinary(file)], { type: file.extension === 'webm' ? 'video/webm' : 'video/mp4' }));
      return await new Promise((resolve) => {
        const video = document.createElement('video');
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.onloadeddata = () => resolve(video);
        video.onerror = () => resolve(null);
        video.src = url;
      });
    } catch (e) {
      return null;
    }
  }

  /** That picture, loaded and ready to draw; null when there is none or it cannot be read. A video (profile and
   *  gym cards) comes back as a <video> on its first frame. */
  async loadPicture(name) {
    const file = this.pictureFile(name);
    if (!file) return null;
    if (CARD_VIDEO_EXTS.includes(file.extension)) return this.loadVideo(file);
    try {
      const type = `image/${file.extension === 'jpg' ? 'jpeg' : file.extension}`;
      const url = URL.createObjectURL(new Blob([await this.app.vault.readBinary(file)], { type }));
      return await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
      });
    } catch (e) {
      return null;
    }
  }

  /** Replaces that picture with a picked image file (pass null to remove it). Returns whether it was done. */
  async savePicture(name, picked) {
    // a new background replaces a YouTube one (setPictureFromYouTube names it again afterwards)
    if (this.settings.pictureYouTube && this.settings.pictureYouTube[name]) {
      this.settings.pictureYouTube = { ...this.settings.pictureYouTube, [name]: '' };
      await this.saveData(this.settings);
    }
    const clear = async () => { for (let old = this.pictureFile(name); old; old = this.pictureFile(name)) await this.app.vault.trash(old, true); };
    if (picked) {
      const ext = (picked.name.split('.').pop() || '').toLowerCase();
      const video = MOVING_PICTURES.includes(name) && CARD_VIDEO_EXTS.includes(ext);
      if (!video && !/^(png|jpe?g|webp)$/.test(ext)) { notify(MOVING_PICTURES.includes(name) ? 'Pick a PNG, JPG or WebP picture, or an MP4, WebM or MOV video.' : 'Pick a PNG, JPG or WebP picture.'); return false; }
      if (!video && picked.size > 8 * 1024 * 1024) { notify('That picture is over 8 MB — pick a smaller one.'); return false; }
      if (video && picked.size > 80 * 1024 * 1024) { notify('That video is over 80 MB — pick a shorter one.'); return false; }
      const data = await picked.arrayBuffer();
      await clear();
      const folder = normalizePath(`${this.settings.folder}/Profile`);
      await this.ensureFolder(folder);
      await this.app.vault.createBinary(normalizePath(`${folder}/${name}.${ext}`), data);
    } else {
      await clear();
    }
    return true;
  }

  /** Upload / change / remove buttons for one of those pictures, added to `parent`. `after` runs once it changed. */
  pictureButtons(parent, name, after) {
    const has = !!this.pictureFile(name);
    // the lobby shows the profile card's moving background too: it is drawn again as soon as that changes (the gym
    // card dialog redraws the lobby itself, once its design is saved)
    if (name === 'profile-card') { const then = after; after = (...args) => { this.refreshViews(); return then(...args); }; }
    const accept = `image/png,image/jpeg,image/webp${MOVING_PICTURES.includes(name) ? ',video/mp4,video/webm,video/quicktime,.mov,.m4v' : ''}`;
    const input = parent.createEl('input', { attr: { type: 'file', accept, hidden: 'true' } });
    input.addEventListener('change', async () => {
      if (input.files && input.files[0] && await this.savePicture(name, input.files[0])) after(true);
    });
    parent.createEl('button', { text: has ? 'Change background' : 'Upload background' }).addEventListener('click', () => input.click());
    if (name === 'profile-card') {
      parent.createEl('button', { text: 'Use a video link' }).addEventListener('click', () => {
        new TextPromptModal(this.app, 'Paste a video link (YouTube, TikTok, Instagram…)', '', async (link) => { if (await this.setPictureFromYouTube(name, link)) after(true); }).open();
      });
    }
    if (has) parent.createEl('button', { text: 'Remove background' }).addEventListener('click', async () => { await this.savePicture(name, null); after(false); });
    return has;
  }

  /** The picture behind the "Your picture" card: <journal folder>/Profile/card.<png|jpg|webp>, if there is one. */
  cardPictureFile() {
    for (const ext of ['png', 'jpg', 'jpeg', 'webp', ...CARD_VIDEO_EXTS]) {
      const file = this.app.vault.getAbstractFileByPath(normalizePath(`${this.settings.folder}/Profile/card.${ext}`));
      if (file instanceof TFile) return file;
    }
    return null;
  }

  /** The card picture, loaded and ready to draw; null when there is none or it cannot be read. A video background
   *  comes back as a <video> stopped on its first frame: drawn once it is a still, played it is a moving card. */
  async cardPicture() {
    const file = this.cardPictureFile();
    if (!file) return null;
    if (CARD_VIDEO_EXTS.includes(file.extension)) return this.loadVideo(file);
    try {
      const type = `image/${file.extension === 'jpg' ? 'jpeg' : file.extension}`;
      const url = URL.createObjectURL(new Blob([await this.app.vault.readBinary(file)], { type }));
      return await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
      });
    } catch (e) {
      return null;
    }
  }

  /** Replaces the card picture with a picked image file and switches to that design (pass null to remove it). */
  async setCardPicture(picked) {
    this.settings.cardYouTube = ''; // a new background replaces a YouTube one (setCardPictureFromYouTube sets it again)
    this.settings.cardTikTok = '';
    const clear = async () => { for (let old = this.cardPictureFile(); old; old = this.cardPictureFile()) await this.app.vault.trash(old, true); };
    if (picked) {
      const ext = (picked.name.split('.').pop() || '').toLowerCase();
      const video = CARD_VIDEO_EXTS.includes(ext);
      if (!video && !/^(png|jpe?g|webp)$/.test(ext)) { notify('Pick a PNG, JPG or WebP picture, or an MP4, WebM or MOV video.'); return false; }
      if (!video && picked.size > 8 * 1024 * 1024) { notify('That picture is over 8 MB — pick a smaller one.'); return false; }
      if (video && picked.size > 80 * 1024 * 1024) { notify('That video is over 80 MB — pick a shorter one.'); return false; }
      const data = await picked.arrayBuffer();
      await clear();
      const folder = normalizePath(`${this.settings.folder}/Profile`);
      await this.ensureFolder(folder);
      await this.app.vault.createBinary(normalizePath(`${folder}/card.${ext}`), data);
      this.settings.cardSkin = 'custom';
    } else {
      await clear();
      if (this.settings.cardSkin === 'custom') this.settings.cardSkin = 'classic';
    }
    await this.saveData(this.settings);
    this.refreshViews();
    return true;
  }

  /** A YouTube video's cover picture as bytes (the largest there is), or null when it cannot be had. */
  async youtubeCover(id) {
    for (const size of ['maxresdefault', 'hqdefault']) {
      const url = `https://i.ytimg.com/vi/${id}/${size}.jpg`;
      try {
        let data = null;
        if (typeof requestUrl === 'function') {
          const response = await requestUrl({ url, throw: false });
          if (response.status === 200) data = response.arrayBuffer;
        } else {
          const response = await fetch(url);
          if (response.ok) data = await response.arrayBuffer();
        }
        if (data && data.byteLength > 2000) return data;
      } catch (e) {
        // try the next size
      }
    }
    return null;
  }

  /** Uses a YouTube video as the flex card's background: the video plays behind the card in its dialog, and its
   *  cover picture is what stills of the card use. `link` is any address of the video. */
  async setCardPictureFromYouTube(link) {
    // on a computer with yt-dlp the video itself is downloaded and becomes the card's video file: it plays with its
    // sound, and Save video renders it at its full size. Where that cannot be done the video plays in a frame.
    if (canRunTools(this.app) && isVideoUrl(String(link || '').trim())) {
      const taken = await this.cardVideoFromLink(String(link).trim());
      if (taken !== null) return taken;
    }
    if (isTikTok(link)) return this.setCardPictureFromTikTok(link);
    const id = (youtubeTarget(link) || {}).video;
    if (!id) { notOnYouTube(this.app, link); return false; }
    const data = await this.youtubeCover(id);
    if (!data) { notify('The cover of that video could not be downloaded.'); return false; }
    if (!await this.setCardPicture({ name: 'cover.jpg', size: data.byteLength, arrayBuffer: async () => data })) return false;
    this.settings.cardYouTube = id;
    await this.saveData(this.settings);
    this.refreshViews(); // the lobby's member card plays it too
    return true;
  }

  /** The same with a TikTok video. TikTok's own "oEmbed" address (made for showing a link) tells which video a
   *  link is, short share links included, and where its cover is. */
  async setCardPictureFromTikTok(link) {
    const found = await this.tiktokVideo(link);
    if (!found) return false;
    if (!await this.setCardPicture({ name: 'cover.jpg', size: found.cover.byteLength, arrayBuffer: async () => found.cover })) return false;
    this.settings.cardTikTok = found.id;
    await this.saveData(this.settings);
    this.refreshViews(); // the lobby's member card plays it too
    return true;
  }

  /** Which video a TikTok link is and its cover picture, as { id, cover }; null (with a notice) when it cannot be had. */
  async tiktokVideo(link) {
    const get = async (url, kind) => {
      try {
        if (typeof requestUrl === 'function') {
          const response = await requestUrl({ url, throw: false });
          if (response.status !== 200) return null;
          return kind === 'binary' ? response.arrayBuffer : kind === 'text' ? response.text : response.json;
        }
        const response = await fetch(url);
        if (!response.ok) return null;
        return kind === 'binary' ? await response.arrayBuffer() : kind === 'text' ? await response.text() : await response.json();
      } catch (e) {
        return null; // not reachable, or not the kind of answer asked for
      }
    };
    // A shared link carries more than the video: tokens saying who shared it, or only a short code. The video's
    // own plain address is worked out first, and that is what TikTok is asked about.
    let found = tiktokAddress(link);
    if (!found) {
      // a short share link (vt. / vm. / tiktok.com/t/): the page it leads to names the video
      const page = await get(String(link).trim(), 'text');
      found = page ? tiktokAddress((String(page).match(/https?:\\?\/\\?\/www\.tiktok\.com\\?\/@[\w.-]*\\?\/(?:video|photo)\\?\/\d+/) || [''])[0].replace(/\\/g, '')) : null;
    }
    let info = null;
    for (const address of [found && found.address, String(link).trim()]) {
      if (!address || info) continue;
      info = await get(`https://www.tiktok.com/oembed?url=${encodeURIComponent(address)}`);
      if (info && !info.embed_product_id && !info.thumbnail_url) info = null;
    }
    const id = (found && found.id) || (info && (String(info.embed_product_id || '').match(/^\d+$/) || String(info.html || '').match(/data-video-id="(\d+)"/) || []).pop());
    if (!id) { notify('That TikTok video could not be read. Check that the link opens a public video.'); return null; }
    let data = info && info.thumbnail_url ? await get(info.thumbnail_url, 'binary') : null;
    if (!data || data.byteLength < 2000) {
      // the video is known but its cover is not to be had: a plain dark picture stands in, and the video still plays
      data = await new Promise((resolve) => {
        const blank = document.createElement('canvas');
        blank.width = 1280;
        blank.height = 720;
        const ctx = blank.getContext('2d');
        ctx.fillStyle = '#0b0b0c';
        ctx.fillRect(0, 0, 1280, 720);
        blank.toBlob((blob) => (blob ? blob.arrayBuffer().then(resolve) : resolve(null)), 'image/jpeg', 0.9);
      });
      if (!data) { notify('The cover of that video could not be downloaded.'); return null; }
      notify('The cover of that video could not be downloaded: the video plays, and stills use a plain background.');
    }
    return { id, cover: data };
  }

  /** The same for one of the other backgrounds (see pictureFile), e.g. 'profile-card'. */
  async setPictureFromYouTube(name, link) {
    // on a computer with yt-dlp the video itself is downloaded and becomes the card's video file (see cardVideoFromLink)
    if (MOVING_PICTURES.includes(name) && canRunTools(this.app) && isVideoUrl(String(link || '').trim())) {
      const taken = await this.cardVideoFromLink(String(link).trim(), (picked) => this.savePicture(name, picked));
      if (taken !== null) return taken;
    }
    if (isTikTok(link)) {
      // kept in the same place as a YouTube video, marked 'tiktok:'
      const found = await this.tiktokVideo(link);
      if (!found) return false;
      if (!await this.savePicture(name, { name: 'cover.jpg', size: found.cover.byteLength, arrayBuffer: async () => found.cover })) return false;
      this.settings.pictureYouTube = { ...(this.settings.pictureYouTube || {}), [name]: `tiktok:${found.id}` };
      await this.saveData(this.settings);
      return true;
    }
    const id = (youtubeTarget(link) || {}).video;
    if (!id) { notOnYouTube(this.app, link); return false; }
    const data = await this.youtubeCover(id);
    if (!data) { notify('The cover of that video could not be downloaded.'); return false; }
    if (!await this.savePicture(name, { name: 'cover.jpg', size: data.byteLength, arrayBuffer: async () => data })) return false;
    this.settings.pictureYouTube = { ...(this.settings.pictureYouTube || {}), [name]: id };
    await this.saveData(this.settings);
    return true;
  }

  /** The card designs as buttons. "Your picture" opens the file picker until a picture exists; after that it has
   *  its own change / remove buttons. `after` runs when the choice changed (the views are refreshed already). */
  renderSkinPicker(parent, rank, after) {
    const settings = this.settings;
    const own = this.source === 'own';
    const open = unlockedSkins(rank).map((k) => k.key);
    const hasPicture = !!this.cardPictureFile();
    const chosen = open.includes(settings.cardSkin) && (settings.cardSkin !== 'custom' || hasPicture) ? settings.cardSkin : 'classic';
    const done = () => { if (after) after(); };
    const input = parent.createEl('input', { attr: { type: 'file', accept: 'image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime,.mov,.m4v', hidden: 'true' } });
    input.addEventListener('change', async () => {
      if (input.files && input.files[0] && await this.setCardPicture(input.files[0])) done();
    });
    const picker = parent.createDiv({ cls: 'tvj-skins' });
    // your own picture leads the list; the designs follow in rank order
    for (const k of [...CARD_SKINS.filter((s) => s.custom), ...CARD_SKINS.filter((s) => !s.custom)]) {
      const locked = !open.includes(k.key);
      const b = picker.createEl('button', { cls: `tvj-skin ${k.key === chosen ? 'is-active' : ''} ${locked ? 'is-locked' : ''}`, attr: { 'aria-pressed': String(k.key === chosen) } });
      const chip = b.createSpan({ cls: 'tvj-skin-chip' });
      chip.style.background = `linear-gradient(135deg, ${k.bg[0]}, ${k.bg[1]})`;
      if (k.custom && hasPicture && !CARD_VIDEO_EXTS.includes(this.cardPictureFile().extension)) {
        chip.style.backgroundImage = `url("${this.app.vault.getResourcePath(this.cardPictureFile())}")`;
        chip.style.backgroundSize = 'cover';
        chip.style.backgroundPosition = 'center';
      }
      const text = b.createSpan({ cls: 'tvj-skin-text' });
      text.createSpan({ cls: 'tvj-skin-name', text: k.name });
      const sub = text.createSpan({ cls: 'tvj-tile-sub' });
      if (locked && !k.custom) {
        // locked: the rank it unlocks at
        setIcon(sub.createSpan({ cls: 'tvj-skin-lock' }), 'lock');
        sub.createSpan({ text: k.tier });
        b.setAttribute('aria-label', `Unlocks at ${k.tier}`);
      } else sub.setText(k.custom ? (hasPicture ? 'Your background' : 'Upload a background') : k.fun ? 'Just for fun' : k.from ? `${k.tier} card` : 'Always yours');
      if (locked || !own) { b.disabled = true; continue; }
      b.addEventListener('click', async () => {
        if (k.custom && !hasPicture) { input.click(); return; }
        settings.cardSkin = k.key;
        await this.saveData(settings);
        this.refreshViews();
        done();
      });
    }
    if (own) {
      // your own background: a picture, a video (the card then moves) or the cover of a YouTube video
      const tools = parent.createDiv({ cls: 'tvj-options tvj-skin-tools' });
      tools.createEl('button', { text: hasPicture ? 'Change card picture' : 'Upload a picture or video' }).addEventListener('click', () => input.click());
      tools.createEl('button', { text: 'Use a video link' }).addEventListener('click', () => {
        new TextPromptModal(this.app, 'Paste a video link (YouTube, TikTok, Instagram…)', '', async (link) => { if (await this.setCardPictureFromYouTube(link)) done(); }).open();
      });
      if (hasPicture) tools.createEl('button', { text: 'Remove card picture' }).addEventListener('click', async () => { await this.setCardPicture(null); done(); });
    }
    return chosen;
  }

  /** Draws the flex card in a design; the "Your picture" design is drawn again once its picture has loaded.
   *  Resolves to that picture (a <video> when the background is a video, so the caller can play it), else null. */
  paintCard(canvas, trades, title, period, mode, skin, facts, look) {
    const holder = this.settings.profileName;
    if (skin !== 'custom') {
      drawFlexCard(canvas, trades, title, period, mode, skin, holder, null, facts, undefined, look);
      return Promise.resolve(null);
    }
    // a card with your own picture has no design name to print: it carries your rank instead
    const rank = this.ownRank();
    const cardName = rank.ranked ? rank.tier : 'Member';
    drawFlexCard(canvas, trades, title, period, mode, skin, holder, null, facts, cardName, look);
    return this.cardPicture().then((picture) => {
      if (picture && canvas.isConnected) drawFlexCard(canvas, trades, title, period, mode, skin, holder, picture, facts, cardName, look);
      return picture;
    });
  }

  /** The flex card's look controls above the canvas: number animation (off / on, replay) and — for the
   *  "Your picture" design — the text colour. `ctl` is the card's { replay, finish }; `rerender` redraws the dialog. */
  renderCardLookControls(parent, chosenSkin, ctl, rerender) {
    const settings = this.settings;
    const say = (en, vi) => (LANG === 'vi' ? vi : en);
    const save = async (patch) => { Object.assign(settings, patch); await this.saveData(settings); rerender(); };
    const segment = (row, label, options, current, pick) => {
      row.createSpan({ cls: 'tvj-seg-label', text: label });
      const seg = row.createDiv({ cls: 'tvj-seg', attr: { role: 'group', 'aria-label': label } });
      for (const o of options) {
        const b = seg.createEl('button', { cls: o.value === current ? 'is-on' : '', attr: { type: 'button', 'aria-pressed': String(o.value === current) } });
        if (o.swatch) b.createSpan({ cls: 'tvj-seg-swatch' }).style.background = o.swatch;
        b.createSpan({ text: o.text });
        b.addEventListener('click', () => { if (o.value !== current) pick(o.value); });
      }
      return seg;
    };

    const animRow = parent.createDiv({ cls: 'tvj-options tvj-look-row' });
    const animOn = settings.cardAnimate !== false;
    segment(animRow, say('Number animation', 'Hiệu ứng số'), [{ value: false, text: say('Off', 'Tắt') }, { value: true, text: say('On', 'Bật') }], animOn,
      (v) => save({ cardAnimate: v }));
    if (animOn) animRow.createEl('button', { text: say('↻ Replay', '↻ Phát lại') }).addEventListener('click', () => ctl && ctl.replay());

    if (chosenSkin !== 'custom') return;
    const colRow = parent.createDiv({ cls: 'tvj-options tvj-look-row' });
    const current = settings.cardTextColor || 'auto';
    const custom = /^#[0-9a-f]{6}$/i.test(settings.cardTextCustom || '') ? settings.cardTextCustom : '#FF6B9D';
    segment(colRow, say('Text colour', 'Màu chữ'), [
      { value: 'default', text: say('Default', 'Mặc định'), swatch: '#7CF2B0' },
      { value: 'auto', text: say('Auto contrast', 'Tự tương phản'), swatch: 'linear-gradient(90deg,#111 50%,#fff 50%)' },
      { value: 'white', text: say('White', 'Trắng'), swatch: '#FFFFFF' },
      { value: 'gold', text: say('Gold', 'Vàng'), swatch: '#E9C877' },
      { value: 'custom', text: say('Custom', 'Tuỳ chọn'), swatch: custom },
    ], current, (v) => save({ cardTextColor: v }));
    if (current === 'custom') {
      const pickEl = colRow.createEl('input', { cls: 'tvj-seg-color', attr: { type: 'color', value: custom, 'aria-label': say('Custom text colour', 'Màu chữ tuỳ chọn') } });
      pickEl.addEventListener('change', () => save({ cardTextCustom: pickEl.value }));
    }
  }

  /** Draws a year grid (see activityGrid) into a card: month labels, weekday labels, one square per day, a legend.
   *  `describe(day)` words what was logged on a day for its tooltip ('' = nothing). */
  renderHeat(card, grid, describe) {
    const scroll = card.createDiv({ cls: 'tvj-heat-scroll' });
    const heat = scroll.createDiv({ cls: 'tvj-heat' });
    heat.style.setProperty('--tvj-heat-weeks', String(grid.weeks.length));
    const monthRow = heat.createDiv({ cls: 'tvj-heat-months' });
    for (const m of grid.months) {
      const label = monthRow.createSpan({ text: LANG === 'vi' ? `Th${m.month + 1}` : MONTHS_SHORT[m.month] });
      label.style.gridColumnStart = String(m.week + 1);
    }
    const dayCol = heat.createDiv({ cls: 'tvj-heat-days' });
    for (const [i, name] of ['Mon', '', 'Wed', '', 'Fri', '', ''].entries()) dayCol.createSpan({ text: name }).style.gridRowStart = String(i + 1);
    const cells = heat.createDiv({ cls: 'tvj-heat-cells' });
    for (const week of grid.weeks) {
      for (const day of week) {
        const cell = cells.createDiv({ cls: `tvj-heat-cell${day.future ? ' is-future' : ` is-l${day.level}`}` });
        if (day.future) continue;
        // tooltips are attributes, which the page translator does not touch: they are worded in the chosen language
        const tip = `${day.date}: ${describe(day) || (LANG === 'vi' ? 'chưa ghi gì' : 'nothing logged')}`;
        cell.setAttribute('title', tip);
        cell.setAttribute('aria-label', tip);
      }
    }
    const legend = card.createDiv({ cls: 'tvj-heat-legend' });
    legend.createSpan({ cls: 'tvj-muted', text: 'Less' });
    for (let l = 0; l <= 4; l++) legend.createDiv({ cls: `tvj-heat-cell is-l${l}` });
    legend.createSpan({ cls: 'tvj-muted', text: txIn('activity', 'More') });
    // the newest weeks are on the right: start there when the pane is too narrow to show the whole year
    window.requestAnimationFrame(() => { scroll.scrollLeft = scroll.scrollWidth; });
  }

  /** Your profile picture, loaded and ready to draw on a card; null when there is none. */
  async avatarImage() {
    const file = this.avatarFile();
    if (!file) return null;
    try {
      const type = `image/${file.extension === 'jpg' ? 'jpeg' : file.extension}`;
      const url = URL.createObjectURL(new Blob([await this.app.vault.readBinary(file)], { type }));
      return await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
      });
    } catch (e) {
      return null;
    }
  }

  /** Opens the P&L card of one journaled trade (the trade's note file). */
  openTradeCard(file) {
    const item = this.getTrades(null, true).find((x) => x.file.path === file.path);
    if (item) new TradeCardModal(this.app, this, item).open();
  }

  /** Replaces the profile picture with a picked image file (pass null to remove it). */
  async setAvatar(picked) {
    if (picked) {
      const ext = (picked.name.split('.').pop() || '').toLowerCase();
      if (!/^(png|jpe?g|webp|gif)$/.test(ext)) { notify('Pick a PNG, JPG, WebP or GIF picture.'); return; }
      if (picked.size > 5 * 1024 * 1024) { notify('That picture is over 5 MB — pick a smaller one.'); return; }
      const data = await picked.arrayBuffer();
      for (let old = this.avatarFile(); old; old = this.avatarFile()) await this.app.vault.trash(old, true);
      const folder = normalizePath(`${this.settings.folder}/Profile`);
      await this.ensureFolder(folder);
      await this.app.vault.createBinary(normalizePath(`${folder}/avatar.${ext}`), data);
    } else {
      for (let old = this.avatarFile(); old; old = this.avatarFile()) await this.app.vault.trash(old, true);
    }
    this.refreshViews();
  }

  /** Removes an account everywhere it is kept. Its trades are either sent to the trash or left as trades without
   *  an account (so the account does not come back from them). */
  async deleteAccount(name, withTrades) {
    const items = this.getTrades().filter((x) => accountName(x.trade) === name);
    for (const item of items) {
      if (withTrades) await this.app.vault.trash(item.file, true);
      else await this.app.fileManager.processFrontMatter(item.file, (fm) => { fm.account = ''; });
    }
    const s = this.settings;
    s.accounts = (s.accounts || []).filter((a) => a !== name);
    delete s.accountInfo[name];
    s.payouts = (s.payouts || []).filter((p) => p.account !== name);
    s.groups = parseGroups(s.groups).map((g) => ({ name: g.name, accounts: g.accounts.filter((a) => a !== name) }))
      .filter((g) => g.accounts.length).map((g) => `${g.name}: ${g.accounts.join(', ')}`).join('\n');
    if (s.lastAccount === name) s.lastAccount = '';
    await this.saveData(s);
    notify(withTrades && items.length ? `Account deleted with ${items.length} trades: ${name}` : `Account deleted: ${name}`);
    this.refreshViews();
  }

  async addAccount(name, group) {
    const accounts = this.settings.accounts || [];
    if (!accounts.includes(name)) this.settings.accounts = [...accounts, name];
    if (group) this.settings.groups = withAccountInGroup(this.settings.groups, group, name);
    await this.saveData(this.settings);
    this.refreshViews();
  }

  /** Puts an account in `group` ('' for none), out of the group it was in. */
  async moveAccountToGroup(name, group) {
    this.settings.groups = withAccountMoved(this.settings.groups, name, String(group || '').trim());
    await this.saveData(this.settings);
    this.refreshViews();
  }

  /** A dropdown of the account groups — No group, each group, `extra` (a group that does not exist yet, offered
   *  as "<name> (new)") and New group… (asks for a name) — set to `value`; `onChange(group)` gets the choice. */
  groupSelect(parent, value, onChange, extra = '') {
    const names = parseGroups(this.settings.groups).map((g) => g.name);
    const select = parent.createEl('select', { cls: 'dropdown' });
    select.createEl('option', { text: tx('No group'), value: '' });
    for (const n of names) select.createEl('option', { text: n, value: n });
    if (extra && !names.includes(extra)) select.createEl('option', { text: `${extra} (${tx('new')})`, value: extra });
    if (value && !names.includes(value) && value !== extra) select.createEl('option', { text: value, value });
    select.createEl('option', { text: tx('New group…'), value: '__new' });
    select.value = value || '';
    select.addEventListener('change', () => {
      if (select.value !== '__new') { onChange(select.value); return; }
      select.value = value || '';
      new TextPromptModal(this.app, 'Name of the new group', '', (name) => {
        const n = String(name || '').trim();
        if (!n || /[,:\n]/.test(n)) { notify('Type a group name without commas or colons.'); return; }
        onChange(n);
      }).open();
    });
    return select;
  }

  /** Renames an account everywhere it is used: the account of each of its trade notes, the account list, its rules
   *  and status, the steps linked to it, groups, payouts, costs and the last account used. Returns whether it was renamed. */
  async renameAccount(from, to) {
    to = String(to || '').trim();
    if (!to || to === from || this.source !== 'own') return false;
    const s = this.settings;
    const trades = this.getTrades();
    if (to === NO_ACCOUNT || (s.accounts || []).includes(to) || s.accountInfo[to] || trades.some((x) => x.trade.account === to)) {
      notify('An account with that name already exists.');
      return false;
    }
    const files = trades.filter((x) => x.trade.account === from && x.file instanceof TFile).map((x) => x.file);
    for (const file of files) await this.app.fileManager.processFrontMatter(file, (fm) => { fm.account = to; });
    s.accounts = (s.accounts || []).map((a) => (a === from ? to : a));
    if (s.accountInfo[from]) {
      s.accountInfo[to] = s.accountInfo[from];
      delete s.accountInfo[from];
    }
    for (const info of Object.values(s.accountInfo)) {
      if (info.from === from) info.from = to; // the step before it in a challenge
      if (info.advancedTo === from) info.advancedTo = to;
    }
    s.groups = renameInGroups(s.groups, from, to);
    for (const payout of s.payouts || []) if (payout.account === from) payout.account = to;
    for (const cost of s.costs || []) if (cost.account === from) cost.account = to;
    await this.moveDayNotes(from, to);
    if (s.lastAccount === from) s.lastAccount = to;
    await this.saveData(s);
    this.refreshViews();
    notify(`Renamed ${from} to ${to} (${files.length} trades).`);
    return true;
  }

  /** Whether `name` is one of your own accounts that can be renamed. */
  canRenameAccount(name) {
    return !!name && name !== NO_ACCOUNT && this.source === 'own';
  }

  /** Asks for a new name for the account, renames it, then calls `onRenamed` with the new name. */
  askRenameAccount(name, onRenamed) {
    new TextPromptModal(this.app, 'Rename account', name, async (next) => {
      if (await this.renameAccount(name, next)) onRenamed(next.trim());
    }).open();
  }

  /** "Rename" beside the account picker while one of your own accounts is shown. */
  renameAccountButton(parent, scope, onRenamed) {
    const name = String(scope || '').startsWith('account:') ? scope.slice('account:'.length) : '';
    if (!this.canRenameAccount(name)) return;
    parent.createEl('button', { text: 'Rename', attr: { 'aria-label': 'Rename this account' } }).addEventListener('click', () => this.askRenameAccount(name, onRenamed));
  }

  /** Your own picture for a tier, if there is one: <journal folder>/Ranks/<tier>.png (or .webp .jpg .svg),
   *  e.g. Ranks/gold.png, Ranks/grandmaster.png, Ranks/unranked.png. The plugin ships no rank pictures. */
  rankImageFile(rank) {
    const name = (rank.ranked === false ? 'unranked' : rank.tier).toLowerCase();
    for (const ext of ['png', 'webp', 'jpg', 'jpeg', 'svg']) {
      const file = this.app.vault.getAbstractFileByPath(normalizePath(`${this.settings.folder}/Ranks/${name}.${ext}`));
      if (file instanceof TFile) return file;
    }
    return null;
  }

  /** Emblem for the lobby: your picture when the Ranks folder has one for this tier, the drawn crest otherwise. */
  emblemEl(rank, size, plain) {
    const file = this.rankImageFile(rank);
    const art = file ? null : rankArtOf(rank);
    if (!file && !art) return emblemSvg(rank, size);
    const wrap = document.createElement('div');
    wrap.className = 'tvj-emblem tvj-emblem-img';
    wrap.style.width = `${size}px`;
    const img = wrap.createEl('img', { attr: { src: file ? this.app.vault.getResourcePath(file) : art.src, alt: rank.label || rank.tier } });
    img.style.maxHeight = `${Math.round(size * 0.82)}px`;
    if (rank.division && !plain) {
      const pips = wrap.createDiv({ cls: 'tvj-pips' });
      const lit = DIVISIONS.indexOf(rank.division) + 1;
      for (let k = 0; k < DIVISIONS.length; k++) pips.createEl('i', { cls: k < lit ? 'is-lit' : '' });
    }
    return wrap;
  }

  /** The same picture as a loaded image for the profile card (read from the vault, so the canvas stays exportable). */
  async rankPicture(rank) {
    const file = this.rankImageFile(rank);
    if (!file) { const art = rankArtOf(rank); return art ? art.image : null; }
    try {
      const type = file.extension === 'svg' ? 'image/svg+xml' : `image/${file.extension === 'jpg' ? 'jpeg' : file.extension}`;
      const url = URL.createObjectURL(new Blob([await this.app.vault.readBinary(file)], { type }));
      return await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
      });
    } catch (e) {
      return null;
    }
  }

  /** The same strip at the top of every screen: which screen this is, and one click to the others. */
  renderNav(parent, current) {
    const nav = parent.createDiv({ cls: 'tvj-nav' });
    for (const [type, label] of [[LOBBY_VIEW_TYPE, 'Lobby'], [VIEW_TYPE, 'Dashboard'], [ACCOUNTS_VIEW_TYPE, 'Accounts'], [JOURNAL_VIEW_TYPE, 'Journal'], [GYM_VIEW_TYPE, 'Gym'], [LESSONS_VIEW_TYPE, 'Lessons'], [MUSIC_VIEW_TYPE, 'Music'], ['tu', 'Tu'], [TROPHY_VIEW_TYPE, 'Trophies'], [LOGIC_VIEW_TYPE, 'Logic tree']]) {
      // Tu: one button for the two practice screens, Nhẫn and Mở hòm
      const tu = type === 'tu', here = tu ? TU_VIEW_TYPES.some(([t]) => t === current) : type === current;
      nav.createEl('button', { text: tu ? 'Tu ▾' : label, cls: `tvj-nav-item ${here ? 'is-active' : ''}` }).addEventListener('click', (evt) => {
        if (!tu) { if (type !== current) this.openView(type); return; }
        const menu = new Menu();
        for (const [t, name, icon] of TU_VIEW_TYPES) menu.addItem((i) => i.setTitle(name).setIcon(icon).setChecked(t === current).onClick(() => { if (t !== current) this.openView(t); }));
        menu.showAtMouseEvent(evt);
      });
    }
    const packages = this.reviewPackages();
    if (packages.length || this.source !== 'own') {
      const source = parent.createEl('select', { cls: 'dropdown tvj-source', attr: { 'aria-label': 'Whose journal you are looking at' } });
      source.createEl('option', { text: 'My journal', value: 'own' });
      for (const pkg of packages) source.createEl('option', { text: `Reviewing · ${pkg.name}`, value: pkg.path });
      source.value = this.source;
      source.addEventListener('change', () => this.setSource(source.value));
    }
    nav.createEl('button', { text: 'Layout', cls: 'tvj-nav-item', attr: { 'aria-label': 'Choose a pane layout' } }).addEventListener('click', () => new LayoutModal(this.app, this).open());
    nav.createEl('button', { text: 'Style', cls: 'tvj-nav-item', attr: { 'aria-label': 'Theme and colours' } }).addEventListener('click', () => new StyleModal(this.app, this).open());
  }

  getGymSessions() {
    const out = [];
    if (this.source !== 'own') return out; // a package carries trades only
    const kept = this.inObsidian && this.dataCache.get('gym');
    if (kept) return kept.slice();
    for (const file of this.app.vault.getMarkdownFiles()) {
      const cache = this.app.metadataCache.getFileCache(file);
      const session = gymFromFrontmatter(cache && cache.frontmatter);
      if (session) {
        out.push({ file, session });
        this.journalPaths.add(file.path);
      }
    }
    this.dataCache.set('gym', out);
    return out.slice();
  }

  async createGymNote(g) {
    const folder = normalizePath(`${this.settings.folder}/Gym`);
    await this.ensureFolder(folder);
    let path = normalizePath(`${folder}/${g.date} ${safeName(g.kind)}.md`);
    for (let n = 2; this.app.vault.getAbstractFileByPath(path); n++) path = normalizePath(`${folder}/${g.date} ${safeName(g.kind)} ${n}.md`);
    return this.app.vault.create(path, gymToMarkdown(g));
  }

  /** Your own review questions for a trade with this P&L (Logic/Losing trade review.md or Winning trade review.md),
   *  or null to use the built-in ones. */
  async ownReviewSteps(pnl) {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(`${this.settings.folder}/Logic/${pnl >= 0 ? OWN_REVIEW_TREES.win : OWN_REVIEW_TREES.loss}.md`));
    if (!(file instanceof TFile)) return null;
    try { return stepsFromTree(parseOutline(await this.app.vault.cachedRead(file))); } catch (e) { return null; }
  }

  async createLogicNote(name) {
    const folder = normalizePath(`${this.settings.folder}/Logic`);
    await this.ensureFolder(folder);
    const path = normalizePath(`${folder}/${safeName(name)}.md`);
    if (this.app.vault.getAbstractFileByPath(path)) {
      notify('A tree with this name already exists.');
      return null;
    }
    return this.app.vault.create(path, LOGIC_TEMPLATE);
  }

  refreshViews() {
    for (const type of [VIEW_TYPE, JOURNAL_VIEW_TYPE, GYM_VIEW_TYPE, LOBBY_VIEW_TYPE, LOGIC_VIEW_TYPE, TROPHY_VIEW_TYPE, ACCOUNTS_VIEW_TYPE, LESSONS_VIEW_TYPE, SIDEBAR_VIEW_TYPE, GLANCE_VIEW_TYPE]) {
      for (const leaf of this.app.workspace.getLeavesOfType(type)) if (leaf.view && leaf.view.render) leaf.view.render();
    }
  }

  /** Whether `name` is left out of the account pickers: a breached account while Settings → Hide breached accounts in
   *  pickers is on, a passed evaluation while Hide passed evaluations in pickers is on (both are, by default). The
   *  one already chosen (`keep`) always stays. Its trades still count everywhere. */
  hiddenInPickers(name, trades, keep) {
    const s = this.settings;
    if ((s.hideBreached === false && s.hidePassed === false) || !name || name === NO_ACCOUNT || name === keep) return false;
    const st = accountStatus(name, trades, s.accountInfo);
    return (st.blown && s.hideBreached !== false) || (!st.blown && !!st.passed && s.hidePassed !== false);
  }

  /** Dropdown: all accounts, then each group, then each account (breached ones hidden, see hiddenInPickers). */
  scopeSelect(parent, trades, groups, value, onChange) {
    const select = parent.createEl('select', { cls: 'dropdown' });
    select.createEl('option', { text: 'All accounts (total)', value: 'all' });
    for (const g of groups) select.createEl('option', { text: `Group · ${g.name}`, value: `group:${g.name}` });
    for (const a of this.allAccounts(trades)) {
      if (this.hiddenInPickers(a, trades, String(value).startsWith('account:') ? value.slice(8) : '')) continue;
      const blown = a !== NO_ACCOUNT && accountStatus(a, trades, this.settings.accountInfo).blown;
      select.createEl('option', { text: blown ? `${a} · blown` : a, value: `account:${a}` });
    }
    select.value = value;
    if (select.value !== value) select.value = 'all';
    select.addEventListener('change', () => onChange(select.value));
    return select;
  }

  /** Dropdown of periods; "Custom dates…" adds a from and a to day. A typed date is applied when you leave the field
   *  or press Enter (or a moment after picking it), so the screen does not redraw under you while typing. */
  periodSelect(parent, trades, value, onChange) {
    const wrap = parent.createDiv({ cls: 'tvj-range' });
    const select = wrap.createEl('select', { cls: 'dropdown' });
    for (const [id, label] of Object.entries(PERIODS)) select.createEl('option', { text: label, value: id });
    const picked = parseRange(value);
    select.value = picked ? 'range' : value;
    if (select.value !== (picked ? 'range' : value)) select.value = 'all';
    select.addEventListener('change', () => {
      if (select.value !== 'range') { onChange(select.value); return; }
      // start from the days of the period that was showing
      const b = periodBounds(value, trades) || { from: isoDay(new Date()), to: isoDay(new Date()) };
      onChange(`range:${b.from}:${b.to}`);
    });
    if (!picked) return select;
    let done = false, timer = 0;
    const field = (day, label) => wrap.createEl('input', { cls: 'tvj-date', attr: { type: 'date', value: day, 'aria-label': label } });
    const from = field(picked.from, 'From');
    wrap.createSpan({ cls: 'tvj-muted', text: '→' });
    const to = field(picked.to, 'To');
    const valid = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && v >= '1900';
    const apply = () => {
      window.clearTimeout(timer);
      if (done || !valid(from.value) || !valid(to.value)) return;
      const next = `range:${from.value}:${to.value}`;
      if (next === value) return;
      done = true;
      onChange(next);
    };
    for (const input of [from, to]) {
      input.addEventListener('change', () => { window.clearTimeout(timer); timer = window.setTimeout(apply, 700); });
      input.addEventListener('blur', apply);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });
    }
    return select;
  }

  /** The challenge list built into the plugin (PROP_FIRMS). */
  async loadChallengeCatalog() {
    this.challengeCatalog = PROP_FIRMS;
    return this.challengeCatalog;
  }

  async ensureFolder(folder) {
    const parts = normalizePath(folder).split('/');
    for (let i = 1; i <= parts.length; i++) {
      const p = parts.slice(0, i).join('/');
      if (!this.app.vault.getAbstractFileByPath(p)) await this.app.vault.createFolder(p);
    }
  }

  /** Opens a note or drawing in the plugin's side pane: one pane that is reused, so clicking through trades does
   *  not pile up tabs and never replaces the Dashboard or Journal screen. */
  async openInSide(file) {
    const { workspace } = this.app;
    let alive = false;
    if (this.sideLeaf) workspace.iterateAllLeaves((leaf) => { if (leaf === this.sideLeaf) alive = true; });
    if (!alive) this.sideLeaf = workspace.getLeaf('split');
    await this.sideLeaf.openFile(file);
    workspace.revealLeaf(this.sideLeaf);
  }

  /** Closes every pane that belongs to this plugin (notes and other tabs are left alone). */
  closePanes() {
    for (const type of [VIEW_TYPE, JOURNAL_VIEW_TYPE, LOBBY_VIEW_TYPE, GYM_VIEW_TYPE, LOGIC_VIEW_TYPE, TROPHY_VIEW_TYPE, ACCOUNTS_VIEW_TYPE, LESSONS_VIEW_TYPE, NHAN_VIEW_TYPE, HOM_VIEW_TYPE]) this.app.workspace.detachLeavesOfType(type);
  }

  /** Lays the given panes out left to right. 'note' is the side pane: it becomes the place trade notes and chart
   *  drawings open in, and starts on the most recent trade so it is not an empty tab.
   *  The new layout is built first, starting from a pane the plugin already has (or a new tab); the plugin's
   *  leftover panes are closed only after everything opened, so a failure can never leave you with nothing. */
  async applyLayout(panes) {
    const { workspace } = this.app;
    const mine = [VIEW_TYPE, JOURNAL_VIEW_TYPE, LOBBY_VIEW_TYPE, GYM_VIEW_TYPE, LOGIC_VIEW_TYPE, TROPHY_VIEW_TYPE, ACCOUNTS_VIEW_TYPE, LESSONS_VIEW_TYPE, YOUTUBE_VIEW_TYPE, MUSIC_VIEW_TYPE];
    const existing = mine.flatMap((type) => workspace.getLeavesOfType(type));
    const recent = workspace.getMostRecentLeaf ? workspace.getMostRecentLeaf() : null;
    const keep = [];
    try {
      let previous = null;
      for (const pane of panes) {
        const leaf = previous
          ? workspace.createLeafBySplit(previous, 'vertical')
          : (existing.includes(recent) ? recent : existing[0]) || workspace.getLeaf('tab');
        keep.push(leaf);
        if (pane === 'note') {
          this.sideLeaf = leaf;
          const latest = this.getTrades().sort((a, b) => byTime(b.trade, a.trade))[0];
          if (latest) await leaf.openFile(latest.file);
        } else await leaf.setViewState({ type: pane, active: !previous });
        previous = leaf;
      }
      for (const leaf of existing) if (!keep.includes(leaf)) leaf.detach();
      workspace.revealLeaf(keep[0]);
    } catch (error) {
      console.error('TrueVision Journal: could not arrange the panes', error);
      notify('Could not arrange the panes. Nothing was closed.');
      if (!mine.some((type) => workspace.getLeavesOfType(type).length)) await this.openView(panes[0] === 'note' ? VIEW_TYPE : panes[0]);
    }
  }

  /** Path of the Excalidraw drawing linked to a trade note (frontmatter `chart`), if the file still exists. */
  chartPath(tradeFile) {
    const cache = this.app.metadataCache.getFileCache(tradeFile);
    const path = cache && cache.frontmatter && typeof cache.frontmatter.chart === 'string' ? cache.frontmatter.chart : '';
    return path && this.app.vault.getAbstractFileByPath(path) instanceof TFile ? path : '';
  }

  /** Opens the trade's Excalidraw drawing beside the note, creating and embedding it on first use.
   *  Needs the Excalidraw community plugin; inside the drawing you can paste screenshots and draw freely. */
  async openChart(tradeFile) {
    const existing = this.chartPath(tradeFile);
    if (existing) {
      await this.openInSide(this.app.vault.getAbstractFileByPath(existing));
      return;
    }
    const ea = window.ExcalidrawAutomate;
    if (!ea) {
      notify('The Excalidraw plugin is needed for chart drawings — install and enable it first.');
      return;
    }
    const folder = normalizePath(`${this.settings.folder}/Charts`);
    await this.ensureFolder(folder);
    ea.reset();
    const path = await ea.create({ filename: `${tradeFile.basename} chart`, foldername: folder, silent: true });
    if (!path) return;
    await this.app.fileManager.processFrontMatter(tradeFile, (fm) => { fm.chart = path; });
    await this.app.vault.process(tradeFile, (content) => withChartSection(content, path));
    const drawing = this.app.vault.getAbstractFileByPath(path);
    if (drawing instanceof TFile) await this.openInSide(drawing);
  }

  /** The folder GIFs of the card are saved in, as a path on this computer: the one picked with "Location", or the
   *  vault's Flex folder. */
  gifFolder() {
    if (this.settings.gifFolder) return this.settings.gifFolder;
    const inVault = normalizePath(`${this.settings.folder}/Flex`);
    const adapter = this.app.vault.adapter;
    return adapter && typeof adapter.getFullPath === 'function' ? adapter.getFullPath(inVault) : inVault;
  }

  /** Saves a GIF there and returns where it is; null when it could not be written. The last one is remembered,
   *  so "Open that folder" can point at it. */
  async saveClip(blob, title, ext) {
    if (!blob) return null;
    try {
      if (this.settings.gifFolder) {
        const fs = window.require('fs'), path = window.require('path');
        fs.mkdirSync(this.settings.gifFolder, { recursive: true });
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        const full = path.join(this.settings.gifFolder, `${stamp} ${safeName(title)}.${ext}`);
        fs.writeFileSync(full, Buffer.from(await blob.arrayBuffer()));
        this.lastGif = full;
        return full;
      }
      const file = await this.saveFlexCard(blob, title, ext);
      if (!file) return null;
      const adapter = this.app.vault.adapter;
      this.lastGif = adapter && typeof adapter.getFullPath === 'function' ? adapter.getFullPath(file.path) : '';
      return file.path;
    } catch (e) {
      notify('The file could not be saved in that folder. Pick another one with Location.');
      return null;
    }
  }

  /** Shows the GIF folder in the computer's file manager, on the newest GIF when there is one. */
  async openGifFolder() {
    try {
      const electron = window.require('electron');
      const shell = electron.shell || (electron.remote && electron.remote.shell);
      const fs = window.require('fs');
      if (this.lastGif && fs.existsSync(this.lastGif)) { shell.showItemInFolder(this.lastGif); return; }
      const folder = this.gifFolder();
      fs.mkdirSync(folder, { recursive: true });
      await shell.openPath(folder);
    } catch (e) {
      notify('The folder could not be opened on this device.');
    }
  }

  /** Lets you pick, in the computer's own folder dialog, where GIFs are saved from now on. */
  async chooseGifFolder() {
    try {
      const remote = window.require('electron').remote;
      const picked = await remote.dialog.showOpenDialog({ title: tx('Where to save GIFs'), defaultPath: this.gifFolder(), properties: ['openDirectory', 'createDirectory'] });
      if (picked.canceled || !picked.filePaths || !picked.filePaths[0]) return;
      this.settings.gifFolder = picked.filePaths[0];
      this.lastGif = '';
      await this.saveData(this.settings);
      notify(`${tx('GIFs and videos are saved in:')} ${this.settings.gifFolder}`);
    } catch (e) {
      notify('A folder cannot be picked on this device.');
    }
  }

  async saveFlexCard(blob, title, ext = 'png') {
    if (!blob) return null;
    const folder = normalizePath(`${this.settings.folder}/Flex`);
    await this.ensureFolder(folder);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const path = normalizePath(`${folder}/${stamp} ${safeName(title)}.${ext}`);
    return this.app.vault.createBinary(path, await blob.arrayBuffer());
  }

  // ---- whose journal: your own, or a package imported for review ----

  reviewsFolder() {
    return normalizePath(`${this.settings.folder}/Reviews`);
  }

  /** Imported packages: one folder each under <journal folder>/Reviews. */
  reviewPackages() {
    const base = `${this.reviewsFolder()}/`;
    const names = new Set();
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (file.path.startsWith(base)) names.add(file.path.slice(base.length).split('/')[0]);
    }
    return [...names].sort().map((name) => ({ name, path: `${base}${name}` }));
  }

  setSource(path) {
    this.source = path || 'own';
    this.refreshViews();
  }

  /** Trades of the journal being looked at. Your own journal is every trade note outside Reviews; a package is
   *  the notes inside its folder. Pass 'own' to get your own journal whatever is being looked at. */
  /** The journal's trades. Missed and backtested trades are left out unless `withUncounted` is set: only the
   *  places that list or review single trades ask for them, so no total ever includes them. */
  getTrades(source, withUncounted) {
    const which = source || this.source || 'own';
    const pick = (xs) => (withUncounted ? xs.slice() : xs.filter((x) => isCounted(x.trade)));
    const kept = this.inObsidian && this.dataCache.get(`trades:${which}`);
    if (kept) return pick(kept);
    const reviews = `${this.reviewsFolder()}/`;
    const out = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      const inReviews = file.path.startsWith(reviews);
      if (which === 'own' ? inReviews : !file.path.startsWith(`${which}/`)) continue;
      const cache = this.app.metadataCache.getFileCache(file);
      const trade = tradeFromFrontmatter(cache && cache.frontmatter);
      if (trade) {
        out.push({ file, trade });
        this.journalPaths.add(file.path);
      }
    }
    this.dataCache.set(`trades:${which}`, out);
    return pick(out);
  }

  /** What a package of these trades would contain: the notes, their drawings, and the images both embed.
   *  Returns the entries to write plus counts and total size. */
  async collectPackage(items, withMedia) {
    const { vault, metadataCache } = this.app;
    const entries = [];
    const seen = new Set();
    let charts = 0, images = 0, bytes = 0;
    const add = (file, name, kind) => {
      if (seen.has(file.path)) return;
      seen.add(file.path);
      entries.push({ file, name, kind });
      bytes += file.stat ? file.stat.size : 0;
      if (kind === 'chart') charts++;
      if (kind === 'image') images++;
    };
    const addImages = async (owner) => {
      for (const target of linkTargets(await vault.cachedRead(owner))) {
        const linked = metadataCache.getFirstLinkpathDest(target, owner.path);
        if (linked instanceof TFile && linked.extension !== 'md') add(linked, `Attachments/${linked.name}`, 'image');
      }
    };
    for (const { file } of items) {
      add(file, `Trades/${file.name}`, 'trade');
      if (!withMedia) continue;
      await addImages(file);
      const chartPath = this.chartPath(file);
      const chart = chartPath && vault.getAbstractFileByPath(chartPath);
      if (chart instanceof TFile) {
        add(chart, `Charts/${chart.name}`, 'chart');
        await addImages(chart);
      }
    }
    return { entries, items, charts, images, bytes, withMedia };
  }

  /** Writes the package to <journal folder>/Exports/<name>.zip. Chart links in the notes are rewritten to point
   *  inside the package, so they still work wherever it is imported. */
  async exportPackage(pack, name, range) {
    const { vault } = this.app;
    const enc = new TextEncoder();
    const files = [];
    for (const entry of pack.entries) {
      if (entry.kind !== 'trade') {
        files.push({ name: entry.name, data: new Uint8Array(await vault.readBinary(entry.file)) });
        continue;
      }
      let text = await vault.read(entry.file);
      const chartPath = this.chartPath(entry.file);
      if (chartPath) text = pack.withMedia ? text.split(chartPath).join(`${PKG_MARK}/Charts/${chartPath.split('/').pop()}`) : text.replace(/\n## Chart\n[^\n]*\n?/, '\n').replace(/^chart:.*\n/m, '');
      files.push({ name: entry.name, data: enc.encode(text) });
    }
    const manifest = { format: 'truevision-journal-package', version: 1, name, range, exported: new Date().toISOString(), trades: pack.items.length, charts: pack.charts, images: pack.images };
    files.unshift({ name: 'manifest.json', data: enc.encode(JSON.stringify(manifest, null, 2)) });
    const folder = normalizePath(`${this.settings.folder}/Exports`);
    await this.ensureFolder(folder);
    let path = normalizePath(`${folder}/${safeName(name)}.zip`);
    for (let n = 2; vault.getAbstractFileByPath(path); n++) path = normalizePath(`${folder}/${safeName(name)} ${n}.zip`);
    return vault.createBinary(path, zipFiles(files).buffer);
  }

  /** Unpacks a package into <journal folder>/Reviews/<name>/ and returns that folder. */
  async importPackage(incoming) {
    const { vault } = this.app;
    const base = this.reviewsFolder();
    let folder = normalizePath(`${base}/${safeName(incoming.manifest.name || 'Package')}`);
    for (let n = 2; vault.getAbstractFileByPath(folder); n++) folder = normalizePath(`${base}/${safeName(incoming.manifest.name || 'Package')} ${n}`);
    const dec = new TextDecoder();
    for (const f of incoming.files) {
      const inner = f.name.slice(incoming.root.length);
      if (!/^(Trades|Charts|Attachments)\/[^/]+$/.test(inner)) continue; // only the three known folders, no nesting
      const path = normalizePath(`${folder}/${inner}`);
      await this.ensureFolder(path.split('/').slice(0, -1).join('/'));
      if (inner.startsWith('Trades/')) await vault.create(path, dec.decode(f.data).split(PKG_MARK).join(folder));
      else if (inner.endsWith('.md')) await vault.create(path, dec.decode(f.data));
      else await vault.createBinary(path, f.data.buffer.slice(f.data.byteOffset, f.data.byteOffset + f.data.byteLength));
    }
    return folder;
  }

  async deletePackage(path) {
    const folder = this.app.vault.getAbstractFileByPath(path);
    if (folder) await this.app.vault.trash(folder, true);
    if (this.source === path) this.source = 'own';
    this.refreshViews();
  }

  /** Creates the note for a trade. `quiet` is for imports: a name clash gets a numbered name instead of a notice. */
  async createTradeNote(trade, quiet) {
    const folder = normalizePath(`${this.settings.folder}/Trades`);
    await this.ensureFolder(folder);
    let path = normalizePath(`${folder}/${tradeFileName(trade)}`);
    if (this.app.vault.getAbstractFileByPath(path)) {
      if (!quiet) {
        notify('A trade note with this date, time, symbol and direction already exists.');
        return null;
      }
      for (let n = 2; this.app.vault.getAbstractFileByPath(path); n++) path = normalizePath(`${folder}/${tradeFileName(trade).replace(/\.md$/, ` ${n}.md`)}`);
    }
    return this.app.vault.create(path, tradeToMarkdown(trade));
  }

  /** Rewrites the numbers of an existing trade note; thesis, notes, review and chart stay untouched. */
  async updateTradeNote(file, trade) {
    const r = rMultiple(trade);
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      Object.assign(fm, {
        date: trade.date, time: trade.time, symbol: trade.symbol, direction: trade.direction, entry: trade.entry, exit: trade.exit,
        stop: trade.stop, qty: trade.qty, pointValue: trade.pointValue, fees: trade.fees, pnl: Number(netPnl(trade).toFixed(2)),
        duration: trade.duration ? Math.round(trade.duration) : null,
        market: trade.market === 'cfd' ? 'cfd' : 'futures', pnlOverride: Number.isFinite(trade.pnlOverride) ? trade.pnlOverride : null,
        r: r === null ? null : Number(r.toFixed(2)), account: trade.account, setups: trade.setups, tags: trade.tags, mistakes: trade.mistakes,
      });
      if (trade.pnlOnly) fm.pnlOnly = true; else delete fm.pnlOnly;
      if (TRADE_KINDS[trade.kind]) fm.kind = trade.kind; else delete fm.kind;
      // partial exits: written when the trade says (a trade from the form always does), kept as they are otherwise
      if (Array.isArray(trade.exits)) { if (trade.exits.length > 1) fm.exits = trade.exits; else delete fm.exits; }
      delete fm.setup;
    });
    const target = normalizePath(`${file.parent ? file.parent.path : `${this.settings.folder}/Trades`}/${tradeFileName(trade)}`);
    if (target !== file.path && !this.app.vault.getAbstractFileByPath(target)) await this.app.fileManager.renameFile(file, target);
  }

  /** Whose day notes a view uses: null (the notes All accounts keeps, and every view when day notes are shared),
   *  else the account or group. */
  dayOwner(scope) {
    return this.settings.dayNotesShared ? null : dayOwnerOf(scope);
  }
  dayBase(scope) {
    return normalizePath(`${this.settings.folder}/${dayNotesDir(this.dayOwner(scope))}`);
  }
  dayReviewPath(date, scope) {
    return normalizePath(`${this.dayBase(scope)}/${date}.md`);
  }
  /** The day's review: { section: text } plus bias, outcome and happened (the written part of What actually happened). */
  async readDayReview(date, scope) {
    const file = this.app.vault.getAbstractFileByPath(this.dayReviewPath(date, scope));
    if (!(file instanceof TFile)) return {};
    const content = await this.app.vault.read(file);
    const out = daySections(content);
    const fm = (content.match(/^---\n([\s\S]*?)\n---/) || [])[1] || '';
    const field = (k) => ((fm.match(new RegExp(`^${k}:\\s*"?([\\w-]+)"?\\s*$`, 'm')) || [])[1]) || '';
    out.bias = field('bias');
    out.outcome = field('outcome');
    out.happened = happenedText(out['What actually happened']);
    return out;
  }
  dayFolder(date, scope) {
    return normalizePath(`${this.dayBase(scope)}/${date}`);
  }
  /** The day's charts: slot ("bullish-daily", "actual-m15") -> image file. */
  dayShots(date, scope) {
    const folder = this.app.vault.getAbstractFileByPath(this.dayFolder(date, scope));
    const out = new Map();
    if (folder instanceof TFolder) for (const f of folder.children) if (f instanceof TFile && IMAGE_EXTS.includes(String(f.extension).toLowerCase())) out.set(f.basename, f);
    return out;
  }
  /** The day note, created from the template when the day has none yet. */
  async ensureDayNote(date, scope) {
    const path = this.dayReviewPath(date, scope);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) return file;
    await this.ensureFolder(this.dayBase(scope));
    return this.app.vault.create(path, dayNoteMarkdown(date, {}, this.dayOwner(scope)));
  }
  /** Puts a chart into a slot (replacing the one there) and updates the note's chart tables. */
  async saveDayShot(date, key, data, ext, scope) {
    const old = this.dayShots(date, scope).get(key);
    if (old && old.extension === ext) await this.app.vault.modifyBinary(old, data);
    else {
      if (old) await this.app.vault.trash(old, true);
      await this.ensureFolder(this.dayFolder(date, scope));
      await this.app.vault.createBinary(normalizePath(`${this.dayFolder(date, scope)}/${key}.${ext}`), data);
    }
    await this.writeDayCharts(date, scope);
  }
  async removeDayShot(date, key, scope) {
    const file = this.dayShots(date, scope).get(key);
    if (file) await this.app.vault.trash(file, true);
    await this.writeDayCharts(date, scope);
  }
  /** Rewrites the chart tables of the day note from the pictures in its folder. */
  async writeDayCharts(date, scope) {
    const file = await this.ensureDayNote(date, scope);
    const shots = this.dayShots(date, scope);
    await this.app.vault.process(file, (content) => {
      const happened = happenedText(daySections(content)['What actually happened']);
      const tfs = dayTimeframes(this.settings, shots);
      return withSection(withSection(content, 'Prediction', predictionBody(shots, tfs)), 'What actually happened', happenedBody(shots, happened, tfs));
    });
  }
  async writeDaySection(date, heading, text, scope) {
    const file = await this.ensureDayNote(date, scope);
    await this.app.vault.process(file, (content) => withSection(content, heading, text));
  }
  async writeDayHappened(date, text, scope) {
    const file = await this.ensureDayNote(date, scope);
    const shots = this.dayShots(date, scope);
    await this.app.vault.process(file, (content) => withSection(content, 'What actually happened', happenedBody(shots, text, dayTimeframes(this.settings, shots))));
  }
  /** bias / outcome in the day note's properties ('' removes it). */
  async writeDayField(date, key, value, scope) {
    const file = await this.ensureDayNote(date, scope);
    await this.app.fileManager.processFrontMatter(file, (fm) => { if (value) fm[key] = value; else delete fm[key]; });
  }
  /** Saves one answer of a day's review; the day note is created the first time something is written. */
  async writeDayAnswer(date, question, text, scope) {
    const path = this.dayReviewPath(date, scope);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.app.vault.process(file, (content) => withSection(content, question, text));
      return;
    }
    if (!String(text || '').trim()) return;
    await this.ensureFolder(this.dayBase(scope));
    await this.app.vault.create(path, dayNoteMarkdown(date, { [question]: text }, this.dayOwner(scope)));
  }
  /** The dates with a day note in this view. When notes are kept per account, All accounts also marks the days
   *  written on an account or a group, so no note goes missing from the overview. */
  dayReviewDates(scope) {
    const out = new Set(this.dayNoteDates(this.dayBase(scope)));
    if (!this.settings.dayNotesShared && !dayOwnerOf(scope)) for (const o of this.dayNoteOwners()) for (const d of this.dayNoteDates(o.path)) out.add(d);
    return out;
  }
  dayNoteDates(path) {
    const folder = this.app.vault.getAbstractFileByPath(normalizePath(path));
    return folder instanceof TFolder ? folder.children.filter((f) => f instanceof TFile && /^\d{4}-\d{2}-\d{2}$/.test(f.basename)).map((f) => f.basename) : [];
  }
  /** The accounts and groups with day notes of their own: [{ kind, name, path }]. */
  dayNoteOwners() {
    const s = this.settings;
    const accounts = [...new Set([...(s.accounts || []), ...Object.keys(s.accountInfo || {}), ...this.getTrades().map((x) => x.trade.account).filter(Boolean)])];
    const groups = parseGroups(s.groups).map((g) => g.name);
    const out = [];
    for (const [kind, sub, names] of [['account', 'Accounts', accounts], ['group', 'Groups', groups]]) {
      const folder = this.app.vault.getAbstractFileByPath(normalizePath(`${s.folder}/Days/${sub}`));
      if (!(folder instanceof TFolder)) continue;
      for (const f of folder.children) if (f instanceof TFolder) out.push({ kind, name: names.find((n) => daySlug(n) === f.name) || f.name, path: f.path });
    }
    return out;
  }
  /** The accounts and groups that have their own note on `date` (offered in the All accounts view). */
  dayNotesOn(date) {
    if (this.settings.dayNotesShared) return [];
    return this.dayNoteOwners().filter((o) => this.app.vault.getAbstractFileByPath(normalizePath(`${o.path}/${date}.md`)) instanceof TFile);
  }
  /** Takes an account's own day notes (and their charts) along when the account is renamed. */
  async moveDayNotes(from, to) {
    const root = `${this.settings.folder}/Days/Accounts`;
    const oldPath = normalizePath(`${root}/${daySlug(from)}`), newPath = normalizePath(`${root}/${daySlug(to)}`);
    const folder = this.app.vault.getAbstractFileByPath(oldPath);
    if (!(folder instanceof TFolder)) return;
    if (oldPath !== newPath) {
      if (this.app.vault.getAbstractFileByPath(newPath)) { notify(`The day notes of ${from} stay in ${oldPath}: ${newPath} already exists.`); return; }
      await this.app.fileManager.renameFile(folder, newPath);
    }
    const moved = this.app.vault.getAbstractFileByPath(newPath);
    if (!(moved instanceof TFolder)) return;
    for (const f of moved.children) {
      if (!(f instanceof TFile) || f.extension !== 'md') continue;
      // the chart tables point into the folder: follow it when Obsidian did not update the links itself
      if (oldPath !== newPath) await this.app.vault.process(f, (content) => content.split(`${oldPath}/`).join(`${newPath}/`));
      await this.app.fileManager.processFrontMatter(f, (fm) => { fm.account = to; });
    }
  }
  /** Rewrites a trade note's ## Thesis or ## Notes section. */
  async writeTradeSection(file, heading, text) {
    await this.app.vault.process(file, (content) => withSection(content, heading, text));
  }

  /** The picture behind the "Your Picture" certificate skin: <journal folder>/Profile/cert-picture.<png|jpg|webp>. */
  certPictureFile() {
    for (const ext of ['png', 'jpg', 'jpeg', 'webp']) {
      const file = this.app.vault.getAbstractFileByPath(normalizePath(`${this.settings.folder}/Profile/cert-picture.${ext}`));
      if (file instanceof TFile) return file;
    }
    return null;
  }

  /** Loads that picture for drawing (or forgets it when there is none). */
  async loadCertPicture() {
    const file = this.certPictureFile();
    if (!file) { delete CERT_ART['your-picture']; return; }
    try {
      const type = `image/${file.extension === 'jpg' ? 'jpeg' : file.extension}`;
      const url = URL.createObjectURL(new Blob([await this.app.vault.readBinary(file)], { type }));
      const image = await new Promise((resolve) => {
        const picture = new Image();
        picture.onload = () => resolve(picture);
        picture.onerror = () => resolve(null);
        picture.src = url;
      });
      if (image) CERT_ART['your-picture'] = image;
    } catch (e) {
      // unreadable: the skin shows its plain ground
    }
  }

  /** Replaces the "Your Picture" certificate picture with a picked file. Returns whether it was done. */
  async setCertPicture(picked) {
    const ext = (picked.name.split('.').pop() || '').toLowerCase();
    if (!/^(png|jpe?g|webp)$/.test(ext)) { notify('Pick a PNG, JPG or WebP picture.'); return false; }
    if (picked.size > 15 * 1024 * 1024) { notify('That picture is over 15 MB — pick a smaller one.'); return false; }
    const data = await picked.arrayBuffer();
    const folder = normalizePath(`${this.settings.folder}/Profile`);
    await this.ensureFolder(folder);
    for (let old = this.certPictureFile(); old; old = this.certPictureFile()) await this.app.vault.trash(old, true);
    await this.app.vault.createBinary(normalizePath(`${folder}/cert-picture.${ext}`), data);
    await this.loadCertPicture();
    return true;
  }

  /** A payout certificate as a picture in <journal folder>/Certificates, where the trophy room hangs it. */
  async saveCertificate(canvas, payout) {
    const folder = normalizePath(`${this.settings.folder}/Certificates`);
    await this.ensureFolder(folder);
    const title = safeName(`Payout ${payout.account} ${Math.round(payoutReceived(payout))}`);
    let path = normalizePath(`${folder}/${payout.date} ${title}.png`);
    for (let k = 2; this.app.vault.getAbstractFileByPath(path); k++) path = normalizePath(`${folder}/${payout.date} ${title} ${k}.png`);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const file = await this.app.vault.createBinary(path, await blob.arrayBuffer());
    this.refreshViews();
    return file;
  }

  /** Records a payout taken from an account: the amount comes off the account's balance, and what you receive
   *  (after the firm's split) counts in your payouts on the dashboard and in the lobby. Returns what you receive. */
  async recordPayout(account, amount, date, split = 100) {
    const received = Math.round(amount * split) / 100;
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const payout = { id, date, account, amount, received, split };
    this.settings.payouts = [...(this.settings.payouts || []), payout];
    await this.saveData(this.settings);
    this.refreshViews();
    new CertificateModal(this.app, this, payout).open();
    return received;
  }

  /** Adds a challenge cost ({ date, account, firm, kind, amount, note }), or replaces the one with the same id.
   *  Costs count in the challenge tracker only; they never change an account's balance. Returns the saved cost. */
  async saveCost(cost) {
    const list = this.settings.costs || [];
    const next = { ...cost, id: cost.id || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
    this.settings.costs = list.some((c) => c.id === next.id) ? list.map((c) => (c.id === next.id ? next : c)) : [...list, next];
    await this.saveData(this.settings);
    this.refreshViews();
    return next;
  }

  async deleteCost(id) {
    this.settings.costs = (this.settings.costs || []).filter((c) => c.id !== id);
    await this.saveData(this.settings);
    this.refreshViews();
  }

  /** Writes a group (items { file, trade }) into its first note and sends the other notes to the bin; their thesis and
   *  notes are added to the first note's Notes. kind 'pyramid' (adds closed together, oldest entry first) or
   *  'partial' (one entry closed in parts, first exit first). */
  async combineTradeNotes(items, kind = 'pyramid') {
    const partial = kind === 'partial';
    const [keep, ...rest] = [...items].sort((a, b) => (partial ? byExitMoment(a.trade, b.trade) : byEntryTime(a.trade, b.trade)));
    const merged = (partial ? mergePartialExits : mergePyramid)([keep, ...rest].map((x) => x.trade));
    const extra = [];
    for (const x of rest) {
      const s = noteSections(await this.app.vault.read(x.file));
      const text = [s.thesis, s.notes].filter(Boolean).join('\n\n');
      if (text) extra.push(partial ? `From the part closed at ${x.trade.exit}:\n${text}` : `From the add at ${x.trade.time}:\n${text}`);
    }
    await this.updateTradeNote(keep.file, merged);
    await this.app.fileManager.processFrontMatter(keep.file, (fm) => {
      if (partial) fm.exits = merged.exits; else fm.entries = merged.entries;
      const drawn = rest.find((x) => x.trade.chart);
      if (!fm.chart && drawn) fm.chart = drawn.trade.chart;
    });
    if (extra.length) await this.app.vault.process(keep.file, (content) => withNotesAdded(content, extra.join('\n\n')));
    for (const x of rest) await this.app.vault.trash(x.file, true);
  }

  async saveReview(file, answers) {
    if (!(file instanceof TFile)) return;
    await this.app.vault.process(file, (content) => withReviewSection(content, answers));
    await this.app.fileManager.processFrontMatter(file, (fm) => { fm.reviewed = true; });
  }
}

