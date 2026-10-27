// ---------- rank emblems ----------
//
// Original badge set: every tier has its own frame shape, flat two-tone facets (no gradients or gloss), and the
// division is shown inside the badge as stacked chevrons (III = 1 ... I = 3). Apex tiers carry a cut gem instead.
// emblemSpec() returns plain filled shapes in a 120x120 box, drawn as SVG on screen and on a canvas for the card.

const mixHex = (hex, other, amount) => {
  const a = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
  const b = [1, 3, 5].map((k) => parseInt(other.slice(k, k + 2), 16));
  return `#${a.map((v, k) => Math.round(v + (b[k] - v) * amount).toString(16).padStart(2, '0')).join('')}`;
};

// Each tier has its own badge colour and gem colour (the tier's text colour stays in TIERS).
const EMBLEM_LOOK = [
  { metal: '#6f6a6c', gem: '#b0a8a2' }, // Iron
  { metal: '#a9683f', gem: '#f0b483' }, // Bronze
  { metal: '#98a6b6', gem: '#eef5ff' }, // Silver
  { metal: '#d9a531', gem: '#fff3b8' }, // Gold
  { metal: '#35a79f', gem: '#c0fff5' }, // Platinum
  { metal: '#24a85f', gem: '#bfffd6' }, // Emerald
  { metal: '#5878f2', gem: '#d6e4ff' }, // Diamond
  { metal: '#a34ce4', gem: '#f6d2ff' }, // Master
  { metal: '#d93a45', gem: '#ffbb78' }, // Grandmaster
  { metal: '#e3b548', gem: '#86dcff' }, // Challenger
];

// Frame outline per tier, symmetric about x = 60, listed clockwise from the top.
const FRAMES = [
  [[60, 16], [96, 30], [92, 76], [60, 104], [28, 76], [24, 30]],                                                   // Iron: plain shield
  [[26, 20], [94, 20], [100, 58], [60, 106], [20, 58]],                                                           // Bronze: flat-topped shield
  [[60, 12], [100, 34], [100, 80], [60, 106], [20, 80], [20, 34]],                                                // Silver: hexagon
  [[60, 10], [78, 24], [102, 26], [98, 74], [60, 108], [22, 74], [18, 26], [42, 24]],                             // Gold: crested shield
  [[60, 8], [92, 24], [104, 58], [86, 92], [60, 110], [34, 92], [16, 58], [28, 24]],                              // Platinum: cut stone
  [[60, 8], [82, 22], [110, 34], [96, 78], [60, 112], [24, 78], [10, 34], [38, 22]],                              // Emerald: broad shoulders
  [[60, 6], [90, 30], [112, 58], [90, 88], [60, 114], [30, 88], [8, 58], [30, 30]],                               // Diamond: rhombus
  [[60, 6], [74, 28], [106, 24], [98, 56], [110, 82], [78, 86], [60, 114], [42, 86], [10, 82], [22, 56], [14, 24], [46, 28]], // Master: star shield
  [[60, 2], [72, 26], [108, 18], [100, 54], [114, 84], [80, 86], [60, 116], [40, 86], [6, 84], [20, 54], [12, 18], [48, 26]], // Grandmaster: sharper star
  [[60, 0], [72, 24], [112, 12], [102, 52], [118, 86], [82, 86], [60, 118], [38, 86], [2, 86], [18, 52], [8, 12], [48, 24]],  // Challenger: widest star
];

/** Part of a polygon on one side of the vertical centre line (Sutherland–Hodgman against x = 60). */
function halfOf(pts, right) {
  const inside = ([x]) => (right ? x >= 60 : x <= 60);
  const out = [];
  pts.forEach((cur, k) => {
    const prev = pts[(k + pts.length - 1) % pts.length];
    if (inside(cur) !== inside(prev)) {
      const t = (60 - prev[0]) / (cur[0] - prev[0]);
      out.push([60, prev[1] + (cur[1] - prev[1]) * t]);
    }
    if (inside(cur)) out.push(cur);
  });
  return out;
}

function emblemSpec(rank) {
  const unranked = rank.ranked === false;
  const index = unranked ? 0 : Math.max(0, TIERS.findIndex((t) => t.name === rank.tier));
  const look = unranked ? { metal: '#666a72', gem: '#9aa0aa' } : EMBLEM_LOOK[index];
  const tone = (amount) => (amount >= 0 ? mixHex(look.metal, '#ffffff', amount) : mixHex(look.metal, '#000000', -amount));
  const path = (pts) => `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')} Z`;
  const shrink = (pts, k) => pts.map(([x, y]) => [60 + (x - 60) * k, 61 + (y - 61) * k]);
  const shapes = [];
  // a polygon painted as two flat halves: lit on the left, shaded on the right
  const split = (pts, left, right) => {
    shapes.push({ d: path(halfOf(pts, false)), fill: left });
    shapes.push({ d: path(halfOf(pts, true)), fill: right });
  };
  const frame = FRAMES[index];

  if (index === 9 && !unranked) { // Challenger: a ring of rays behind the badge, in the gem colour
    for (let k = 0; k < 8; k++) {
      const a = (Math.PI / 4) * k + Math.PI / 8;
      const pt = (r, da) => [60 + Math.cos(a + da) * r, 60 + Math.sin(a + da) * r];
      shapes.push({ d: path([pt(34, -0.2), pt(60, 0), pt(34, 0.2)]), fill: k % 2 ? look.gem : mixHex(look.gem, '#000000', 0.25) });
    }
  }
  split(frame, tone(-0.5), tone(-0.62));                        // rim
  split(shrink(frame, 0.86), tone(0.2), tone(-0.08));           // face
  split(shrink(frame, 0.6), tone(-0.34), tone(-0.46));          // recessed centre

  if (unranked) return { shapes, mark: '?' };
  if (rank.apex || !rank.division) {
    // apex tiers and tier-only badges: a cut gem in four flat facets
    const g = TIERS[index].apex ? 15 : 11;
    const top = [60, 61 - g * 1.5], right = [60 + g, 61], bottom = [60, 61 + g * 1.5], left = [60 - g, 61], mid = [60, 61];
    shapes.push({ d: path([top, mid, left]), fill: '#ffffff' });
    shapes.push({ d: path([top, right, mid]), fill: mixHex(look.gem, '#ffffff', 0.35) });
    shapes.push({ d: path([left, mid, bottom]), fill: look.gem });
    shapes.push({ d: path([mid, right, bottom]), fill: mixHex(look.gem, '#000000', 0.28) });
  } else {
    // divisions: III = 1 chevron ... I = 3 chevrons, stacked and centred
    const count = DIVISIONS.indexOf(rank.division) + 1;
    const w = 16, drop = 7.5, thick = 5.2, gap = 10;
    const start = 61 - ((count - 1) * gap + drop + thick) / 2;
    for (let k = 0; k < count; k++) {
      const y = start + k * gap;
      split([[60, y + drop], [60 + w, y], [60 + w, y + thick], [60, y + drop + thick], [60 - w, y + thick], [60 - w, y]], '#ffffff', mixHex(look.gem, '#ffffff', 0.2));
    }
  }
  return { shapes, mark: '' };
}

const EMBLEM_BOX = [120, 120];

/** Rank emblem as inline SVG. `size` is the width; the box is 6:5. */
function emblemSvg(rank, size) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${EMBLEM_BOX[0]} ${EMBLEM_BOX[1]}`);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(Math.round(size * EMBLEM_BOX[1] / EMBLEM_BOX[0])));
  svg.setAttribute('class', 'tvj-emblem');
  const spec = emblemSpec(rank);
  const defs = document.createElementNS(NS, 'defs');
  svg.appendChild(defs);
  const uid = `tvj-g${Math.random().toString(36).slice(2, 8)}`;
  spec.shapes.forEach((shape, k) => {
    const el = document.createElementNS(NS, 'path');
    el.setAttribute('d', shape.d);
    if (shape.stops) {
      const g = document.createElementNS(NS, shape.radial ? 'radialGradient' : 'linearGradient');
      g.setAttribute('id', `${uid}-${k}`);
      g.setAttribute('gradientUnits', 'userSpaceOnUse');
      const attrs = shape.radial ? { cx: shape.radial[0], cy: shape.radial[1], r: shape.radial[2] } : { x1: 0, y1: 8, x2: 0, y2: 172 };
      for (const [a, v] of Object.entries(attrs)) g.setAttribute(a, String(v));
      shape.stops.forEach((color, n) => {
        const stop = document.createElementNS(NS, 'stop');
        stop.setAttribute('offset', String(n / (shape.stops.length - 1)));
        stop.setAttribute('stop-color', color);
        if (shape.fade && n === shape.stops.length - 1) stop.setAttribute('stop-opacity', '0');
        g.appendChild(stop);
      });
      defs.appendChild(g);
      el.setAttribute('fill', `url(#${uid}-${k})`);
    } else el.setAttribute('fill', shape.fill || 'none');
    const stroke = shape.stroke || shape.line;
    if (stroke) {
      el.setAttribute('stroke', stroke);
      el.setAttribute('stroke-width', String(shape.width || 1));
      el.setAttribute('stroke-linejoin', 'round');
      el.setAttribute('stroke-linecap', 'round');
    }
    if (shape.opacity !== undefined) el.setAttribute('opacity', String(shape.opacity));
    svg.appendChild(el);
  });
  if (spec.mark) {
    const text = document.createElementNS(NS, 'text');
    for (const [k, v] of Object.entries({ x: '60', y: '73', 'text-anchor': 'middle', fill: '#fff', 'font-size': '34', 'font-weight': '800', 'font-family': 'system-ui, sans-serif' })) text.setAttribute(k, v);
    text.textContent = spec.mark;
    svg.appendChild(text);
  }
  return svg;
}

/** The same emblem on a canvas, `width` wide with its top-left corner at (x, y). */
function drawEmblem(ctx, rank, x, y, width) {
  const spec = emblemSpec(rank);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(width / EMBLEM_BOX[0], width / EMBLEM_BOX[0]);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const shape of spec.shapes) {
    const path = new Path2D(shape.d);
    ctx.globalAlpha = shape.opacity === undefined ? 1 : shape.opacity;
    if (shape.stops) {
      const g = shape.radial ? ctx.createRadialGradient(shape.radial[0], shape.radial[1], 0, shape.radial[0], shape.radial[1], shape.radial[2]) : ctx.createLinearGradient(0, 8, 0, 172);
      shape.stops.forEach((color, n) => {
        const last = n === shape.stops.length - 1;
        g.addColorStop(n / (shape.stops.length - 1), shape.fade && last ? `${color}00` : color);
      });
      ctx.fillStyle = g;
      ctx.fill(path);
    } else if (shape.fill) {
      ctx.fillStyle = shape.fill;
      ctx.fill(path);
    }
    const stroke = shape.stroke || shape.line;
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = shape.width || 1;
      ctx.stroke(path);
    }
  }
  ctx.globalAlpha = 1;
  if (spec.mark) {
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = `800 34px ${SANS}`;
    ctx.fillText(spec.mark, 60, 73);
  }
  ctx.restore();
}

/** The profile as a shareable image: rank, level, form and the headline numbers. */
/** The verified tick: a blue seal with a white check, centred on (cx, cy). */
function drawVerified(ctx, cx, cy, radius) {
  const points = 14, inner = radius * 0.78;
  ctx.save();
  ctx.fillStyle = '#2D8CFF';
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (Math.PI / points) * i - Math.PI / 2;
    const k = i % 2 ? inner : radius;
    if (i) ctx.lineTo(cx + k * Math.cos(a), cy + k * Math.sin(a)); else ctx.moveTo(cx + k * Math.cos(a), cy + k * Math.sin(a));
  }
  ctx.closePath();
  ctx.fill();
  const u = radius / 27;
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 6.5 * u;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  ctx.moveTo(cx - 11 * u, cy + u);
  ctx.lineTo(cx - 3.5 * u, cy + 8.5 * u);
  ctx.lineTo(cx + 11.5 * u, cy - 7 * u);
  ctx.stroke();
  ctx.restore();
}

function drawProfileCard(canvas, profile, mode, image, avatar, background) {
  const ctx = canvas.getContext('2d');
  const W = CARD_W, H = CARD_H;
  const { rank, level, stats, name, tag, streaks, form, badges } = profile;
  const spaced = (v) => { ctx.letterSpacing = v; };

  // SEE_THROUGH: no ground and no picture, only the veil and the text, for a card laid over a playing YouTube video
  // what the card shows: every part can be left out (Profile card dialog)
  const show = { emblem: true, rank: true, form: true, pf: true, win: true, rr: true, journal: true, gym: true, ...(profile.show || {}) };
  const through = background === SEE_THROUGH;
  const moving = through || (typeof HTMLVideoElement !== 'undefined' && background instanceof HTMLVideoElement);
  ctx.clearRect(0, 0, W, H);
  if (!through) {
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#090d18');
    bg.addColorStop(1, '#101a30');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(232, 260, 0, 232, 260, 560);
    glow.addColorStop(0, `${rank.color}66`);
    glow.addColorStop(1, `${rank.color}00`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
  }
  // the picture of your rank down the right side of the card, printed in the rank's colour and fading into the card
  const panel = background ? null : inkedPanel(TIER_ART[rank.tier] || 'classic', rank.color, 560, 453); // down to the divider line
  if (background) {
    // your own picture fills the card (cropped from its centre), under a dark veil so the text stays readable
    // A moving background (a video file, or a video playing behind the card) reaches the card's edge: the inner
    // frame would show as a dark box with the video bright around it.
    ctx.save();
    if (!moving) {
      ctx.beginPath();
      ctx.roundRect(25, 25, W - 50, H - 50, 24);
      ctx.clip();
    }
    if (!through) {
      const { w: bw, h: bh } = sizeOf(background);
      const k = Math.max(W / bw, H / bh);
      ctx.drawImage(background, (W - bw * k) / 2, (H - bh * k) / 2, bw * k, bh * k);
    }
    const veil = ctx.createLinearGradient(0, 0, W, 0);
    veil.addColorStop(0, moving ? 'rgba(6,9,16,0.7)' : 'rgba(6,9,16,0.84)');
    veil.addColorStop(0.55, moving ? 'rgba(6,9,16,0.45)' : 'rgba(6,9,16,0.6)');
    veil.addColorStop(1, moving ? 'rgba(6,9,16,0.2)' : 'rgba(6,9,16,0.3)');
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, W, H);
    const floor = ctx.createLinearGradient(0, H * 0.6, 0, H);
    floor.addColorStop(0, 'rgba(6,9,16,0)');
    floor.addColorStop(1, 'rgba(6,9,16,0.7)');
    ctx.fillStyle = floor;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  if (panel) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(25, 25, W - 50, H - 50, 24);
    ctx.clip();
    ctx.globalAlpha = 0.5;
    ctx.drawImage(panel, W - 25 - 560, 25);
    ctx.restore();
  }
  ctx.strokeStyle = moving ? 'rgba(255,255,255,0)' : 'rgba(255,255,255,0.09)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(24.5, 24.5, W - 49, H - 49, 24);
  ctx.stroke();

  // emblem
  if (!show.emblem) { /* left out */ } else if (image) { // your own rank picture, fitted into the emblem's box
    const k = Math.min(384 / image.width, 320 / image.height);
    ctx.drawImage(image, 44 + (384 - image.width * k) / 2, 116 + (320 - image.height * k) / 2, image.width * k, image.height * k);
  } else drawEmblem(ctx, rank, 84, 124, 304);
  // your profile picture, as a round badge on the emblem's lower right, ringed in the rank's colour
  if (avatar) {
    const ax = 352, ay = 392, ar = 54;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax, ay, ar, 0, Math.PI * 2);
    ctx.clip();
    const k = Math.max((ar * 2) / avatar.width, (ar * 2) / avatar.height);
    ctx.drawImage(avatar, ax - (avatar.width * k) / 2, ay - (avatar.height * k) / 2, avatar.width * k, avatar.height * k);
    ctx.restore();
    ctx.strokeStyle = '#0b0f1a';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(ax, ay, ar + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = rank.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(ax, ay, ar + 7, 0, Math.PI * 2);
    ctx.stroke();
  }

  // identity. Without the emblem (and with no profile picture in its place) it starts at the card's left margin,
  // in line with the figures below, rather than staying beside an empty space.
  const left = show.emblem || avatar ? 440 : 64;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  spaced('3px');
  ctx.font = `700 17px ${SANS}`;
  ctx.fillStyle = '#38BDF8';
  ctx.fillText(BRAND === 'TRUE VISION' ? tx('TRUEVISION · TRADER PROFILE') : `${BRAND} · ${tx('Trader profile').toUpperCase()}`, left, 110);
  spaced('-1px');
  ctx.font = `800 62px ${SANS}`;
  ctx.fillStyle = '#FFFFFF';
  const shownName = name.length > 18 ? `${name.slice(0, 17)}…` : name;
  ctx.fillText(shownName, left - 2, 184);
  if (profile.verified) drawVerified(ctx, left - 2 + ctx.measureText(shownName).width + 44, 162, 27);
  spaced('0px');
  ctx.font = `400 22px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.62)';
  ctx.fillText(tag || tx(`Level ${level.level} · ${level.xp.toLocaleString('en-US')} XP`), left, 222);

  if (show.rank) {
    spaced('-1px');
    ctx.font = `800 70px ${SANS}`;
    ctx.fillStyle = rank.color;
    ctx.fillText(tx(rank.label), left - 2, 322);
    spaced('0px');
    ctx.font = `600 24px ${SANS}`;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    // a rank picked to be shown in place of your own carries no points of its own
    ctx.fillText(tx(profile.rankPicked ? `Level ${level.level}` : rank.ranked ? `${rank.score} RP · Level ${level.level}` : `Placement: ${rank.need} more trade${rank.need === 1 ? '' : 's'} to be ranked`), left, 362);
  }

  // form strip (it moves up into the rank's place when the rank is left out)
  let fx = left;
  const formY = show.rank ? 392 : 290;
  for (const r of show.form ? form : []) {
    ctx.fillStyle = r > 0 ? '#34D399' : r < 0 ? '#F87171' : 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.roundRect(fx, formY, 30, 12, 6);
    ctx.fill();
    fx += 38;
  }

  const cells = [
    show.pf && ['PROFIT FACTOR', stats.profitFactor === null ? '—' : stats.profitFactor.toFixed(2)],
    show.win && ['WIN RATE', `${stats.winRate.toFixed(1)}%`],
    show.rr && (mode === 'money' ? ['PAYOUTS', money(Math.round(profile.payouts || 0))] : ['AVG RR', stats.rr === null ? '—' : stats.rr.toFixed(2)]),
    show.journal && ['JOURNAL STREAK', `${streaks.journal.cur}d`],
    show.gym && ['GYM STREAK', `${streaks.gym.cur}w`],
  ].filter(Boolean);
  if (cells.length) {
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.moveTo(64, 478.5);
    ctx.lineTo(W - 64, 478.5);
    ctx.stroke();
  }
  cells.forEach(([label, v], i) => {
    const x = 64 + i * ((W - 128) / 5); // the same five places, filled from the left
    spaced('2.4px');
    ctx.font = `700 14px ${SANS}`;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(tx(label), x, 526);
    spaced('-0.4px');
    ctx.font = `700 40px ${SANS}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(v, x, 580);
  });
  spaced('0px');
  ctx.font = `400 16px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.42)';
  const footer = tx(`TrueVision Journal · rank from the last ${rank.n} trade${rank.n === 1 ? '' : 's'}`);
  if (show.rank && !profile.rankPicked) ctx.fillText(BRAND === 'TRUE VISION' ? footer : footer.replace(/^TrueVision Journal/, BRAND), 64, 630);
}

class ProfileCardModal extends ThemedModal {
  constructor(app, plugin, profile) {
    super(app);
    this.plugin = plugin;
    this.profile = profile;
    this.mode = 'r';
    this.moving = new MovingCard(plugin);
  }
  onOpen() {
    this.modalEl.addClass('tvj-flex-modal');
    this.render();
  }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    accentTitle(contentEl, 'h2', 'Profile card');
    const controls = contentEl.createDiv({ cls: 'tvj-options' });
    const mode = controls.createEl('select', { cls: 'dropdown' });
    mode.createEl('option', { text: 'Hide money (show average R)', value: 'r' });
    mode.createEl('option', { text: 'Show payouts in $', value: 'money' });
    mode.value = this.mode;
    mode.addEventListener('change', () => { this.mode = mode.value; this.render(); });
    // the blue tick after your name: switched here, where you see it
    if (this.plugin.source === 'own') {
      const on = !!this.plugin.settings.profileVerified;
      this.profile.verified = on;
      controls.createEl('button', { text: on ? 'Verified tick: on' : 'Verified tick: off', attr: { 'aria-pressed': String(on) } }).addEventListener('click', async () => {
        this.plugin.settings.profileVerified = !on;
        await this.plugin.saveData(this.plugin.settings);
        this.render();
      });
    }
    if (this.plugin.source === 'own') {
      const settings = this.plugin.settings;
      // which rank the card shows: your own, or any rank you have already reached (an admin: any at all)
      this.realRank = this.realRank || this.profile.rank;
      const real = this.realRank;
      const open = TIERS.filter((t) => VIP || (real.ranked && t.from <= real.score));
      const picked = open.find((t) => t.name === settings.profileRankShown && t.name !== real.tier) || null;
      this.profile.rank = picked ? { ...real, ...rankFromScore(picked.from) } : real;
      this.profile.rankPicked = !!picked;
      if (open.length > 1) {
        const rankPick = controls.createEl('select', { cls: 'dropdown', attr: { 'aria-label': 'Rank shown on the card' } });
        rankPick.createEl('option', { text: `${tx('My rank')} (${tx(real.label)})`, value: '' });
        for (const t of open) if (t.name !== real.tier) rankPick.createEl('option', { text: tx(t.name), value: t.name });
        rankPick.value = picked ? picked.name : '';
        rankPick.addEventListener('change', async () => { settings.profileRankShown = rankPick.value; await this.plugin.saveData(settings); this.render(); });
      }
      // what the card shows: each part switches on and off
      this.profile.show = { ...(settings.profileShow || {}) };
      const parts = contentEl.createDiv({ cls: 'tvj-options tvj-card-parts' });
      parts.createSpan({ cls: 'tvj-muted', text: 'Show on the card:' });
      for (const [key, label] of [['emblem', 'Rank emblem'], ['rank', 'Rank'], ['form', 'Win / loss bar'], ['pf', 'Profit factor'], ['win', 'Win rate'], ['rr', 'Avg RR'], ['journal', 'Journal streak'], ['gym', 'Gym streak']]) {
        const on = this.profile.show[key] !== false;
        parts.createEl('button', { text: label, cls: `tvj-chip ${on ? 'is-on' : ''}`, attr: { 'aria-pressed': String(on) } }).addEventListener('click', async () => {
          settings.profileShow = { ...(settings.profileShow || {}), [key]: !on };
          await this.plugin.saveData(settings);
          this.render();
        });
      }
    }
    // a YouTube background (own profile only): the video plays in a frame, the card lies over it, see-through.
    // The frame's picture cannot be read, so the still kept for copies is drawn apart, with the video's cover.
    const youtube = this.plugin.source === 'own' && !!this.plugin.pictureFile('profile-card') && ((this.plugin.settings.pictureYouTube || {})['profile-card'] || '');
    let canvas, still, stage = null, frame = null;
    let stream = null;
    if (youtube) {
      stage = contentEl.createDiv({ cls: `tvj-flex-stage ${String(youtube).startsWith('tiktok:') ? 'is-upright' : ''}` });
      stream = streamFrame(stage, youtube);
      frame = stream.frame;
      canvas = stage.createEl('canvas', { cls: 'tvj-flex-canvas' });
      still = document.createElement('canvas');
      still.width = CARD_W;
      still.height = CARD_H;
    } else {
      canvas = contentEl.createEl('canvas', { cls: 'tvj-flex-canvas' });
      still = canvas;
    }
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    drawProfileCard(canvas, this.profile, this.mode, null, null, youtube ? SEE_THROUGH : undefined);
    // the rank picture, your profile picture and your own background arrive a moment later: draw again with them
    this.moving.stop();
    Promise.all([this.plugin.rankPicture(this.profile.rank), this.plugin.avatarImage(), this.plugin.loadPicture('profile-card')]).then(([image, avatar, background]) => {
      if (!canvas.isConnected) return;
      if (youtube) {
        drawProfileCard(canvas, this.profile, this.mode, image, avatar, SEE_THROUGH);
        drawProfileCard(still, this.profile, this.mode, image, avatar, background);
        return;
      }
      const draw = () => drawProfileCard(canvas, this.profile, this.mode, image, avatar, background);
      if (image || avatar || background) draw();
      // a video background: the card plays, with sound and Save video buttons
      if (background instanceof HTMLVideoElement) {
        this.moving.start(canvas, background, draw, actions, `Profile ${this.profile.name}`,
          { file: this.plugin.pictureFile('profile-card'), overlay: (sheet) => drawProfileCard(sheet, this.profile, this.mode, image, avatar, SEE_THROUGH) });
        addClipButtons(this.plugin, actions, `Profile ${this.profile.name}`, videoSource(canvas, background, (sheet) => drawProfileCard(sheet, this.profile, this.mode, image, avatar, background)));
      }
    });
    if (youtube) contentEl.createEl('p', { cls: 'tvj-muted', text: String(youtube).startsWith('tiktok:') ? 'Copy image and Save to vault take the card as it looks at that moment of the video. Save GIF records one turn of a TikTok video under a minute.' : 'Copy image and Save to vault take the card as it looks at that moment of the video. A YouTube video cannot be saved as a moving card; upload a video file for that.' });
    // your own picture as the card's background, in place of the rank's picture
    if (this.plugin.source === 'own') this.plugin.pictureButtons(controls, 'profile-card', () => this.render());
    const actions = contentEl.createDiv({ cls: 'tvj-options' });
    // over a YouTube video the picture is a capture of the screen; where that is not possible, the cover stands in
    const shot = async () => (stage && await captureElement(stage)) || still;
    actions.createEl('button', { text: 'Copy image', cls: 'mod-cta' }).addEventListener('click', async () => copyCanvas(await shot(), 'Profile card copied to the clipboard.'));
    actions.createEl('button', { text: 'Save to vault' }).addEventListener('click', async () => {
      const picture = await shot();
      const file = await this.plugin.saveFlexCard(await new Promise((resolve) => picture.toBlob(resolve, 'image/png')), `Profile ${this.profile.name}`);
      if (file) notify(`Saved: ${file.path}`);
    });
    if (stream) this.moving.soundButton(actions, (on) => stream.say(on ? 'unMute' : 'mute'));
    if (stream) {
      const take = (picked) => this.plugin.savePicture('profile-card', picked);
      addClipButtons(this.plugin, actions, `Profile ${this.profile.name}`, downloadOnSave(this.plugin, streamSource(stage, stream.frame, stream.say, stream.tiktok), streamLink(youtube), take, () => { this.plugin.refreshViews(); this.render(); }));
    }
  }
  onClose() {
    this.moving.stop();
    this.contentEl.empty();
  }
}

/** The lobby: who you are as a trader right now — rank, level, form — and one click to everything else. */
