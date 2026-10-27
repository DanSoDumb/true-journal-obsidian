// List prices of the firms' plans, before discount codes, checked 2026-10-27: on the firms' own sites (MyFundedFutures,
// Legends, The5ers: the struck-through list price, not the promotion) and help centers (Topstep, Tradeify,
// FundedNext), Lucid's plan picker (its default options: DLL on, EOD; other options add a fee, so they are left out),
// and review sites that agree with each other otherwise. Apex blocks Vietnam, so it is not here yet. Per firm: { <plan name, or its name before " · ">: { per: 'month' | 'once',
// currency, activation (one fee, or { <size>: fee }), sizes: { <account size>: price } } }. The card says when.
const PLAN_PRICES = {
  checked: '2026-10-27',
  firms: {
    'Topstep': { 'Trading Combine': { per: 'month', activation: 149, sizes: { 50000: 49, 100000: 99, 150000: 199 } } },
    'Tradeify': {
      'Growth': { per: 'once', sizes: { 25000: 99, 50000: 145, 100000: 255, 150000: 369 } },
      'Select Flex': { per: 'once', sizes: { 25000: 109, 50000: 165, 100000: 265, 150000: 369 } },
      'Select Daily': { per: 'once', sizes: { 25000: 109, 50000: 165, 100000: 265, 150000: 369 } },
      'Lightning Funded': { per: 'once', sizes: { 25000: 345, 50000: 492, 100000: 660, 150000: 796 } },
    },
    'Take Profit Trader': { 'Standard': { per: 'month', activation: 130, sizes: { 25000: 150, 50000: 170, 75000: 245, 100000: 330, 150000: 360 } } },
    'FundedNext Futures': {
      'Rapid Pro': { per: 'once', sizes: { 25000: 159.98, 50000: 299.98, 100000: 499.98 } },
      'Rapid Daily': { per: 'once', sizes: { 25000: 159.98, 50000: 299.98, 100000: 499.98 } },
    },
    'FTMO': {
      '2-Step': { per: 'once', currency: 'EUR', sizes: { 10000: 89, 25000: 250, 50000: 345, 100000: 540, 200000: 1080 } },
      '1-Step': { per: 'once', currency: 'EUR', sizes: { 10000: 79, 25000: 199, 50000: 319, 100000: 499, 200000: 999 } },
    },
    'FTMO Futures': {
      'Growth': { per: 'month', sizes: { 50000: 119, 100000: 169, 150000: 229 } },
      'Pro': { per: 'month', sizes: { 50000: 139, 100000: 199, 150000: 269 } },
    },
    'The Trading Pit': { 'Challenge': { per: 'once', sizes: { 50000: 99, 100000: 189, 150000: 289 } } },
    'FFN': { 'Steady (Rithmic)': { per: 'once', sizes: { 50000: 229 } } },
    'MyFundedFutures': {
      'Builder': { per: 'once', sizes: { 25000: 105, 50000: 153, 100000: 282, 150000: 398 } },
      'Pro': { per: 'once', sizes: { 50000: 265, 100000: 401, 150000: 557 } },
      'Rapid': { per: 'once', sizes: { 25000: 145, 50000: 209, 100000: 356, 150000: 463 } },
      'Rapid EOD': { per: 'once', sizes: { 25000: 145, 50000: 225 } },
    },
    'Legends Trading': {
      'Apprentice': { per: 'month', activation: { 50000: 99, 100000: 129, 150000: 149 }, sizes: { 50000: 59, 100000: 107, 150000: 138 } },
      'Elite': { per: 'once', sizes: { 25000: 119, 50000: 151, 100000: 227, 150000: 347 } },
    },
    'Lucid Trading': {
      'LucidPro · DLL On': { per: 'once', sizes: { 25000: 108, 50000: 172, 100000: 272, 150000: 365 } },
      'LucidFlex · DLL On': { per: 'once', sizes: { 25000: 65, 50000: 115, 100000: 215, 150000: 323 } },
      'LucidDaily · DLL On, EOD Eval': { per: 'once', sizes: { 25000: 86, 50000: 122, 100000: 200, 150000: 286 } },
      'LucidDirect': { per: 'once', sizes: { 25000: 329, 50000: 515, 100000: 700, 150000: 836 } },
    },
    'The5ers': {
      'High Stakes': { per: 'once', sizes: { 2500: 19, 5000: 35, 10000: 69, 25000: 176, 50000: 249, 100000: 405 } },
      'Pro Growth': { per: 'once', sizes: { 5000: 52, 10000: 98, 20000: 189 } },
      'Bootcamp': { per: 'once', activation: 50, sizes: { 20000: 22 } },
    },
  },
};

/** A plan's list price at one size: { amount, per, currency, activation, checked }, or null when it is not on the list. */
function planPrice(firmName, ch) {
  const plans = PLAN_PRICES.firms[firmName];
  if (!plans) return null;
  const name = planName(ch);
  const key = Object.keys(plans).find((k) => name === k || name.startsWith(`${k} · `));
  const plan = key ? plans[key] : null;
  const amount = plan ? plan.sizes[ch.size] : undefined;
  const activation = plan && typeof plan.activation === 'object' ? plan.activation[ch.size] : plan && plan.activation;
  return amount === undefined ? null : { amount, per: plan.per, currency: plan.currency || 'USD', activation: activation || 0, checked: PLAN_PRICES.checked };
}
/** "$99/mo", "€345", "$159.98". */
const priceText = (p) => `${p.currency === 'EUR' ? '€' : '$'}${Number(p.amount).toLocaleString('en-US', { maximumFractionDigits: 2 })}${p.per === 'month' ? '/mo' : ''}`;
