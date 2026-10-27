// ---------- process over money: how well the rules were kept, and what each mistake cost ----------

/** The process side of a set of trades: { reviewed, clean, score (% of reviewed trades with no mistake tagged, or
 *  null), cleanNet, mistakeNet } — the P&L of the trades without a mistake against the ones with one. */
function processStats(trades) {
  const list = trades || [];
  const has = (t) => (t.mistakes || []).length > 0;
  const reviewed = list.filter((t) => t.reviewed);
  const clean = reviewed.filter((t) => !has(t));
  return { reviewed: reviewed.length, clean: clean.length, score: reviewed.length ? (clean.length / reviewed.length) * 100 : null,
    cleanNet: sum(list.filter((t) => !has(t)).map(netPnl)), mistakeNet: sum(list.filter(has).map(netPnl)) };
}

