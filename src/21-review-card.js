// ---------- review card: a day, week or month as one picture, built from the sections you tick ----------

const REPORT_W = 1200;
const REPORT_SECTIONS = [
  ['header', 'Header', 'Top of the card'],
  ['equity', 'Equity curve', 'Performance'],
  ['drawdown', 'Drawdown', 'Performance'],
  ['stats', 'Stats grid', 'Performance'],
  ['trades', 'Trade list', 'Performance'],
  ['day', 'Day review', 'Review'],
  ['notes', 'Thesis and notes', 'Review'],
  ['answers', 'Review answers', 'Review'],
  ['mistakes', 'Mistakes and tags', 'Review'],
];
const REPORT_DEFAULTS = { header: true, equity: true, drawdown: true, stats: true, trades: true, day: true, notes: false, answers: true, mistakes: true, hideMoney: false };

/** ISO week number of a YYYY-MM-DD date. */
function isoWeek(date) {
  const d = dayAt(date);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const first = new Date(d.getFullYear(), 0, 4, 12);
  return 1 + Math.round(((d - first) / 86400000 - 3 + ((first.getDay() + 6) % 7)) / 7);
}

/** The trades a review card covers: the day itself, or the week / month the day is in. Oldest first. */
function reportTrades(trades, date, range) {
  const inRange = range === 'month' ? (t) => t.date.slice(0, 7) === date.slice(0, 7)
    : range === 'week' ? (t) => mondayOf(t.date) === mondayOf(date)
      : (t) => t.date === date;
  return trades.filter(inRange).sort(byTime);
}

/** "## Thesis / ## Notes / ## Review" of a trade note -> { thesis, notes, answers: [{ question, answer }] }. */
function noteSections(content) {
  const out = { thesis: '', notes: '', answers: [] };
  let current = '';
  const text = { Thesis: [], Notes: [] };
  for (const line of String(content || '').replace(/^---\n[\s\S]*?\n---\n?/, '').split('\n')) {
    const heading = line.match(/^## (.+)$/);
    if (heading) { current = heading[1].trim(); continue; }
    if (current === 'Review') {
      const qa = line.match(/^- \*\*(.+?)\*\*\s*(.*)$/);
      if (qa) out.answers.push({ question: qa[1], answer: qa[2] });
    } else if (text[current]) text[current].push(line);
  }
  const clean = (lines) => lines.join('\n').trim().replace(/^_—_$/, '');
  out.thesis = clean(text.Thesis);
  out.notes = clean(text.Notes);
  return out;
}

/** Draws a review card. `data`: { date, range, trades, notes: Map(id -> noteSections), holder, rankLabel };
 *  `opt`: which sections to include (see REPORT_SECTIONS) and hideMoney. Sets the canvas height to fit. */
function drawReport(canvas, data, opt, background) {
  const W = REPORT_W, PAD = 56, INNER = W - PAD * 2;
  // with your own picture behind the card the panels let a little of it through
  const C = { bg: '#111214', panel: background ? 'rgba(22,24,28,0.74)' : '#191b1f', line: background ? 'rgba(255,255,255,0.1)' : '#282b31', text: '#f3f3f4', muted: '#8f939b', faint: '#5b5f67', up: '#3ecf8e', down: '#f0616d', accent: '#a78bfa' };
  const { trades } = data;
  const useR = !!opt.hideMoney;
  const value = (t) => (useR ? rMultiple(t) : netPnl(t));
  const fmt = (v) => (v === null || !Number.isFinite(v) ? '—' : useR ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}R` : `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
  const short = (v) => (useR ? `${v.toFixed(1)}R` : `${v < 0 ? '−' : ''}$${Math.abs(v) >= 1000 ? `${(Math.abs(v) / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1)}k` : Math.round(Math.abs(v))}`);
  const tone = (v) => (v > 0 ? C.up : v < 0 ? C.down : C.text);
  const series = trades.map(value).map((v) => (v === null ? 0 : v));
  let run = 0, peak = 0;
  const equity = [0, ...series.map((v) => (run += v))];
  const drawdown = equity.map((v) => { peak = Math.max(peak, v); return v - peak; });

  const blocks = []; // each: (ctx, y, draw) => height
  const font = (ctx, weight, size, family = SANS) => { ctx.font = `${weight} ${size}px ${family}`; };
  const wrap = (ctx, text, width) => {
    const lines = [];
    for (const para of String(text).split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(next).width > width) { lines.push(line); line = word; } else line = next;
      }
      lines.push(line);
    }
    return lines;
  };
  const title = (ctx, y, text, draw) => {
    if (draw) {
      font(ctx, 600, 26, "'Instrument Serif', Georgia, serif");
      ctx.fillStyle = C.text;
      ctx.textAlign = 'left';
      ctx.fillText(tx(text), PAD, y + 30);
    }
    return 56;
  };

  if (opt.header) {
    blocks.push((ctx, y, draw) => {
      if (draw) {
        const d = dayAt(data.date);
        const locale = LANG === 'vi' ? 'vi-VN' : 'en-US';
        const heading = data.range === 'month' ? d.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
          : data.range === 'week' ? `${tx('Week')} ${isoWeek(data.date)} · ${d.getFullYear()}`
            : d.toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        ctx.textAlign = 'left';
        font(ctx, 700, 15);
        ctx.letterSpacing = '3px';
        ctx.fillStyle = C.muted;
        ctx.fillText(BRAND, PAD, y + 22);
        ctx.letterSpacing = '0px';
        font(ctx, 700, 44);
        ctx.fillStyle = C.text;
        ctx.fillText(heading.charAt(0).toUpperCase() + heading.slice(1), PAD, y + 78);
        font(ctx, 500, 20);
        ctx.fillStyle = C.accent;
        const sub = data.range === 'day' ? `${tx('Week')} ${isoWeek(data.date)} · ${d.toLocaleDateString(locale, { month: 'long' })}` : `${trades.length ? trades[0].date : data.date} → ${trades.length ? trades[trades.length - 1].date : data.date}`;
        ctx.fillText(sub, PAD, y + 112);
        ctx.textAlign = 'right';
        font(ctx, 600, 20);
        ctx.fillStyle = C.text;
        ctx.fillText(data.holder || '', W - PAD, y + 78);
        font(ctx, 500, 17);
        ctx.fillStyle = C.muted;
        ctx.fillText(data.rankLabel || '', W - PAD, y + 108);
        ctx.textAlign = 'left';
      }
      return 150;
    });
  }

  const chart = (label, values, color, zeroTop) => (ctx, y, draw) => {
    const H = 300, left = PAD + 78, right = W - PAD - 8, top = y + 44, bottom = y + H - 34;
    if (draw) {
      font(ctx, 700, 14);
      ctx.letterSpacing = '2px';
      ctx.fillStyle = C.muted;
      ctx.textAlign = 'center';
      ctx.fillText(tx(label), W / 2, y + 18);
      ctx.letterSpacing = '0px';
      const min = Math.min(0, ...values), max = Math.max(0, ...values);
      const span = max - min || 1;
      const py = (v) => top + ((max - v) / span) * (bottom - top);
      const px = (i) => left + (values.length > 1 ? i / (values.length - 1) : 0.5) * (right - left);
      font(ctx, 500, 14);
      for (let k = 0; k <= 4; k++) {
        const v = min + (span * k) / 4;
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 1;
        ctx.setLineDash(v === 0 ? [] : [3, 5]);
        ctx.beginPath();
        ctx.moveTo(left, py(v));
        ctx.lineTo(right, py(v));
        ctx.stroke();
        ctx.fillStyle = C.muted;
        ctx.textAlign = 'right';
        ctx.fillText(short(v), left - 12, py(v) + 5);
      }
      ctx.setLineDash([]);
      const step = Math.max(1, Math.ceil((values.length - 1) / 9));
      ctx.textAlign = 'center';
      for (let i = 1; i < values.length; i += step) ctx.fillText(`#${i}`, px(i), bottom + 24);
      const fill = ctx.createLinearGradient(0, top, 0, bottom);
      fill.addColorStop(zeroTop ? 1 : 0, alpha(color, 0.32));
      fill.addColorStop(zeroTop ? 0 : 1, alpha(color, 0.02));
      ctx.beginPath();
      values.forEach((v, i) => (i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v))));
      ctx.lineTo(px(values.length - 1), py(0));
      ctx.lineTo(px(0), py(0));
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.beginPath();
      values.forEach((v, i) => (i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v))));
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.textAlign = 'left';
    }
    return H + 20;
  };
  const performance = opt.equity || opt.drawdown || opt.stats || opt.trades;
  if (performance && trades.length) blocks.push((ctx, y, draw) => title(ctx, y, 'Performance', draw));
  if (opt.equity && trades.length) blocks.push(chart('EQUITY CURVE', equity, equity[equity.length - 1] < 0 ? C.down : C.up, false));
  if (opt.drawdown && trades.length) blocks.push(chart('DRAWDOWN', drawdown, C.down, true));

  if (opt.stats && trades.length) {
    blocks.push((ctx, y, draw) => {
      const vals = trades.map(value).filter((v) => v !== null);
      const wins = vals.filter((v) => v > 0), losses = vals.filter((v) => v < 0);
      const total = sum(vals);
      const avg = (xs) => (xs.length ? sum(xs) / xs.length : null);
      const decided = wins.length + losses.length;
      const pf = losses.length ? sum(wins) / -sum(losses) : null;
      const ratio = wins.length && losses.length ? avg(wins) / -avg(losses) : null;
      const cells = [
        [useR ? 'TOTAL R' : 'NET P&L', fmt(total), tone(total)],
        ['WIN RATE', decided ? `${((wins.length / decided) * 100).toFixed(1)}%` : '—', C.text],
        ['PROFIT FACTOR', pf === null ? '—' : pf.toFixed(2), pf === null ? C.text : pf >= 1 ? C.up : C.down],
        ['EXPECTANCY', fmt(avg(vals)), tone(avg(vals) || 0)],
        ['TOTAL TRADES', String(trades.length), C.text],
        ['AVG WIN', fmt(avg(wins)), C.text],
        ['AVG LOSS', fmt(avg(losses)), C.text],
        ['P/L RATIO', ratio === null ? '—' : ratio.toFixed(2), ratio === null ? C.text : ratio >= 1 ? C.up : C.down],
      ];
      const gap = 16, cw = (INNER - gap * 3) / 4, ch = 104;
      if (draw) {
        cells.forEach(([label, text, color], i) => {
          const x = PAD + (i % 4) * (cw + gap), top = y + Math.floor(i / 4) * (ch + gap);
          ctx.fillStyle = C.panel;
          ctx.strokeStyle = C.line;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(x + 0.5, top + 0.5, cw, ch, 14);
          ctx.fill();
          ctx.stroke();
          font(ctx, 700, 13);
          ctx.letterSpacing = '1.6px';
          ctx.fillStyle = C.muted;
          ctx.fillText(tx(label), x + 20, top + 34);
          ctx.letterSpacing = '0px';
          font(ctx, 700, 32);
          ctx.fillStyle = color;
          ctx.fillText(text, x + 20, top + 78);
        });
      }
      return ch * 2 + gap + 28;
    });
  }

  if (opt.trades && trades.length) {
    blocks.push((ctx, y, draw) => {
      const shown = trades.slice(0, 40), rowH = 46;
      const multiDay = data.range !== 'day';
      const cols = [PAD + 16, PAD + 70, PAD + (multiDay ? 250 : 170), PAD + (multiDay ? 370 : 300), PAD + (multiDay ? 480 : 420), PAD + (multiDay ? 760 : 720)];
      if (draw) {
        font(ctx, 700, 13);
        ctx.letterSpacing = '1.6px';
        ctx.fillStyle = C.muted;
        ['#', multiDay ? 'DATE' : 'TIME', 'SYMBOL', 'SIDE', 'ENTRY → EXIT', 'SETUP'].forEach((h, i) => ctx.fillText(tx(h), cols[i], y + 20));
        ctx.textAlign = 'right';
        ctx.fillText(useR ? 'R' : 'NET P&L', W - PAD - 16, y + 20);
        ctx.textAlign = 'left';
        ctx.letterSpacing = '0px';
        shown.forEach((t, i) => {
          const top = y + 34 + i * rowH;
          ctx.fillStyle = i % 2 ? 'transparent' : C.panel;
          ctx.beginPath();
          ctx.roundRect(PAD, top, INNER, rowH - 4, 10);
          ctx.fill();
          font(ctx, 500, 17);
          ctx.fillStyle = C.muted;
          ctx.fillText(String(i + 1), cols[0], top + 28);
          ctx.fillStyle = C.text;
          ctx.fillText(multiDay ? `${t.date.slice(5)} ${t.time}` : t.time, cols[1], top + 28);
          font(ctx, 600, 17);
          ctx.fillText(t.symbol, cols[2], top + 28);
          ctx.fillStyle = t.direction === 'long' ? C.up : C.down;
          ctx.fillText(tx(t.direction === 'long' ? 'Long' : 'Short'), cols[3], top + 28);
          font(ctx, 500, 17);
          ctx.fillStyle = C.text;
          ctx.fillText(t.pnlOnly ? '—' : `${Number(t.entry).toLocaleString('en-US')} → ${Number(t.exit).toLocaleString('en-US')}`, cols[4], top + 28);
          ctx.fillStyle = C.muted;
          ctx.fillText(String((t.setups || []).join(', ') || '—').slice(0, 22), cols[5], top + 28);
          const v = value(t);
          font(ctx, 700, 17);
          ctx.fillStyle = v === null ? C.muted : tone(v);
          ctx.textAlign = 'right';
          ctx.fillText(fmt(v), W - PAD - 16, top + 28);
          ctx.textAlign = 'left';
        });
        if (trades.length > shown.length) {
          font(ctx, 500, 16);
          ctx.fillStyle = C.muted;
          ctx.fillText(`+ ${trades.length - shown.length} ${tx('more')}`, cols[0], y + 34 + shown.length * rowH + 22);
        }
      }
      return 34 + shown.length * rowH + (trades.length > shown.length ? 34 : 0) + 22;
    });
  }

  // the day's own review (DAY_QUESTIONS), when the card is for one day and it has one
  const dayAnswers = opt.day ? dayCardParts(data.day) : [];
  if (dayAnswers.length) {
    blocks.push((ctx, y, draw) => title(ctx, y, 'Day review', draw));
    blocks.push((ctx, y, draw) => {
      let h = 26;
      const lines = [];
      font(ctx, 400, 18);
      for (const [q, text] of dayAnswers) {
        const wrapped = wrap(ctx, text, INNER - 48);
        lines.push([q, wrapped, h]);
        h += 30 + wrapped.length * 27 + 14;
      }
      if (draw) {
        ctx.fillStyle = C.panel;
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(PAD + 0.5, y + 0.5, INNER, h, 14);
        ctx.fill();
        ctx.stroke();
        for (const [q, wrapped, at] of lines) {
          font(ctx, 700, 13);
          ctx.letterSpacing = '1.4px';
          ctx.fillStyle = C.accent;
          ctx.fillText(q.toUpperCase(), PAD + 24, y + at + 18);
          ctx.letterSpacing = '0px';
          font(ctx, 400, 18);
          ctx.fillStyle = C.text;
          wrapped.forEach((line, k) => ctx.fillText(line, PAD + 24, y + at + 46 + k * 27));
        }
      }
      return h + 16;
    });
  }

  // review: what was written about each trade
  const reviewed = (opt.notes || opt.answers || opt.mistakes) ? trades.map((t, i) => {
    const n = data.notes.get(t.id) || { thesis: '', notes: '', answers: [] };
    const parts = [];
    if (opt.notes && n.thesis) parts.push(['Thesis', n.thesis]);
    if (opt.notes && n.notes) parts.push(['Notes', n.notes]);
    if (opt.answers) for (const a of n.answers) parts.push([a.question, a.answer || '—']);
    if (opt.mistakes && t.mistakes && t.mistakes.length) parts.push(['Mistakes', t.mistakes.join(', ')]);
    if (opt.mistakes && t.tags && t.tags.length) parts.push(['Tags', t.tags.join(', ')]);
    return { t, i, parts };
  }).filter((x) => x.parts.length).slice(0, 14) : [];
  if (reviewed.length) {
    blocks.push((ctx, y, draw) => title(ctx, y, 'Review', draw));
    for (const { t, i, parts } of reviewed) {
      blocks.push((ctx, y, draw) => {
        let h = 62;
        const lines = [];
        font(ctx, 400, 18);
        for (const [label, text] of parts) {
          const wrapped = wrap(ctx, text, INNER - 48);
          lines.push([label, wrapped, h]);
          h += 30 + wrapped.length * 27 + 10;
        }
        if (draw) {
          ctx.fillStyle = C.panel;
          ctx.strokeStyle = C.line;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(PAD + 0.5, y + 0.5, INNER, h, 14);
          ctx.fill();
          ctx.stroke();
          font(ctx, 700, 20);
          ctx.fillStyle = C.text;
          ctx.fillText(`#${i + 1}  ${t.symbol} · ${tx(t.direction === 'long' ? 'Long' : 'Short')} · ${t.time}`, PAD + 24, y + 40);
          const v = value(t);
          ctx.textAlign = 'right';
          ctx.fillStyle = v === null ? C.muted : tone(v);
          ctx.fillText(fmt(v), W - PAD - 24, y + 40);
          ctx.textAlign = 'left';
          for (const [label, wrapped, at] of lines) {
            font(ctx, 700, 13);
            ctx.letterSpacing = '1.4px';
            ctx.fillStyle = C.accent;
            ctx.fillText(tx(label).toUpperCase(), PAD + 24, y + at + 18);
            ctx.letterSpacing = '0px';
            font(ctx, 400, 18);
            ctx.fillStyle = C.text;
            wrapped.forEach((line, k) => ctx.fillText(line, PAD + 24, y + at + 46 + k * 27));
          }
        }
        return h + 16;
      });
    }
  }

  if (!trades.length) {
    blocks.push((ctx, y, draw) => {
      if (draw) {
        font(ctx, 500, 22);
        ctx.fillStyle = C.muted;
        ctx.fillText(tx('No trades in this period.'), PAD, y + 40);
      }
      return 90;
    });
  }
  blocks.push((ctx, y, draw) => {
    if (draw) {
      font(ctx, 400, 15);
      ctx.fillStyle = C.faint;
      ctx.fillText(`${BRAND} · ${data.date}`, PAD, y + 26);
    }
    return 44;
  });

  // measure, size the canvas, then draw
  const probe = document.createElement('canvas').getContext('2d');
  let height = PAD;
  for (const b of blocks) height += b(probe, 0, false);
  canvas.width = W;
  canvas.height = Math.ceil(height + PAD - 20);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (background) {
    // your picture, sharp, filling the card (cropped from its centre, never stretched), under a dark veil so the
    // text and charts stay readable
    const k = Math.max(canvas.width / background.width, canvas.height / background.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(background, (canvas.width - background.width * k) / 2, (canvas.height - background.height * k) / 2, background.width * k, background.height * k);
    ctx.fillStyle = 'rgba(10,11,14,0.58)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.textBaseline = 'alphabetic';
  let y = PAD;
  for (const b of blocks) y += b(ctx, y, true);
}

/** Review card: pick the day (or its week / month) and the sections, then copy or save the picture. */
/** The "New trade" button; its form also has Import trades, so a platform's export can be brought in from anywhere. */
function newTradeButton(parent, app, plugin) {
  const button = parent.createEl('button', { text: 'New trade', cls: 'mod-cta' });
  button.addEventListener('click', () => new NewTradeModal(app, plugin).open());
  return button;
}

