// ---------- Mở hòm: a case to open for what to study or backtest next. Pick a subject and the time you have;
// the reel stops on a task, rarer ones worth more. Finished tasks give EXP and go into the study log. ----------

const HOM_RARITIES = [
  { key: 'common', label: 'Thường', color: '#9aa3af', weight: 55, mult: 1 },
  { key: 'rare', label: 'Hiếm', color: '#4fb3a9', weight: 28, mult: 1.5 },
  { key: 'epic', label: 'Sử thi', color: '#a66cff', weight: 13, mult: 2.2 },
  { key: 'legendary', label: 'Huyền thoại', color: '#e05a4f', weight: 4, mult: 3.5 },
];
// tasks per subject: [rarity, title, what to do]
const HOM_SUBJECTS = [
  { key: 'nq', name: 'Backtest NQ', icon: 'candlestick-chart', tasks: [
    ['common', 'Mở cửa New York', 'Backtest 10 phiên 9:30–10:30 trên NQ. Ghi hướng của nến 5 phút đầu và kết quả sau 30 phút.'],
    ['common', 'Đỉnh đáy ngày trước', 'Đánh dấu PDH/PDL 15 ngày gần nhất. Đếm bao nhiêu ngày giá quét một trong hai rồi đảo chiều.'],
    ['common', 'Khoảng trống qua đêm', 'Ghi gap mở cửa của 15 phiên. Gap được lấp trong ngày bao nhiêu lần?'],
    ['rare', 'Phá vỡ vùng mở cửa', 'Backtest Opening Range 15 phút trên 20 phiên: vào theo hướng phá, stop ở giữa range, chốt 2R.'],
    ['rare', 'Ngày có tin CPI/FOMC', 'Tìm 6 ngày tin lớn gần nhất. So biên độ và hướng chạy trước và sau giờ ra tin.'],
    ['epic', '30 lệnh setup chính', 'Backtest đúng setup chính của bạn trên 30 lệnh NQ. Ghi win rate, RR trung bình, chuỗi thua dài nhất.'],
    ['legendary', 'Một tháng không bỏ phiên', 'Replay đủ 20 phiên của một tháng bất kỳ, giao dịch như thật, không xem trước. Viết tổng kết.'],
  ] },
  { key: 'es', name: 'Backtest ES', icon: 'line-chart', tasks: [
    ['common', 'VWAP trong ngày', 'Trên 10 phiên ES, đếm số lần giá chạm VWAP rồi bật lại so với số lần cắt qua.'],
    ['common', 'Phiên châu Á', 'Đánh dấu đỉnh đáy phiên Á 15 ngày. Phiên London phá phía nào trước?'],
    ['common', 'Biên độ trung bình', 'Tính biên độ ngày của 20 phiên gần nhất và so với ATR 14.'],
    ['rare', 'Ngày xu hướng hay ngày đi ngang', 'Phân loại 20 phiên ES thành trend hoặc range. Dấu hiệu nào trong giờ đầu báo trước?'],
    ['rare', 'Điểm Value Area', 'Backtest quy tắc 80% của Value Area hôm trước trên 15 phiên.'],
    ['epic', 'So ES với NQ', 'Trên 20 phiên, ghi lần ES và NQ lệch nhau (một cái tạo đỉnh mới, cái kia không). Kết quả sau đó?'],
    ['legendary', 'Hệ thống hoàn chỉnh', 'Viết luật vào lệnh, stop, chốt lời rõ ràng rồi backtest 50 lệnh ES. Ghi drawdown lớn nhất.'],
  ] },
  { key: 'gc', name: 'Backtest GC', icon: 'gem', tasks: [
    ['common', 'Giờ mở London', 'Backtest 10 phiên Vàng quanh 2:00–4:00 sáng New York. Hướng nào chiếm ưu thế?'],
    ['common', 'Số tròn', 'Đánh dấu các mốc tròn 10 USD trên GC 2 tuần. Giá phản ứng ở đó bao nhiêu lần?'],
    ['common', 'Vàng và DXY', 'So 10 ngày Vàng với chỉ số Dollar. Ghi những ngày hai thứ cùng chiều.'],
    ['rare', 'Quét thanh khoản phiên Á', 'Trên 15 phiên GC, giá quét đỉnh/đáy phiên Á rồi đảo chiều bao nhiêu lần?'],
    ['rare', 'Tin việc làm NFP', 'Xem lại 6 lần NFP gần nhất trên GC: hướng 15 phút đầu có giữ đến hết phiên không?'],
    ['epic', '30 lệnh trên Vàng', 'Backtest setup của bạn trên 30 lệnh GC với kích thước stop phù hợp biên độ của Vàng.'],
    ['legendary', 'Một quý của Vàng', 'Replay 3 tháng GC ở khung 1 giờ, đánh dấu cấu trúc tuần, viết dự báo trước mỗi tuần rồi đối chiếu.'],
  ] },
  { key: 'ict', name: 'Học ICT 2022', icon: 'graduation-cap', tasks: [
    ['common', 'Fair Value Gap', 'Tìm và đánh dấu 20 FVG trên khung 5 phút. Bao nhiêu cái được lấp lại?'],
    ['common', 'Killzone', 'Ghi giờ các killzone London và New York, rồi đánh dấu chúng trên 10 ngày chart.'],
    ['common', 'Thanh khoản bên mua, bên bán', 'Đánh dấu equal highs/lows trên 10 phiên và xem giá có đi lấy chúng không.'],
    ['rare', 'Quét rồi đổi cấu trúc', 'Tìm 10 ví dụ: quét thanh khoản → dịch chuyển mạnh → đổi cấu trúc → vào ở FVG.'],
    ['rare', 'Vùng OTE', 'Đo Fibonacci 62–79% sau 15 cú dịch chuyển. Giá hồi vào vùng đó bao nhiêu lần?'],
    ['epic', 'Mô hình 2022 trọn vẹn', 'Backtest 25 lệnh theo đúng trình tự mô hình 2022, ghi mỗi bước bằng ảnh chụp.'],
    ['legendary', 'Viết lại bằng lời của mình', 'Tóm tắt toàn bộ mô hình 2022 thành sơ đồ cây trong Logic tree, kèm 5 ví dụ đúng và 5 ví dụ sai.'],
  ] },
  { key: 'of', name: 'Học Orderflow', icon: 'bar-chart-3', tasks: [
    ['common', 'Đọc delta', 'Trên 10 cây nến footprint, ghi delta và đoán hướng nến sau. Đúng bao nhiêu lần?'],
    ['common', 'Hấp thụ', 'Tìm 10 ví dụ absorption: khối lượng lớn mà giá không đi tiếp.'],
    ['common', 'Mất cân bằng', 'Đánh dấu 15 vùng imbalance xếp chồng (stacked) và xem giá phản ứng khi quay lại.'],
    ['rare', 'Delta phân kỳ', 'Tìm 10 lần giá tạo đỉnh mới mà cumulative delta không theo. Kết quả sau đó?'],
    ['rare', 'Điểm kiểm soát POC', 'Ghi POC của 15 phiên. Phiên sau mở trên hay dưới POC, và có quay về không?'],
    ['epic', 'Xác nhận vào lệnh', 'Backtest 25 lệnh setup chính, chỉ vào khi orderflow xác nhận. So với không cần xác nhận.'],
    ['legendary', 'Nhật ký DOM một tuần', 'Ghi chép DOM và footprint 5 phiên liên tiếp quanh mở cửa, mỗi phiên rút ra 3 điều.'],
  ] },
  { key: 'opt', name: 'Học OptionFlow', icon: 'layers', tasks: [
    ['common', 'Mức GEX', 'Ghi mức gamma dương/âm lớn nhất của 10 ngày và xem giá có bị hút về đó không.'],
    ['common', 'Put/Call ratio', 'Theo dõi tỉ lệ put/call 10 ngày cùng hướng chạy của chỉ số.'],
    ['common', 'Open interest theo strike', 'Đánh dấu 3 strike có OI lớn nhất mỗi tuần trong 4 tuần.'],
    ['rare', 'Lệnh option bất thường', 'Ghi 10 lệnh flow lớn bất thường và kết quả giá cơ sở sau 1–3 ngày.'],
    ['rare', 'Ngày đáo hạn', 'So hành vi giá 6 ngày đáo hạn (OPEX, 0DTE) với ngày thường.'],
    ['epic', 'Kết hợp flow với setup', 'Backtest 20 lệnh chỉ khi option flow cùng hướng setup của bạn.'],
    ['legendary', 'Bản đồ dealer một tháng', 'Mỗi sáng trong 20 phiên, vẽ bản đồ mức dealer hedging và đối chiếu cuối ngày.'],
  ] },
];
const HOM_TIMES = [15, 30, 60, 120];
const HOM_LEVELS = [
  { at: 0, name: 'Thợ học việc' },
  { at: 60, name: 'Học viên' },
  { at: 250, name: 'Người backtest' },
  { at: 700, name: 'Trader tập sự' },
  { at: 1500, name: 'Trader có hệ thống' },
  { at: 3500, name: 'Bậc thầy dữ liệu' },
  { at: 8000, name: 'Huyền thoại kỷ luật' },
];
/** A rarity drawn by weight (`roll` in 0..1). */
function homRarity(roll) {
  const total = HOM_RARITIES.reduce((a, r) => a + r.weight, 0);
  let at = roll * total;
  for (const r of HOM_RARITIES) { if (at < r.weight) return r; at -= r.weight; }
  return HOM_RARITIES[0];
}
/** A task of `subject`: a rarity by weight, then one of that rarity's tasks. */
function homDraw(subject, rnd = Math.random) {
  const rarity = homRarity(rnd());
  const pool = subject.tasks.filter((t) => t[0] === rarity.key);
  const [, title, text] = pool[Math.floor(rnd() * pool.length)] || subject.tasks[0];
  return { subject: subject.key, rarity: rarity.key, title, text };
}
/** EXP for a finished task: its minutes times its rarity. */
const homExp = (task) => Math.round((task.minutes || 30) * ((HOM_RARITIES.find((r) => r.key === task.rarity) || HOM_RARITIES[0]).mult));
function homLevel(exp) {
  let i = 0;
  for (let k = 0; k < HOM_LEVELS.length; k++) if (exp >= HOM_LEVELS[k].at) i = k;
  const next = HOM_LEVELS[i + 1] || null;
  return { level: HOM_LEVELS[i], index: i, next, share: next ? (exp - HOM_LEVELS[i].at) / (next.at - HOM_LEVELS[i].at) : 1 };
}

/** The reel's timing, in seconds into case-roll.mp3 (whose ticks are made from these same times): the reel starts at
 *  `start`, runs fast until `slow`, slows, and its last ticks fall at `last`, the final one on the winner. `reveal` is when
 *  the reveal sound comes, `lead` how far into case-open the roll starts. A different roll file is stretched to its length. */
const HOM_ROLL = { length: 8, lead: 0.6, start: 0.1, slow: 3.8, last: [5.9, 6.25, 6.7, 7.35], glide: 0.45, reveal: 7.9 };
/** The times the reel's cards cross the marker: speeding up, a steady fast run, slowing, then the last ticks. */
function homRollPasses() {
  const out = [];
  let t = HOM_ROLL.start + 0.2, dt = 0.16;
  while (dt > 0.04) { out.push(t); t += dt; dt *= 0.8; }
  for (dt = 0.04; t < HOM_ROLL.last[0] - 0.3; t += dt) { out.push(t); if (t > HOM_ROLL.slow) dt *= 1.09; }
  return out.concat(HOM_ROLL.last);
}
class HomView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.spinning = false;
  }
  getViewType() { return HOM_VIEW_TYPE; }
  getDisplayText() { return 'Mở hòm'; }
  getIcon() { return 'package-open'; }
  async onOpen() { this.render(); }
  async onClose() { window.clearInterval(this.timer); this.contentEl.empty(); }
  state() {
    const s = this.plugin.settings;
    if (!s.hom || typeof s.hom !== 'object') s.hom = {};
    const h = s.hom;
    h.opens = Number(h.opens) || 0;
    h.exp = Number(h.exp) || 0;
    h.history = Array.isArray(h.history) ? h.history : [];
    if (!HOM_SUBJECTS.some((x) => x.key === h.subject)) h.subject = HOM_SUBJECTS[0].key;
    if (!HOM_TIMES.includes(h.minutes)) h.minutes = 30;
    return h;
  }
  save() { return this.plugin.saveData(this.plugin.settings); }
  ctx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.audio = this.audio || new AC();
    if (this.audio.state === 'suspended') this.audio.resume();
    return this.audio;
  }
  /** Your own sound for `name` (case-tick, case-open, case-reveal, case-reveal-<rarity>) from the journal's Sounds
   *  folder, decoded once; null when there is none. */
  async ownSound(name) {
    this.sounds = this.sounds || new Map();
    if (this.sounds.has(name)) return this.sounds.get(name);
    const job = (async () => {
      for (const ext of ['mp3', 'wav', 'ogg', 'm4a']) {
        const f = this.app.vault.getAbstractFileByPath(normalizePath(`${this.plugin.settings.folder}/Sounds/${name}.${ext}`));
        if (f instanceof TFile) {
          try { return await this.ctx().decodeAudioData(await this.app.vault.readBinary(f)); } catch (e) { return null; }
        }
      }
      // the sounds that ship with the plugin
      const own = `${this.plugin.manifest.dir}/sounds/${name}.mp3`;
      try { if (await this.app.vault.adapter.exists(own)) return await this.ctx().decodeAudioData(await this.app.vault.adapter.readBinary(own)); } catch (e) { /* no sound */ }
      return null;
    })();
    this.sounds.set(name, job);
    return job;
  }
  play(buffer, volume = 1) {
    const ctx = this.ctx(), s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = buffer;
    g.gain.value = volume;
    s.connect(g).connect(ctx.destination);
    s.start();
  }
  /** A short burst of noise through a filter: the body of a click or a clack. */
  noise(t, length, type, freq, q, level) {
    const ctx = this.ctx();
    const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * length)), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = buf;
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    g.gain.value = level;
    s.connect(f).connect(g).connect(ctx.destination);
    s.start(t);
  }
  /** A tone that rings and fades: `at` seconds from now, `freq` Hz, for `length` seconds. */
  tone(at, freq, length, level, type = 'sine') {
    const ctx = this.ctx(), t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + length + 0.05);
  }
  /** The click of a card passing the marker: a dry, bright tick with a little metal ring. */
  async tick() {
    try {
      const own = await this.ownSound('case-tick');
      if (own) { this.play(own, 0.8); return; }
      const t = this.ctx().currentTime;
      this.noise(t, 0.018, 'highpass', 3200, 0.7, 0.55);
      this.tone(0, 2650, 0.045, 0.06, 'triangle');
    } catch (e) { /* no sound */ }
  }
  /** The case opening: a latch that unlocks, a low thump and a short rising whoosh. */
  async openSound() {
    try {
      const own = await this.ownSound('case-open');
      if (own) { this.play(own); return; }
      const ctx = this.ctx(), t = ctx.currentTime;
      this.noise(t, 0.05, 'bandpass', 1400, 2, 0.6);
      this.noise(t + 0.09, 0.04, 'bandpass', 2200, 3, 0.45);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(140, t + 0.02);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.22);
      g.gain.setValueAtTime(0.5, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g).connect(ctx.destination);
      o.start(t + 0.02);
      o.stop(t + 0.32);
      this.noise(t + 0.12, 0.5, 'bandpass', 900, 0.8, 0.12);
    } catch (e) { /* no sound */ }
  }
  /** The reveal: a single chime for a common task, rising chords for the rarer ones, a low boom for a legend. */
  async revealSound(rarity) {
    try {
      const own = (await this.ownSound(`case-reveal-${rarity}`)) || (await this.ownSound('case-reveal'));
      if (own) { this.play(own); return; }
      const chords = {
        common: [[0, 880]],
        rare: [[0, 660], [0.09, 990]],
        epic: [[0, 587], [0.08, 880], [0.16, 1175]],
        legendary: [[0, 523], [0.07, 784], [0.14, 1047], [0.21, 1568], [0.36, 2093]],
      };
      for (const [at, f] of chords[rarity] || chords.common) { this.tone(at, f, 1.1, 0.16); this.tone(at, f * 2, 0.5, 0.04, 'triangle'); }
      if (rarity === 'legendary' || rarity === 'epic') {
        const ctx = this.ctx(), t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.setValueAtTime(rarity === 'legendary' ? 90 : 120, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.8);
        g.gain.setValueAtTime(rarity === 'legendary' ? 0.55 : 0.3, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        o.connect(g).connect(ctx.destination);
        o.start(t);
        o.stop(t + 0.95);
        if (rarity === 'legendary') this.noise(t + 0.05, 1.2, 'highpass', 5000, 0.5, 0.08); // a shimmer over it
      }
    } catch (e) { /* no sound */ }
  }
  card(parent, task) {
    const subject = HOM_SUBJECTS.find((x) => x.key === task.subject) || HOM_SUBJECTS[0];
    const rarity = HOM_RARITIES.find((r) => r.key === task.rarity) || HOM_RARITIES[0];
    const el = parent.createDiv({ cls: `tvj-hom-card is-${rarity.key}` });
    el.style.setProperty('--tvj-hom', rarity.color);
    el.createDiv({ cls: 'tvj-hom-rarity', text: rarity.label.toUpperCase() });
    setIcon(el.createDiv({ cls: 'tvj-hom-icon' }), subject.icon);
    el.createDiv({ cls: 'tvj-hom-title', text: task.title });
    return el;
  }
  async spin() {
    if (this.spinning) return;
    this.spinning = true;
    this.openButton.disabled = true;
    const [open, roll] = await Promise.all([this.ownSound('case-open'), this.ownSound('case-roll')]).catch(() => [null, null]);
    const h = this.state();
    const subject = HOM_SUBJECTS.find((x) => x.key === h.subject);
    const win = { ...homDraw(subject), minutes: h.minutes, id: Date.now().toString(36) };
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // with a recorded roll the reel follows its ticks: card k crosses the marker at passes[k] seconds into the roll
    const timed = roll && !calm;
    const scale = timed ? roll.duration / HOM_ROLL.length : 1;
    const passes = timed ? homRollPasses().map((t) => t * scale) : [];
    const B = 3;
    const AT = timed ? B + passes.length - 1 : 46;
    this.strip.empty();
    this.strip.style.transition = 'none';
    this.strip.style.transform = 'translateX(0)';
    for (let i = 0; i < AT + 6; i++) this.card(this.strip, i === AT ? win : homDraw(subject));
    void this.strip.offsetWidth;
    const view = this.reel.clientWidth;
    // measured, not assumed: the winner card's own place and size in the strip
    const cards = this.strip.children;
    const winner = cards[AT];
    const step = cards[1].offsetLeft - cards[0].offsetLeft;
    const first = cards[0].offsetLeft;
    const frac = 0.15 + Math.random() * 0.7;
    const done = async () => {
      this.spinning = false;
      this.openButton.disabled = false;
      h.opens++;
      h.current = win;
      this.revealSound(win.rarity);
      await this.save();
      this.showResult();
      this.paintTop();
    };
    if (timed) {
      // the roll starts while the opening sound fades; the reel waits for the roll's own start
      const lead = open ? Math.min(open.duration, HOM_ROLL.lead) : 0;
      const at = (p) => { this.strip.style.transform = `translateX(${-(first + p * step - view / 2)}px)`; };
      const s = HOM_ROLL.start * scale, glide = HOM_ROLL.glide * scale, end = passes[passes.length - 1];
      at(B - 1);
      this.openSound();
      const t0 = performance.now() + lead * 1000;
      window.setTimeout(() => { try { this.play(roll); } catch (e) { /* no sound */ } }, lead * 1000);
      let k = 0;
      const frame = () => {
        const t = (performance.now() - t0) / 1000;
        if (t >= end) {
          const u = Math.min(1, (t - end) / glide);
          at(AT + frac * (1 - Math.pow(1 - u, 3)));
          if (u < 1) window.requestAnimationFrame(frame);
          return;
        }
        while (k < passes.length - 1 && t >= passes[k]) k++;
        if (t < s) at(B - 1);
        else if (t < passes[0]) at(B - 1 + Math.pow((t - s) / (passes[0] - s), 2));
        else at(B + k - 1 + (t - passes[k - 1]) / (passes[k] - passes[k - 1]));
        window.requestAnimationFrame(frame);
      };
      window.requestAnimationFrame(frame);
      window.setTimeout(done, (lead + HOM_ROLL.reveal * scale) * 1000);
      return;
    }
    const target = winner.offsetLeft + winner.offsetWidth / 2 - view / 2 + (Math.random() * 0.7 - 0.35) * winner.offsetWidth;
    const ms = calm ? 400 : 5600;
    this.strip.style.transition = `transform ${ms}ms cubic-bezier(0.1, 0.75, 0.12, 1)`;
    this.strip.style.transform = `translateX(${-target}px)`;
    this.openSound();
    // a click each time a card passes the marker
    let last = -1;
    const follow = () => {
      if (!this.spinning) return;
      const m = new DOMMatrixReadOnly(getComputedStyle(this.strip).transform);
      const at = Math.floor((-m.m41 + view / 2 - first) / step);
      if (at !== last) { last = at; if (!calm) this.tick(); }
      window.requestAnimationFrame(follow);
    };
    window.requestAnimationFrame(follow);
    window.setTimeout(done, ms + 120);
  }
  /** The task drawn: what to do, the time to give it, a timer, and Done / Skip. */
  showResult() {
    const h = this.state();
    const box = this.resultBox;
    box.empty();
    window.clearInterval(this.timer);
    const t = h.current;
    if (!t) return;
    const rarity = HOM_RARITIES.find((r) => r.key === t.rarity) || HOM_RARITIES[0];
    const subject = HOM_SUBJECTS.find((x) => x.key === t.subject) || HOM_SUBJECTS[0];
    box.style.setProperty('--tvj-hom', rarity.color);
    const head = box.createDiv({ cls: 'tvj-hom-result-head' });
    head.createSpan({ cls: 'tvj-hom-chip', text: rarity.label });
    head.createSpan({ cls: 'tvj-muted', text: `${subject.name} · ${t.minutes} ${tx('minutes')} · +${homExp(t)} EXP` });
    box.createDiv({ cls: 'tvj-hom-result-title', text: t.title });
    box.createDiv({ cls: 'tvj-hom-result-text', text: t.text });
    const clock = box.createDiv({ cls: 'tvj-hom-clock' });
    const keys = box.createDiv({ cls: 'tvj-options' });
    const show = () => {
      if (!t.startedAt) { clock.setText(''); return; }
      const left = Math.max(0, t.startedAt + t.minutes * 60000 - Date.now());
      clock.setText(left ? `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}` : tx('Time is up: finish and mark it done.'));
      if (!left) window.clearInterval(this.timer);
    };
    if (!t.startedAt) keys.createEl('button', { text: 'Start', cls: 'mod-cta' }).addEventListener('click', async () => { t.startedAt = Date.now(); await this.save(); this.showResult(); });
    keys.createEl('button', { text: 'Done', cls: t.startedAt ? 'mod-cta' : '' }).addEventListener('click', () => this.finish(true));
    keys.createEl('button', { text: 'Skip' }).addEventListener('click', () => this.finish(false));
    show();
    if (t.startedAt) this.timer = window.setInterval(show, 1000);
  }
  async finish(done) {
    const h = this.state();
    const t = h.current;
    if (!t) return;
    window.clearInterval(this.timer);
    const gained = done ? homExp(t) : 0;
    const before = homLevel(h.exp).index;
    h.exp += gained;
    h.history.unshift({ title: t.title, subject: t.subject, rarity: t.rarity, minutes: t.minutes, done, exp: gained, date: isoDay(new Date()) });
    h.history = h.history.slice(0, 40);
    h.current = null;
    await this.save();
    if (done) {
      await this.plugin.logStudy(t, gained);
      const after = homLevel(h.exp);
      notify(after.index > before ? `${tx('New level')}: ${after.level.name}` : `+${gained} EXP`);
    }
    this.render();
  }
  paintTop() {
    const h = this.state();
    const lv = homLevel(h.exp);
    this.levelName.setText(lv.level.name);
    this.levelNum.setText(`${tx('LEVEL')} ${lv.index + 1}`);
    this.expText.setText(lv.next ? `${h.exp - lv.level.at} / ${lv.next.at - lv.level.at} EXP` : `${h.exp} EXP`);
    this.expBar.style.width = `${Math.round(lv.share * 100)}%`;
    this.opensText.setText(`${tx('Cases opened')}: ${h.opens.toLocaleString('en-US')}`);
  }
  render() {
    const root = this.contentEl;
    root.empty();
    root.addClass('tvj-dashboard', 'tvj-hom');
    const headNav = root.createDiv({ cls: 'tvj-head' });
    this.plugin.renderNav(headNav, HOM_VIEW_TYPE);
    const h = this.state();
    this.opensText = root.createDiv({ cls: 'tvj-hom-opens tvj-muted' });

    const top = root.createDiv({ cls: 'tvj-hom-level' });
    const badge = top.createDiv({ cls: 'tvj-hom-badge' });
    setIcon(badge.createDiv(), 'shield');
    this.levelNum = badge.createDiv({ cls: 'tvj-hom-badge-num' });
    const mid = top.createDiv({ cls: 'tvj-hom-level-mid' });
    const row = mid.createDiv({ cls: 'tvj-hom-level-row' });
    this.levelName = row.createDiv({ cls: 'tvj-hom-level-name' });
    this.expText = row.createDiv({ cls: 'tvj-muted' });
    const bar = mid.createDiv({ cls: 'tvj-hom-exp' });
    this.expBar = bar.createDiv({ cls: 'tvj-hom-exp-fill' });
    mid.createDiv({ cls: 'tvj-muted tvj-hom-level-sub', text: 'Every task you finish builds your edge.' });

    this.reel = root.createDiv({ cls: 'tvj-hom-reel' });
    this.reel.createDiv({ cls: 'tvj-hom-marker' });
    this.strip = this.reel.createDiv({ cls: 'tvj-hom-strip' });
    const subject = HOM_SUBJECTS.find((x) => x.key === h.subject);
    for (const task of subject.tasks) this.card(this.strip, { subject: subject.key, rarity: task[0], title: task[1] });

    const tabs = root.createDiv({ cls: 'tvj-hom-tabs' });
    for (const x of HOM_SUBJECTS) {
      const b = tabs.createEl('button', { cls: `tvj-hom-tab ${x.key === h.subject ? 'is-active' : ''}`, attr: { 'aria-pressed': String(x.key === h.subject) } });
      setIcon(b.createSpan({ cls: 'tvj-hom-tab-icon' }), x.icon);
      b.createSpan({ text: x.name });
      b.addEventListener('click', async () => { if (this.spinning) return; h.subject = x.key; await this.save(); this.render(); });
    }
    const go = root.createDiv({ cls: 'tvj-hom-go' });
    const time = go.createEl('select', { cls: 'dropdown tvj-hom-time', attr: { 'aria-label': 'Time you have' } });
    for (const m of HOM_TIMES) time.createEl('option', { text: `${m} ${tx('minutes')}`, value: String(m) });
    time.value = String(h.minutes);
    time.addEventListener('change', async () => { h.minutes = Number(time.value); await this.save(); });
    this.openButton = go.createEl('button', { cls: 'tvj-hom-open' });
    setIcon(this.openButton.createSpan(), 'package-open');
    this.openButton.createSpan({ text: tx('OPEN THE CASE') });
    this.openButton.addEventListener('click', () => this.spin());

    this.resultBox = root.createDiv({ cls: 'tvj-card tvj-hom-result' });
    this.showResult();
    if (!h.current) this.resultBox.createEl('p', { cls: 'tvj-muted', text: 'Pick a subject and the time you have, then open the case. A finished task gives EXP and is written into your study log.' });

    if (h.history.length) {
      const hist = root.createDiv({ cls: 'tvj-card' });
      hist.createDiv({ cls: 'tvj-card-title', text: 'Recent' });
      const list = hist.createDiv({ cls: 'tvj-hom-history' });
      for (const x of h.history.slice(0, 12)) {
        const rarity = HOM_RARITIES.find((r) => r.key === x.rarity) || HOM_RARITIES[0];
        const line = list.createDiv({ cls: `tvj-hom-hline ${x.done ? '' : 'is-skipped'}` });
        line.style.setProperty('--tvj-hom', rarity.color);
        line.createSpan({ cls: 'tvj-hom-dot' });
        line.createSpan({ cls: 'tvj-hom-hname', text: x.title });
        line.createSpan({ cls: 'tvj-muted', text: `${(HOM_SUBJECTS.find((s) => s.key === x.subject) || {}).name || ''} · ${x.date} · ${x.done ? `+${x.exp} EXP` : tx('skipped')}` });
      }
    }
    this.paintTop();
  }
}


