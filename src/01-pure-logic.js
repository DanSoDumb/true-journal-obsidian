// ---------- pure logic (also used by the tests) ----------

const sign = (t) => (t.direction === 'long' ? 1 : -1);
const grossPnl = (t) => (t.exit - t.entry) * sign(t) * t.qty * t.pointValue;
/** What the prices say the trade made, after fees. */
const computedPnl = (t) => grossPnl(t) - t.fees;
/** Net P&L. A result typed in by hand (pnlOverride: the figure the broker shows, fees included) wins over the maths. */
const netPnl = (t) => (Number.isFinite(t.pnlOverride) ? t.pnlOverride : computedPnl(t));

function rMultiple(t) {
  if (t.stop === null) return null;
  const perUnit = (t.entry - t.stop) * sign(t);
  return perUnit > 0 ? netPnl(t) / (perUnit * t.qty * t.pointValue) : null;
}

const byTime = (a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

/** Average RR: for one account, the average winning trade ÷ the average losing trade (total profit ÷ total loss
 *  would be the profit factor, which also counts how often you win). Several accounts together show the plain
 *  average of the accounts' figures. An account with losses but no win counts as 0. One with no loss yet has no
 *  average loss, so its winners' R-multiples stand in (reward ÷ the risk its stops set); with no stops either it
 *  has no figure and is left out. Returns { rr, accounts } — rr is null when no account has a figure. */
function rewardRisk(trades) {
  const byAccount = new Map();
  for (const t of trades) {
    const key = t.account || '';
    if (!byAccount.has(key)) byAccount.set(key, []);
    byAccount.get(key).push(t);
  }
  const ratios = [];
  for (const list of byAccount.values()) {
    const pnl = list.map(netPnl);
    const wins = pnl.filter((p) => p > 0), losses = pnl.filter((p) => p < 0);
    if (losses.length) { ratios.push(wins.length ? (sum(wins) / wins.length) / (-sum(losses) / losses.length) : 0); continue; }
    // no loss yet: the risk is what the stops put at stake, so the winners' R-multiples stand in
    const rs = list.filter((t) => netPnl(t) > 0).map(rMultiple).filter((r) => r !== null);
    if (rs.length) ratios.push(sum(rs) / rs.length);
  }
  return { rr: ratios.length ? sum(ratios) / ratios.length : null, accounts: ratios.length };
}

function computeStats(trades) {
  const pnl = [...trades].sort(byTime).map(netPnl);
  const wins = pnl.filter((p) => p > 0);
  const losses = pnl.filter((p) => p < 0);
  const rs = trades.map(rMultiple).filter((r) => r !== null);
  let equity = 0, peak = 0, maxDrawdown = 0;
  for (const p of pnl) {
    equity += p;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
  }
  const decided = wins.length + losses.length;
  return {
    trades: trades.length, wins: wins.length, losses: losses.length, net: sum(pnl),
    winRate: decided ? (wins.length / decided) * 100 : 0,
    profitFactor: losses.length ? sum(wins) / -sum(losses) : null,
    avgWin: wins.length ? sum(wins) / wins.length : 0,
    avgLoss: losses.length ? sum(losses) / losses.length : 0,
    expectancy: trades.length ? sum(pnl) / trades.length : 0,
    avgR: rs.length ? sum(rs) / rs.length : null, // average R-multiple (needs stops); the rank formula uses it
    rr: rewardRisk(trades).rr, rrAccounts: rewardRisk(trades).accounts,
    maxDrawdown,
  };
}

/** "$1,250", "$5,131.10", "−$717.56": whole dollars stay whole; an amount with cents always shows both digits. */
const money = (n) => {
  const abs = Math.abs(n);
  const cents = Math.round(abs * 100) % 100 !== 0;
  return `${n < 0 ? '−' : ''}$${abs.toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 })}`;
};
const yamlString = (s) => JSON.stringify(s);
const yamlList = (xs) => `[${xs.map(yamlString).join(', ')}]`;
const safeName = (s) => s.replace(/[\\/:*?"<>|#^[\]]/g, '-').trim();
const tradeFileName = (t) => `${t.date} ${t.time.replace(':', '')} ${safeName(t.symbol)} ${t.direction}.md`;

/** Trades journaled without being taken: a setup you saw but missed, or one from a backtest. They are written and
 *  reviewed like any trade, but stay out of every total: P&L, the calendar, accounts, the rank and the tracker. */
const TRADE_KINDS = { missed: 'Missed', backtest: 'Backtest' };
const isCounted = (t) => !(t && TRADE_KINDS[t.kind]);

function tradeToMarkdown(t) {
  const r = rMultiple(t);
  const front = [
    'type: tv-trade', `id: ${yamlString(t.id)}`, `date: ${t.date}`, `time: ${yamlString(t.time)}`,
    `symbol: ${yamlString(t.symbol)}`, `direction: ${t.direction}`, `entry: ${t.entry}`, `exit: ${t.exit}`,
    `stop: ${t.stop === null ? '' : t.stop}`, `qty: ${t.qty}`, `pointValue: ${t.pointValue}`, `fees: ${t.fees}`,
    `duration: ${Number.isFinite(t.duration) && t.duration > 0 ? Math.round(t.duration) : ''}`,
    `market: ${t.market === 'cfd' ? 'cfd' : 'futures'}`, `pnlOverride: ${Number.isFinite(t.pnlOverride) ? t.pnlOverride : ''}`,
    `pnl: ${Number(netPnl(t).toFixed(2))}`, `r: ${r === null ? '' : Number(r.toFixed(2))}`,
    `account: ${yamlString(t.account)}`, `setups: ${yamlList(t.setups || [])}`, `tags: ${yamlList(t.tags)}`,
    `mistakes: ${yamlList(t.mistakes)}`, `reviewed: ${t.reviewed}`,
  ];
  if (t.entries && t.entries.length > 1) front.splice(front.indexOf(`qty: ${t.qty}`) + 1, 0, `entries: ${yamlList(t.entries)}`);
  // partial exits (scaling out), "20:56:29 · 1 @ 29529.25" each, after the exit price they average to
  if (t.exits && t.exits.length > 1) front.splice(front.findIndex((l) => l.startsWith('exit:')) + 1, 0, `exits: ${yamlList(t.exits)}`);
  // a P&L typed in directly (one trade, or the whole day) has no prices: its entry and exit are written as 0
  if (t.pnlOnly) front.splice(front.findIndex((l) => l.startsWith('pnlOverride:')) + 1, 0, 'pnlOnly: true');
  if (TRADE_KINDS[t.kind]) front.splice(1, 0, `kind: ${t.kind}`);
  const body = ['## Thesis', t.thesis || '_—_', '', '## Notes', t.notes || '_—_'];
  if (t.review.length) {
    body.push('', '## Review');
    for (const a of t.review) body.push(`- **${a.question}** ${a.answer}`);
  }
  return `---\n${front.join('\n')}\n---\n\n${body.join('\n')}\n`;
}

/** A trade's setups: `setups` (a list), and `setup` from notes written before a trade could have several. */
function setupsOf(fm) {
  const list = (v) => (Array.isArray(v) ? v : v ? [v] : []).map((x) => String(x).trim()).filter(Boolean);
  return [...new Set([...list(fm.setups), ...list(fm.setup)])];
}

// Ready-made setups and mistakes for the review's tagging step, so a trade can be tagged without typing names first.
// Settings → Ready-made tags can replace them (settings.tagPresets = { setups, mistakes }). The names are what gets
// written to the trade notes, so they are never translated.
const PRESET_TAGS = {
  setups: ['Continuation', 'Reversal Pattern', '2022 Model', 'Liquidity Sweep', 'Turtle Soup', 'FVG', 'Order Block', 'Breaker',
    'OTE', 'Silver Bullet', 'Judas Swing', 'SMT', 'CISD', '3 Drive', 'Gamble'],
  mistakes: ['Early Entry', 'FOMO', 'Revenge Trade', 'Overtrade', 'Poor Position Sizing', 'Early TP', 'Moved Stop', 'No Stop',
    'Held a Loser', 'Against Bias', 'Traded the News', 'Outside Killzone', 'Hesitated', 'Multiple Accounts', 'Broke Daily Loss Rule'],
};
/** The ready-made setups or mistakes (key 'setups' | 'mistakes'): your own list from Settings, or the built-in one. */
const presetTags = (settings, key) => (settings && settings.tagPresets && Array.isArray(settings.tagPresets[key]) ? settings.tagPresets[key] : PRESET_TAGS[key]);
/** Names in order with repeats left out, ignoring case ("fvg" after "FVG" is the same tag). */
function uniqueTags(names) {
  const seen = new Set();
  return names.map((x) => String(x || '').trim()).filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()));
}

/** Frontmatter of a trade note -> trade object, or null when the note is not a usable trade. */
function tradeFromFrontmatter(fm) {
  if (!fm || fm.type !== 'tv-trade') return null;
  const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));
  const list = (v) => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);
  const t = {
    id: String(fm.id || ''), date: String(fm.date || '').slice(0, 10), time: String(fm.time || '00:00'),
    symbol: String(fm.symbol || ''), direction: fm.direction === 'short' ? 'short' : 'long',
    entry: num(fm.entry), exit: num(fm.exit), stop: Number.isFinite(num(fm.stop)) ? num(fm.stop) : null,
    qty: num(fm.qty), pointValue: num(fm.pointValue), fees: Number.isFinite(num(fm.fees)) ? num(fm.fees) : 0,
    account: String(fm.account || ''), setups: setupsOf(fm), tags: list(fm.tags), mistakes: list(fm.mistakes),
    reviewed: fm.reviewed === true, chart: typeof fm.chart === 'string' && fm.chart ? fm.chart : '', thesis: '', notes: '', review: [],
    duration: num(fm.duration) > 0 ? num(fm.duration) : null, // seconds in the trade, when the exit time is known
    market: fm.market === 'cfd' ? 'cfd' : 'futures', pnlOverride: Number.isFinite(num(fm.pnlOverride)) ? num(fm.pnlOverride) : null,
    pnlOnly: fm.pnlOnly === true, // typed in as a P&L: no prices
    entries: list(fm.entries), // pyramid entries, "21:21:05 · 7 @ 30912" (see mergePyramid)
    exits: list(fm.exits), // partial exits, "20:56:29 · 1 @ 29529.25" (see mergePartialExits)
    kind: TRADE_KINDS[fm.kind] ? fm.kind : '', // '' for a trade you took; 'missed' or 'backtest' count nowhere (see isCounted)
  };
  return [t.entry, t.exit, t.qty, t.pointValue].every(Number.isFinite) && t.symbol && t.date ? t : null;
}

