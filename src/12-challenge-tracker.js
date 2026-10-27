// ---------- challenge tracker: what the challenges cost against what the payouts brought back ----------

/** What a cost can be: the evaluation itself, or an extra cost on top of it (an activation fee, a reset, anything
 *  else such as a data fee). */
const COST_KINDS = { eval: 'Evaluation', activation: 'Activation fee', reset: 'Reset', other: 'Other cost' };

/** The firm an account's money counts under: the firm of its challenge, else the firm typed on one of its costs. */
function accountFirm(name, accountInfo, costs = []) {
  const rules = ((accountInfo || {})[name] || {}).rules;
  const own = rules ? String(rules.firm || '').trim() : '';
  if (own) return own;
  const typed = costs.find((c) => c.account === name && String(c.firm || '').trim());
  return typed ? String(typed.firm).trim() : '';
}

/** Money spent on challenges (costs: [{ id, date, account, firm, kind, amount, note }]) against the payouts, which
 *  count what you received after the split. ROI = (received − spent) ÷ spent, null until something is spent.
 *  Returns the totals and one row per firm, biggest spend first; a cost's own firm wins over its account's. */
function challengeTracker(costs, payouts, accountInfo) {
  costs = costs || [];
  const blank = (firm) => ({ firm, spent: 0, evals: 0, extra: 0, bought: 0, activations: 0, resets: 0, others: 0, received: 0, payoutCount: 0, accounts: new Set() });
  const total = blank('');
  const firms = new Map();
  const rowsFor = (firm) => {
    if (!firms.has(firm)) firms.set(firm, blank(firm));
    return [total, firms.get(firm)];
  };
  for (const c of costs) {
    const amount = Number(c.amount) || 0;
    if (amount <= 0) continue;
    for (const r of rowsFor(String(c.firm || '').trim() || accountFirm(c.account, accountInfo, costs))) {
      r.spent += amount;
      if (c.kind === 'eval') { r.evals += amount; r.bought++; } else r.extra += amount;
      if (c.kind === 'activation') r.activations++;
      else if (c.kind === 'reset') r.resets++;
      else if (c.kind !== 'eval') r.others++;
      if (c.account) r.accounts.add(c.account);
    }
  }
  for (const p of payouts || []) {
    for (const r of rowsFor(accountFirm(p.account, accountInfo, costs))) {
      r.received += payoutReceived(p);
      r.payoutCount++;
      if (p.account) r.accounts.add(p.account);
    }
  }
  const finish = (r) => ({ ...r, accounts: r.accounts.size, net: r.received - r.spent, roi: r.spent > 0 ? ((r.received - r.spent) / r.spent) * 100 : null });
  const byFirm = [...firms.values()].map(finish).sort((a, b) => b.spent - a.spent || b.received - a.received || a.firm.localeCompare(b.firm));
  return { ...finish(total), firms: byFirm };
}

/** ROI as text: "+12.5%", "−100%", or "—" when nothing was spent. */
const roiText = (roi) => (roi === null ? '—' : `${roi > 0 ? '+' : roi < 0 ? '−' : ''}${Math.abs(Math.round(roi * 10) / 10)}%`);
/** Money for costs: whole dollars stay "$85", cents always show two digits ("$2,455.10", not "$2,455.1"). */
const cents = (n) => (Math.round(Math.abs(n) * 100) % 100 ? `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : money(n));
/** Money with its sign: "+$1,200", "−$300", "$0". */
const signedMoney = (n) => `${n > 0 ? '+' : ''}${cents(n)}`;

