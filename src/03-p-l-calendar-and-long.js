// ---------- P&L calendar and long-term simulation (same maths as the web journal) ----------

function dailyResults(trades) {
  const days = new Map();
  for (const t of trades) {
    const d = days.get(t.date) || { pnl: 0, trades: 0 };
    days.set(t.date, { pnl: d.pnl + netPnl(t), trades: d.trades + 1 });
  }
  return days;
}

/** Weeks of a month ("YYYY-MM"), Monday first; cells outside the month are null. */
function monthGrid(month) {
  const [y, m] = month.split('-').map(Number);
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const count = new Date(y, m, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

function shiftMonth(month, by) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// small seeded generator, so the same journal always shows the same projection
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

/** Monte Carlo by resampling past trade results with replacement. Assumes future trades look like past ones
 *  and are independent of each other. */
function simulate(pnls, nTrades, ddLimit, runs = 1000, seed = 20261003) {
  if (pnls.length < 5 || nTrades < 1) return null;
  const rand = mulberry32(seed);
  const step = Math.max(1, Math.round(nTrades / 50));
  const marks = [];
  for (let n = step; n < nTrades; n += step) marks.push(n);
  marks.push(nTrades);
  const atMark = marks.map(() => []);
  const drawdowns = [];
  let ruined = 0;
  for (let r = 0; r < runs; r++) {
    let equity = 0, peak = 0, maxDd = 0, k = 0;
    for (let n = 1; n <= nTrades; n++) {
      equity += pnls[Math.floor(rand() * pnls.length)];
      if (equity > peak) peak = equity;
      else if (peak - equity > maxDd) maxDd = peak - equity;
      if (n === marks[k]) atMark[k++].push(equity);
    }
    drawdowns.push(maxDd);
    if (ddLimit !== null && ddLimit > 0 && maxDd >= ddLimit) ruined++;
  }
  const points = marks.map((n, i) => {
    const v = atMark[i].sort((a, b) => a - b);
    return { n, p10: percentile(v, 0.1), p50: percentile(v, 0.5), p90: percentile(v, 0.9) };
  });
  const finals = atMark[atMark.length - 1];
  const dd = drawdowns.sort((a, b) => a - b);
  const last = points[points.length - 1];
  return {
    points: [{ n: 0, p10: 0, p50: 0, p90: 0 }, ...points],
    final: { p10: last.p10, p50: last.p50, p90: last.p90 },
    probProfit: (finals.filter((v) => v > 0).length / runs) * 100,
    ddMedian: percentile(dd, 0.5),
    ddP90: percentile(dd, 0.9),
    ruinProb: ddLimit !== null && ddLimit > 0 ? (ruined / runs) * 100 : null,
    runs,
  };
}

