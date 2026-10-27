// ---------- GIF export: a full-quality animated GIF encoder ----------
// GIF allows 256 colours per frame, so quality comes from how those colours are chosen and spent: every frame
// gets its own palette (median cut over a full histogram, splitting the box with the most colour error), the
// pixels are pattern (ordered, Bayer) dithered against it, and pixels that did not change since the previous frame —
// or are within a few shades of what is already on screen — are left transparent: the static text of a card never
// shimmers and costs almost nothing, and the faint flicker of a video's still parts is not stored again each frame. Written out here because a plugin ships as one file with no library to fetch.

/** Growable byte buffer the GIF stream is written into. */
class GifSink {
  constructor(size = 1 << 16) { this.buf = new Uint8Array(size); this.len = 0; }
  ensure(n) {
    if (this.len + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.len + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }
  byte(v) { this.ensure(1); this.buf[this.len++] = v; }
  word(v) { this.ensure(2); this.buf[this.len++] = v & 255; this.buf[this.len++] = (v >> 8) & 255; }
  bytes(a) { this.ensure(a.length); this.buf.set(a, this.len); this.len += a.length; }
  text(s) { for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i)); }
  take() { const out = this.buf.slice(0, this.len); this.len = 0; return out; }
}

/** Up to `maxColors` palette colours for the pixels of `data` (RGBA) where `mask` is set: a 5-bit histogram,
 *  then median cut that always splits the box holding the most squared colour error, on its widest axis. */
function gifPalette(data, mask, maxColors) {
  const count = new Uint32Array(32768), sr = new Float64Array(32768), sg = new Float64Array(32768), sb = new Float64Array(32768);
  for (let p = 0, n = mask.length; p < n; p++) {
    if (!mask[p]) continue;
    const i = p * 4, r = data[i], g = data[i + 1], b = data[i + 2];
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    count[key]++; sr[key] += r; sg[key] += g; sb[key] += b;
  }
  const keys = [];
  for (let k = 0; k < 32768; k++) if (count[k]) keys.push(k);
  if (!keys.length) return [[0, 0, 0]];
  const n = keys.length, N = new Float64Array(n), C = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
  keys.forEach((k, i) => { N[i] = count[k]; C[0][i] = sr[k] / count[k]; C[1][i] = sg[k] / count[k]; C[2][i] = sb[k] / count[k]; });
  const order = new Int32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  const boxOf = (s, e) => {
    let w = 0; const m = [0, 0, 0], v = [0, 0, 0];
    for (let j = s; j < e; j++) { const i = order[j]; w += N[i]; for (let a = 0; a < 3; a++) m[a] += N[i] * C[a][i]; }
    for (let a = 0; a < 3; a++) m[a] /= w;
    for (let j = s; j < e; j++) { const i = order[j]; for (let a = 0; a < 3; a++) { const d = C[a][i] - m[a]; v[a] += N[i] * d * d; } }
    return { s, e, w, m, v, err: v[0] + v[1] + v[2] };
  };
  const boxes = [boxOf(0, n)];
  while (boxes.length < maxColors) {
    let at = -1;
    for (let i = 0; i < boxes.length; i++) if (boxes[i].e - boxes[i].s > 1 && boxes[i].err > 0 && (at < 0 || boxes[i].err > boxes[at].err)) at = i;
    if (at < 0) break;
    const box = boxes[at];
    const axis = box.v[0] >= box.v[1] && box.v[0] >= box.v[2] ? 0 : box.v[1] >= box.v[2] ? 1 : 2;
    const c = C[axis];
    order.subarray(box.s, box.e).sort((x, y) => c[x] - c[y]);
    let cut = box.s + 1;
    for (let j = box.s, acc = 0; j < box.e - 1; j++) { acc += N[order[j]]; if (acc >= box.w / 2) { cut = j + 1; break; } cut = j + 1; }
    boxes.splice(at, 1, boxOf(box.s, cut), boxOf(cut, box.e));
  }
  return boxes.map((b) => [Math.round(b.m[0]), Math.round(b.m[1]), Math.round(b.m[2])]);
}

/** GIF's variable-width LZW (GIF89a appendix F) of a frame's palette indices, written as data sub-blocks. */
function gifLzw(indices, minCodeSize, sink) {
  const clearCode = 1 << minCodeSize, eoiCode = clearCode + 1;
  let codeSize = minCodeSize + 1, nextCode = eoiCode + 1;
  const dict = new Map();
  const block = new Uint8Array(255);
  let blockLen = 0, acc = 0, bits = 0;
  const put = (b) => { block[blockLen++] = b; if (blockLen === 255) { sink.byte(255); sink.bytes(block); blockLen = 0; } };
  const emit = (code) => { acc |= code << bits; bits += codeSize; while (bits >= 8) { put(acc & 255); acc >>>= 8; bits -= 8; } };
  sink.byte(minCodeSize);
  emit(clearCode);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const hit = dict.get(prefix * 256 + k);
    if (hit !== undefined) { prefix = hit; continue; }
    emit(prefix);
    if (nextCode < 4096) {
      // widen only once the code about to be claimed no longer fits, checked before claiming it: a decoder's
      // dictionary trails this one by an entry, and this is the moment it widens too (as giflib does)
      if (nextCode > (1 << codeSize) - 1 && codeSize < 12) codeSize++;
      dict.set(prefix * 256 + k, nextCode++);
    } else {
      emit(clearCode);
      dict.clear();
      nextCode = eoiCode + 1;
      codeSize = minCodeSize + 1;
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoiCode);
  if (bits > 0) put(acc & 255);
  if (blockLen) { sink.byte(blockLen); sink.bytes(block.subarray(0, blockLen)); }
  sink.byte(0);
}

/** Animated GIF writer: addFrame(rgba, delayCs) per frame, then finish() for the file's bytes as chunks. */
class GifEncoder {
  constructor(width, height) {
    this.w = width; this.h = height; this.prev = null; this.chunks = []; this.sink = new GifSink();
    const s = this.sink;
    s.text('GIF89a'); s.word(width); s.word(height);
    s.byte(0x70); s.byte(0); s.byte(0); // no global table: every frame carries its own palette
    s.byte(0x21); s.byte(0xFF); s.byte(11); s.text('NETSCAPE2.0'); s.byte(3); s.byte(1); s.word(0); s.byte(0); // loop forever
  }

  addFrame(data, delayCs) {
    const { w: W, h: H, prev, shown } = this;
    const T = GIF_SAME_WITHIN;
    // which pixels changed since the last frame, and the rectangle around them: a pixel counts as unchanged when
    // its source is the same as last frame, or it is within T shades (each channel) of what is on screen now
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    const changed = new Uint8Array(W * H);
    for (let y = 0, p = 0; y < H; y++) {
      for (let x = 0; x < W; x++, p++) {
        const i = p * 4, j = p * 3;
        if (prev && prev[i] === data[i] && prev[i + 1] === data[i + 1] && prev[i + 2] === data[i + 2]) continue;
        if (shown && Math.abs(shown[j] - data[i]) <= T && Math.abs(shown[j + 1] - data[i + 1]) <= T && Math.abs(shown[j + 2] - data[i + 2]) <= T) continue;
        changed[p] = 1;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) { x0 = 0; y0 = 0; x1 = 0; y1 = 0; } // nothing moved: one transparent pixel keeps the timing
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const rgba = new Uint8ClampedArray(w * h * 4), mask = new Uint8Array(w * h);
    let transparent = false;
    for (let y = 0; y < h; y++) {
      const p = (y0 + y) * W + x0;
      rgba.set(data.subarray(p * 4, (p + w) * 4), y * w * 4);
      mask.set(changed.subarray(p, p + w), y * w);
    }
    for (let q = 0; q < mask.length; q++) if (!mask[q]) { transparent = true; break; }
    const palette = gifPalette(rgba, mask, transparent ? 255 : 256);
    const used = palette.length + (transparent ? 1 : 0);
    const bits = Math.max(2, Math.ceil(Math.log2(used)));
    const tIndex = palette.length;
    const indices = gifDither(rgba, mask, w, h, palette, tIndex, x0, y0);

    const s = this.sink;
    s.byte(0x21); s.byte(0xF9); s.byte(4); s.byte((1 << 2) | (transparent ? 1 : 0)); s.word(delayCs); s.byte(transparent ? tIndex : 0); s.byte(0);
    s.byte(0x2C); s.word(x0); s.word(y0); s.word(w); s.word(h); s.byte(0x80 | (bits - 1));
    for (let i = 0; i < 1 << bits; i++) { const c = palette[i] || [0, 0, 0]; s.byte(c[0]); s.byte(c[1]); s.byte(c[2]); }
    gifLzw(indices, bits, s);
    this.chunks.push(s.take());
    this.prev = data;
    // what is on screen now: the colours just written, over what was there
    if (!this.shown) this.shown = new Uint8ClampedArray(W * H * 3);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const q = y * w + x;
        if (!mask[q]) continue;
        const c = palette[indices[q]], j = ((y0 + y) * W + x0 + x) * 3;
        this.shown[j] = c[0]; this.shown[j + 1] = c[1]; this.shown[j + 2] = c[2];
      }
    }
  }

  /** Bytes written so far. */
  get size() { return this.chunks.reduce((n, c) => n + c.length, 0); }

  finish() {
    this.sink.byte(0x3B);
    this.chunks.push(this.sink.take());
    return this.chunks;
  }
}

// Pattern dithering: an 8 × 8 Bayer threshold added to each pixel before it takes its nearest colour, a light
// touch of −2 … +1 per channel (as ffmpeg's bayer_scale=4). Unlike error diffusion it does not scatter noise
// through the picture, so a moving background compresses to about 40% less, and it looks the same.
const GIF_PATTERN = (() => {
  const t = new Int8Array(64);
  for (let p = 0; p < 64; p++) {
    const q = p ^ (p >> 3);
    const v = ((p & 4) >> 2) | ((q & 4) >> 1) | ((p & 2) << 1) | ((q & 2) << 2) | ((p & 1) << 4) | ((q & 1) << 5);
    t[p] = (v >> 4) - 2;
  }
  return t;
})();

/** Palette indices for the masked pixels of a frame (a `w` × `h` box at `x0`, `y0` of the whole picture), pattern
 *  dithered; unmasked pixels get `tIndex` (transparent). The pattern is laid on the whole picture, not the box, so
 *  it stays put from frame to frame and a still part never shimmers. */
function gifDither(rgba, mask, w, h, palette, tIndex, x0 = 0, y0 = 0) {
  const out = new Uint8Array(w * h);
  const cache = new Int16Array(1 << 18).fill(-1);
  const nearest = (r, g, b) => {
    const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
    let best = cache[key];
    if (best >= 0) return best;
    let bestD = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const c = palette[i], dr = c[0] - r, dg = c[1] - g, db = c[2] - b;
      const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
      if (d < bestD) { bestD = d; best = i; }
    }
    cache[key] = best;
    return best;
  };
  for (let y = 0; y < h; y++) {
    const row = ((y + y0) & 7) << 3;
    for (let x = 0; x < w; x++) {
      const q = y * w + x;
      if (!mask[q]) { out[q] = tIndex; continue; }
      const i = q * 4, d = GIF_PATTERN[row | ((x + x0) & 7)];
      const r = Math.min(255, Math.max(0, rgba[i] + d));
      const g = Math.min(255, Math.max(0, rgba[i + 1] + d));
      const b = Math.min(255, Math.max(0, rgba[i + 2] + d));
      out[q] = nearest(r, g, b);
    }
  }
  return out;
}

// Export GIF: clipSeconds() long (Settings → GIF and video length, 8 s unless changed) at 50 frames a second (a GIF counts time in hundredths of a second, and players slow
// anything faster than two hundredths down to ten, so 50 is the fastest that plays true), as large as it can be
// while the file stays about 10 MB (small enough to post, Discord's free upload limit). Measured on a video
// background: the frame rate hardly changes the size (50 → 20 fps saves a fifth), the picture size does, a little
// slower than its pixel count (about height^1.8). So the frame rate stays at 50 and the height is chosen per card.
const GIF_SECONDS = 8, GIF_FPS = 50, GIF_W = 1920, GIF_H = 1080;
const CLIP_LENGTHS = [3, 5, 8, 10, 15];
/** How long an exported card GIF or video runs, in seconds: Settings → GIF and video length. */
const clipSeconds = (settings) => (CLIP_LENGTHS.includes(Number(settings && settings.clipSeconds)) ? Number(settings.clipSeconds) : GIF_SECONDS);
const GIF_TARGET = 10 * 1024 * 1024;
const GIF_HEIGHTS = [1080, 900, 720, 630, 540, 486, 432, 360];
const GIF_SAME_WITHIN = 8; // shades (of 255) a pixel may drift and still count as unchanged

/** The largest GIF size (16:9) whose estimated file stays within GIF_TARGET, from `bytes540`: the whole clip's
 *  estimated size at 960 × 540. A still card estimates small and stays at 1080p. */
function gifSizeFor(bytes540) {
  const h = GIF_HEIGHTS.find((x) => bytes540 * (x / 540) ** 1.8 <= GIF_TARGET) || GIF_HEIGHTS[GIF_HEIGHTS.length - 1];
  return { w: Math.round((h * 16) / 9 / 2) * 2, h };
}

/** The whole clip's estimated size from a trial: `first`, the first frame (drawn whole), and `changes`, what the
 *  frames after one another cost in short bursts spread over the clip — their average for every frame to come. */
function gifEstimate(first, changes, total) {
  return first + (changes.length ? changes.reduce((a, b) => a + b, 0) / changes.length : first) * (total - 1);
}

/** Where the trial's bursts start (frame numbers): five, spread over a clip of `total` frames. */
const gifBursts = (total) => [0, 1, 2, 3, 4].map((k) => Math.round((k * (total - 5)) / 4));

/** Moves a video to `t` seconds (looping past its end) and waits until that frame can be drawn. */
function seekVideo(video, t) {
  return new Promise((resolve) => {
    const length = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const target = length ? t % length : t;
    if (Math.abs(video.currentTime - target) < 0.0005 && video.readyState >= 2) { resolve(); return; }
    let timer = 0;
    const done = () => { video.removeEventListener('seeked', done); window.clearTimeout(timer); resolve(); };
    timer = window.setTimeout(done, 2000); // a video that never says it got there does not stop the export
    video.addEventListener('seeked', done);
    video.currentTime = target;
  });
}

/** A GIF drawn frame by frame rather than recorded: `source.render(sheet, t)` draws the card as it is `t` seconds
 *  into the clip onto `sheet`, a canvas scaled so the card's own 1200 × 675 drawing fills it (text stays sharp at
 *  any size). A trial of the first half second picks the size (see gifSizeFor), then every frame lands exactly
 *  1/50 s after the last, one held at a time; `source.begin()` / `source.end()` (optional) pause and resume a
 *  playing background around it. */
async function renderCardGif(source, onProgress, seconds = GIF_SECONDS) {
  const total = Math.round(seconds * GIF_FPS);
  // draws `count` frames from frame `from` at w × h into a new encoder; returns it and each frame's size in bytes
  const encode = async (w, h, count, report, from = 0) => {
    const sheet = document.createElement('canvas');
    sheet.width = w;
    sheet.height = h;
    const ctx = sheet.getContext('2d', { willReadFrequently: true });
    const gif = new GifEncoder(w, h);
    const sizes = [];
    for (let i = 0; i < count; i++) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.setTransform(w / CARD_W, 0, 0, h / CARD_H, 0, 0);
      await source.render(sheet, (from + i) / GIF_FPS);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const before = gif.size;
      gif.addFrame(ctx.getImageData(0, 0, w, h).data, Math.round(100 / GIF_FPS));
      sizes.push(gif.size - before);
      if (report) report(i + 1, count);
      await new Promise((r) => setTimeout(r, 0)); // the app stays responsive between frames
    }
    return { gif, sizes };
  };
  if (source.begin) source.begin();
  try {
    // a trial at 960 × 540 — five bursts of five frames spread over the clip — says how busy the card is, and
    // so how large the GIF can be
    let first = 0;
    const changes = [];
    for (const start of gifBursts(total)) {
      const { sizes } = await encode(960, 540, 5, null, start);
      if (!first) first = sizes[0];
      changes.push(...sizes.slice(1));
    }
    const size = gifSizeFor(gifEstimate(first, changes, total));
    let { gif } = await encode(size.w, size.h, total, onProgress);
    // the trial guessed low (a background that drifts slowly all over, which short bursts hardly see): once more,
    // smaller, sized from what this one really came to
    if (gif.size > GIF_TARGET * 1.15) {
      const again = gifSizeFor(gif.size * (540 / size.h) ** 1.8);
      if (again.h < size.h) ({ gif } = await encode(again.w, again.h, total, onProgress));
    }
    return new Blob(gif.finish(), { type: 'image/gif' });
  } finally {
    if (source.end) source.end();
  }
}

/** Records `seconds` of a canvas that is being redrawn every frame (a video background) at `fps`, at full size,
 *  then encodes it as a GIF. Frames are grabbed as bitmaps in real time and encoded afterwards, a frame at a time
 *  with a pause between, so the app stays responsive; `onProgress(done, total)` reports the encoding. */
async function captureCanvasGif(canvas, seconds = 3, fps = 15, onProgress) {
  const total = Math.max(1, Math.round(seconds * fps));
  const shots = [];
  const start = performance.now();
  for (let i = 0; i < total; i++) {
    const wait = start + (i * 1000) / fps - performance.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    shots.push(await createImageBitmap(canvas));
  }
  const off = document.createElement('canvas');
  off.width = canvas.width; off.height = canvas.height;
  const octx = off.getContext('2d', { willReadFrequently: true });
  const gif = new GifEncoder(canvas.width, canvas.height);
  for (let i = 0; i < shots.length; i++) {
    octx.clearRect(0, 0, off.width, off.height);
    octx.drawImage(shots[i], 0, 0);
    shots[i].close();
    gif.addFrame(octx.getImageData(0, 0, off.width, off.height).data, Math.round(100 / fps));
    if (onProgress) onProgress(i + 1, total);
    await new Promise((r) => setTimeout(r, 0));
  }
  return new Blob(gif.finish(), { type: 'image/gif' });
}

/** What speaks to a video player in a frame: `say('mute')`, `say('seekTo', 0)`… Each player has its own wording. */
function playerSay(frame, tiktok) {
  return (func, value) => frame.contentWindow && frame.contentWindow.postMessage(tiktok
    ? { type: func, value, 'x-tiktok-player': true }
    : JSON.stringify({ event: 'command', func, args: value === undefined ? [] : [value, true] }), '*');
}

/** A card laid over a video playing in a frame, as something a clip can be taken of: the card is photographed
 *  on screen. The player tells how long its video is in the messages it sends while it plays. */
function streamSource(stage, frame, say, tiktok) {
  let length = 0;
  const hear = (e) => {
    if (e.source !== frame.contentWindow || !e.data) return;
    if (tiktok) {
      const v = e.data.value;
      if (e.data['x-tiktok-player'] && e.data.type === 'onCurrentTime' && v && v.duration > 0) length = v.duration;
      return;
    }
    try {
      const told = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      if (told && told.info && told.info.duration > 0) length = told.info.duration;
    } catch (err) { /* not one of the player's messages */ }
  };
  window.addEventListener('message', hear);
  // YouTube's player only reports once it is told someone listens
  const listen = () => { if (!tiktok && frame.contentWindow) frame.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 'tvj', channel: 'widget' }), '*'); };
  frame.addEventListener('load', () => window.setTimeout(listen, 600));
  const tidy = window.setInterval(() => { if (!stage.isConnected) { window.removeEventListener('message', hear); window.clearInterval(tidy); } else if (!length) listen(); }, 2000);
  return { frame: () => captureElement(stage), length: () => length, restart: () => { say('seekTo', 0); say(tiktok ? 'play' : 'playVideo'); }, alive: () => stage.isConnected, video: true };
}

/** A card that draws a video file's frames itself: the canvas is the picture. (It already has Save video.)
 *  `paint(sheet, t)` (optional) draws the card over the video's current frame, `t` seconds into a GIF: with it the
 *  GIF is drawn frame by frame, the video moved to each moment in turn and played on afterwards. */
function videoSource(canvas, video, paint) {
  const source = { canvas, frame: async () => canvas, length: () => (Number.isFinite(video.duration) ? video.duration : 0), restart: () => { video.currentTime = 0; video.play().catch(() => {}); }, alive: () => canvas.isConnected, video: false };
  if (paint) {
    let playing = false;
    source.begin = () => { playing = !video.paused; video.pause(); };
    source.render = async (sheet, t) => { await seekVideo(video, t); paint(sheet, t); };
    source.end = () => { if (playing && canvas.isConnected) video.play().catch(() => {}); };
  }
  return source;
}

/** Records `seconds` of pictures taken with `grab()` (a card photographed on screen) at up to `fps`, each shown
 *  for as long as it really was, then encodes them as a GIF like captureCanvasGif. Null when nothing was taken. */
async function captureFramesGif(grab, seconds = 3, fps = 15, onProgress, maxW = 0, maxH = 0) {
  const total = Math.max(1, Math.round(seconds * fps));
  const shots = [];
  const start = performance.now();
  let held = 0;
  for (let i = 0; i < total; i++) {
    const wait = start + (i * 1000) / fps - performance.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    else if (performance.now() - start > seconds * 1000) break; // pictures come slower than asked: stop on time
    const picture = await grab();
    if (!picture) break;
    shots.push({ at: performance.now(), bitmap: await createImageBitmap(picture) });
    held += picture.width * picture.height * 4;
    if (held > 900e6) break; // keep what is held in memory under about 900 MB
  }
  if (!shots.length) return null;
  // the size it is saved at: the pictures' own; or, with maxW × maxH given, as large as fits that and keeps the
  // file about GIF_TARGET (a trial of the first pictures at 540p says how big it would be)
  const sw = shots[0].bitmap.width, sh = shots[0].bitmap.height;
  let fit = maxW && maxH ? Math.min(maxW / sw, maxH / sh) : 1;
  if (maxW && maxH) {
    const tw = Math.round((sw * 540) / sh / 2) * 2;
    const tc = document.createElement('canvas');
    tc.width = tw; tc.height = 540;
    const tctx = tc.getContext('2d', { willReadFrequently: true });
    let first = 0;
    const changes = [];
    const run = Math.min(5, shots.length);
    for (const start of [...new Set([0, 1, 2, 3].map((k) => Math.round((k * (shots.length - run)) / 3)))]) {
      const trial = new GifEncoder(tw, 540);
      for (const shot of shots.slice(start, start + run)) {
        tctx.drawImage(shot.bitmap, 0, 0, tw, 540);
        const before = trial.size;
        trial.addFrame(tctx.getImageData(0, 0, tw, 540).data, 2);
        if (!first) first = trial.size - before; else if (before > 0 && trial.chunks.length > 1) changes.push(trial.size - before);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    fit = Math.min(fit, gifSizeFor(gifEstimate(first, changes, shots.length)).h / sh);
  }
  const W = Math.round(sw * fit), H = Math.round(sh * fit);
  const off = document.createElement('canvas');
  off.width = W; off.height = H;
  const octx = off.getContext('2d', { willReadFrequently: true });
  const gif = new GifEncoder(W, H);
  for (let i = 0; i < shots.length; i++) {
    octx.clearRect(0, 0, W, H);
    octx.drawImage(shots[i].bitmap, 0, 0, W, H);
    shots[i].bitmap.close();
    const shown = i + 1 < shots.length ? shots[i + 1].at - shots[i].at : 1000 / fps;
    gif.addFrame(octx.getImageData(0, 0, W, H).data, Math.max(2, Math.round(shown / 10)));
    if (onProgress) onProgress(i + 1, shots.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  return new Blob(gif.finish(), { type: 'image/gif' });
}

/** "Export GIF" under a moving card: clipSeconds() at 50 frames a second, as large as keeps it about 10 MB (up to
 *  1080p, see GIF_TARGET), every frame with its own
 *  colours (see GifEncoder). `source.render`: the card is drawn frame by frame (see renderCardGif); otherwise
 *  `source.canvas` is read, or `source.frame()` photographs the card on screen (a YouTube or TikTok background,
 *  as many pictures a second as the screen gives, up to 50). The numbers count up again first when "Number
 *  animation" is on (`ctl.replay`) for the cards that are recorded rather than drawn. */
function addGifButton(plugin, actions, title, source, ctl) {
  const button = actions.createEl('button', { text: 'Export GIF' });
  let busy = false;
  button.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    button.disabled = true;
    if (ctl && !source.render && plugin.settings.cardAnimate !== false) ctl.replay();
    const notice = new Notice(tx(source.render ? 'Encoding the GIF…' : 'Recording the GIF…'), 0);
    const progress = (done, total) => notice.setMessage(`${tx('Encoding the GIF…')} ${done}/${total}`);
    try {
      const seconds = clipSeconds(plugin.settings);
      const blob = source.render ? await renderCardGif(source, progress, seconds)
        : source.canvas ? await captureCanvasGif(source.canvas, seconds, 15, progress)
        : await captureFramesGif(source.frame, seconds, GIF_FPS, progress, GIF_W, GIF_H);
      if (!blob) throw new Error('no pictures of the card');
      const saved = await plugin.saveClip(blob, title, 'gif');
      if (saved) notify(`Saved: ${saved}`);
    } catch (error) {
      console.error('TrueVision Journal: GIF export failed', error);
      notify('Could not make a GIF of this card.');
    } finally {
      notice.hide();
      busy = false;
      if (button.isConnected) button.disabled = false;
    }
  });
}

/** "Export video" under a card whose numbers count up but whose background stands still: clipSeconds() of the
 *  canvas, recorded from the start of the count. */
function addCountVideoButton(plugin, actions, title, canvas, ctl) {
  const button = actions.createEl('button', { text: 'Export video' });
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    if (ctl) ctl.replay();
    const notice = new Notice(tx('Recording the video…'), 0);
    try {
      const { blob, ext } = await recordCanvasVideo(canvas, clipSeconds(plugin.settings));
      const saved = await plugin.saveClip(blob, title, ext);
      if (saved) notify(`Saved: ${saved}`);
    } catch (error) {
      console.error('TrueVision Journal: card export failed', error);
      notify('This device cannot record a video of the card.');
    } finally {
      notice.hide();
      if (button.isConnected) button.disabled = false;
    }
  });
}

/** The Location button: where clips go, a way to open that folder, and a way to pick another one. */
function addLocationButton(plugin, actions) {
  const where = actions.createEl('button', { text: 'Location' });
  where.addEventListener('click', (e) => {
    const menu = new Menu();
    menu.addItem((item) => item.setTitle(`${tx('GIFs and videos are saved in:')} ${plugin.gifFolder()}`).setDisabled(true));
    menu.addItem((item) => item.setTitle(tx('Open that folder')).setIcon('folder-open').onClick(() => plugin.openGifFolder()));
    menu.addItem((item) => item.setTitle(tx('Choose another folder…')).setIcon('folder-plus').onClick(() => plugin.chooseGifFolder()));
    if (plugin.settings.gifFolder) menu.addItem((item) => item.setTitle(tx('Back to the vault folder')).setIcon('rotate-ccw').onClick(async () => { plugin.settings.gifFolder = ''; await plugin.saveData(plugin.settings); notify(`${tx('GIFs and videos are saved in:')} ${plugin.gifFolder()}`); }));
    menu.showAtMouseEvent(e);
  });
}

/** Adds Export GIF, Save video and Location to a moving card. Save video takes a video of a minute or less whole,
 *  from its start; a longer one (or one whose length is not known) gives the next 15 seconds. `title` names the
 *  file; `ctl` (optional) restarts the counting numbers for the GIF. */
function addClipButtons(plugin, actions, title, source, ctl) {
  let busy = false;
  // takes pictures of the card for the length of the clip; `each(picture, shownFor)` gets every one
  const take = async (button, label, each) => {
    const length = source.length();
    const whole = length > 0 && length <= 60;
    const seconds = whole ? length : 15;
    if (!await source.frame()) { notify('This device cannot photograph the card for a clip.'); return false; }
    if (whole) { source.restart(); await new Promise((resolve) => window.setTimeout(resolve, 400)); }
    else notify('The video is longer than a minute (or its length is not known yet): the next 15 seconds are recorded.');
    const started = Date.now();
    let before = started, held = null;
    while (Date.now() - started < seconds * 1000 && source.alive()) {
      const turn = Date.now();
      const picture = await source.frame();
      if (!picture) break;
      const now = Date.now();
      if (held) each(held, now - before); // a picture is shown until the next one was taken
      held = picture;
      before = now;
      button.setText(`${tx('Recording…')} ${Math.max(0, Math.ceil(seconds - (now - started) / 1000))}s`);
      const wait = 110 - (Date.now() - turn); // some nine pictures a second at most
      if (wait > 0) await new Promise((resolve) => window.setTimeout(resolve, wait));
    }
    if (held) each(held, Math.max(60, Date.now() - before), true);
    if (button.isConnected) button.setText(tx(label));
    return true;
  };
  const guarded = (button, label, run) => button.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    try { await run(); } catch (e) { notify('The clip could not be recorded. Keep the card in view while it records.'); }
    busy = false;
    if (button.isConnected) button.setText(tx(label));
  });

  addGifButton(plugin, actions, title, source, ctl);

  if (source.video) {
    const videoButton = actions.createEl('button', { text: 'Save video' });
    guarded(videoButton, 'Save video', async () => {
      if (source.fetch && await source.fetch()) return;
      const first = await source.frame();
      if (!first || typeof MediaRecorder === 'undefined') { notify('This device cannot record the card as a video.'); return; }
      const film = document.createElement('canvas');
      film.width = first.width - (first.width % 2);
      film.height = first.height - (first.height % 2);
      const ctx = film.getContext('2d');
      ctx.drawImage(first, 0, 0, film.width, film.height);
      const type = ['video/mp4;codecs=avc1.42E01E', 'video/webm;codecs=vp9', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
      if (!type || !film.captureStream) { notify('This device cannot record the card as a video.'); return; }
      const chunks = [];
      const recorder = new MediaRecorder(film.captureStream(15), { mimeType: type, videoBitsPerSecond: 6000000 });
      recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
      recorder.start();
      const done = await take(videoButton, 'Save video', (picture) => ctx.drawImage(picture, 0, 0, film.width, film.height));
      recorder.stop();
      await stopped;
      if (!done || !chunks.length) return;
      const saved = await plugin.saveClip(new Blob(chunks, { type }), title, type.startsWith('video/mp4') ? 'mp4' : 'webm');
      if (saved) notify(`Saved: ${saved}`);
    });
  }

  addLocationButton(plugin, actions);
}

/** Tilts a card in 3D after the mouse: it leans towards the pointer, a light glare follows it and the shadow
 *  falls the other way; it settles back flat when the mouse leaves. A finger scrolls the page instead, so touch
 *  leaves the card flat, and so does "reduce motion". */
function addCardTilt(card, max = 10) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  card.addClass('tvj-tilt');
  card.createDiv({ cls: 'tvj-tilt-glare' });
  let frame = 0, at = null;
  const apply = () => {
    frame = 0;
    if (!at) return;
    const rx = (0.5 - at.y) * max * 2, ry = (at.x - 0.5) * max * 2;
    card.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg) scale(1.02)`;
    card.style.boxShadow = `${-ry * 1.4}px ${rx * 1.4 + 24}px 48px -14px rgba(0,0,0,.65)`;
    card.style.setProperty('--tvj-gx', `${at.x * 100}%`);
    card.style.setProperty('--tvj-gy', `${at.y * 100}%`);
  };
  card.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = card.getBoundingClientRect();
    at = { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
    card.style.transition = 'transform .12s ease-out, box-shadow .12s ease-out';
    if (!frame) frame = window.requestAnimationFrame(apply);
  });
  card.addEventListener('pointerleave', () => {
    at = null;
    card.style.transition = 'transform .5s cubic-bezier(.2,.8,.2,1), box-shadow .5s cubic-bezier(.2,.8,.2,1)';
    card.style.transform = '';
    card.style.boxShadow = '';
  });
}

/** Whether an address is TikTok's (a video page, or one of its short share links). */
function isTikTok(link) {
  return /^https?:\/\/([a-z0-9-]+\.)?tiktok\.com\//i.test(String(link || '').trim());
}
/** A TikTok link without what the Share button adds: { id, address } with the video's own plain address, or null
 *  when the link does not name a video (a short share link has to be opened to learn that). */
function tiktokAddress(link) {
  const m = String(link || '').trim().match(/tiktok\.com\/(@[\w.-]*)\/(video|photo)\/(\d+)/i) || null;
  if (m) return { id: m[3], address: `https://www.tiktok.com/${m[1]}/${m[2]}/${m[3]}` };
  const old = String(link || '').match(/tiktok\.com\/v\/(\d+)/i) || String(link || '').match(/tiktok\.com\/(?:embed|player)\/(?:v\d\/)?(\d+)/i);
  return old ? { id: old[1], address: `https://www.tiktok.com/@/video/${old[1]}` } : null;
}
/** Whether a link is one of Instagram's share links (instagram.com/share/reel/…): it only leads to the post, and
 *  yt-dlp cannot read it, so it is followed to the post's own address first (see followInstagramShare). */
function isInstagramShare(link) {
  return /^https?:\/\/(www\.)?instagram\.com\/share\//i.test(String(link || '').trim());
}
/** The Instagram post an address or a page names, as its plain address ('https://www.instagram.com/reel/<id>/');
 *  '' when it names none. A login page's ?next=/reel/<id>/ counts, and /reels/ is read as /reel/. */
function instagramPost(text) {
  let s = String(text || '');
  try { s = decodeURIComponent(s); } catch (e) { /* kept as it is */ }
  const m = s.replace(/\\\//g, '/').match(/instagram\.com\/(?:[\w.]+\/)?(reels?|p|tv)\/([\w-]{5,})/i) || s.match(/^\/(reels?|p|tv)\/([\w-]{5,})/i);
  return m ? `https://www.instagram.com/${m[1].toLowerCase() === 'reels' ? 'reel' : m[1].toLowerCase()}/${m[2]}/` : '';
}
/** The address of TikTok's own embed player for that video: playing, looping, with nothing drawn over it. */
function tiktokEmbed(id) {
  return `https://www.tiktok.com/player/v1/${id}?autoplay=1&loop=1&controls=0&progress_bar=0&play_button=0&volume_control=0&fullscreen_button=0&timestamp=0&music_info=0&description=0&rel=0&native_context_menu=0&closed_caption=0`;
}

/** Keeps a YouTube background free of subtitles. The address already asks for none (cc_load_policy=0), but a video
 *  whose owner turned captions on by default shows them anyway, so once the player runs it is told to drop its
 *  captions — again every few seconds, because a looping video can bring them back. */
function noCaptions(frame) {
  const send = () => {
    if (!frame.isConnected || !frame.contentWindow) return;
    const post = (msg) => frame.contentWindow.postMessage(JSON.stringify(msg), '*');
    post({ event: 'listening', id: 'tvj-cc', channel: 'widget' });
    post({ event: 'command', func: 'unloadModule', args: ['captions'] });
    post({ event: 'command', func: 'unloadModule', args: ['cc'] });
    post({ event: 'command', func: 'setOption', args: ['captions', 'track', {}] });
  };
  frame.addEventListener('load', () => [700, 1800, 4000].forEach((ms) => window.setTimeout(send, ms)));
  const again = window.setInterval(() => { if (!frame.isConnected) window.clearInterval(again); else send(); }, 6000);
}

/** A stored streamed background ('<YouTube id>' or 'tiktok:<id>') as a silent, looping frame added to `parent`. */
function streamFrame(parent, stored) {
  const tiktok = String(stored).startsWith('tiktok:');
  const id = tiktok ? String(stored).slice(7) : stored;
  const src = tiktok ? tiktokEmbed(id) : youtubeEmbed({ video: id }, `autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&playsinline=1&rel=0&enablejsapi=1&cc_load_policy=0&iv_load_policy=3`);
  const frame = parent.createEl('iframe', { attr: { src, allow: 'autoplay; encrypted-media', referrerpolicy: 'strict-origin-when-cross-origin', tabindex: '-1', 'aria-hidden': 'true' } });
  // each player takes its own kind of message; `say('mute')` / `say('unMute')`
  const say = playerSay(frame, tiktok);
  if (tiktok) frame.addEventListener('load', () => setTimeout(() => say('mute'), 800)); // starts silent, like the others
  else noCaptions(frame);
  return { frame, say, tiktok };
}

/** `look` (optional): { progress: five 0→1 values for the counting numbers (hero, then the four stats),
 *  tone: 'normal' | 'bright' | 'dark' — how bright your own background measured (see cardBackgroundTone),
 *  upColor: a fixed colour for a positive hero number on the "Your picture" design }. */
/** A QR code (version 3, error correction M) that opens https://www.truevisiontrading.com: 29 rows of modules,
 *  1 = dark. Made once for that address (and read back with a phone's camera reader); the Copy desk card prints it. */
const SITE_QR = [
  '11111110010010011001101111111',
  '10000010000000000000001000001',
  '10111010111000101011101011101',
  '10111010101100001101001011101',
  '10111010100011110001101011101',
  '10000010101011111110101000001',
  '11111110101010101010101111111',
  '00000000110111010011100000000',
  '10111110001100110101001111100',
  '00001101001110011011101110001',
  '00100010111000000010100000000',
  '00010000110110101000010101010',
  '11101110111000000101000001100',
  '01101100010011110011101010001',
  '01001011000011111000110101100',
  '01000000110111011011011110010',
  '10111111101000100100100101100',
  '10001101100010001111101110101',
  '10100110110110011010100100100',
  '10110000011000101000000110010',
  '10011110000100000101111110111',
  '00000000101011101110100011111',
  '11111110010001111101101011100',
  '10000010111111000011100010000',
  '10111010110100110100111110110',
  '10111010101000001010100101111',
  '10111010110010010101011111110',
  '10000010010111101001100101010',
  '11111110110001000111000111100',
];

/** Each account's balance (start + every trade − payouts), for the Copy desk card; the plugin sets it. */
let cardBalances = () => ({});

/** The trades' P&L per account, best first: [{ account, net }]. */
function accountTotals(trades) {
  const by = new Map();
  for (const t of trades) by.set(accountName(t), (by.get(accountName(t)) || 0) + netPnl(t));
  return [...by].map(([account, net]) => ({ account, net })).sort((a, b) => b.net - a.net);
}

/** The Copy desk design: laid out like a copy-trading screenshot. Total accounts, a hidden total balance and the
 *  total profit on the left; every account's balance and P&L on the right (a loss in red, without a minus, as the
 *  screenshots show it; a balance not known, as ****); the holder at the bottom and a made-up QR-style square
 *  (drawn, not a real code). `prog` counts the numbers up. */
function drawCopyDesk(ctx, W, H, trades, holder, prog, skin, balances = cardBalances(), show = COPY_SHOW) {
  const rows = accountTotals(trades), net = sum(rows.map((r) => r.net));
  const known = rows.filter((r) => Number.isFinite(balances[r.account]));
  const totalBalance = known.length ? sum(known.map((r) => balances[r.account])) : null;
  const k = Math.max(0, Math.min(1, prog[0] === undefined ? 1 : prog[0]));
  const MONO = '"SF Mono", "JetBrains Mono", Menlo, Consolas, monospace';
  const box = (x, y, w, h, r, fill, line) => {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (line) { ctx.strokeStyle = line; ctx.lineWidth = 1.2; ctx.stroke(); }
  };
  const cash = (n) => `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const whole = (n) => `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
  // the blue background, a soft light from the top right, and a field of faint dots
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0B1E5B'); bg.addColorStop(0.55, '#1E4FD8'); bg.addColorStop(1, '#2A62E8');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const light = ctx.createRadialGradient(W * 0.8, H * 0.15, 20, W * 0.8, H * 0.15, W * 0.7);
  light.addColorStop(0, 'rgba(120,170,255,0.35)'); light.addColorStop(1, 'rgba(120,170,255,0)');
  ctx.fillStyle = light; ctx.fillRect(0, 0, W, H);
  const rnd = mulberry32(7);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 70; i++) { ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H, 2 + rnd() * 9, 0, Math.PI * 2); ctx.fill(); }
  // top left: the True Vision logo — a white eye with a four-pointed star in its dark iris — and "Truesyncer"
  // drawn on the logo's own 900 × 900 grid: the eye's two edges are arcs meeting in points at x 135 and 765, the
  // iris a circle (r 170) cut out of it so the card shows through, the star four points 105 from its middle
  ctx.save();
  const lk = 100 / 630, ox = 36, oy = 62; // 100 px wide; left point at (ox, oy)
  ctx.translate(ox - 135 * lk, oy - 450 * lk); ctx.scale(lk, lk);
  const er = 376.8, lean = Math.atan2(206.8, 315);
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(450, 656.8, er, -Math.PI + lean, -lean);
  ctx.arc(450, 243.2, er, lean, Math.PI - lean);
  ctx.closePath();
  ctx.moveTo(620, 450); ctx.arc(450, 450, 170, 0, Math.PI * 2, true);
  ctx.fill('evenodd');
  ctx.beginPath(); // the star: its sides curve in close to the middle
  const sr = 105, sw2 = 14;
  ctx.moveTo(450, 450 - sr);
  ctx.quadraticCurveTo(450 + sw2, 450 - sw2, 450 + sr, 450); ctx.quadraticCurveTo(450 + sw2, 450 + sw2, 450, 450 + sr);
  ctx.quadraticCurveTo(450 - sw2, 450 + sw2, 450 - sr, 450); ctx.quadraticCurveTo(450 - sw2, 450 - sw2, 450, 450 - sr);
  ctx.fill();
  ctx.restore();
  // beside it, the joke's name: True Vision's eye, the copy desk's name
  ctx.fillStyle = '#FFFFFF'; ctx.font = `700 42px ${SANS}`; ctx.textBaseline = 'middle';
  ctx.fillText('Truesyncer', 152, 64);
  // top right: the most traded symbol and when the last trade was
  const sorted = [...trades].sort(byTime), last = sorted[sorted.length - 1];
  const count = new Map(); for (const t of trades) count.set(t.symbol, (count.get(t.symbol) || 0) + 1);
  const symbol = [...count].sort((a, b) => b[1] - a[1])[0];
  ctx.textAlign = 'right';
  if (symbol) {
    ctx.fillStyle = '#FFFFFF'; ctx.font = `700 19px ${SANS}`; ctx.fillText(symbol[0], W - 40, 44);
    const sw = ctx.measureText(symbol[0]).width;
    // a small round flag before the symbol, kept inside its circle
    const fx = W - 58 - sw;
    ctx.save(); ctx.beginPath(); ctx.arc(fx, 44, 10, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#E8EEFF'; ctx.fillRect(fx - 10, 34, 20, 20);
    ctx.fillStyle = '#D33'; for (const y of [35, 39, 43, 47, 51]) ctx.fillRect(fx - 10, y, 20, 2);
    ctx.fillStyle = '#2B4FB8'; ctx.fillRect(fx - 10, 34, 10, 9);
    ctx.restore(); ctx.fillStyle = '#FFFFFF';
  }
  if (last) {
    const d = new Date(`${last.date}T${last.time || '00:00'}:00`);
    const when = `${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} at ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    ctx.font = `400 16px ${SANS}`; ctx.fillStyle = 'rgba(220,230,255,0.85)'; ctx.fillText(when, W - 40, 74);
  }
  ctx.textAlign = 'left';
  // the left column: three glass tiles
  const glass = 'rgba(255,255,255,0.10)', edge = 'rgba(255,255,255,0.22)';
  const L = 34, LW = 548;
  box(L, 128, LW, 120, 12, glass, edge);
  ctx.fillStyle = 'rgba(235,242,255,0.9)'; ctx.font = `400 16px ${SANS}`; ctx.fillText('Total Accounts', L + 26, 162);
  ctx.fillStyle = '#FFFFFF'; ctx.font = `700 40px ${SANS}`; ctx.fillText(String(Math.round(rows.length * k)), L + 26, 210);
  box(L, 264, LW, 120, 12, glass, edge);
  ctx.fillStyle = 'rgba(235,242,255,0.9)'; ctx.font = `400 16px ${SANS}`; ctx.fillText('Total Balance', L + 26, 298);
  ctx.fillStyle = '#FFFFFF'; ctx.font = `700 34px ${SANS}`; ctx.fillText(totalBalance === null || !show.balances ? '****' : whole(totalBalance), L + 26, 344);
  box(L, 400, LW, 190, 12, glass, edge);
  ctx.fillStyle = 'rgba(235,242,255,0.9)'; ctx.font = `400 16px ${SANS}`; ctx.fillText('Total Profit', L + 26, 434);
  ctx.fillStyle = net >= 0 ? '#22E07A' : '#FF6464';
  let size = 78; ctx.font = `800 ${size}px ${SANS}`;
  const big = cash(net * k);
  while (size > 40 && ctx.measureText(big).width > LW - 52) { size -= 4; ctx.font = `800 ${size}px ${SANS}`; }
  ctx.fillText(big, L + 24, 520);
  // the right column: every account, balances hidden
  const R = 618, RW = W - R - 34;
  box(R, 128, RW, 462, 12, 'rgba(255,255,255,0.09)', edge);
  ctx.fillStyle = '#FFFFFF'; ctx.font = `700 21px ${SANS}`; ctx.fillText('All Copy Traded Accounts', R + 18, 164);
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(R, 192, RW, 1);
  ctx.fillStyle = 'rgba(225,235,255,0.85)'; ctx.font = `600 13px ${SANS}`;
  ctx.fillText('ACCOUNT', R + 18, 218);
  ctx.textAlign = 'right'; ctx.fillText('BALANCE', R + RW - 150, 218); ctx.fillText('DAY P&L', R + RW - 18, 218); ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(R, 238, RW, 1);
  // seven rows, the last ones fading out under the list's edge, as a scrolled list does
  const shown = rows.slice(0, 7), fade = [1, 1, 1, 1, 1, 0.55, 0.2];
  shown.forEach((r, i) => {
    const y = 268 + i * 44;
    ctx.globalAlpha = rows.length > 5 ? fade[i] : 1;
    if (i) { ctx.fillStyle = 'rgba(255,255,255,0.09)'; ctx.fillRect(R, y - 22, RW, 1); }
    ctx.fillStyle = '#FFFFFF'; ctx.font = `600 15px ${MONO}`;
    const shownName = show.names ? (r.account.length > 22 ? `${r.account.slice(0, 21)}…` : r.account) : '****';
    ctx.fillText(shownName, R + 18, y + 2);
    const b = balances[r.account];
    ctx.textAlign = 'right'; ctx.fillText(Number.isFinite(b) && show.balances ? whole(b) : '****', R + RW - 150, y + 2);
    ctx.fillStyle = r.net >= 0 ? '#22E07A' : '#FF6464'; ctx.font = `600 17px ${MONO}`; ctx.fillText(cash(r.net * k), R + RW - 18, y + 2);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  });
  if (!rows.length) { ctx.fillStyle = 'rgba(225,235,255,0.8)'; ctx.font = `400 16px ${SANS}`; ctx.fillText('No trades in this period', R + 18, 280); }
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(R, 548, RW, 1);
  ctx.fillStyle = 'rgba(40,85,220,0.55)'; ctx.fillRect(R + 1, 549, RW - 2, 40);
  ctx.fillStyle = 'rgba(225,235,255,0.85)'; ctx.font = `400 16px ${SANS}`; ctx.textAlign = 'center';
  ctx.fillText(rows.length > shown.length ? `+${rows.length - shown.length} more accounts` : `${rows.length} account${rows.length === 1 ? '' : 's'}`, R + RW / 2, 570);
  ctx.textAlign = 'left';
  // bottom left: the holder; bottom right: a made-up QR-style square
  const name = String(holder || 'Trader');
  box(L, 610, 50, 50, 12, 'rgba(255,255,255,0.10)', 'rgba(255,255,255,0.45)');
  ctx.fillStyle = '#FFFFFF'; ctx.font = `700 20px ${SANS}`; ctx.textAlign = 'center'; ctx.fillText(name.charAt(0).toLowerCase(), L + 25, 636);
  ctx.textAlign = 'left'; ctx.font = `700 24px ${SANS}`; ctx.fillText(name.toLowerCase().replace(/\s+/g, '').slice(0, 24), L + 66, 636);
  // bottom right: a real QR code that opens the site (on white, with the quiet margin a reader needs)
  const cell = 2, q = SITE_QR.length * cell, pad = 2 * cell, qx = W - 34 - q - pad, qy = H - 16 - q - pad;
  box(qx - pad, qy - pad, q + 2 * pad, q + 2 * pad, 4, '#FFFFFF');
  ctx.fillStyle = '#000000';
  SITE_QR.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (row[c] === '1') ctx.fillRect(qx + c * cell, qy + r * cell, cell, cell); });

  ctx.textBaseline = 'alphabetic';
}

function drawFlexCard(canvas, trades, title, period, mode, skinKey, holder, picture, facts, cardName, look) {
  const skin = CARD_SKINS.find((k) => k.key === skinKey) || CARD_SKINS[0];
  const ctx = canvas.getContext('2d');
  if (skin.layout === 'copydesk') { ctx.clearRect(0, 0, CARD_W, CARD_H); drawCopyDesk(ctx, CARD_W, CARD_H, trades, holder, (look || {}).progress || [1], skin); return; }
  const W = CARD_W, H = CARD_H;
  const spaced = (v) => { ctx.letterSpacing = v; };
  const stats = computeStats(trades);
  const rs = trades.map(rMultiple).filter((r) => r !== null);
  const value = mode === 'money' ? stats.net : sum(rs);
  const up = value >= 0;
  const lk = look || {};
  const prog = lk.progress || [1, 1, 1, 1, 1];
  // your own background decides the text colours: a bright one takes dark text under a light veil
  const bright = !!(skin.custom && picture && lk.tone === 'bright');
  const ink = bright ? '#14161A' : skin.ink;
  const label = bright ? '#3A4553' : skin.label;
  let accent = up ? skin.up : skin.down;
  if (skin.custom && bright) accent = up ? '#0B6B43' : '#A31D1D';
  else if (skin.custom && up && picture && lk.tone === 'dark') accent = '#FFFFFF';
  else if (skin.custom && up && lk.upColor) accent = lk.upColor;

  // SEE_THROUGH: no background at all, only the veil and the text, for a card laid over a playing YouTube video
  const through = skin.custom && picture === SEE_THROUGH;
  ctx.clearRect(0, 0, W, H);
  if (!through) {
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, skin.bg[0]);
    bg.addColorStop(1, skin.bg[1]);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
  }
  if (skin.custom && picture) {
    // the picture fills the card (cropped from its centre, never stretched), under a dark veil that is heavier
    // on the left and at the bottom, where the numbers sit
    if (!through) {
      // a picture, or the current frame of a video
      const sw = picture.videoWidth || picture.width, sh = picture.videoHeight || picture.height;
      const scale = Math.max(W / sw, H / sh);
      const pw = sw * scale, ph = sh * scale;
      ctx.drawImage(picture, (W - pw) / 2, (H - ph) / 2, pw, ph);
    }
    const veil = ctx.createLinearGradient(0, 0, W, 0);
    veil.addColorStop(0, bright ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.72)');
    veil.addColorStop(1, bright ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.38)');
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, W, H);
    if (!bright) {
      const floor = ctx.createLinearGradient(0, H * 0.55, 0, H);
      floor.addColorStop(0, 'rgba(0,0,0,0)');
      floor.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = floor;
      ctx.fillRect(0, 0, W, H);
    }
  } else {
    const glow = ctx.createRadialGradient(W - 140, 60, 0, W - 140, 60, 620);
    glow.addColorStop(0, alpha(skin.glow, 0.38));
    glow.addColorStop(1, alpha(skin.glow, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
  }
  const tint = ctx.createRadialGradient(120, H + 40, 0, 120, H + 40, 520);
  tint.addColorStop(0, alpha(accent, 0.16));
  tint.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, W, H);
  // a band of light across the card, the way a metal card catches it
  const sheen = ctx.createLinearGradient(W * 0.2, 0, W * 0.75, H);
  sheen.addColorStop(0, alpha('#ffffff', 0));
  sheen.addColorStop(0.5, alpha('#ffffff', skin.sheen));
  sheen.addColorStop(1, alpha('#ffffff', 0));
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, W, H);
  // engraving, in the manner of a banknote or a classic charge card: wave-line ground, a laurel medallion as a
  // watermark, and a Greek-key band along the top and bottom edges. A card with your own picture stays plain.
  if (!skin.custom) drawEngraving(ctx, W, H, ink, skin.key);
  ctx.strokeStyle = alpha(ink, 0.28);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(24.5, 24.5, W - 49, H - 49, 24);
  ctx.stroke();
  if (skin.custom) {
    ctx.setLineDash([2, 5]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = alpha(ink, 0.22);
    ctx.beginPath();
    ctx.roundRect(33.5, 33.5, W - 67, H - 67, 17);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // chip (it can be left off the card: flex card dialog, "Show on the card")
  const cx = W - 64 - 76, cy = 112, cw = 76, ch = 54;
  if (CARD_CHIP) {
  const chip = ctx.createLinearGradient(cx, cy, cx + cw, cy + ch);
  chip.addColorStop(0, '#f1dfa3');
  chip.addColorStop(0.5, '#c9a548');
  chip.addColorStop(1, '#f3e3ad');
  ctx.fillStyle = chip;
  ctx.beginPath();
  ctx.roundRect(cx, cy, cw, ch, 9);
  ctx.fill();
  ctx.strokeStyle = 'rgba(70,50,10,0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const y of [cy + 18, cy + 36]) { ctx.moveTo(cx, y); ctx.lineTo(cx + 24, y); ctx.moveTo(cx + cw - 24, y); ctx.lineTo(cx + cw, y); }
  ctx.roundRect(cx + 24, cy + 9, cw - 48, ch - 18, 6);
  ctx.stroke();
  }

  // brand: the TRUE VISION wordmark, condensed capitals in one colour
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  spaced('0.5px');
  ctx.font = `400 40px ${DISPLAY}`;
  ctx.fillStyle = ink;
  ctx.fillText(BRAND, 64, 98);
  ctx.textAlign = 'right';
  spaced('0px');
  ctx.font = `500 20px ${SANS}`;
  ctx.fillStyle = alpha(ink, 0.62);
  ctx.fillText(period, W - 64, 92);

  ctx.textAlign = 'left';
  spaced('3px');
  ctx.font = `700 17px ${SANS}`;
  ctx.fillStyle = label;
  ctx.fillText(tx(mode === 'money' ? 'NET P&L' : 'TOTAL R'), 64, 196);
  const heroText = (v) => (mode === 'money'
    ? `${up ? '+' : ''}${money(Math.round(v))}`
    : rs.length ? `${up ? '+' : '−'}${Math.abs(v).toFixed(1)}R` : '—');
  const text = heroText(value);
  spaced('-3px');
  // sized on the final figure, so the number keeps its size while it counts up to it
  let size = 168;
  do {
    ctx.font = `800 ${size}px ${SANS}`;
    size -= 8;
  } while (ctx.measureText(text).width > 580 && size > 72);
  ctx.fillStyle = accent;
  ctx.fillText(prog[0] >= 1 ? text : heroText(value * prog[0]), 58, 356);
  spaced('-0.3px');
  ctx.font = `600 30px ${SANS}`;
  ctx.fillStyle = ink;
  const named = tx(title); // "All accounts" in the card's language (an account's own name stays as it is)
  ctx.fillText(named.length > 30 ? `${named.slice(0, 29)}…` : named, 64, 424);

  ctx.strokeStyle = alpha(ink, 0.16);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(64, 478.5);
  ctx.lineTo(W - 64, 478.5);
  ctx.stroke();
  // the four figures along the bottom: the period's statistics, or (`facts`) the facts of a single trade
  const cells = facts || [
    ['WIN RATE', `${(stats.winRate * prog[1]).toFixed(1)}%`],
    ['PROFIT FACTOR', stats.profitFactor === null ? '—' : (stats.profitFactor * prog[2]).toFixed(2)],
    ['TRADES', String(Math.round(stats.trades * prog[3]))],
    ['AVG RR', stats.rr === null ? '—' : (stats.rr * prog[4]).toFixed(2)],
  ];
  cells.forEach(([label, v], i) => {
    const x = 64 + i * ((W - 128) / 4);
    spaced('2.4px');
    ctx.font = `700 14px ${SANS}`;
    ctx.fillStyle = alpha(ink, 0.55);
    ctx.fillText(tx(label), x, 526);
    spaced('-0.4px');
    ctx.font = `700 44px ${SANS}`;
    ctx.fillStyle = ink;
    ctx.fillText(v, x, 582);
  });
  // the cardholder line: name, member since, and which card this is
  const first = trades.map((t) => t.date).sort()[0];
  spaced('2.6px');
  ctx.font = `600 17px ${SANS}`;
  ctx.fillStyle = alpha(ink, 0.7);
  // a single trade's card also names the account it was taken on, after the holder
  const account = facts && facts.account ? String(facts.account).toUpperCase() : '';
  ctx.fillText(`${String(holder || 'Trader').toUpperCase().slice(0, 28)}${account ? `  ·  ${account.slice(0, 26)}` : ''}`, 64, 620);
  ctx.textAlign = 'right';
  ctx.fillText(`${tx('MEMBER SINCE')} ${(first || isoDay(new Date())).slice(0, 4)}  ·  ${tx(String(cardName || skin.name)).toUpperCase()}`, W - 64, 620);
  ctx.textAlign = 'left';
  spaced('0px');
}

// Review questions: each answer can lead to a different next question.
const LOSS_REVIEW = [
  { id: 'plan', question: 'Was this trade in your pre-session plan?', options: [{ label: 'Yes', next: 'signal' }, { label: 'No', next: 'why-unplanned' }] },
  { id: 'why-unplanned', question: 'What pulled you into an unplanned trade?', options: [{ label: 'FOMO', next: 'next' }, { label: 'Revenge / making it back', next: 'next' }, { label: 'Boredom', next: 'next' }, { label: 'Misread the level', next: 'next' }] },
  { id: 'signal', question: 'Did you wait for your full entry signal?', options: [{ label: 'Yes', next: 'stop' }, { label: 'No, entered early', next: 'why-early' }] },
  { id: 'why-early', question: 'Why did you enter early?', options: [{ label: 'Fear of missing it', next: 'next' }, { label: 'Overconfidence', next: 'next' }, { label: 'Signal is not clearly defined', next: 'next' }] },
  { id: 'stop', question: 'Did you keep the stop where you planned it?', options: [{ label: 'Yes — a loss by the rules', next: 'next' }, { label: 'No, I moved it', next: 'next' }] },
  { id: 'next', question: 'What will you do differently next time?' },
];
const WIN_REVIEW = [
  { id: 'plan', question: 'Was this trade in your pre-session plan?', options: [{ label: 'Yes', next: 'exit' }, { label: 'No — a lucky win', next: 'lucky' }] },
  { id: 'lucky', question: 'Repeated 10 times, would this trade make money?', options: [{ label: 'Yes', next: 'repeat' }, { label: 'No', next: 'repeat' }, { label: 'Not sure', next: 'repeat' }] },
  { id: 'exit', question: 'How did you exit?', options: [{ label: 'At target', next: 'repeat' }, { label: 'Early, out of fear', next: 'repeat' }, { label: 'Held beyond the plan', next: 'repeat' }] },
  { id: 'repeat', question: 'What about this trade is worth repeating?' },
];
const stepsFor = (pnl) => (pnl >= 0 ? WIN_REVIEW : LOSS_REVIEW);

/** Replaces (or appends) the "## Review" section of a note body. */
function withReviewSection(content, answers) {
  const section = ['## Review', ...answers.map((a) => `- **${a.question}** ${a.answer}`)].join('\n');
  const stripped = content.replace(/\n## Review\n[\s\S]*?(?=\n## |$)/, '').replace(/\s+$/, '');
  return `${stripped}\n\n${section}\n`;
}

