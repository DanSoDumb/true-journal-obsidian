// ---------- day reviews ----------
// A day's own review lives in <journal folder>/Days/<date>.md: the three questions of a daily review, one ## section
// each. It is written from the P&L calendar (DayReviewModal) and printed on the review card.
const DAY_QUESTIONS = ['What did I do well today?', 'What could I improve on?', 'What will I focus on for the next session?'];

/** Note content with the body of `## heading` replaced by `text` ("_—_" when empty); the section is added when missing. */
function withSection(content, heading, text) {
  const body = String(text || '').trim() || '_—_';
  const lines = String(content).split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start < 0) return `${String(content).replace(/\s+$/, '')}\n\n## ${heading}\n${body}\n`;
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end < 0) end = lines.length;
  const rest = lines.slice(end);
  return [...lines.slice(0, start + 1), body, '', ...rest].join('\n').replace(/\n+$/, '\n');
}
/** A day note -> { heading: text } for each ## section. */
function daySections(content) {
  const out = {};
  let current = null, buf = [];
  const flush = () => { if (current !== null) out[current] = buf.join('\n').trim().replace(/^_—_$/, ''); };
  for (const line of String(content || '').replace(/^---\n[\s\S]*?\n---\n?/, '').split('\n')) {
    const h = line.match(/^## (.+)$/);
    if (h) { flush(); current = h[1].trim(); buf = []; } else if (current !== null) buf.push(line);
  }
  flush();
  return out;
}
// The forecast of a day: two scenarios with a chart per timeframe, what you anticipate (and your bias), then what
// actually happened with its own charts. Charts are images in <journal folder>/Days/<date>/ named after their slot
// ("bullish-daily", "bearish-h4", "actual-m15"); the note shows them as a table under each heading.
const DAY_TIMEFRAMES = ['Daily', 'H4', 'H1', 'M15']; // the starting set; settings.dayTimeframes holds your own list
const DAY_SCENARIOS = [['bullish', 'Bullish'], ['bearish', 'Bearish']];
const DAY_BIASES = [['bullish', 'Bullish'], ['bearish', 'Bearish'], ['neutral', 'Neutral']];
const DAY_OUTCOMES = [['bullish', 'Bullish day'], ['bearish', 'Bearish day'], ['range', 'Range day']];
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
const tfSlug = (tf) => String(tf).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const shotKey = (group, tf) => `${group}-${tfSlug(tf)}`;
/** Your timeframes (settings.dayTimeframes, or the starting set), plus any that this day already has a chart for, so
 *  removing a timeframe never hides a chart. */
function dayTimeframes(settings, shots) {
  const out = [...(Array.isArray(settings && settings.dayTimeframes) ? settings.dayTimeframes : DAY_TIMEFRAMES)];
  const seen = new Set(out.map(tfSlug));
  for (const key of shots ? shots.keys() : []) {
    const slug = key.slice(key.indexOf('-') + 1);
    if (slug && !seen.has(slug)) { seen.add(slug); out.push(slug.length <= 3 ? slug.toUpperCase() : slug.charAt(0).toUpperCase() + slug.slice(1)); }
  }
  return out;
}
/** One row of chart embeds under the timeframes, or '' when the group has no charts. */
function shotTable(shots, group, tfs = DAY_TIMEFRAMES) {
  const cells = tfs.map((tf) => { const f = shots.get(shotKey(group, tf)); return f ? `![[${f.path}]]` : ' '; });
  if (!cells.length || cells.every((x) => x === ' ')) return '';
  return [`| ${tfs.join(' | ')} |`, `| ${tfs.map(() => '---').join(' | ')} |`, `| ${cells.join(' | ')} |`].join('\n');
}
const predictionBody = (shots, tfs) => DAY_SCENARIOS.map(([key, label]) => `### ${label}\n${shotTable(shots, key, tfs) || '_—_'}`).join('\n\n');
const happenedBody = (shots, text, tfs) => [shotTable(shots, 'actual', tfs), String(text || '').trim()].filter(Boolean).join('\n\n');
/** The written part of "What actually happened", without its chart table. */
const happenedText = (body) => String(body || '').split('\n').filter((l) => !/^\s*\|/.test(l)).join('\n').trim().replace(/^_—_$/, '');
const dayNoteMarkdown = (date, answers = {}, owner = null) => `---\ntype: tv-day\ndate: ${date}\n${owner ? `${owner.kind}: ${JSON.stringify(owner.name)}\n` : ''}---\n\n## Prediction\n${predictionBody(new Map())}\n\n## Anticipation\n_—_\n\n## What actually happened\n_—_\n\n${DAY_QUESTIONS.map((q) => `## ${q}\n${String(answers[q] || '').trim() || '_—_'}`).join('\n\n')}\n`;
// Day notes are kept per account unless settings.dayNotesShared is on: an account's notes (and charts) live in
// Days/Accounts/<account>/, a group's in Days/Groups/<group>/, and All accounts keeps the ones directly in Days/.
/** Whose day notes a view keeps: null for All accounts, else { kind: 'account' | 'group', name }. */
function dayOwnerOf(scope) {
  const s = String(scope || 'all');
  if (s.startsWith('account:')) return { kind: 'account', name: s.slice(8) };
  if (s.startsWith('group:')) return { kind: 'group', name: s.slice(6) };
  return null;
}
/** A folder name for an account or group that links and file systems accept (no # ^ [ ] | / \ : * ? " < >). */
const daySlug = (name) => String(name || '').replace(/[\\/:*?"<>|#^[\]]/g, '-').replace(/\s+/g, ' ').trim().replace(/^\.+/, '') || 'Account';
/** The folder of a view's day notes, inside the journal folder. */
const dayNotesDir = (owner) => (owner ? `Days/${owner.kind === 'group' ? 'Groups' : 'Accounts'}/${daySlug(owner.name)}` : 'Days');
/** What a review card prints of a day review: forecast, what happened, then the three questions. */
function dayCardParts(day) {
  if (!day) return [];
  const name = (list, k) => (list.find(([key]) => key === k) || [null, ''])[1];
  const out = [];
  const anticipation = day.Anticipation || '';
  if (day.bias || anticipation) out.push([[tx('Forecast'), day.bias ? tx(name(DAY_BIASES, day.bias)) : ''].filter(Boolean).join(' · '), anticipation || '—']);
  if (day.outcome || day.happened) {
    const verdict = day.bias && day.bias !== 'neutral' && day.outcome ? tx(day.bias === day.outcome ? 'forecast played out' : 'forecast did not play out') : '';
    out.push([[tx('What actually happened'), day.outcome ? tx(name(DAY_OUTCOMES, day.outcome)) : '', verdict].filter(Boolean).join(' · '), day.happened || '—']);
  }
  for (const q of DAY_QUESTIONS) if (day[q]) out.push([tx(q), day[q]]);
  return out;
}
const extOfType = (type) => ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' })[String(type || '').split(';')[0].trim().toLowerCase()] || '';
/** A TradingView snapshot link -> its picture; a link straight to an image stays as it is; anything else -> ''. */
function imageUrlOf(text) {
  const tv = String(text || '').match(/tradingview\.com\/x\/([A-Za-z0-9]+)/);
  if (tv) return `https://s3.tradingview.com/snapshots/${tv[1][0].toLowerCase()}/${tv[1]}.png`;
  return /^https?:\/\/\S+\.(png|jpe?g|webp|gif)(\?\S*)?$/i.test(String(text || '').trim()) ? String(text).trim() : '';
}
/** The picture in a paste: an image on the clipboard, or a TradingView snapshot / image link, fetched. */
async function imageFromPaste(e) {
  const clip = e.clipboardData;
  const item = [...((clip && clip.items) || [])].find((i) => i.kind === 'file' && /^image\//.test(i.type));
  if (item) { const f = item.getAsFile(); return { data: await f.arrayBuffer(), ext: extOfType(f.type) || 'png' }; }
  const url = imageUrlOf(clip ? clip.getData('text/plain') : '');
  if (!url) return null;
  const res = await requestUrl({ url });
  return { data: res.arrayBuffer, ext: extOfType(res.headers && (res.headers['content-type'] || res.headers['Content-Type'])) || ((url.match(/\.(png|jpe?g|webp|gif)(\?|$)/i) || [])[1] || 'png').replace('jpeg', 'jpg') };
}

/** Adds a "## Chart" section embedding the drawing, once. */
function withChartSection(content, path) {
  const embed = `![[${path}]]`;
  return content.includes(embed) ? content : `${content.replace(/\s+$/, '')}\n\n## Chart\n${embed}\n`;
}

