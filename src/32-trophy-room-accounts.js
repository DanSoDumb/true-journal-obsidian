// ---------- trophy room: what you have won, and the certificates to prove it ----------

const CUP_SVG = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M14 6h20v10c0 7-4.5 12-10 12S14 23 14 16Z" fill="currentColor"/>'
  + '<path d="M14 9H7v4c0 5 3 8.5 8 9M34 9h7v4c0 5-3 8.5-8 9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'
  + '<path d="M21 27h6v8h-6z" fill="currentColor"/><rect x="14" y="35" width="20" height="6" rx="2" fill="currentColor"/></svg>';
const CERT_EXT = /^(png|jpe?g|webp|gif|pdf)$/i;
const CERT_MAX_BYTES = 15 * 1024 * 1024;

/** Accounts: one card per account with its challenge — the steps, and the current step's target, max loss, daily
 *  limit, days, consistency and position size — and its status, with buttons to mark it breached or advance it. */
/** One account at a glance, opened from its card on the Accounts screen: the numbers, its balance over time, the
 *  rules, and for funded accounts the payout rules and a payout request that comes off the account's balance. */
class AccountOverviewModal extends ThemedModal {
  constructor(app, plugin, account) {
    super(app);
    this.plugin = plugin;
    this.account = account;
    this.amount = '';
    this.date = isoDay(new Date());
    this.anyway = false; // record a payout although the rules say not yet
  }
  onOpen() {
    this.modalEl.addClass('tvj-account-modal');
    this.render();
  }
  render() {
    this.keepScroll(() => this.draw());
  }
  draw() {
    const { contentEl } = this;
    contentEl.empty();
    const plugin = this.plugin, settings = plugin.settings, a = this.account;
    const info = (settings.accountInfo || {})[a] || {};
    const all = plugin.getTrades();
    const trades = all.map((x) => x.trade);
    const own = all.filter((x) => accountName(x.trade) === a).sort((x, y) => byTime(x.trade, y.trade));
    const st = accountStatus(a, trades, settings.accountInfo);
    const ch = challengeStatus(a, trades, settings.accountInfo);
    const funded = isFundedAccount(a, settings.accountInfo);
    const state = st.blown ? 'breached' : st.passed ? 'passed' : funded && ch && ch.payout && ch.payout.eligible ? 'payout' : !funded && ch && ch.ready ? 'ready' : 'active';
    const headSide = accountHeader(contentEl, a, ch, state, settings.accountInfo, plugin.canRenameAccount(a) ? () => plugin.askRenameAccount(a, (name) => { this.account = name; this.render(); }) : null);
    if (state === 'breached') contentEl.createEl('p', { cls: 'tvj-neg', text: st.auto && ch && ch.reason ? `Breached on ${st.blownOn} — ${ch.reason}.` : `Marked breached on ${st.blownOn}.` });
    // the challenge's stages (a passed evaluation and the step it led to): switch between them to see each one's
    // overview — its numbers, rules, payouts and group
    const chain = stageChain(a, settings.accountInfo);
    if (chain.length > 1) {
      const tabs = contentEl.createDiv({ cls: 'tvj-stage-tabs', attr: { role: 'tablist' } });
      for (const stage of chain) {
        const b = tabs.createEl('button', { cls: `tvj-stage-tab${stage === a ? ' is-active' : ''}`, attr: { role: 'tab', 'aria-selected': String(stage === a), title: stage } });
        b.createSpan({ cls: 'tvj-stage-step', text: stageLabel(stage, settings.accountInfo) });
        b.createSpan({ cls: 'tvj-stage-name', text: stage });
        b.addEventListener('click', () => { if (stage !== this.account) { this.account = stage; this.render(); } });
      }
    }
    // its group: a passed evaluation's next step, or any account, can be moved (to Funded, say)
    const grouped = contentEl.createDiv({ cls: 'tvj-account-group' });
    grouped.createSpan({ cls: 'tvj-muted', text: tx('Group') });
    plugin.groupSelect(grouped, groupOf(settings.groups, a), async (g) => { await plugin.moveAccountToGroup(a, g); this.render(); });

    // the numbers
    const s = computeStats(own.map((x) => x.trade));
    const bal = ch || accountBalance(a, trades, settings.accountInfo, settings.payouts);
    const mine = (settings.payouts || []).filter((x) => x.account === a);
    const tiles = contentEl.createDiv({ cls: 'tvj-tiles' });
    const tile = (label, value, cls, sub) => {
      const t = tiles.createDiv({ cls: 'tvj-tile' });
      t.createDiv({ cls: 'tvj-tile-label', text: label });
      t.createDiv({ cls: `tvj-tile-value ${cls || ''}`, text: value });
      if (sub) t.createDiv({ cls: 'tvj-tile-sub', text: sub });
    };
    if (bal) tile('Balance', money(Math.round(bal.balance)), '', `started at ${money(Math.round(bal.start))}`);
    tile('Net P&L', money(Math.round(s.net)), s.net < 0 ? 'tvj-neg' : 'tvj-pos', `${s.trades} trades · ${s.winRate.toFixed(0)}% win`);
    tile('Payouts', money(Math.round(sum(mine.map(payoutReceived)))), mine.length ? 'tvj-pos' : '', `${mine.length} taken${mine.length ? ` · ${money(Math.round(sum(mine.map((x) => Number(x.amount) || 0))))} off the account` : ''}`);
    if (ch && ch.maxLoss) tile('Room to max loss', money(Math.round(Math.max(0, ch.room))), ch.room < ch.maxLoss * 0.25 ? 'tvj-neg' : '', `line ${money(Math.round(ch.line))}`);
    const costs = (settings.costs || []).filter((x) => x.account === a).sort((p, q) => String(q.date).localeCompare(String(p.date)));
    tile('Spent', cents(sum(costs.map((x) => Number(x.amount) || 0))), '', costs.length ? costs.map((x) => tx(COST_KINDS[x.kind] || COST_KINDS.other)).join(' · ') : 'no costs added');

    if (own.length) this.curve(contentEl, own, ch, mine, bal ? bal.start : 0);

    const grid = contentEl.createDiv({ cls: 'tvj-overview-grid' });
    const rules = grid.createDiv({ cls: 'tvj-card' });
    rules.createDiv({ cls: 'tvj-card-title', text: 'Rules' });
    if (ch) ruleLines(rules, ch);
    // what the next step asks for, while still in the evaluation
    const nextStep = ch && ch.rules && ch.rules.stage === 'evaluation' ? nextStepOf(ch.rules, plugin.challengeCatalog || PROP_FIRMS) : null;
    if (nextStep) rules.createEl('p', { cls: 'tvj-muted tvj-next-step', text: `${LANG === 'vi' ? 'Khi tới' : 'Once'} ${nextStep.name}: ${rulesSummary(nextStep.rules)}` });
    if (!ch) rules.createEl('p', { cls: 'tvj-muted', text: 'No challenge rules yet.' });
    if (funded && state !== 'passed') this.payoutBox(grid.createDiv({ cls: 'tvj-card' }), a, ch, state);

    // payouts taken and recent trades
    if (mine.length) {
      const box = contentEl.createDiv({ cls: 'tvj-card' });
      box.createDiv({ cls: 'tvj-card-title', text: 'Payout history' });
      for (const x of [...mine].sort((p, q) => String(q.date).localeCompare(String(p.date)))) {
        const row = box.createDiv({ cls: 'tvj-row' });
        row.createSpan({ text: `${x.date} · ${money(Number(x.amount) || 0)} off the account` });
        const right = row.createSpan();
        right.createSpan({ cls: 'tvj-pos', text: `${money(payoutReceived(x))}${Number.isFinite(x.split) ? ` (${x.split}%)` : ''}` });
        right.createEl('button', { text: '×', attr: { 'aria-label': 'Delete this payout' } }).addEventListener('click', async () => {
          settings.payouts = settings.payouts.filter((y) => y.id !== x.id);
          await plugin.saveData(settings);
          plugin.refreshViews();
          this.render();
        });
      }
    }
    // what the account cost: the evaluation, activation fees, resets
    const spent = contentEl.createDiv({ cls: 'tvj-card' });
    const spentHead = spent.createDiv({ cls: 'tvj-card-head' });
    spentHead.createDiv({ cls: 'tvj-card-title', text: 'Costs' });
    const preset = { account: a, kind: costs.length ? 'reset' : funded ? 'activation' : 'eval' };
    spentHead.createEl('button', { text: '+ Cost' }).addEventListener('click', () => new CostModal(this.app, plugin, preset, () => this.render()).open());
    if (!costs.length) spent.createEl('p', { cls: 'tvj-muted', text: 'What this account cost you: the evaluation, an activation fee, resets. Costs count in the challenge tracker on the Accounts screen.' });
    for (const x of costs) costRow(spent, x, () => new CostModal(this.app, plugin, x, () => this.render()).open());
    const recent = contentEl.createDiv({ cls: 'tvj-card' });
    recent.createDiv({ cls: 'tvj-card-title', text: 'Recent trades' });
    if (!own.length) recent.createEl('p', { cls: 'tvj-muted', text: 'No trades on this account yet.' });
    for (const x of own.slice(-10).reverse()) {
      const t = x.trade;
      const row = recent.createDiv({ cls: 'tvj-row tvj-pick' });
      const left = row.createSpan();
      left.createSpan({ text: `${t.date} ${t.time} · ${t.symbol} ` });
      left.createSpan({ cls: `tvj-side ${t.direction === 'long' ? 'is-long' : 'is-short'}`, text: t.direction });
      row.createSpan({ cls: netPnl(t) < 0 ? 'tvj-neg' : 'tvj-pos', text: money(Math.round(netPnl(t) * 100) / 100) });
      row.addEventListener('click', () => { this.close(); plugin.openInSide(x.file); });
    }
    accountButtons(contentEl.createDiv({ cls: 'tvj-options tvj-account-buttons' }), this.app, plugin, a, ch, state, funded, info, () => this.render(), null, headSide, headSide);
  }

  /** Balance after every trade and payout, with the max-loss line and the target. */
  curve(root, own, ch, payouts, start) {
    const events = [...own.map((x) => ({ key: `${x.trade.date} ${x.trade.time}`, delta: netPnl(x.trade) })),
      ...payouts.filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(String(x.date))).map((x) => ({ key: `${x.date} 99`, delta: -(Number(x.amount) || 0), payout: true }))]
      .sort((p, q) => p.key.localeCompare(q.key));
    let b = start;
    const points = [{ v: start }, ...events.map((e) => ({ v: (b += e.delta), payout: e.payout }))];
    const lines = [];
    if (ch && ch.maxLoss) lines.push({ v: ch.line, cls: 'tvj-ov-limit' });
    if (ch && ch.target) lines.push({ v: ch.start + ch.target, cls: 'tvj-ov-target' });
    const vals = [...points.map((x) => x.v), ...lines.map((x) => x.v)];
    const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
    const W = 640, H = 170, pad = 8;
    const x = (i) => pad + (i / (points.length - 1 || 1)) * (W - pad * 2);
    const y = (v) => pad + ((max - v) / span) * (H - pad * 2);
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('class', 'tvj-ov-chart');
    const add = (tag, attrs) => { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v)); svg.appendChild(el); };
    for (const l of lines) add('line', { x1: pad, x2: W - pad, y1: y(l.v), y2: y(l.v), class: l.cls, 'vector-effect': 'non-scaling-stroke' });
    add('polyline', { points: points.map((pt, i) => `${x(i).toFixed(1)},${y(pt.v).toFixed(1)}`).join(' '), class: 'tvj-ov-line', 'vector-effect': 'non-scaling-stroke' });
    points.forEach((pt, i) => { if (pt.payout) add('circle', { cx: x(i), cy: y(pt.v), r: 4, class: 'tvj-ov-payout' }); });
    const box = root.createDiv({ cls: 'tvj-card tvj-ov-card' });
    const head = box.createDiv({ cls: 'tvj-card-head' });
    head.createDiv({ cls: 'tvj-card-title', text: 'Balance' });
    const key = head.createDiv({ cls: 'tvj-ov-key tvj-muted' });
    if (ch && ch.maxLoss) key.createSpan({ cls: 'is-limit', text: 'max loss' });
    if (ch && ch.target) key.createSpan({ cls: 'is-target', text: 'target' });
    if (payouts.length) key.createSpan({ cls: 'is-payout', text: 'payout' });
    box.appendChild(svg);
  }

  /** The payout rules checked one by one, and the request form. */
  payoutBox(box, a, ch, state) {
    box.createDiv({ cls: 'tvj-card-title', text: 'Payout' });
    const pc = ch && ch.payout;
    if (!pc) {
      box.createEl('p', { cls: 'tvj-muted', text: 'This account has no payout rules. Pick its prop firm and step under Rules, or record a payout the firm already paid.' });
      this.anyway = true;
    } else {
      const list = box.createDiv({ cls: 'tvj-checks' });
      for (const c of pc.checks) {
        const row = list.createDiv({ cls: `tvj-check ${c.ok ? 'is-ok' : 'is-no'}` });
        row.createSpan({ cls: 'tvj-check-mark', text: c.ok ? '✓' : '✗' });
        const name = row.createSpan({ text: c.label });
        row.createSpan({ cls: 'tvj-check-value', text: c.value });
        if (c.calc) consistencyCalc({ box: row, name }, c.calc); // the payout's consistency: the same calculator, on this cycle
      }
      box.createEl('p', { cls: pc.eligible ? 'tvj-pos' : 'tvj-muted', text: pc.eligible
        ? `Payout ${pc.nth} is open: up to ${money(pc.max)}${pc.min ? ` (at least ${money(pc.min)})` : ''}. You keep ${pc.split}%.`
        : `Payout ${pc.nth} is not open yet: every line above needs a ✓. You keep ${pc.split}%.` });
      const afterLine = payoutRuleLines(pc.policy).find((l) => l.startsWith('After a payout'));
      if (afterLine) box.createEl('p', { cls: 'tvj-muted', text: afterLine });
    }
    if (state === 'breached') return;
    const open = (pc && pc.eligible) || this.anyway;
    const split = pc ? pc.split : 100;
    if (!this.amount && pc && pc.eligible) this.amount = String(pc.max);
    const form = box.createDiv({ cls: 'tvj-payout-form' });
    const amount = form.createEl('input', { cls: 'tvj-payout-amount', attr: { type: 'number', min: '0', step: '0.01', placeholder: 'Amount ($)', value: this.amount, 'aria-label': 'Amount ($)' } });
    const date = form.createEl('input', { cls: 'tvj-date', attr: { type: 'date', value: this.date, 'aria-label': 'Date' } });
    const go = form.createEl('button', { cls: 'mod-cta', text: 'Request payout' });
    const keep = box.createDiv({ cls: 'tvj-muted tvj-payout-keep' });
    const preview = () => {
      const n = Number(amount.value);
      keep.setText(Number.isFinite(n) && n > 0 ? `${money(n)} comes off the account; you receive ${money(Math.round(n * split) / 100)}.` : '');
      go.disabled = !open || !(Number.isFinite(n) && n > 0);
    };
    amount.addEventListener('input', () => { this.amount = amount.value; preview(); });
    date.addEventListener('change', () => { this.date = date.value; });
    preview();
    go.addEventListener('click', async () => {
      const n = Math.round(Number(amount.value) * 100) / 100;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date.value)) { notify('Pick the date of the payout.'); return; }
      if (pc && pc.eligible && !this.anyway && (n > pc.max + 1e-9 || n < pc.min - 1e-9)) { notify(`The rules allow ${pc.min ? `${money(pc.min)} to ` : 'up to '}${money(pc.max)} now.`); return; }
      const received = await this.plugin.recordPayout(a, n, date.value, split);
      notify(`Payout recorded: ${money(n)} off ${a}, ${money(received)} to you.`);
      this.amount = '';
      this.anyway = false;
      this.render();
    });
    if (pc && !pc.eligible && !this.anyway) box.createEl('button', { cls: 'tvj-link', text: 'The firm paid it already? Record it anyway' }).addEventListener('click', () => { this.anyway = true; this.render(); });
  }
  onClose() {
    this.contentEl.empty();
  }
}

class AccountsView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.showClosed = false;
    this.tab = 'accounts';
    this.trackerPeriod = 'all';
  }
  getViewType() { return ACCOUNTS_VIEW_TYPE; }
  getDisplayText() { return tx('TrueVision Journal — accounts'); }
  getIcon() { return 'shield-check'; }
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
    const head = root.createDiv({ cls: 'tvj-head' });
    this.plugin.renderNav(head, ACCOUNTS_VIEW_TYPE);
    const tabs = root.createDiv({ cls: 'tvj-tabs' });
    for (const [id, label] of [['accounts', 'Accounts'], ['tracker', 'Challenge tracker']]) {
      tabs.createEl('button', { text: label, cls: `tvj-tab ${this.tab === id ? 'is-active' : ''}` }).addEventListener('click', () => { this.tab = id; this.render(); this.plugin.markSidebar(); });
    }
    if (this.tab === 'tracker') {
      this.renderTracker(root);
      return;
    }
    const settings = this.plugin.settings;
    const info = settings.accountInfo || {};
    const trades = this.plugin.getTrades().map((x) => x.trade);
    const accounts = [...new Set([...this.plugin.allAccounts(trades), ...(settings.accounts || [])])].filter((a) => a && a !== NO_ACCOUNT);
    const rows = accounts.map((a) => {
      const st = accountStatus(a, trades, info);
      const ch = challengeStatus(a, trades, info);
      const funded = isFundedAccount(a, info);
      const state = st.blown ? 'breached' : st.passed ? 'passed' : funded && ch && ch.payout && ch.payout.eligible ? 'payout' : !funded && ch && ch.ready ? 'ready' : 'active';
      return { a, st, ch, state, funded };
    });
    const order = { payout: 0, ready: 0, active: 1, passed: 2, breached: 3 };
    rows.sort((x, y) => order[x.state] - order[y.state] || x.a.localeCompare(y.a));

    const actions = root.createDiv({ cls: 'tvj-options tvj-accounts-actions' });
    newTradeButton(actions, this.app, this.plugin);
    actions.createEl('button', { text: '+ Account' }).addEventListener('click', () => new AddAccountModal(this.app, this.plugin, () => this.render()).open());
    actions.createEl('button', { text: 'Balances and status' }).addEventListener('click', () => new BalancesModal(this.app, this.plugin).open());
    const closed = rows.filter((r) => r.state === 'passed' || r.state === 'breached').length;
    if (closed) actions.createEl('button', { text: this.showClosed ? 'Hide passed and breached' : `Show passed and breached (${closed})` }).addEventListener('click', () => { this.showClosed = !this.showClosed; this.render(); });

    const count = (s) => rows.filter((r) => r.state === s).length;
    const tiles = root.createDiv({ cls: 'tvj-tiles' });
    for (const [label, value, cls] of [['Active', count('active') + count('ready'), ''], ['Payout ready', count('payout'), 'tvj-pos'], ['Passed', count('passed'), ''], ['Breached', count('breached'), 'tvj-neg']]) {
      const t = tiles.createDiv({ cls: 'tvj-tile' });
      t.createDiv({ cls: 'tvj-tile-label', text: label });
      t.createDiv({ cls: `tvj-tile-value ${cls}`, text: String(value) });
    }
    const shown = rows.filter((r) => this.showClosed || r.state === 'active' || r.state === 'ready' || r.state === 'payout');
    if (!shown.length) {
      root.createDiv({ cls: 'tvj-card tvj-empty' }).createEl('p', { text: accounts.length ? 'No active accounts. Show passed and breached ones above, or add an account.' : 'No accounts yet — add one, then set its challenge rules.' });
      return;
    }
    // one grid, the cards in the order of their account groups (Funded, Eval…, then the rest); each card names its group
    const groupsText = this.plugin.settings.groups;
    const groupOrder = parseGroups(groupsText).map((g) => g.name);
    const rank = (r) => { const i = groupOrder.indexOf(groupOf(groupsText, r.a)); return i < 0 ? groupOrder.length : i; };
    const grid = root.createDiv({ cls: 'tvj-accounts-grid' });
    for (const row of [...shown].sort((p, q) => rank(p) - rank(q))) this.card(grid, row);
  }

  card(parent, { a, st, ch, state, funded }) {
    const settings = this.plugin.settings;
    const info = settings.accountInfo[a] || {};
    // the profit target is met (and Advance shows): the card gets a green outline too
    const met = !funded && (!!(ch && ch.target && ch.targetHit) || state === 'ready') && state !== 'breached' && state !== 'passed';
    const el = parent.createDiv({ cls: `tvj-card tvj-account-card tvj-pick is-${state}${met ? ' is-target-met' : ''}`, attr: { title: tx('Open the account overview') } });
    el.addEventListener('click', (e) => { if (!e.target.closest('button, input, select, .tvj-card-costs')) new AccountOverviewModal(this.app, this.plugin, a).open(); });
    const headSide = accountHeader(el, a, ch, state, settings.accountInfo, this.plugin.canRenameAccount(a) ? () => this.plugin.askRenameAccount(a, () => this.render()) : null, { group: groupOf(settings.groups, a) });
    const line = ruleLine(el);
    if (state === 'breached') el.createEl('p', { cls: 'tvj-neg', text: st.auto && ch && ch.reason ? `Breached on ${st.blownOn} — ${ch.reason}.` : `Marked breached on ${st.blownOn}.` });
    if (state === 'passed') el.createEl('p', { cls: 'tvj-muted', text: `Passed on ${info.passed}${info.advancedTo ? ` → ${info.advancedTo}` : ''}.` });
    if (info.from) el.createEl('p', { cls: 'tvj-muted', text: `Advanced from ${info.from}.` });

    // the balance big, with its cents dimmed, and the net P&L beside it
    const bal = ch ? { balance: ch.balance, net: ch.net } : accountBalance(a, this.plugin.getTrades().map((x) => x.trade), settings.accountInfo, settings.payouts);
    if (bal) balanceHero(el, bal.balance, bal.net);
    if (!ch) {
      el.createEl('p', { cls: 'tvj-muted', text: 'No challenge rules yet.' });
    } else {
      ruleLines(el, ch, { noBalance: true });
      if (funded && ch.payout && state !== 'breached' && state !== 'passed') {
        const next = ch.payout.checks.find((x) => !x.ok);
        const plan = payoutPlan(ch.payout);
        line('Payout', plan && plan.text ? plan.text : `${next.label}: ${next.value}`, ch.payout.eligible ? 'tvj-pos' : '');
      }
      if (state === 'ready') el.createEl('p', { cls: 'tvj-pos', text: 'Every rule is met — ready for the next stage.' });
    }
    el.createDiv({ cls: 'tvj-card-spacer' }); // takes the room a shorter card has left, so its costs line up at the bottom
    // a demo account cost nothing to track: no Spent line and no cost row on its card
    if (accountKind(a, settings.accountInfo) !== 'demo') this.costs(el, a, funded);
    this.buttons(el, a, ch, state, funded, info, headSide);
  }

  /** What the account cost, right on its card: the total, each cost as a chip (click to edit, × to remove) and a
   *  type + amount row that adds a cost dated today without opening a dialog. */
  costs(el, a, funded) {
    const plugin = this.plugin;
    const mine = (plugin.settings.costs || []).filter((x) => x.account === a).sort((p, q) => String(p.date).localeCompare(String(q.date)));
    const box = el.createDiv({ cls: 'tvj-card-costs' });
    ruleLine(box)('Spent', mine.length ? cents(sum(mine.map((x) => Number(x.amount) || 0))) : '—');
    if (mine.length) {
      const chips = box.createDiv({ cls: 'tvj-cost-chips' });
      for (const x of mine) {
        const chip = chips.createSpan({ cls: 'tvj-cost-chip', attr: { title: [x.date, x.note].filter(Boolean).join(' · ') } });
        chip.createSpan({ text: `${tx(COST_KINDS[x.kind] || COST_KINDS.other)} ${cents(Number(x.amount) || 0)}` });
        chip.addEventListener('click', () => new CostModal(this.app, plugin, x, () => this.render()).open());
        chip.createEl('button', { text: '×', attr: { 'aria-label': 'Remove this cost' } }).addEventListener('click', (e) => {
          e.stopPropagation();
          plugin.deleteCost(x.id);
        });
      }
    }
    const form = box.createDiv({ cls: 'tvj-cost-inline' });
    const kind = form.createEl('select', { cls: 'dropdown', attr: { 'aria-label': 'Type' } });
    for (const [k, label] of Object.entries(COST_KINDS)) kind.createEl('option', { text: label, value: k });
    kind.value = mine.length ? 'reset' : funded ? 'activation' : 'eval';
    const amount = form.createEl('input', { attr: { type: 'number', min: '0', step: '0.01', placeholder: 'Amount ($)', 'aria-label': 'Amount ($)' } });
    const add = async () => {
      const n = Math.round(Number(amount.value) * 100) / 100;
      if (!amount.value || !Number.isFinite(n) || n <= 0) {
        notify('Type the amount you paid.');
        amount.focus();
        return;
      }
      await plugin.saveCost({ date: isoDay(new Date()), account: a, firm: '', kind: kind.value, amount: n, note: '' });
      notify(`Cost added: ${cents(n)}`);
    };
    form.createEl('button', { text: 'Add cost' }).addEventListener('click', add);
    amount.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  }

  buttons(el, a, ch, state, funded, info, headSide) {
    const row = el.createDiv({ cls: 'tvj-options tvj-account-buttons' });
    accountButtons(row, this.app, this.plugin, a, ch, state, funded, info, () => this.render(), () => new AccountOverviewModal(this.app, this.plugin, a).open(), null, headSide);
    if (!row.children.length) row.remove(); // nothing left at the bottom (Advance sits in the header): no empty row
  }

  /** Challenge tracker: what the evaluations, activation fees and resets cost against the payouts received, the ROI,
   *  per firm, and every cost and payout of the chosen period. */
  renderTracker(root) {
    const plugin = this.plugin, settings = plugin.settings;
    // what Demo accounts cost and paid is left out: they are practice, not money spent
    const demo = demoAccountsOf(settings.accountInfo);
    const costs = (settings.costs || []).filter((x) => !demo.has(x.account)), payouts = (settings.payouts || []).filter((x) => !demo.has(x.account));
    const actions = root.createDiv({ cls: 'tvj-options tvj-accounts-actions' });
    actions.createEl('button', { text: '+ Cost', cls: 'mod-cta' }).addEventListener('click', () => new CostModal(this.app, plugin, null, () => this.render()).open());
    plugin.periodSelect(actions, [...costs, ...payouts], this.trackerPeriod, (v) => { this.trackerPeriod = v; this.render(); });
    const shownCosts = filterPeriod(costs, this.trackerPeriod), shownPayouts = filterPeriod(payouts, this.trackerPeriod);
    if (!shownCosts.length && !shownPayouts.length) {
      root.createDiv({ cls: 'tvj-card tvj-empty' }).createEl('p', { text: costs.length || payouts.length
        ? 'No costs or payouts in this period.'
        : 'No costs yet. Add what each evaluation cost, plus activation fees and resets, and this shows what you spent, what the payouts brought back and your ROI.' });
      return;
    }
    const t = challengeTracker(shownCosts, shownPayouts, settings.accountInfo);
    const tiles = root.createDiv({ cls: 'tvj-tiles' });
    const tile = (label, value, cls, sub) => {
      const el = tiles.createDiv({ cls: 'tvj-tile' });
      el.createDiv({ cls: 'tvj-tile-label', text: label });
      el.createDiv({ cls: `tvj-tile-value ${cls || ''}`, text: value });
      if (sub) el.createDiv({ cls: 'tvj-tile-sub', text: sub });
    };
    const extras = [['activation', t.activations], ['reset', t.resets], ['other', t.others]].filter(([, n]) => n).map(([k, n]) => `${tx(COST_KINDS[k])} ×${n}`).join(' · ');
    const tone = (n) => (n > 0 ? 'tvj-pos' : n < 0 ? 'tvj-neg' : '');
    tile('Spent on evaluations', cents(t.evals), '', `${t.bought} bought`);
    tile('Activation fees & resets', cents(t.extra), '', extras || 'none');
    tile('Payouts received', cents(t.received), t.received > 0 ? 'tvj-pos' : '', `${t.payoutCount} payout${t.payoutCount === 1 ? '' : 's'}`);
    tile('Net', signedMoney(t.net), tone(t.net), `spent ${cents(t.spent)}`);
    tile('ROI', roiText(t.roi), tone(t.net), 'net ÷ spent');
    root.createEl('p', { cls: 'tvj-muted tvj-tracker-note', text: 'ROI = (payouts received − money spent) ÷ money spent. Payouts count what you received after the split.' });

    if (t.firms.length) {
      const box = root.createDiv({ cls: 'tvj-card tvj-scroll' });
      box.createDiv({ cls: 'tvj-card-title', text: 'By firm' });
      const table = box.createEl('table', { cls: 'tvj-table' });
      const hr = table.createEl('thead').createEl('tr');
      // money lines up on the right, so amounts compare at a glance; each firm with its logo when the list has one
      for (const [h, cls] of [['Firm', ''], ['Evaluations', 'tvj-col-opt tvj-num'], ['Activation & resets', 'tvj-col-opt tvj-num'], ['Spent', 'tvj-num'], ['Payouts', 'tvj-num'], ['Net', 'tvj-num'], ['ROI', 'tvj-num']]) hr.createEl('th', { text: h, cls });
      const body = table.createEl('tbody');
      for (const r of t.firms) {
        const tr = body.createEl('tr');
        const firmCell = tr.createEl('td', { cls: 'tvj-firm-cell' });
        if (FIRM_LOGOS[r.firm]) firmCell.createEl('img', { cls: 'tvj-acct-logo', attr: { src: FIRM_LOGOS[r.firm], alt: '' } });
        else firmCell.createSpan({ cls: 'tvj-acct-logo is-blank' }); // keeps the names lined up
        firmCell.appendText(r.firm || tx('No firm'));
        tr.createEl('td', { text: `${cents(r.evals)} (${r.bought})`, cls: 'tvj-col-opt tvj-num' });
        tr.createEl('td', { text: cents(r.extra), cls: 'tvj-col-opt tvj-num' });
        tr.createEl('td', { text: cents(r.spent), cls: 'tvj-num' });
        tr.createEl('td', { text: cents(r.received), cls: `tvj-num ${r.received > 0 ? 'tvj-pos' : ''}` });
        tr.createEl('td', { text: signedMoney(r.net), cls: `tvj-num ${tone(r.net)}` });
        tr.createEl('td', { text: roiText(r.roi), cls: `tvj-num ${tone(r.net)}` });
      }
    }

    const ledger = root.createDiv({ cls: 'tvj-card' });
    ledger.createDiv({ cls: 'tvj-card-title', text: 'Costs and payouts' });
    const entries = [...shownCosts.map((x) => ({ x, cost: true })), ...shownPayouts.map((x) => ({ x, cost: false }))]
      .sort((p, q) => String(q.x.date).localeCompare(String(p.x.date)) || (p.cost === q.cost ? 0 : p.cost ? 1 : -1));
    for (const { x, cost } of entries) {
      if (cost) costRow(ledger, x, () => new CostModal(this.app, plugin, x, () => this.render()).open(), true);
      else {
        const row = ledger.createDiv({ cls: 'tvj-row tvj-pick' });
        const left = row.createSpan();
        left.createSpan({ text: `${x.date} · ${tx('Payout')}${x.account ? ` · ${x.account}` : ''}` });
        row.createSpan({ cls: 'tvj-pos', text: `+${cents(payoutReceived(x))}` });
        if (x.account) row.addEventListener('click', () => new AccountOverviewModal(this.app, plugin, x.account).open());
      }
    }
  }
}

/** One cost as a row: date, type (and account), note; a click opens it for editing. */
function costRow(parent, x, onOpen, withAccount) {
  const row = parent.createDiv({ cls: 'tvj-row tvj-pick tvj-cost-row', attr: { title: tx('Edit this cost') } });
  const left = row.createSpan();
  left.createSpan({ text: [x.date, tx(COST_KINDS[x.kind] || COST_KINDS.other), withAccount ? x.account : '', withAccount && x.firm ? x.firm : ''].filter(Boolean).join(' · ') });
  if (x.note) left.createSpan({ cls: 'tvj-muted tvj-cost-note', text: x.note });
  row.createSpan({ cls: 'tvj-neg', text: cents(-(Number(x.amount) || 0)) });
  row.addEventListener('click', onOpen);
}

/** Funded accounts take payouts and have no next stage to advance to: set as Funded, or on a funded step of a challenge. */
function isFundedAccount(name, accountInfo) {
  const info = (accountInfo && accountInfo[name]) || {};
  return accountKind(name, accountInfo) === 'funded' || !!(info.rules && info.rules.stage && info.rules.stage !== 'evaluation');
}
const ACCOUNT_STATES = { active: 'Active', ready: 'Ready to advance', payout: 'Payout ready', passed: 'Passed', breached: 'Breached' };
/** Name, status, firm and the challenge's steps (used by the account cards and the overview). */
/** The stages of one challenge an account belongs to, first to last: the steps linked by Advance to next stage
 *  (each new step keeps `from`, the passed one `advancedTo`). Just [account] when it was never advanced. */
function stageChain(account, accountInfo = {}) {
  const chain = [account];
  for (let a = account, seen = new Set([account]); accountInfo[a] && accountInfo[a].from && !seen.has(accountInfo[a].from);) { a = accountInfo[a].from; seen.add(a); chain.unshift(a); }
  for (let a = account, seen = new Set(chain); accountInfo[a] && accountInfo[a].advancedTo && !seen.has(accountInfo[a].advancedTo);) { a = accountInfo[a].advancedTo; seen.add(a); chain.push(a); }
  return chain;
}
/** What a stage is called in the switcher: its step's name (Trading Combine, Express Funded…), else eval / funded. */
const stageLabel = (name, accountInfo = {}) => {
  const info = accountInfo[name] || {};
  return (info.rules && info.rules.stepName) || (info.kind === 'funded' ? tx('Funded') : tx('Evaluation'));
};

/** The balance as the card's headline: "$1,511" big with ".22" dimmed, and the net P&L on the right. */
function balanceHero(el, balance, net) {
  const row = el.createDiv({ cls: 'tvj-acct-hero' });
  const left = row.createDiv();
  left.createDiv({ cls: 'tvj-tile-label', text: 'Balance' });
  const big = left.createDiv({ cls: 'tvj-acct-balance' });
  const full = money(Math.round(balance * 100) / 100);
  const dot = full.lastIndexOf('.');
  big.appendText(dot < 0 ? full : full.slice(0, dot));
  big.createSpan({ cls: 'tvj-acct-cents', text: dot < 0 ? '.00' : full.slice(dot) });
  const right = row.createDiv({ cls: 'tvj-acct-net' });
  right.createDiv({ cls: 'tvj-tile-label', text: 'Net P&L' });
  right.createDiv({ cls: `tvj-acct-net-value ${net < 0 ? 'tvj-neg' : 'tvj-pos'}`, text: `${net > 0 ? '+' : ''}${money(Math.round(net * 100) / 100)}` });
}

function accountHeader(el, a, ch, state, accountInfo, onRename, opts = {}) {
  const head = el.createDiv({ cls: 'tvj-card-head' });
  const title = head.createDiv({ cls: 'tvj-account-title' });
  const firmLogo = ch && ch.rules && FIRM_LOGOS[ch.rules.firm];
  if (firmLogo) title.createEl('img', { cls: 'tvj-acct-logo', attr: { src: firmLogo, alt: '' } });
  title.createDiv({ cls: 'tvj-hero-title', text: a });
  if (onRename) {
    const pencil = title.createEl('button', { cls: 'tvj-rename', attr: { 'aria-label': 'Rename this account' } });
    setIcon(pencil, 'pencil');
    pencil.addEventListener('click', (e) => { e.stopPropagation(); onRename(); });
  }
  // the right side: the status, with room before it for a button (the overview puts Mark breached there)
  const side = head.createDiv({ cls: 'tvj-account-head-side' });
  if (opts.group) side.createSpan({ cls: 'tvj-group-chip', text: opts.group });
  side.createSpan({ cls: `tvj-status is-${state}`, text: ACCOUNT_STATES[state] });
  const r = ch ? ch.rules : null;
  el.createDiv({ cls: 'tvj-eyebrow', text: r ? [r.firm, r.challenge || (r.size ? sizeLabel(r.size) : '')].filter(Boolean).join(' · ') : ({ funded: 'Funded', demo: 'Demo' })[accountKind(a, accountInfo)] || 'Eval' });
  if (r && r.steps && r.steps.length) {
    const path = el.createDiv({ cls: 'tvj-steps' });
    r.steps.forEach((s, i) => {
      if (i) path.createSpan({ cls: 'tvj-muted', text: ' → ' });
      path.createSpan({ cls: i === r.step ? 'tvj-step is-current' : i < r.step ? 'tvj-step is-done' : 'tvj-step', text: s });
    });
  } else if (r && r.stepName) el.createDiv({ cls: 'tvj-steps' }).createSpan({ cls: 'tvj-step is-current', text: r.stepName });
  return side;
}
/** A function that adds one rule line (label, value, optional meter) to `el`. */
function ruleLine(el) {
  return (label, value, cls, bar, barCls) => {
    const box = el.createDiv({ cls: 'tvj-rule' });
    const top = box.createDiv({ cls: 'tvj-rule-line' });
    const name = top.createSpan({ cls: 'tvj-muted', text: label });
    top.createSpan({ cls: cls || '', text: value });
    if (bar !== undefined && bar !== null) box.createDiv({ cls: `tvj-meter ${barCls || ''}` }).createDiv({ cls: 'tvj-meter-fill' }).style.width = `${Math.round(clamp01(bar) * 100)}%`;
    return { box, name };
  };
}

/** The consistency calculator: what it takes for the best day to be at most `limit`% of the profit. `best` is the
 *  best day's P&L, `net` the profit so far, `target` the profit target (0 for none). Days after today count the same
 *  way the rule does: a day above the best day becomes the new best day. Returns null without a limit, else
 *  { limit, best, net, target, share, met, needTotal, needMore, nextMax, oneDay, days, cushion, passTotal, passMore,
 *  passCap, passDays } (null where a figure does not apply):
 *  needTotal / needMore — the profit at which the best day is `limit`% of it, and how much more that is;
 *  nextMax — the most one more day can make and leave the rule met (up to the best day, or more while that day stays
 *  `limit`% of the new total); oneDay — one day can meet it (anything from needMore to nextMax); days — else the
 *  fewest days of up to the best day; cushion — while met, the loss that would break it again; passTotal / passMore /
 *  passCap / passDays — the target and the rule together: the total, how much more, the most any day may make, and
 *  the fewest days. */
function consistencyPlan({ best, net, limit, target = 0 }) {
  const L = Number(limit) || 0;
  if (!(L > 0)) return null;
  const B = Math.max(0, Number(best) || 0), N = Number(net) || 0, T = positive(target) || 0;
  const share = N > 0 && B > 0 ? (B / N) * 100 : null;
  const met = share !== null && share <= L + 1e-9;
  const needTotal = B > 0 ? (B * 100) / L : null;
  const needMore = needTotal === null ? null : Math.max(0, needTotal - N);
  const nextMax = L >= 100 ? Infinity : Math.max(B, (L * Math.max(0, N)) / (100 - L));
  const oneDay = !!needMore && needMore <= nextMax + 1e-9;
  const days = needMore && B > 0 ? Math.ceil(needMore / B - 1e-9) : 0;
  const cushion = met ? N - needTotal : null;
  const passTotal = T ? Math.max(T, needTotal || 0) : null;
  const passMore = passTotal === null ? null : Math.max(0, passTotal - N);
  const passCap = passTotal === null ? null : (L * passTotal) / 100;
  const passDays = passMore && passCap ? Math.ceil(passMore / passCap - 1e-9) : 0;
  return { limit: L, best: B, net: N, target: T, share, met, needTotal, needMore, nextMax, oneDay, days, cushion, passTotal, passMore, passCap, passDays };
}

/** The calculator in words, in the current language: [{ text, cls }], the first line its title. What you need is
 *  rounded up to the dollar and what you may make rounded down, so following it never falls a cent short. */
function consistencyAdvice(plan) {
  if (!plan) return [];
  const vi = LANG === 'vi';
  const up = (x) => money(Math.ceil(x - 1e-6)), down = (x) => money(Math.floor(x + 1e-6));
  const say = (en, v) => (vi ? v : en);
  const { limit: L, best: B, net: N, target: T } = plan;
  const out = [{ text: say('Consistency calculator', 'Tính consistency'), cls: 'tvj-hovercard-title' }];
  out.push({ text: say(`Best day ${money(Math.round(B))} · profit ${money(Math.round(N))} · max ${L}%`, `Ngày tốt nhất ${money(Math.round(B))} · lợi nhuận ${money(Math.round(N))} · tối đa ${L}%`), cls: 'tvj-muted' });
  if (!B) {
    out.push({ text: say('No winning day yet.', 'Chưa có ngày lãi.'), cls: '' });
    out.push({ text: T ? say(`On the way to the ${money(T)} target, keep each day at or under ${down(plan.passCap)} (${L}% of it).`, `Trên đường tới mục tiêu ${money(T)}, giữ mỗi ngày không quá ${down(plan.passCap)} (${L}% của nó).`)
      : say(`Keep your best day at or under ${L}% of your total profit.`, `Giữ ngày tốt nhất không quá ${L}% tổng lợi nhuận.`), cls: '' });
    return out;
  }
  if (plan.met) out.push({ text: say(`Met: your best day is ${Math.round(plan.share)}% of your profit.`, `Đạt: ngày tốt nhất là ${Math.round(plan.share)}% lợi nhuận.`), cls: 'tvj-pos' });
  else if (plan.share !== null) out.push({ text: say(`Not met: your best day is ${Math.round(plan.share)}% of your profit.`, `Chưa đạt: ngày tốt nhất là ${Math.round(plan.share)}% lợi nhuận.`), cls: 'tvj-warn' });
  else out.push({ text: say('Not met: your best day is more than all your profit.', 'Chưa đạt: ngày tốt nhất lớn hơn toàn bộ lợi nhuận.'), cls: 'tvj-warn' });
  if (plan.met) {
    if (Number.isFinite(plan.nextMax)) out.push({ text: say(`Your next day can make up to ${down(plan.nextMax)} and it stays met.`, `Ngày tới có thể lãi đến ${down(plan.nextMax)} mà vẫn đạt.`), cls: '' });
    out.push({ text: plan.cushion >= 1 ? say(`A loss of more than ${down(plan.cushion)} would put it over again.`, `Lỗ quá ${down(plan.cushion)} sẽ làm nó vượt lại.`)
      : say('Any loss would put it over again.', 'Lỗ bất kỳ sẽ làm nó vượt lại.'), cls: 'tvj-muted' });
  } else {
    out.push({ text: say(`To meet it: make ${up(plan.needMore)} more (a total of ${up(plan.needTotal)}), with no day over ${down(B)}.`, `Để đạt: cần thêm ${up(plan.needMore)} (tổng ${up(plan.needTotal)}), không ngày nào quá ${down(B)}.`), cls: 'tvj-strong' });
    if (plan.oneDay) out.push({ text: Number.isFinite(plan.nextMax) ? say(`In one day: anything from ${up(plan.needMore)} to ${down(plan.nextMax)}.`, `Trong một ngày: từ ${up(plan.needMore)} đến ${down(plan.nextMax)}.`)
      : say(`In one day: ${up(plan.needMore)} or more.`, `Trong một ngày: từ ${up(plan.needMore)} trở lên.`), cls: '' });
    else out.push({ text: say(`That is at least ${plan.days} more days of up to ${down(B)} each.`, `Tức là ít nhất ${plan.days} ngày nữa, mỗi ngày tối đa ${down(B)}.`), cls: '' });
  }
  if (T && plan.passMore > 0) {
    if (plan.passTotal > (plan.needTotal || 0) + 1e-9) {
      const days = plan.passDays === 1 ? say('one day can do it', 'một ngày là đủ') : say(`at least ${plan.passDays} days`, `ít nhất ${plan.passDays} ngày`);
      out.push({ text: say(`To pass (target ${money(T)}): make ${up(plan.passMore)} more, with no day over ${down(plan.passCap)}; ${days}.`, `Để qua (mục tiêu ${money(T)}): cần thêm ${up(plan.passMore)}, không ngày nào quá ${down(plan.passCap)}; ${days}.`), cls: '' });
    } else if (N < T) out.push({ text: say(`Meeting it also reaches the ${money(T)} target.`, `Khi đạt, bạn cũng chạm mục tiêu ${money(T)}.`), cls: '' });
  }
  out.push({ text: say('Counted by trading day, today included.', 'Tính theo ngày giao dịch, kể cả hôm nay.'), cls: 'tvj-faint' });
  return out;
}

/** A card that floats by `anchor` while the pointer is on it or it has focus (a tap focuses it on a phone), with
 *  `fill(card)` inside. It sits on the page itself, so a card's edge or a dialog never cuts it off, and it goes when
 *  the screen under it is drawn again. */
function hoverCard(anchor, fill) {
  let card = null, timer = 0;
  const hide = () => {
    window.clearInterval(timer);
    if (card) card.remove();
    card = null;
    anchor.removeClass('is-open');
  };
  const show = () => {
    if (card || !anchor.isConnected) return;
    card = document.body.createDiv({ cls: 'tvj-hovercard', attr: { role: 'tooltip' } });
    fill(card);
    const r = anchor.getBoundingClientRect();
    const w = card.offsetWidth, h = card.offsetHeight;
    const top = r.bottom + 6 + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6;
    card.style.left = `${Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8))}px`;
    card.style.top = `${top}px`;
    anchor.addClass('is-open');
    timer = window.setInterval(() => { if (!anchor.isConnected) hide(); }, 400);
  };
  anchor.setAttribute('tabindex', '0');
  anchor.setAttribute('title', ''); // the account card's own tooltip would cover it
  anchor.addEventListener('mouseenter', show);
  anchor.addEventListener('mouseleave', hide);
  anchor.addEventListener('focus', show);
  anchor.addEventListener('blur', hide);
  anchor.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
  // a click opens it (on a phone the tap is the hover) and does not open the account behind it
  anchor.addEventListener('click', (e) => { e.stopPropagation(); show(); });
  return { show, hide };
}

/** Puts the consistency calculator on a rule line ({ box, name } from ruleLine): a calculator mark by the name, and
 *  the hover card. */
function consistencyCalc(line, plan) {
  if (!plan || !line) return;
  line.box.addClass('has-calc');
  setIcon(line.name.createSpan({ cls: 'tvj-calc-icon' }), 'calculator');
  hoverCard(line.box, (card) => { for (const l of consistencyAdvice(plan)) card.createDiv({ cls: l.cls || '', text: l.text }); });
}
/** The account's rule lines: balance, target, max loss, daily loss, days, consistency, size, live review. */
function ruleLines(el, ch, opts = {}) {
  const raw = ruleLine(el);
  // each line explains itself on hover
  const line = (label, value, cls, bar, barCls, meaning) => { const got = raw(label, value, cls, bar, barCls); if (meaning) got.box.setAttribute('title', ruleMeaning(meaning, ch)); return got; };
  if (!opts.noBalance) line('Balance', `${money(Math.round(ch.balance))} (${ch.net >= 0 ? '+' : ''}${money(Math.round(ch.net))})`, ch.net < 0 ? 'tvj-neg' : 'tvj-pos');
  if (ch.target) line('Profit target', `${money(Math.round(Math.max(0, ch.net)))} of ${money(ch.target)}`, ch.targetHit ? 'tvj-pos' : '', ch.progress, ch.targetHit ? 'is-pos' : '', 'target');
  if (ch.maxLoss) {
    const room = Math.max(0, ch.room);
    line(`Max loss · ${tx(DRAWDOWN_LABELS[ch.drawdown] || '')}`, `${money(Math.round(room))} left · line ${money(Math.round(ch.line))}`, room < ch.maxLoss * 0.25 ? 'tvj-neg' : '', room / ch.maxLoss, room < ch.maxLoss * 0.25 ? 'is-warn' : '', 'maxLoss');
  }
  if (ch.dailyLoss) line(`Daily loss · ${ch.dailyHard ? tx('fails the account') : tx('ends the day')}`, `today ${ch.todayPnl >= 0 ? '+' : ''}${money(Math.round(ch.todayPnl))} · ${money(Math.round(Math.max(0, ch.todayRoom)))} left`, ch.todayRoom <= 0 ? 'tvj-neg' : '', Math.max(0, ch.todayRoom) / ch.dailyLoss, ch.todayRoom < ch.dailyLoss * 0.25 ? 'is-warn' : '', 'dailyLoss');
  if (ch.minDays) line('Trading days', `${ch.daysTraded} of ${ch.minDays}`, ch.daysOk ? 'tvj-pos' : '', ch.daysTraded / ch.minDays, ch.daysOk ? 'is-pos' : '', 'days');
  if (ch.minProfitableDays) line('Profitable days', `${ch.profitableDays} of ${ch.minProfitableDays.days} (${money(ch.minProfitableDays.minProfit)}+)`, ch.profitableOk ? 'tvj-pos' : '', ch.profitableDays / ch.minProfitableDays.days, ch.profitableOk ? 'is-pos' : '', 'profitable');
  if (ch.consistency) {
    const shown = line('Consistency', ch.consistencyShare === null ? 'no profit yet' : `best day ${Math.round(ch.consistencyShare)}% of profit (max ${ch.consistencyLimit}%)`, ch.consistencyOk ? 'tvj-pos' : 'tvj-warn');
    consistencyCalc(shown, consistencyPlan({ best: ch.bestDay, net: ch.net, limit: ch.consistencyLimit, target: ch.target }));
  }
  if (ch.maxContractsNow) line('Position size', `up to ${ch.maxContractsNow} contract${ch.maxContractsNow === 1 ? '' : 's'}${ch.oversize.length ? ` · ${ch.oversize.length} trade${ch.oversize.length === 1 ? '' : 's'} over the limit` : ''}`, ch.oversize.length ? 'tvj-warn' : '', undefined, undefined, 'size');
  if (ch.reviewDays.length) line('Live review', `${ch.reviewDays.length} day${ch.reviewDays.length === 1 ? '' : 's'} above ${money(ch.rules.reviewDayProfit)}`, 'tvj-warn');
  // going quiet: only once it is close to the firm's limit
  const pr = practicalRules(ch.rules);
  if (pr.inactivityDays && ch.lastTrade && !ch.breachedOn) {
    const idle = daysBetween(ch.lastTrade, isoDay(new Date()));
    if (idle >= pr.inactivityDays - 5) line('Inactivity', LANG === 'vi' ? `${idle} / ${pr.inactivityDays} ngày không có lệnh` : `${idle} of ${pr.inactivityDays} days without a trade`, 'tvj-warn', idle / pr.inactivityDays, 'is-warn', 'inactivity');
  }
}
/** Rules, Advance (evaluations only), Mark breached and their undo buttons. */
function accountButtons(buttons, app, plugin, a, ch, state, funded, info, onDone, openOverview, breachHost, advanceHost) {
  const settings = plugin.settings;
  // Mark breached / Undo breach: only in the overview's header (`breachHost`); the card leaves them to the overview
  const breachAt = breachHost;
  // on the card, a click opens the overview, and the rules came with + Account; the overview keeps a Rules button
  if (!openOverview) buttons.createEl('button', { text: ch ? 'Rules' : 'Set rules' }).addEventListener('click', () => new ChallengeRulesModal(app, plugin, a, onDone).open());
  const put = async (patch) => {
    const next = { ...(settings.accountInfo[a] || {}), ...patch };
    for (const k of Object.keys(patch)) if (patch[k] === null) delete next[k];
    settings.accountInfo[a] = next;
    await plugin.saveData(settings);
    plugin.refreshViews();
    onDone();
  };
  if (state === 'passed') buttons.createEl('button', { text: 'Undo pass' }).addEventListener('click', () => put({ passed: null, advancedTo: null }));
  else if (info.blown) {
    if (!breachAt) return;
    const undo = breachAt.createEl('button', { text: 'Undo breach', cls: 'tvj-breach-button' });
    breachHost.prepend(undo);
    undo.addEventListener('click', () => put({ blown: null }));
  }
  else if (state !== 'breached') {
    // a funded account has no next stage to advance to, and neither has a demo account (practice, no challenge)
    // Advance shows once the profit target is met (or every rule is), green, beside the status in the header; an
    // account without a target (no rules from a challenge) keeps it with the other buttons
    const met = !!(ch && ch.target && ch.targetHit) || state === 'ready';
    if (!funded && accountKind(a, plugin.settings.accountInfo) !== 'demo' && (met || !(ch && ch.target))) {
      const host = met && advanceHost ? advanceHost : buttons;
      const advance = host.createEl('button', { text: met && advanceHost ? 'Advance →' : 'Advance to next stage', cls: `tvj-advance${met ? ' is-met' : ''}${host === advanceHost ? ' tvj-breach-button' : ''}`, attr: { title: tx('Advance to next stage') } });
      if (host === advanceHost) advanceHost.prepend(advance);
      advance.addEventListener('click', () => new AdvanceStageModal(app, plugin, a, onDone).open());
    }
    if (!breachAt) return;
    const mark = breachAt.createEl('button', { text: 'Mark breached', cls: 'mod-warning tvj-breach-button' });
    breachHost.prepend(mark);
    mark.addEventListener('click', () => put({ blown: isoDay(new Date()) }));
  }
}

// Where the Music pane can play from. `embed(link)` turns a pasted address into the address of that service's
// own player, or '' when the link is not one of theirs.
