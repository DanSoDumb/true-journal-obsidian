// ---------- Nhẫn: a small game of patience. Tap the seal to count one "nhẫn"; or hold it, and let go only when
// the ring is full. Levels, a daily streak, and a line to remember while waiting for the trade. ----------

const NHAN_LEVELS = [
  { at: 0, name: 'Tập sự' },
  { at: 100, name: 'Biết chờ' },
  { at: 500, name: 'Bình tĩnh' },
  { at: 2000, name: 'Định tâm' },
  { at: 5000, name: 'Lặng như nước' },
  { at: 10000, name: 'Vững như núi' },
  { at: 30000, name: 'Bất động tâm' },
  { at: 100000, name: 'Thiền sư' },
];
const NHAN_LINES = [
  'Không có setup thì không có lệnh.',
  'Ngồi yên cũng là một vị thế.',
  'Lệnh đẹp sẽ tự đến, không cần đuổi theo.',
  'Thua một lệnh không sao. Mất kỷ luật mới đáng sợ.',
  'Thị trường không biết bạn đang vội.',
  'Đợi giá đến vùng của mình, đừng đi tìm giá.',
  'Không vào lệnh cũng là một quyết định tốt.',
  'Gỡ lại là cách nhanh nhất để mất thêm.',
  'Kế hoạch trước, bấm nút sau.',
  'Một ngày không lệnh vẫn là một ngày xanh cho tài khoản.',
  'Stop đã đặt thì để nó làm việc.',
  'Nóng tay thì đứng dậy đi uống nước.',
  'Chờ nến đóng rồi hãy tin.',
  'Lợi nhuận đến từ những lệnh bạn bỏ qua đúng lúc.',
  'Thở ra trước khi bấm Buy.',
];
/** Where a total stands: { level, index, next, share (0..1 to the next level) }. */
function nhanLevel(total) {
  let index = 0;
  for (let i = 0; i < NHAN_LEVELS.length; i++) if (total >= NHAN_LEVELS[i].at) index = i;
  const level = NHAN_LEVELS[index], next = NHAN_LEVELS[index + 1] || null;
  return { level, index, next, share: next ? (total - level.at) / (next.at - level.at) : 1 };
}
/** Days in a row, ending today (or yesterday while today is still empty), with at least one nhẫn. */
function nhanStreak(days, today) {
  let streak = 0;
  const d = new Date(`${today}T12:00:00`);
  if (!(days[today] > 0)) d.setDate(d.getDate() - 1);
  while (days[isoDay(d)] > 0) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}

class NhanView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.mode = 'tap';
    this.combo = 0;
    this.lastTap = 0;
  }
  getViewType() { return NHAN_VIEW_TYPE; }
  getDisplayText() { return 'Nhẫn'; }
  getIcon() { return 'circle-dot'; }
  async onOpen() {
    this.render();
    // the space bar taps, while this screen has the focus
    this.registerDomEvent(this.contentEl, 'keydown', (e) => {
      if (e.code !== 'Space' || e.repeat || this.mode !== 'tap' || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      e.preventDefault();
      this.tap();
    });
  }
  async onClose() { this.contentEl.empty(); }
  state() {
    const s = this.plugin.settings;
    if (!s.nhan || typeof s.nhan !== 'object') s.nhan = {};
    const n = s.nhan;
    n.total = Number(n.total) || 0;
    n.days = n.days && typeof n.days === 'object' ? n.days : {};
    n.bestHold = Number(n.bestHold) || 0;
    n.hold = [10, 30, 60].includes(n.hold) ? n.hold : 10;
    if (n.sound === undefined) n.sound = true;
    return n;
  }
  save() {
    const n = this.state();
    const keys = Object.keys(n.days).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - 120))) delete n.days[k]; // the last 120 days
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.plugin.saveData(this.plugin.settings), 600);
  }
  add(count) {
    const n = this.state();
    const before = nhanLevel(n.total).index;
    n.total += count;
    const today = isoDay(new Date());
    n.days[today] = (n.days[today] || 0) + count;
    this.save();
    const after = nhanLevel(n.total);
    if (after.index > before) {
      notify(`${tx('New level')}: ${after.level.name}`);
      this.flash(`✦ ${after.level.name} ✦`, 'is-level');
    }
    this.paint();
  }
  /** A knock of the wooden fish (mõ), from the plugin's sounds/mo.mp3; a little higher on every tenth in a row. */
  async knock(high) {
    if (!this.state().sound) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.audio = this.audio || new AC();
      const ctx = this.audio;
      if (ctx.state === 'suspended') ctx.resume();
      this.mo = this.mo || this.app.vault.adapter.readBinary(`${this.plugin.manifest.dir}/sounds/mo.mp3`).then((b) => ctx.decodeAudioData(b));
      const s = ctx.createBufferSource();
      s.buffer = await this.mo;
      s.playbackRate.value = high ? 1.2 : 0.97 + Math.random() * 0.06; // no two knocks quite the same
      s.connect(ctx.destination);
      s.start();
    } catch (e) {
      this.mo = null; // no sound this time; try the file again next knock
    }
  }
  /** A word that rises from the seal and fades. */
  flash(text, cls = '') {
    if (!this.stage) return;
    const el = this.stage.createDiv({ cls: `tvj-nhan-float ${cls}`, text });
    el.style.left = `${50 + (Math.random() * 40 - 20)}%`;
    window.setTimeout(() => el.remove(), 1100);
  }
  newLine() {
    if (!this.lineEl) return;
    let line;
    do line = NHAN_LINES[Math.floor(Math.random() * NHAN_LINES.length)]; while (line === this.lineEl.textContent && NHAN_LINES.length > 1);
    this.lineEl.setText(line);
    this.lineEl.removeClass('is-in');
    void this.lineEl.offsetWidth;
    this.lineEl.addClass('is-in');
  }
  tap() {
    const now = Date.now();
    this.combo = now - this.lastTap < 700 ? this.combo + 1 : 1;
    this.lastTap = now;
    this.knock(this.combo % 10 === 0);
    this.seal.removeClass('is-hit');
    void this.seal.offsetWidth;
    this.seal.addClass('is-hit');
    this.flash(this.combo % 10 === 0 ? `+1 · ${this.combo}×` : '+1 nhẫn');
    this.add(1);
    if (this.state().total % 10 === 0) this.newLine();
  }
  startHold() {
    const n = this.state();
    const need = n.hold * 1000;
    const start = Date.now();
    this.holding = true;
    this.seal.addClass('is-holding');
    this.knock(false);
    const step = () => {
      if (!this.holding) return;
      const share = Math.min(1, (Date.now() - start) / need);
      this.ring.style.setProperty('--tvj-nhan', String(share));
      this.holdText.setText(`${Math.floor((Date.now() - start) / 1000)}s / ${n.hold}s`);
      if (share >= 1) { this.endHold(true, need); return; }
      this.holdFrame = window.requestAnimationFrame(step);
    };
    this.holdStart = start;
    this.holdFrame = window.requestAnimationFrame(step);
  }
  endHold(done, need) {
    if (!this.holding) return;
    this.holding = false;
    window.cancelAnimationFrame(this.holdFrame);
    this.seal.removeClass('is-holding');
    const held = (Date.now() - this.holdStart) / 1000;
    const n = this.state();
    if (done) {
      this.knock(true);
      n.bestHold = Math.max(n.bestHold, Math.round((need || 0) / 1000));
      this.flash(`+${n.hold} nhẫn`, 'is-level');
      this.add(n.hold);
      this.newLine();
    } else if (held > 0.4) {
      this.seal.removeClass('is-shake');
      void this.seal.offsetWidth;
      this.seal.addClass('is-shake');
      this.flash(tx('Too soon. Breathe, and again.'), 'is-miss');
    }
    this.ring.style.setProperty('--tvj-nhan', '0');
    this.holdText.setText(tx(`Hold for ${n.hold}s`));
  }
  paint() {
    if (!this.totalEl) return;
    const n = this.state();
    const today = isoDay(new Date());
    const lv = nhanLevel(n.total);
    this.totalEl.setText(n.total.toLocaleString('en-US'));
    this.levelEl.setText(lv.level.name);
    this.nextEl.setText(lv.next ? `${(lv.next.at - n.total).toLocaleString('en-US')} ${tx('more to')} ${lv.next.name}` : tx('Highest level'));
    this.barEl.style.width = `${Math.round(lv.share * 100)}%`;
    this.todayEl.setText(String(n.days[today] || 0));
    this.streakEl.setText(`${nhanStreak(n.days, today)} ${tx('days')}`);
    this.bestEl.setText(n.bestHold ? `${n.bestHold}s` : '—');
  }
  render() {
    const root = this.contentEl;
    root.empty();
    root.addClass('tvj-dashboard', 'tvj-nhan');
    const head = root.createDiv({ cls: 'tvj-head' });
    this.plugin.renderNav(head, NHAN_VIEW_TYPE);
    const n = this.state();

    const top = root.createDiv({ cls: 'tvj-nhan-top' });
    const lvl = top.createDiv({ cls: 'tvj-nhan-level' });
    this.levelEl = lvl.createDiv({ cls: 'tvj-nhan-level-name' });
    const bar = lvl.createDiv({ cls: 'tvj-nhan-bar' });
    this.barEl = bar.createDiv({ cls: 'tvj-nhan-bar-fill' });
    this.nextEl = lvl.createDiv({ cls: 'tvj-muted' });
    const stats = top.createDiv({ cls: 'tvj-nhan-stats' });
    const stat = (label) => { const s = stats.createDiv({ cls: 'tvj-nhan-stat' }); const v = s.createDiv({ cls: 'tvj-nhan-stat-value' }); s.createDiv({ cls: 'tvj-muted', text: label }); return v; };
    this.todayEl = stat('Today');
    this.streakEl = stat('Streak');
    this.totalEl = stat('Total');
    this.bestEl = stat('Longest hold');

    const modes = root.createDiv({ cls: 'tvj-options tvj-nhan-modes' });
    for (const [key, label] of [['tap', 'Tap'], ['hold', 'Hold']]) {
      modes.createEl('button', { text: label, cls: key === this.mode ? 'mod-cta' : '', attr: { 'aria-pressed': String(key === this.mode) } }).addEventListener('click', () => { this.mode = key; this.render(); });
    }
    if (this.mode === 'hold') {
      for (const s of [10, 30, 60]) {
        modes.createEl('button', { text: `${s}s`, cls: `tvj-nhan-secs ${s === n.hold ? 'is-on' : ''}` }).addEventListener('click', () => { n.hold = s; this.save(); this.render(); });
      }
    }
    const sound = modes.createEl('button', { cls: 'tvj-nhan-sound', attr: { 'aria-label': 'Sound' } });
    setIcon(sound, n.sound ? 'volume-2' : 'volume-x');
    sound.addEventListener('click', () => { n.sound = !n.sound; this.save(); this.render(); });

    this.stage = root.createDiv({ cls: 'tvj-nhan-stage' });
    this.ring = this.stage.createDiv({ cls: `tvj-nhan-ring ${this.mode === 'hold' ? 'is-hold' : ''}` });
    this.seal = this.ring.createEl('button', { cls: 'tvj-nhan-seal', attr: { 'aria-label': this.mode === 'hold' ? 'Hold to practise patience' : 'Tap: one nhẫn' } });
    this.seal.createDiv({ cls: 'tvj-nhan-kanji', text: '忍' });
    this.seal.createDiv({ cls: 'tvj-nhan-word', text: 'NHẪN' });
    this.holdText = this.stage.createDiv({ cls: 'tvj-nhan-hint tvj-muted', text: this.mode === 'hold' ? tx(`Hold for ${n.hold}s`) : tx('Tap the seal, or press Space') });
    if (this.mode === 'tap') {
      this.seal.addEventListener('pointerdown', (e) => { e.preventDefault(); this.tap(); });
    } else {
      this.seal.addEventListener('pointerdown', (e) => { e.preventDefault(); try { this.seal.setPointerCapture(e.pointerId); } catch (err) { /* still works */ } this.startHold(); });
      for (const ev of ['pointerup', 'pointercancel']) this.seal.addEventListener(ev, () => this.endHold(false));
    }
    this.lineEl = root.createDiv({ cls: 'tvj-nhan-line' });
    this.newLine();
    this.paint();
    this.contentEl.setAttribute('tabindex', '0');
    this.contentEl.focus();
  }
}


