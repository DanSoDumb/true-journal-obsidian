// ---------- CSV import ----------
//
// Built around the TopstepX "Trades" export (one row per round-trip trade). Columns are matched by name through
// aliases, so small header changes and similar exports still import. Same rules as the web journal's importer.

const CSV_POINT_VALUES = {
  NQ: 20, MNQ: 2, ES: 50, MES: 5, YM: 5, MYM: 0.5, CL: 1000, MCL: 100, GC: 100, MGC: 10, SI: 5000, SIL: 1000,
};
const CSV_ALIASES = {
  id: ['id', 'tradeid', 'trade id'],
  symbol: ['contractname', 'contract', 'symbol', 'instrument', 'ticker'],
  enteredAt: ['enteredat', 'entrytime', 'entered', 'opentime', 'entry time', 'open time', 'date'],
  exitedAt: ['exitedat', 'exittime', 'exited', 'closetime', 'exit time', 'close time'],
  entry: ['entryprice', 'entry price', 'avgentry', 'open price', 'entry'],
  exit: ['exitprice', 'exit price', 'avgexit', 'close price', 'exit'],
  qty: ['size', 'qty', 'quantity', 'contracts', 'volume'],
  direction: ['type', 'side', 'direction', 'position'],
  fees: ['fees', 'fee'],
  commissions: ['commissions', 'commission'],
  pnl: ['pnl', 'p&l', 'profit', 'profitandloss', 'realizedpnl'],
};
const CSV_REQUIRED = ['symbol', 'enteredAt', 'entry', 'exit', 'qty', 'direction'];

/** RFC-4180 style parser: quoted fields, doubled quotes, commas and newlines inside quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  const src = String(text).replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
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

/** "NQZ6", "MNQZ26", "/NQZ6", "CON.F.US.ENQ.Z26"-style names -> product root ("NQ"). */
function contractRoot(name) {
  const raw = String(name).trim().toUpperCase().replace(/^\//, '');
  const parts = raw.split(/[.\s]/).filter(Boolean);
  const dotted = raw.includes('.') && parts.length >= 2 ? parts[parts.length - 2] : raw;
  const root = dotted.replace(/[FGHJKMNQUVXZ]\d{1,2}$/, '');
  if (root === 'ENQ') return 'NQ';
  if (root === 'EP') return 'ES';
  return root || raw;
}

/** Keeps the wall-clock date and time exactly as written in the file (no timezone conversion). */
function parseStamp(value) {
  const v = String(value).trim();
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
  if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` };
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[,\s]+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i);
  if (m) {
    let hour = Number(m[4]);
    if (m[6]) hour = (hour % 12) + (m[6].toUpperCase() === 'PM' ? 12 : 0);
    const pad = (n) => String(n).padStart(2, '0');
    return { date: `${m[3]}-${pad(m[1])}-${pad(m[2])}`, time: `${pad(hour)}:${m[5]}` };
  }
  return null;
}

/** A timestamp cell -> milliseconds (seconds kept), for measuring how long a trade lasted. NaN if unreadable. */
function stampMs(value) {
  const v = String(value || '').trim();
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (!m) return NaN;
  let hour = Number(m[4]);
  if (m[7]) hour = (hour % 12) + (m[7].toUpperCase() === 'PM' ? 12 : 0);
  return Date.UTC(+m[3], +m[1] - 1, +m[2], hour, +m[5], +(m[6] || 0));
}

function importTradesCsv(text, account) {
  const rows = parseCsv(text);
  const header = (rows[0] || []).map((h) => h.trim().toLowerCase());
  const col = {};
  for (const f of Object.keys(CSV_ALIASES)) col[f] = header.findIndex((h) => CSV_ALIASES[f].includes(h) || CSV_ALIASES[f].includes(h.replace(/[\s_]/g, '')));
  const result = { trades: [], missingColumns: CSV_REQUIRED.filter((f) => col[f] < 0), invalidRows: 0, unknownSymbols: [], pnlMismatches: 0, totalRows: Math.max(0, rows.length - 1) };
  if (result.missingColumns.length) return result;
  const number = (v) => {
    const cleaned = String(v === undefined ? '' : v).replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
    return cleaned === '' ? NaN : Number(cleaned);
  };
  const get = (r, f) => (col[f] >= 0 ? r[col[f]] : undefined);
  rows.slice(1).forEach((r, i) => {
    const stamp = parseStamp(get(r, 'enteredAt') || '');
    const symbol = contractRoot(get(r, 'symbol') || '');
    const side = String(get(r, 'direction') || '').trim().toLowerCase();
    const direction = /^(long|buy|b)/.test(side) ? 'long' : /^(short|sell|s)/.test(side) ? 'short' : null;
    const entry = number(get(r, 'entry')), exit = number(get(r, 'exit')), qty = Math.abs(number(get(r, 'qty')));
    if (!stamp || !symbol || !direction || ![entry, exit, qty].every(Number.isFinite) || qty === 0) {
      result.invalidRows++;
      return;
    }
    const pointValue = CSV_POINT_VALUES[symbol];
    if (!pointValue && !result.unknownSymbols.includes(symbol)) result.unknownSymbols.push(symbol);
    const fees = sum([number(get(r, 'fees')), number(get(r, 'commissions'))].filter(Number.isFinite).map(Math.abs));
    const rawId = String(get(r, 'id') || '').trim();
    const trade = {
      id: `csv-${rawId || `${stamp.date}-${stamp.time}-${symbol}-${direction}-${entry}-${exit}-${qty}-${i}`}`,
      date: stamp.date, time: stamp.time, symbol, direction, entry, exit, stop: null, qty,
      pointValue: pointValue || 1, fees, account, setups: [], tags: [], mistakes: [], thesis: '', notes: '', reviewed: false, review: [],
    };
    const held = (stampMs(get(r, 'exitedAt')) - stampMs(get(r, 'enteredAt'))) / 1000;
    trade.duration = held > 0 ? held : null;
    const filePnl = number(get(r, 'pnl'));
    if (Number.isFinite(filePnl) && Math.abs(grossPnl(trade) - filePnl) > 0.011 && Math.abs(grossPnl(trade) - fees - filePnl) > 0.011) result.pnlMismatches++;
    result.trades.push(trade);
  });
  return result;
}

