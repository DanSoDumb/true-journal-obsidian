// ---------- gym card ----------

// the three built-in looks of the gym card: which picture (see setCardArt) and which colour it is printed in
const GYM_CARDS = [
  { key: 'gym-arm', name: 'Strength', color: '#F0616D' },
  { key: 'gym-sword', name: 'Discipline', color: '#5FD4A0' },
  { key: 'gym-calm', name: 'Balance', color: '#E9B44C' },
  { key: 'custom', name: 'Your picture', color: '#E9B44C' },
];

/** What every gym card starts from: the dark ground, the picture down the right side (a built-in look printed in
 *  its colour, or your own under a veil), the frame and the coloured bar. Returns the drawing context. */
function gymCardBase(canvas, look, picture) {
  const ctx = canvas.getContext('2d');
  const W = CARD_W, H = CARD_H;
  const color = look.color;
  const spaced = (v) => { ctx.letterSpacing = v; };
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0b0c0f');
  bg.addColorStop(1, '#15171c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(25, 25, W - 50, H - 50, 24);
  ctx.clip();
  if (look.key === 'custom' && picture) {
    const { w: pw, h: ph } = sizeOf(picture);
    const k = Math.max(W / pw, H / ph);
    ctx.drawImage(picture, (W - pw * k) / 2, (H - ph * k) / 2, pw * k, ph * k);
    const veil = ctx.createLinearGradient(0, 0, W, 0);
    veil.addColorStop(0, 'rgba(8,9,12,0.86)');
    veil.addColorStop(0.55, 'rgba(8,9,12,0.62)');
    veil.addColorStop(1, 'rgba(8,9,12,0.3)');
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, W, H);
  } else {
    const glow = ctx.createRadialGradient(W - 220, H * 0.4, 0, W - 220, H * 0.4, 620);
    glow.addColorStop(0, alpha(color, 0.22));
    glow.addColorStop(1, alpha(color, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    const panel = inkedPanel(look.key, color, 520, H - 50);
    if (panel) {
      ctx.globalAlpha = 0.9;
      ctx.drawImage(panel, W - 25 - 520, 25);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(24.5, 24.5, W - 49, H - 49, 24);
  ctx.stroke();
  // a bar of the card's colour down the left edge
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(25, 110, 6, 250, 3);
  ctx.fill();
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  return ctx;
}

/** The gym card: the streak as the big number, this week against the target, sixteen weeks of training as
 *  squares and four totals. `data`: { holder, streak, week, target, month, minutes, total, best, grid }. */
function drawGymCard(canvas, data, look, picture) {
  const ctx = gymCardBase(canvas, look, picture);
  const W = CARD_W;
  const color = look.color;
  const spaced = (v) => { ctx.letterSpacing = v; };
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  spaced('3px');
  ctx.font = `700 17px ${SANS}`;
  ctx.fillStyle = color;
  ctx.fillText(`${BRAND} · GYM`, 64, 92);
  spaced('0px');
  ctx.font = `600 26px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.86)';
  ctx.fillText(String(data.holder || 'Trader').slice(0, 26), 64, 130);

  // the streak
  spaced('-6px');
  ctx.font = `800 210px ${SANS}`;
  ctx.fillStyle = '#FFFFFF';
  const big = String(data.streak);
  ctx.fillText(big, 54, 330);
  const bigW = ctx.measureText(big).width;
  spaced('3px');
  ctx.font = `700 20px ${SANS}`;
  ctx.fillStyle = color;
  ctx.fillText(tx(data.streak === 1 ? 'WEEK ON TARGET' : 'WEEKS IN A ROW'), 64 + bigW + 22, 276);
  spaced('0px');
  ctx.font = `500 22px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(`${data.week} / ${data.target} ${tx('this week')}`, 64 + bigW + 22, 312);

  // sixteen weeks as squares: one column per week, Monday on top
  const weeks = data.grid.weeks.slice(-16);
  const cell = 15, gap = 5, gx = 64, gy = 372;
  weeks.forEach((week, w) => {
    week.forEach((day, d) => {
      if (day.future) return;
      ctx.fillStyle = day.level ? alpha(color, 0.3 + day.level * 0.175) : 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.roundRect(gx + w * (cell + gap), gy + d * (cell + gap) * 0.62, cell, cell * 0.62 + 2, 3);
      ctx.fill();
    });
  });

  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.moveTo(64, 478.5);
  ctx.lineTo(W - 64, 478.5);
  ctx.stroke();
  const hours = `${Math.floor(data.minutes / 60)}h ${String(data.minutes % 60).padStart(2, '0')}m`;
  const cells = [
    ['SESSIONS', String(data.total)],
    ['THIS MONTH', String(data.month)],
    ['TIME THIS MONTH', hours],
    ['BEST LIFT', data.best ? `${data.best.weight ? `${data.best.weight} · ` : ''}${data.best.name}`.slice(0, 20) : '—'],
  ];
  cells.forEach(([label, v], i) => {
    const x = 64 + i * ((W - 128) / 4);
    spaced('2.4px');
    ctx.font = `700 14px ${SANS}`;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(tx(label), x, 526);
    spaced('-0.4px');
    ctx.font = `700 ${String(v).length > 12 ? 28 : 40}px ${SANS}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(v, x, 580);
  });
  spaced('2.6px');
  ctx.font = `600 15px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText(txIn('gym', look.name).toUpperCase(), 64, 626);
  spaced('0px');
}

/** Total weight moved in a session: sets × reps × weight, summed over the exercises that have a weight. */
const sessionVolume = (g) => sum(g.exercises.map((e) => (e.weight ? e.sets * e.reps * e.weight : 0)));

/** The card of one finished session: what was trained, for how long, the exercises, and four totals.
 *  `data`: { holder, session, streak, records } — records = names of the exercises that set a personal best. */
function drawGymSessionCard(canvas, data, look, picture) {
  const ctx = gymCardBase(canvas, look, picture);
  const W = CARD_W;
  const color = look.color;
  const g = data.session;
  const spaced = (v) => { ctx.letterSpacing = v; };
  spaced('3px');
  ctx.font = `700 17px ${SANS}`;
  ctx.fillStyle = color;
  ctx.fillText(`${BRAND} · ${tx('SESSION')}`, 64, 92);
  spaced('0px');
  ctx.font = `600 26px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.86)';
  ctx.fillText(String(data.holder || 'Trader').slice(0, 26), 64, 130);

  // what was trained, as the headline
  spaced('1px');
  let size = 104; // room above for accented capitals (CHÂN, ĐẨY) so they clear the name
  const headline = tx(g.kind).toUpperCase();
  do { ctx.font = `400 ${size}px ${DISPLAY}`; size -= 8; } while (ctx.measureText(headline).width > 560 && size > 56);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(headline, 62, 262);
  spaced('0px');
  ctx.font = `500 22px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  const when = dayAt(g.date).toLocaleDateString(LANG === 'vi' ? 'vi-VN' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  ctx.fillText(`${when.charAt(0).toUpperCase()}${when.slice(1)}${g.minutes ? ` · ${g.minutes} ${tx('min')}` : ''}`, 64, 300);

  // the exercises, heaviest work first; a star marks a personal best
  const rows = (g.exercises.length ? [...g.exercises].sort((a, b) => (b.weight || 0) - (a.weight || 0)).map((e) => [e.name, `${e.sets}×${e.reps}${e.weight ? ` · ${e.weight}` : ''}`, data.records.includes(e.name.toLowerCase())])
    : g.lines.map((l) => [l, '', false])).slice(0, 4);
  rows.forEach(([name, work, record], k) => {
    const y = 346 + k * 32;
    ctx.font = `500 21px ${SANS}`;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText(`${record ? '★ ' : ''}${String(name).slice(0, 30)}`, 64, y);
    ctx.textAlign = 'right';
    ctx.font = `700 21px ${SANS}`;
    ctx.fillStyle = record ? color : 'rgba(255,255,255,0.92)';
    ctx.fillText(work, 600, y);
    ctx.textAlign = 'left';
  });
  const more = Math.max(g.exercises.length, g.lines.length) - rows.length;
  if (more > 0) {
    ctx.font = `500 17px ${SANS}`;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(`+ ${more} ${tx('more exercises')}`, 64, 346 + rows.length * 32);
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.moveTo(64, 478.5);
  ctx.lineTo(W - 64, 478.5);
  ctx.stroke();
  const volume = sessionVolume(g);
  const cells = [
    ['EXERCISES', String(Math.max(g.exercises.length, g.lines.length))],
    ['SETS', String(sum(g.exercises.map((e) => e.sets)))],
    ['VOLUME', volume ? volume.toLocaleString('en-US') : '—'],
    ['WEEK STREAK', String(data.streak)],
  ];
  cells.forEach(([label, v], i) => {
    const x = 64 + i * ((W - 128) / 4);
    spaced('2.4px');
    ctx.font = `700 14px ${SANS}`;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(tx(label), x, 526);
    spaced('-0.4px');
    ctx.font = `700 40px ${SANS}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(v, x, 580);
  });
  spaced('2.6px');
  ctx.font = `600 15px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText(txIn('gym', look.name).toUpperCase(), 64, 626);
  spaced('0px');
}

/** Gym card: pick one of the looks (or your own picture), then copy or save the card. */
class GymCardModal extends ThemedModal {
  /** `session`: draw the card of that one session instead of the overall gym card. */
  constructor(app, plugin, session) {
    super(app);
    this.plugin = plugin;
    this.session = session || null;
    this.moving = new MovingCard(plugin);
  }

  onOpen() {
    this.modalEl.addClass('tvj-flex-modal');
    this.render();
  }

  render() {
    const { contentEl } = this;
    const settings = this.plugin.settings;
    contentEl.empty();
    accentTitle(contentEl, 'h2', this.session ? 'Session card' : 'Gym card');
    const sessions = this.plugin.getGymSessions().map((x) => x.session);
    const target = Math.max(1, Number(settings.gymTarget) || 3);
    const st = gymStats(sessions, target);
    // heaviest lift on record
    const best = gymRecords(sessions).filter((r) => r.weight).sort((a, b) => b.weight - a.weight)[0] || null;
    const data = { holder: settings.profileName, streak: st.streak, week: st.week, target, month: st.month, minutes: st.minutes, total: sessions.length, best, grid: gymGrid(sessions) };
    // for one session: the exercises whose best lift on record was set on that day
    const g = this.session;
    const records = g ? gymRecords(sessions).filter((r) => r.weight && r.date === g.date).map((r) => r.name.toLowerCase()) : [];
    const sessionData = g ? { holder: settings.profileName, session: g, streak: st.streak, records } : null;
    const paint = (look, picture) => (g ? drawGymSessionCard(canvas, sessionData, look, picture) : drawGymCard(canvas, data, look, picture));

    const hasPicture = !!this.plugin.pictureFile('gym-card');
    let chosen = GYM_CARDS.find((k) => k.key === settings.gymCard) || GYM_CARDS[0];
    if (chosen.key === 'custom' && !hasPicture) chosen = GYM_CARDS[0];
    const picker = contentEl.createDiv({ cls: 'tvj-skins' });
    const tools = contentEl.createDiv({ cls: 'tvj-options tvj-skin-tools' });
    const own = this.plugin.source === 'own';
    // the lobby's gym card follows the design picked here (the views redraw, then this dialog)
    const pick = async (key) => { settings.gymCard = key; await this.plugin.saveData(settings); this.plugin.refreshViews(); this.render(); };
    if (own) this.plugin.pictureButtons(tools, 'gym-card', (added) => pick(added ? 'custom' : GYM_CARDS[0].key));
    for (const k of GYM_CARDS) {
      const b = picker.createEl('button', { cls: `tvj-skin ${k.key === chosen.key ? 'is-active' : ''}`, attr: { 'aria-pressed': String(k.key === chosen.key) } });
      const chip = b.createSpan({ cls: 'tvj-skin-chip' });
      chip.style.background = k.key === 'custom' && hasPicture ? `center / cover url("${this.app.vault.getResourcePath(this.plugin.pictureFile('gym-card'))}")` : `linear-gradient(135deg, #111317, ${k.color})`;
      const text = b.createSpan({ cls: 'tvj-skin-text' });
      text.createSpan({ cls: 'tvj-skin-name', text: txIn('gym', k.name) });
      text.createSpan({ cls: 'tvj-tile-sub', text: k.key === 'custom' ? (hasPicture ? 'Your background' : 'Upload a background') : 'Gym card' });
      if (!own) { b.disabled = true; continue; }
      b.addEventListener('click', () => {
        if (k.key === 'custom' && !hasPicture) { tools.querySelector('button').click(); return; }
        pick(k.key);
      });
    }

    const canvas = contentEl.createEl('canvas', { cls: 'tvj-flex-canvas' });
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    paint(chosen);
    const saveName = g ? `Gym ${g.date} ${g.kind}` : `Gym ${isoDay(new Date())}`;
    const actions = contentEl.createDiv({ cls: 'tvj-options' });
    actions.createEl('button', { text: 'Copy image', cls: 'mod-cta' }).addEventListener('click', () => copyCanvas(canvas, 'Gym card copied to the clipboard.'));
    actions.createEl('button', { text: 'Save to vault' }).addEventListener('click', async () => {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const file = await this.plugin.saveFlexCard(blob, saveName);
      if (file) notify(`Saved: ${file.path}`);
    });
    this.moving.stop();
    if (chosen.key === 'custom') {
      this.plugin.loadPicture('gym-card').then((picture) => {
        if (!picture || !canvas.isConnected) return;
        paint(chosen, picture);
        // a video background: the card plays, with sound and Save video buttons
        if (picture instanceof HTMLVideoElement) this.moving.start(canvas, picture, () => paint(chosen, picture), actions, saveName);
      });
    }
  }

  onClose() {
    this.moving.stop();
    this.contentEl.empty();
  }
}

