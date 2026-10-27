// ---------- the practical rules: news around releases and going quiet, by firm and stage ----------

/** What a firm's own help pages say, for its evaluation and its funded stage: newsRule 'allowed' | 'restricted' (no
 *  new positions in the window) | 'deducted' (profit in the window is taken off) | 'no' (not allowed at all),
 *  newsMinutes either side of a high-impact release, inactivityDays without a trade before an account can be closed.
 *  Only what was checked is here; an account's own rules (Rules) win over it. */
const FIRM_PRACTICAL = {
  Topstep: { checked: '2026-10-20', source: 'help.topstep.com',
    evaluation: { newsRule: 'restricted', newsMinutes: 5 },
    funded: { newsRule: 'restricted', newsMinutes: 5, inactivityDays: 30 } },
};
const NEWS_RULES = { allowed: 'Allowed', restricted: 'No new trades around high-impact news', deducted: 'Profit around high-impact news is taken off', no: 'Not allowed around high-impact news' };

/** An account's practical rules: its own, else its firm's for that stage. { newsRule, newsMinutes, inactivityDays }. */
function practicalRules(rules) {
  const r = rules || {};
  const firm = FIRM_PRACTICAL[r.firm] || {};
  const base = firm[r.stage && r.stage !== 'evaluation' ? 'funded' : 'evaluation'] || {};
  const pick = (k) => (r[k] !== undefined && r[k] !== null && r[k] !== '' ? r[k] : base[k]);
  return { newsRule: pick('newsRule') || '', newsMinutes: Number(pick('newsMinutes')) || 0, inactivityDays: Number(pick('inactivityDays')) || 0 };
}

/** A step's rules in one line: target, max loss and how it moves, daily loss, consistency, and for a funded step
 *  the days per payout and the split. */
function rulesSummary(r) {
  if (!r) return '';
  const pay = r.payout || {}, cycle = pay.cycle || {};
  const days = Number(cycle.days) || 0;
  const lock = r.drawdown && r.drawdown !== 'static' && r.lockAt !== null && r.lockAt !== undefined && r.lockAt !== '' ? ` (${tx('stops at')} +${money(Number(r.lockAt) || 0)})` : '';
  return [r.target ? `${money(r.target)} ${tx('target')}` : '',
    r.maxLoss ? `${money(r.maxLoss)} ${tx('max loss')} · ${tx(DRAWDOWN_LABELS[r.drawdown] || '')}${lock}` : '',
    r.dailyLoss ? `${money(r.dailyLoss)} ${tx('daily loss')}` : tx('no daily loss limit'),
    r.consistency ? `${tx('consistency')} ${r.consistency}%` : '',
    days ? (LANG === 'vi' ? `${days} ngày ${/winning|qualifying/.test(cycle.kind || '') ? 'thắng' : 'giao dịch'} mỗi payout` : `${days} ${/winning|qualifying/.test(cycle.kind || '') ? 'winning' : 'trading'} days per payout`) : '',
    pay.profitSplit && pay.profitSplit.percent ? `${tx('split')} ${pay.profitSplit.percent}%` : ''].filter(Boolean).join(' · ');
}

/** The step after an account's current one in its challenge ({ name, stage, rules }), or null at the last step or
 *  without a challenge from the list. */
function nextStepOf(rules, catalog = PROP_FIRMS) {
  if (!rules || !rules.challengeId) return null;
  const found = catalogChallenge(catalog, rules.challengeId);
  const next = found && found.challenge.steps[(Number(rules.step) || 0) + 1];
  return next ? { name: next.name, stage: next.stage, rules: next.rules } : null;
}

/** One plain sentence for what a rule line means (shown on hover). */
function ruleMeaning(key, ch) {
  const r = (ch && ch.rules) || {};
  const vi = LANG === 'vi';
  const lock = r.lockAt !== null && r.lockAt !== undefined && r.lockAt !== '' ? (vi ? ` Nó ngừng dời khi tới số dư ban đầu + ${money(Number(r.lockAt) || 0)}.` : ` It stops moving once it reaches the starting balance + ${money(Number(r.lockAt) || 0)}.`) : '';
  const t = {
    target: vi ? 'Qua bước này khi số dư đóng cửa cao hơn số dư ban đầu chừng này, cùng các luật khác.' : 'You pass when the balance closes this far above the start, with the other rules met.',
    maxLoss: r.drawdown === 'eod' ? (vi ? 'Mức sàn đi theo số dư cuối ngày cao nhất; đỉnh trong ngày không làm nó dời.' : 'The floor follows your highest end-of-day balance; highs during the day don\'t move it.') + lock
      : r.drawdown === 'intraday' ? (vi ? 'Mức sàn đi theo số dư cao nhất của các lệnh đã đóng, kể cả trong ngày.' : 'The floor follows your highest balance on closed trades, during the day too.') + lock
        : (vi ? 'Mức sàn cố định: tài khoản thua khi số dư chạm nó.' : 'A fixed floor: the account fails if the balance reaches it.'),
    dailyLoss: r.dailyHard ? (vi ? 'Lỗ chừng này trong một ngày là tài khoản thua.' : 'Lose this much in one day and the account fails.') : (vi ? 'Lỗ chừng này trong một ngày thì dừng tới phiên sau; tài khoản vẫn còn.' : 'Lose this much in one day and trading stops until the next session; the account stays alive.'),
    days: vi ? 'Số ngày có ít nhất một lệnh cần có trước khi qua bước.' : 'Days with at least one trade you need before you can pass.',
    profitable: vi ? 'Số ngày đóng cửa lãi tối thiểu chừng này cần có.' : 'Days that closed at least this much in profit that you need.',
    size: vi ? 'Số hợp đồng tối đa cùng lúc (micro tính bằng một phần mười).' : 'The most contracts at once (a micro counts as a tenth).',
    inactivity: vi ? 'Quỹ có thể đóng tài khoản sau chừng này ngày không có lệnh.' : 'The firm can close the account after this many days without a trade.',
  };
  return t[key] || '';
}

/** What a trade just logged on `trade.account` brings close, in the current language: ch is the account's
 *  challengeStatus with the trade in. Today's limits only for a trade dated today. [] when nothing is close. */
function tradeWarnings(ch, trade, today = isoDay(new Date()), events = []) {
  if (!ch || ch.breachedOn) return []; // a breach has its own notice
  const vi = LANG === 'vi', out = [];
  // a high-impact release close to the trade, where the firm restricts trading around the news
  const pr = practicalRules(ch.rules);
  if (pr.newsRule && pr.newsRule !== 'allowed' && Array.isArray(events) && trade.time) {
    const at = new Date(`${trade.date}T${trade.time}:00`).getTime(), span = (pr.newsMinutes || 5) * 60000;
    const near = events.filter((e) => e.impact === 'High' && (e.country === 'USD' || e.country === 'All') && Math.abs(e.at - at) <= span);
    for (const e of near) {
      const d = new Date(e.at), mins = Math.round(Math.abs(e.at - at) / 60000), when = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      const rel = vi ? (mins === 0 ? 'đúng lúc' : `${mins} phút ${e.at > at ? 'sau' : 'trước'}`) : (mins === 0 ? 'right at' : `${mins} min ${e.at > at ? 'after' : 'before'}`);
      out.push(vi ? `${e.title} lúc ${when}, ${rel} lệnh này: ${ch.rules.firm || 'quỹ'} ${tx(NEWS_RULES[pr.newsRule]).toLowerCase()} (±${pr.newsMinutes || 5} phút).` : `${e.title} at ${when}, ${rel} this trade: ${ch.rules.firm || 'the firm'} says ${tx(NEWS_RULES[pr.newsRule]).toLowerCase()} (±${pr.newsMinutes || 5} min).`);
    }
  }
  if (trade.date === today && ch.dailyLoss && Number.isFinite(ch.todayRoom)) {
    if (ch.todayRoom <= 0) out.push(vi ? 'Hôm nay đã chạm giới hạn lỗ ngày: dừng giao dịch hôm nay.' : 'Today is at the daily loss limit: stop for the day.');
    else if (ch.todayRoom < ch.dailyLoss * 0.3) out.push(vi ? `Chỉ còn ${money(Math.round(ch.todayRoom))} hôm nay trước giới hạn lỗ ngày.` : `Only ${money(Math.round(ch.todayRoom))} left today before the daily loss limit.`);
  }
  if (ch.maxLoss && Number.isFinite(ch.room) && ch.room > 0 && ch.room < ch.maxLoss * 0.25) out.push(vi ? `Còn ${money(Math.round(ch.room))} trước mức lỗ tối đa.` : `${money(Math.round(ch.room))} left before the max loss.`);
  const over = (ch.oversize || []).find((o) => o.date === trade.date && o.time === trade.time && o.symbol === trade.symbol);
  if (over) out.push(vi ? `Lệnh này vượt giới hạn khối lượng (tối đa ${over.allowed}).` : `This trade was over the size limit (${over.allowed} allowed).`);
  if (ch.consistency && !ch.consistencyOk && ch.consistencyShare !== null && (ch.targetHit || (ch.progress || 0) >= 0.8)) {
    out.push(vi ? `Ngày tốt nhất là ${Math.round(ch.consistencyShare)}% lợi nhuận (tối đa ${ch.consistencyLimit}%): chia phần còn lại ra nhiều ngày.` : `Your best day is ${Math.round(ch.consistencyShare)}% of the profit (max ${ch.consistencyLimit}%): spread the rest over more days.`);
  }
  return out;
}

/** The next payout of a funded account, from its payout check (payoutCheck): { ready, text } in the current
 *  language — what is still missing and, for days, the earliest date (counting today, weekdays for trading and
 *  winning days). */
function payoutPlan(pc, today = isoDay(new Date())) {
  if (!pc) return null;
  const vi = LANG === 'vi';
  if (pc.eligible) return { ready: true, text: vi ? `sẵn sàng · tối đa ${money(pc.max)}` : `ready · up to ${money(pc.max)}` };
  const days = pc.checks.find((x) => !x.ok && x.need > 0);
  const rest = pc.checks.filter((x) => !x.ok && x !== days).map((x) => `${tx(x.label)}: ${x.value}`);
  if (!days) return { ready: false, text: rest.join(' · ') };
  let at = today, left = days.need;
  if (days.unit === 'calendar') at = addDays(today, left);
  else {
    for (;;) {
      const wd = new Date(`${at}T12:00:00Z`).getUTCDay();
      if (wd !== 0 && wd !== 6 && --left <= 0) break;
      at = addDays(at, 1);
    }
  }
  const when = new Date(`${at}T12:00:00`).toLocaleDateString(vi ? 'vi-VN' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short' });
  const what = days.unit === 'calendar' ? (vi ? `${days.need} ngày nữa` : `${days.need} more day${days.need === 1 ? '' : 's'}`)
    : days.unit === 'winning' ? (vi ? `${days.need} ngày thắng nữa (${days.min}+)` : `${days.need} more winning day${days.need === 1 ? '' : 's'} (${days.min}+)`)
      : (vi ? `${days.need} ngày giao dịch nữa` : `${days.need} more trading day${days.need === 1 ? '' : 's'}`);
  return { ready: false, text: [`${what} · ${vi ? 'sớm nhất' : 'earliest'} ${when}`, ...rest].join(' · ') };
}

