// ---------- certificates ----------
// Certificates you were sent (funded accounts, payouts, passed evaluations) live in <journal folder>/Certificates as
// pictures or PDFs. The lobby shows the ones you ticked, in the order you ticked them (settings.certificates holds
// their paths); a PDF shows its first page.
/** A certificate's caption: its file name without the date it was added ("2026-10-16 50K Combine no.1"). */
const certTitle = (file) => String(file.basename || '').replace(/^\d{4}-\d{2}-\d{2} /, '');

/** The window that picks the certificates the lobby shows, and adds new ones. */
class CertificatesModal extends ThemedModal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }
  onOpen() {
    this.modalEl.addClass('tvj-mcerts-modal');
    this.render();
  }
  render() {
    this.keepScroll(() => this.draw());
  }
  draw() {
    const { contentEl } = this, plugin = this.plugin;
    contentEl.empty();
    accentTitle(contentEl, 'h2', 'Certificates');
    contentEl.createEl('p', { cls: 'tvj-muted', text: 'Tick the ones to show in the lobby, in the order you want them. They are the same certificates as in the Trophy room; add pictures or PDFs here or there.' });
    const tools = contentEl.createDiv({ cls: 'tvj-options' });
    const input = tools.createEl('input', { attr: { type: 'file', multiple: 'true', accept: 'image/png,image/jpeg,image/webp,application/pdf,.pdf', hidden: 'true' } });
    input.addEventListener('change', async () => {
      if (input.files && input.files.length && await plugin.addCertificates(input.files, true)) this.render();
      input.value = '';
    });
    tools.createEl('button', { text: 'Add certificates', cls: 'mod-cta' }).addEventListener('click', () => input.click());
    const all = plugin.certificateFiles();
    if (!all.length) {
      contentEl.createDiv({ cls: 'tvj-mcerts-none tvj-muted', text: 'No certificates yet. Add the ones your prop firms sent you.' });
    } else {
      const order = plugin.shownCertificates().map((f) => f.path);
      const grid = contentEl.createDiv({ cls: 'tvj-mcerts tvj-mcerts-pick' });
      for (const file of all) {
        const at = order.indexOf(file.path);
        const tile = grid.createEl('button', { cls: `tvj-mcert ${at >= 0 ? 'is-on' : ''}`, attr: { 'aria-pressed': String(at >= 0), 'aria-label': `${at >= 0 ? 'Hide' : 'Show'} ${certTitle(file)}` } });
        plugin.certificateThumb(tile.createDiv({ cls: 'tvj-mcert-frame' }), file);
        if (at >= 0) tile.createSpan({ cls: 'tvj-mcert-badge', text: String(at + 1) });
        tile.createDiv({ cls: 'tvj-mcert-name', text: certTitle(file) });
        tile.addEventListener('click', async () => { await plugin.setCertificateShown(file.path, at < 0); this.render(); });
      }
    }
    contentEl.createDiv({ cls: 'tvj-options' }).createEl('button', { text: 'Done' }).addEventListener('click', () => this.close());
  }
  onClose() {
    this.contentEl.empty();
  }
}

/** A chart from a day review, large. */
class ShotModal extends ThemedModal {
  constructor(app, file, label) {
    super(app);
    this.file = file;
    this.label = label;
  }
  onOpen() {
    this.modalEl.addClass('tvj-shot-modal');
    accentTitle(this.contentEl, 'h2', this.label);
    this.contentEl.createEl('img', { cls: 'tvj-shot-large', attr: { src: this.app.vault.getResourcePath(this.file), alt: this.label } });
    this.contentEl.createEl('button', { text: 'Open in a tab' }).addEventListener('click', () => { this.close(); this.app.workspace.getLeaf('tab').openFile(this.file); });
  }
  onClose() {
    this.contentEl.empty();
  }
}

/** A day from the P&L calendar: its numbers and trades, your thesis and notes on each trade, and the day's own review
 *  — all editable here and saved as you type — then Share turns it into the review card. */
class DayReviewModal extends ThemedModal {
  constructor(app, plugin, date, scope) {
    super(app);
    this.plugin = plugin;
    this.date = date;
    this.scope = scope || 'all';
    this.answers = {};
    this.notes = new Map(); // trade id -> { thesis, notes } being edited
    this.editing = new Set(); // trade ids with their notes open
    this.pending = new Map(); // what is waiting to be saved: key -> { timer, fn }
    this.shots = new Map(); // chart slot -> image file
    this.slot = ''; // the chart slot a paste goes to
    this.addingIn = ''; // the row whose "+ Timeframe" tile is being typed into
  }
  async onOpen() {
    this.modalEl.addClass('tvj-day-modal');
    this.answers = await this.plugin.readDayReview(this.date, this.scope);
    this.shots = this.plugin.dayShots(this.date, this.scope);
    // ⌘V anywhere in the dialog (outside a text box) puts a picture into the chart slot you clicked last
    this.modalEl.addEventListener('paste', (e) => {
      const t = e.target;
      if (!this.slot || (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT'))) return;
      this.pasteInto(this.slot, e);
    });
    this.render();
  }
  async pasteInto(key, e) {
    try {
      const got = await imageFromPaste(e);
      if (!got) return;
      if (e.preventDefault) e.preventDefault();
      await this.putShot(key, got.data, got.ext);
    } catch (err) {
      notify(`Could not get that picture: ${err.message}`);
    }
  }
  async putShot(key, data, ext) {
    await this.plugin.saveDayShot(this.date, key, data, ext, this.scope);
    this.shots = this.plugin.dayShots(this.date, this.scope);
    this.render();
  }
  /** A row of chart slots, one per timeframe, then "+ Timeframe" to add one. */
  shotRow(parent, group, tfs) {
    const row = parent.createDiv({ cls: 'tvj-shots' });
    for (const tf of tfs) this.shotSlot(row, shotKey(group, tf), tf);
    this.addSlot(row, group);
  }
  /** The last tile of a row: click it, type a timeframe (W1, H4, 5m, Weekly…) and press Enter. */
  addSlot(row, group) {
    const slot = row.createDiv({ cls: 'tvj-shot tvj-shot-add' });
    slot.createDiv({ cls: 'tvj-shot-label', text: '\u00a0' });
    const frame = slot.createDiv({ cls: 'tvj-shot-frame is-add' });
    if (this.addingIn !== group) {
      frame.createDiv({ cls: 'tvj-shot-plus', text: '+' });
      frame.createDiv({ cls: 'tvj-shot-empty', text: 'Timeframe' });
      frame.addEventListener('click', () => { this.addingIn = group; this.render(); });
      return;
    }
    const input = frame.createEl('input', { cls: 'tvj-shot-tf-input', attr: { type: 'text', maxlength: '12', placeholder: 'W1, H4, 5m…', 'aria-label': 'New timeframe' } });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.addTimeframe(input.value); }
    });
    input.addEventListener('blur', () => { window.setTimeout(() => { if (this.addingIn === group && !input.value.trim()) { this.addingIn = ''; this.render(); } }, 150); });
    window.setTimeout(() => input.focus(), 0);
  }
  async addTimeframe(raw) {
    const label = String(raw || '').trim().slice(0, 12);
    if (!label || !tfSlug(label)) return;
    const settings = this.plugin.settings;
    const mine = Array.isArray(settings.dayTimeframes) ? [...settings.dayTimeframes] : [...DAY_TIMEFRAMES];
    if (mine.some((tf) => tfSlug(tf) === tfSlug(label))) { notify(`${label} is already there.`); return; }
    settings.dayTimeframes = [...mine, label];
    await this.plugin.saveData(settings);
    this.addingIn = '';
    this.render();
  }
  async removeTimeframe(tf) {
    const settings = this.plugin.settings;
    const mine = Array.isArray(settings.dayTimeframes) ? settings.dayTimeframes : DAY_TIMEFRAMES;
    settings.dayTimeframes = mine.filter((x) => tfSlug(x) !== tfSlug(tf));
    await this.plugin.saveData(settings);
    this.render();
  }
  /** One chart slot: paste (⌘V), drop or choose an image; click a chart to see it large. */
  shotSlot(parent, key, label) {
    const file = this.shots.get(key);
    const slot = parent.createDiv({ cls: 'tvj-shot' });
    const head = slot.createDiv({ cls: 'tvj-shot-label' });
    head.createSpan({ text: label });
    // a timeframe can go when this day has no chart in it (a chart keeps its timeframe on screen)
    if (!['bullish', 'bearish', 'actual'].some((g) => this.shots.has(shotKey(g, label)))) {
      head.createEl('button', { cls: 'tvj-tf-remove', text: '×', attr: { 'aria-label': `Remove the ${label} timeframe` } }).addEventListener('click', () => this.removeTimeframe(label));
    }
    const frame = slot.createDiv({ cls: `tvj-shot-frame ${file ? 'has-image' : ''} ${this.slot === key ? 'is-armed' : ''}`, attr: { tabindex: '0', 'aria-label': `${label} chart` } });
    if (file) {
      frame.createEl('img', { attr: { src: this.app.vault.getResourcePath(file), alt: label } });
      frame.createEl('button', { cls: 'tvj-shot-remove', text: '×', attr: { 'aria-label': 'Remove this chart' } }).addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.plugin.removeDayShot(this.date, key, this.scope);
        this.shots = this.plugin.dayShots(this.date, this.scope);
        this.render();
      });
    } else {
      frame.createDiv({ cls: 'tvj-shot-empty', text: /Mac|iPhone|iPad/.test(navigator.platform || '') ? 'Paste ⌘V or drop' : 'Paste Ctrl+V or drop' });
      frame.createEl('button', { cls: 'tvj-link tvj-shot-pick', text: 'Choose' }).addEventListener('click', (e) => {
        e.stopPropagation();
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.addEventListener('change', async () => { const f = input.files && input.files[0]; if (f) await this.putShot(key, await f.arrayBuffer(), extOfType(f.type) || 'png'); });
        input.click();
      });
    }
    frame.addEventListener('click', () => {
      if (file) { new ShotModal(this.app, file, label).open(); return; }
      this.slot = key;
      frame.focus();
      for (const el of this.contentEl.querySelectorAll('.tvj-shot-frame.is-armed')) el.removeClass('is-armed');
      frame.addClass('is-armed');
    });
    frame.addEventListener('focus', () => { this.slot = key; });
    frame.addEventListener('dragover', (e) => { e.preventDefault(); frame.addClass('is-drop'); });
    frame.addEventListener('dragleave', () => frame.removeClass('is-drop'));
    frame.addEventListener('drop', async (e) => {
      e.preventDefault();
      frame.removeClass('is-drop');
      const f = [...((e.dataTransfer && e.dataTransfer.files) || [])].find((x) => /^image\//.test(x.type));
      if (f) await this.putShot(key, await f.arrayBuffer(), extOfType(f.type) || 'png');
    });
  }
  /** A row of choice buttons; clicking the chosen one again clears it. */
  pills(parent, options, value, onPick) {
    const row = parent.createDiv({ cls: 'tvj-pills' });
    for (const [key, label] of options) row.createEl('button', { text: label, cls: `tvj-pill is-${key} ${value === key ? 'is-on' : ''}` }).addEventListener('click', () => onPick(value === key ? '' : key));
  }
  /** Before the session: the two scenarios with their charts, then what you anticipate and your bias. */
  renderForecast(root) {
    const plugin = this.plugin;
    const box = root.createDiv({ cls: 'tvj-card tvj-day-forecast' });
    const head = box.createDiv({ cls: 'tvj-card-head' });
    head.createDiv({ cls: 'tvj-card-title', text: 'Prediction' });
    head.createDiv({ cls: 'tvj-muted', text: 'Before the session' });
    const tfs = dayTimeframes(plugin.settings, this.shots);
    for (const [key, label] of DAY_SCENARIOS) {
      box.createDiv({ cls: `tvj-scn is-${key}`, text: label });
      this.shotRow(box, key, tfs);
    }
    const plan = box.createDiv({ cls: 'tvj-day-plan' });
    plan.createDiv({ cls: 'tvj-day-q', text: 'Anticipation' });
    const area = plan.createEl('textarea', { cls: 'tvj-textarea', attr: { rows: '4', placeholder: tx('- SMT high with ES on Daily + 4H\n- want a retrace to EQ after news, or a retest of the CISD before the dump\n→ leaning bearish because…') } });
    area.value = this.answers.Anticipation || '';
    area.addEventListener('input', () => { this.answers.Anticipation = area.value; this.later('anticipation', () => plugin.writeDaySection(this.date, 'Anticipation', area.value, this.scope)); });
    area.addEventListener('blur', () => this.flush());
    plan.createDiv({ cls: 'tvj-day-q', text: 'Bias' });
    this.pills(plan, DAY_BIASES, this.answers.bias, async (v) => { this.answers.bias = v; await plugin.writeDayField(this.date, 'bias', v, this.scope); this.render(); });
  }
  /** After the session: what the day did, its charts and what you saw. */
  renderOutcome(root) {
    const plugin = this.plugin;
    const box = root.createDiv({ cls: 'tvj-card tvj-day-outcome' });
    const head = box.createDiv({ cls: 'tvj-card-head' });
    head.createDiv({ cls: 'tvj-card-title', text: 'What actually happened' });
    const b = this.answers.bias, o = this.answers.outcome;
    if (b && b !== 'neutral' && o) head.createSpan({ cls: `tvj-status ${b === o ? 'is-ready' : 'is-breached'}`, text: b === o ? 'Forecast played out' : 'Forecast did not play out' });
    else head.createDiv({ cls: 'tvj-muted', text: 'After the session' });
    this.pills(box, DAY_OUTCOMES, o, async (v) => { this.answers.outcome = v; await plugin.writeDayField(this.date, 'outcome', v, this.scope); this.render(); });
    this.shotRow(box, 'actual', dayTimeframes(plugin.settings, this.shots));
    const area = box.createEl('textarea', { cls: 'tvj-textarea', attr: { rows: '3', placeholder: tx('What the market did, and how it compared with the plan.') } });
    area.value = this.answers.happened || '';
    area.addEventListener('input', () => { this.answers.happened = area.value; this.later('happened', () => plugin.writeDayHappened(this.date, area.value, this.scope)); });
    area.addEventListener('blur', () => this.flush());
  }
  /** Saves a little after typing stops (or at once with flush). */
  later(key, fn) {
    const old = this.pending.get(key);
    if (old) window.clearTimeout(old.timer);
    const timer = window.setTimeout(() => { this.pending.delete(key); fn(); }, 700);
    this.pending.set(key, { timer, fn });
  }
  async flush() {
    const all = [...this.pending.values()];
    this.pending.clear();
    for (const x of all) { window.clearTimeout(x.timer); await x.fn(); }
  }
  async share() {
    await this.flush();
    new ReviewCardModal(this.app, this.plugin, this.scope, { date: this.date, range: 'day' }).open();
  }
  render() {
    this.keepScroll(() => this.draw());
  }
  draw() {
    const { contentEl } = this;
    const plugin = this.plugin;
    contentEl.empty();
    const groups = parseGroups(plugin.settings.groups);
    const items = plugin.getTrades();
    const scoped = new Set(filterScope(items.map((x) => x.trade), this.scope, groups));
    const day = items.filter((x) => scoped.has(x.trade) && x.trade.date === this.date).sort((a, b) => byTime(a.trade, b.trade));

    const head = contentEl.createDiv({ cls: 'tvj-day-head' });
    const when = dayAt(this.date).toLocaleDateString(LANG === 'vi' ? 'vi-VN' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    accentTitle(head, 'h2', when.charAt(0).toUpperCase() + when.slice(1));
    const share = head.createEl('button', { cls: 'tvj-day-share', attr: { 'aria-label': 'Share as a review card' } });
    setIcon(share.createSpan({ cls: 'tvj-day-share-icon' }), 'share-2');
    share.createSpan({ text: 'Share' });
    share.addEventListener('click', () => this.share());
    const scopeName = this.scope.startsWith('account:') ? this.scope.slice(8) : this.scope.startsWith('group:') ? this.scope.slice(6) : tx('All accounts');
    const own = plugin.dayOwner(this.scope);
    const only = own ? ` · ${tx(own.kind === 'group' ? 'Day notes for this group only' : 'Day notes for this account only')}` : '';
    contentEl.createDiv({ cls: 'tvj-muted tvj-day-sub', text: `${scopeName} · ${tx('Week')} ${isoWeek(this.date)}${only}` });
    // that day's news, from the economic calendar kept this week (the lobby's filters)
    const cal = plugin.settings.calendarCache;
    if (cal && Array.isArray(cal.events)) {
      const set = plugin.settings;
      const news = calendarDays(cal.events, { currency: typeof set.calendarCurrency === 'string' ? set.calendarCurrency : 'USD', impacts: Array.isArray(set.calendarImpacts) ? set.calendarImpacts : ['High', 'Medium'], now: new Date(`${this.date}T00:00:00`) })
        .find((d) => d.day === this.date);
      if (news) {
        const row = contentEl.createDiv({ cls: 'tvj-day-news' });
        for (const e of news.events) {
          const d = new Date(e.at);
          const chip = row.createSpan({ cls: 'tvj-day-news-item' });
          chip.createSpan({ cls: `tvj-impact is-${e.impact.toLowerCase()}` });
          chip.createSpan({ text: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${e.country} ${e.title}` });
        }
      }
    }
    // All accounts keeps its own note; the accounts and groups that wrote one for this day are a click away
    const elsewhere = dayOwnerOf(this.scope) ? [] : plugin.dayNotesOn(this.date);
    if (elsewhere.length) {
      const row = contentEl.createDiv({ cls: 'tvj-options tvj-day-elsewhere' });
      row.createSpan({ cls: 'tvj-muted', text: tx('Day notes on') });
      for (const o of elsewhere) {
        row.createEl('button', { cls: 'tvj-chip', text: o.name }).addEventListener('click', async () => {
          await this.flush();
          this.close();
          new DayReviewModal(this.app, plugin, this.date, `${o.kind}:${o.name}`).open();
        });
      }
    }
    this.renderForecast(contentEl);
    this.renderOutcome(contentEl);

    if (!day.length) contentEl.createEl('p', { cls: 'tvj-muted', text: 'No trades on this day. You can still write how it went.' });
    else {
      const s = computeStats(day.map((x) => x.trade));
      const tiles = contentEl.createDiv({ cls: 'tvj-tiles' });
      const tile = (label, value, cls) => {
        const t = tiles.createDiv({ cls: 'tvj-tile' });
        t.createDiv({ cls: 'tvj-tile-label', text: label });
        t.createDiv({ cls: `tvj-tile-value ${cls || ''}`, text: value });
      };
      tile('Net P&L', money(Math.round(s.net * 100) / 100), s.net < 0 ? 'tvj-neg' : 'tvj-pos');
      tile('Trades', `${s.trades} · ${s.wins}W ${s.losses}L`);
      tile('Win rate', `${s.winRate.toFixed(0)}%`);
      const rs = day.map((x) => rMultiple(x.trade)).filter((r) => r !== null);
      if (rs.length) tile('Total R', `${sum(rs) >= 0 ? '+' : ''}${sum(rs).toFixed(2)}R`, sum(rs) < 0 ? 'tvj-neg' : 'tvj-pos');

      const list = contentEl.createDiv({ cls: 'tvj-card tvj-day-trades' });
      list.createDiv({ cls: 'tvj-card-title', text: 'Trades' });
      for (const x of day) this.tradeRow(list, x);
    }

    const review = contentEl.createDiv({ cls: 'tvj-card tvj-day-review' });
    review.createDiv({ cls: 'tvj-card-title', text: 'Day review' });
    for (const q of DAY_QUESTIONS) {
      review.createDiv({ cls: 'tvj-day-q', text: q });
      const area = review.createEl('textarea', { cls: 'tvj-textarea tvj-day-a', attr: { rows: '3', placeholder: tx('Write it the way you would say it to yourself.') } });
      area.value = this.answers[q] || '';
      const key = `day:${q}`;
      area.addEventListener('input', () => { this.answers[q] = area.value; this.later(key, () => plugin.writeDayAnswer(this.date, q, area.value, this.scope)); });
      area.addEventListener('blur', () => this.flush());
    }
    const actions = contentEl.createDiv({ cls: 'tvj-options tvj-day-actions' });
    actions.createEl('button', { text: 'Share as review card', cls: 'mod-cta' }).addEventListener('click', () => this.share());
    actions.createEl('button', { text: 'Done' }).addEventListener('click', () => this.close());
  }

  /** One trade of the day: time, symbol, side, size, result, its review, and its thesis and notes to edit. */
  tradeRow(list, x) {
    const t = x.trade, plugin = this.plugin;
    const box = list.createDiv({ cls: 'tvj-day-trade' });
    const row = box.createDiv({ cls: 'tvj-row tvj-pick' });
    const left = row.createSpan({ cls: 'tvj-day-trade-main' });
    left.createSpan({ cls: 'tvj-muted', text: `${t.time} ` });
    left.createSpan({ text: `${t.symbol} ` });
    left.createSpan({ cls: `tvj-side ${t.direction === 'long' ? 'is-long' : 'is-short'}`, text: t.direction });
    left.createSpan({ cls: 'tvj-muted', text: ` ${t.qty}${(t.entries || []).length > 1 ? ` · ${t.entries.length} entries` : ''}${(t.exits || []).length > 1 ? ` · ${t.exits.length} exits` : ''}` });
    const right = row.createSpan({ cls: 'tvj-day-trade-side' });
    const r = rMultiple(t);
    right.createSpan({ cls: netPnl(t) < 0 ? 'tvj-neg' : 'tvj-pos', text: `${money(Math.round(netPnl(t) * 100) / 100)}${r === null ? '' : ` · ${r.toFixed(2)}R`}` });
    const open = this.editing.has(t.id);
    right.createEl('button', { text: open ? 'Hide notes' : 'Notes', cls: 'tvj-day-notes-btn' }).addEventListener('click', async (e) => {
      e.stopPropagation();
      await this.flush();
      if (open) this.editing.delete(t.id);
      else {
        if (!this.notes.has(t.id)) { const s = noteSections(await this.app.vault.read(x.file)); this.notes.set(t.id, { thesis: s.thesis, notes: s.notes }); }
        this.editing.add(t.id);
      }
      this.render();
    });
    if (t.reviewed) right.createSpan({ cls: 'tvj-done', text: '✓', attr: { 'aria-label': 'Reviewed' } });
    else right.createEl('button', { text: 'Review' }).addEventListener('click', async (e) => {
      e.stopPropagation();
      await this.flush();
      const modal = new ReviewModal(this.app, plugin, x);
      const closed = modal.onClose.bind(modal);
      modal.onClose = () => { closed(); window.setTimeout(() => this.render(), 300); }; // the note's cache catches up first
      modal.open();
    });
    row.addEventListener('click', async () => { await this.flush(); this.close(); plugin.openInSide(x.file); });
    if (!open) return;
    const n = this.notes.get(t.id);
    const editor = box.createDiv({ cls: 'tvj-day-editor' });
    for (const [heading, key] of [['Thesis', 'thesis'], ['Notes', 'notes']]) {
      editor.createDiv({ cls: 'tvj-day-q', text: heading });
      const area = editor.createEl('textarea', { cls: 'tvj-textarea', attr: { rows: '2' } });
      area.value = n[key] || '';
      area.addEventListener('input', () => { n[key] = area.value; this.later(`${t.id}:${heading}`, () => plugin.writeTradeSection(x.file, heading, area.value)); });
      area.addEventListener('blur', () => this.flush());
    }
  }
  onClose() {
    this.flush();
    this.contentEl.empty();
  }
}

class ReviewCardModal extends ThemedModal {
  /** opts: { date, range } to open on one day (from the day review); otherwise it starts on the latest day. */
  constructor(app, plugin, scope, opts = {}) {
    super(app);
    this.plugin = plugin;
    this.scope = scope || 'all';
    this.range = opts.range || 'day';
    this.date = opts.date || '';
    this.fixedDate = opts.date || '';
    this.opt = { ...REPORT_DEFAULTS, ...(plugin.settings.reportOptions || {}) };
    this.notes = new Map();
  }

  onOpen() {
    this.modalEl.addClass('tvj-flex-modal');
    this.modalEl.addClass('tvj-report-modal');
    this.render();
  }

  async render() {
    const { contentEl } = this;
    contentEl.empty();
    accentTitle(contentEl, 'h2', 'Review card');
    const groups = parseGroups(this.plugin.settings.groups);
    const items = this.plugin.getTrades();
    const scoped = new Set(filterScope(items.map((x) => x.trade), this.scope, groups));
    const mine = items.filter((x) => scoped.has(x.trade));
    const days = [...new Set([...mine.map((x) => x.trade.date), ...(this.fixedDate ? [this.fixedDate] : [])])].sort().reverse();
    if (!days.length) {
      contentEl.createEl('p', { cls: 'tvj-muted', text: 'No trades to review yet.' });
      return;
    }
    if (!days.includes(this.date)) this.date = days[0];

    const controls = contentEl.createDiv({ cls: 'tvj-options' });
    this.plugin.scopeSelect(controls, items.map((x) => x.trade), groups, this.scope, (v) => { this.scope = v; this.render(); });
    const day = controls.createEl('select', { cls: 'dropdown', attr: { 'aria-label': 'Day' } });
    for (const d of days.slice(0, 180)) day.createEl('option', { text: d, value: d });
    day.value = this.date;
    day.addEventListener('change', () => { this.date = day.value; this.render(); });
    const range = controls.createEl('select', { cls: 'dropdown', attr: { 'aria-label': 'Period' } });
    for (const [id, label] of [['day', 'That day'], ['week', 'Its week'], ['month', 'Its month']]) range.createEl('option', { text: label, value: id });
    range.value = this.range;
    range.addEventListener('change', () => { this.range = range.value; this.render(); });

    const layout = contentEl.createDiv({ cls: 'tvj-report' });
    const preview = layout.createDiv({ cls: 'tvj-report-preview' });
    const canvas = preview.createEl('canvas');
    const side = layout.createDiv({ cls: 'tvj-report-side' });

    const trades = reportTrades(mine.map((x) => x.trade), this.date, this.range);
    // the written parts live in the notes themselves: read the ones this card covers
    for (const x of mine) {
      if (trades.includes(x.trade) && !this.notes.has(x.trade.id)) this.notes.set(x.trade.id, noteSections(await this.app.vault.cachedRead(x.file)));
    }
    const rank = this.plugin.ownRank();
    const dayReview = this.range === 'day' ? await this.plugin.readDayReview(this.date, this.scope) : null;
    const data = { date: this.date, range: this.range, trades, notes: this.notes, day: dayReview, holder: this.plugin.settings.profileName, rankLabel: rank.ranked ? `${rank.label} · ${rank.score} RP` : '' };
    let background = null;
    const paint = () => drawReport(canvas, data, this.opt, background);
    paint();
    this.plugin.loadPicture('review-card').then((picture) => {
      if (picture && canvas.isConnected) { background = picture; paint(); }
    });
    // the heading font may still be loading the first time: draw once more when it is there
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (canvas.isConnected) paint(); });

    const save = async () => {
      this.plugin.settings.reportOptions = { ...this.opt };
      await this.plugin.saveData(this.plugin.settings);
    };
    const check = (parent, key, label) => {
      const row = parent.createEl('label', { cls: 'tvj-check' });
      const box = row.createEl('input', { attr: { type: 'checkbox' } });
      box.checked = !!this.opt[key];
      row.createSpan({ text: label });
      box.addEventListener('change', () => { this.opt[key] = box.checked; paint(); save(); });
    };
    let group = null, groupName = '';
    for (const [key, label, section] of REPORT_SECTIONS) {
      if (section !== groupName) {
        groupName = section;
        group = side.createDiv({ cls: 'tvj-report-group' });
        group.createDiv({ cls: 'tvj-card-title', text: section });
      }
      check(group, key, label);
    }
    // your own picture behind the whole card
    const backdrop = side.createDiv({ cls: 'tvj-report-group' });
    backdrop.createDiv({ cls: 'tvj-card-title', text: 'Background' });
    if (this.plugin.source === 'own') this.plugin.pictureButtons(backdrop.createDiv({ cls: 'tvj-options' }), 'review-card', () => this.render());
    backdrop.createDiv({ cls: 'tvj-tile-sub', text: 'Your picture sits behind the card, darkened so the numbers stay readable.' });
    const money = side.createDiv({ cls: 'tvj-report-group' });
    check(money, 'hideMoney', 'Hide dollar amounts');
    money.createDiv({ cls: 'tvj-tile-sub', text: 'Shows R instead of money; trades without a stop show a dash.' });

    const actions = side.createDiv({ cls: 'tvj-options' });
    actions.createEl('button', { text: 'Copy image', cls: 'mod-cta' }).addEventListener('click', () => copyCanvas(canvas, 'Review card copied to the clipboard.'));
    actions.createEl('button', { text: 'Save to vault' }).addEventListener('click', async () => {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const file = await this.plugin.saveFlexCard(blob, `Review ${this.date}${this.range === 'day' ? '' : ` ${this.range}`}`);
      if (file) notify(`Saved: ${file.path}`);
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

/** How long a trade lasted, in words short enough for a card: 45s, 12m, 1h 05m. */
function shortDuration(seconds) {
  if (!(seconds > 0)) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
  return `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`; // held overnight or longer
}

/** The four facts printed along the bottom of a single trade's card. */
function tradeFacts(t) {
  const price = (v) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 5 });
  const facts = [
    ['ENTRY', t.pnlOnly ? '—' : price(t.entry)],
    ['EXIT', t.pnlOnly ? '—' : price(t.exit)],
    ['SIZE', t.pnlOnly ? '—' : `${t.qty}${t.market === 'cfd' ? ' lot' : ''}`],
    t.duration > 0 ? ['HELD', shortDuration(t.duration)] : ['STOP', t.stop === null ? '—' : price(t.stop)],
  ];
  if (t.account && t.account !== NO_ACCOUNT) facts.account = t.account; // printed beside the holder's name
  return facts;
}

/** P&L card of one trade: the same card as the flex card, about a single trade. */
/** What a card dialog needs when its background is a video: playing it under the card, its sound, and saving
 *  the moving card as a short video. One per dialog; stop() when the dialog redraws or closes. */
class MovingCard {
  constructor(plugin) {
    this.plugin = plugin;
    this.sound = false;
  }

  /** Plays `video`, calling `draw` for each new frame, and adds the Sound and Save video buttons to `actions`. */
  start(canvas, video, draw, actions, title, render) {
    this.stop();
    this.video = video;
    this.render = render || null; // { file, overlay(canvas) }: what Save video needs to render with ffmpeg instead of recording
    video.muted = true; // a video may only start by itself when it is silent
    let last = -1;
    const tick = () => {
      if (this.video !== video || !canvas.isConnected) return;
      if (video.currentTime !== last) {
        last = video.currentTime;
        draw();
      }
      this.frame = window.requestAnimationFrame(tick);
    };
    video.play().catch(() => {});
    tick();
    this.soundButton(actions, (on) => { video.muted = !on; });
    const save = actions.createEl('button', { text: 'Save video' });
    save.addEventListener('click', () => this.save(canvas, video, title, save));
  }

  /** A button that turns the background's sound on and off; `apply(on)` does it. */
  soundButton(actions, apply) {
    this.sound = false;
    const b = actions.createEl('button', { text: 'Sound on' });
    b.addEventListener('click', () => {
      this.sound = !this.sound;
      apply(this.sound);
      b.setText(tx(this.sound ? 'Sound off' : 'Sound on'));
    });
  }

  stop() {
    window.cancelAnimationFrame(this.frame);
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    if (this.video) {
      this.video.pause();
      URL.revokeObjectURL(this.video.src);
    }
    this.video = null;
    this.recorder = null;
    this.sound = false;
  }

  /** Save video. With ffmpeg, on a computer, the card is laid over the video file itself: its full size (4K
   *  stays 4K), its whole length and its own sound, nothing recorded. Otherwise the playing card is recorded. */
  async save(canvas, video, title, button) {
    if (this.recorder || this.rendering) return;
    if (this.render && this.render.file && canRunTools(this.plugin.app)) {
      this.rendering = true;
      button.disabled = true;
      button.setText(`${tx('Rendering…')} 0%`);
      const done = await this.plugin.renderCardVideo(this.render.file, video, this.render.overlay, title, (part) => { if (button.isConnected) button.setText(`${tx('Rendering…')} ${Math.round(part * 100)}%`); }, !!this.render.counted);
      this.rendering = false;
      if (button.isConnected) { button.disabled = false; button.setText(tx('Save video')); }
      if (done) return;
    }
    this.record(canvas, video, title, button);
  }

  /** Records the playing card from the start of its video, one loop (at most 15 seconds), into the vault. */
  record(canvas, video, title, button) {
    if (this.recorder) return;
    if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) { notify('This device cannot record the card as a video.'); return; }
    const seconds = Math.min(15, Math.max(2, Number.isFinite(video.duration) ? video.duration : 6));
    const chunks = [];
    // with the sound on, the video's sound goes into the recording too
    let sound = [];
    try {
      if (!video.muted && video.captureStream) sound = video.captureStream().getAudioTracks();
    } catch (e) {
      sound = [];
    }
    const pick = (types) => types.find((t) => MediaRecorder.isTypeSupported(t));
    let type = sound.length ? pick(['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus']) : null;
    if (!type) {
      sound = [];
      type = pick(['video/mp4;codecs=avc1.42E01E', 'video/webm;codecs=vp9', 'video/webm']);
    }
    if (!type) { notify('This device cannot record the card as a video.'); return; }
    const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...sound]);
    const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8000000 });
    this.recorder = recorder;
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = async () => {
      window.clearInterval(timer);
      const cancelled = this.recorder !== recorder;
      if (this.recorder === recorder) this.recorder = null;
      if (button.isConnected) { button.disabled = false; button.setText(tx('Save video')); }
      if (cancelled || !chunks.length) return;
      const saved = await this.plugin.saveClip(new Blob(chunks, { type }), title, type.startsWith('video/mp4') ? 'mp4' : 'webm');
      if (saved) notify(`Saved: ${saved}`);
    };
    const started = Date.now();
    button.disabled = true;
    const timer = window.setInterval(() => {
      const left = Math.max(0, Math.ceil(seconds - (Date.now() - started) / 1000));
      if (button.isConnected) button.setText(`${tx('Recording…')} ${left}s`);
    }, 250);
    video.currentTime = 0;
    // the numbers count up again from the start of the recording, as they do when the card opens
    if (this.render && this.render.replay) this.render.replay();
    recorder.start();
    window.setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, seconds * 1000);
  }
}

/** The card and its buttons in a flex card dialog (the period card and the single-trade card share it): the
 *  design `chosen`, over a still picture, a playing video file or a playing YouTube video.
 *  `saveName` names saved files; `facts` are the single trade's figures. */
function mountFlexCard(modal, contentEl, { trades, title, label, mode, chosen, facts, saveName }) {
  const plugin = modal.plugin;
  modal.moving.stop();
  // what the card shows: the gold chip switches on and off (it is the same for every card and the member card)
  const parts = contentEl.createDiv({ cls: 'tvj-options tvj-card-parts' });
  parts.createSpan({ cls: 'tvj-muted', text: 'Show on the card:' });
  parts.createEl('button', { text: 'Gold chip', cls: `tvj-chip ${CARD_CHIP ? 'is-on' : ''}`, attr: { 'aria-pressed': String(CARD_CHIP) } }).addEventListener('click', async () => {
    CARD_CHIP = !CARD_CHIP;
    plugin.settings.cardShow = { ...(plugin.settings.cardShow || {}), chip: CARD_CHIP };
    await plugin.saveData(plugin.settings);
    plugin.refreshViews(); // the lobby's member card
    modal.render();
  });
  // the Copy desk design: account names and balances, each shown or hidden as **** (as a copy-trading screenshot does)
  if (chosen === 'copydesk') {
    for (const [key, text] of [['names', 'Account names'], ['balances', 'Balances']]) {
      parts.createEl('button', { text, cls: `tvj-chip ${COPY_SHOW[key] ? 'is-on' : ''}`, attr: { 'aria-pressed': String(COPY_SHOW[key]) } }).addEventListener('click', async () => {
        COPY_SHOW = { ...COPY_SHOW, [key]: !COPY_SHOW[key] };
        plugin.settings.cardShow = { ...(plugin.settings.cardShow || {}), copyNames: COPY_SHOW.names, copyBalances: COPY_SHOW.balances };
        await plugin.saveData(plugin.settings);
        modal.render();
      });
    }
  }
  const rank = plugin.ownRank();
  const cardName = rank.ranked ? rank.tier : 'Member';
  const holder = plugin.settings.profileName;
  // Number animation and Text colour sit above the card; they are filled once the card's controls exist
  const lookBox = contentEl.createDiv();

  // The numbers count up when "Number animation" is on, and the "Your picture" design takes the colour picked
  // under "Text colour" ("Auto contrast" measures the background: a picture once, a video every half second).
  const settings = plugin.settings;
  const custom = chosen === 'custom';
  const animate = settings.cardAnimate !== false;
  const autoTone = custom && (settings.cardTextColor || 'auto') === 'auto';
  const upColor = custom ? cardUpColor(settings) : null;
  // the card opens on its final numbers: the count plays only on Replay, or when an export records it
  const st = { start: -Infinity, tone: 'normal', probedAt: -Infinity, picture: null, raf: 0 };
  const look = (now) => {
    const pic = st.picture;
    if (pic && autoTone && now - st.probedAt >= 500) {
      const moving = pic instanceof HTMLVideoElement;
      if (moving || st.probedAt === -Infinity) st.tone = cardBackgroundTone(pic, st.tone);
      st.probedAt = moving ? now : Infinity;
    }
    const t = (now - st.start) / 1000;
    return { progress: animate && t < COUNT_LENGTH ? countProgress(t) : null, tone: st.tone, upColor };
  };

  // a YouTube background: the video plays in a frame and the card is laid over it, see-through. A frame's
  // picture cannot be read, so the still kept for copies is drawn apart, with the video's cover.
  // A TikTok video works the same way through TikTok's embed player; it is upright, so the card shows its middle.
  const youtube = custom && plugin.settings.cardYouTube;
  const tiktok = custom && !youtube && plugin.settings.cardTikTok;
  let canvas, still, painted, draw, stage = null, frame = null;
  if (youtube || tiktok) {
    stage = contentEl.createDiv({ cls: `tvj-flex-stage ${tiktok ? 'is-upright' : ''}` });
    const src = tiktok ? tiktokEmbed(tiktok) : youtubeEmbed({ video: youtube }, `autoplay=1&mute=1&loop=1&playlist=${youtube}&controls=0&playsinline=1&rel=0&enablejsapi=1&cc_load_policy=0&iv_load_policy=3`);
    frame = stage.createEl('iframe', { attr: { src, allow: 'autoplay; encrypted-media', referrerpolicy: 'strict-origin-when-cross-origin', tabindex: '-1', 'aria-hidden': 'true' } });
    if (!tiktok) noCaptions(frame);
    canvas = stage.createEl('canvas', { cls: 'tvj-flex-canvas' });
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    draw = (now) => drawFlexCard(canvas, trades, title, label, mode, 'custom', holder, SEE_THROUGH, facts, cardName, look(now));
    draw(performance.now());
    still = document.createElement('canvas');
    still.width = CARD_W;
    still.height = CARD_H;
    plugin.paintCard(still, trades, title, label, mode, chosen, facts, { upColor });
    painted = Promise.resolve(null);
    contentEl.createEl('p', { cls: 'tvj-muted', text: tiktok ? 'Copy image and Save to vault take the card as it looks at that moment of the video. Export GIF records the card for as long as Settings → GIF and video length says.' : 'Copy image and Save to vault take the card as it looks at that moment of the video. A YouTube video cannot be saved as a moving card; upload a video file for that.' });
  } else {
    canvas = contentEl.createEl('canvas', { cls: 'tvj-flex-canvas' });
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    still = canvas;
    draw = (now) => drawFlexCard(canvas, trades, title, label, mode, chosen, holder, st.picture, facts, custom ? cardName : undefined, look(now));
    painted = plugin.paintCard(canvas, trades, title, label, mode, chosen, facts, look(performance.now()));
  }

  // the card's look `t` seconds into a GIF drawn frame by frame: the numbers count from the start, and "Auto
  // contrast" measures a moving background every half second, as it does on screen
  const gif = { tone: 'normal', probed: -Infinity };
  const lookAt = (t, pic) => {
    if (t === 0) { gif.tone = st.tone; gif.probed = -Infinity; }
    if (pic && autoTone && t - gif.probed >= 0.5) {
      if (pic instanceof HTMLVideoElement || gif.probed === -Infinity) gif.tone = cardBackgroundTone(pic, gif.tone);
      gif.probed = t;
    }
    return { progress: animate && t < COUNT_LENGTH ? countProgress(t) : null, tone: gif.tone, upColor };
  };

  // the count runs on its own loop; a video background also redraws the card on each of its frames
  if (modal.stopCount) modal.stopCount();
  const redraw = () => draw(performance.now());
  const tick = () => {
    st.raf = 0;
    if (!canvas.isConnected) return;
    redraw();
    if (animate && (performance.now() - st.start) / 1000 < COUNT_LENGTH) st.raf = window.requestAnimationFrame(tick);
  };
  const kick = () => { if (!st.raf) st.raf = window.requestAnimationFrame(tick); };
  modal.stopCount = () => { window.cancelAnimationFrame(st.raf); st.raf = 0; };
  // replay(): the numbers count up again (exports record it); finish(): straight to the final numbers (copies)
  const ctl = { replay() { st.start = performance.now(); kick(); }, finish() { st.start = -Infinity; redraw(); } };
  kick(); // one drawing, with the final numbers
  plugin.renderCardLookControls(lookBox, chosen, ctl, () => modal.keepScroll(() => modal.render()));

  const actions = contentEl.createDiv({ cls: 'tvj-options' });
  // The card as a picture, as it looks right now (with its final numbers). Over a YouTube video that is a capture
  // of the screen (the player's own picture cannot be read); where it cannot be captured, the video's cover stands in.
  const shot = async () => { ctl.finish(); return (stage && await captureElement(stage)) || still; };
  actions.createEl('button', { text: 'Copy image', cls: 'mod-cta' }).addEventListener('click', async () => copyCanvas(await shot(), 'Flex card copied to the clipboard.'));
  actions.createEl('button', { text: 'Save to vault' }).addEventListener('click', async () => {
    const picture = await shot();
    const file = await plugin.saveFlexCard(await new Promise((resolve) => picture.toBlob(resolve, 'image/png')), saveName);
    if (file) notify(`Saved: ${file.path}`);
  });
  if (frame) {
    // each player takes its own kind of message
    const say = playerSay(frame, !!tiktok);
    if (tiktok) frame.addEventListener('load', () => setTimeout(() => say('mute'), 800)); // starts silent, like the others
    modal.moving.soundButton(actions, (on) => say(on ? 'unMute' : 'mute'));
    addClipButtons(plugin, actions, saveName, downloadOnSave(plugin, streamSource(stage, frame, say, !!tiktok), streamLink(tiktok ? `tiktok:${tiktok}` : youtube), null, () => modal.render()), ctl);
  }
  painted.then((picture) => {
    if (!canvas.isConnected || frame) return;
    st.picture = picture || null;
    redraw();
    if (picture instanceof HTMLVideoElement) {
      // a video file as the background: the card plays here, and can be saved as a short video
      modal.moving.start(canvas, picture, redraw, actions, saveName,
        { file: plugin.cardPictureFile(), overlay: (sheet, progress) => drawFlexCard(sheet, trades, title, label, mode, 'custom', holder, SEE_THROUGH, facts, cardName, { upColor, progress }),
          counted: animate, replay: () => { if (animate) ctl.replay(); } });
      addClipButtons(plugin, actions, saveName, videoSource(canvas, picture, (sheet, t) => drawFlexCard(sheet, trades, title, label, mode, chosen, holder, picture, facts, custom ? cardName : undefined, lookAt(t, picture))), ctl);
    } else if (animate) {
      // a card that stands still but counts up: its count can be saved as a short video or a GIF
      addCountVideoButton(plugin, actions, saveName, canvas, ctl);
      addGifButton(plugin, actions, saveName, { canvas, render: (sheet, t) => drawFlexCard(sheet, trades, title, label, mode, chosen, holder, st.picture, facts, custom ? cardName : undefined, lookAt(t, st.picture)) }, ctl);
      addLocationButton(plugin, actions);
    }
  });
}

class TradeCardModal extends ThemedModal {
  constructor(app, plugin, item) {
    super(app);
    this.plugin = plugin;
    this.item = item;
    this.mode = 'money';
    this.moving = new MovingCard(plugin);
  }

  onOpen() {
    this.modalEl.addClass('tvj-flex-modal');
    this.render();
  }

  render() {
    const { contentEl } = this;
    const t = this.item.trade;
    contentEl.empty();
    accentTitle(contentEl, 'h2', 'Trade P&L card');
    const controls = contentEl.createDiv({ cls: 'tvj-options' });
    const mode = controls.createEl('select', { cls: 'dropdown' });
    mode.createEl('option', { text: 'Show $', value: 'money' });
    mode.createEl('option', { text: 'Hide money, show R', value: 'r' });
    mode.value = this.mode;
    mode.addEventListener('change', () => { this.mode = mode.value; this.render(); });
    if (this.mode === 'r' && rMultiple(t) === null) contentEl.createEl('p', { cls: 'tvj-muted', text: 'This trade has no stop, so it has no R: the card shows a dash.' });

    const chosen = this.plugin.renderSkinPicker(contentEl, this.plugin.ownRank(), () => this.render());
    mountFlexCard(this, contentEl, { trades: [t], title: `${t.symbol} · ${t.direction.toUpperCase()}`, label: `${t.date} · ${t.time}`, mode: this.mode, chosen, facts: tradeFacts(t), saveName: `${t.date} ${t.symbol} ${t.direction}` });
  }

  onClose() {
    this.moving.stop();
    this.contentEl.empty();
  }
}

class FlexCardModal extends ThemedModal {
  constructor(app, plugin, scope, period) {
    super(app);
    this.plugin = plugin;
    this.scope = scope || 'all';
    this.period = period || 'all';
    this.mode = 'money';
    this.moving = new MovingCard(plugin);
  }

  onOpen() {
    this.modalEl.addClass('tvj-flex-modal');
    this.render();
  }

  render() {
    const { contentEl } = this;
    contentEl.empty();
    accentTitle(contentEl, 'h2', 'Flex card');
    const all = this.plugin.getTrades().map((x) => x.trade);
    const groups = parseGroups(this.plugin.settings.groups);
    const controls = contentEl.createDiv({ cls: 'tvj-options' });
    this.plugin.scopeSelect(controls, all, groups, this.scope, (v) => { this.scope = v; this.render(); });
    this.plugin.periodSelect(controls, all, this.period, (v) => { this.period = v; this.render(); });
    const mode = controls.createEl('select', { cls: 'dropdown' });
    mode.createEl('option', { text: 'Show $', value: 'money' });
    mode.createEl('option', { text: 'Hide money, show R', value: 'r' });
    mode.value = this.mode;
    mode.addEventListener('change', () => { this.mode = mode.value; this.render(); });

    const trades = filterScope(filterPeriod(all, this.period), this.scope, groups);
    const title = this.scope === 'all' ? 'All accounts' : this.scope.replace(/^(account|group):/, '');
    // card designs: the ones your rank has opened can be picked, the rest show the rank they need
    const chosen = this.plugin.renderSkinPicker(contentEl, this.plugin.ownRank(), () => this.render());
    mountFlexCard(this, contentEl, { trades, title, label: periodLabel(this.period, trades), mode: this.mode, chosen, saveName: title });
    if (!trades.length) contentEl.createEl('p', { text: 'No trades in this account and period.' });
  }

  onClose() {
    this.moving.stop();
    this.contentEl.empty();
  }
}

class DashboardView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.scope = 'all';
    this.period = 'all';
    this.tab = 'overview';
    this.calMonth = null; // null = the latest month that has trades
    this.simTrades = 250;
    this.simLimit = '2000';
  }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return tx('TrueVision Journal'); }
  getIcon() { return ICON_ID; }

  async onOpen() {
    this.register(keepLocalized(this.contentEl));
    playEnter(this.contentEl);
    this.render();
    this.plugin.watchData(this, () => this.render());
  }

  render() {
    const root = this.contentEl;
    root.empty();
    root.addClass('tvj-dashboard');
    const allItems = this.plugin.getTrades();
    const allTrades = allItems.map((x) => x.trade);
    const groups = parseGroups(this.plugin.settings.groups);
    const picked = new Set(filterScope(filterPeriod(allTrades, this.period), this.scope, groups));
    const items = allItems.filter((x) => picked.has(x.trade));
    const trades = items.map((x) => x.trade);
    const pending = items.filter((x) => !x.trade.reviewed);

    // sticky header: where you are, where you can go, and the main actions
    const head = root.createDiv({ cls: 'tvj-head' });
    this.plugin.renderNav(head, VIEW_TYPE);
    const actions = head.createDiv({ cls: 'tvj-options' });
    newTradeButton(actions, this.app, this.plugin);
    actions.createEl('button', { text: pending.length ? `Review (${pending.length})` : 'Review' }).addEventListener('click', () => new PendingTradeSuggest(this.app, this.plugin).open());
    actions.createEl('button', { text: 'Flex card' }).addEventListener('click', () => new FlexCardModal(this.app, this.plugin, this.scope, this.period).open());

    if (!allItems.length) {
      const empty = root.createDiv({ cls: 'tvj-card tvj-empty' });
      empty.createEl('h3', { text: 'No trades yet' });
      empty.createEl('p', { cls: 'tvj-muted', text: `Write your first trade with "New trade", or unpack a TrueVision web export into "${this.plugin.settings.folder}".` });
      empty.createEl('button', { text: '+ Account' }).addEventListener('click', () => new AddAccountModal(this.app, this.plugin).open());
      return;
    }

    const filters = root.createDiv({ cls: 'tvj-filters' });
    this.plugin.scopeSelect(filters, allTrades, groups, this.scope, (v) => { this.scope = v; this.render(); });
    filters.createEl('button', { text: '+ Account' }).addEventListener('click', () => {
      new AddAccountModal(this.app, this.plugin, (name) => { this.scope = `account:${name}`; this.render(); }).open();
    });
    this.plugin.renameAccountButton(filters, this.scope, (name) => { this.scope = `account:${name}`; this.render(); });
    this.plugin.periodSelect(filters, allTrades, this.period, (v) => { this.period = v; this.render(); });

    const tabs = root.createDiv({ cls: 'tvj-tabs' });
    for (const [id, label] of [['overview', 'Overview'], ['calendar', 'Calendar'], ['accounts', 'Accounts'], ['simulation', 'Simulation']]) {
      tabs.createEl('button', { text: label, cls: `tvj-tab ${this.tab === id ? 'is-active' : ''}` }).addEventListener('click', () => { this.tab = id; this.render(); });
    }

    const card = (title, sub) => {
      const el = root.createDiv({ cls: 'tvj-card' });
      if (title) {
        const h = el.createDiv({ cls: 'tvj-card-head' });
        h.createDiv({ cls: 'tvj-card-title', text: title });
        if (sub) h.createDiv({ cls: 'tvj-muted', text: sub });
      }
      return el;
    };
    const scopeTitle = this.scope === 'all' ? 'All accounts' : this.scope.replace(/^(account|group):/, '');

    if (this.tab === 'calendar') {
      // the calendar pages through months itself, so it uses the account/group filter but not the period
      this.renderCalendar(card(), filterScope(allTrades, this.scope, groups));
      return;
    }
    if (this.tab === 'accounts') {
      this.renderBreakdown(card(), allTrades, groups);
      return;
    }
    if (this.tab === 'simulation') {
      this.renderSimulation(card(), trades);
      return;
    }

    if (!trades.length) {
      card().createEl('p', { cls: 'tvj-muted', text: `No trades for ${scopeTitle} in this period.` });
      return;
    }

    // hero: the one number that matters, with the equity curve behind it
    const s = computeStats(trades);
    const hero = root.createDiv({ cls: 'tvj-card tvj-hero' });
    const left = hero.createDiv({ cls: 'tvj-hero-main' });
    left.createDiv({ cls: 'tvj-eyebrow', text: 'Net P&L' });
    left.createDiv({ cls: `tvj-hero-value ${s.net < 0 ? 'tvj-neg' : 'tvj-pos'}`, text: money(Math.round(s.net)) });
    left.createDiv({ cls: 'tvj-hero-title', text: scopeTitle });
    left.createDiv({ cls: 'tvj-muted', text: `${periodLabel(this.period, trades)} · ${s.trades} trades (${s.wins}W / ${s.losses}L) · ${money(Math.round(s.expectancy))} per trade` });
    this.renderEquity(hero.createDiv({ cls: 'tvj-hero-chart' }), trades, s.net < 0);

    // sections, each under a small label with a quiet link on the right when there is somewhere to go
    const section = (title, link, go) => {
      const h = root.createDiv({ cls: 'tvj-section-head' });
      h.createDiv({ cls: 'tvj-section-title', text: title });
      if (link) h.createEl('button', { cls: 'tvj-link tvj-section-link', text: link }).addEventListener('click', go);
    };
    section('Performance', 'By account →', () => { this.tab = 'accounts'; this.render(); });
    const tiles = root.createDiv({ cls: 'tvj-tiles' });
    const tile = (label, value, sub, cls, bar) => {
      const el = tiles.createDiv({ cls: 'tvj-tile' });
      el.createDiv({ cls: 'tvj-tile-label', text: label });
      el.createDiv({ cls: `tvj-tile-value ${cls || ''}`, text: value });
      if (bar !== undefined) el.createDiv({ cls: 'tvj-meter' }).createDiv({ cls: 'tvj-meter-fill' }).style.width = `${Math.max(0, Math.min(100, bar))}%`;
      if (sub) el.createDiv({ cls: 'tvj-tile-sub', text: sub });
    };
    tile('Win rate', `${s.winRate.toFixed(1)}%`, `${s.wins} wins · ${s.losses} losses`, '', s.winRate);
    const proc = processStats(trades);
    tile('Process', proc.score === null ? '—' : `${Math.round(proc.score)}%`, proc.reviewed ? (LANG === 'vi' ? `${proc.clean} / ${proc.reviewed} lệnh đã review không có lỗi` : `${proc.clean} of ${proc.reviewed} reviewed trades with no mistake`) : 'review trades to see it', proc.score !== null && proc.score < 50 ? 'tvj-warn' : '', proc.score === null ? undefined : proc.score);
    tile('Profit factor', s.profitFactor === null ? '—' : s.profitFactor.toFixed(2), 'gross win ÷ gross loss');
    tile('Avg RR', s.rr === null ? '—' : s.rr.toFixed(2), s.rrAccounts > 1 ? `average of ${s.rrAccounts} accounts` : 'average win ÷ average loss');
    tile('Max drawdown', money(-Math.round(s.maxDrawdown)), 'from an equity peak', s.maxDrawdown ? 'tvj-neg' : '');
    tile('Pending review', String(pending.length), pending.length ? 'trades not reviewed yet' : 'all reviewed', pending.length ? 'tvj-warn' : '');

    const bars = (el, rows) => {
      const max = Math.max(1, ...rows.map((r) => Math.abs(r.net)));
      for (const r of rows) {
        const line = el.createDiv({ cls: 'tvj-bar-row' });
        const name = line.createDiv({ cls: 'tvj-bar-name' });
        name.createDiv({ text: r.name });
        name.createDiv({ cls: 'tvj-tile-sub', text: `${r.trades} trades · ${r.winRate.toFixed(0)}% win` });
        line.createDiv({ cls: 'tvj-bar-track' }).createDiv({ cls: `tvj-bar-fill ${r.net < 0 ? 'is-neg' : ''}` }).style.width = `${(Math.abs(r.net) / max) * 100}%`;
        line.createDiv({ cls: `tvj-bar-value ${r.net < 0 ? 'tvj-neg' : 'tvj-pos'}`, text: money(Math.round(r.net)) });
      }
    };
    const group = (key) => {
      const m = new Map();
      for (const t of trades) for (const k of [].concat(key(t))) m.set(k, [...(m.get(k) || []), t]); // a trade with two setups counts in both
      return [...m].map(([name, ts]) => ({ name, ...computeStats(ts) }));
    };
    section('P&L over time', 'Calendar →', () => { this.tab = 'calendar'; this.render(); });
    this.renderDailyCharts(root, trades);
    section('Holding time');
    this.renderDurationCharts(root, trades);
    section('Breakdown');

    const two = root.createDiv({ cls: 'tvj-grid-2' });
    const setupCard = two.createDiv({ cls: 'tvj-card' });
    setupCard.createDiv({ cls: 'tvj-card-title', text: 'By setup' });
    bars(setupCard, group((t) => ((t.setups || []).length ? t.setups : ['No setup'])).sort((a, b) => b.net - a.net));
    const dayCard = two.createDiv({ cls: 'tvj-card' });
    dayCard.createDiv({ cls: 'tvj-card-title', text: 'By weekday' });
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    bars(dayCard, group((t) => DAYS[new Date(`${t.date}T12:00:00`).getDay()]).sort((a, b) => DAYS.indexOf(a.name) - DAYS.indexOf(b.name)));
    // the cost of each mistake: what the trades tagged with it made, worst first
    const byMistake = group((t) => t.mistakes || []).sort((a, b) => a.net - b.net);
    if (byMistake.length) {
      const mc = root.createDiv({ cls: 'tvj-card' });
      mc.createDiv({ cls: 'tvj-card-title', text: 'Cost of mistakes' });
      mc.createEl('p', { cls: 'tvj-muted', text: LANG === 'vi' ? `Lệnh không lỗi: ${signedMoney(Math.round(proc.cleanNet))} · lệnh có lỗi: ${signedMoney(Math.round(proc.mistakeNet))}` : `Trades with no mistake: ${signedMoney(Math.round(proc.cleanNet))} · with a mistake: ${signedMoney(Math.round(proc.mistakeNet))}` });
      bars(mc, byMistake);
    }

    const recent = card('Recent trades', `${trades.length} in total`);
    const list = recent.createDiv({ cls: 'tvj-list' });
    for (const x of [...items].sort((a, b) => byTime(b.trade, a.trade)).slice(0, 8)) {
      const t = x.trade;
      const row = list.createDiv({ cls: 'tvj-row' });
      const info = row.createSpan();
      info.createSpan({ cls: `tvj-side ${t.direction === 'long' ? 'is-long' : 'is-short'}`, text: t.direction });
      info.createSpan({ text: ` ${t.symbol} · ${t.date} ${t.time}${(t.setups || []).length ? ` · ${t.setups.join(', ')}` : ''}` });
      const right = row.createSpan();
      right.createSpan({ text: money(netPnl(t)), cls: netPnl(t) < 0 ? 'tvj-neg' : 'tvj-pos' });
      if (!t.reviewed) {
        right.createEl('button', { text: 'Review' }).addEventListener('click', (e) => {
          e.stopPropagation();
          new ReviewModal(this.app, this.plugin, x).open();
        });
      }
      row.addEventListener('click', () => this.plugin.openInSide(x.file));
    }
    recent.createEl('button', { text: 'Open the full journal', cls: 'tvj-link' }).addEventListener('click', () => this.plugin.openView(JOURNAL_VIEW_TYPE));
  }

  renderCalendar(root, trades) {
    const days = dailyResults(trades);
    const latest = [...days.keys()].sort().pop();
    const month = this.calMonth || (latest ? latest.slice(0, 7) : isoDay(new Date()).slice(0, 7));
    const inMonth = [...days].filter(([d]) => d.startsWith(month));
    const total = sum(inMonth.map(([, d]) => d.pnl));
    const biggest = Math.max(1, ...inMonth.map(([, d]) => Math.abs(d.pnl)));
    const short = (n) => `${n < 0 ? '−' : '+'}$${Math.abs(n) >= 10000 ? `${(Math.abs(n) / 1000).toFixed(1)}K` : Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

    const head = root.createDiv({ cls: 'tvj-cal-head' });
    head.createDiv({ cls: 'tvj-card-title', text: `P&L calendar · ${month}` });
    const nav = head.createDiv({ cls: 'tvj-options' });
    nav.createSpan({ cls: `tvj-muted ${total < 0 ? 'tvj-neg' : 'tvj-pos'}`, text: `${money(total)} · ${inMonth.length} trading days · ${inMonth.filter(([, d]) => d.pnl > 0).length} green` });
    nav.createEl('button', { text: '‹', attr: { 'aria-label': 'Previous month' } }).addEventListener('click', () => { this.calMonth = shiftMonth(month, -1); this.render(); });
    nav.createEl('button', { text: '›', attr: { 'aria-label': 'Next month' } }).addEventListener('click', () => { this.calMonth = shiftMonth(month, 1); this.render(); });

    const grid = root.createDiv({ cls: 'tvj-cal' });
    const written = this.plugin.dayReviewDates(this.scope);
    for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Week']) grid.createDiv({ cls: 'tvj-cal-dow', text: d });
    monthGrid(month).forEach((week, w) => {
      let weekPnl = 0, weekTrades = 0;
      for (const d of week) {
        const r = d ? days.get(d) : null;
        const cell = grid.createDiv({ cls: `tvj-cal-day ${d ? '' : 'is-out'}` });
        if (d) {
          cell.createDiv({ cls: 'tvj-cal-num', text: String(Number(d.slice(8))) });
          if (written.has(d)) cell.createDiv({ cls: 'tvj-cal-note', text: '✎', attr: { 'aria-label': 'Day reviewed' } });
          cell.addClass('tvj-pick');
          cell.setAttribute('title', tx('Open the day review'));
          cell.addEventListener('click', () => new DayReviewModal(this.app, this.plugin, d, this.scope).open());
        }
        if (r) {
          weekPnl += r.pnl;
          weekTrades += r.trades;
          cell.addClass(r.pnl < 0 ? 'is-down' : 'is-up');
          cell.style.setProperty('--tvj-heat', (0.14 + 0.34 * (Math.abs(r.pnl) / biggest)).toFixed(2));
          cell.createDiv({ cls: `tvj-cal-pnl ${r.pnl < 0 ? 'tvj-neg' : 'tvj-pos'}`, text: short(r.pnl) });
          cell.createDiv({ cls: 'tvj-cal-count', text: `${r.trades} trade${r.trades > 1 ? 's' : ''}` });
        }
      }
      const cell = grid.createDiv({ cls: 'tvj-cal-day is-week' });
      cell.createDiv({ cls: 'tvj-cal-num', text: `W${w + 1}` });
      if (weekTrades) {
        cell.createDiv({ cls: `tvj-cal-pnl ${weekPnl < 0 ? 'tvj-neg' : 'tvj-pos'}`, text: short(weekPnl) });
        cell.createDiv({ cls: 'tvj-cal-count', text: `${weekTrades} trade${weekTrades > 1 ? 's' : ''}` });
      }
    });
  }

  renderSimulation(root, trades) {
    const head = root.createDiv({ cls: 'tvj-cal-head' });
    head.createDiv({ cls: 'tvj-card-title', text: 'Long-term simulation' });
    const controls = head.createDiv({ cls: 'tvj-options' });
    const horizon = controls.createEl('select', { cls: 'dropdown' });
    for (const n of [100, 250, 500, 1000]) horizon.createEl('option', { text: `${n} trades`, value: String(n) });
    horizon.value = String(this.simTrades);
    horizon.addEventListener('change', () => { this.simTrades = Number(horizon.value); this.render(); });
    controls.createSpan({ cls: 'tvj-muted', text: 'Drawdown limit $' });
    const limit = controls.createEl('input', { type: 'text', cls: 'tvj-sim-limit', value: this.simLimit });
    limit.addEventListener('change', () => { this.simLimit = limit.value; this.render(); });

    const ddLimit = Number(this.simLimit) > 0 ? Number(this.simLimit) : null;
    const p = simulate(trades.map(netPnl), this.simTrades, ddLimit);
    if (!p) {
      root.createEl('p', { cls: 'tvj-muted', text: 'At least 5 trades in the selected account and period are needed for a simulation.' });
      return;
    }
    const tiles = root.createDiv({ cls: 'tvj-tiles' });
    const tile = (label, value, cls) => {
      const el = tiles.createDiv({ cls: 'tvj-tile' });
      el.createDiv({ cls: 'tvj-tile-label', text: label });
      el.createDiv({ cls: `tvj-sim-value ${cls || ''}`, text: value });
    };
    tile('Typical result (median)', money(Math.round(p.final.p50)), p.final.p50 < 0 ? 'tvj-neg' : 'tvj-pos');
    tile('Bad → good case (10%–90%)', `${money(Math.round(p.final.p10))} → ${money(Math.round(p.final.p90))}`);
    tile('Chance of profit', `${p.probProfit.toFixed(0)}%`);
    tile('Typical max drawdown', money(-Math.round(p.ddMedian)), 'tvj-neg');
    tile('1 run in 10 is worse than', money(-Math.round(p.ddP90)), 'tvj-neg');
    tile('Chance of hitting the limit', p.ruinProb === null ? '—' : `${p.ruinProb.toFixed(0)}%`);

    const W = 640, H = 220, padL = 8, padR = 8, padT = 10, padB = 10;
    const lo = Math.min(0, ...p.points.map((q) => q.p10));
    const hi = Math.max(0, ...p.points.map((q) => q.p90));
    const span = hi - lo || 1;
    const x = (n) => padL + (n / this.simTrades) * (W - padL - padR);
    const y = (v) => padT + ((hi - v) / span) * (H - padT - padB);
    const line = (k) => p.points.map((q) => `${x(q.n).toFixed(1)},${y(q[k]).toFixed(1)}`);
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'tvj-equity');
    const add = (tag, attrs) => {
      const el = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      svg.appendChild(el);
    };
    add('line', { x1: padL, x2: W - padR, y1: y(0), y2: y(0), class: 'tvj-equity-zero' });
    add('polygon', { points: [...line('p90'), ...line('p10').reverse()].join(' '), class: 'tvj-sim-band' });
    add('polyline', { points: line('p50').join(' '), class: 'tvj-equity-line' });
    root.appendChild(svg);
    root.createEl('p', {
      cls: 'tvj-muted',
      text: `Shaded area = 10%–90% of ${p.runs.toLocaleString('en-US')} runs over ${this.simTrades} trades; the line is the median. Each run draws results at random from the ${trades.length} selected trades. It assumes future trades look like past ones and are independent — with few trades it is unreliable, and it is not a forecast.`,
    });
  }

  /** Per-account and per-group results for the selected period; a row click focuses the dashboard on it. */
  renderBreakdown(root, allTrades, groups) {
    const inPeriod = filterPeriod(allTrades, this.period);
    const accounts = this.plugin.allAccounts(inPeriod);
    const settings = this.plugin.settings;
    const table = (title, first, rows, total) => {
      root.createDiv({ cls: 'tvj-card-title', text: title });
      const el = root.createEl('table', { cls: 'tvj-table tvj-table-gap' });
      const hr = el.createEl('thead').createEl('tr');
      for (const [h, cls] of [[first, ''], ['Trades', ''], ['Win rate', ''], ['PF', 'tvj-col-opt'], ['RR', 'tvj-col-opt'], ['Max DD', 'tvj-col-opt'], ['Net P&L', ''], ['Payouts', 'tvj-col-opt'], ['Balance', '']]) hr.createEl('th', { text: h, cls });
      const body = el.createEl('tbody');
      const line = (name, ts, scope, cls) => {
        const g = computeStats(ts);
        const tr = body.createEl('tr', { cls: `tvj-pick ${this.scope === scope ? 'is-active' : ''} ${cls || ''}` });
        const nameCell = tr.createEl('td', { text: name });
        const status = scope.startsWith('account:') ? accountStatus(scope.slice(8), allTrades, settings.accountInfo) : null;
        if (status && status.blown) {
          tr.classList.add('is-blown');
          nameCell.createSpan({ cls: 'tvj-blown-tag', text: 'Blown' }).setAttribute('title', status.blownOn);
        }
        tr.createEl('td', { text: String(g.trades) });
        tr.createEl('td', { text: g.trades ? `${g.winRate.toFixed(1)}%` : '—' });
        tr.createEl('td', { text: g.profitFactor === null ? '—' : g.profitFactor.toFixed(2), cls: 'tvj-col-opt' });
        tr.createEl('td', { text: g.rr === null ? '—' : g.rr.toFixed(2), cls: 'tvj-col-opt' });
        tr.createEl('td', { text: money(-g.maxDrawdown), cls: 'tvj-col-opt' });
        tr.createEl('td', { text: money(g.net), cls: g.net < 0 ? 'tvj-neg' : 'tvj-pos' });
        // balance and payouts are all-time figures for the accounts behind this row, whatever the period
        const names = scopeAccounts(scope, accounts.filter((a) => a !== NO_ACCOUNT), groups);
        const c = careerStats(filterScope(allTrades, scope, groups), names, settings.accountInfo, settings.payouts);
        tr.createEl('td', { text: c.payouts ? money(Math.round(c.payouts)) : '—', cls: 'tvj-col-opt' });
        tr.createEl('td', { text: status && status.blown ? 'Blown' : c.balance === null ? '—' : money(Math.round(c.balance)), cls: status && status.blown ? 'tvj-neg' : '' });
        tr.addEventListener('click', () => { this.scope = scope; this.render(); });
      };
      for (const r of rows) line(r.name, r.trades, r.scope);
      if (total) line('Total', inPeriod, 'all', 'is-total');
    };
    table('By account', 'Account', accounts.map((a) => ({ name: a, trades: inPeriod.filter((t) => accountName(t) === a), scope: `account:${a}` })), true);
    if (groups.length) {
      table('By account group', 'Group', groups.map((g) => ({ name: g.name, trades: filterScope(inPeriod, `group:${g.name}`, groups), scope: `group:${g.name}` })), false);
    }
  }

  /** Two charts by day: the running total, and each day's own result. */
  renderDailyCharts(root, trades) {
    const days = dailySeries(trades);
    if (days.length < 2) return;
    const NS = 'http://www.w3.org/2000/svg';
    const W = 640, H = 240, left = 58, right = 10, top = 12, bottom = 26;
    const node = (parent, name, attrs) => {
      const el = document.createElementNS(NS, name);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
      parent.appendChild(el);
      return el;
    };
    const compact = (v) => `${v < 0 ? '−' : ''}$${Math.abs(v) >= 1000 ? `${(Math.abs(v) / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1)}k` : Math.round(Math.abs(v))}`;
    const two = root.createDiv({ cls: 'tvj-grid-2' });
    const frame = (title, values) => {
      const card = two.createDiv({ cls: 'tvj-card' });
      card.createDiv({ cls: 'tvj-card-title', text: title });
      const svg = node(card, 'svg', { viewBox: `0 0 ${W} ${H}`, class: 'tvj-chart', role: 'img', 'aria-label': title });
      const min = Math.min(0, ...values), max = Math.max(0, ...values);
      const span = max - min || 1;
      const y = (v) => top + ((max - v) / span) * (H - top - bottom);
      // three guide lines with their values: top, zero, bottom
      for (const v of [...new Set([max, 0, min])]) {
        node(svg, 'line', { x1: left, x2: W - right, y1: y(v), y2: y(v), class: v === 0 ? 'tvj-chart-zero' : 'tvj-chart-grid' });
        node(svg, 'text', { x: left - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'tvj-chart-label' }).textContent = compact(v);
      }
      // dates along the bottom: first, middle, last
      const xAt = (i) => left + ((i + 0.5) / days.length) * (W - left - right);
      for (const i of [...new Set([0, Math.floor((days.length - 1) / 2), days.length - 1])]) {
        node(svg, 'text', { x: xAt(i), y: H - 6, 'text-anchor': i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle', class: 'tvj-chart-label' }).textContent = days[i].date.slice(5);
      }
      return { svg, y, xAt };
    };

    const cum = frame('Daily cumulative P&L', days.map((d) => d.cum));
    const line = days.map((d, i) => `${i ? 'L' : 'M'}${cum.xAt(i).toFixed(1)},${cum.y(d.cum).toFixed(1)}`).join(' ');
    const last = days[days.length - 1].cum;
    const tone = last < 0 ? 'is-neg' : 'is-pos';
    node(cum.svg, 'path', { d: `${line} L${cum.xAt(days.length - 1).toFixed(1)},${cum.y(0)} L${cum.xAt(0).toFixed(1)},${cum.y(0)} Z`, class: `tvj-chart-area ${tone}` });
    node(cum.svg, 'path', { d: line, class: `tvj-chart-line ${tone}` });

    const daily = frame('Net daily P&L', days.map((d) => d.pnl));
    const barW = Math.max(2, Math.min(26, ((W - left - right) / days.length) * 0.62));
    days.forEach((d, i) => {
      const y0 = daily.y(0), y1 = daily.y(d.pnl);
      const bar = node(daily.svg, 'rect', { x: daily.xAt(i) - barW / 2, y: Math.min(y0, y1), width: barW, height: Math.max(1, Math.abs(y1 - y0)), rx: Math.min(3, barW / 2), class: `tvj-chart-bar ${d.pnl < 0 ? 'is-neg' : 'is-pos'}` });
      node(bar, 'title', {}).textContent = `${d.date}: ${money(Math.round(d.pnl))}`;
    });
  }

  /** How long trades were held, and how often each holding time won. Needs trades with an exit time. */
  renderDurationCharts(root, trades) {
    const { timed, rows } = durationBuckets(trades);
    const two = root.createDiv({ cls: 'tvj-grid-2' });
    const countCard = two.createDiv({ cls: 'tvj-card' });
    const head = countCard.createDiv({ cls: 'tvj-card-head' });
    head.createDiv({ cls: 'tvj-card-title', text: 'Trade duration' });
    head.createDiv({ cls: 'tvj-muted', text: `${timed} of ${trades.length} trades have a duration` });
    const rateCard = two.createDiv({ cls: 'tvj-card' });
    const rateHead = rateCard.createDiv({ cls: 'tvj-card-head' });
    rateHead.createDiv({ cls: 'tvj-card-title', text: 'Win rate by duration' });
    rateHead.createDiv({ cls: 'tvj-muted', text: 'faded: under 5 trades' });
    if (!timed) {
      const hint = 'Durations come from the exit time: import trades from a CSV, or fill in Exit time when you log a trade.';
      countCard.createEl('p', { cls: 'tvj-muted', text: hint });
      rateCard.createEl('p', { cls: 'tvj-muted', text: hint });
      return;
    }
    const most = Math.max(1, ...rows.map((r) => r.count));
    // a bucket with fewer than 5 trades says little: its win rate is faded and shows how many trades it rests on
    const THIN = 5;
    for (const r of rows) {
      const a = countCard.createDiv({ cls: `tvj-hbar${r.count ? '' : ' is-empty'}` });
      a.createDiv({ cls: 'tvj-hbar-name', text: r.label });
      a.createDiv({ cls: 'tvj-hbar-track' }).createDiv({ cls: 'tvj-hbar-fill' }).style.width = `${(r.count / most) * 100}%`;
      a.createDiv({ cls: 'tvj-hbar-value', text: String(r.count) });
      const thin = r.count > 0 && r.count < THIN;
      const b = rateCard.createDiv({ cls: `tvj-hbar${r.count ? '' : ' is-empty'}${thin ? ' is-thin' : ''}`, attr: thin ? { title: LANG === 'vi' ? `Chỉ ${r.count} lệnh` : `Only ${r.count} trade${r.count === 1 ? '' : 's'}` } : {} });
      b.createDiv({ cls: 'tvj-hbar-name', text: r.label });
      b.createDiv({ cls: 'tvj-hbar-track' }).createDiv({ cls: `tvj-hbar-fill ${r.winRate === null ? '' : r.winRate >= 50 ? 'is-pos' : 'is-neg'}` }).style.width = `${r.winRate === null ? 0 : Math.max(2, r.winRate)}%`;
      const v = b.createDiv({ cls: 'tvj-hbar-value', text: r.winRate === null ? '—' : `${r.winRate.toFixed(0)}%` });
      if (r.count) v.createSpan({ cls: 'tvj-hbar-n', text: ` ${r.count}` });
    }
  }

  renderEquity(root, trades, negative) {
    const sorted = [...trades].sort(byTime);
    let equity = 0;
    const points = [0, ...sorted.map((t) => (equity += netPnl(t)))];
    const W = 640, H = 190, pad = 6;
    const min = Math.min(...points), max = Math.max(...points);
    const span = max - min || 1;
    const x = (i) => pad + (i / (points.length - 1 || 1)) * (W - pad * 2);
    const y = (v) => pad + ((max - v) / span) * (H - pad * 2);
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('class', `tvj-spark ${negative ? 'is-neg' : ''}`);
    const add = (tag, attrs) => {
      const el = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      svg.appendChild(el);
    };
    const line = points.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    add('polygon', { points: [`${x(0)},${H}`, ...line, `${x(points.length - 1)},${H}`].join(' '), class: 'tvj-spark-area' });
    add('line', { x1: pad, x2: W - pad, y1: y(0), y2: y(0), class: 'tvj-equity-zero' });
    add('polyline', { points: line.join(' '), class: 'tvj-spark-line', 'vector-effect': 'non-scaling-stroke' });
    root.appendChild(svg);
  }

  async onClose() {
    this.contentEl.empty();
  }
}

/** The journal itself: every trade as a row, newest first. One click on the ribbon opens it as a tab. */
