// ---------- SoundCloud and synced lyrics for the Music pane ----------

/** SoundCloud's own player for a public track, playlist or profile: it plays without signing in. */
const soundcloudEmbed = (link) => (/^https?:\/\/([a-z0-9-]+\.)?(soundcloud\.com|snd\.sc)\//i.test(String(link || '').trim())
  ? `https://w.soundcloud.com/player/?url=${encodeURIComponent(String(link).trim())}&auto_play=true&visual=false&show_comments=false&show_reposts=false&show_teaser=false&hide_related=true`
  : '');

/** SoundCloud's player in `frame`, driven with the messages its widget script would send. That script is not
 *  loaded: a script from the web put into Obsidian's own page could reach every file on the computer. Only messages
 *  from that frame and from w.soundcloud.com are read. Returns { bind(event, run), toggle, prev, next, seekTo(ms),
 *  setVolume(0-100), getCurrentSound(run), getSounds(run), getCurrentSoundIndex(run), destroy }. */
const SC_ORIGIN = 'https://w.soundcloud.com';
const SC_EVENTS = { READY: 'ready', PLAY: 'play', PAUSE: 'pause', FINISH: 'finish', SEEK: 'seek', PLAY_PROGRESS: 'playProgress' };
function soundCloudWidget(frame, win = window) {
  const events = new Map(), asked = new Map();
  const send = (method, value) => {
    const target = frame.contentWindow;
    if (target) target.postMessage(JSON.stringify({ method, value }), SC_ORIGIN);
  };
  const listen = (e) => {
    if (!frame.isConnected) { win.removeEventListener('message', listen); return; } // that player is gone
    if (e.source !== frame.contentWindow || e.origin !== SC_ORIGIN) return;
    let msg;
    try { msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch (err) { return; }
    if (!msg || typeof msg.method !== 'string') return;
    // the player says it is ready each time it loads: the events are asked for (again)
    if (msg.method === SC_EVENTS.READY) for (const name of events.keys()) if (name !== SC_EVENTS.READY) send('addEventListener', name);
    const waiting = asked.get(msg.method);
    if (waiting) { asked.delete(msg.method); for (const run of waiting) run(msg.value); }
    for (const run of events.get(msg.method) || []) run(msg.value);
  };
  const get = (method, run) => { if (!asked.has(method)) asked.set(method, []); asked.get(method).push(run); send(method); };
  win.addEventListener('message', listen);
  return {
    bind(name, run) { if (!events.has(name)) events.set(name, []); events.get(name).push(run); },
    toggle: () => send('toggle'),
    prev: () => send('prev'),
    next: () => send('next'),
    seekTo: (ms) => send('seekTo', ms),
    setVolume: (v) => send('setVolume', v),
    getCurrentSound: (run) => get('getCurrentSound', run),
    getSounds: (run) => get('getSounds', run),
    getCurrentSoundIndex: (run) => get('getCurrentSoundIndex', run),
    destroy: () => win.removeEventListener('message', listen),
  };
}

/** What to look a song up by: { track, artist } from a title such as "Artist - Song (Official Video) [Lyrics]"
 *  and the channel or uploader. Bracketed parts, "ft." credits and channel suffixes are left out. */
function songQuery(title, by) {
  const clean = (s) => String(s || '')
    .replace(/[([{【].*?[)\]}】]/g, ' ')
    .replace(/\b(official|music|lyric|lyrics|audio|video|mv|m\/v|hd|4k|visualizer|remaster(ed)?)\b/gi, ' ')
    .replace(/\s(ft\.?|feat\.?|featuring)\s.*$/i, ' ')
    .replace(/\s+/g, ' ').trim();
  const artist0 = String(by || '').replace(/\s*-\s*topic$/i, '').replace(/vevo$/i, '').replace(/\s+official$/i, '').trim();
  const parts = String(title || '').split(/\s[-–—|]\s/);
  if (parts.length >= 2) return { artist: clean(parts[0]), track: clean(parts.slice(1).join(' ')) };
  return { artist: clean(artist0), track: clean(title) };
}

/** Every reading of a title worth looking up, best first: [{ track, artist }]. Remakes, covers and remix notes
 *  are dropped; "Song / Artist" and "Artist - Song" are both read; each song of a mashup ("A & B", "A x B") is
 *  tried on its own, with the artist named in the title or else the uploader. */
function songQueries(title, by) {
  const strip = (s) => String(s || '')
    .replace(/\s[-–—|]\s*(remake|cover|remix|mashup|edit|prod\.?|produced)\b.*$/i, ' ')
    .replace(/\b(remake|cover)\s+by\b.*$/i, ' ');
  const clean = (s) => strip(s)
    .replace(/[([{【].*?[)\]}】]/g, ' ')
    .replace(/\b(official|music|lyric|lyrics|audio|video|mv|m\/v|hd|4k|visualizer|remaster(ed)?|remix|version|edit|lofi|slowed|reverb|speed ?up|nightcore)\b/gi, ' ')
    .replace(/\s(ft\.?|feat\.?|featuring)\s.*$/i, ' ')
    .replace(/\s+/g, ' ').trim();
  const uploader = String(by || '').replace(/\s*-\s*topic$/i, '').replace(/vevo$/i, '').replace(/\s+(official|music|channel)$/i, '').trim();
  const out = [];
  const add = (track, artist) => {
    const t = clean(track), a = clean(artist);
    if (t && !out.some((q) => q.track.toLowerCase() === t.toLowerCase() && q.artist.toLowerCase() === a.toLowerCase())) out.push({ track: t, artist: a });
  };
  const base = strip(title);
  const songsOf = (s) => String(s).split(/\s(?:&|x|×|\+)\s|\s*,\s*/i).map((x) => x.trim()).filter(Boolean);
  // "Song / Artist" (the way many Vietnamese uploads name a song)
  const slash = base.split(/\s\/\s/);
  if (slash.length === 2) for (const song of songsOf(slash[0].replace(/[([{【].*?[)\]}】]/g, ' '))) add(song, slash[1]);
  // "Artist - Song", and the other way round
  const dash = base.split(/\s[-–—|]\s/);
  if (dash.length >= 2) {
    const left = dash[0], right = dash.slice(1).join(' ');
    for (const song of songsOf(right)) add(song, left);
    for (const song of songsOf(left)) add(song, right);
  }
  // the title as it is, with the uploader as the artist
  for (const song of songsOf(base)) add(song, uploader);
  add(base, uploader);
  return out.slice(0, 6);
}

/** LRC text ("[mm:ss.xx] words") -> [{ t: seconds, text }] in time order; lines without words are kept as pauses. */
function parseLrc(text) {
  const out = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g)];
    if (!stamps.length) continue;
    const words = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of stamps) out.push({ t: Number(m[1]) * 60 + Number(m[2].replace(':', '.')), text: words });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** The index of the line being sung at `time` (seconds), or -1 before the first. */
function lyricIndex(lines, time) {
  let lo = 0, hi = lines.length - 1, at = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (lines[mid].t <= time + 0.15) { at = mid; lo = mid + 1; } else hi = mid - 1; }
  return at;
}


const MUSIC_SOURCES = [
  { key: 'link', name: 'Paste link' },
  { key: 'youtube', name: 'YouTube', home: 'https://www.youtube.com/', owns: /^https?:\/\/([a-z0-9-]+\.)?(youtube\.com|youtu\.be)\//i, hint: 'Paste a YouTube link: a video or a playlist.',
    embed: (link) => { const t = youtubeTarget(link); return t ? youtubeEmbed(t, 'rel=0&playsinline=1') : ''; } },
  { key: 'soundcloud', name: 'SoundCloud', home: 'https://soundcloud.com/', owns: /^https?:\/\/([a-z0-9-]+\.)?(soundcloud\.com|snd\.sc)\//i, hint: 'Paste a SoundCloud link: a track, a playlist or a profile.',
    embed: (link) => soundcloudEmbed(link) },
  { key: 'radio', name: 'Radio' },
  { key: 'files', name: 'My music' },
];
