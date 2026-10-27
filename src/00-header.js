/* TrueVision Journal — Obsidian plugin (plain JS, no build step).
 *
 * Every trade is a Markdown note whose frontmatter holds the structured data (type: tv-trade). The format is
 * the same one the TrueVision web journal exports, so an exported .zip can be unpacked straight into a vault.
 * Keep tradeToMarkdown() in sync with src/app/pages/TradeJournal/markdown.ts.
 */
const {
  Plugin, ItemView, Modal, Setting, Notice, PluginSettingTab, FuzzySuggestModal, normalizePath, TFile, TFolder, addIcon, setIcon, requestUrl, Menu, loadPdfJs,
} = require('obsidian');

const VIEW_TYPE = 'truevision-journal-dashboard';
const JOURNAL_VIEW_TYPE = 'truevision-journal-log';
const GYM_VIEW_TYPE = 'truevision-journal-gym';
const TROPHY_VIEW_TYPE = 'truevision-journal-trophies';
const LESSONS_VIEW_TYPE = 'truevision-journal-lessons';
const LOGIC_VIEW_TYPE = 'truevision-journal-logic';
const LOBBY_VIEW_TYPE = 'truevision-journal-lobby';
const ACCOUNTS_VIEW_TYPE = 'truevision-journal-accounts';
// the YouTube pane was folded into Music; its type is kept so a pane left open by an older version can be closed
const YOUTUBE_VIEW_TYPE = 'truevision-journal-youtube';
const MUSIC_VIEW_TYPE = 'truevision-journal-music';
const NHAN_VIEW_TYPE = 'truevision-journal-nhan';
const HOM_VIEW_TYPE = 'truevision-journal-hom';
const TU_VIEW_TYPES = [[NHAN_VIEW_TYPE, 'Nhẫn', 'circle-dot'], [HOM_VIEW_TYPE, 'Mở hòm', 'package-open']];
const SIDEBAR_VIEW_TYPE = 'truevision-journal-sidebar';
// TrueVision mark (a condensed "TV" monogram), on Obsidian's 100x100 icon grid
const ICON_ID = 'truevision-mark';
const ICON_SVG = '<path d="M10 20h38v13H35.5v47h-13V33H10Z" fill="currentColor"/>'
  + '<path d="M52 20h12.5l6.5 41 6.5-41H90L79 80H63Z" fill="currentColor"/>';
const DEFAULT_SETTINGS = { folder: 'TrueVision Journal', groups: '', accounts: [], lastAccount: '', gymTarget: 3, journalTarget: 3, profileName: 'Trader', profileVerified: true, cardYouTube: '', cardTikTok: '', gifFolder: '', profileShow: {}, cardShow: {}, profileRankShown: '', lessonStatus: {}, musicSource: 'link', musicVolume: 1, musicLinks: {}, radioTag: 'lofi', radioSaved: [], profileTag: '', accountInfo: {}, payouts: [], maxTradesPerDay: 3, cardSkin: 'classic', cardAnimate: true, cardTextColor: 'auto', cardTextCustom: '#FF6B9D', theme: 'auto', pair: 'auto', accent: 'auto', language: 'auto', ytdlp: 'yt-dlp', ffmpeg: 'ffmpeg', videoFormat: 'bv*+ba/b' };
const NO_ACCOUNT = 'No account';
// What a 1.0 price move is worth per contract (futures) or per 1.00 lot (CFD), in dollars.
// Futures values are the exchanges' contract multipliers. CFD values are the contract sizes prop firms such as
// FTMO and The5ers use on MetaTrader for instruments quoted in US dollars: forex 100,000 units, gold 100 oz,
// silver 5,000 oz, cash indices and crypto 1. Firms can differ on indices, oil and crypto, so the form lets the
// number be changed: the platform's "Contract size" (MT5 → Symbols → Specification) is the reference.
// Pairs not quoted in USD (USDJPY, EURGBP, GER40 …) pay out in another currency: use the manual P&L for those.
const INSTRUMENTS = {
  futures: { NQ: 20, MNQ: 2, ES: 50, MES: 5, GC: 100, MGC: 10, YM: 5, MYM: 0.5, RTY: 50, M2K: 5, CL: 1000, MCL: 100, SI: 5000 },
  cfd: { XAUUSD: 100, XAGUSD: 5000, EURUSD: 100000, GBPUSD: 100000, AUDUSD: 100000, NZDUSD: 100000, NAS100: 1, US100: 1, SP500: 1, US500: 1, US30: 1, BTCUSD: 1, ETHUSD: 1 },
};
const POINT_VALUES = INSTRUMENTS.futures;
/** The multiplier for a symbol in a market, ignoring a broker suffix such as ".cash" or "m"; null if unknown. */
function instrumentValue(market, symbol) {
  const table = INSTRUMENTS[market] || {};
  const key = String(symbol || '').toUpperCase().trim();
  if (table[key]) return table[key];
  const base = Object.keys(table).find((k) => key.startsWith(k) && /^[.\-_A-Z]{0,6}$/.test(key.slice(k.length)) && market === 'cfd');
  return base ? table[base] : null;
}

