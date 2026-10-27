// ---------- journal filters ----------
//
// Every column of the Journal can narrow the list. A choice per field (symbol, side, result, setup, review) and a
// from–to range for the numbers (net P&L, R, quantity, entry, exit); an empty field lets every trade through.

const JOURNAL_CHOICES = ['symbol', 'side', 'result', 'setup', 'mistake', 'reviewed'];
const JOURNAL_RANGES = [['pnl', 'Net P&L'], ['r', 'R'], ['qty', 'Qty'], ['entry', 'Entry'], ['exit', 'Exit']];
const emptyJournalFilter = () => Object.fromEntries([...JOURNAL_CHOICES, ...JOURNAL_RANGES.flatMap(([k]) => [`${k}Min`, `${k}Max`])].map((k) => [k, '']));

/** A typed number ("$-1,200", "−50", "1.5R"), or null when the field is empty or not a number. */
function filterNumber(v) {
  const s = String(v === undefined || v === null ? '' : v).replace(/[$,\s]/g, '').replace(/[−–]/g, '-').replace(/r$/i, '');
  const n = s === '' ? NaN : Number(s);
  return Number.isFinite(n) ? n : null;
}

/** How many of the Journal's fields are narrowing the list (a range counts once). */
function journalFilterCount(f) {
  const set = (k) => String(f[k] || '').trim() !== '';
  return JOURNAL_CHOICES.filter(set).length + JOURNAL_RANGES.filter(([k]) => filterNumber(f[`${k}Min`]) !== null || filterNumber(f[`${k}Max`]) !== null).length;
}

/** The trades that pass every field of the Journal's filter. */
function filterJournal(trades, f) {
  const within = (value, lo, hi) => {
    const a = filterNumber(lo), b = filterNumber(hi);
    if (a === null && b === null) return true;
    if (value === null || !Number.isFinite(value)) return false; // a trade without that number (no stop: no R)
    return (a === null || value >= a - 1e-9) && (b === null || value <= b + 1e-9);
  };
  return trades.filter((t) => {
    const pnl = netPnl(t), setups = t.setups || [], mistakes = t.mistakes || [];
    if (f.symbol && t.symbol !== f.symbol) return false;
    if (f.side && t.direction !== f.side) return false;
    if (f.result === 'win' && !(pnl > 0.005)) return false;
    if (f.result === 'loss' && !(pnl < -0.005)) return false;
    if (f.result === 'even' && Math.abs(pnl) > 0.005) return false;
    if (f.setup === '-' && setups.length) return false;
    if (f.setup && f.setup !== '-' && !setups.includes(f.setup)) return false;
    // '*': any mistake tagged; '-': none; else that one mistake
    if (f.mistake === '*' && !mistakes.length) return false;
    if (f.mistake === '-' && mistakes.length) return false;
    if (f.mistake && f.mistake !== '*' && f.mistake !== '-' && !mistakes.includes(f.mistake)) return false;
    if (f.reviewed === 'yes' && !t.reviewed) return false;
    if (f.reviewed === 'no' && t.reviewed) return false;
    return within(pnl, f.pnlMin, f.pnlMax) && within(rMultiple(t), f.rMin, f.rMax) && within(t.qty, f.qtyMin, f.qtyMax)
      && within(t.entry, f.entryMin, f.entryMax) && within(t.exit, f.exitMin, f.exitMax);
  });
}

class JournalView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.scope = 'all';
    this.period = 'all';
    this.filter = emptyJournalFilter();
    this.showFilters = false;
    this.kind = ''; // '' trades you took, 'missed', 'backtest', or 'all'
  }
  getViewType() { return JOURNAL_VIEW_TYPE; }
  getDisplayText() { return tx('TrueVision Journal — trades'); }
  getIcon() { return 'notebook-pen'; }

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
    const everyItem = this.plugin.getTrades(null, true);
    const uncounted = everyItem.filter((x) => !isCounted(x.trade)).length;
    if (!uncounted) this.kind = '';
    const allItems = everyItem.filter((x) => (this.kind === 'all' ? true : this.kind ? x.trade.kind === this.kind : isCounted(x.trade)));
    const groups = parseGroups(this.plugin.settings.groups);

    const head = root.createDiv({ cls: 'tvj-head' });
    this.plugin.renderNav(head, JOURNAL_VIEW_TYPE);
    const actions = head.createDiv({ cls: 'tvj-options' });
    newTradeButton(actions, this.app, this.plugin);
    actions.createEl('button', { text: 'Share' }).addEventListener('click', () => new PackageModal(this.app, this.plugin).open());
    actions.createEl('button', { text: 'Review' }).addEventListener('click', () => new PendingTradeSuggest(this.app, this.plugin).open());
    actions.createEl('button', { text: 'Review card' }).addEventListener('click', () => new ReviewCardModal(this.app, this.plugin, this.scope).open());

    if (!everyItem.length) {
      root.createEl('p', { text: 'No trades yet. Click "New trade" to write the first one, or to import trades from your platform.' });
      return;
    }

    const filters = root.createDiv({ cls: 'tvj-filters' });
    this.plugin.scopeSelect(filters, allItems.map((x) => x.trade), groups, this.scope, (v) => { this.scope = v; this.render(); });
    filters.createEl('button', { text: '+ Account' }).addEventListener('click', () => {
      new AddAccountModal(this.app, this.plugin, (name) => { this.scope = `account:${name}`; this.render(); }).open();
    });
    this.plugin.renameAccountButton(filters, this.scope, (name) => { this.scope = `account:${name}`; this.render(); });
    this.plugin.periodSelect(filters, allItems.map((x) => x.trade), this.period, (v) => { this.period = v; this.render(); });
    // missed and backtested trades are listed on their own, so the totals above a list never mix them in
    if (uncounted) {
      const kind = filters.createEl('select', { cls: 'dropdown', attr: { 'aria-label': 'Which trades' } });
      for (const [value, text] of [['', 'Trades taken'], ['missed', 'Missed trades'], ['backtest', 'Backtested trades'], ['all', 'All trades']]) kind.createEl('option', { value, text });
      kind.value = this.kind;
      kind.addEventListener('change', () => { this.kind = kind.value; this.render(); });
    }

    const picked = new Set(filterScope(filterPeriod(allItems.map((x) => x.trade), this.period), this.scope, groups));
    const items = allItems.filter((x) => picked.has(x.trade)).sort((a, b) => byTime(b.trade, a.trade));
    const filterButton = filters.createEl('button', { cls: 'tvj-filter-toggle', attr: { 'aria-expanded': String(this.showFilters) } });
    filterButton.addEventListener('click', () => { this.showFilters = !this.showFilters; this.render(); });
    const summary = filters.createSpan({ cls: 'tvj-muted' });
    const adds = this.plugin.source === 'own' && !this.kind ? pyramidGroups(allItems.map((x) => x.trade)) : [];
    if (adds.length) {
      const hint = root.createDiv({ cls: 'tvj-options tvj-pyramid-hint' });
      hint.createSpan({ cls: 'tvj-muted', text: `${adds.length} group(s) of trades closed together, like adds to one position.` });
      hint.createEl('button', { text: 'Combine…' }).addEventListener('click', () => new PyramidModal(this.app, this.plugin).open());
    }

    if (this.showFilters) this.renderFilters(root, items.map((x) => x.trade), () => draw());
    // only the list redraws while filtering, so a box being typed in keeps its focus
    const kpis = root.createDiv({ cls: 'tvj-journal-kpis' });
    const list = root.createDiv();
    // the trades shown, in four numbers: net P&L, win rate (wins / losses), average win against loss, profit factor
    const kpiRow = (st) => {
      kpis.empty();
      if (!st.trades) return;
      const head = kpis.createDiv({ cls: 'tvj-section-head' });
      head.createDiv({ cls: 'tvj-section-title', text: 'Performance' });
      const row = kpis.createDiv({ cls: 'tvj-tiles' });
      const tile = (label, value, sub, cls) => {
        const el = row.createDiv({ cls: 'tvj-tile' });
        el.createDiv({ cls: 'tvj-tile-label', text: label });
        el.createDiv({ cls: `tvj-tile-value ${cls || ''}`, text: value });
        if (sub) el.createDiv({ cls: 'tvj-tile-sub', text: sub });
      };
      tile('Net P&L', signedMoney(Math.round(st.net * 100) / 100), `${st.trades} ${st.trades === 1 ? 'trade' : 'trades'}`, st.net < 0 ? 'tvj-neg' : 'tvj-pos');
      tile('Win rate', `${st.winRate.toFixed(1)}%`, `${st.wins}W / ${st.losses}L`);
      tile('Avg win / loss', st.wins && st.losses ? (st.avgWin / -st.avgLoss).toFixed(2) : '—', `${money(Math.round(st.avgWin))} / ${money(Math.round(st.avgLoss))}`);
      tile('Profit factor', st.profitFactor === null ? '—' : st.profitFactor.toFixed(2), 'gross profit ÷ gross loss');
    };
    const draw = () => {
      const shown = filterJournal(items.map((x) => x.trade), this.filter);
      const keep = new Set(shown);
      const st = computeStats(shown);
      const n = journalFilterCount(this.filter);
      filterButton.setText(n ? `Filters · ${n}` : 'Filters');
      filterButton.toggleClass('is-on', n > 0);
      const left = shown.filter((t) => !isCounted(t)).length;
      const aside = this.kind === 'all' ? (left ? ` · ${left} ${tx('not counted')}` : '') : this.kind ? ` · ${tx('not counted in your stats')}` : '';
      // the Performance row has the numbers; the line beside Filters only says what is filtered out or set aside
      summary.setText((n ? `${st.trades} of ${items.length} trades` : '') + (n ? aside : aside.replace(/^ · /, '')));
      kpiRow(st);
      list.empty();
      this.renderList(list, items.filter((x) => keep.has(x.trade)), items.length);
    };
    draw();
  }

  /** The filter panel: a choice for each column with fixed values, a from–to range for each column of numbers. */
  renderFilters(root, trades, draw) {
    const panel = root.createDiv({ cls: 'tvj-card tvj-jfilter' });
    const f = this.filter;
    const field = (label) => {
      const box = panel.createDiv({ cls: 'tvj-jf-field' });
      box.createDiv({ cls: 'tvj-jf-label', text: label });
      return box;
    };
    const choice = (label, key, options) => {
      const select = field(label).createEl('select', { cls: 'dropdown' });
      if (f[key] && !options.some(([v]) => v === f[key])) options.push([f[key], f[key]]); // kept when the period changes
      for (const [value, text] of [['', 'All'], ...options]) select.createEl('option', { value, text });
      select.value = f[key];
      select.addEventListener('change', () => { f[key] = select.value; draw(); });
    };
    const sorted = (xs) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    choice('Symbol', 'symbol', sorted(trades.map((t) => t.symbol)).map((v) => [v, v]));
    choice('Side', 'side', [['long', 'Long'], ['short', 'Short']]);
    choice('Result', 'result', [['win', 'Wins'], ['loss', 'Losses'], ['even', 'Breakeven']]);
    choice('Setup', 'setup', [['-', 'No setup'], ...sorted(trades.flatMap((t) => t.setups || [])).map((v) => [v, v])]);
    choice('Mistake', 'mistake', [['*', 'Any mistake'], ['-', 'No mistake'], ...sorted(trades.flatMap((t) => t.mistakes || [])).map((v) => [v, v])]);
    choice('Review', 'reviewed', [['yes', 'Reviewed'], ['no', 'Not reviewed']]);
    for (const [key, label] of JOURNAL_RANGES) {
      const range = field(label).createDiv({ cls: 'tvj-jf-range' });
      const box = (end, placeholder) => {
        const input = range.createEl('input', { type: 'text', attr: { inputmode: 'decimal', placeholder } });
        input.value = f[`${key}${end}`];
        let timer = null;
        input.addEventListener('input', () => {
          f[`${key}${end}`] = input.value;
          window.clearTimeout(timer);
          timer = window.setTimeout(draw, 300);
        });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { window.clearTimeout(timer); draw(); } });
      };
      box('Min', 'from');
      range.createSpan({ cls: 'tvj-muted', text: '–' });
      box('Max', 'to');
    }
    const foot = panel.createDiv({ cls: 'tvj-jf-foot' });
    foot.createEl('button', { text: 'Clear filters' }).addEventListener('click', () => { this.filter = emptyJournalFilter(); this.render(); });
  }

  /** The trade table for the trades that passed the filters. */
  renderList(root, items, total) {
    if (!items.length) {
      root.createEl('p', { text: total ? 'No trades match these filters.' : 'No trades in this account and period.' });
      return;
    }
    // columns marked optional are hidden when the pane is narrow (see the container queries in styles.css)
    const OPT = 'tvj-col-opt';
    const table = root.createDiv({ cls: 'tvj-card tvj-scroll' }).createEl('table', { cls: 'tvj-table' });
    const hr = table.createEl('thead').createEl('tr');
    const SLIM = 'tvj-col-slim'; // hidden only in a very narrow pane; the symbol then shows under the date
    // the R column only when a trade in the list has a stop to measure R from
    const showR = items.some((x) => rMultiple(x.trade) !== null);
    for (const [h, cls] of [['Date', ''], ['Symbol', SLIM], ['Side', ''], ['Entry', OPT], ['Exit', OPT], ['Qty', OPT], ['Account', OPT], ['Setup', OPT], ['Net P&L', ''], ...(showR ? [['R', SLIM]] : []), ['', '']]) hr.createEl('th', { text: h, cls });
    const body = table.createEl('tbody');
    for (const x of items) {
      const t = x.trade;
      const r = rMultiple(t);
      const tr = body.createEl('tr', { cls: 'tvj-pick' });
      const when = tr.createEl('td', { cls: 'tvj-nowrap' });
      when.createDiv({ text: t.date });
      const sub = when.createDiv({ cls: 'tvj-tile-sub' });
      sub.createSpan({ cls: 'tvj-only-slim', text: `${t.symbol} · ` });
      sub.createSpan({ text: t.time });
      tr.createEl('td', { text: t.symbol, cls: SLIM });
      const side = tr.createEl('td');
      side.createSpan({ text: t.direction, cls: `tvj-side ${t.direction === 'long' ? 'is-long' : 'is-short'}` });
      if (!isCounted(t)) side.createSpan({ cls: `tvj-kind is-${t.kind}`, text: TRADE_KINDS[t.kind], attr: { title: 'Not counted in your P&L, accounts or rank' } });
      const legs = t.entries || [];
      const entryCell = tr.createEl('td', { text: t.pnlOnly ? '—' : String(legs.length > 1 ? Number(t.entry.toFixed(2)) : t.entry), cls: OPT });
      if (legs.length > 1) entryCell.createSpan({ cls: 'tvj-pyramid', text: `×${legs.length}`, attr: { title: legs.join('\n'), 'aria-label': `${legs.length} entries` } });
      const outs = t.exits || [];
      const exitCell = tr.createEl('td', { text: t.pnlOnly ? '—' : String(outs.length > 1 ? Number(t.exit.toFixed(2)) : t.exit), cls: OPT });
      if (outs.length > 1) exitCell.createSpan({ cls: 'tvj-pyramid', text: `×${outs.length}`, attr: { title: outs.join('\n'), 'aria-label': `${outs.length} exits` } });
      tr.createEl('td', { text: t.pnlOnly ? '—' : String(t.qty), cls: OPT });
      tr.createEl('td', { text: t.account || '—', cls: OPT });
      tr.createEl('td', { text: (t.setups || []).join(', ') || '—', cls: OPT });
      tr.createEl('td', { text: money(netPnl(t)), cls: netPnl(t) < 0 ? 'tvj-neg' : 'tvj-pos' });
      if (showR) tr.createEl('td', { text: r === null ? '—' : `${r.toFixed(2)}R`, cls: SLIM });
      const cell = tr.createEl('td', { cls: 'tvj-actions' });
      cell.createEl('button', { text: '✎', attr: { 'aria-label': 'Edit this trade' } }).addEventListener('click', (e) => {
        e.stopPropagation();
        new NewTradeModal(this.app, this.plugin, x).open();
      });
      cell.createEl('button', { text: 'Card', attr: { 'aria-label': 'P&L card of this trade' } }).addEventListener('click', (e) => {
        e.stopPropagation();
        new TradeCardModal(this.app, this.plugin, x).open();
      });
      const hasChart = !!this.plugin.chartPath(x.file);
      cell.createEl('button', { text: hasChart ? 'Chart' : 'Draw', attr: { 'aria-label': hasChart ? 'Open the Excalidraw chart' : 'Draw an Excalidraw chart' } }).addEventListener('click', (e) => {
        e.stopPropagation();
        this.plugin.openChart(x.file);
      });
      if (t.reviewed) cell.createSpan({ cls: 'tvj-done', text: '✓', attr: { 'aria-label': 'Reviewed' } });
      else {
        cell.createEl('button', { text: 'Review' }).addEventListener('click', (e) => {
          e.stopPropagation();
          new ReviewModal(this.app, this.plugin, x).open();
        });
      }
      tr.addEventListener('click', () => this.plugin.openInSide(x.file));
    }
  }

  async onClose() {
    this.contentEl.empty();
  }
}

