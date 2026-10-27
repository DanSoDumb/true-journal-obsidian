// ---------- rank, level and achievements (the lobby) ----------
//
// Rank points (RP, 0-1000) are computed from the most recent RANK_WINDOW trades, so the rank follows current
// form instead of all-time history. Five parts, each with a fixed maximum; rankParts() below is the single
// definition, and the same numbers are shown on the lobby and drawn as a tree in the Logic tree screen.

const RANK_WINDOW = 100;
const RANK_MIN_TRADES = 10;
// Iron to Diamond have three divisions each (III lowest, I highest);
// Master, Grandmaster and Challenger have none.
const TIERS = [
  { name: 'Iron', from: 0, color: '#7b7f87' },
  { name: 'Bronze', from: 150, color: '#b0703f' },
  { name: 'Silver', from: 280, color: '#9fb0c0' },
  { name: 'Gold', from: 400, color: '#dfae3a' },
  { name: 'Platinum', from: 510, color: '#37b7a6' },
  { name: 'Emerald', from: 610, color: '#2fbe6f' },
  { name: 'Diamond', from: 700, color: '#6c8cff' },
  { name: 'Master', from: 800, color: '#b05cff', apex: true },
  { name: 'Grandmaster', from: 870, color: '#ff4f5e', apex: true },
  { name: 'Challenger', from: 940, color: '#f2c94c', apex: true },
];
const DIVISIONS = ['III', 'II', 'I']; // lowest to highest
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const scale = (x, zeroAt, fullAt) => clamp01((x - zeroAt) / (fullAt - zeroAt));

/** Score -> tier, division and the next threshold to reach. */
function rankFromScore(score) {
  const i = Math.max(0, TIERS.filter((t) => t.from <= score).length - 1);
  const tier = TIERS[i];
  const upper = TIERS[i + 1];
  const nameOf = (t) => (t.apex ? t.name : `${t.name} ${DIVISIONS[0]}`);
  if (tier.apex) {
    return { tier: tier.name, color: tier.color, division: '', apex: true, label: tier.name, floor: tier.from, next: upper ? upper.from : null, nextLabel: upper ? upper.name : '' };
  }
  // division boundaries are whole numbers, so the score shown and the boundary shown always agree
  const step = (upper.from - tier.from) / DIVISIONS.length;
  const starts = DIVISIONS.map((_, k) => Math.round(tier.from + step * k));
  const d = starts.filter((from) => from <= score).length - 1;
  const last = d === DIVISIONS.length - 1;
  return {
    tier: tier.name, color: tier.color, division: DIVISIONS[d], apex: false, label: `${tier.name} ${DIVISIONS[d]}`,
    floor: starts[d], next: last ? upper.from : starts[d + 1],
    nextLabel: last ? nameOf(upper) : `${tier.name} ${DIVISIONS[d + 1]}`,
  };
}

// ---- streaks ----

const isWeekday = (d) => d.getDay() >= 1 && d.getDay() <= 5;
const dayAt = (iso) => new Date(`${iso}T12:00:00`);
function stepWeekday(d, dir) {
  const x = new Date(d);
  do x.setDate(x.getDate() + dir); while (!isWeekday(x));
  return x;
}

/** Run of consecutive weekdays in `dates` (a Set of YYYY-MM-DD). Weekends never break a run, and today does not
 *  break it either while it is still empty. Returns the current run and the longest one. */
function dayStreak(dates, today = new Date()) {
  let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  if (!isWeekday(cursor) || !dates.has(isoDay(cursor))) cursor = stepWeekday(cursor, -1);
  let cur = 0;
  while (dates.has(isoDay(cursor))) {
    cur++;
    cursor = stepWeekday(cursor, -1);
  }
  let best = 0, run = 0, prev = null;
  for (const iso of [...dates].filter((x) => isWeekday(dayAt(x))).sort()) {
    run = prev && isoDay(stepWeekday(dayAt(prev), 1)) === iso ? run + 1 : 1;
    best = Math.max(best, run);
    prev = iso;
  }
  return { cur, best: Math.max(best, cur) };
}

/** Run of consecutive weeks in `weeks` (a Set of Monday dates). The current week only counts once it is in the
 *  set, so an unfinished week does not break the run. */
function weekStreak(weeks, today = new Date()) {
  const cursor = dayAt(mondayOf(isoDay(today)));
  if (!weeks.has(isoDay(cursor))) cursor.setDate(cursor.getDate() - 7);
  let cur = 0;
  while (weeks.has(isoDay(cursor))) {
    cur++;
    cursor.setDate(cursor.getDate() - 7);
  }
  let best = 0, run = 0, prev = null;
  for (const iso of [...weeks].sort()) {
    const expected = prev ? new Date(dayAt(prev).getTime() + 7 * 86400000) : null;
    run = expected && isoDay(expected) === iso ? run + 1 : 1;
    best = Math.max(best, run);
    prev = iso;
  }
  return { cur, best: Math.max(best, cur) };
}

/** Every streak the lobby shows and the rank counts:
 *  journal = weekdays in a row with at least one trade logged; review = newest trades in a row that are reviewed;
 *  gym = weeks in a row on the gym target; combo = weeks in a row on BOTH the gym and the journal-day targets;
 *  green = profitable days in a row. */
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** One point per trading day, oldest first: the day's net P&L and the running total. */
function dailySeries(trades) {
  let cum = 0;
  return [...dailyResults(trades)].sort(([a], [b]) => a.localeCompare(b)).map(([date, d]) => ({ date, pnl: d.pnl, cum: (cum += d.pnl) }));
}

const DURATION_BUCKETS = [
  ['Under 15 sec', 15], ['15-45 sec', 45], ['45 sec - 1 min', 60], ['1 - 2 min', 120], ['2 - 5 min', 300], ['5 - 10 min', 600],
  ['10 - 30 min', 1800], ['30 min - 1 hour', 3600], ['1 - 2 hours', 7200], ['2 - 4 hours', 14400], ['4 hours and up', Infinity],
];

/** Trades that carry a duration, sorted into time-in-trade buckets: how many, and how often they won. */
function durationBuckets(trades) {
  const rows = DURATION_BUCKETS.map(([label]) => ({ label, count: 0, wins: 0, net: 0 }));
  let timed = 0;
  for (const t of trades) {
    if (!(t.duration > 0)) continue;
    timed++;
    const row = rows[DURATION_BUCKETS.findIndex(([, under]) => t.duration < under)];
    row.count++;
    row.net += netPnl(t);
    if (netPnl(t) > 0) row.wins++;
  }
  return { timed, rows: rows.map((r) => ({ ...r, winRate: r.count ? (r.wins / r.count) * 100 : null })) };
}

/** A year of gym days for the heatmap: the same grid as activityGrid, with a day's shade set by how long you
 *  trained (under 30 min, under 45, under 60, an hour or more). */
function gymGrid(sessions, today = new Date()) {
  const minutesOn = new Map();
  for (const g of sessions) minutesOn.set(g.date, (minutesOn.get(g.date) || 0) + (Number(g.minutes) || 0));
  const grid = activityGrid([], sessions, today);
  for (const week of grid.weeks) {
    for (const day of week) {
      day.minutes = minutesOn.get(day.date) || 0;
      day.level = day.future || !day.gym ? 0 : day.minutes >= 60 ? 4 : day.minutes >= 45 ? 3 : day.minutes >= 30 ? 2 : 1;
    }
  }
  return grid;
}

/** A year of days laid out like a contribution graph: one column per week (Monday on top), ending with the
 *  current week. A day's level (0-4) is how much was logged on it: trades journaled plus gym sessions.
 *  Also returns where each month's label goes, and the run of active weekdays (weekends never break it). */
function activityGrid(trades, gymSessions, today = new Date(), weekCount = 53) {
  const tradesOn = new Map(), gymOn = new Map();
  for (const t of trades) tradesOn.set(t.date, (tradesOn.get(t.date) || 0) + 1);
  for (const g of gymSessions) gymOn.set(g.date, (gymOn.get(g.date) || 0) + 1);
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const start = dayAt(mondayOf(isoDay(end)));
  start.setDate(start.getDate() - (weekCount - 1) * 7);
  const weeks = [], months = [];
  let activeDays = 0, total = 0, lastMonth = -1;
  for (let w = 0; w < weekCount; w++) {
    const days = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d, 12);
      const date = isoDay(day);
      const tradeCount = tradesOn.get(date) || 0, gymCount = gymOn.get(date) || 0;
      const count = tradeCount + gymCount;
      const future = day > end;
      if (!future && count) { activeDays++; total += count; }
      days.push({ date, trades: tradeCount, gym: gymCount, level: future ? 0 : Math.min(4, count), future });
    }
    weeks.push(days);
    const month = dayAt(days[0].date).getMonth();
    if (month !== lastMonth) {
      // a label needs room for three letters: skip one that would sit right against the previous label
      if (!months.length || w - months[months.length - 1].week >= 3) months.push({ week: w, month });
      lastMonth = month;
    }
  }
  const active = new Set([...tradesOn.keys(), ...gymOn.keys()]);
  return { weeks, months, activeDays, total, streak: dayStreak(active, today) };
}

function computeStreaks(trades, gymSessions, gymTarget, journalTarget, today = new Date()) {
  const tradeDays = new Set(trades.map((t) => t.date));
  const weeksWith = (dates, target) => {
    const perWeek = new Map();
    for (const d of dates) perWeek.set(mondayOf(d), (perWeek.get(mondayOf(d)) || 0) + 1);
    return new Set([...perWeek].filter(([, n]) => n >= target).map(([w]) => w));
  };
  const gymWeeks = weeksWith(gymSessions.map((g) => g.date), gymTarget);
  const journalWeeks = weeksWith([...tradeDays], journalTarget);
  const comboWeeks = new Set([...gymWeeks].filter((w) => journalWeeks.has(w)));
  const newestFirst = [...trades].sort(byTime).reverse();
  let review = 0;
  while (review < newestFirst.length && newestFirst[review].reviewed) review++;
  const days = [...dailyResults(trades)].sort((a, b) => a[0].localeCompare(b[0])).map(([, d]) => d.pnl);
  let green = 0, bestGreen = 0, run = 0;
  for (const p of days) { run = p > 0 ? run + 1 : 0; bestGreen = Math.max(bestGreen, run); }
  for (let k = days.length - 1; k >= 0 && days[k] > 0; k--) green++;
  return {
    journal: dayStreak(tradeDays, today),
    review: { cur: review, best: review },
    gym: weekStreak(gymWeeks, today),
    combo: weekStreak(comboWeeks, today),
    green: { cur: green, best: bestGreen },
  };
}

// Streak points: each streak has a share of STREAK_MAX and a length at which it pays in full.
const STREAK_RULES = [
  { key: 'journal', label: 'Journal streak', unit: 'day', max: 60, fullAt: 20, how: 'weekdays in a row with a trade logged' },
  { key: 'review', label: 'Review streak', unit: 'trade', max: 40, fullAt: 20, how: 'newest trades in a row that are reviewed' },
  { key: 'gym', label: 'Gym streak', unit: 'week', max: 50, fullAt: 8, how: 'weeks in a row on the gym target' },
  { key: 'combo', label: 'Combo streak', unit: 'week', max: 50, fullAt: 4, how: 'weeks in a row on both the gym and journal targets' },
];
const streakPoints = (rule, streaks) => Math.round(rule.max * clamp01(streaks[rule.key].cur / rule.fullAt));

// Penalties come off the rank points. Each rule has its own ceiling and the total never takes more than PENALTY_CAP.
const PENALTY_CAP = 240;
const PENALTY_RULES = {
  overtrade: { per: 5, max: 40 },   // per day with more trades than the daily limit
  risk: { per: 4, max: 40, r: -1.5 }, // per trade that lost 1.5R or more: the stop was not honoured
  blown: { funded: 80, eval: 30, max: 160, days: 90 }, // per account blown in the last 90 days
};

/** What breaking the rules costs, from the same window of trades the rank uses.
 *  rules: { accountInfo, accounts, maxTradesPerDay }. Returns { total, items: [{ key, count, points, text }] }. */
function rankPenalties(trades, rules, today = new Date()) {
  const sample = [...trades].sort(byTime).slice(-RANK_WINDOW);
  const items = [];
  const limit = Math.round(Number(rules.maxTradesPerDay));
  if (limit > 0) {
    const perDay = new Map();
    for (const t of sample) perDay.set(t.date, (perDay.get(t.date) || 0) + 1);
    const days = [...perDay.values()].filter((k) => k > limit).length;
    if (days) items.push({ key: 'overtrade', count: days, points: Math.min(PENALTY_RULES.overtrade.max, days * PENALTY_RULES.overtrade.per), text: `Overtrading: ${days} day${days === 1 ? '' : 's'} over ${limit} trades` });
  }
  const broken = sample.filter((t) => { const r = rMultiple(t); return r !== null && r <= PENALTY_RULES.risk.r; }).length;
  if (broken) items.push({ key: 'risk', count: broken, points: Math.min(PENALTY_RULES.risk.max, broken * PENALTY_RULES.risk.per), text: `Risk rule: ${broken} trade${broken === 1 ? '' : 's'} lost 1.5R or more` });
  const since = new Date(today.getFullYear(), today.getMonth(), today.getDate() - PENALTY_RULES.blown.days, 12);
  let funded = 0, evals = 0;
  for (const a of rules.accounts || []) {
    const st = accountStatus(a, trades, rules.accountInfo);
    if (!st.blown || dayAt(st.blownOn) < since) continue;
    if (accountKind(a, rules.accountInfo) === 'funded') funded++; else evals++;
  }
  if (funded || evals) {
    const what = [funded ? `${funded} funded` : '', evals ? `${evals} eval` : ''].filter(Boolean).join(', ');
    items.push({ key: 'blown', count: funded + evals, points: Math.min(PENALTY_RULES.blown.max, funded * PENALTY_RULES.blown.funded + evals * PENALTY_RULES.blown.eval), text: `Blown accounts: ${what}` });
  }
  return { total: Math.min(PENALTY_CAP, sum(items.map((x) => x.points))), items };
}

function rankParts(trades, streaks, rules) {
  const sample = [...trades].sort(byTime).slice(-RANK_WINDOW);
  const n = sample.length;
  const st = computeStats(sample);
  const pnl = sample.map(netPnl);
  const grossWin = sum(pnl.filter((p) => p > 0));
  const pf = st.profitFactor === null ? (grossWin > 0 ? 3 : 0) : st.profitFactor;
  const days = [...dailyResults(sample).values()];
  const greenRate = days.length ? days.filter((d) => d.pnl > 0).length / days.length : 0;
  const stopRate = n ? sample.filter((t) => t.stop !== null).length / n : 0;
  const ddShare = grossWin > 0 ? st.maxDrawdown / grossWin : 1;
  const reviewedRate = n ? sample.filter((t) => t.reviewed).length / n : 0;
  const cleanRate = n ? sample.filter((t) => !t.mistakes.length).length / n : 0;
  const pct = (x) => `${Math.round(x * 100)}%`;

  // Edge: profit factor always counts; average R only when trades carry a stop, otherwise PF takes its share.
  // A good ratio over a handful of trades is mostly luck, so edge only counts in full from EDGE_FULL_AT trades.
  const EDGE_FULL_AT = 50;
  const confidence = clamp01(n / EDGE_FULL_AT);
  const edge = confidence * (st.avgR === null ? 260 * scale(pf, 1, 2.5) : 170 * scale(pf, 1, 2.5) + 90 * scale(st.avgR, 0, 0.5));
  const parts = [
    { key: 'edge', label: 'Edge', max: 260, points: edge,
      detail: `Profit factor ${pf.toFixed(2)} (full at 2.50)${st.avgR === null ? '' : ` · average ${st.avgR.toFixed(2)}R (full at 0.50R)`}${n < EDGE_FULL_AT ? ` · counted at ${pct(confidence)} until ${EDGE_FULL_AT} trades` : ''}` },
    { key: 'consistency', label: 'Consistency', max: 160, points: 100 * scale(greenRate, 0.35, 0.7) + 60 * scale(st.winRate, 35, 60),
      detail: `${pct(greenRate)} green days (full at 70%) · ${st.winRate.toFixed(0)}% win rate (full at 60%)` },
    { key: 'risk', label: 'Risk control', max: 160, points: 60 * stopRate + 100 * clamp01(1 - ddShare / 0.5),
      detail: `${pct(stopRate)} of trades have a stop · worst drawdown is ${pct(Math.min(ddShare, 9.99))} of gross wins (zero at 50%)` },
    { key: 'discipline', label: 'Discipline', max: 140, points: 90 * reviewedRate + 50 * cleanRate,
      detail: `${pct(reviewedRate)} of trades reviewed · ${pct(cleanRate)} without a tagged mistake` },
    { key: 'streaks', label: 'Streaks', max: sum(STREAK_RULES.map((r) => r.max)), points: sum(STREAK_RULES.map((r) => streakPoints(r, streaks))),
      detail: STREAK_RULES.map((r) => `${r.label.replace(' streak', '')} ${streaks[r.key].cur}/${r.fullAt} ${r.unit}s → ${streakPoints(r, streaks)}`).join(' · ') },
    { key: 'volume', label: 'Volume', max: 80, points: 80 * clamp01(n / RANK_WINDOW),
      detail: `${n} of ${RANK_WINDOW} trades in the window` },
  ].map((p) => ({ ...p, points: Math.round(p.points) }));
  // rule breaks take points off; without `rules` (no account data to judge by) nothing is deducted
  if (rules) {
    const penalties = rankPenalties(trades, rules);
    parts.push({ key: 'penalties', label: 'Penalties', max: PENALTY_CAP, points: -penalties.total, penalty: true,
      detail: penalties.items.length ? penalties.items.map((x) => `${x.text} → −${x.points}`).join(' · ') : 'No rule breaks: nothing deducted' });
  }
  return { n, parts, score: Math.max(0, sum(parts.map((p) => p.points))) };
}

function computeRank(trades, streaks, rules) {
  const { n, parts, score } = rankParts(trades, streaks, rules);
  if (n < RANK_MIN_TRADES) return { ranked: false, need: RANK_MIN_TRADES - n, n, parts, score, tier: 'Unranked', color: '#7a7f8a', division: '', apex: false, label: 'Unranked', floor: 0, next: null, nextLabel: '' };
  return { ranked: true, need: 0, n, parts, score, ...rankFromScore(score) };
}

/** XP is all-time activity, not results: logging, reviewing, training. Level L -> L+1 costs 100 x L XP. */
function computeLevel(trades, gymCount) {
  const greenDays = [...dailyResults(trades).values()].filter((d) => d.pnl > 0).length;
  const xp = trades.length * 10 + trades.filter((t) => t.reviewed).length * 15 + gymCount * 20 + greenDays * 5;
  let level = 1;
  let left = xp;
  while (left >= level * 100) {
    left -= level * 100;
    level++;
  }
  return { xp, level, into: left, need: level * 100 };
}

/** Current run of wins (+n) or losses (-n), newest trade last. */
function currentStreak(trades) {
  const sorted = [...trades].sort(byTime).map(netPnl).filter((p) => p !== 0);
  if (!sorted.length) return 0;
  const sign = Math.sign(sorted[sorted.length - 1]);
  let k = 0;
  for (let i = sorted.length - 1; i >= 0 && Math.sign(sorted[i]) === sign; i--) k++;
  return sign * k;
}

function achievements(trades, gymSessions, streaks) {
  const reviewed = trades.filter((t) => t.reviewed).length;
  const bestR = Math.max(0, ...trades.map(rMultiple).filter((r) => r !== null));
  const withChart = trades.filter((t) => t.chart).length;
  const list = [
    ['First trade', 'Log your first trade', trades.length, 1],
    ['Century', 'Log 100 trades', trades.length, 100],
    ['Honest eyes', 'Review 10 trades', reviewed, 10],
    ['Nothing unreviewed', 'Review 50 trades', reviewed, 50],
    ['On a roll', 'Journal 10 weekdays in a row', streaks.journal.best, 10],
    ['Unbroken', 'Journal 20 weekdays in a row', streaks.journal.best, 20],
    ['Green streak', '5 green days in a row', streaks.green.best, 5],
    ['Sniper', 'Close a trade at 3R or better', bestR >= 3 ? 1 : 0, 1],
    ['Chartist', 'Draw a chart for 10 trades', withChart, 10],
    ['Gym rat', 'Log 20 gym sessions', gymSessions, 20],
    ['Iron habit', 'Hit the gym target 4 weeks in a row', streaks.gym.best, 4],
    ['Double duty', 'Hit gym and journal targets 4 weeks in a row', streaks.combo.best, 4],
  ];
  return list.map(([name, how, have, need]) => ({ name, how, have: Math.min(have, need), need, done: have >= need }));
}

/** The rank formula as a tree, for the Logic tree screen. */
function rankTree() {
  const leaf = (text) => ({ text, children: [] });
  return [{ text: `Rank points (0–1000), last ${RANK_WINDOW} trades`, children: [
    { text: 'Edge · 260', children: [leaf('Profit factor: 0 at 1.00 → 170 at 2.50'), leaf('Average R: 0 at 0R → 90 at 0.50R'), leaf('No stops on trades: profit factor counts for all 260'), leaf('Under 50 trades: edge is scaled by trades ÷ 50')] },
    { text: 'Consistency · 160', children: [leaf('Green days: 0 at 35% → 100 at 70%'), leaf('Win rate: 0 at 35% → 60 at 60%')] },
    { text: 'Risk control · 160', children: [leaf('Trades with a stop: up to 60'), leaf('Worst drawdown vs gross wins: 100 at 0% → 0 at 50%')] },
    { text: 'Discipline · 140', children: [leaf('Trades reviewed: up to 90'), leaf('Trades without a tagged mistake: up to 50')] },
    { text: `Streaks · ${sum(STREAK_RULES.map((r) => r.max))}`, children: STREAK_RULES.map((r) => leaf(`${r.label}: ${r.max} at ${r.fullAt} ${r.unit}s — ${r.how}`)) },
    { text: 'Volume · 80', children: [leaf(`Trades in the window: 80 at ${RANK_WINDOW}`)] },
    { text: `Penalties · up to −${PENALTY_CAP}`, children: [
      leaf(`Overtrading: −${PENALTY_RULES.overtrade.per} per day over the daily trade limit (up to −${PENALTY_RULES.overtrade.max})`),
      leaf(`Risk rule: −${PENALTY_RULES.risk.per} per trade that lost 1.5R or more (up to −${PENALTY_RULES.risk.max})`),
      leaf(`Blown funded account: −${PENALTY_RULES.blown.funded} each, for ${PENALTY_RULES.blown.days} days`),
      leaf(`Blown eval account: −${PENALTY_RULES.blown.eval} each, for ${PENALTY_RULES.blown.days} days (blown accounts up to −${PENALTY_RULES.blown.max})`),
    ] },
    { text: 'Tiers', children: TIERS.map((t) => leaf(`${t.name} from ${t.from}${t.apex ? '' : ' (III → I)'}`)) },
  ] }];
}

