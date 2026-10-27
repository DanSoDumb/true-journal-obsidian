// ---------- platform imports ----------
//
// One engine reads exports from many platforms: CSV (comma, semicolon or tab), HTML statements and Excel .xlsx.
// Every file becomes rows of cells; a platform profile then says which columns mean what. Exports come in two shapes:
// one row per finished trade (mapped straight onto trades) or one row per fill / filled order, paired first in,
// first out per account and symbol: a trade opens when the position leaves flat and closes when it is flat again, so
// adds and partial exits stay inside one trade, and a reversal closes one trade and opens the next.
// Columns are matched by name ignoring case, spaces and underscores; an alias ending in * matches the start of a name
// ("openingtime*" matches "Opening Time (UTC+0)"). The header does not have to be the first row.

const normHeader = (h) => String(h).trim().toLowerCase().replace(/[\s_]/g, '');
/** "$1,234.50", "$(480.00)", "-1 234.50", "0,5", "0.10 Lots", "0.010 BTC" -> number; NaN when there is none. */
const cleanNumber = (v) => {
  let s = String(v === undefined || v === null ? '' : v).trim().replace(/−/g, '-').replace(/^\((.*)\)$/, '-$1').replace(/\$\(([^)]*)\)/, '-$1');
  if (/^-?[\d\s.]*\d,\d{1,8}$/.test(s.replace(/[$€£\s]/g, '')) && !/^-?\d{1,3}(,\d{3})+$/.test(s.replace(/[$€£\s]/g, ''))) s = s.replace(/\./g, '').replace(',', '.');
  const m = s.replace(/[$€£,\s]/g, '').match(/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i);
  return m ? Number(m[0]) : NaN;
};
/** A number typed into a form, read strictly: "29,815.50", "$1,119", "-120.5", "0,5" (a comma for the decimals) -> the
 *  number; empty, letters or anything else -> NaN, so the form can say which field is wrong. */
function formNumber(v) {
  const s = String(v === undefined || v === null ? '' : v).trim().replace(/−/g, '-').replace(/[$\s]/g, '');
  if (!s) return NaN;
  if (/^[+-]?(\d{1,3}(,\d{3})+|\d+)(\.\d*)?$/.test(s) || /^[+-]?\.\d+$/.test(s)) return Number(s.replace(/,/g, ''));
  if (/^[+-]?\d+,\d+$/.test(s)) return Number(s.replace(',', '.'));          // 0,5 lot, 12,5
  if (/^[+-]?[\d,]*\d(\.\d*)?$/.test(s)) return Number(s.replace(/,/g, '')); // commas in odd places: 29,8155.5
  return NaN;
}
/** A price or amount with thousands commas, as it is being typed: "29815.5" -> "29,815.5", "-1119" -> "-1,119".
 *  Only digits, one dot and a leading minus are kept. */
function withThousands(raw) {
  const s = String(raw === undefined || raw === null ? '' : raw).replace(/−/g, '-').replace(/[^\d.-]/g, '');
  const neg = s.startsWith('-') ? '-' : '';
  const body = s.replace(/-/g, '');
  const dot = body.indexOf('.');
  const whole = (dot < 0 ? body : body.slice(0, dot)).replace(/^0+(?=\d)/, '');
  const decimals = dot < 0 ? '' : `.${body.slice(dot + 1).replace(/\./g, '')}`;
  return neg + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + decimals;
}
/** Re-formats a price field with thousands commas while typing, keeping the cursor after the same digit. */
function formatAmountInput(input) {
  const before = input.value;
  const caret = typeof input.selectionStart === 'number' ? input.selectionStart : before.length;
  const keep = before.slice(0, caret).replace(/[^\d.-]/g, '').length;
  const after = withThousands(before);
  if (after === before) return;
  input.value = after;
  let pos = 0;
  for (let seen = 0; pos < after.length && seen < keep; pos++) if (/[\d.-]/.test(after[pos])) seen++;
  if (typeof input.setSelectionRange === 'function') input.setSelectionRange(pos, pos);
}
// Exchanges whose TradingView symbols are futures; anything else (BINANCE:, FX:, NASDAQ: …) is traded in units.
const FUTURES_EXCHANGES = /^(CME|CME_MINI|CBOT|CBOT_MINI|COMEX|COMEX_MINI|NYMEX|NYMEX_MINI|ICEUS|ICEEUR|EUREX|CFE|SGX|OSE)$/;
const CURRENCIES = /^(USD|EUR|GBP|JPY|AUD|NZD|CAD|CHF|SGD|HKD|CNH|SEK|NOK|MXN|ZAR|TRY)$/;
/** A symbol traded in units (crypto, forex, stocks), where a point value of 1 is right and no warning is needed. */
function isUnitSymbol(name) {
  const raw = String(name || '').trim().toUpperCase();
  const exchange = raw.match(/^([A-Z0-9_]+):/);
  if (exchange) return !FUTURES_EXCHANGES.test(exchange[1]);
  const s = raw.replace(/^\//, '').split(/[\s@]+/)[0].replace(/\.P$/, '').replace(/[-_/]/g, '');
  if (/\d!?$/.test(s)) return false; // a dated or continuous futures contract (NQZ6, NQ1!)
  if (/(USDT|USDC|BUSD|FDUSD|PERP)$/.test(s) || /^[A-Z0-9]{2,10}USD$/.test(s) && !CURRENCIES.test(s.slice(0, 3))) return true; // crypto
  return s.length === 6 && CURRENCIES.test(s.slice(0, 3)) && CURRENCIES.test(s.slice(3)); // forex pair
}
/** "CME_MINI:NQ1!", "NQ 12-26", "NQ Dec26", "NQZ5@CME", "NQZ26_FUT_CME", "NQZ6", "NQ1", "/MNQZ26", "CON.F.US.ENQ.Z26" -> product root ("NQ"). */
function symbolRoot(name) {
  let s = String(name || '').trim().toUpperCase().replace(/^\//, '');
  s = s.replace(/^[A-Z0-9_]+:/, '').split(/[\s@]+/)[0].split('_')[0]; // NQZ26_FUT_CME (Sierra Chart)
  if (/\d+!$/.test(s)) return s.replace(/\d+!$/, ''); // TradingView continuous contract: NQ1!, NQ2!
  if (CSV_POINT_VALUES[s]) return s;
  const continuous = s.replace(/1$/, '');
  if (s !== continuous && CSV_POINT_VALUES[continuous]) return continuous;
  return contractRoot(s);
}
const sideOf = (v) => {
  const s = String(v || '').trim().toLowerCase();
  if (/^(open long|close short|buy|bot|bought|long|b\b|bc\b|cover)/.test(s)) return 1;
  if (/^(open short|close long|sell|sld|sold|short|s\b|ss\b)/.test(s)) return -1;
  return s === 'b' ? 1 : s === 's' ? -1 : 0;
};

// ---- reading files into rows ----

/** Bytes of a text export -> text. MetaTrader saves its HTML reports in UTF-16; everything else is read as UTF-8. */
function decodeExport(buffer) {
  const b = new Uint8Array(buffer);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
  if (b.length > 8 && b[1] === 0 && b[3] === 0 && b[5] === 0) return new TextDecoder('utf-16le').decode(b); // UTF-16 without a mark
  return new TextDecoder('utf-8').decode(b);
}
const decodeEntities = (s) => s.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&apos;/gi, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
/** Every <tr> of an HTML page -> its cell texts. A cell spanning n columns adds n−1 empty cells after it; cells marked
 *  class="hidden" (MetaTrader's spacers) are left out so the data lines up with the header. */
function htmlTableRows(html) {
  const rows = [];
  for (const tr of String(html).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row = [];
    for (const td of tr[1].matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi)) {
      if (/class\s*=\s*["']?hidden/i.test(td[1])) continue;
      row.push(decodeEntities(td[2].replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim());
      const span = Number((td[1].match(/colspan\s*=\s*["']?(\d+)/i) || [])[1] || 1);
      for (let k = 1; k < span; k++) row.push('');
    }
    if (row.length) rows.push(row);
  }
  return rows;
}
/** Delimited text -> rows (RFC-4180 quoting), with the separator guessed from the first lines: comma, semicolon or tab. */
function parseDelimited(text) {
  const src = String(text).replace(/^﻿/, '');
  const sample = src.split(/\r?\n/).filter((l) => l.trim()).slice(0, 5).join('\n').replace(/"[^"]*"/g, '');
  const counts = { ',': (sample.match(/,/g) || []).length, ';': (sample.match(/;/g) || []).length, '\t': (sample.match(/\t/g) || []).length };
  const sep = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || ',';
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"' && cell.trim() === '') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}
/** Excel .xlsx -> rows of its first sheet. Dates stay as Excel day numbers; normTime turns them into times. */
async function xlsxRows(buffer) {
  const files = await unzipFiles(buffer);
  // MetaTrader 5 writes the parts of its Open XML report in UTF-16; Excel and the rest use UTF-8
  const text = (name) => { const f = files.find((x) => x.name === name); return f ? decodeExport(f.data) : ''; };
  const shared = [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map((m) => decodeEntities([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
  const sheets = files.map((f) => f.name).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  if (!sheets.length) return [];
  const colIndex = (ref) => [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const rows = [];
  for (const r of text(sheets[0]).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = (c[1].match(/r="([A-Z]+)\d+"/) || [])[1];
      const type = (c[1].match(/t="(\w+)"/) || [])[1];
      const body = c[2] || '';
      const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let value = '';
      if (type === 's') value = shared[Number(v)] || '';
      else if (type === 'inlineStr') value = decodeEntities([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''));
      else if (v !== undefined) value = decodeEntities(v);
      const at = ref ? colIndex(ref) : row.length;
      while (row.length < at) row.push('');
      row[at] = value;
    }
    if (row.some((x) => String(x).trim() !== '')) rows.push(row);
  }
  return rows;
}
/** A chosen file -> { rows, text }. */
async function readExport(name, buffer) {
  const b = new Uint8Array(buffer);
  if (/\.xlsx$/i.test(name) || (b[0] === 0x50 && b[1] === 0x4b)) return { rows: await xlsxRows(buffer), text: '' };
  const text = decodeExport(buffer);
  return { rows: /<table[\s>]/i.test(text) ? htmlTableRows(text) : parseDelimited(text), text };
}

// ---- times ----

const pad2 = (n) => String(n).padStart(2, '0');
const wallClock = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
/** Any time a platform writes -> "YYYY-MM-DD HH:MM:SS" or M/D/YYYY form that parseStamp reads. Times marked as UTC
 *  (a trailing Z, or utcOffset from a header such as "Time (UTC+0)") are moved to this computer's clock; other
 *  times are kept as written. Excel day numbers and epoch milliseconds are read too. */
function normTime(value, utcOffset = null, dayFirst = false) {
  let s = String(value === undefined || value === null ? '' : value).trim();
  if (!s) return '';
  if (/^\d{12,13}$/.test(s)) return wallClock(new Date(Number(s)));
  if (/^\d{10}$/.test(s)) return wallClock(new Date(Number(s) * 1000));
  if (/^\d{5}(\.\d+)?$/.test(s) && Number(s) > 20000 && Number(s) < 80000) { // Excel day number, no time zone
    const d = new Date(Math.round((Number(s) - 25569) * 86400000));
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
  }
  s = s.replace(/^(\d{4})(\d{2})(\d{2})[;,\sT-]*(\d{2}):?(\d{2}):?(\d{2})?$/, (_, y, mo, d, h, mi, se) => `${y}-${mo}-${d} ${h}:${mi}:${se || '00'}`); // 20261006;093048 (IBKR Flex)
  s = s.replace(/^(\d{4})[.\/](\d{1,2})[.\/](\d{1,2})/, (_, y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`); // 2026.10.06 (MetaTrader)
  if (dayFirst) s = s.replace(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/, (_, d, m, y) => `${y}-${pad2(m)}-${pad2(d)}`); // 06/10/2026 = 6 October
  s = s.replace(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/, (_, d, m, y) => `${y}-${pad2(m)}-${pad2(d)}`); // 06.10.2026 (day first)
  s = s.replace(/^(\d{4}-\d{2}-\d{2}),?\s*-?\s*(?=\d)/, '$1 ').replace(/^(\d{1,2}\/\d{1,2}\/\d{4}),?\s*-?\s*(?=\d)/, '$1 ');
  const zoned = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})$/i);
  if (zoned) return wallClock(new Date(`${zoned[1]}T${zoned[2].length === 5 ? `${zoned[2]}:00` : zoned[2]}${zoned[3].toUpperCase() === 'Z' ? 'Z' : zoned[3].replace(/^([+-]\d{2})(\d{2})$/, '$1:$2')}`));
  if (utcOffset !== null) {
    const ms = stampMs(s);
    if (Number.isFinite(ms)) return wallClock(new Date(ms - utcOffset * 3600000));
  }
  return s.replace('T', ' ').replace(/(\d{2}:\d{2}(:\d{2})?)\.\d+$/, '$1');
}

// ---- columns ----

/** Finds the header row (the first row with every `signature` column, searched in the first 80 rows) and returns a
 *  reader for the columns named in `aliases` ({ field: [names] }), or null. */
function columnsOf(rows, aliases, signature = []) {
  const matches = (h, name) => { const n = normHeader(name); return n.endsWith('*') ? h.startsWith(n.slice(0, -1)) : h === n; };
  const look = rows.slice(0, 80);
  const at = look.findIndex((r) => { const hs = r.map(normHeader); return signature.every((s) => hs.some((h) => matches(h, s))); });
  if (at < 0) return null;
  const hs = rows[at].map(normHeader);
  const idx = {}, all = {}, offset = {};
  for (const [field, names] of Object.entries(aliases)) {
    all[field] = hs.map((h, i) => (names.some((n) => matches(h, n)) ? i : -1)).filter((i) => i >= 0);
    idx[field] = names.map((n) => hs.findIndex((h) => matches(h, n))).find((i) => i >= 0) ?? -1;
    const utc = idx[field] >= 0 ? hs[idx[field]].match(/utc([+-]\d+(?:\.\d+)?)?/) : null;
    offset[field] = utc ? Number(utc[1] || 0) : null;
  }
  return { at, body: rows.slice(at + 1), get: (r, f) => (idx[f] >= 0 ? r[idx[f]] : undefined), has: (f) => idx[f] >= 0,
    all: (r, f) => (all[f] || []).map((i) => r[i]), utc: (f) => offset[f] };
}
const timeOf = (c, r, field, dateField, dayFirst) => {
  const raw = c.get(r, field);
  const date = dateField && c.has(dateField) && !/\d{4}|\d\/\d/.test(String(raw || '').slice(0, 10)) ? `${c.get(r, dateField)} ` : '';
  return normTime(`${date}${raw || ''}`.trim(), c.utc(field), dayFirst);
};
/** Whether d/m/yyyy dates in these columns are day first: a first number above 12 proves it (13/10/2026). */
const isDayFirst = (c, fields) => c.body.some((r) => fields.some((f) => { const m = String(c.get(r, f) || '').match(/^(\d{1,2})\/(\d{1,2})\/\d{4}/); return m && Number(m[1]) > 12; }));
const feesOf = (c, r) => sum(c.all(r, 'fees').map(cleanNumber).filter(Number.isFinite).map(Math.abs));

// ---- turning rows into trades ----

/** Point value and market for a symbol: units (crypto, stocks, forex) are 1; CFD lots use the CFD table or the
 *  broker's own P&L; futures use the contract list. `derived` is profit ÷ (price move × size) when the file has it. */
function pointValueFor(raw, root, market, derived) {
  if (market === 'units' || (market !== 'cfd' && isUnitSymbol(raw))) return { pointValue: 1, market: 'futures', known: true };
  if (market === 'cfd') {
    const known = instrumentValue('cfd', raw);
    if (known && (!Number.isFinite(derived) || Math.abs(derived - known) / known < 0.002)) return { pointValue: known, market: 'cfd', known: true };
    return Number.isFinite(derived) && derived > 0 ? { pointValue: Number(derived.toPrecision(6)), market: 'cfd', known: true } : { pointValue: known || 1, market: 'cfd', known: !!known };
  }
  if (CSV_POINT_VALUES[root]) return { pointValue: CSV_POINT_VALUES[root], market: 'futures', known: true };
  if (Number.isFinite(derived) && derived > 0) return { pointValue: Number(derived.toPrecision(6)), market: 'futures', known: true };
  return { pointValue: 1, market: 'futures', known: false };
}
function importedTrade(f) {
  return {
    id: `csv-${f.id}`, date: f.stamp.date, time: f.stamp.time, symbol: f.symbol, direction: f.direction, entry: f.entry, exit: f.exit,
    stop: Number.isFinite(f.stop) && f.stop > 0 ? f.stop : null, qty: f.qty, pointValue: f.pointValue,
    fees: Math.round((f.fees || 0) * 100) / 100, account: f.account || '', setups: [], tags: [], mistakes: [], thesis: '', notes: '',
    reviewed: false, review: [], duration: f.held > 0 ? f.held : null, market: f.market || 'futures',
    pnlOverride: Number.isFinite(f.pnlOverride) ? Math.round(f.pnlOverride * 100) / 100 : null,
  };
}

/** Fills -> finished trades, first in first out. fill: { ms, stamp, symbol, raw, side (+1 / -1), qty, price, fee, account, id }. */
function tradesFromFills(fills, prefix, market) {
  const groups = new Map();
  fills.forEach((f, seq) => {
    const key = `${f.account || ''}|${f.symbol}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...f, seq });
  });
  const trades = [];
  let open = 0;
  for (const list of groups.values()) {
    list.sort((a, b) => a.ms - b.ms || a.seq - b.seq);
    let pos = 0, cur = null;
    for (const f of list) {
      let qty = f.qty;
      const feePer = f.qty ? (f.fee || 0) / f.qty : 0;
      while (qty > 1e-9) {
        if (Math.abs(pos) < 1e-9) { pos = 0; cur = { side: f.side, first: f, last: f, entries: [], exits: [], fees: 0 }; }
        if (pos === 0 || Math.sign(pos) === f.side) {
          cur.entries.push([f.price, qty]); cur.fees += feePer * qty; pos += f.side * qty; qty = 0;
        } else {
          const take = Math.min(qty, Math.abs(pos));
          cur.exits.push([f.price, take]); cur.fees += feePer * take; cur.last = f; pos += f.side * take; qty -= take;
          if (Math.abs(pos) < 1e-9) {
            const q = sum(cur.entries.map(([, n]) => n));
            const pv = f.pointValue ? { pointValue: f.pointValue, market: 'futures' } : pointValueFor(cur.first.raw, cur.first.symbol, market, NaN);
            trades.push(importedTrade({
              id: `${prefix}-${cur.first.account || ''}-${cur.first.symbol}-${cur.first.id || ''}-${cur.first.ms}`,
              stamp: cur.first.stamp, symbol: cur.first.symbol, direction: cur.side > 0 ? 'long' : 'short',
              entry: sum(cur.entries.map(([p, n]) => p * n)) / q, exit: sum(cur.exits.map(([p, n]) => p * n)) / q, qty: Math.round(q * 1e8) / 1e8,
              fees: cur.fees, held: (cur.last.ms - cur.first.ms) / 1000, account: cur.first.account, ...pv,
            }));
            pos = 0; cur = null;
          }
        }
      }
    }
    if (pos !== 0) open++;
  }
  return { trades, open };
}

// Aliases shared by the generic readers (and used as fallbacks by the platform profiles).
const TRADE_ALIASES = {
  id: ['id', 'tradeid', 'trade #', 'ticket', 'positionid', 'position', 'trade number'],
  symbol: ['symbol', 'contractname', 'contract', 'instrument', 'ticker', 'market', 'pair', 'item', 'coin', 'contracts', 'underlyingasset'],
  direction: ['direction', 'side', 'type', 'position', 'marketpos.', 'tradetype', 'openingdirection', 'long/short', 'buy/sell'],
  inAt: ['enteredat', 'entrytime*', 'entrydate*', 'entrydatetime', 'opentime*', 'opendate*', 'openingtime*', 'datestart', 'startdate*', 'entered', 'opened*', 'date'],
  outAt: ['exitedat', 'exittime*', 'exitdate*', 'exitdatetime', 'closetime*', 'closedate*', 'closingtime*', 'dateend', 'enddate*', 'exited', 'closed*'],
  entry: ['entryprice', 'avgentry*', 'openprice', 'openingprice', 'avgentryprice', 'entry'],
  exit: ['exitprice', 'avgexit*', 'closeprice', 'closingprice', 'avgexitprice', 'avgcloseprice', 'exit'],
  qty: ['size', 'qty', 'quantity', 'contracts', 'volume', 'lots', 'lot size', 'tradequantity', 'closingquantity*', 'openvolume', 'amount'],
  stop: ['stoploss', 's/l', 'sl', 'initialsl', 'stop'],
  status: ['status'],
  fees: ['fees', 'fee', 'commission*', 'commissions', 'comm', 'swap'],
  pnl: ['pnl', 'p&l', 'p/l', 'profit', 'netp&l', 'realizedp&l', 'realizedpnl', 'rpnl', 'closedp&l', 'profit/loss*', 'net*', 'grosspnl'],
};
const FILL_ALIASES = {
  id: ['executionid', 'execid', 'fillid', 'tradeid', 'id', 'orderid', 'order #', 'ordernumber', 'order'],
  symbol: ['symbol', 'contract', 'instrument', 'ticker', 'coin', 'contracts', 'market', 'pair', 'underlyingasset'],
  side: ['side', 'b/s', 'buy/sell', 'buysell', 'action', 'direction', 'dir', 'type'],
  qty: ['filledqty', 'qtyfilled', 'fillqty', 'fillquantity', 'filled', 'qty', 'quantity', 'size', 'sz', 'volume', 'contracts'],
  price: ['fillprice', 'avgfillprice', 'filledprice', 'avgfill', 'avgprice', 'executionprice', 'tradeprice', 't.price', 'px', 'price'],
  time: ['filltime*', 'executiontime*', 'exectime', 'datetime', 'date/time', 'transactiontime*', 'tradetime*', 'time*', 'timestamp', 'date'],
  date: ['date', 't/d', 'tradedate'],
  fees: ['fee', 'fees', 'commission*', 'comm', 'comm/fee', 'ibcommission', 'sec', 'taf', 'nscc', 'nasdaq', 'ecnremove', 'ecnadd'],
  account: ['account', 'accountid', 'acct'],
  status: ['status', 'state'],
};

/** One row per finished trade -> trade fields. opts: { aliases, signature, market, pnl: 'net' | 'check', keepClock, closingSide } */
function readTradeRows(rows, opts) {
  const c = columnsOf(rows, { ...TRADE_ALIASES, ...(opts.aliases || {}) }, opts.signature || []);
  if (!c || !['symbol', 'entry', 'exit', 'qty'].every((f) => c.has(f)) || !(c.has('inAt') || c.has('outAt'))) return null;
  const dayFirst = opts.dayFirst || isDayFirst(c, ['inAt', 'outAt']);
  return c.body.filter((r) => !c.has('status') || !/open|pending|active|cancel/i.test(String(c.get(r, 'status') || ''))).map((r) => {
    let qty = cleanNumber(c.get(r, 'qty'));
    const entry = cleanNumber(c.get(r, 'entry')), exit = cleanNumber(c.get(r, 'exit')), pnl = cleanNumber(c.get(r, 'pnl'));
    let side = sideOf(c.get(r, 'direction'));
    if (opts.closingSide) side = -side; // the file names the closing order (Bybit: "Sell" closes a long)
    if (!side && Number.isFinite(qty) && qty < 0) side = -1;
    if (!side && Number.isFinite(qty) && qty > 0 && c.has('direction') && /^-|short/i.test(String(c.get(r, 'qty')))) side = -1;
    if (!side && Number.isFinite(pnl) && pnl !== 0 && exit !== entry) side = Math.sign((exit - entry) * pnl);
    qty = Math.abs(qty);
    const inAt = opts.keepClock ? String(c.get(r, 'inAt') || c.get(r, 'outAt') || '') : timeOf(c, r, c.has('inAt') ? 'inAt' : 'outAt', null, dayFirst);
    const outAt = opts.keepClock ? String(c.get(r, 'outAt') || '') : timeOf(c, r, 'outAt', null, dayFirst);
    return { id: c.get(r, 'id'), inAt, outAt, symbol: c.get(r, 'symbol'), side, entry, exit, qty, stop: cleanNumber(c.get(r, 'stop')),
      fees: feesOf(c, r), pnl };
  });
}
/** One row per fill -> fills. opts: { aliases, signature, filter(row, columns) } */
function readFillRows(rows, opts) {
  const c = columnsOf(rows, { ...FILL_ALIASES, ...(opts.aliases || {}) }, opts.signature || []);
  if (!c || !['symbol', 'qty', 'price', 'time'].every((f) => c.has(f))) return null;
  const dayFirst = opts.dayFirst || isDayFirst(c, ['time', 'date']);
  return c.body.filter((r) => (opts.filter ? opts.filter(r, c) : !c.has('status') || /fill|complete|executed|done/i.test(String(c.get(r, 'status') || 'filled')))).map((r) => {
    const rawQty = cleanNumber(c.get(r, 'qty'));
    let side = opts.side ? opts.side(r, c) : sideOf(c.get(r, 'side'));
    if (!side && Number.isFinite(rawQty) && rawQty !== 0) side = Math.sign(rawQty); // signed quantity (Interactive Brokers)
    return { id: c.get(r, 'id'), time: timeOf(c, r, 'time', 'date', dayFirst), symbol: c.get(r, 'symbol'), account: c.get(r, 'account'), side,
      qty: Math.abs(rawQty), price: cleanNumber(c.get(r, 'price')), fee: feesOf(c, r), pointValue: opts.pointValueOf ? opts.pointValueOf(r, c) : null };
  });
}

/** MetaTrader report (5: Positions table; 4: Closed Transactions) -> trade fields, or null. */
function metaTraderRows(rows) {
  const h = (r) => r.map(normHeader);
  let hi = rows.findIndex((r) => { const x = h(r); return x.includes('position') && x.includes('symbol') && x.includes('volume') && x.filter((y) => y === 'time').length >= 2; });
  let v4 = false, sl = -1;
  if (hi < 0) { hi = rows.findIndex((r) => { const x = h(r); return x.includes('ticket') && x.includes('item') && x.includes('size') && x.includes('closetime'); }); v4 = hi >= 0; }
  // A terminal in another language (Vietnamese, Russian …) translates every heading except "S / L" and "T / P". The
  // Positions table keeps the same 13 columns in every language, so it is read by position around "S / L":
  // Time, Position, Symbol, Type, Volume, Price, S / L, T / P, Time, Price, Commission, Swap, Profit.
  if (hi < 0) {
    hi = rows.findIndex((r) => { const x = h(r); return x.indexOf('s/l') >= 6 && x.indexOf('t/p') === x.indexOf('s/l') + 1; });
    if (hi >= 0) sl = h(rows[hi]).indexOf('s/l');
  }
  if (hi < 0) return null;
  const x = h(rows[hi]);
  const at = (name, nth = 0) => x.reduce((acc, y, i) => (y === name ? [...acc, i] : acc), [])[nth];
  const col = sl >= 0
    ? { inAt: sl - 6, id: sl - 5, symbol: sl - 4, type: sl - 3, qty: sl - 2, entry: sl - 1, sl, outAt: sl + 2, exit: sl + 3, commission: sl + 4, swap: sl + 5, profit: sl + 6 }
    : v4
    ? { inAt: at('opentime'), id: at('ticket'), symbol: at('item'), type: at('type'), qty: at('size'), entry: at('price'), sl: at('s/l'), outAt: at('closetime'), exit: at('price', 1), commission: at('commission'), taxes: at('taxes'), swap: at('swap'), profit: at('profit') }
    : { inAt: at('time'), id: at('position'), symbol: at('symbol'), type: at('type'), qty: at('volume'), entry: at('price'), sl: at('s/l'), outAt: at('time', 1), exit: at('price', 1), commission: at('commission'), swap: at('swap'), profit: at('profit') };
  const accountRow = rows.slice(0, hi).find((r) => /^account:?/i.test(String(r[0] || '').trim()));
  // the login, also in a translated report: "26760193 (USD, Server, demo, Hedge)"
  const loginRow = rows.slice(0, hi).map((r) => r.join(' ')).find((t) => /\b\d{4,}\s*\([A-Z]{3},/.test(t));
  const accountNo = accountRow ? (accountRow.join(' ').match(/\d{4,}/) || [])[0] : loginRow ? loginRow.match(/\b(\d{4,})\s*\([A-Z]{3},/)[1] : undefined;
  const out = [];
  for (const r of rows.slice(hi + 1)) {
    const type = String(r[col.type] || '').trim().toLowerCase();
    if (!/^(buy|sell)$/.test(type)) { if (out.length && r.filter((y) => String(y).trim() !== '').length <= 2) break; continue; }
    const num = (i) => (i === undefined ? 0 : cleanNumber(r[i]) || 0);
    out.push({ id: `mt-${r[col.id]}`, inAt: normTime(r[col.inAt]), outAt: normTime(r[col.outAt]), symbol: String(r[col.symbol] || '').trim().toUpperCase(),
      side: type === 'buy' ? 1 : -1, qty: cleanNumber(r[col.qty]), entry: cleanNumber(r[col.entry]), exit: cleanNumber(r[col.exit]), stop: cleanNumber(r[col.sl]),
      fees: Math.max(0, -(num(col.commission) + num(col.swap) + num(col.taxes))), pnl: cleanNumber(r[col.profit]),
      pnlNet: num(col.profit) + num(col.commission) + num(col.swap) + num(col.taxes), account: accountNo ? `MT ${accountNo}` : '' });
  }
  return out;
}
/** Interactive Brokers activity statement: its "Trades" section, flattened to a normal header + rows. */
function ibkrStatementRows(rows) {
  const head = rows.find((r) => String(r[0]).trim() === 'Trades' && String(r[1]).trim() === 'Header');
  if (!head) return null;
  const data = rows.filter((r) => String(r[0]).trim() === 'Trades' && String(r[1]).trim() === 'Data' && /^(order|trade)$/i.test(String(r[2]).trim()));
  return [head.slice(2), ...data.map((r) => r.slice(2))];
}

/** The platforms the importer knows, in the order auto-detect tries them. shape: 'trades' | 'fills' | 'metatrader'. */
const PLATFORM_FORMATS = [
  { id: 'topstepx', label: 'TopstepX', shape: 'trades', help: 'TopstepX: pick the account, open the Trades tab, click Export, choose the dates and download the CSV.',
    signature: ['contractname', 'enteredat', 'exitedat'], keepClock: true, pnl: 'check', aliases: { direction: ['type'], fees: ['fees', 'commissions'], pnl: ['pnl'] } },
  { id: 'tradovate-performance', group: 'tradovate', label: 'Tradovate — Performance', shape: 'tradovate', help: 'Tradovate: Account → Reports → Performance, then download the CSV.',
    signature: ['buyfillid', 'sellfillid', 'boughttimestamp', 'soldtimestamp'] },
  { id: 'tradovate-orders', group: 'tradovate', label: 'Tradovate — Orders', shape: 'fills', help: 'Tradovate: Orders module, filter to Filled, then download the CSV.',
    signature: ['b/s', 'avgfillprice', 'filledqty'], aliases: { symbol: ['contract'], qty: ['filledqty'], price: ['avgfillprice', 'avgprice'], time: ['filltime', 'timestamp'] } },
  { id: 'ctrader', label: 'cTrader', shape: 'trades', market: 'cfd', pnl: 'net', dayFirst: true, help: 'cTrader: History tab, right-click → Export (CSV or HTML).',
    signature: ['openingdirection', 'closingprice'], aliases: { direction: ['openingdirection'], pnl: ['net*'], fees: ['commission*', 'swap*'], qty: ['closingquantity*', 'quantity*', 'volume*'] } },
  { id: 'metatrader', label: 'MetaTrader 4 / 5 Statement', shape: 'metatrader', market: 'cfd',
    help: 'MetaTrader 5: Toolbox → History, right-click → Report → Open XML (saves an Excel .xlsx file) or HTML (an .html file); either file works. MetaTrader 4: Account History, right-click → Save as Detailed Report.' },
  { id: 'deepcharts', label: 'DeepCharts', shape: 'generic', help: 'DeepCharts: export your trade or fill history as CSV, then choose the file.' },
  { id: 'ibkr', label: 'Interactive Brokers', shape: 'ibkr', help: 'Interactive Brokers: Reports → Statements → Activity (CSV), or a Flex Query with the Trades section as CSV.' },
  { id: 'fxreplay', label: 'FX Replay', shape: 'trades', market: 'units', pnl: 'net', help: 'FX Replay: open your session → Analytics, export the trades as CSV, then choose the file.',
    signature: ['datestart', 'dateend', 'pair', 'rpnl'],
    aliases: { symbol: ['pair'], direction: ['side'], inAt: ['datestart'], outAt: ['dateend'], entry: ['entryprice'], exit: ['avgcloseprice'], qty: ['amountclosed', 'amount'],
      stop: ['initialsl'], pnl: ['rpnl'], fees: [] } },
  { id: 'atas', label: 'ATAS', shape: 'trades', help: 'ATAS: Journal (Statistics) → export trades to Excel, then choose the .xlsx or CSV file.',
    signature: ['opentime', 'openprice', 'closetime', 'closeprice'], aliases: { qty: ['openvolume', 'volume', 'quantity'] } },
  { id: 'hyperliquid', label: 'Hyperliquid', shape: 'fills', market: 'units', help: 'Hyperliquid: Portfolio → Trade History → Export as CSV.',
    signature: ['coin', 'dir', 'px', 'sz'], aliases: { side: ['dir', 'side'], price: ['px'], qty: ['sz'], time: ['time'] } },
  { id: 'motivewave', label: 'MotiveWave', shape: 'generic', help: 'MotiveWave: Account → Trades (or Fills) panel, right-click → Export to CSV.' },
  { id: 'breakout', label: 'Breakout Terminal', shape: 'generic', market: 'units', help: 'Breakout Terminal: export your trade or order history as CSV, then choose the file.' },
  { id: 'rithmic', label: 'Rithmic', shape: 'fills', help: 'R | Trader Pro: Orders window → Completed / Order History, then Export (CSV).',
    signature: ['buy/sell', 'avgfillprice', 'qtyfilled'], aliases: { qty: ['qtyfilled', 'filledqty'], time: ['updatetime*', 'filltime*', 'createtime*', 'time*'] } },
  // Paper Trading's Trade history: every trade's entry and exit, paired by trade number, so nothing is guessed — the
  // Order History export holds only the latest 100 orders, and a file that starts inside a trade pairs the rest wrong
  { id: 'tradingview-paper-trades', group: 'tradingview-paper', label: 'TradingView Paper Trading — Trade history', shape: 'tvtrades', help: 'TradingView: Trading Panel → Paper Trading → Download data → Trade history (best: whole trades, not only the latest 100 orders).',
    signature: ['tradenumber', 'dateandtime', 'netpnlusd'] },
  { id: 'tradingview-paper', group: 'tradingview-paper', label: 'TradingView Paper Trading — Order History', shape: 'fills', limit: 100, help: 'TradingView: Trading Panel → Paper Trading → Download data → Order history (only the latest 100 orders: Trade history is better).',
    signature: ['fillprice', 'placingtime', 'side', 'status'], aliases: { price: ['fillprice', 'avgfillprice'], time: ['closingtime', 'filltime', 'placingtime'], fees: ['commission'] } },
  { id: 'blofin', label: 'Blofin', shape: 'fills', market: 'units', help: 'Blofin: Orders → Order History (or Trade History) → Export.',
    signature: ['underlyingasset', 'avgfill*'], aliases: { price: ['avgfill*', 'avgfillprice'], qty: ['filled', 'filledqty', 'qty'], time: ['ordertime*', 'time*'] } },
  { id: 'bybit-closed', group: 'bybit', label: 'Bybit — Closed P&L', shape: 'trades', market: 'units', pnl: 'net', closingSide: true, help: 'Bybit: Orders → Derivatives → Closed P&L → Export.',
    signature: ['closingdirection', 'closedp&l'], aliases: { direction: ['closingdirection'], qty: ['qty', 'closedqty', 'quantity'], inAt: ['tradetime*', 'time*'], outAt: ['tradetime*', 'time*'], pnl: ['closedp&l'] } },
  { id: 'bybit-trades', group: 'bybit', label: 'Bybit — Trade History', shape: 'fills', market: 'units', help: 'Bybit: Orders → Derivatives → Trade History → Export.',
    signature: ['filledprice', 'filledqty', 'direction'], aliases: { price: ['filledprice'], qty: ['filledqty'], side: ['direction', 'side'], time: ['transactiontime*', 'tradetime*', 'time*'] } },
  { id: 'sierrachart-trades', group: 'sierrachart', label: 'SierraChart — Trades List', shape: 'trades', help: 'Sierra Chart: Trade → Trade Activity Log → Trades tab, then File → Export (tab-separated).',
    signature: ['tradetype', 'entrydatetime', 'exitdatetime'], aliases: { id: [], direction: ['tradetype'], qty: ['tradequantity', 'quantity'] } },
  { id: 'sierrachart-fills', group: 'sierrachart', label: 'SierraChart — Trade Activity (fills)', shape: 'fills', help: 'Sierra Chart: Trade → Trade Activity Log → Fills, then File → Export (tab-separated).',
    signature: ['activitytype', 'fillprice'], filter: (r, c) => !c.has('activitytype') || /fill/i.test(String(c.get(r, 'activitytype'))),
    aliases: { side: ['buysell', 'side'], qty: ['fillquantity', 'quantity'], price: ['fillprice'], time: ['datetime', 'time*'], activitytype: ['activitytype'] } },
  { id: 'tradezero', label: 'TradeZero', shape: 'fills', market: 'units', help: 'TradeZero: Account → Trades (or Reports → Trade Detail) → Export CSV.',
    signature: ['t/d', 'exectime', 'side'], aliases: { time: ['exectime'], date: ['t/d'] } },
  { id: 'tradingtechnologies', label: 'Trading Technologies', shape: 'fills', help: 'TT: Fills widget, right-click → Export to CSV.',
    signature: ['b/s', 'fillqty', 'contract'], aliases: { qty: ['fillqty', 'qty'], time: ['time*', 'filltime*'] } },
  { id: 'ninjatrader-trades', group: 'ninjatrader', label: 'NinjaTrader — Trades', shape: 'trades', pnl: 'check', help: 'NinjaTrader: Trade Performance → Trades tab, right-click → Export, save as CSV.',
    signature: ['marketpos.', 'entrytime', 'exittime', 'entryprice', 'exitprice'], aliases: { id: [], direction: ['marketpos.'], fees: ['commission', 'clearingfee', 'exchangefee', 'ipfee', 'nfafee'], pnl: ['profit'] } },
  { id: 'ninjatrader-executions', group: 'ninjatrader', label: 'NinjaTrader — Executions', shape: 'fills', help: 'NinjaTrader: Control Center → Executions tab, right-click → Export, save as CSV.',
    signature: ['instrument', 'action', 'e/x', 'position'], aliases: { side: ['action'], qty: ['quantity'], price: ['price'], time: ['time'] } },
  { id: 'other', label: 'Own spreadsheet / other file', shape: 'generic',
    help: 'Any CSV, Excel or HTML table with one row per trade (symbol, side, entry and exit price, size, entry time) or one row per fill (time, symbol, buy/sell, quantity, price).' },
];

// Platforms that offer two kinds of export (one row per trade, or one row per order / fill) are one choice in the
// picker; the importer works out which file it was given.
const PLATFORM_GROUPS = {
  tradovate: { label: 'Tradovate', help: 'Tradovate: Account → Reports → Performance and download the CSV, or the Orders module filtered to Filled. Either file works.' },
  bybit: { label: 'Bybit', help: 'Bybit: Orders → Derivatives → Closed P&L (or Trade History) → Export. Either file works.' },
  sierrachart: { label: 'SierraChart', help: 'Sierra Chart: Trade → Trade Activity Log → Trades tab (or Fills), then File → Export. Either file works.' },
  'tradingview-paper': { label: 'TradingView Paper Trading', help: 'TradingView: Trading Panel → Paper Trading → Download data → Trade history (whole trades). Order history also works, but holds only the latest 100 orders.' },
  ninjatrader: { label: 'NinjaTrader', help: 'NinjaTrader: Trade Performance → Trades tab, or Control Center → Executions tab; right-click → Export, save as CSV. Either file works.' },
};
/** One entry per platform for the picker, in PLATFORM_FORMATS order. */
function platformChoices() {
  const seen = new Set(), out = [];
  for (const f of PLATFORM_FORMATS) {
    const id = f.group || f.id;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(f.group ? { id, ...PLATFORM_GROUPS[f.group] } : { id, label: f.label, help: f.help });
  }
  return out;
}

/** Rows of an export -> trades. choice: a platform from platformChoices(), a PLATFORM_FORMATS id, or 'auto'. Returns { trades, missingColumns, invalidRows,
 *  unknownSymbols, pnlMismatches, totalRows, open, format }. */
/** Rows of an export -> trades. Trades that close at the same second are combined into one trade with pyramid
 *  entries unless opts.pyramids is false; result.pyramids = { groups, legs }. */
function importPlatform(rows, account, choice = 'auto', opts = {}) {
  const result = readPlatform(rows, account, choice);
  let trades = result.trades, pyramids = { groups: 0, legs: 0 }, partials = { groups: 0, legs: 0 };
  if (opts.pyramids !== false && trades.length) { const c = combinePyramids(trades, true); trades = c.trades; pyramids = { groups: c.groups, legs: c.legs }; }
  // rows that share one entry and close in steps (scaling out) become one trade with partial exits
  if (opts.partials !== false && trades.length) { const c = combinePartialExits(trades, true); trades = c.trades; partials = { groups: c.groups, legs: c.legs }; }
  return { ...result, trades, pyramids, partials };
}

function readPlatform(rows, account, choice = 'auto') {
  const empty = () => ({ trades: [], missingColumns: [], invalidRows: 0, unknownSymbols: [], pnlMismatches: 0, totalRows: Math.max(0, rows.length - 1), open: 0 });
  const warn = (result, symbol, known) => { if (!known && !result.unknownSymbols.includes(symbol)) result.unknownSymbols.push(symbol); };

  const fromTrades = (format, list, opts = {}) => {
    const result = { ...empty(), format };
    for (const t of list) {
      const stamp = parseStamp(t.inAt || t.outAt || '');
      const raw = String(t.symbol || '').trim();
      const market = opts.market;
      const symbol = market === 'cfd' || market === 'units' || isUnitSymbol(raw) ? raw.toUpperCase().replace(/^[A-Z0-9_]+:/, '') : symbolRoot(raw);
      if (!stamp || !symbol || !t.side || ![t.entry, t.exit, t.qty].every(Number.isFinite) || !t.qty) { result.invalidRows++; continue; }
      const move = (t.exit - t.entry) * t.side * t.qty;
      const gross = Number.isFinite(t.pnl) ? (opts.pnl === 'net' ? t.pnl + t.fees : t.pnl) : NaN;
      const pv = pointValueFor(raw, symbol, market, move && Number.isFinite(gross) && !CSV_POINT_VALUES[symbol] ? gross / move : NaN);
      warn(result, symbol, pv.known);
      const net = Number.isFinite(t.pnlNet) ? t.pnlNet : opts.pnl === 'net' && Number.isFinite(t.pnl) ? t.pnl : NaN;
      const trade = importedTrade({ ...t, id: t.id ? `${format.id}-${t.id}` : `${format.id}-${account || t.account || ''}-${t.inAt}-${symbol}-${t.side}-${t.entry}-${t.exit}-${t.qty}`,
        stamp, symbol, direction: t.side > 0 ? 'long' : 'short', account: account || t.account, held: (stampMs(t.outAt) - stampMs(t.inAt)) / 1000,
        pnlOverride: pv.market === 'cfd' || (!CSV_POINT_VALUES[symbol] && Number.isFinite(net)) ? (Number.isFinite(net) ? net : NaN) : NaN, ...pv });
      if (format.id === 'topstepx') trade.id = `csv-${t.id || `${stamp.date}-${stamp.time}-${symbol}-${trade.direction}-${t.entry}-${t.exit}-${t.qty}`}`;
      // exact entry and exit moments, so adds that close together can be combined (see combinePyramids)
      trade._inMs = stampMs(t.inAt);
      trade._outMs = stampMs(t.outAt);
      if (Number.isFinite(trade._inMs)) trade.clock = `${stamp.time}:${String(new Date(trade._inMs).getUTCSeconds()).padStart(2, '0')}`;
      if (!Number.isFinite(trade.pnlOverride) && Number.isFinite(t.pnl) && opts.pnl !== 'net' && Math.abs(grossPnl(trade) - t.pnl) > 0.011 && Math.abs(computedPnl(trade) - t.pnl) > 0.011) result.pnlMismatches++;
      result.trades.push(trade);
    }
    return result;
  };
  const fromFills = (format, list, opts = {}) => {
    const result = { ...empty(), format };
    const fills = [];
    for (const f of list) {
      const stamp = parseStamp(f.time || ''), raw = String(f.symbol || '').trim();
      const symbol = opts.market === 'units' || isUnitSymbol(raw) ? raw.toUpperCase().replace(/^[A-Z0-9_]+:/, '') : symbolRoot(raw);
      if (!stamp || !symbol || !f.side || !Number.isFinite(f.qty) || !f.qty || !Number.isFinite(f.price)) { result.invalidRows++; continue; }
      warn(result, symbol, f.pointValue || pointValueFor(raw, symbol, opts.market, NaN).known);
      fills.push({ ...f, raw, stamp, symbol, ms: stampMs(f.time), account: account || f.account || '' });
    }
    const paired = tradesFromFills(fills, format.id, opts.market);
    return { ...result, trades: paired.trades, open: paired.open };
  };

  const tryFormat = (format) => {
    if (format.shape === 'metatrader') { const list = metaTraderRows(rows); return list && fromTrades(format, list, { market: 'cfd' }); }
    if (format.shape === 'tradovate') {
      const c = columnsOf(rows, { symbol: ['symbol'], qty: ['qty'], buy: ['buyprice'], sell: ['sellprice'], pnl: ['pnl'], bought: ['boughttimestamp'], sold: ['soldtimestamp'], buyId: ['buyfillid'], sellId: ['sellfillid'] }, format.signature);
      if (!c) return null;
      return fromTrades(format, c.body.map((r) => {
        const long = stampMs(normTime(c.get(r, 'bought'))) <= stampMs(normTime(c.get(r, 'sold')));
        return { id: `${c.get(r, 'buyId')}-${c.get(r, 'sellId')}`, inAt: normTime(long ? c.get(r, 'bought') : c.get(r, 'sold')), outAt: normTime(long ? c.get(r, 'sold') : c.get(r, 'bought')),
          symbol: c.get(r, 'symbol'), side: long ? 1 : -1, entry: cleanNumber(long ? c.get(r, 'buy') : c.get(r, 'sell')), exit: cleanNumber(long ? c.get(r, 'sell') : c.get(r, 'buy')),
          qty: cleanNumber(c.get(r, 'qty')), fees: 0, pnl: cleanNumber(c.get(r, 'pnl')) };
      }), { pnl: 'check' });
    }
    if (format.shape === 'ibkr') {
      const table = ibkrStatementRows(rows) || rows;
      const list = readFillRows(table, { signature: ['symbol', 'quantity'],
        aliases: { time: ['date/time', 'datetime', 'tradedate'], price: ['t.price', 'tradeprice', 'price'], qty: ['quantity'], fees: ['comm/fee', 'ibcommission', 'commission'],
          multiplier: ['multiplier'], assetclass: ['assetcategory', 'assetclass'], side: ['buy/sell'] },
        pointValueOf: (r, c) => {
          const m = c.has('multiplier') ? cleanNumber(c.get(r, 'multiplier')) : NaN;
          if (Number.isFinite(m) && m > 0) return m;
          return /stk|stock|cash|forex|crypto|fund|etf|bond|option/i.test(String(c.get(r, 'assetclass') || '')) && !/futures?\b/i.test(String(c.get(r, 'assetclass') || '')) ? 1 : null;
        } });
      return list && list.length ? fromFills(format, list, {}) : null;
    }
    if (format.shape === 'tvtrades') {
      const c = columnsOf(rows, { symbol: ['symbol'], number: ['tradenumber'], type: ['type'], time: ['dateandtime'], price: ['price'], qty: ['size(qty)', 'size'], pnl: ['netpnlusd'], fees: ['commissionusd'] }, format.signature);
      if (!c) return null;
      const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
      // "Oct 7, 2026 at 09:57" -> "2026-10-07 09:57"; '' for "Open —" (a trade not closed yet)
      const when = (s) => {
        const m = String(s || '').match(/([A-Za-z]{3})[a-z]*\.? (\d{1,2}), (\d{4})(?: at)? (\d{1,2}):(\d{2})/);
        return m && MONTHS[m[1].toLowerCase()] ? `${m[3]}-${String(MONTHS[m[1].toLowerCase()]).padStart(2, '0')}-${m[2].padStart(2, '0')} ${m[4].padStart(2, '0')}:${m[5]}` : '';
      };
      const byTrade = new Map();
      for (const r of c.body) {
        const key = `${c.get(r, 'symbol')}|${c.get(r, 'number')}`, type = String(c.get(r, 'type') || '').toLowerCase();
        if (!byTrade.has(key)) byTrade.set(key, {});
        byTrade.get(key)[type.startsWith('entry') ? 'entry' : 'exit'] = r;
      }
      let open = 0;
      const list = [];
      for (const [key, { entry, exit }] of byTrade) {
        if (!entry || !exit || !when(c.get(exit, 'time'))) { open++; continue; }
        list.push({ id: key.replace(/\|/g, '-'), inAt: when(c.get(entry, 'time')), outAt: when(c.get(exit, 'time')), symbol: c.get(entry, 'symbol'),
          side: /short/i.test(c.get(entry, 'type')) ? -1 : 1, entry: cleanNumber(c.get(entry, 'price')), exit: cleanNumber(c.get(exit, 'price')),
          qty: cleanNumber(c.get(entry, 'qty')), fees: Math.abs(cleanNumber(c.get(exit, 'fees')) || 0), pnl: cleanNumber(c.get(exit, 'pnl')) });
      }
      const result = fromTrades(format, list, { pnl: 'net' });
      return { ...result, open: result.open + open };
    }
    if (format.shape === 'trades') { const list = readTradeRows(rows, format); return list && fromTrades(format, list, format); }
    if (format.shape === 'fills') {
      const list = readFillRows(rows, format);
      const result = list && fromFills(format, list, format);
      // an export that stops at the platform's limit may start inside a trade: its first trades can pair wrong
      if (result && format.limit && Math.max(0, rows.length - 1) >= format.limit - 1) result.atLimit = format.limit;
      return result;
    }
    // generic: one row per trade if the columns are there, otherwise one row per fill
    const trades = readTradeRows(rows, { market: format.market });
    if (trades) return fromTrades(format, trades, { market: format.market });
    const fills = readFillRows(rows, { market: format.market });
    return fills && fromFills(format, fills, { market: format.market });
  };

  if (choice !== 'auto') {
    const variants = PLATFORM_FORMATS.filter((f) => f.id === choice || f.group === choice);
    let fallback = null;
    for (const format of variants) {
      const result = tryFormat(format);
      if (result && result.trades.length + result.invalidRows > 0) return result;
      fallback = fallback || result;
    }
    return fallback || { ...empty(), format: variants[0] || null, missingColumns: ['the columns this platform exports'] };
  }
  for (const format of PLATFORM_FORMATS) {
    if (format.shape === 'generic') continue;
    const sig = format.signature;
    if (sig && !columnsOf(rows, {}, sig)) continue; // quick check before reading
    if (format.shape === 'ibkr' && !ibkrStatementRows(rows) && !columnsOf(rows, {}, ['tradeprice', 'ibcommission'])) continue;
    const result = tryFormat(format);
    if (result && result.trades.length + result.invalidRows > 0) return result;
  }
  const other = tryFormat(PLATFORM_FORMATS.find((f) => f.id === 'other'));
  return other && other.trades.length ? other : { ...empty(), format: null, missingColumns: ['a recognised layout'] };
}

