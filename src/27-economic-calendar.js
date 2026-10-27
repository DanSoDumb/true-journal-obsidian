// ---------- economic calendar: Forex Factory's week, fetched at most once a day ----------

const FF_CALENDAR_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const FF_IMPACTS = ['High', 'Medium', 'Low', 'Holiday'];
const FF_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'NZD', 'CHF', 'CNY'];

/** Forex Factory's rows -> [{ title, country, at (ms), impact, forecast, previous }] in time order. Its times carry
 *  New York's offset, so `at` is the moment itself and shows in this computer's own time. Unreadable rows are left out. */
function readCalendar(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((r) => ({ title: String((r && r.title) || '').trim(), country: String((r && r.country) || '').trim(), at: Date.parse(String((r && r.date) || '')),
      impact: FF_IMPACTS.includes(r && r.impact) ? r.impact : 'Low', forecast: String((r && r.forecast) || ''), previous: String((r && r.previous) || '') }))
    .filter((e) => e.title && Number.isFinite(e.at))
    .sort((a, b) => a.at - b.at);
}

/** The events to show, by local day from today on: [{ day: 'YYYY-MM-DD', events }]. `currency` '' means every one
 *  ("All" events, such as a G20 meeting, show with any currency); `impacts` are the levels kept. */
function calendarDays(events, { currency = 'USD', impacts = ['High', 'Medium'], now = new Date() } = {}) {
  const today = isoDay(now);
  const days = new Map();
  for (const e of events || []) {
    if (!impacts.includes(e.impact)) continue;
    if (currency && e.country !== currency && e.country !== 'All') continue;
    const day = isoDay(new Date(e.at));
    if (day < today) continue;
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(e);
  }
  return [...days].map(([day, list]) => ({ day, events: list }));
}

