// ---------- prop firm challenges ----------
//
// A challenge is a firm's program at one account size, with its steps in order (evaluation → sim funded → live) and
// the rules of each step. Challenges come from the list built into the plugin, PROP_FIRMS (end of this file):
// { firms: [{ name, challenges: [{ id, name, size, notes, steps: [{ name, stage, start, rules }] }] }] }.
// An account keeps a copy of its current step's rules (accountInfo[name].rules), so a newer list does not change
// past accounts. Rule fields:
//   target · maxLoss + drawdown ('static' | 'eod' trails the best end-of-day balance | 'intraday' trails the best
//   closed-trade balance) + lockAt (the line stops trailing at start + lockAt) · dailyLoss + dailyHard (fails the
//   account; otherwise it only ends the day) with dailyAfter { profitPct, amount }, dailyTiers [{ profit, amount }],
//   dailyScale { atBalance, pctOfPeakProfit } · minDays · minProfitableDays { days, minProfit } · consistency
//   (+ consistencyCushion) · maxContracts / initialContracts / sizeTiers [{ profit, max }] / profitPerContract /
//   maxContractsCap, counted in minis (microsPerContract micros = 1) · reviewDayProfit · payout (funded steps; see
//   payoutCheck): cycle { kind: qualifying_days | trading_days | calendar_days | none, days, minimumDailyProfit,
//   anchor }, availability { kind: profit_above_starting_balance | profit_above_balance_floor, balanceFloor,
//   requestPercent }, minimumRequest, maximumRequest { kind: fixed | schedule | none, amount, amounts, repeatLast },
//   profitSplit { percent }, afterPayout { balanceAction: deduct_request | reset_to_starting_balance, drawdownAction:
//   lock_at_balance (at start + drawdownFloor) | unchanged | reset_from_starting_balance, resetCycle,
//   maximumPayoutOutcome }, and optionally maxBestDayPercent(Schedule), minimumCycleProfit(Schedule),
//   firstPayoutCycleProfitExempt, requirePositiveCycleProfitAfterFirst, minimumBalance, maximumPayouts,
//   minimumElapsedHours, newProfitPercentOfRequest.

const DRAWDOWN_LABELS = { static: 'Fixed from the start', eod: 'Trailing, end of day', intraday: 'Trailing, intraday (closed trades)' };
const STAGE_LABELS = { evaluation: 'Evaluation', sim_funded: 'Sim funded', live_funded: 'Live funded' };
const MICRO_ROOTS = new Set(['MNQ', 'MES', 'MYM', 'M2K', 'MCL', 'MGC', 'SIL', 'MBT', 'MET', 'M6E']);
const sizeLabel = (n) => (n >= 1000 ? `${Math.round(n / 100) / 10}K` : String(n));
const positive = (v) => { const n = Number(v); return v !== null && v !== '' && v !== undefined && Number.isFinite(n) && n > 0 ? n : null; };
const stageKind = (stage) => (stage === 'evaluation' ? 'eval' : 'funded');
/** Obsidian's text fields only accept text (numbers are ignored), so every value goes in as a string. */
const fieldText = (v) => (v === null || v === undefined ? '' : String(v));

// Each firm's logo (an image URL), by its name on the list; filled from art/firm when the plugin loads (loadBundledArt).
let FIRM_LOGOS = {};

/** A challenge's plan: its name without the account size ("50K Trading Combine · DLL Off" -> "Trading Combine · DLL Off"). */
const planName = (ch) => String(ch.name).replace(/(^|\s)\$?\d+(?:\.\d+)?K(?=\s|$)/i, ' ').replace(/\s{2,}/g, ' ').replace(/^[\s·]+|[\s·]+$/g, '').trim() || 'Standard';
/** The funded paths that share a challenge's evaluation: the challenge itself (Standard) and the ones named
 *  "<its name> · <path>" at the same size with the same evaluation steps. Topstep's XFA Consistency payout path is
 *  one: it is chosen at activation, after the Combine is passed, so it is not a plan of its own. */
function fundedPaths(firm, ch) {
  const evals = (c) => JSON.stringify(c.steps.filter((st) => st.stage === 'evaluation'));
  const all = (firm && firm.challenges) || [];
  const sibling = (base, c) => c !== base && c.size === base.size && c.name.startsWith(`${base.name} · `) && evals(base) !== '[]' && evals(c) === evals(base);
  const base = all.find((c) => sibling(c, ch)) || ch;
  return [{ name: 'Standard', challenge: base }, ...all.filter((c) => sibling(base, c)).map((c) => ({ name: c.name.slice(base.name.length + 3), challenge: c }))];
}

/** A firm's plans in the list's order, each with its account sizes smallest first: [{ name, challenges }]. A funded
 *  path (see fundedPaths) stays with the plan it follows. */
function firmPlans(firm) {
  const plans = new Map();
  for (const ch of ((firm && firm.challenges) || []).filter((c) => fundedPaths(firm, c)[0].challenge === c)) {
    const name = planName(ch);
    if (!plans.has(name)) plans.set(name, []);
    plans.get(name).push(ch);
  }
  return [...plans].map(([name, challenges]) => ({ name, challenges: [...challenges].sort((a, b) => a.size - b.size) }));
}
/** "12 plans · $25K to $150K": how many challenges a firm has, and its smallest and largest account. */
function firmSummary(firm) {
  const sizes = firmPlans(firm).flatMap((x) => x.challenges).map((c) => c.size).filter((n) => n > 0);
  if (!sizes.length) return '';
  const lo = Math.min(...sizes), hi = Math.max(...sizes);
  const count = `${sizes.length} ${sizes.length === 1 ? 'plan' : 'plans'}`;
  return lo === hi ? `${count} · $${sizeLabel(lo)}` : `${count} · $${sizeLabel(lo)} to $${sizeLabel(hi)}`;
}
/** The balance a funded step needs before its first payout can be requested, or null when it has no payout rules:
 *  the payout floor (or the start) plus the minimum request, grossed up when only part of the profit can be taken,
 *  and never under the firm's minimum balance or the start plus the cycle's minimum profit. */
function firstPayoutBalance(step) {
  const policy = step && step.rules && step.rules.payout;
  if (!policy) return null;
  const start = Number(step.start) || 0;
  const a = policy.availability || {};
  const floor = a.kind === 'profit_above_balance_floor' && Number.isFinite(Number(a.balanceFloor)) ? Number(a.balanceFloor) : start;
  const share = (Number(a.requestPercent) || 100) / 100;
  const minCycle = policy.minimumCycleProfitSchedule ? nthOf(policy.minimumCycleProfitSchedule.amounts, 1, policy.minimumCycleProfitSchedule.repeatLast) : positive(policy.minimumCycleProfit);
  return Math.max(floor + (Number(policy.minimumRequest) || 0) / share, positive(policy.minimumBalance) || 0, start + (minCycle || 0));
}

/** The first funded step of a challenge (the one "Log funded" starts on), or -1 when it has none. */
const fundedStep = (ch) => ch.steps.findIndex((st) => st.stage !== 'evaluation');

/** { firm, challenge } for a catalog challenge id, or null. */
function catalogChallenge(catalog, id) {
  for (const firm of (catalog && catalog.firms) || []) for (const challenge of firm.challenges || []) if (challenge.id === id) return { firm, challenge };
  return null;
}
/** A step of a catalog challenge -> the rule set an account keeps. */
function rulesFromStep(firm, challenge, index) {
  const step = challenge.steps[index];
  return { ...step.rules, firm: firm.name, challenge: challenge.name, challengeId: challenge.id, step: index, stepName: step.name,
    stage: step.stage, size: challenge.size, steps: challenge.steps.map((s) => s.name) };
}
/** The daily loss limit for a day that starts at `dayStart`; it can change with profit (dailyAfter, dailyTiers, dailyScale). */
function dailyLimitFor(rules, start, dayStart, peakEodProfit) {
  let limit = positive(rules.dailyLoss);
  if (!limit) return null;
  const profit = dayStart - start;
  if (rules.dailyAfter && profit >= ((positive(rules.size) || start) * rules.dailyAfter.profitPct) / 100) limit = rules.dailyAfter.amount;
  for (const t of rules.dailyTiers || []) if (profit >= t.profit) limit = t.amount;
  if (rules.dailyScale && dayStart >= rules.dailyScale.atBalance && peakEodProfit > 0) limit = (peakEodProfit * rules.dailyScale.pctOfPeakProfit) / 100;
  return limit;
}
/** The most contracts (minis) allowed at this profit, or null when the step has no size rule. */
function maxContractsFor(rules, profit) {
  if (rules.sizeTiers && rules.sizeTiers.length) {
    let max = positive(rules.initialContracts) || positive(rules.maxContracts);
    for (const t of rules.sizeTiers) if (profit >= t.profit) max = t.max;
    return max || null;
  }
  if (positive(rules.profitPerContract)) {
    const max = (positive(rules.initialContracts) || 1) + Math.floor(Math.max(0, profit) / rules.profitPerContract);
    return positive(rules.maxContractsCap) ? Math.min(max, rules.maxContractsCap) : max;
  }
  return positive(rules.maxContracts) || positive(rules.initialContracts) || null;
}
const contractsIn = (t, rules) => (MICRO_ROOTS.has(String(t.symbol || '').toUpperCase()) ? t.qty / (positive(rules.microsPerContract) || 10) : t.qty);

// The payouts recorded in the settings; the plugin points this at them when it loads, and challengeStatus reads them.
let payoutsSource = () => [];
/** What a payout paid you: `received` (after the firm's split) when it was requested here, else the amount typed in. */
const payoutReceived = (p) => (Number.isFinite(p.received) ? p.received : Number(p.amount) || 0);
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const nthOf = (list, n, repeatLast) => (!list || !list.length ? null : n <= list.length ? list[n - 1] : repeatLast === false ? null : list[list.length - 1]);

/** A funded step's payout rules: the account's own copy, or the list's for accounts set up before it had them. */
function payoutPolicyOf(rules) {
  if (!rules || rules.stage === 'evaluation') return null;
  if (rules.payout) return rules.payout;
  const found = rules.challengeId ? catalogChallenge(PROP_FIRMS, rules.challengeId) : null;
  const step = found && found.challenge.steps[rules.step || 0];
  return (step && step.stage !== 'evaluation' && step.rules.payout) || null;
}

/** Whether a funded account can take a payout now, and how much. s: { start, balance, days (Map date -> P&L),
 *  cycleStart (first day of this payout cycle, '' = from the start), paidCount, lastPayout, firstTrade, today }. */
function payoutCheck(policy, s) {
  const nth = s.paidCount + 1;
  const cycle = [...s.days].filter(([d]) => !s.cycleStart || d >= s.cycleStart).sort((a, b) => a[0].localeCompare(b[0]));
  const cycleNet = sum(cycle.map(([, v]) => v));
  const checks = [];
  const check = (label, value, ok, calc, more) => checks.push({ label, value, ok: !!ok, ...(calc ? { calc } : {}), ...(more || {}) });
  const c = policy.cycle || { kind: 'none' };
  if (c.kind === 'qualifying_days') {
    const n = cycle.filter(([, v]) => v >= (Number(c.minimumDailyProfit) || 0.01)).length;
    check(`Winning days (${money(Number(c.minimumDailyProfit) || 0)}+)`, `${n} of ${c.days}`, n >= c.days, null, { need: Math.max(0, c.days - n), unit: 'winning', min: money(Number(c.minimumDailyProfit) || 0) });
  } else if (c.kind === 'trading_days') check('Trading days', `${cycle.length} of ${c.days}`, cycle.length >= c.days, null, { need: Math.max(0, c.days - cycle.length), unit: 'trading' });
  else if (c.kind === 'calendar_days') {
    const from = c.anchor === 'first_trade' ? (cycle.length ? cycle[0][0] : '') : s.cycleStart || s.firstTrade;
    const n = from ? Math.max(0, daysBetween(from, s.today)) : 0;
    check('Days in this cycle', `${n} of ${c.days}`, !!from && n >= c.days, null, { need: Math.max(0, c.days - n), unit: 'calendar' });
  }
  const pct = policy.maxBestDayPercentSchedule ? nthOf(policy.maxBestDayPercentSchedule.percents, nth, policy.maxBestDayPercentSchedule.repeatLast) : positive(policy.maxBestDayPercent);
  if (pct) {
    const best = cycle.length ? Math.max(...cycle.map(([, v]) => v)) : 0;
    const share = cycleNet > 0 && best > 0 ? (best / cycleNet) * 100 : null;
    check(`Consistency (best day ${pct}% max)`, share === null ? 'no profit yet' : `${Math.round(share)}%`, share !== null && share <= pct + 1e-9, consistencyPlan({ best, net: cycleNet, limit: pct }));
  }
  const minCycle = policy.minimumCycleProfitSchedule ? nthOf(policy.minimumCycleProfitSchedule.amounts, nth, policy.minimumCycleProfitSchedule.repeatLast) : positive(policy.minimumCycleProfit);
  if (minCycle && !(policy.firstPayoutCycleProfitExempt && nth === 1)) check(`Profit this cycle (${money(minCycle)}+)`, money(Math.round(cycleNet * 100) / 100), cycleNet >= minCycle - 1e-9);
  if (policy.requirePositiveCycleProfitAfterFirst && nth > 1) check('Profit since the last payout', money(Math.round(cycleNet * 100) / 100), cycleNet > 0);
  if (positive(policy.minimumBalance)) check(`Balance (${money(policy.minimumBalance)}+)`, money(Math.round(s.balance)), s.balance >= policy.minimumBalance - 1e-9);
  if (positive(policy.maximumPayouts)) check('Payouts left', `${Math.max(0, policy.maximumPayouts - s.paidCount)} of ${policy.maximumPayouts}`, s.paidCount < policy.maximumPayouts);
  if (positive(policy.minimumElapsedHours) && s.lastPayout) {
    const hours = Math.max(0, daysBetween(s.lastPayout, s.today)) * 24;
    check(`Time since the last payout (${policy.minimumElapsedHours} h)`, `${hours} h`, hours >= policy.minimumElapsedHours);
  }
  const a = policy.availability || {};
  const floor = a.kind === 'profit_above_balance_floor' && Number.isFinite(Number(a.balanceFloor)) ? Number(a.balanceFloor) : s.start;
  let max = (Math.max(0, s.balance - floor) * (Number(a.requestPercent) || 100)) / 100;
  const m = policy.maximumRequest || { kind: 'none' };
  const cap = m.kind === 'fixed' ? Number(m.amount) : m.kind === 'schedule' ? nthOf(m.amounts, nth, m.repeatLast) : m.kind === 'first_fixed_then_none' && nth === 1 ? Number(m.amount) : null;
  if (Number.isFinite(cap) && cap !== null) max = Math.min(max, cap);
  if (positive(policy.newProfitPercentOfRequest)) max = Math.min(max, (Math.max(0, cycleNet) * 100) / policy.newProfitPercentOfRequest);
  max = Math.floor(max * 100) / 100;
  const min = Number(policy.minimumRequest) || 0;
  check(min ? `Available to request (${money(min)} minimum)` : 'Available to request', money(max), max > 0 && max >= min - 1e-9);
  const split = policy.profitSplit && Number.isFinite(Number(policy.profitSplit.percent)) ? Number(policy.profitSplit.percent) : 100;
  return { eligible: checks.every((x) => x.ok), checks, max, min, cap: Number.isFinite(cap) ? cap : null, split, nth, cycleStart: s.cycleStart, cycleNet, floor, policy };
}

/** Where an account stands against its step's rules, from its trades in order; null when it has no rules.
 *  The trading day is the trade's date, the same day the calendar and daily stats use. */
function challengeStatus(name, trades, accountInfo, today = isoDay(new Date()), payouts = payoutsSource()) {
  const info = (accountInfo && accountInfo[name]) || {};
  const rules = info.rules;
  if (!rules) return null;
  const start = info.start !== undefined && info.start !== '' && Number.isFinite(Number(info.start)) ? Number(info.start) : (rules.size || 0);
  const maxLoss = positive(rules.maxLoss), target = positive(rules.target), minDays = positive(rules.minDays), consistency = positive(rules.consistency);
  const lock = rules.lockAt !== null && rules.lockAt !== undefined && rules.lockAt !== '' && Number.isFinite(Number(rules.lockAt)) ? start + Number(rules.lockAt) : Infinity;
  let fixedLine = null; // where a payout locked the max loss
  const lineFrom = (high) => (maxLoss ? (fixedLine !== null ? fixedLine : Math.min(lock, high - maxLoss)) : -Infinity);
  const list = trades.filter((t) => accountName(t) === name).sort(byTime);
  let balance = start, peak = start, eodPeak = start, line = lineFrom(start), day = null, dayPnl = 0, dayLimit = dailyLimitFor(rules, start, start, 0);
  let breachedOn = '', reason = '';
  const days = new Map(), softHits = [], oversize = [], reviewDays = [];
  const closeDay = () => { if (day !== null && positive(rules.reviewDayProfit) && dayPnl >= rules.reviewDayProfit) reviewDays.push(day); };
  // payouts come out after their day's trading; what happens next follows the step's payout rules
  const policy = payoutPolicyOf(rules), after = (policy && policy.afterPayout) || {};
  const paid = (payouts || []).filter((x) => x.account === name && /^\d{4}-\d{2}-\d{2}$/.test(String(x.date))).sort((x, y) => String(x.date).localeCompare(String(y.date)));
  let taken = 0, paidTotal = 0, cycleStart = '', lastPayout = '';
  const takePayouts = (beforeDay) => {
    while (taken < paid.length && (beforeDay === null || paid[taken].date < beforeDay)) {
      const x = paid[taken++];
      const amount = Number(x.amount) || 0;
      paidTotal += amount;
      lastPayout = x.date;
      if (after.balanceAction === 'reset_to_starting_balance') balance = start;
      else balance -= amount;
      if (after.drawdownAction === 'lock_at_balance') { fixedLine = start + (Number(after.drawdownFloor) || 0); line = fixedLine; }
      else if (after.drawdownAction === 'reset_from_starting_balance') { fixedLine = null; peak = eodPeak = balance; line = lineFrom(balance); }
      if (after.resetCycle !== false) cycleStart = addDays(x.date, 1);
      if (!breachedOn && maxLoss && balance <= line + 1e-9) { breachedOn = x.date; reason = 'a payout took it to the max loss'; }
    }
  };
  for (const t of list) {
    if (t.date !== day) {
      closeDay();
      if (day !== null) eodPeak = Math.max(eodPeak, balance);
      takePayouts(t.date);
      day = t.date;
      dayPnl = 0;
      if (rules.drawdown === 'eod') line = lineFrom(eodPeak);
      dayLimit = dailyLimitFor(rules, start, balance, eodPeak - start);
    }
    const allowed = maxContractsFor(rules, balance - start);
    if (allowed && contractsIn(t, rules) > allowed + 1e-9) oversize.push({ date: t.date, time: t.time, symbol: t.symbol, qty: t.qty, allowed });
    const p = netPnl(t);
    balance += p;
    dayPnl += p;
    days.set(t.date, (days.get(t.date) || 0) + p);
    if (!breachedOn && maxLoss && balance <= line + 1e-9) { breachedOn = t.date; reason = 'hit the max loss'; }
    if (dayLimit && dayPnl <= -dayLimit + 1e-9) {
      if (rules.dailyHard && !breachedOn) { breachedOn = t.date; reason = 'hit the daily loss limit'; }
      else if (!rules.dailyHard && !softHits.includes(t.date)) softHits.push(t.date);
    }
    if (rules.drawdown === 'intraday') { peak = Math.max(peak, balance); line = lineFrom(peak); }
  }
  closeDay();
  const afterClose = day !== null && day < today;
  if (rules.drawdown === 'eod' && afterClose) { eodPeak = Math.max(eodPeak, balance); line = lineFrom(eodPeak); } // the line moves up after the close
  takePayouts(null);
  const todayLimit = day === today ? dayLimit : dailyLimitFor(rules, start, balance, Math.max(eodPeak, afterClose ? balance : eodPeak) - start);
  const net = balance - start;
  const dayValues = [...days.values()];
  const bestDay = dayValues.length ? Math.max(...dayValues) : 0;
  const share = net > 0 && bestDay > 0 ? (bestDay / net) * 100 : null;
  const consistencyLimit = consistency ? consistency + (positive(rules.consistencyCushion) || 0) : null;
  const consistencyOk = !consistency || (share !== null && share <= consistencyLimit + 1e-9);
  const mp = rules.minProfitableDays && positive(rules.minProfitableDays.days) ? rules.minProfitableDays : null;
  const profitableDays = mp ? dayValues.filter((v) => v >= (Number(mp.minProfit) || 0.01)).length : null;
  const todayPnl = days.get(today) || 0;
  const targetHit = !!target && net >= target - 1e-9;
  const daysOk = !minDays || days.size >= minDays;
  const profitableOk = !mp || profitableDays >= mp.days;
  return {
    rules, start, balance, net, target, progress: target ? net / target : null, targetHit,
    maxLoss, line: maxLoss ? line : null, room: maxLoss ? balance - line : null, drawdown: rules.drawdown || 'static',
    dailyLoss: todayLimit, dailyHard: !!rules.dailyHard, todayPnl, todayRoom: todayLimit ? todayLimit + todayPnl : null, softHits,
    daysTraded: days.size, minDays, daysOk, minProfitableDays: mp, profitableDays, profitableOk,
    bestDay, consistency, consistencyLimit, consistencyShare: share, consistencyOk,
    maxContractsNow: maxContractsFor(rules, net), oversize, reviewDays,
    lastTrade: list.length ? list[list.length - 1].date : '',
    breachedOn, reason, ready: !breachedOn && targetHit && daysOk && consistencyOk && profitableOk,
    payouts: paid, paidTotal, received: sum(paid.map(payoutReceived)),
    payout: policy ? payoutCheck(policy, { start, balance, days, cycleStart, paidCount: paid.length, lastPayout, firstTrade: list.length ? list[0].date : '', today }) : null,
  };
}
/** Plain-language lines for the rules a step has beyond the editable fields. */
function extraRuleLines(r) {
  const out = [];
  if (r.dailyAfter) out.push(`Daily loss limit becomes ${money(r.dailyAfter.amount)} once profit reaches ${r.dailyAfter.profitPct}% of the account.`);
  for (const t of r.dailyTiers || []) out.push(`Daily loss limit becomes ${money(t.amount)} from ${money(t.profit)} profit.`);
  if (r.dailyScale) out.push(`From a ${money(r.dailyScale.atBalance)} balance, the daily loss limit is ${r.dailyScale.pctOfPeakProfit}% of the best end-of-day profit.`);
  const contracts = (n) => `${n} contract${Number(n) === 1 ? '' : 's'}`;
  if (r.sizeTiers && r.sizeTiers.length) out.push(`Position size: ${contracts(r.initialContracts || r.maxContracts || '?')}, then ${r.sizeTiers.map((t) => `${t.max} from ${money(t.profit)} profit`).join(', ')}.`);
  if (positive(r.profitPerContract)) out.push(`Position size: ${contracts(r.initialContracts || 1)}, +1 per ${money(r.profitPerContract)} profit${positive(r.maxContractsCap) ? `, up to ${r.maxContractsCap}` : ''}.`);
  if (positive(r.consistencyCushion)) out.push(`Consistency has a ${r.consistencyCushion}% cushion.`);
  if (positive(r.reviewDayProfit)) out.push(`A day above ${money(r.reviewDayProfit)} profit triggers a live review.`);
  if (positive(r.microsPerContract)) out.push(`${r.microsPerContract} micros count as 1 contract.`);
  return [...out, ...payoutRuleLines(payoutPolicyOf(r))];
}
/** A step's payout rules in words. */
function payoutRuleLines(policy) {
  if (!policy) return [];
  const out = [];
  const c = policy.cycle || {};
  const cycle = c.kind === 'qualifying_days' ? `${c.days} winning days of ${money(c.minimumDailyProfit || 0)}+` : c.kind === 'trading_days' ? `${c.days} trading days` : c.kind === 'calendar_days' ? `${c.days} days${c.anchor === 'first_trade' ? ' from the first trade' : ''}` : '';
  const pct = positive(policy.maxBestDayPercent) || (policy.maxBestDayPercentSchedule ? policy.maxBestDayPercentSchedule.percents.join('% / ') : null);
  out.push(`Payouts: ${[cycle ? `${cycle} per payout` : 'no waiting days', pct ? `best day ${pct}% of the cycle's profit at most` : ''].filter(Boolean).join(', ')}.`);
  const a = policy.availability || {};
  const m = policy.maximumRequest || {};
  const max = m.kind === 'fixed' ? `up to ${money(m.amount)}` : m.kind === 'schedule' ? `up to ${m.amounts.map((x) => money(x)).join(', ')}${m.repeatLast === false ? '' : ' (then the last)'}` : '';
  const above = a.kind === 'profit_above_balance_floor' ? `the profit above a ${money(a.balanceFloor)} balance` : 'the profit';
  out.push(`You can request ${a.requestPercent && a.requestPercent !== 100 ? `${a.requestPercent}% of ` : ''}${above}${max ? `, ${max}` : ''}${policy.minimumRequest ? `, ${money(policy.minimumRequest)} minimum` : ''}; your share is ${policy.profitSplit ? policy.profitSplit.percent : 100}%.`);
  const af = policy.afterPayout || {};
  const parts = [];
  if (af.balanceAction === 'reset_to_starting_balance') parts.push('the balance goes back to the start');
  if (af.drawdownAction === 'lock_at_balance') parts.push(Number(af.drawdownFloor) ? `the max loss locks at ${money(Number(af.drawdownFloor))} above the starting balance` : 'the max loss locks at the starting balance');
  if (af.drawdownAction === 'reset_from_starting_balance') parts.push('the max loss starts again from the start');
  if (positive(policy.maximumPayouts)) parts.push(`after ${policy.maximumPayouts} payouts ${af.maximumPayoutOutcome === 'conclude_account' ? 'the account closes' : af.maximumPayoutOutcome === 'eligible_for_live_review' ? 'you move to a live account' : 'no more payouts'}`);
  if (parts.length) out.push(`After a payout ${parts.join('; ')}.`);
  return out;
}

function careerStats(trades, accounts, accountInfo, payouts) {
  const st = computeStats(trades);
  const pnl = trades.map(netPnl);
  const days = [...dailyResults(trades)].map(([date, d]) => ({ date, pnl: d.pnl }));
  const pick = (cmp) => days.reduce((best, d) => (best === null || cmp(d.pnl, best.pnl) ? d : best), null);
  // a blown account is gone: it stays in the trade statistics, but its balance no longer counts as money you hold
  const statuses = new Map(accounts.map((a) => [a, accountStatus(a, trades, accountInfo)]));
  const blown = accounts.filter((a) => statuses.get(a).blown);
  const passed = accounts.filter((a) => !statuses.get(a).blown && statuses.get(a).passed); // a passed stage is closed: its next stage holds the money
  const balances = accounts.filter((a) => !blown.includes(a) && !passed.includes(a)).map((a) => accountBalance(a, trades, accountInfo, payouts)).filter(Boolean);
  const paid = (payouts || []).filter((p) => accounts.includes(p.account));
  return {
    ...st,
    bestDay: pick((a, b) => a > b), worstDay: pick((a, b) => a < b),
    biggestWin: pnl.length ? Math.max(0, ...pnl) : 0, biggestLoss: pnl.length ? Math.min(0, ...pnl) : 0,
    balance: balances.length ? sum(balances.map((b) => b.balance)) : null,
    startBalance: sum(balances.map((b) => b.start)), balanceAccounts: balances.length, accounts: accounts.length,
    payouts: sum(paid.map(payoutReceived)), payoutCount: paid.length,
    blownAccounts: blown.length, passedAccounts: passed.length, activeAccounts: accounts.length - blown.length - passed.length,
  };
}

