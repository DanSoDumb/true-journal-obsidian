// ---------- flex card (same layout as the web journal's card) ----------

const CARD_W = 1200;
const CARD_H = 675;
const SANS = '"Be Vietnam Pro", system-ui, -apple-system, "Segoe UI", sans-serif';
const DISPLAY = "Anton, 'Bebas Neue', Impact, 'Haettenschweiler', 'Arial Narrow Bold', sans-serif";

// The name printed on shared cards. A site that hosts the journal under its own name sets it (see setBrand).
let BRAND = 'TRUE VISION';

// Card designs for the flex card. Each one opens at a rank (`from` = rank points); Classic is always there.
// ink = text colour on the card, label = the small caption colour, up / down = profit and loss colours that read on it.
const CARD_SKINS = [
  { key: 'classic', name: 'Classic', from: 0, tier: '', bg: ['#0A1020', '#0E1A33'], glow: '#3979DD', ink: '#FFFFFF', label: '#38BDF8', up: '#34D399', down: '#F87171', sheen: 0.04 },
  { key: 'bronze', name: 'Bronze', from: 150, tier: 'Bronze', bg: ['#2E1B0E', '#7A4A26'], glow: '#E0A070', ink: '#FFF4E8', label: '#F2C9A0', up: '#7BE3A8', down: '#FF9A8A', sheen: 0.10 },
  { key: 'silver', name: 'Silver', from: 280, tier: 'Silver', bg: ['#D9DDE3', '#8E96A2'], glow: '#FFFFFF', ink: '#12161D', label: '#3A4553', up: '#0B6B43', down: '#A31D1D', sheen: 0.30 },
  { key: 'gold', name: 'Gold', from: 400, tier: 'Gold', bg: ['#EBD083', '#A07C26'], glow: '#FFF3C4', ink: '#1C1504', label: '#5A4308', up: '#0B5E3A', down: '#8E1616', sheen: 0.30 },
  { key: 'platinum', name: 'Platinum', from: 510, tier: 'Platinum', bg: ['#F1F4F7', '#A9B2BE'], glow: '#FFFFFF', ink: '#0E1319', label: '#44505E', up: '#0B6B43', down: '#A31D1D', sheen: 0.36 },
  { key: 'emerald', name: 'Emerald', from: 610, tier: 'Emerald', bg: ['#06281F', '#127054'], glow: '#4FE0B0', ink: '#F2FFF9', label: '#8FF0CC', up: '#B8FFD9', down: '#FFB0A6', sheen: 0.10 },
  { key: 'sapphire', name: 'Diamond', from: 700, tier: 'Diamond', bg: ['#081C4D', '#2157D6'], glow: '#8CB4FF', ink: '#F4F8FF', label: '#A9C8FF', up: '#9DF5C4', down: '#FFB3B3', sheen: 0.12 },
  // your own picture as the card's background (see setCardPicture); the picture is darkened so the text stays readable
  { key: 'custom', name: 'Your picture', from: 0, tier: '', custom: true, bg: ['#15171c', '#2a2f3a'], glow: '#FFFFFF', ink: '#FFFFFF', label: '#FFFFFF', up: '#7CF2B0', down: '#FF9E9E', sheen: 0.03 },
  { key: 'black', name: 'Seraphim', from: 800, tier: 'Master', bg: ['#030303', '#1D1D1D'], glow: '#E9B44C', ink: '#F6F1E4', label: '#E9B44C', up: '#E9C877', down: '#F08A7A', sheen: 0.07 },
  { key: 'grandmaster', name: 'Grandmaster', from: 870, tier: 'Grandmaster', bg: ['#1F0306', '#8A111C'], glow: '#FF7A6B', ink: '#FFF1EA', label: '#FFB9A8', up: '#A8F5CB', down: '#FFD0C6', sheen: 0.09 },
  // a joke design laid out like a copy-trading screenshot: every account's P&L, balances hidden (drawCopyDesk)
  { key: 'copydesk', name: 'Truesyncer', from: 0, tier: '', layout: 'copydesk', fun: true, bg: ['#0B1E5B', '#2A62E8'], glow: '#7FA8FF', ink: '#FFFFFF', label: '#C9D8FF', up: '#22E07A', down: '#FF7A7A', sheen: 0.06 },
  { key: 'challenger', name: 'Challenger', from: 940, tier: 'Challenger', bg: ['#04131F', '#0E4A5C'], glow: '#F5D06F', ink: '#FFF6DC', label: '#F5D06F', up: '#F5D06F', down: '#FF9E8F', sheen: 0.12 },
];
// An admin of the site that hosts the journal has every card design, whatever their rank (see setVip).
let VIP = false;
// Whether cards carry the gold chip (the plugin sets it from its settings; see the flex card dialog).
let CARD_CHIP = true;
// What the Copy desk card shows (the plugin sets it from settings.cardShow): account names and balances, or ****.
let COPY_SHOW = { names: false, balances: true };
/** Which card designs a rank has opened. */
const unlockedSkins = (rank) => CARD_SKINS.filter((k) => VIP || k.from === 0 || (rank && rank.ranked && rank.score >= k.from));
/** '#rrggbb' with an opacity, as rgba(). */
const alpha = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;

// Rank pictures supplied by the site that hosts the journal (see setRankArt): { <tier in lower case>: { src, image } }.
// A member's own picture in their Ranks folder still wins; without either, the drawn emblem is used.
let RANK_ART = {};
const rankArtOf = (rank) => RANK_ART[(rank.ranked === false ? 'unranked' : String(rank.tier || '')).toLowerCase()] || null;

// The emblems printed on the cards, one per card design. A site that hosts the journal supplies them (see
// setCardArt): { <design key>: { image, fx, fy, zoom } }, where fx / fy say where the subject sits in the picture
// (0-1) and zoom how far to close in on it. A design without a picture carries the drawn helmet.
let CARD_ART = {};
const ART_CACHE = new Map();

/** A design's emblem as a round stamp in the card's ink: a square cut around the subject, turned into one colour.
 *  On a light card the picture's dark lines are inked; on a dark card its light areas are, so it never reads
 *  as a negative. */
function inkedArt(design, ink, size) {
  const art = CARD_ART[design];
  if (!art || !art.image) return null;
  const key = `${design}:${ink}:${size}`;
  if (ART_CACHE.has(key)) return ART_CACHE.get(key);
  const { image } = art;
  const stamp = document.createElement('canvas');
  stamp.width = stamp.height = size;
  const g = stamp.getContext('2d');
  const side = Math.min(image.width, image.height) / Math.max(1, art.zoom || 1);
  const at = (focus, full) => Math.max(0, Math.min(full - side, (focus === undefined ? 0.5 : focus) * full - side / 2));
  g.drawImage(image, at(art.fx, image.width), at(art.fy, image.height), side, side, 0, 0, size, size);
  const [r, gr, b] = [1, 3, 5].map((k) => parseInt(ink.slice(k, k + 2), 16));
  const lightInk = 0.2126 * r + 0.7152 * gr + 0.0722 * b > 140;
  try {
    const pixels = g.getImageData(0, 0, size, size);
    const d = pixels.data;
    for (let i = 0; i < d.length; i += 4) {
      const light = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      d[i] = r; d[i + 1] = gr; d[i + 2] = b;
      d[i + 3] = Math.round((lightInk ? light : 1 - light) * 255);
    }
    g.putImageData(pixels, 0, 0);
  } catch (e) {
    return null; // the picture cannot be read back (it came from another site): keep the drawn medallion
  }
  ART_CACHE.set(key, stamp);
  return stamp;
}

// which card design's emblem stands for a rank tier (the profile card shows the emblem of your rank)
const TIER_ART = { Unranked: 'classic', Iron: 'classic', Bronze: 'bronze', Silver: 'silver', Gold: 'gold', Platinum: 'platinum', Emerald: 'emerald', Diamond: 'sapphire', Master: 'black', Grandmaster: 'grandmaster', Challenger: 'challenger' };

/** A design's picture as a tall panel in one colour, fading out towards its left edge: for laying down one side
 *  of a dark card. The picture's light areas take the colour, so it reads as a print, not a negative. */
function inkedPanel(design, color, w, h) {
  const art = CARD_ART[design];
  if (!art || !art.image) return null;
  const key = `panel:${design}:${color}:${w}x${h}`;
  if (ART_CACHE.has(key)) return ART_CACHE.get(key);
  const { image } = art;
  const panel = document.createElement('canvas');
  panel.width = w;
  panel.height = h;
  const g = panel.getContext('2d');
  // fill the panel (cover), keeping the subject in view; a gentler close-up than the round emblem uses
  const zoom = 1 + ((art.zoom || 1) - 1) * 0.35;
  const scale = Math.max(w / image.width, h / image.height) * zoom;
  const sw = w / scale, sh = h / scale;
  const at = (focus, full, span) => Math.max(0, Math.min(full - span, (focus === undefined ? 0.5 : focus) * full - span / 2));
  g.drawImage(image, at(art.fx, image.width, sw), at(art.fy, image.height, sh), sw, sh, 0, 0, w, h);
  const [r, gr, b] = [1, 3, 5].map((k) => parseInt(color.slice(k, k + 2), 16));
  try {
    const pixels = g.getImageData(0, 0, w, h);
    const d = pixels.data;
    for (let i = 0; i < d.length; i += 4) {
      const light = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      d[i] = r; d[i + 1] = gr; d[i + 2] = b;
      d[i + 3] = Math.round((art.lines ? 1 - light : light) * 255); // lines: a black-on-white drawing keeps its lines
    }
    g.putImageData(pixels, 0, 0);
  } catch (e) {
    return null;
  }
  // fade: nothing at the left edge, full strength from two thirds across
  g.globalCompositeOperation = 'destination-in';
  const fade = g.createLinearGradient(0, 0, w, 0);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(0.65, 'rgba(0,0,0,1)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = fade;
  g.fillRect(0, 0, w, h);
  ART_CACHE.set(key, panel);
  return panel;
}

/** The engraved decoration of a card, drawn in the card's ink colour at low strength so text stays on top.
 *  All of it is drawn from scratch here: classical motifs (laurel, Greek key) and guilloche wave lines. */
function drawEngraving(ctx, W, H, ink, design) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(25, 25, W - 50, H - 50, 24);
  ctx.clip();

  // guilloche ground: two families of wave lines that cross each other
  ctx.lineWidth = 1;
  for (const [count, amp, freq, drift, strength] of [[34, 16, 0.0125, 0.55, 0.075], [34, 11, 0.021, -0.8, 0.055]]) {
    ctx.strokeStyle = alpha(ink, strength);
    for (let k = 0; k < count; k++) {
      const y0 = (k / (count - 1)) * (H + 60) - 30;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 6) {
        const y = y0 + amp * Math.sin(x * freq + k * drift) + amp * 0.45 * Math.sin(x * freq * 2.3 - k * 0.35);
        if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
  }

  // rosettes in the corners of the field: rings of overlapping circles, like lathe work
  const rosette = (cx, cy, radius, petals, strength) => {
    ctx.strokeStyle = alpha(ink, strength);
    for (let k = 0; k < petals; k++) {
      const a = (k / petals) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * radius * 0.5, cy + Math.sin(a) * radius * 0.5, radius * 0.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  };
  rosette(W * 0.3, H - 96, 120, 26, 0.06);
  rosette(130, 120, 110, 24, 0.05);

  // the emblem on the right half of the card: the site's picture as an inked stamp inside a coin rim, or,
  // when the site has none, a drawn helmet
  const mx = W * 0.775, my = H * 0.43, mr = 168;
  const art = inkedArt(design, ink, 2 * Math.round(mr * 0.72));
  // the frame, drawn like the rim of a coin so it is the same all the way round: a firm inner ring, a fine
  // ring, a row of evenly spaced beads and an outer ring
  const r = mr * 0.72;
  const rim = art ? 1 : 0.4; // with a picture the emblem is the card's feature; the drawn helmet stays a watermark
  if (art) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalAlpha = 0.88;
    ctx.drawImage(art, mx - r, my - r, r * 2, r * 2);
    ctx.restore();
  }
  const ring = (radius, width, strength) => {
    ctx.strokeStyle = alpha(ink, strength * rim);
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(mx, my, radius, 0, Math.PI * 2);
    ctx.stroke();
  };
  ring(r, 3, 0.6);
  ring(r + 7, 1, 0.45);
  ring(r + 25, 1.5, 0.5);
  const beads = 72;
  ctx.fillStyle = alpha(ink, 0.5 * rim);
  for (let k = 0; k < beads; k++) {
    const a = (k / beads) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(mx + Math.cos(a) * (r + 16), my + Math.sin(a) * (r + 16), 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (!art) {
    // a legionary's helmet seen from the front: crest, dome, brow band, cheek guards, nose guard
    ctx.save();
    ctx.translate(mx, my + 8);
    ctx.scale(1.1, 1.1);
    ctx.fillStyle = alpha(ink, 0.17);
    ctx.beginPath();
    ctx.ellipse(0, -44, 56, 40, 0, Math.PI, 0);
    ctx.ellipse(0, -44, 38, 20, 0, 0, Math.PI, true);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = alpha(ink, 0.2);
    ctx.lineWidth = 1.5;
    for (let k = -5; k <= 5; k++) {
      const a = -Math.PI / 2 + k * 0.26;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 38, -44 + Math.sin(a) * 20);
      ctx.lineTo(Math.cos(a) * 56, -44 + Math.sin(a) * 40);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.ellipse(0, -2, 40, 44, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-45, -2, 90, 9, 3);
    ctx.fill();
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 42, 9);
      ctx.lineTo(side * 42, 44);
      ctx.quadraticCurveTo(side * 38, 62, side * 20, 66);
      ctx.quadraticCurveTo(side * 12, 50, side * 14, 9);
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath();
    ctx.roundRect(-4, 9, 8, 26, 3);
    ctx.fill();
    ctx.restore();
  }

  // Greek-key band along the top and bottom edges
  const unit = 16;
  const key = [[0, 1], [0, 0], [0.82, 0], [0.82, 0.74], [0.3, 0.74], [0.3, 0.36], [0.58, 0.36]];
  ctx.strokeStyle = alpha(ink, 0.3);
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'miter';
  const x0 = 52, units = Math.floor((W - x0 * 2) / unit);
  const start = (W - units * unit) / 2;
  for (const top of [36, H - 30 - unit]) {
    ctx.beginPath();
    for (let u = 0; u < units; u++) {
      key.forEach(([px, py], i) => {
        const x = start + (u + px) * unit, y = top + py * unit;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      });
    }
    ctx.moveTo(start, top + unit);
    ctx.lineTo(start + units * unit, top + unit);
    ctx.stroke();
  }
  ctx.restore();
}

// video files that can be a card's background (the card then moves, and can be saved as a short video)
const CARD_VIDEO_EXTS = ['mp4', 'webm', 'mov', 'm4v'];
const SEE_THROUGH = 'see-through';
// the backgrounds (see pictureFile) that may be a video as well as a picture
const MOVING_PICTURES = ['profile-card', 'gym-card', 'wallpaper'];
/** Width and height of something drawable: a picture, or a video's frame. */
const sizeOf = (p) => ({ w: p.videoWidth || p.width, h: p.videoHeight || p.height });

// The flex card's numbers count up like a Framer spring counter: a critically damped spring, the hero number
// first and each statistic a beat later. COUNT_LENGTH is when the last one has settled.
const COUNT_STIFFNESS = 7;
const COUNT_STAGGER = 0.12;
const COUNT_LENGTH = 1.9;
/** The five counting numbers' progress (0 → 1) `t` seconds into the count. */
const countProgress = (t) => [0, 1, 2, 3, 4].map((i) => {
  const s = Math.max(0, t - i * COUNT_STAGGER);
  if (s <= 0) return 0;
  const p = 1 - (1 + COUNT_STIFFNESS * s) * Math.exp(-COUNT_STIFFNESS * s);
  return p > 0.9995 ? 1 : p;
});

// "Auto contrast" for your own background: the linear luminance behind the text, with a gap between switching
// in and out so a moving video does not make the colours flicker.
const TONE_BRIGHT_IN = 0.42, TONE_BRIGHT_OUT = 0.34, TONE_DARK_IN = 0.012, TONE_DARK_OUT = 0.02;
let toneProbe = null;
/** Average linear luminance (0 black → 1 white) of a picture/video frame where the card's text sits. */
function cardTextAreaLuma(media) {
  const mw = media.videoWidth || media.width, mh = media.videoHeight || media.height;
  if (!mw || !mh) return 0.5;
  if (!toneProbe) { toneProbe = document.createElement('canvas'); toneProbe.width = 96; toneProbe.height = 54; }
  const g = toneProbe.getContext('2d', { willReadFrequently: true });
  const k = CARD_W / 96, s = Math.max(CARD_W / mw, CARD_H / mh);
  g.clearRect(0, 0, 96, 54);
  g.drawImage(media, (CARD_W - mw * s) / 2 / k, (CARD_H - mh * s) / 2 / k, (mw * s) / k, (mh * s) / k);
  let d;
  try { d = g.getImageData(4, 10, 60, 40).data; } catch (e) { return 0.5; }
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  let total = 0;
  for (let i = 0; i < d.length; i += 4) total += 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
  return total / (d.length / 4);
}
/** 'bright' | 'dark' | 'normal' for a background, staying with `current` unless the change is clear. */
function cardBackgroundTone(media, current) {
  const l = cardTextAreaLuma(media);
  if (current === 'bright') return l < TONE_BRIGHT_OUT ? 'normal' : 'bright';
  if (current === 'dark') return l > TONE_DARK_OUT ? 'normal' : 'dark';
  return l > TONE_BRIGHT_IN ? 'bright' : l < TONE_DARK_IN ? 'dark' : 'normal';
}
/** The fixed hero colour picked under "Text colour" (null = the design's own green, or auto contrast). */
function cardUpColor(settings) {
  const c = settings.cardTextColor;
  if (c === 'white') return '#FFFFFF';
  if (c === 'gold') return '#E9C877';
  if (c === 'custom') return /^#[0-9a-f]{6}$/i.test(settings.cardTextCustom || '') ? settings.cardTextCustom : '#34D399';
  return null;
}

/** A picture of an element exactly as it is on screen, frames from other sites included (desktop Obsidian only:
 *  it asks the app window for its pixels). Resolves to a canvas, or null where the window cannot be captured. */
async function captureElement(el) {
  try {
    const electron = typeof window.require === 'function' ? window.require('electron') : null;
    const remote = electron && electron.remote;
    if (!remote) return null;
    el.scrollIntoView({ block: 'nearest' });
    await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
    const box = el.getBoundingClientRect();
    const zoom = electron.webFrame ? electron.webFrame.getZoomFactor() : 1;
    const image = await remote.getCurrentWebContents().capturePage({ x: Math.round(box.left * zoom), y: Math.round(box.top * zoom), width: Math.round(box.width * zoom), height: Math.round(box.height * zoom) });
    if (!image || image.isEmpty()) return null;
    const picture = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = image.toDataURL();
    });
    if (!picture) return null;
    const canvas = document.createElement('canvas');
    canvas.width = picture.width;
    canvas.height = picture.height;
    canvas.getContext('2d').drawImage(picture, 0, 0);
    return canvas;
  } catch (e) {
    return null;
  }
}

/** What a YouTube address points at: { video } and / or { list } (a playlist); null when it is neither. */
function youtubeTarget(link) {
  const text = String(link || '');
  const video = (text.match(/(?:[?&]v=|youtu\.be\/|\/shorts\/|\/live\/|\/embed\/)([\w-]{11})/) || [])[1] || '';
  const list = (text.match(/[?&]list=([\w-]+)/) || [])[1] || '';
  return video || list ? { video, list } : null;
}
/** The address that plays it inside a frame. `extra`: more player settings, as a query string. */
function youtubeEmbed(target, extra) {
  // www.youtube.com/embed, the address Obsidian's own YouTube embeds use: the player refuses to start
  // ("video unavailable") when it is not told which page embeds it, and Obsidian supplies that for this address
  const base = target.video ? `https://www.youtube.com/embed/${target.video}` : 'https://www.youtube.com/embed/videoseries';
  const query = [target.list ? `list=${target.list}` : '', extra || ''].filter(Boolean).join('&');
  return query ? `${base}?${query}` : base;
}

