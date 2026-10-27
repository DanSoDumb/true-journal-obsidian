// ---------- the trade overview: a small card at the top of a trade note, in place of its long list of properties ----------

/** Draws a trade's overview into `el`, in True Journal's own style: one line with the side pill, symbol, account and
 *  the net P&L; one line with the day and time; one line with the trade itself (entry → exit, size, exits, held, R);
 *  the setups and mistakes as chips; and small Edit / Review / Properties actions (`on` gives them). */
function renderTradeOverview(el, trade, on = {}) {
  const t = trade, vi = LANG === 'vi';
  el.empty();
  el.addClass('tvj-trade-overview');
  const net = netPnl(t);
  // 1. side · symbol · account ............ P&L
  const top = el.createDiv({ cls: 'tvj-to-top' });
  const who = top.createDiv({ cls: 'tvj-to-who' });
  who.createSpan({ cls: `tvj-side ${t.direction === 'short' ? 'is-short' : 'is-long'}`, text: tx(t.direction === 'short' ? 'short' : 'long') });
  who.createSpan({ cls: 'tvj-to-symbol', text: t.symbol });
  if (t.account) who.createSpan({ cls: 'tvj-to-account', text: t.account });
  if (!isCounted(t)) who.createSpan({ cls: `tvj-kind is-${t.kind}`, text: tx(TRADE_KINDS[t.kind]), attr: { title: tx('Not counted in your P&L, accounts or rank') } });
  const pnl = top.createDiv({ cls: `tvj-to-pnl ${net < 0 ? 'tvj-neg' : 'tvj-pos'}` });
  const parts = cents(net).split('.');
  pnl.createSpan({ text: `${net > 0 ? '+' : ''}${parts[0]}` });
  if (parts[1]) pnl.createSpan({ cls: 'tvj-to-cents', text: `.${parts[1]}` });
  // 2. when
  const d = dayAt(t.date);
  el.createDiv({ cls: 'tvj-to-when', text: [d.toLocaleDateString(vi ? 'vi-VN' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }), t.time, `${vi ? 'Tuần' : 'Week'} ${isoWeek(t.date)}`].join(' · ') });
  // 3. the trade in one line
  const price = (v) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 5 });
  const line = el.createDiv({ cls: 'tvj-to-line' });
  const bit = (text, cls = '') => line.createSpan({ cls: `tvj-to-bit ${cls}`.trim(), text });
  if (t.pnlOnly) bit(tx('P&L entered directly'));
  else {
    bit(`${price(t.entry)} → ${price(t.exit)}`, 'is-strong');
    bit(`${t.qty} ${t.market === 'cfd' ? 'lot' : (t.qty === 1 ? (vi ? 'hợp đồng' : 'contract') : (vi ? 'hợp đồng' : 'contracts'))}`);
    if ((t.entries || []).length > 1) bit(vi ? `${t.entries.length} lần vào` : `${t.entries.length} entries`);
    if ((t.exits || []).length > 1) {
      const x = bit(vi ? `${t.exits.length} lần thoát` : `${t.exits.length} exits`, 'has-tip');
      x.setAttribute('title', t.exits.join('\n'));
    }
    if (t.duration > 0) bit(`${vi ? 'giữ' : 'held'} ${shortDuration(t.duration)}`);
    const r = rMultiple(t);
    if (r !== null) bit(`${r >= 0 ? '+' : ''}${r.toFixed(2)}R`, r < 0 ? 'tvj-neg' : 'tvj-pos');
  }
  // 4. setups and mistakes
  const tags = [...(t.setups || []).map((s) => [s, '']), ...(t.mistakes || []).map((m) => [m, 'is-mistake'])];
  if (tags.length) {
    const chips = el.createDiv({ cls: 'tvj-to-chips' });
    for (const [name, cls] of tags) chips.createSpan({ cls: `tvj-to-chip ${cls}`.trim(), text: name });
  }
  // 5. state and actions
  const foot = el.createDiv({ cls: 'tvj-to-foot' });
  foot.createSpan({ cls: `tvj-to-state ${t.reviewed ? 'is-done' : ''}`.trim(), text: tx(t.reviewed ? 'Reviewed' : 'Not reviewed yet') });
  const act = (label, run, cls = '') => {
    if (!run) return;
    const b = foot.createEl('button', { cls: `tvj-to-link ${cls}`.trim(), text: tx(label) });
    b.addEventListener('click', run);
  };
  if (!t.reviewed) act('Review', on.review, 'is-main');
  act('Edit', on.edit);
  act(on.propertiesShown ? 'Hide properties' : 'Properties', on.properties);
  return el;
}
