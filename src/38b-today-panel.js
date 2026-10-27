// ---------- the today panel: in the right sidebar, today's trades, the account you trade and the next news ----------

const GLANCE_VIEW_TYPE = 'truevision-journal-today';

const hhmm = (at) => { const d = new Date(at); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

/** From `now` to `at` as a short countdown in the current language: 'in 42 min', 'in 3 h 5 min', 'now', '4 min ago';
 *  a day or more away, the date. */
function countdown(at, now = Date.now()) {
  const vi = LANG === 'vi';
  const mins = Math.round((at - now) / 60000);
  if (mins === 0) return vi ? 'ngay bây giờ' : 'now';
  if (mins < 0) return vi ? `${-mins} phút trước` : `${-mins} min ago`;
  if (mins < 60) return vi ? `còn ${mins} phút` : `in ${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h < 24) return vi ? `còn ${h} giờ${m ? ` ${m} phút` : ''}` : `in ${h} h${m ? ` ${m} min` : ''}`;
  return new Date(at).toLocaleDateString(vi ? 'vi-VN' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** What the today panel shows. `trades` are trade objects; the account is the one of today's latest trade, else the
 *  last one you used. events: the Forex Factory week (readCalendar), or null when it has not been fetched.
 *  { today: { count, max, pnl, left, done, why: '' | 'trades' | 'daily' },
 *    account: { name, blown, ch, balance } | null,
 *    news: { next, high (false: no high-impact one left, next is medium), also: [titles at the same time], inWindow,
 *            minutes, rule, firm } | null } */
function glanceOf({ trades = [], accountInfo = {}, payouts = [], lastAccount = '', maxTrades = 0, events = null, now = new Date() } = {}) {
  const today = isoDay(now), ms = now.getTime();
  const todays = trades.filter((t) => t.date === today).sort(byTime);
  const name = (todays.length && todays[todays.length - 1].account) || lastAccount || '';
  const ch = name ? challengeStatus(name, trades, accountInfo, today, payouts) : null;
  const bal = name && !ch ? accountBalance(name, trades, accountInfo, payouts) : null;
  const blown = !!name && (accountStatus(name, trades, accountInfo).blown || !!(ch && ch.breachedOn));
  const max = Math.round(Number(maxTrades)) || 0;
  const dailyHit = !!(ch && !blown && ch.dailyLoss && Number.isFinite(ch.todayRoom) && ch.todayRoom <= 0);
  const tradesHit = max > 0 && todays.length >= max;
  const today_ = { count: todays.length, max, pnl: Math.round(sum(todays.map(netPnl)) * 100) / 100,
    left: max > 0 ? Math.max(0, max - todays.length) : null, done: dailyHit || tradesHit, why: dailyHit ? 'daily' : tradesHit ? 'trades' : '' };
  const account = name ? { name, blown, ch, balance: ch ? ch.balance : bal ? bal.balance : null } : null;
  let news = null;
  if (Array.isArray(events)) {
    const pr = ch ? practicalRules(ch.rules) : { newsRule: '', newsMinutes: 0 };
    const span = pr.newsRule && pr.newsRule !== 'allowed' ? (pr.newsMinutes || 5) * 60000 : 0;
    // a release stays on until its window has passed (a minute, without a window)
    // with no high-impact one left this week, the next medium one (firms' news rules are about high impact only)
    const ahead = (impact, keep) => events.filter((e) => e.impact === impact && (e.country === 'USD' || e.country === 'All') && e.at >= ms - keep).sort((a, b) => a.at - b.at);
    const high = ahead('High', Math.max(span, 60000));
    const list = high.length ? high : ahead('Medium', 60000);
    const next = list[0] || null;
    news = { next, high: !!high.length, also: next ? list.filter((e) => e !== next && e.at === next.at).map((e) => e.title) : [],
      inWindow: !!next && !!high.length && span > 0 && Math.abs(next.at - ms) <= span, minutes: span / 60000, rule: pr.newsRule, firm: (ch && ch.rules.firm) || '' };
  }
  return { today: today_, account, news };
}

/** How close a share of the room left (room ÷ limit) is to the limit: 'safe' (half or more left), 'caution'
 *  (a quarter to half), 'danger' (a tenth to a quarter), 'critical' (under a tenth). */
const dangerLevel = (share) => (share >= 0.5 ? 'safe' : share >= 0.25 ? 'caution' : share >= 0.1 ? 'danger' : 'critical');

/** Every live account with a max loss: how much is left before it, and before today's limit, the closest first.
 *  { rows: [{ name, funded, balance, line, room, maxLoss, share, level, dailyRoom, dailyLoss, dailyShare, dailyLevel,
 *            dllHit (today's loss reached the daily limit) }],
 *    total (room left, all accounts), atRisk (accounts in danger or critical) }. Breached and passed accounts are left out. */
function drawdownBoard(accounts, trades, accountInfo = {}, payouts = [], today = isoDay(new Date())) {
  const rows = [];
  for (const name of accounts) {
    const st = accountStatus(name, trades, accountInfo);
    if (st.blown || st.passed) continue;
    const ch = challengeStatus(name, trades, accountInfo, today, payouts);
    if (!ch || ch.breachedOn || !ch.maxLoss || !Number.isFinite(ch.room)) continue;
    const share = Math.max(0, ch.room) / ch.maxLoss;
    const daily = ch.dailyLoss && Number.isFinite(ch.todayRoom);
    const dailyShare = daily ? Math.max(0, ch.todayRoom) / ch.dailyLoss : null;
    rows.push({ name, funded: isFundedAccount(name, accountInfo), balance: ch.balance, line: ch.line, room: ch.room, maxLoss: ch.maxLoss, share, level: dangerLevel(share),
      dailyRoom: daily ? ch.todayRoom : null, dailyLoss: daily ? ch.dailyLoss : null, dailyShare, dailyLevel: daily ? dangerLevel(dailyShare) : null,
      dllHit: !!daily && ch.todayRoom <= 1e-9 });
  }
  rows.sort((a, b) => a.share - b.share || a.name.localeCompare(b.name));
  return { rows, total: sum(rows.map((r) => Math.max(0, r.room))), atRisk: rows.filter((r) => r.level === 'danger' || r.level === 'critical').length };
}

class GlanceView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType() { return GLANCE_VIEW_TYPE; }
  getDisplayText() { return 'True Journal today'; }
  getIcon() { return 'gauge'; }
  async onOpen() {
    this.register(keepLocalized(this.contentEl));
    this.render();
    this.plugin.watchData(this, () => this.render());
    this.registerInterval(window.setInterval(() => this.render(), 30000)); // the countdown, and the new day at midnight
    this.plugin.calendar(); // at most once a day; the panel redraws when it arrives
  }
  /** A card: a small heading with an icon; clickable when `open` is given. */
  card(title, icon, open) {
    const c = this.contentEl.createDiv({ cls: `tvj-glance-card${open ? ' is-link' : ''}`, attr: open ? { role: 'button', tabindex: '0' } : {} });
    const head = c.createDiv({ cls: 'tvj-glance-head' });
    setIcon(head.createSpan({ cls: 'tvj-glance-icon' }), icon);
    head.createSpan({ text: title });
    c.head = head;
    if (open) {
      c.addEventListener('click', open);
      c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    }
    return c;
  }
  bar(parent, share, cls = '') {
    const track = parent.createDiv({ cls: `tvj-glance-bar ${cls}`.trim() });
    track.createDiv({ cls: 'tvj-glance-fill', attr: { style: `width: ${Math.round(Math.max(0, Math.min(1, share)) * 100)}%` } });
  }
  render() {
    const root = this.contentEl, plugin = this.plugin, s = plugin.settings, app = this.app, vi = LANG === 'vi';
    root.empty();
    root.addClass('tvj-panel');
    root.addClass('tvj-glance');
    // two tabs: today (the account you trade) and drawdown (every account)
    const tab = s.glanceTab === 'drawdown' ? 'drawdown' : 'today';
    const tabs = root.createDiv({ cls: 'tvj-glance-tabs', attr: { role: 'tablist' } });
    for (const [key, label] of [['today', 'Today'], ['drawdown', 'Drawdown']]) {
      const b = tabs.createEl('button', { cls: `tvj-glance-tab${key === tab ? ' is-active' : ''}`, text: tx(label), attr: { role: 'tab', 'aria-selected': String(key === tab) } });
      b.addEventListener('click', async () => {
        if (s.glanceTab === key) return;
        s.glanceTab = key;
        this.render();
        await plugin.saveData(s);
      });
    }
    if (tab === 'drawdown') { this.renderDrawdown(); return; }
    const cache = s.calendarCache && Array.isArray(s.calendarCache.events) ? s.calendarCache.events : null;
    const g = glanceOf({ trades: plugin.getTrades().map((x) => x.trade), accountInfo: s.accountInfo, payouts: s.payouts, lastAccount: s.lastAccount, maxTrades: s.maxTradesPerDay, events: cache });
    const sign = (n) => (n > 0 ? 'is-pos' : n < 0 ? 'is-neg' : '');

    // today: trades taken against your limit, and the day's P&L
    const t = g.today;
    const day = this.card(tx('Today'), 'calendar-days', () => new DayReviewModal(app, plugin, isoDay(new Date()), plugin.todayScope()).open());
    const row = day.createDiv({ cls: 'tvj-glance-row' });
    row.createSpan({ cls: 'tvj-glance-big', text: t.max ? (vi ? `${t.count}/${t.max} lệnh` : `${t.count} of ${t.max} trades`) : (vi ? `${t.count} lệnh` : `${t.count} trade${t.count === 1 ? '' : 's'}`) });
    row.createSpan({ cls: `tvj-glance-big ${sign(t.pnl)}`, text: cents(t.pnl) }); // −$807.10, not −$807.1
    if (t.max) this.bar(day, t.count / t.max, t.done ? 'is-done' : '');
    if (t.done) {
      const done = day.createDiv({ cls: 'tvj-glance-stop' });
      done.createDiv({ cls: 'tvj-glance-stop-title', text: tx('Done for today') });
      done.createDiv({ text: tx(t.why === 'daily' ? 'Daily loss limit reached.' : "That's your trade limit for today.") });
    } else if (t.left !== null) day.createDiv({ cls: 'tvj-glance-sub', text: vi ? `còn ${t.left} lệnh hôm nay` : `${t.left} trade${t.left === 1 ? '' : 's'} left today` });

    // the account you trade: room to the max loss and to today's limit, and how far to the target
    const a = g.account;
    const acct = this.card(tx('Account'), 'wallet', a ? () => new AccountOverviewModal(app, plugin, a.name).open() : () => plugin.openView(ACCOUNTS_VIEW_TYPE));
    if (!a) acct.createDiv({ cls: 'tvj-glance-sub', text: tx('No account yet: add one in Accounts.') });
    else {
      const head = acct.createDiv({ cls: 'tvj-glance-row' });
      head.createSpan({ cls: 'tvj-glance-name', text: a.name });
      if (a.blown) head.createSpan({ cls: 'tvj-glance-tag is-neg', text: tx('Breached') });
      else if (a.balance !== null) head.createSpan({ cls: 'tvj-glance-muted', text: money(Math.round(a.balance)) });
      const ch = a.ch;
      if (!ch) acct.createDiv({ cls: 'tvj-glance-sub', text: tx('Add its rules to see the room and target.') });
      else if (!a.blown) {
        const line = (label, value, share, cls) => {
          const r = acct.createDiv({ cls: 'tvj-glance-line' });
          const top = r.createDiv({ cls: 'tvj-glance-row' });
          top.createSpan({ cls: 'tvj-glance-muted', text: tx(label) });
          top.createSpan({ cls: 'tvj-glance-value', text: value });
          if (share !== null) this.bar(r, share, cls);
        };
        if (ch.maxLoss && Number.isFinite(ch.room)) line('Room to max loss', money(Math.round(ch.room)), ch.room / ch.maxLoss, ch.room < ch.maxLoss * 0.25 ? 'is-warn' : '');
        if (ch.dailyLoss && Number.isFinite(ch.todayRoom)) line("Today's loss limit", vi ? `còn ${money(Math.round(ch.todayRoom))}` : `${money(Math.round(ch.todayRoom))} left`, ch.todayRoom / ch.dailyLoss, ch.todayRoom < ch.dailyLoss * 0.3 ? 'is-warn' : '');
        if (ch.target) line('Target', ch.targetHit ? tx('Reached') : `${money(Math.round(ch.net))} / ${money(ch.target)}`, ch.progress, 'is-goal');
      }
    }

    // the next high-impact release, and whether you are inside the firm's window around it
    const n = g.news;
    const news = this.card(tx('Next news'), 'newspaper');
    if (!n) news.createDiv({ cls: 'tvj-glance-sub', text: tx('Calendar not loaded yet.') });
    else if (!n.next) news.createDiv({ cls: 'tvj-glance-sub', text: tx('No USD news left this week.') });
    else {
      if (n.inWindow) news.addClass('is-warn');
      const top = news.createDiv({ cls: 'tvj-glance-row' });
      top.createSpan({ cls: 'tvj-glance-name', text: n.next.title });
      top.createSpan({ cls: 'tvj-glance-value', text: countdown(n.next.at) });
      // the countdown (or the date, a day or more away) is on the right; the time goes under the title
      news.createDiv({ cls: 'tvj-glance-sub', text: [hhmm(n.next.at), n.next.country, n.high ? '' : tx('medium impact'), ...n.also].filter(Boolean).join(' · ') });
      if (n.inWindow) news.createDiv({ cls: 'tvj-glance-stop', text: vi ? `Trong khung giờ tin (±${n.minutes} phút): ${n.firm || 'quỹ'} ${tx(NEWS_RULES[n.rule]).toLowerCase()}.` : `Inside the news window (±${n.minutes} min): ${n.firm || 'the firm'} says ${tx(NEWS_RULES[n.rule]).toLowerCase()}.` });
      else if (n.minutes && n.high) news.createDiv({ cls: 'tvj-glance-muted', text: vi ? `Khung giờ ±${n.minutes} phút (${n.firm})` : `±${n.minutes} min window (${n.firm})` });
    }
  }
  /** The drawdown tab: one list of every live account, the room left before its max loss, coloured as it gets close
   *  (green, then yellow under half, orange under a quarter, red under a tenth). */
  renderDrawdown() {
    const plugin = this.plugin, s = plugin.settings, app = this.app, vi = LANG === 'vi';
    const trades = plugin.getTrades().map((x) => x.trade);
    const accounts = [...new Set([...plugin.allAccounts(trades), ...(s.accounts || [])])].filter((a) => a && a !== NO_ACCOUNT);
    const board = drawdownBoard(accounts, trades, s.accountInfo, s.payouts);
    const card = this.card(tx('Drawdown left'), 'shield');
    if (!board.rows.length) { card.createDiv({ cls: 'tvj-glance-sub', text: tx('No live account has a max loss set.') }); return; }
    card.head.createSpan({ cls: 'tvj-dd-total', text: money(Math.round(board.total)), attr: { title: tx('All accounts') } });
    for (const r of board.rows) {
      const row = card.createDiv({ cls: 'tvj-dd-row', attr: { role: 'button', tabindex: '0', title: `${money(Math.round(r.room))} / ${money(r.maxLoss)}` } });
      const top = row.createDiv({ cls: 'tvj-glance-row' });
      const who = top.createSpan({ cls: 'tvj-dd-who' });
      who.createSpan({ cls: 'tvj-glance-name', text: r.name });
      // the daily loss limit was hit today: done until the next session (the account itself is still alive)
      if (r.dllHit) setIcon(who.createSpan({ cls: 'tvj-dd-dll', attr: { 'aria-label': tx('Daily loss limit hit today'), title: tx('Daily loss limit hit today: no more trades until the next session.') } }), 'octagon-x');
      top.createSpan({ cls: `tvj-glance-value tvj-dd-${r.level}`, text: money(Math.round(r.room)) });
      this.bar(row, r.share, `tvj-dd-bar is-${r.level}`);
      // one quiet line: the share of the max loss left (room past it, once the floor has stopped trailing), and today's limit
      const share = r.share > 1 ? (vi ? `hơn mức ${money(r.maxLoss)}` : `more than ${money(r.maxLoss)}`) : (vi ? `${Math.round(r.share * 100)}% của ${money(r.maxLoss)}` : `${Math.round(r.share * 100)}% of ${money(r.maxLoss)}`);
      const sub = row.createDiv({ cls: 'tvj-dd-sub' });
      sub.createSpan({ text: share });
      if (r.dllHit) sub.createSpan({ cls: 'tvj-dd-critical', text: tx('DLL hit today') });
      else if (r.dailyLoss) sub.createSpan({ cls: r.dailyLevel === 'safe' ? '' : `tvj-dd-${r.dailyLevel}`, text: vi ? `hôm nay còn ${money(Math.round(r.dailyRoom))}` : `today ${money(Math.round(r.dailyRoom))} left` });
      const open = () => new AccountOverviewModal(app, plugin, r.name).open();
      row.addEventListener('click', open);
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    }
  }
}
