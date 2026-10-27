// ---------- playlists: Favorites and your own, of YouTube and SoundCloud links ----------
const FAV_ID = 'favorites';
/** A link that is a whole collection (a YouTube playlist, a SoundCloud set, profile or likes): it plays on in its
 *  own order, so a playlist of ours moves to its next item only when the collection itself is left. */
const isCollectionLink = (link) => {
  const s = String(link || '');
  // a link to one video that also names a list (a "mix" or the list it was opened from) is that one video
  if (/youtube\.com|youtu\.be/i.test(s)) return /[?&]list=/.test(s) && !/[?&]v=|youtu\.be\/[\w-]{11}/.test(s);
  const m = s.match(/soundcloud\.com\/([^?#]*)/i);
  if (!m) return false;
  const parts = m[1].split('/').filter(Boolean);
  return parts.length === 1 || parts.includes('sets') || parts.includes('likes') || parts.includes('tracks');
};
const musicSourceOf = (link) => MUSIC_SOURCES.find((s) => s.owns && s.owns.test(String(link || '').trim())) || null;


// Radio: stations come from Radio Browser (radio-browser.info), an open, free directory of internet radio. Only
// the list is fetched from it; the sound comes straight from each station.
const RADIO_API = 'https://de1.api.radio-browser.info/json/stations/search';
const RADIO_TAGS = ['lofi', 'chillout', 'ambient', 'jazz', 'classical', 'piano', 'instrumental', 'electronic'];
const MUSIC_EXTS = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'flac', 'opus'];

/** Whether this is desktop Obsidian, where a pane can hold a whole website (with its sign-in), not only a player. */
const canBrowse = () => { try { return typeof window.require === 'function' && !!window.require('electron'); } catch (e) { return false; } };

// Google Chrome (or Edge, Brave) on this computer, started by the plugin with a profile of its own and driven
// through a private pipe. Google refuses to sign anyone in inside an app's built-in browser, Obsidian included;
// a real browser it accepts. So with this the YouTube player plays in a real Chrome window, where you can sign in
// (Premium included), and the pane shows and controls it. Nothing is hidden from Google: it is an ordinary Chrome.
// The pipe belongs to this one Chrome process and to Obsidian: no port is opened, so nothing else on the computer
// can drive that browser. The profile is kept outside the vault, so a synced vault never carries the sign-in.
class ChromeLink {
  constructor() {
    this.proc = null;
    this.session = '';
    this.target = '';
    this.next = 1;
    this.waiting = new Map();
    this.pending = '';
  }

  /** The browsers of this kind found on this computer, as [{ name, path }] (Chrome first). */
  static browsers() {
    try {
      const fs = window.require('fs');
      const path = window.require('path');
      const home = window.require('os').homedir();
      const env = process.env;
      const places = process.platform === 'darwin' ? [
        ['Chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'], ['Chrome', path.join(home, 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome')],
        ['Brave', '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'], ['Brave', path.join(home, 'Applications/Brave Browser.app/Contents/MacOS/Brave Browser')],
        ['Edge', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'], ['Chromium', '/Applications/Chromium.app/Contents/MacOS/Chromium'],
        ['Helium', '/Applications/Helium.app/Contents/MacOS/Helium'], ['Helium', path.join(home, 'Applications/Helium.app/Contents/MacOS/Helium')],
      ] : process.platform === 'win32' ? [
        ['Chrome', path.join(env.ProgramFiles || '', 'Google/Chrome/Application/chrome.exe')], ['Chrome', path.join(env['ProgramFiles(x86)'] || '', 'Google/Chrome/Application/chrome.exe')],
        ['Chrome', path.join(env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe')],
        ['Brave', path.join(env.ProgramFiles || '', 'BraveSoftware/Brave-Browser/Application/brave.exe')], ['Brave', path.join(env.LOCALAPPDATA || '', 'BraveSoftware/Brave-Browser/Application/brave.exe')],
        ['Edge', path.join(env['ProgramFiles(x86)'] || '', 'Microsoft/Edge/Application/msedge.exe')], ['Edge', path.join(env.ProgramFiles || '', 'Microsoft/Edge/Application/msedge.exe')],
      ] : [['Chrome', '/usr/bin/google-chrome'], ['Chrome', '/usr/bin/google-chrome-stable'], ['Brave', '/usr/bin/brave-browser'], ['Edge', '/usr/bin/microsoft-edge'], ['Chromium', '/usr/bin/chromium'], ['Chromium', '/usr/bin/chromium-browser']];
      const found = [];
      for (const [name, place] of places) if (place && !found.some((b) => b.name === name) && fs.existsSync(place)) found.push({ name, path: place });
      return found;
    } catch (e) {
      return [];
    }
  }

  /** The browser in use: the one picked in the pane (ChromeLink.choice) when it is installed, else the first found. */
  static browser() {
    const found = ChromeLink.browsers();
    return found.find((b) => b.name === ChromeLink.choice) || found[0] || null;
  }

  static binary() {
    const browser = ChromeLink.browser();
    return browser ? browser.path : '';
  }

  /** Where that browser keeps its own profile (its sign-in): a folder of the computer, not of the vault, and
   *  one per browser (two browsers cannot share a profile). */
  static profile() {
    const path = window.require('path');
    const home = window.require('os').homedir();
    const browser = ChromeLink.browser();
    const name = browser && browser.name !== 'Chrome' ? `True Journal Music ${browser.name}` : 'True Journal Music';
    if (process.platform === 'darwin') return path.join(home, 'Library/Application Support', name);
    if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || home, name);
    return path.join(home, '.config', name.toLowerCase().replace(/ /g, '-'));
  }

  get running() { return !!this.proc && !!this.session; }

  /** Starts the browser at `url` (once) and takes hold of its page. Resolves to whether it is running. Asked
   *  again while it is still starting (two Music panes, or a redraw), it gives the same answer as the first
   *  call rather than "not running". */
  start(url) {
    if (this.running) return Promise.resolve(true);
    if (!this.startup) {
      this.startup = this.begin(url).then((ok) => { this.startup = null; return ok; }, () => { this.startup = null; return false; });
    }
    return this.startup;
  }

  async begin(url) {
    if (this.proc) this.stop(); // a browser that never answered: start over
    const binary = ChromeLink.binary();
    if (!binary) return false;
    const { spawn } = window.require('child_process');
    const proc = spawn(binary, [
      // no window at all: the browser only plays, and the pane is its face. (Signing in has a window: see signIn.)
      `--user-data-dir=${ChromeLink.profile()}`, '--headless=new', '--remote-debugging-pipe', '--no-first-run', '--no-default-browser-check',
      '--autoplay-policy=no-user-gesture-required', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
      '--window-size=1100,760', url || 'https://www.youtube.com/',
    ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
    this.proc = proc;
    proc.on('exit', () => { if (this.proc === proc) this.reset(); });
    proc.on('error', () => { if (this.proc === proc) this.reset(); });
    proc.stdio[4].on('data', (chunk) => this.read(chunk));
    try {
      // the browser needs a moment before its first page exists
      for (let tries = 0; tries < 40 && this.proc === proc && !this.target; tries++) {
        const got = await this.send('Target.getTargets');
        const page = got && (got.targetInfos || []).find((t) => t.type === 'page');
        if (page) this.target = page.targetId; else await new Promise((resolve) => window.setTimeout(resolve, 250));
      }
      if (!this.target) return false;
      const attached = await this.send('Target.attachToTarget', { targetId: this.target, flatten: true });
      this.session = (attached && attached.sessionId) || '';
      return this.running;
    } catch (e) {
      return false;
    }
  }

  reset() {
    this.proc = null;
    this.session = '';
    this.target = '';
    this.pending = '';
    for (const done of this.waiting.values()) done(null);
    this.waiting.clear();
  }

  /** Messages arrive as JSON texts, each ended by a zero byte. */
  read(chunk) {
    this.pending += chunk.toString('utf8');
    for (let end = this.pending.indexOf('\0'); end >= 0; end = this.pending.indexOf('\0')) {
      const text = this.pending.slice(0, end);
      this.pending = this.pending.slice(end + 1);
      try {
        const message = JSON.parse(text);
        const done = message.id && this.waiting.get(message.id);
        if (done) { this.waiting.delete(message.id); done(message.error ? null : message.result || {}); }
      } catch (e) {
        // not a message: skipped
      }
    }
  }

  /** One request to the browser; resolves to its answer, or null when it failed or the browser is gone. */
  send(method, params, session) {
    if (!this.proc) return Promise.resolve(null);
    const id = this.next++;
    return new Promise((resolve) => {
      this.waiting.set(id, resolve);
      window.setTimeout(() => { if (this.waiting.delete(id)) resolve(null); }, 8000);
      try {
        this.proc.stdio[3].write(`${JSON.stringify({ id, method, params: params || {}, ...(session ? { sessionId: session } : {}) })}\0`);
      } catch (e) {
        this.waiting.delete(id);
        resolve(null);
      }
    });
  }

  /** Runs a script in the page and resolves to what it returns (null when it could not run). */
  async evaluate(code) {
    if (!this.running) return null;
    const got = await this.send('Runtime.evaluate', { expression: code, returnByValue: true, awaitPromise: true }, this.session);
    return got && got.result && !got.exceptionDetails ? (got.result.value === undefined ? null : got.result.value) : null;
  }

  navigate(url) {
    if (this.running) this.send('Page.navigate', { url }, this.session);
  }

  /** Opens the same profile as a plain Chrome, with nothing attached to it, for signing in to Google. A browser
   *  that is being driven says so to every page, and Google does not sign anyone in on one; so the sign-in is
   *  done here, by hand, in an ordinary window, and the player takes the browser up again afterwards (the profile
   *  keeps the sign-in). Resolves once the window is opening. */
  async signIn() {
    this.stop();
    await new Promise((resolve) => window.setTimeout(resolve, 900)); // let the driven browser let go of the profile
    const binary = ChromeLink.binary();
    if (!binary || this.login) return !!this.login;
    const { spawn } = window.require('child_process');
    const login = spawn(binary, [
      `--user-data-dir=${ChromeLink.profile()}`, '--no-first-run', '--no-default-browser-check', '--window-size=1100,760',
      'https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2F',
    ], { stdio: 'ignore' });
    this.login = login;
    const gone = () => { if (this.login === login) { this.login = null; if (this.onSignInClosed) this.onSignInClosed(); } };
    login.on('exit', gone);
    login.on('error', gone);
    return true;
  }

  /** Closes the sign-in window (the profile keeps the sign-in). Resolves when that browser has quit. */
  endSignIn() {
    const login = this.login;
    if (!login) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => window.setTimeout(resolve, 600);
      login.once('exit', done);
      window.setTimeout(resolve, 6000);
      try { login.kill(); } catch (e) { done(); }
    });
  }

  stop() {
    const proc = this.proc;
    this.reset();
    if (proc) { try { proc.kill(); } catch (e) { /* already gone */ } }
  }

  /** Everything this plugin started, closed (the plugin is being turned off). */
  quit() {
    this.stop();
    if (this.login) { try { this.login.kill(); } catch (e) { /* already gone */ } }
    this.login = null;
  }
}

// A pane for music while you journal: your own files as a playlist, or the player of
// YouTube from a pasted link. It keeps playing while you work in the other panes.
class MusicView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType() { return MUSIC_VIEW_TYPE; }
  getDisplayText() { return tx('Music'); }
  getIcon() { return 'music'; }

  async onOpen() {
    this.register(keepLocalized(this.contentEl));
    playEnter(this.contentEl);
    this.render();
  }

  /** YouTube as a music player: the video's cover, its title, a time line and Previous / Play / Next, with a
   *  queue that plays on by itself and a search. The YouTube page itself plays in the pane, tucked away (the way
   *  a tab plays in the background); "Show video" brings it into view. Nothing is downloaded and the page is not
   *  changed: it is only asked to play, pause, skip, seek and search, and what it plays (advertisements
   *  included) is YouTube's own. Everything here updates in place: redrawing the pane would restart the page. */
  renderYouTubePlayer(root, source, links) {
    const settings = this.plugin.settings;
    const save = () => this.plugin.saveData(settings);
    const watch = (id) => `https://www.youtube.com/watch?v=${id}`;
    if (!Array.isArray(settings.ytQueue)) settings.ytQueue = [];

    const bar = root.createDiv({ cls: 'tvj-options tvj-youtube-bar' });
    const input = bar.createEl('input', { type: 'text', cls: 'tvj-prompt', attr: { placeholder: 'Paste a YouTube link, or type to search', 'aria-label': 'Paste a YouTube link, or type to search' } });
    const playButton = bar.createEl('button', { text: 'Play', cls: 'mod-cta' });
    const queueButton = bar.createEl('button', { text: '+ Queue' });

    const card = root.createDiv({ cls: 'tvj-card tvj-player' });
    const cover = card.createEl('img', { cls: 'tvj-player-cover', attr: { alt: '' } });
    const info = card.createDiv({ cls: 'tvj-player-info' });
    const title = info.createDiv({ cls: 'tvj-music-now-title', text: links.length ? '…' : 'Paste a YouTube link above to start.' });
    const artist = info.createDiv({ cls: 'tvj-muted' });
    const line = info.createDiv({ cls: 'tvj-player-line', attr: { role: 'slider', 'aria-label': 'Position in the song', tabindex: '0' } });
    const fill = line.createDiv({ cls: 'tvj-player-fill' });
    const times = info.createDiv({ cls: 'tvj-player-times' });
    const at = times.createSpan({ text: '0:00' });
    const total = times.createSpan({ text: '0:00' });
    const keys = info.createDiv({ cls: 'tvj-options tvj-music-keys' });
    const previous = keys.createEl('button', { text: 'Previous' });
    const toggle = keys.createEl('button', { text: 'Play', cls: 'mod-cta' });
    const next = keys.createEl('button', { text: 'Next' });
    const reveal = keys.createEl('button', { text: 'Show video' });
    this.plugin.mountSaveButtons(keys, this, 'tvj-music-save');
    this.plugin.mountLyrics(info, this, true);

    const resultsBox = root.createDiv({ cls: 'tvj-player-results' });
    const queueBox = root.createDiv({ cls: 'tvj-player-queue' });

    // What plays the YouTube page: a page tucked away in this pane (no sign-in possible: Google refuses built-in
    // browsers), or a real Chrome window run by the plugin (see ChromeLink), where signing in works.
    ChromeLink.choice = settings.ytBrowser || '';
    const withChrome = !!settings.ytChrome && !!ChromeLink.binary();
    // Opening the pane does not start the last song by itself (YouTube would autoplay it): the page opens blank and
    // the song waits on the card until Play. Settings → "Resume music when the Music pane opens" brings it back.
    const autoplay = !!this.autoplayOnce;
    this.autoplayOnce = false;
    const resume = !!settings.musicResume;
    const lastTarget = links.length ? youtubeTarget(links[0]) : null;
    let waiting = !resume && lastTarget && lastTarget.video ? lastTarget.video : '';
    const firstPage = resume && links[0] ? links[0] : 'about:blank';
    const mode = root.createDiv({ cls: 'tvj-options tvj-player-mode' });
    mode.createEl('button', { text: withChrome ? 'Use the built-in player' : 'Sign in with Chrome (Premium)' }).addEventListener('click', async () => {
      if (!withChrome && !ChromeLink.binary()) { notify('Google Chrome was not found on this computer.'); return; }
      settings.ytChrome = !withChrome;
      await save();
      if (withChrome) this.plugin.chromeLink().stop();
      this.render();
    });
    const signingIn = withChrome && !!this.plugin.chromeLink().login;
    // which browser plays: every one of this kind that is installed can be picked
    const browsers = ChromeLink.browsers();
    if (withChrome && !signingIn && browsers.length > 1) {
      const pick = mode.createEl('select', { cls: 'dropdown', attr: { 'aria-label': 'Browser that plays the music' } });
      for (const b of browsers) pick.createEl('option', { text: b.name, value: b.name });
      pick.value = (ChromeLink.browser() || browsers[0]).name;
      pick.addEventListener('change', async () => {
        this.plugin.chromeLink().quit();
        settings.ytBrowser = pick.value;
        await save();
        window.setTimeout(() => this.render(), 900);
      });
    }
    if (withChrome && !signingIn) {
      mode.createEl('button', { text: 'Sign in to Google' }).addEventListener('click', async () => {
        const chrome = this.plugin.chromeLink();
        chrome.onSignInClosed = () => { if (this.contentEl.isConnected) this.render(); };
        await chrome.signIn();
        this.render();
      });
    }
    if (signingIn) {
      mode.createEl('button', { text: 'I have signed in', cls: 'mod-cta' }).addEventListener('click', async () => {
        await this.plugin.chromeLink().endSignIn();
        this.render();
      });
    }
    mode.createSpan({ cls: 'tvj-muted', text: signingIn ? 'A Chrome window is open: sign in to YouTube there, then press "I have signed in".' : withChrome ? 'Playing through a browser on this computer, without a window. "Sign in to Google" opens one window, once, for signing in.' : 'Playing inside this pane, without an account.' });

    let ask, navigate, show, alive;
    if (withChrome) {
      const chrome = this.plugin.chromeLink();
      this.site = null;
      this.siteKey = source.key;
      // the browser has no window: there is nothing to show or hide, the pane is all there is to see
      let starting = null;
      const ensure = () => (chrome.login ? Promise.resolve(false) : chrome.running ? Promise.resolve(true) : (starting = starting || chrome.start(firstPage).then((ok) => { starting = null; if (!ok) notify('Chrome could not be started.'); return ok; })));
      ask = (code) => (chrome.running ? chrome.evaluate(code) : Promise.resolve(null));
      navigate = (url) => ensure().then((ok) => { if (ok) chrome.navigate(url); });
      show = () => {};
      alive = () => root.isConnected;
      reveal.remove();
      ensure();
    } else {
      const stage = root.createDiv({ cls: 'tvj-music-site tvj-player-page is-away' });
      const site = document.createElement('webview');
      site.setAttribute('src', firstPage);
      site.setAttribute('partition', 'persist:tvj-music');
      site.setAttribute('useragent', navigator.userAgent.replace(/\s?(obsidian|Electron)\/[\d.]+/gi, ''));
      stage.appendChild(site);
      this.site = site;
      this.siteKey = source.key;
      show = (on) => {
        stage.classList.toggle('is-away', !on);
        reveal.setText(tx(on ? 'Hide video' : 'Show video'));
      };
      reveal.addEventListener('click', () => show(stage.classList.contains('is-away')));
      let ready = false;
      site.addEventListener('dom-ready', () => { ready = true; });
      ask = (code) => (ready ? site.executeJavaScript(code, true).catch(() => null) : Promise.resolve(null));
      navigate = (url) => site.setAttribute('src', url);
      alive = () => site.isConnected;
    }
    this.driver = { navigate };
    const clock = (seconds) => { const t = Math.max(0, Math.floor(seconds || 0)); const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60); return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(t % 60).padStart(2, '0')}`; };
    const go = (id) => {
      if (this.plugin.linkEl) this.plugin.linkEl.pause();
      settings.musicLinks = { ...(settings.musicLinks || {}), youtube: [watch(id), ...((settings.musicLinks || {}).youtube || []).filter((x) => x !== watch(id))].slice(0, 12) };
      save();
      ended = '';
      asked = Date.now();
      navigate(watch(id));
    };

    // ---- the queue: plays on by itself when a video ends ----
    const titleOf = async (id) => {
      // the video's real title, from YouTube's own "oEmbed" address (made for showing a link's title)
      try {
        const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch(id))}`;
        const data = typeof requestUrl === 'function' ? (await requestUrl({ url })).json : await (await fetch(url)).json();
        return data && data.title ? { title: String(data.title).slice(0, 160), by: String(data.author_name || '').slice(0, 80) } : null;
      } catch (e) {
        return null;
      }
    };
    const paintQueue = () => {
      queueBox.empty();
      const queue = settings.ytQueue;
      if (!queue.length) return;
      const head = queueBox.createDiv({ cls: 'tvj-player-head' });
      head.createDiv({ cls: 'tvj-card-title', text: 'Queue' });
      head.createEl('button', { text: 'Clear' }).addEventListener('click', () => { settings.ytQueue = []; save(); paintQueue(); });
      const list = queueBox.createDiv({ cls: 'tvj-music-list' });
      queue.forEach((item, i) => {
        const row = list.createDiv({ cls: `tvj-music-row ${state && state.id === item.id ? 'is-playing' : ''}` });
        const b = row.createEl('button', { cls: 'tvj-music-track', attr: { 'aria-label': `Play ${item.title || item.id}` } });
        b.createEl('img', { cls: 'tvj-player-thumb', attr: { src: `https://i.ytimg.com/vi/${item.id}/default.jpg`, alt: '', loading: 'lazy' } });
        const words = b.createSpan({ cls: 'tvj-player-words' });
        words.createSpan({ cls: 'tvj-music-name', text: item.title || watch(item.id) });
        if (item.by) words.createSpan({ cls: 'tvj-music-n', text: item.by });
        b.addEventListener('click', () => go(item.id));
        row.createEl('button', { text: '×', cls: 'tvj-music-remove', attr: { 'aria-label': 'Remove from the queue' } }).addEventListener('click', () => { settings.ytQueue = settings.ytQueue.filter((_x, k) => k !== i); save(); paintQueue(); });
      });
    };
    const enqueue = async (id, known) => {
      if (settings.ytQueue.some((x) => x.id === id)) return;
      const item = { id, title: known && known.title ? known.title : '', by: known && known.by ? known.by : '' };
      settings.ytQueue = [...settings.ytQueue, item].slice(-100);
      save();
      paintQueue();
      if (!item.title) {
        const got = await titleOf(id);
        if (got) { item.title = got.title; item.by = got.by; save(); paintQueue(); }
      }
    };
    /** The queue item after the one playing (the first one when what plays is not in the queue). */
    const following = () => {
      const queue = settings.ytQueue;
      if (!queue.length) return null;
      const here = state ? queue.findIndex((x) => x.id === state.id) : -1;
      return here + 1 < queue.length ? queue[here + 1] : null;
    };

    // ---- what the page is playing, read once a second ----
    const wantVolume = () => { const v = Number(this.plugin.settings.musicVolume); return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1; };
    // The loudness is set on YouTube's own player, which keeps it from one video to the next and evens out loud
    // and quiet videos itself. Set on the <video> alone it was undone by the player with every new video, so the
    // sound jumped until the next reading put it back. (The <video> is the fallback where there is no player.)
    const setVolume = (share) => ask(`(() => { const s = ${Math.max(0, Math.min(1, share)).toFixed(3)}; const p = document.getElementById('movie_player'); const v = document.querySelector('video'); if (p && p.setVolume) { if (p.unMute) p.unMute(); p.setVolume(Math.round(s * 100)); } else if (v) { v.muted = false; v.volume = s; } })()`);
    const READ = `(() => { const v = document.querySelector('video'); const p = document.getElementById('movie_player'); const m = navigator.mediaSession && navigator.mediaSession.metadata; return { id: new URLSearchParams(location.search).get('v') || '', title: (m && m.title) || document.title.replace(/ - YouTube$/, ''), artist: (m && m.artist) || '', duration: v && isFinite(v.duration) ? v.duration : 0, time: v ? v.currentTime : 0, paused: v ? v.paused : true, ended: v ? v.ended : false, volume: p && p.getVolume ? (p.isMuted && p.isMuted() ? 0 : p.getVolume() / 100) : v ? (v.muted ? 0 : v.volume) : -1, ad: !!document.querySelector('.ad-showing') }; })()`;
    let state = null;
    let ended = ''; // the video whose end has been acted on already
    let asked = 0; // when a video was last asked for: one that does not start by itself gets one nudge
    const paint = (st) => {
      const changed = !state || !st || state.id !== st.id;
      state = st;
      if (!st || !st.id) return;
      waiting = '';
      const art = `https://i.ytimg.com/vi/${st.id}/hqdefault.jpg`;
      if (cover.getAttribute('src') !== art) cover.setAttribute('src', art);
      // during an advertisement the page names the advertisement, not the song: say so plainly
      const name = st.ad ? tx('Advertisement') : st.title;
      const by = st.ad ? '' : st.artist;
      if (title.textContent !== name) title.setText(name);
      if (artist.textContent !== by) artist.setText(by);
      fill.style.width = `${st.duration ? Math.min(100, (st.time / st.duration) * 100) : 0}%`;
      at.setText(clock(st.time));
      total.setText(clock(st.duration));
      toggle.setText(tx(st.paused ? 'Play' : 'Pause'));
      this.plugin.setNowPlaying({ title: name, by, cover: art, link: st.ad ? '' : watch(st.id), playing: !st.paused, time: Math.floor(st.time), duration: Math.floor(st.duration) }, {
        toggle: () => toggle.click(), previous: () => previous.click(), next: () => next.click(),
        seek: (share) => { if (state && state.duration) ask(`(() => { const v = document.querySelector('video'); if (v) v.currentTime = ${(share * state.duration).toFixed(2)}; })()`); },
        volume: setVolume,
      });
      // the page sets its own loudness again with each new video: bring it back to the one chosen here
      if (st.volume >= 0 && Math.abs(st.volume - wantVolume()) > 0.02) setVolume(wantVolume());
      if (changed) paintQueue();
      if (asked && !st.paused) asked = 0;
      if (asked && st.paused && st.time < 1 && Date.now() - asked > 3000) {
        asked = 0;
        ask(`(() => { const v = document.querySelector('video'); if (v && v.paused) v.play().catch(() => {}); })()`);
      }
      // a playlist plays: YouTube's own "Up next" autoplay is switched off, so a video's end is ours to follow
      if (changed && !st.ad) ask(`(() => { const b = document.querySelector('.ytp-autonav-toggle-button[aria-checked="true"]'); if (b) b.click(); })()`);
      // a video the playlist did not start (a search result, the queue, YouTube's own page) ends the playlist run
      const run = this.plugin.playlistRun;
      if (run && changed && !st.ad && Date.now() - (this.plugin.playlistRunAt || 0) > 8000) {
        const list = this.plugin.playlists().find((p) => p.id === run.id);
        const item = list && list.items[run.index];
        const target = item ? youtubeTarget(item.link) : null;
        if (target && target.video && !target.list && target.video !== st.id) this.plugin.playlistRun = null;
      }
      // the video is over (and it was not an advertisement): the playlist goes on, or else the queue
      if (!st.ad && st.duration > 0 && (st.ended || st.time >= st.duration - 0.6) && ended !== st.id) {
        ended = st.id;
        if (!this.plugin.advancePlaylist(1)) {
          const item = this.plugin.playlistRun ? null : following();
          if (item) go(item.id);
        }
      }
    };
    if (waiting) {
      cover.setAttribute('src', `https://i.ytimg.com/vi/${waiting}/hqdefault.jpg`);
      const put = (k) => { if (waiting && k && !(state && state.id)) { title.setText(k.title || ''); artist.setText(k.by || ''); } };
      const known = settings.ytQueue.find((x) => x.id === waiting);
      if (known && known.title) put(known);
      else titleOf(waiting).then(put);
    }
    this.ytTimer = window.setInterval(() => { if (alive()) ask(READ).then(paint); else window.clearInterval(this.ytTimer); }, 1000);
    this.registerInterval(this.ytTimer);

    toggle.addEventListener('click', () => {
      if (waiting && !(state && state.id)) { const id = waiting; waiting = ''; go(id); return; }
      ask(`(() => { const v = document.querySelector('video'); if (v) { if (v.paused) v.play(); else v.pause(); } })()`).then(() => ask(READ).then(paint));
    });
    next.addEventListener('click', () => {
      // a playlist first; inside a YouTube playlist link, YouTube's own Next; then the queue
      if (this.plugin.advancePlaylist(1)) return;
      const item = this.plugin.playlistRun ? null : following();
      if (item) go(item.id);
      else ask(`(() => { const b = document.querySelector('.ytp-next-button'); if (b) b.click(); })()`);
    });
    previous.addEventListener('click', () => {
      const queue = settings.ytQueue;
      const here = state ? queue.findIndex((x) => x.id === state.id) : -1;
      if (state && state.time <= 4 && this.plugin.playlistRun && this.plugin.advancePlaylist(-1)) return;
      if (state && state.time <= 4 && here > 0 && !this.plugin.playlistRun) { go(queue[here - 1].id); return; }
      ask(`(() => { const v = document.querySelector('video'); const b = document.querySelector('.ytp-prev-button'); if (v && v.currentTime > 4) v.currentTime = 0; else if (b && b.offsetParent) b.click(); else if (v) v.currentTime = 0; })()`);
    });
    const seek = (clientX) => {
      if (!state || !state.duration) return;
      const box = line.getBoundingClientRect();
      const to = Math.max(0, Math.min(1, (clientX - box.left) / box.width)) * state.duration;
      fill.style.width = `${(to / state.duration) * 100}%`;
      ask(`(() => { const v = document.querySelector('video'); if (v) v.currentTime = ${to.toFixed(2)}; })()`);
    };
    line.addEventListener('pointerdown', (e) => seek(e.clientX));
    line.addEventListener('keydown', (e) => {
      if (!state || !state.duration || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      const to = Math.max(0, Math.min(state.duration, state.time + (e.key === 'ArrowRight' ? 5 : -5)));
      ask(`(() => { const v = document.querySelector('video'); if (v) v.currentTime = ${to.toFixed(2)}; })()`);
    });

    // ---- search: YouTube's own search page is opened in the pane, and its results are listed here ----
    const LIST = `(() => [...document.querySelectorAll('ytd-video-renderer')].slice(0, 20).map((el) => { const a = el.querySelector('a#video-title'); const id = a ? (new URL(a.href, location.href).searchParams.get('v') || '') : ''; const by = el.querySelector('ytd-channel-name a, #channel-name a'); const len = el.querySelector('ytd-thumbnail-overlay-time-status-renderer, .badge-shape-wiz__text'); return { id, title: a ? (a.getAttribute('title') || a.textContent || '').trim() : '', by: by ? by.textContent.trim() : '', length: len ? len.textContent.trim().split(/\\s*\\n\\s*/)[0] : '' }; }).filter((x) => x.id && x.title))()`;
    let searching = 0;
    const search = (words) => {
      const turn = ++searching;
      resultsBox.empty();
      resultsBox.createEl('p', { cls: 'tvj-muted', text: 'Searching YouTube…' });
      const playing = state && !state.paused;
      navigate(`https://www.youtube.com/results?search_query=${encodeURIComponent(words)}`);
      let tries = 0;
      const look = () => {
        if (turn !== searching || !alive()) return;
        ask(LIST).then((found) => {
          if (turn !== searching) return;
          if ((!found || !found.length) && ++tries < 12) { window.setTimeout(look, 700); return; }
          resultsBox.empty();
          if (!found || !found.length) {
            // the page did not give a list we can read: show YouTube's own page to pick from
            resultsBox.createEl('p', { cls: 'tvj-muted', text: 'Pick a video on the YouTube page below.' });
            show(true);
            return;
          }
          const head = resultsBox.createDiv({ cls: 'tvj-player-head' });
          head.createDiv({ cls: 'tvj-card-title', text: 'Results' });
          head.createEl('button', { text: 'Close' }).addEventListener('click', () => { searching++; resultsBox.empty(); });
          const list = resultsBox.createDiv({ cls: 'tvj-music-list' });
          for (const item of found) {
            const row = list.createDiv({ cls: 'tvj-music-row' });
            const b = row.createEl('button', { cls: 'tvj-music-track', attr: { 'aria-label': `Play ${item.title}` } });
            b.createEl('img', { cls: 'tvj-player-thumb', attr: { src: `https://i.ytimg.com/vi/${item.id}/default.jpg`, alt: '', loading: 'lazy' } });
            const text = b.createSpan({ cls: 'tvj-player-words' });
            text.createSpan({ cls: 'tvj-music-name', text: item.title });
            text.createSpan({ cls: 'tvj-music-n', text: [item.by, item.length].filter(Boolean).join(' · ') });
            b.addEventListener('click', () => go(item.id));
            row.createEl('button', { text: '+', cls: 'tvj-music-remove', attr: { 'aria-label': 'Add to the queue' } }).addEventListener('click', () => enqueue(item.id, item));
          }
        });
      };
      window.setTimeout(look, 1200);
      if (playing) notify('The search uses the player\'s page, so the song stopped. Pick a result to go on.');
    };

    const typed = () => input.value.trim();
    const submit = (toQueue) => {
      const text = typed();
      if (!text) return;
      const target = youtubeTarget(text) || (/^[\w-]{11}$/.test(text) ? { video: text, list: '' } : null);
      if (!target) { search(text); return; }
      input.value = '';
      if (target.video && toQueue) { enqueue(target.video); return; }
      if (target.video && !target.list) { go(target.video); return; }
      // a playlist: YouTube's own page runs it
      const link = /^https?:\/\//.test(text) ? text : watch(target.video);
      this.openLink(source, link);
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(e.shiftKey); });
    playButton.addEventListener('click', () => submit(false));
    queueButton.addEventListener('click', () => submit(true));

    paintQueue();
    // a song picked from a playlist (or reached by Next) starts at once, with the same nudge a picked video gets
    if (autoplay && links[0]) {
      const t = youtubeTarget(links[0]);
      waiting = '';
      if (t && t.video && !t.list) go(t.video);
      else { asked = Date.now(); navigate(links[0]); }
    }
  }

  // ---- sound that plays in the pane itself: a radio station or one of your files ----

  /** The pane's one player. It lives outside the redraw, so the sound goes on when the screen is drawn again. */
  player() {
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.controls = true;
      this.audio.className = 'tvj-music-audio';
      { const v = Number(this.plugin.settings.musicVolume); this.audio.volume = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1; }
      this.audio.addEventListener('play', () => { if (this.plugin.linkEl) this.plugin.linkEl.pause(); });
      this.audio.addEventListener('ended', () => { if (this.playing && this.playing.kind === 'file') this.playFile(this.playing.index + 1); });
      this.audio.addEventListener('error', () => { if (this.playing && this.playing.kind === 'radio') notify('That station could not be played. Try another one.'); });
      const report = () => {
        if (!this.playing) return;
        const audio = this.audio;
        const file = this.playing.kind === 'file';
        this.plugin.setNowPlaying({ title: this.playing.label, by: tx(file ? 'My music' : 'Radio'), cover: '', playing: !audio.paused, time: Math.floor(audio.currentTime || 0), duration: file && Number.isFinite(audio.duration) ? Math.floor(audio.duration) : 0 }, {
          toggle: () => { if (audio.paused) audio.play().catch(() => {}); else audio.pause(); },
          volume: (share) => { audio.volume = Math.max(0, Math.min(1, share)); },
          ...(file ? { previous: () => this.playFile(this.playing.index - 1), next: () => this.playFile(this.playing.index + 1), seek: (share) => { if (Number.isFinite(audio.duration)) audio.currentTime = share * audio.duration; } } : {}),
        });
      };
      let lastSecond = -1;
      this.audio.addEventListener('timeupdate', () => { const second = Math.floor(this.audio.currentTime || 0); if (second !== lastSecond) { lastSecond = second; report(); } });
      for (const event of ['play', 'playing', 'pause', 'loadstart']) this.audio.addEventListener(event, report);
      this.register(() => { this.audio.pause(); if (this.audioUrl) URL.revokeObjectURL(this.audioUrl); });
    }
    return this.audio;
  }

  /** The player with what it is playing, placed into the pane. */
  showPlayer(root) {
    if (!this.audio || !this.playing) return;
    const now = root.createDiv({ cls: 'tvj-card tvj-music-playing' });
    now.createDiv({ cls: 'tvj-music-now-service', text: this.playing.kind === 'radio' ? 'Radio' : 'My music' });
    now.createDiv({ cls: 'tvj-music-now-title', text: this.playing.label });
    now.appendChild(this.audio);
  }

  playStation(station) {
    const audio = this.player();
    this.playing = { kind: 'radio', label: station.name, id: station.id };
    audio.src = station.url;
    audio.play().catch(() => {});
    this.render();
  }

  async loadStations(tag) {
    const url = `${RADIO_API}?tag=${encodeURIComponent(tag)}&limit=40&order=clickcount&reverse=true&hidebroken=true&is_https=true`;
    let rows = [];
    if (typeof requestUrl === 'function') rows = (await requestUrl({ url, headers: { 'User-Agent': 'TrueJournal-Obsidian' } })).json;
    else rows = await (await fetch(url)).json();
    const seen = new Set();
    return (Array.isArray(rows) ? rows : [])
      .filter((r) => r && r.name && /^https:\/\//.test(String(r.url_resolved || '')) && !seen.has(r.stationuuid) && seen.add(r.stationuuid))
      .map((r) => ({ id: String(r.stationuuid), name: String(r.name).trim().slice(0, 80), url: String(r.url_resolved), country: String(r.countrycode || ''), bitrate: Number(r.bitrate) || 0 }));
  }

  async toggleSaved(station) {
    const settings = this.plugin.settings;
    const saved = settings.radioSaved || [];
    settings.radioSaved = saved.some((x) => x.id === station.id) ? saved.filter((x) => x.id !== station.id) : [...saved, { id: station.id, name: station.name, url: station.url, country: station.country, bitrate: station.bitrate }].slice(-40);
    await this.plugin.saveData(settings);
    this.render();
  }

  renderRadio(root) {
    const settings = this.plugin.settings;
    const tag = RADIO_TAGS.includes(settings.radioTag) ? settings.radioTag : RADIO_TAGS[0];
    const saved = settings.radioSaved || [];
    const row = (list, station) => {
      const line = list.createDiv({ cls: `tvj-music-row ${this.playing && this.playing.id === station.id ? 'is-playing' : ''}` });
      const b = line.createEl('button', { cls: 'tvj-music-track', attr: { 'aria-label': `Play ${station.name}` } });
      b.createSpan({ cls: 'tvj-music-name', text: station.name });
      b.createSpan({ cls: 'tvj-music-n', text: [station.country, station.bitrate ? `${station.bitrate}k` : ''].filter(Boolean).join(' · ') });
      b.addEventListener('click', () => this.playStation(station));
      const kept = saved.some((x) => x.id === station.id);
      line.createEl('button', { text: kept ? '★' : '☆', cls: 'tvj-music-remove', attr: { 'aria-label': kept ? 'Remove from your stations' : 'Keep this station' } }).addEventListener('click', () => this.toggleSaved(station));
    };
    if (saved.length) {
      root.createDiv({ cls: 'tvj-card-title tvj-youtube-label', text: 'Your stations' });
      const mine = root.createDiv({ cls: 'tvj-music-list' });
      saved.forEach((station) => row(mine, station));
    }
    const tags = root.createDiv({ cls: 'tvj-options tvj-radio-tags' });
    for (const t of RADIO_TAGS) {
      tags.createEl('button', { text: t, cls: t === tag ? 'mod-cta' : '', attr: { 'aria-pressed': String(t === tag) } }).addEventListener('click', async () => {
        settings.radioTag = t;
        await this.plugin.saveData(settings);
        this.render();
      });
    }
    const list = root.createDiv({ cls: 'tvj-music-list' });
    const note = root.createEl('p', { cls: 'tvj-muted', text: 'Loading stations…' });
    this.stations = this.stations || {};
    const show = (stations) => {
      if (!list.isConnected) return;
      note.setText(tx(stations.length ? 'Stations come from Radio Browser, an open directory. Each station plays its own stream.' : 'No stations found for this style.'));
      stations.forEach((station) => row(list, station));
    };
    if (this.stations[tag]) show(this.stations[tag]);
    else this.loadStations(tag).then((stations) => { this.stations[tag] = stations; show(stations); }).catch(() => { if (note.isConnected) note.setText(tx('The station list could not be loaded. Check your connection.')); });
  }

  folder() {
    return normalizePath(`${this.plugin.settings.folder}/Music`);
  }

  /** Your music files, in name order: the playlist. */
  files() {
    const prefix = `${this.folder()}/`;
    return this.app.vault.getFiles().filter((f) => f.path.startsWith(prefix) && MUSIC_EXTS.includes(f.extension.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }

  async addFiles(picked) {
    await this.plugin.ensureFolder(this.folder());
    let added = 0;
    for (const file of picked) {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (!MUSIC_EXTS.includes(ext)) { notify(`Not a music file: ${file.name}`); continue; }
      if (file.size > 60 * 1024 * 1024) { notify(`Too large (over 60 MB): ${file.name}`); continue; }
      const base = safeName(file.name.replace(/\.[^.]+$/, '')) || 'Track';
      let path = normalizePath(`${this.folder()}/${base}.${ext}`);
      for (let n = 2; this.app.vault.getAbstractFileByPath(path); n++) path = normalizePath(`${this.folder()}/${base} ${n}.${ext}`);
      await this.app.vault.createBinary(path, await file.arrayBuffer());
      added++;
    }
    if (added) this.render();
  }

  /** Plays the file at `index` of the playlist; the next one follows by itself. */
  async playFile(index) {
    const list = this.files();
    if (!list.length) return;
    const at = ((index % list.length) + list.length) % list.length;
    const file = list[at];
    const audio = this.player();
    if (this.audioUrl) URL.revokeObjectURL(this.audioUrl);
    const ext = file.extension.toLowerCase();
    const type = ext === 'mp3' ? 'audio/mpeg' : ext === 'm4a' || ext === 'aac' ? 'audio/mp4' : ext === 'oga' || ext === 'opus' ? 'audio/ogg' : `audio/${ext}`;
    this.audioUrl = URL.createObjectURL(new Blob([await this.app.vault.readBinary(file)], { type }));
    this.playing = { kind: 'file', label: file.basename, index: at, id: file.path };
    audio.src = this.audioUrl;
    audio.play().catch(() => {});
    this.render();
  }

  renderFiles(root) {
    const list = this.files();
    const bar = root.createDiv({ cls: 'tvj-options' });
    const input = bar.createEl('input', { attr: { type: 'file', accept: 'audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac,.opus', multiple: 'true', hidden: 'true' } });
    input.addEventListener('change', () => { if (input.files && input.files.length) this.addFiles([...input.files]); });
    bar.createEl('button', { text: 'Add music', cls: 'mod-cta' }).addEventListener('click', () => input.click());
    const at = this.playing && this.playing.kind === 'file' ? this.playing.index : -1;
    if (list.length) {
      bar.createEl('button', { text: 'Previous' }).addEventListener('click', () => this.playFile(at - 1));
      bar.createEl('button', { text: 'Next' }).addEventListener('click', () => this.playFile(at + 1));
    }
    if (!list.length) {
      root.createEl('p', { cls: 'tvj-muted', text: 'Add your own music files to build a playlist. They are kept in the Music folder of your journal.' });
      return;
    }
    const tracks = root.createDiv({ cls: 'tvj-music-list' });
    list.forEach((file, i) => {
      const row = tracks.createDiv({ cls: `tvj-music-row ${this.playing && this.playing.id === file.path ? 'is-playing' : ''}` });
      const b = row.createEl('button', { cls: 'tvj-music-track', attr: { 'aria-label': `Play ${file.basename}` } });
      b.createSpan({ cls: 'tvj-music-n', text: String(i + 1).padStart(2, '0') });
      b.createSpan({ cls: 'tvj-music-name', text: file.basename });
      b.addEventListener('click', () => this.playFile(i));
      row.createEl('button', { text: '×', cls: 'tvj-music-remove', attr: { 'aria-label': `Remove ${file.basename}` } }).addEventListener('click', async () => {
        if (!ask(`Remove "${file.basename}" from your music? The file goes to the trash.`)) return;
        if (this.playing && this.playing.id === file.path) { this.audio.pause(); this.playing = null; }
        await this.app.vault.trash(file, true);
        this.render();
      });
    });
  }

  /** SoundCloud: its own player (no sign-in) for a pasted track, playlist or profile; the plugin follows it for the
   *  lobby's music card, the lyrics and the keys. The links you used stay below. */
  renderSoundCloud(root, source, links) {
    const bar = root.createDiv({ cls: 'tvj-options tvj-youtube-bar' });
    const input = bar.createEl('input', { type: 'text', cls: 'tvj-prompt', attr: { placeholder: source.hint, 'aria-label': source.hint } });
    const go = () => { if (input.value.trim()) { this.openLink(source, input.value.trim()); input.value = ''; } };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    bar.createEl('button', { text: 'Play', cls: 'mod-cta' }).addEventListener('click', go);
    this.plugin.mountSaveButtons(bar, this, 'tvj-music-save');
    if (!links.length) {
      root.createEl('p', { cls: 'tvj-muted', text: 'Paste a SoundCloud link: a track, a playlist or a profile. Public tracks play without signing in; Go+ tracks play a 30-second preview.' });
      return;
    }
    if (this.plugin.linkEl) this.plugin.linkEl.pause();
    const stage = root.createDiv({ cls: 'tvj-music-stage is-soundcloud' });
    this.autoplayOnce = false;
    const frame = stage.createEl('iframe', { attr: { src: source.embed(links[0]), allow: 'autoplay; encrypted-media', title: 'SoundCloud', scrolling: 'no' } });
    this.plugin.mountLyrics(root, this, true);
    this.followSoundCloud(frame);
    if (links.length > 1) {
      root.createDiv({ cls: 'tvj-card-title tvj-youtube-label', text: 'Your links' });
      const shelf = root.createDiv({ cls: 'tvj-music-list' });
      links.slice(1).forEach((link) => {
        const row = shelf.createDiv({ cls: 'tvj-music-row' });
        const b = row.createEl('button', { cls: 'tvj-music-track' });
        b.createSpan({ cls: 'tvj-music-name', text: link.replace(/^https?:\/\/(www\.|m\.)?soundcloud\.com\//, '').slice(0, 80) });
        b.addEventListener('click', () => this.openLink(source, link));
        row.createEl('button', { text: '×', cls: 'tvj-music-remove', attr: { 'aria-label': 'Remove this link' } }).addEventListener('click', () => this.removeLink(source, link));
      });
    }
  }

  /** Listens to the SoundCloud player in `frame` and reports what it plays (title, artist, cover, position), with
   *  keys that drive it, to the plugin. The player plays on its own; this only listens and steers. */
  followSoundCloud(frame) {
    const w = soundCloudWidget(frame);
    const E = SC_EVENTS;
    this.register(() => w.destroy());
    let sound = null, playing = false, time = 0;
    const wantVolume = () => { const v = Number(this.plugin.settings.musicVolume); return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1; };
    const report = () => {
      if (!frame.isConnected) return;
      if (!sound) { this.plugin.setNowPlaying(null); return; }
      const cover = String(sound.artwork_url || (sound.user && sound.user.avatar_url) || '').replace('-large', '-t500x500');
      this.plugin.nowStamp = Date.now();
      this.plugin.setNowPlaying({ title: sound.title || 'SoundCloud', by: (sound.user && sound.user.username) || '', cover, link: sound.permalink_url || '', playing, time: Math.floor(time), duration: Math.floor((sound.duration || 0) / 1000) }, {
        toggle: () => w.toggle(),
        previous: () => { if (!this.plugin.advancePlaylist(-1)) w.prev(); },
        next: () => lastInSet((last) => { if (this.plugin.advancePlaylist(1, last)) return; w.next(); }),
        seek: (share) => w.seekTo(Math.round(share * (sound.duration || 0))),
        volume: (share) => w.setVolume(Math.round(Math.max(0, Math.min(1, share)) * 100)),
      });
    };
    const current = () => w.getCurrentSound((s) => { sound = s || null; report(); });
    const lastInSet = (then) => w.getSounds((list) => w.getCurrentSoundIndex((i) => then(!Array.isArray(list) || list.length <= 1 || i >= list.length - 1)));
    w.bind(E.READY, () => { w.setVolume(Math.round(wantVolume() * 100)); current(); });
    w.bind(E.PLAY, () => { playing = true; current(); });
    w.bind(E.PAUSE, () => { playing = false; report(); });
    w.bind(E.FINISH, () => { playing = false; report(); lastInSet((last) => this.plugin.advancePlaylist(1, last)); });
    w.bind(E.SEEK, (e) => { time = (e.currentPosition || 0) / 1000; report(); });
    let last = 0;
    w.bind(E.PLAY_PROGRESS, (e) => {
      time = (e.currentPosition || 0) / 1000;
      if (Date.now() - last > 1000) { last = Date.now(); report(); }
    });
    this.register(() => { if (this.plugin.nowPlaying && this.plugin.nowPlaying.title === (sound && sound.title)) this.plugin.setNowPlaying(null); });
  }


  /** Paste a link: the sound of YouTube, SoundCloud and most other sites, played by the plugin itself (no ads, no
   *  sign-in), with a queue, the heart and "+", lyrics, and the lobby's music card. */
  renderLink(root) {
    const plugin = this.plugin;
    const bar = root.createDiv({ cls: 'tvj-options tvj-youtube-bar' });
    const input = bar.createEl('input', { type: 'text', cls: 'tvj-prompt', attr: { placeholder: 'Paste a link: a song or a playlist (YouTube, SoundCloud…)', 'aria-label': 'Paste a link' } });
    const take = (mode) => {
      const v = input.value.trim();
      if (!v) return;
      if (!/^https?:\/\//i.test(v)) { notify('Paste a link that starts with http.'); return; }
      input.value = '';
      plugin.linkOpen(v, mode);
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') take(e.shiftKey ? 'queue' : 'play'); });
    bar.createEl('button', { text: 'Play', cls: 'mod-cta' }).addEventListener('click', () => take('play'));
    bar.createEl('button', { text: '+ Queue' }).addEventListener('click', () => take('queue'));
    if (!plugin.linkReady()) {
      root.createEl('p', { cls: 'tvj-muted', text: 'This needs yt-dlp on this computer (see the plugin settings). On a phone, use the YouTube or SoundCloud tab.' });
      return;
    }
    const card = root.createDiv({ cls: 'tvj-card tvj-player' });
    const cover = card.createEl('img', { cls: 'tvj-player-cover', attr: { alt: '' } });
    const info = card.createDiv({ cls: 'tvj-player-info' });
    const title = info.createDiv({ cls: 'tvj-music-now-title' });
    const artist = info.createDiv({ cls: 'tvj-muted' });
    const line = info.createDiv({ cls: 'tvj-player-line', attr: { role: 'slider', 'aria-label': 'Position in the song', tabindex: '0' } });
    const fill = line.createDiv({ cls: 'tvj-player-fill' });
    const times = info.createDiv({ cls: 'tvj-player-times' });
    const at = times.createSpan({ text: '0:00' });
    const total = times.createSpan({ text: '0:00' });
    const keys = info.createDiv({ cls: 'tvj-options tvj-music-keys' });
    const previous = keys.createEl('button', { text: 'Previous' });
    const toggle = keys.createEl('button', { text: 'Play', cls: 'mod-cta' });
    const next = keys.createEl('button', { text: 'Next' });
    const repeatKey = keys.createEl('button', { cls: 'tvj-music-save', attr: { 'aria-label': 'Repeat' } });
    const shuffleKey = keys.createEl('button', { cls: 'tvj-music-save', attr: { 'aria-label': 'Shuffle what is next' } });
    setIcon(shuffleKey, 'shuffle');
    const showRepeat = () => {
      const mode = plugin.settings.linkRepeat || 'off';
      setIcon(repeatKey, mode === 'one' ? 'repeat-1' : 'repeat');
      repeatKey.classList.toggle('is-on', mode !== 'off');
      repeatKey.setAttribute('aria-label', tx(mode === 'one' ? 'Repeat this song' : mode === 'all' ? 'Repeat the queue' : 'Repeat'));
    };
    showRepeat();
    repeatKey.addEventListener('click', async () => {
      const order = ['off', 'all', 'one'];
      plugin.settings.linkRepeat = order[(order.indexOf(plugin.settings.linkRepeat || 'off') + 1) % order.length];
      showRepeat();
      await plugin.saveData(plugin.settings);
    });
    shuffleKey.addEventListener('click', () => {
      const q = plugin.linkState();
      const rest = q.items.slice(q.index + 1);
      for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
      q.items = [...q.items.slice(0, q.index + 1), ...rest];
      plugin.saveLinkQueue();
      plugin.refreshLinkViews();
    });
    plugin.mountSaveButtons(keys, this, 'tvj-music-save');
    plugin.mountLyrics(info, this, true);
    const queueBox = root.createDiv({ cls: 'tvj-player-queue' });
    root.createEl('p', { cls: 'tvj-muted', text: 'The sound comes straight from the link, read on this computer by yt-dlp: no ads and no sign-in. A playlist link is opened into its songs.' });

    const clock = (seconds) => { const t = Math.max(0, Math.floor(seconds || 0)); const m = Math.floor(t / 60); return `${m}:${String(t % 60).padStart(2, '0')}`; };
    const mine = () => { const q = plugin.linkState(); const item = q.items[q.index]; const now = plugin.nowPlaying; return item && now && now.link === item.link ? now : null; };
    toggle.addEventListener('click', () => { if (mine() && plugin.musicControls.toggle) plugin.musicControls.toggle(); else plugin.linkPlayAt(plugin.linkState().index); });
    previous.addEventListener('click', () => { if (mine() && plugin.musicControls.previous) plugin.musicControls.previous(); else plugin.linkStep(-1); });
    next.addEventListener('click', () => plugin.linkStep(1));
    line.addEventListener('pointerdown', (e) => {
      const now = mine();
      if (!now || !plugin.musicControls.seek) return;
      const box = line.getBoundingClientRect();
      plugin.musicControls.seek(Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)));
    });
    let queueShown = '';
    const paint = () => {
      if (!card.isConnected) return;
      const q = plugin.linkState();
      const item = q.items[q.index];
      const now = mine();
      const src = (item && item.cover) || '';
      if (src) { if (cover.getAttribute('src') !== src) cover.setAttribute('src', src); } else cover.removeAttribute('src');
      title.setText(plugin.linkLoading ? tx('Loading…') : item ? item.title || item.link : tx('Paste a link above to start.'));
      artist.setText(item ? item.by || '' : '');
      const known = now && now.duration > 0;
      fill.style.width = `${known ? Math.min(100, (now.time / now.duration) * 100) : 0}%`;
      at.setText(clock(now ? now.time : 0));
      total.setText(known ? clock(now.duration) : '0:00');
      toggle.setText(tx(now && now.playing ? 'Pause' : 'Play'));
      // the queue is drawn again only when it changed
      const sign = `${q.index}|${q.items.map((x) => `${x.link}${x.title}`).join('|')}`;
      if (sign === queueShown) return;
      queueShown = sign;
      queueBox.empty();
      if (q.items.length < 2) return;
      const head = queueBox.createDiv({ cls: 'tvj-player-head' });
      head.createDiv({ cls: 'tvj-card-title', text: `${tx('Queue')} · ${q.items.length}` });
      head.createEl('button', { text: 'Clear' }).addEventListener('click', () => { q.items = item ? [item] : []; q.index = 0; plugin.saveLinkQueue(); paint(); });
      const list = queueBox.createDiv({ cls: 'tvj-music-list' });
      q.items.forEach((x, i) => {
        const row = list.createDiv({ cls: `tvj-music-row ${i === q.index ? 'is-playing' : ''}` });
        const b = row.createEl('button', { cls: 'tvj-music-track', attr: { 'aria-label': `Play ${x.title || x.link}` } });
        const thumb = b.createSpan({ cls: 'tvj-player-thumb tvj-playlist-thumb' });
        if (x.cover) thumb.createEl('img', { attr: { src: x.cover, alt: '', loading: 'lazy' } });
        const words = b.createSpan({ cls: 'tvj-player-words' });
        words.createSpan({ cls: 'tvj-music-name', text: x.title || x.link.replace(/^https?:\/\/(www\.|m\.)?/, '') });
        words.createSpan({ cls: 'tvj-music-n', text: [x.by, isCollectionLink(x.link) ? tx('Playlist') : '', x.duration ? clock(x.duration) : ''].filter(Boolean).join(' · ') });
        b.addEventListener('click', () => plugin.linkPlayAt(i));
        if (i !== q.index) row.createEl('button', { text: '×', cls: 'tvj-music-remove', attr: { 'aria-label': 'Remove from the queue' } }).addEventListener('click', () => {
          q.items.splice(i, 1);
          if (i < q.index) q.index--;
          plugin.saveLinkQueue();
          paint();
        });
      });
    };
    this.paintLink = paint;
    plugin.nowListeners = plugin.nowListeners || new Set();
    plugin.nowListeners.add(paint);
    this.register(() => plugin.nowListeners.delete(paint));
    paint();
  }

  async pickSource(key) {
    this.plugin.settings.musicSource = key;
    await this.plugin.saveData(this.plugin.settings);
    this.render();
  }

  async openLink(source, link) {
    // a link from another service opens under that service's tab
    const owner = MUSIC_SOURCES.find((x) => x.owns && x.owns.test(link));
    if (owner && owner !== source) {
      this.plugin.settings.musicSource = owner.key;
      source = owner;
    }
    if ((this.site || this.driver) && this.siteKey === source.key && this.shownKey === source.key && owner) {
      // the service's page is already up: just go there, without redrawing (the music keeps playing)
      if (source.key === 'youtube' && this.driver) this.driver.navigate(link); else this.site.setAttribute('src', link);
      const kept = ((this.plugin.settings.musicLinks || {})[source.key] || []);
      this.plugin.settings.musicLinks = { ...(this.plugin.settings.musicLinks || {}), [source.key]: [link, ...kept.filter((x) => x !== link)].slice(0, 12) };
      await this.plugin.saveData(this.plugin.settings);
      return;
    }
    if (!owner && !source.embed(link)) { notify('That link is not from this service.'); return; }
    const settings = this.plugin.settings;
    const kept = (settings.musicLinks && settings.musicLinks[source.key]) || [];
    settings.musicLinks = { ...(settings.musicLinks || {}), [source.key]: [link, ...kept.filter((x) => x !== link)].slice(0, 12) };
    await this.plugin.saveData(settings);
    this.render();
  }

  async removeLink(source, link) {
    const settings = this.plugin.settings;
    settings.musicLinks = { ...(settings.musicLinks || {}), [source.key]: ((settings.musicLinks || {})[source.key] || []).filter((x) => x !== link) };
    await this.plugin.saveData(settings);
    this.render();
  }

  render() {
    const root = this.contentEl;
    root.empty();
    root.addClass('tvj-dashboard');
    root.addClass('tvj-music');
    const head = root.createDiv({ cls: 'tvj-head' });
    this.plugin.renderNav(head, MUSIC_VIEW_TYPE);
    const settings = this.plugin.settings;
    const source = MUSIC_SOURCES.find((x) => x.key === settings.musicSource) || MUSIC_SOURCES[0];

    const tabs = root.createDiv({ cls: 'tvj-tabs tvj-music-tabs' });
    for (const x of MUSIC_SOURCES) {
      tabs.createEl('button', { text: x.name, cls: `tvj-tab ${x.key === source.key ? 'is-active' : ''}`, attr: { 'aria-pressed': String(x.key === source.key) } }).addEventListener('click', () => { if (x.key !== source.key) this.pickSource(x.key); });
    }
    const lists = tabs.createEl('button', { cls: 'tvj-tab tvj-tab-playlists', attr: { 'aria-label': 'Your playlists' } });
    setIcon(lists.createSpan({ cls: 'tvj-playlist-icon' }), 'list-music');
    lists.createSpan({ text: tx('Playlists') });
    lists.addEventListener('click', () => new PlaylistsModal(this.app, this.plugin).open());

    // the radio or one of your files keeps playing whichever tab is shown: its player sits above the tab
    if (this.audio && this.audio.parentElement) this.audio.remove();
    this.showPlayer(root);
    // the YouTube driver only steers while YouTube is the tab on screen (see openLink)
    this.shownKey = source.key;
    if (source.key !== 'youtube') this.driver = null;
    if (source.key === 'link') { this.site = null; window.clearInterval(this.ytTimer); this.renderLink(root); return; }
    if (source.key === 'radio') { this.site = null; window.clearInterval(this.ytTimer); this.renderRadio(root); return; }
    if (source.key === 'files') { this.site = null; window.clearInterval(this.ytTimer); this.renderFiles(root); return; }
    const links = ((settings.musicLinks || {})[source.key] || []).filter((link) => source.owns.test(link));
    this.site = null;
    window.clearInterval(this.ytTimer);
    if (source.key === 'soundcloud') { this.renderSoundCloud(root, source, links); return; }
    if (canBrowse() && source.key === 'youtube') { this.renderYouTubePlayer(root, source, links); return; }
    if (canBrowse()) {
      // desktop: the service's whole website in the pane, signed in once and remembered (its own session, apart
      // from your browser). A pasted link opens inside it.
      const bar = root.createDiv({ cls: 'tvj-options tvj-youtube-bar' });
      const input = bar.createEl('input', { type: 'text', cls: 'tvj-prompt', attr: { placeholder: source.hint, 'aria-label': source.hint } });
      const go = () => { if (input.value.trim()) { this.openLink(source, input.value.trim()); input.value = ''; } };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      bar.createEl('button', { text: 'Open', cls: 'mod-cta' }).addEventListener('click', go);
      bar.createEl('button', { text: 'Home' }).addEventListener('click', () => { if (this.site) this.site.setAttribute('src', source.home); });
      const stage = root.createDiv({ cls: 'tvj-music-site' });
      const site = document.createElement('webview');
      site.setAttribute('src', links[0] || source.home);
      site.setAttribute('partition', 'persist:tvj-music');
      site.setAttribute('useragent', navigator.userAgent.replace(/\s?(obsidian|Electron)\/[\d.]+/gi, ''));
      stage.appendChild(site);
      this.site = site;
      this.siteKey = source.key;
      root.createEl('p', { cls: 'tvj-muted', text: 'Sign in once inside the page with your email and password; it stays signed in here. The "Continue with Google / Facebook / Apple" buttons need a pop-up window, which Obsidian does not allow.' });
      return;
    }
    // elsewhere (mobile, the web): the service's small player, from a pasted link; the links you used stay below
    const bar = root.createDiv({ cls: 'tvj-options tvj-youtube-bar' });
    const input = bar.createEl('input', { type: 'text', cls: 'tvj-prompt', attr: { placeholder: source.hint, 'aria-label': source.hint } });
    const go = () => { if (input.value.trim()) this.openLink(source, input.value.trim()); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    bar.createEl('button', { text: 'Play', cls: 'mod-cta' }).addEventListener('click', go);
    if (!links.length) {
      root.createEl('p', { cls: 'tvj-muted', text: source.hint });
      return;
    }
    const stage = root.createDiv({ cls: `tvj-music-stage is-${source.key}` });
    stage.createEl('iframe', { attr: { src: source.embed(links[0]), allow: 'autoplay; encrypted-media; clipboard-write; fullscreen; picture-in-picture', referrerpolicy: 'strict-origin-when-cross-origin', title: source.name, loading: 'lazy' } });
    if (links.length > 1) {
      root.createDiv({ cls: 'tvj-card-title tvj-youtube-label', text: 'Your links' });
      const shelf = root.createDiv({ cls: 'tvj-music-list' });
      links.slice(1).forEach((link) => {
        const row = shelf.createDiv({ cls: 'tvj-music-row' });
        const b = row.createEl('button', { cls: 'tvj-music-track' });
        b.createSpan({ cls: 'tvj-music-name', text: link.replace(/^https?:\/\/(www\.)?/, '').slice(0, 80) });
        b.addEventListener('click', () => this.openLink(source, link));
        row.createEl('button', { text: '×', cls: 'tvj-music-remove', attr: { 'aria-label': 'Remove this link' } }).addEventListener('click', () => this.removeLink(source, link));
      });
    }
  }
}

/** Your playlists, in a dialog over whatever is playing: changing them never restarts the song. */
class PlaylistsModal extends ThemedModal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.openList = plugin.lastPlaylist || FAV_ID;
  }
  onOpen() {
    this.modalEl.addClass('tvj-playlists-modal');
    this.plugin.playlistModals = this.plugin.playlistModals || new Set();
    this.plugin.playlistModals.add(this);
    this.render();
  }
  onClose() {
    if (this.plugin.playlistModals) this.plugin.playlistModals.delete(this);
    this.contentEl.empty();
  }
  render() {
    const root = this.contentEl;
    root.empty();
    accentTitle(root, 'h2', 'Playlists');
    this.renderPlaylists(root);
    this.plugin.lastPlaylist = this.openList;
  }

  /** Playlists: Favorites and your own, each a list of YouTube and SoundCloud links. An item can be a whole playlist
   *  of yours on YouTube or SoundCloud: it plays in its own order. */
  renderPlaylists(root) {
    const plugin = this.plugin;
    const lists = plugin.playlists();
    if (!lists.some((p) => p.id === this.openList)) this.openList = lists[0].id;
    const list = lists.find((p) => p.id === this.openList);
    const wrap = root.createDiv({ cls: 'tvj-playlists' });
    const side = wrap.createDiv({ cls: 'tvj-playlists-side' });
    for (const p of lists) {
      const b = side.createEl('button', { cls: `tvj-playlist-pick ${p.id === list.id ? 'is-active' : ''}`, attr: { 'aria-pressed': String(p.id === list.id) } });
      setIcon(b.createSpan({ cls: 'tvj-playlist-icon' }), p.id === FAV_ID ? 'heart' : 'list-music');
      b.createSpan({ cls: 'tvj-music-name', text: p.id === FAV_ID ? tx('Favorites') : p.name });
      b.createSpan({ cls: 'tvj-music-n', text: String(p.items.length) });
      b.addEventListener('click', () => { this.openList = p.id; this.render(); });
    }
    side.createEl('button', { text: '+ New playlist', cls: 'tvj-playlist-new' }).addEventListener('click', () => {
      new TextPromptModal(this.app, 'Playlist name', '', async (name) => { const p = await plugin.createPlaylist(name); if (p) { this.openList = p.id; this.render(); } }).open();
    });

    const main = wrap.createDiv({ cls: 'tvj-playlists-main' });
    const head = main.createDiv({ cls: 'tvj-player-head' });
    head.createDiv({ cls: 'tvj-card-title', text: list.id === FAV_ID ? tx('Favorites') : list.name });
    const tools = head.createDiv({ cls: 'tvj-options' });
    if (list.items.length) {
      tools.createEl('button', { text: 'Play all', cls: 'mod-cta' }).addEventListener('click', () => plugin.playMusicItem(list.items[0], { id: list.id, index: 0 }));
      tools.createEl('button', { text: 'Shuffle' }).addEventListener('click', async () => {
        for (let i = list.items.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list.items[i], list.items[j]] = [list.items[j], list.items[i]]; }
        await plugin.savePlaylists();
        plugin.playMusicItem(list.items[0], { id: list.id, index: 0 });
      });
    }
    if (list.id !== FAV_ID) {
      tools.createEl('button', { text: 'Rename' }).addEventListener('click', () => new TextPromptModal(this.app, 'Playlist name', list.name, async (name) => {
        const clean = String(name || '').trim().slice(0, 60);
        if (clean) { list.name = clean; await plugin.savePlaylists(); }
      }).open());
      tools.createEl('button', { text: 'Delete' }).addEventListener('click', async () => {
        if (!ask(`Delete the playlist "${list.name}"? The songs stay on YouTube and SoundCloud.`)) return;
        plugin.settings.playlists = lists.filter((p) => p.id !== list.id);
        this.openList = FAV_ID;
        await plugin.savePlaylists();
      });
    }

    const bar = main.createDiv({ cls: 'tvj-options tvj-youtube-bar' });
    const input = bar.createEl('input', { type: 'text', cls: 'tvj-prompt', attr: { placeholder: 'Paste a YouTube or SoundCloud link: a song or a whole playlist', 'aria-label': 'Paste a YouTube or SoundCloud link' } });
    const add = async () => { const link = input.value.trim(); if (!link) return; input.value = ''; await plugin.addLinkToPlaylist(list.id, link); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    bar.createEl('button', { text: 'Add', cls: 'mod-cta' }).addEventListener('click', add);
    const playing = plugin.nowItem();
    if (playing) bar.createEl('button', { text: 'Add what is playing' }).addEventListener('click', () => plugin.addToPlaylist(list.id, playing));

    if (!list.items.length) {
      main.createEl('p', { cls: 'tvj-muted', text: list.id === FAV_ID
        ? 'Press the heart while a song plays (here or on the lobby\'s music card) to keep it here.'
        : 'Add songs by link, or a whole playlist of yours from YouTube or SoundCloud: it plays in its own order.' });
      return;
    }
    const rows = main.createDiv({ cls: 'tvj-music-list' });
    const run = plugin.playlistRun;
    list.items.forEach((item, i) => {
      const row = rows.createDiv({ cls: `tvj-music-row ${run && run.id === list.id && run.index === i ? 'is-playing' : ''}` });
      const b = row.createEl('button', { cls: 'tvj-music-track', attr: { 'aria-label': `Play ${item.title}` } });
      const thumb = b.createSpan({ cls: 'tvj-player-thumb tvj-playlist-thumb' });
      if (item.cover) thumb.createEl('img', { attr: { src: item.cover, alt: '', loading: 'lazy' } });
      const words = b.createSpan({ cls: 'tvj-player-words' });
      words.createSpan({ cls: 'tvj-music-name', text: item.title || item.link });
      const source = musicSourceOf(item.link);
      words.createSpan({ cls: 'tvj-music-n', text: [item.by, source ? source.name : '', isCollectionLink(item.link) ? tx('Playlist') : ''].filter(Boolean).join(' · ') });
      b.addEventListener('click', () => plugin.playMusicItem(item, { id: list.id, index: i }));
      if (i > 0) row.createEl('button', { text: '↑', cls: 'tvj-music-remove', attr: { 'aria-label': 'Move up' } }).addEventListener('click', async () => {
        [list.items[i - 1], list.items[i]] = [list.items[i], list.items[i - 1]];
        await plugin.savePlaylists();
      });
      row.createEl('button', { text: '×', cls: 'tvj-music-remove', attr: { 'aria-label': 'Remove from the playlist' } }).addEventListener('click', async () => {
        list.items.splice(i, 1);
        await plugin.savePlaylists();
      });
    });
  }


}

