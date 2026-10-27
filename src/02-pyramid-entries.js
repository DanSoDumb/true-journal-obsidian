// ---------- pyramid entries ----------
//
// Adding to a position shows up in some exports (TopstepX's Trades tab, MetaTrader hedging accounts) as separate
// trades that all close together. Trades on the same account, symbol and direction that close at the same moment are
// one position: one trade whose entry and exit are size-weighted averages and whose qty is the total, with each add
// kept in `entries` as "21:21:05 · 7 @ 30912". The combined P&L is exactly the sum of the parts.

/** "21:21:05 · 7 @ 30912" -> { time, qty, price }, or null. */
function parseEntryLeg(text) {
  const m = String(text || '').match(/^\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*·\s*([\d.]+)\s*@\s*(-?[\d.]+)\s*$/);
  return m ? { time: m[1], qty: Number(m[2]), price: Number(m[3]) } : null;
}
const entryLegText = (time, qty, price) => `${time} · ${Number(qty.toFixed(8))} @ ${Number(price.toFixed(6))}`;
const noteStartMs = (t) => Date.parse(`${t.date}T${String(t.time).slice(0, 5)}:00Z`);
const byEntryTime = (a, b) => (Number.isFinite(a._inMs) && Number.isFinite(b._inMs) ? a._inMs - b._inMs : byTime(a, b));

/** When a trade closed: exactly (ms, known for imported trades) or estimated from its note, whose entry time is
 *  kept to the minute only. null when the trade has no duration. */
function exitMoment(t) {
  if (Number.isFinite(t._outMs)) return { ms: t._outMs, exact: true };
  return t.duration > 0 && Number.isFinite(noteStartMs(t)) ? { ms: noteStartMs(t) + t.duration * 1000, exact: false } : null;
}

/** Trades that close together, as groups of two or more (oldest entry first): same account, symbol and direction,
 *  and the same exit — within a second when the import knows the exit time; for trades already in notes, the same
 *  exit price within a minute. exactOnly leaves the estimated ones out. */
function pyramidGroups(trades, exactOnly = false) {
  const buckets = new Map();
  for (const t of trades) {
    const at = exitMoment(t);
    if (!at || (exactOnly && !at.exact)) continue;
    const key = `${t.account || ''}|${t.symbol}|${t.direction}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ t, at });
  }
  const groups = [];
  for (const list of buckets.values()) {
    list.sort((a, b) => a.at.ms - b.at.ms);
    let cur = [];
    const flush = () => { if (cur.length > 1) groups.push(cur.map((x) => x.t).sort(byEntryTime)); };
    for (const x of list) {
      const last = cur[cur.length - 1];
      const together = last && (x.at.exact && last.at.exact
        ? x.at.ms - last.at.ms <= 1000
        : x.at.ms - cur[0].at.ms < 60000 && Math.abs(x.t.exit - last.t.exit) < 1e-9);
      if (!together) { flush(); cur = []; }
      cur.push(x);
    }
    flush();
  }
  return groups;
}

/** The trades of one position -> one trade with pyramid entries. It keeps the first trade's id, time, notes and
 *  review; the risk of the adds adds up, so one stop for all of them stays that stop. */
function mergePyramid(legs) {
  const list = [...legs].sort(byEntryTime);
  const first = list[0], dir = sign(first);
  const qty = sum(list.map((t) => t.qty));
  const avg = (key) => Number((sum(list.map((t) => t[key] * t.qty)) / qty).toFixed(6));
  const entry = avg('entry');
  let stop = null;
  if (list.every((t) => t.stop !== null)) {
    const risk = sum(list.map((t) => (t.entry - t.stop) * dir * t.qty));
    stop = Number((entry - (dir * risk) / qty).toFixed(6));
  } else {
    const known = [...new Set(list.map((t) => t.stop).filter((s) => s !== null))];
    stop = known.length === 1 ? known[0] : null;
  }
  const start = Number.isFinite(first._inMs) ? first._inMs : noteStartMs(first);
  const ends = list.map(exitMoment).filter(Boolean).map((e) => e.ms);
  const end = ends.length ? Math.max(...ends) : NaN;
  const legsOf = (t) => (t.entries && t.entries.length > 1 ? t.entries : [entryLegText(t.clock || t.time, t.qty, t.entry)]);
  const union = (key) => [...new Set(list.flatMap((t) => t[key] || []))];
  return {
    ...first, entry, exit: avg('exit'), qty: Number(qty.toFixed(8)), stop,
    fees: Math.round(sum(list.map((t) => t.fees || 0)) * 100) / 100,
    pnlOverride: list.some((t) => Number.isFinite(t.pnlOverride)) ? Math.round(sum(list.map(netPnl)) * 100) / 100 : null,
    duration: end > start ? Math.round((end - start) / 1000) : first.duration,
    setups: union('setups'), tags: union('tags'), mistakes: union('mistakes'),
    thesis: list.map((t) => t.thesis).filter(Boolean).join('\n\n'), notes: list.map((t) => t.notes).filter(Boolean).join('\n\n'),
    entries: list.flatMap(legsOf), _outMs: end,
  };
}

/** Trades with the ones that close together combined; { trades, groups, legs }. */
function combinePyramids(trades, exactOnly = true) {
  const groups = pyramidGroups(trades, exactOnly);
  const merged = new Map(), absorbed = new Set();
  for (const g of groups) {
    merged.set(g[0], mergePyramid(g));
    g.slice(1).forEach((t) => absorbed.add(t));
  }
  return { trades: trades.filter((t) => !absorbed.has(t)).map((t) => merged.get(t) || t), groups: groups.length, legs: sum(groups.map((g) => g.length)) };
}

// ---------- partial exits ----------
//
// Scaling out shows up the other way round: one entry, closed in parts at different times and prices. Exports that
// write one row per closed part (TopstepX's Trades tab) give a trade per part, all with the same entry. Those are one
// position: one trade whose exit is the size-weighted average and whose qty is the total, with each part kept in
// `exits` as "20:56:29 · 1 @ 29529.25". The combined P&L is exactly the sum of the parts.

/** A clock time ("20:56:29", or "20:56" from a note) for a moment kept as wall-clock ms (see noteStartMs). */
const clockOf = (ms, seconds) => { const d = new Date(ms); const p = (n) => String(n).padStart(2, '0'); return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}${seconds ? `:${p(d.getUTCSeconds())}` : ''}`; };
const entryMoment = (t) => (Number.isFinite(t._inMs) ? { ms: t._inMs, exact: true } : Number.isFinite(noteStartMs(t)) ? { ms: noteStartMs(t), exact: false } : null);
const byExitMoment = (a, b) => ((exitMoment(a) || { ms: 0 }).ms - (exitMoment(b) || { ms: 0 }).ms) || byTime(a, b);

/** Trades that are parts of one position closed in steps, as groups of two or more (first exit first): same
 *  account, symbol and direction, and the same entry — within a second when the import knows the entry time; for
 *  trades already in notes, the same entry minute and price. exactOnly leaves the estimated ones out. Trades with
 *  the same exit too are not parts (they are one size split in rows: see pyramidGroups). */
function partialExitGroups(trades, exactOnly = false) {
  const buckets = new Map();
  for (const t of trades) {
    const at = entryMoment(t);
    if (!at || (exactOnly && !at.exact) || t.pnlOnly) continue;
    const key = `${t.account || ''}|${t.symbol}|${t.direction}|${at.exact ? '' : `${t.date} ${t.time}|${t.entry}`}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ t, at });
  }
  const groups = [];
  for (const list of buckets.values()) {
    list.sort((a, b) => a.at.ms - b.at.ms);
    let cur = [];
    const flush = () => {
      // parts close at different prices or times; the same exit everywhere is one size split in rows, not scaling out
      if (cur.length > 1 && new Set(cur.map((x) => `${x.t.exit}|${(exitMoment(x.t) || {}).ms}`)).size > 1) groups.push(cur.map((x) => x.t).sort(byExitMoment));
    };
    for (const x of list) {
      const last = cur[cur.length - 1];
      const together = last && (x.at.exact && last.at.exact ? x.at.ms - last.at.ms <= 1000 && Math.abs(x.t.entry - last.t.entry) < 1e-9 : true);
      if (!together) { flush(); cur = []; }
      cur.push(x);
    }
    flush();
  }
  return groups;
}

/** The parts of one position -> one trade with partial exits. It keeps the first part's id, notes and review. */
function mergePartialExits(parts) {
  const list = [...parts].sort(byExitMoment);
  const first = list[0];
  const qty = sum(list.map((t) => t.qty));
  const avg = (key) => Number((sum(list.map((t) => t[key] * t.qty)) / qty).toFixed(6));
  const stops = [...new Set(list.map((t) => t.stop).filter((s) => s !== null))];
  const start = (entryMoment(first) || { ms: NaN }).ms;
  const ends = list.map(exitMoment).filter(Boolean);
  const end = ends.length ? Math.max(...ends.map((e) => e.ms)) : NaN;
  const legsOf = (t) => {
    if (t.exits && t.exits.length > 1) return t.exits;
    const at = exitMoment(t);
    return [entryLegText(at ? clockOf(at.ms, at.exact) : '—', t.qty, t.exit)];
  };
  const union = (key) => [...new Set(list.flatMap((t) => t[key] || []))];
  return {
    ...first, entry: avg('entry'), exit: avg('exit'), qty: Number(qty.toFixed(8)), stop: stops.length === 1 ? stops[0] : null,
    fees: Math.round(sum(list.map((t) => t.fees || 0)) * 100) / 100,
    pnlOverride: list.some((t) => Number.isFinite(t.pnlOverride)) ? Math.round(sum(list.map(netPnl)) * 100) / 100 : null,
    duration: end > start ? Math.round((end - start) / 1000) : first.duration,
    setups: union('setups'), tags: union('tags'), mistakes: union('mistakes'),
    thesis: list.map((t) => t.thesis).filter(Boolean).join('\n\n'), notes: list.map((t) => t.notes).filter(Boolean).join('\n\n'),
    exits: list.flatMap(legsOf), _outMs: end,
  };
}

/** Trades with the parts of each scaled-out position combined; { trades, groups, legs }. */
function combinePartialExits(trades, exactOnly = true) {
  const groups = partialExitGroups(trades, exactOnly);
  const merged = new Map(), absorbed = new Set();
  for (const g of groups) {
    merged.set(g[0], mergePartialExits(g));
    g.slice(1).forEach((t) => absorbed.add(t));
  }
  return { trades: trades.filter((t) => !absorbed.has(t)).map((t) => merged.get(t) || t), groups: groups.length, legs: sum(groups.map((g) => g.length)) };
}

/** Exits typed in the trade form, one per line: "1 @ 29529.25", "1 @ 29529.25 20:56" or "20:56 · 1 @ 29529.25" ->
 *  { legs, qty, exit } (exit = the size-weighted average), or { error } naming the first line it cannot read. */
function parseExitLines(text) {
  const legs = [];
  for (const raw of String(text || '').split('\n').map((l) => l.trim()).filter(Boolean)) {
    const leg = parseEntryLeg(raw);
    const m = leg ? null : raw.replace(/,/g, '').match(/^([\d.]+)\s*(?:@|x|×)\s*(-?[\d.]+)(?:\s+(?:at\s+)?(\d{1,2}:\d{2}(?::\d{2})?))?$/i);
    const part = leg || (m && { qty: Number(m[1]), price: Number(m[2]), time: m[3] || '' });
    if (!part || !(part.qty > 0) || !Number.isFinite(part.price)) return { error: raw };
    legs.push(part);
  }
  if (!legs.length) return { legs: [], qty: 0, exit: NaN };
  const qty = sum(legs.map((l) => l.qty));
  return { legs: legs.map((l) => entryLegText(l.time || '—', l.qty, l.price)), qty: Number(qty.toFixed(8)), exit: Number((sum(legs.map((l) => l.price * l.qty)) / qty).toFixed(6)) };
}

/** Note content with `text` added at the end of its ## Notes section (in place of the "_—_" placeholder). */
function withNotesAdded(content, text) {
  const lines = String(content).split('\n');
  const start = lines.findIndex((l) => /^## Notes\s*$/.test(l));
  if (start < 0) return `${String(content).replace(/\s*$/, '')}\n\n## Notes\n${text}\n`;
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end < 0) end = lines.length;
  const body = lines.slice(start + 1, end).join('\n').trim();
  const notes = body && body !== '_—_' ? `${body}\n\n${text}` : text;
  return [...lines.slice(0, start + 1), notes, '', ...lines.slice(end)].join('\n').replace(/\n+$/, '\n');
}

const accountName = (t) => t.account || NO_ACCOUNT;

/** Settings text -> groups. One group per line: "Group name: account one, account two". */
/** Groups text with the account `from` renamed `to` wherever a group lists it. */
function renameInGroups(text, from, to) {
  return String(text || '').split('\n').map((line) => {
    const i = line.indexOf(':');
    if (i < 0) return line;
    const names = line.slice(i + 1).split(',').map((a) => a.trim());
    if (!names.includes(from)) return line;
    return `${line.slice(0, i)}: ${names.map((a) => (a === from ? to : a)).filter(Boolean).join(', ')}`;
  }).join('\n');
}

function parseGroups(text) {
  return String(text || '').split('\n').map((line) => {
    const i = line.indexOf(':');
    if (i < 0) return null;
    const name = line.slice(0, i).trim();
    const accounts = line.slice(i + 1).split(',').map((a) => a.trim()).filter(Boolean);
    return name && accounts.length ? { name, accounts } : null;
  }).filter(Boolean);
}

/** Groups text with `account` added to `group` (the group line is created when it does not exist). */
function withAccountInGroup(text, group, account) {
  const lines = String(text || '').split('\n').filter((l) => l.trim());
  const i = lines.findIndex((l) => l.slice(0, Math.max(0, l.indexOf(':'))).trim() === group);
  if (i < 0) return [...lines, `${group}: ${account}`].join('\n');
  const members = lines[i].slice(lines[i].indexOf(':') + 1).split(',').map((a) => a.trim()).filter(Boolean);
  if (!members.includes(account)) members.push(account);
  lines[i] = `${group}: ${members.join(', ')}`;
  return lines.join('\n');
}

/** Groups text with `account` taken out of every group (a group left empty goes) and put in `group` ('' for none). */
function withAccountMoved(text, account, group) {
  const lines = String(text || '').split('\n').filter((l) => l.trim()).map((l) => {
    const i = l.indexOf(':');
    if (i < 0) return l;
    const members = l.slice(i + 1).split(',').map((a) => a.trim()).filter((a) => a && a !== account);
    return members.length ? `${l.slice(0, i).trim()}: ${members.join(', ')}` : null;
  }).filter(Boolean).join('\n');
  return group ? withAccountInGroup(lines, group, account) : lines;
}
/** The group an account is in ('' when none; the first, when it is in several). */
const groupOf = (text, account) => (parseGroups(text).find((g) => g.accounts.includes(account)) || {}).name || '';

/** Accounts whose type is Demo (accountInfo[name].kind = 'demo'): practice and contest accounts, left out of every
 *  All-accounts total — the lobby, dashboard, career stats, rank and challenge tracker. They still show alone and
 *  in their groups. */
const demoAccountsOf = (accountInfo) => new Set(Object.entries(accountInfo || {}).filter(([, i]) => i && i.kind === 'demo').map(([a]) => a));
// the plugin sets this from its settings, for the code that is not given them (filterScope, scopeAccounts)
let demoAccountsNow = () => new Set();

/** scope: 'all' | 'account:<name>' | 'group:<name>'. All leaves Demo accounts out. */
function filterScope(trades, scope, groups) {
  if (scope.startsWith('account:')) return trades.filter((t) => accountName(t) === scope.slice(8));
  if (scope.startsWith('group:')) {
    const g = groups.find((x) => x.name === scope.slice(6));
    const set = new Set(g ? g.accounts : []);
    return trades.filter((t) => set.has(accountName(t)));
  }
  const demo = demoAccountsNow();
  return demo.size ? trades.filter((t) => !demo.has(accountName(t))) : trades;
}

const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** period: 'all' | 'month' | 'week' (Monday start) | 'last' (latest date that has trades) */
/** A period is one of PERIODS, or "range:<from>:<to>" for dates picked by hand (both days included). */
const PERIODS = { all: 'All time', today: 'Today', yesterday: 'Yesterday', week: 'This week', lastWeek: 'Last week', month: 'This month', lastMonth: 'Last month', year: 'This year', last: 'Last session', range: 'Custom dates…' };

/** { from, to } of a picked date range, or null. */
function parseRange(period) {
  const m = /^range:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/.exec(period || '');
  if (!m) return null;
  return m[1] <= m[2] ? { from: m[1], to: m[2] } : { from: m[2], to: m[1] };
}

/** The first and last day of a period ({ from, to }, both included), or null when it has no days. */
function periodBounds(period, trades, today = new Date()) {
  const picked = parseRange(period);
  if (picked) return picked;
  const day = (y, m, d) => isoDay(new Date(y, m, d));
  const y = today.getFullYear(), m = today.getMonth(), d = today.getDate(), monday = d - ((today.getDay() + 6) % 7);
  if (period === 'today') return { from: isoDay(today), to: isoDay(today) };
  if (period === 'yesterday') return { from: day(y, m, d - 1), to: day(y, m, d - 1) };
  if (period === 'week') return { from: day(y, m, monday), to: day(y, m, monday + 6) };
  if (period === 'lastWeek') return { from: day(y, m, monday - 7), to: day(y, m, monday - 1) };
  if (period === 'month') return { from: day(y, m, 1), to: day(y, m + 1, 0) };
  if (period === 'lastMonth') return { from: day(y, m - 1, 1), to: day(y, m, 0) };
  if (period === 'year') return { from: day(y, 0, 1), to: day(y, 11, 31) };
  const dates = trades.map((t) => t.date).filter(Boolean).sort();
  if (!dates.length) return null;
  if (period === 'last') return { from: dates[dates.length - 1], to: dates[dates.length - 1] };
  return { from: dates[0], to: dates[dates.length - 1] };
}

function filterPeriod(trades, period, today = new Date()) {
  if (!period || period === 'all') return trades;
  const b = periodBounds(period, trades, today);
  return b ? trades.filter((t) => t.date >= b.from && t.date <= b.to) : [];
}

function periodLabel(period, trades) {
  const picked = parseRange(period);
  if (picked) return picked.from === picked.to ? picked.from : `${picked.from} → ${picked.to}`;
  if (!trades.length) return PERIODS[period];
  const dates = trades.map((t) => t.date).sort();
  const range = dates[0] === dates[dates.length - 1] ? dates[0] : `${dates[0]} → ${dates[dates.length - 1]}`;
  return period === 'all' ? range : `${PERIODS[period]} · ${range}`;
}

