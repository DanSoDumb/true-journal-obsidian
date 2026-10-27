// ---------- side panel ----------
// A panel in Obsidian's left sidebar, beside the file explorer: every screen, review and tool of the journal in one
// list, with a search over trades and day notes on top. The screen open in the main area is highlighted.

/** Whether every word of `query` appears in `text`, ignoring case and Vietnamese accents. */
function matchesQuery(text, query) {
  const fold = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  const words = fold(query).split(/\s+/).filter(Boolean);
  const hay = fold(text);
  return words.length > 0 && words.every((w) => hay.includes(w));
}
/** The written part of a note for searching: no properties, headings, question labels or empty markers. */
const searchableBody = (content) => String(content || '').replace(/^---\n[\s\S]*?\n---\n?/, '').split('\n')
  .filter((l) => !/^\s*#/.test(l) && !/^\s*\|/.test(l)).join('\n').replace(/\*\*[^*]+\*\*/g, ' ').replace(/_—_/g, ' ');

class SidebarView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.query = '';
    this.results = null; // { trades, days } while searching
    this.searchRun = 0;
    this.viewItems = []; // [{ el, key }] for the highlight of the open screen
  }
  getViewType() { return SIDEBAR_VIEW_TYPE; }
  getDisplayText() { return 'True Journal'; }
  getIcon() { return ICON_ID; }
  async onOpen() {
    this.register(keepLocalized(this.contentEl));
    this.render();
    this.plugin.watchData(this, () => this.render());
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.markActive()));
  }
  /** Builds the panel once; later calls redraw the list (or the search results) and keep the search box as it is. */
  render() {
    if (!this.body || !this.body.isConnected) { this.build(); return; }
    if (this.query.trim()) this.runSearch();
    else this.drawBody();
  }
  build() {
    const root = this.contentEl;
    root.empty();
    root.addClass('tvj-panel');
    const brand = root.createDiv({ cls: 'tvj-panel-brand' });
    setIcon(brand.createSpan({ cls: 'tvj-panel-mark' }), ICON_ID);
    brand.createSpan({ text: 'True Journal' });
    const search = root.createDiv({ cls: 'tvj-panel-search' });
    setIcon(search.createSpan({ cls: 'tvj-panel-search-icon' }), 'search');
    const input = search.createEl('input', { attr: { type: 'search', placeholder: 'Search trades & day notes…', 'aria-label': 'Search trades and day notes', spellcheck: 'false' } });
    input.value = this.query;
    input.addEventListener('input', () => { this.query = input.value; this.searchLater(); });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !this.query) return;
      e.preventDefault();
      input.value = this.query = '';
      this.searchLater();
    });
    this.body = root.createDiv({ cls: 'tvj-panel-body' });
    this.drawBody();
  }
  searchLater() {
    window.clearTimeout(this.searchTimer);
    if (!this.query.trim()) { this.searchRun++; this.results = null; this.drawBody(); return; }
    this.searchTimer = window.setTimeout(() => this.runSearch(), 200);
  }
  async runSearch() {
    const run = ++this.searchRun;
    const found = await this.plugin.searchJournal(this.query);
    if (run !== this.searchRun) return; // a newer search has started
    this.results = found;
    this.drawBody();
  }
  /** One row: icon, label and an optional count; Enter or Space runs it like a click. */
  item(list, icon, label, run, opts = {}) {
    const el = list.createDiv({ cls: 'tvj-panel-item', attr: { role: 'button', tabindex: '0' } });
    setIcon(el.createSpan({ cls: 'tvj-panel-icon' }), icon);
    el.createSpan({ cls: 'tvj-panel-label', text: label });
    if (opts.badge) el.createSpan({ cls: 'tvj-panel-badge', text: String(opts.badge) });
    el.addEventListener('click', run);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); run(); } });
    if (opts.key) this.viewItems.push({ el, key: opts.key });
    return el;
  }
  section(parent, title, count) {
    const head = parent.createDiv({ cls: 'tvj-panel-section' });
    head.createSpan({ text: title });
    if (count !== undefined) head.createSpan({ cls: 'tvj-panel-count', text: String(count) });
    return parent.createDiv({ cls: 'tvj-panel-list' });
  }
  drawBody() {
    const body = this.body, plugin = this.plugin, app = this.app;
    body.empty();
    this.viewItems = [];
    if (this.results) { this.drawResults(body); return; }
    const screen = (list, icon, label, type) => this.item(list, icon, label, () => plugin.openView(type), { key: type });
    const overview = this.section(body, 'Overview');
    screen(overview, 'home', 'Lobby', LOBBY_VIEW_TYPE);
    screen(overview, 'layout-dashboard', 'Dashboard', VIEW_TYPE);
    screen(overview, 'list', 'Journal', JOURNAL_VIEW_TYPE);
    screen(overview, 'users', 'Accounts', ACCOUNTS_VIEW_TYPE);
    this.item(overview, 'target', 'Challenge tracker', () => plugin.openAccountsTab('tracker'), { key: `${ACCOUNTS_VIEW_TYPE}:tracker` });
    const pending = plugin.getTrades(null, true).filter((x) => !x.trade.reviewed).length;
    const reviews = this.section(body, 'Reviews');
    this.item(reviews, 'calendar-days', "Today's day review", () => new DayReviewModal(app, plugin, isoDay(new Date()), plugin.todayScope()).open());
    this.item(reviews, 'clipboard-check', 'Trades to review', () => new PendingTradeSuggest(app, plugin).open(), { badge: pending });
    // one card for the week and the month: it opens on the week, and its Period menu switches
    this.item(reviews, 'calendar-range', 'Review card', () => new ReviewCardModal(app, plugin, 'all', { range: 'week' }).open());
    this.item(reviews, 'id-card', 'Flex card', () => new FlexCardModal(app, plugin).open());
    const tools = this.section(body, 'Tools');
    this.item(tools, 'plus-circle', 'New trade', () => new NewTradeModal(app, plugin).open());
    this.item(tools, 'download', 'Import trades', () => new ImportCsvModal(app, plugin).open());
    this.item(tools, 'merge', 'Combine trades', () => new PyramidModal(app, plugin).open());
    this.item(tools, 'layout-grid', 'Pane layout', () => new LayoutModal(app, plugin).open());
    this.item(tools, 'settings', 'Settings', () => plugin.openSettings());
    const tu = this.section(body, 'Tu');
    for (const [type, name, icon] of TU_VIEW_TYPES) this.item(tu, icon, name, () => plugin.openView(type), { key: type });
    const more = this.section(body, 'More');
    screen(more, 'graduation-cap', 'Lessons', LESSONS_VIEW_TYPE);
    screen(more, 'git-fork', 'Logic tree', LOGIC_VIEW_TYPE);
    screen(more, 'trophy', 'Trophies', TROPHY_VIEW_TYPE);
    screen(more, 'dumbbell', 'Gym', GYM_VIEW_TYPE);
    screen(more, 'music', 'Music', MUSIC_VIEW_TYPE);
    this.markActive();
  }
  drawResults(body) {
    const { trades, days } = this.results;
    if (!trades.length && !days.length) { body.createDiv({ cls: 'tvj-panel-empty', text: 'Nothing matches.' }); return; }
    if (trades.length) {
      const list = this.section(body, 'Trades', trades.length);
      for (const x of trades) {
        const t = x.trade, net = netPnl(t);
        const el = list.createDiv({ cls: 'tvj-panel-item tvj-panel-hit', attr: { role: 'button', tabindex: '0' } });
        const top = el.createDiv({ cls: 'tvj-panel-hit-main' });
        top.createSpan({ text: `${t.symbol} ${t.direction}` });
        top.createSpan({ cls: net < 0 ? 'tvj-neg' : 'tvj-pos', text: money(Math.round(net * 100) / 100) });
        el.createDiv({ cls: 'tvj-panel-hit-sub', text: [`${t.date} ${t.time}`, t.account].filter(Boolean).join(' · ') });
        const open = () => this.plugin.openInSide(x.file);
        el.addEventListener('click', open);
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
      }
    }
    if (days.length) {
      const list = this.section(body, 'Day notes', days.length);
      for (const d of days) {
        const el = list.createDiv({ cls: 'tvj-panel-item tvj-panel-hit', attr: { role: 'button', tabindex: '0' } });
        el.createDiv({ cls: 'tvj-panel-hit-main', text: d.date });
        el.createDiv({ cls: 'tvj-panel-hit-sub', text: d.owner || tx('All accounts') });
        const open = () => new DayReviewModal(this.app, this.plugin, d.date, d.scope).open();
        el.addEventListener('click', open);
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
      }
    }
  }
  /** Highlights the screen open in the main area (the Accounts screen's two tabs count apart). */
  markActive() {
    const ws = this.app.workspace;
    const leaf = ws.getMostRecentLeaf ? ws.getMostRecentLeaf() : null;
    const view = leaf && leaf.view;
    const type = view && view.getViewType ? view.getViewType() : '';
    const key = type === ACCOUNTS_VIEW_TYPE && view.tab === 'tracker' ? `${type}:tracker` : type;
    for (const x of this.viewItems) x.el.toggleClass('is-active', x.key === key);
  }
}

