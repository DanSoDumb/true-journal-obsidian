// ---------- gym tracking ----------

const GYM_KINDS = ['Push', 'Pull', 'Legs', 'Upper', 'Lower', 'Full body', 'Cardio', 'Other'];

/** "Bench press 4x8 60" / "Squat 5x5 @100kg" / "Plank 3x60" -> { name, sets, reps, weight|null }; null if not readable. */
function parseExercise(line) {
  const m = String(line).trim().match(/^(.+?)\s+(\d+)\s*[x×]\s*(\d+)(?:\s*@?\s*([\d.]+)\s*(?:kg|lb|lbs)?)?$/i);
  if (!m) return null;
  return { name: m[1].replace(/[:\-–]\s*$/, '').trim(), sets: Number(m[2]), reps: Number(m[3]), weight: m[4] ? Number(m[4]) : null };
}

function gymFromFrontmatter(fm) {
  if (!fm || fm.type !== 'tv-gym' || !fm.date) return null;
  const lines = Array.isArray(fm.exercises) ? fm.exercises.map(String) : [];
  return {
    date: String(fm.date).slice(0, 10), kind: String(fm.kind || 'Other'),
    minutes: Number.isFinite(Number(fm.minutes)) ? Number(fm.minutes) : 0,
    exercises: lines.map(parseExercise).filter(Boolean), lines,
  };
}

function gymToMarkdown(g) {
  const front = ['type: tv-gym', `date: ${g.date}`, `kind: ${yamlString(g.kind)}`, `minutes: ${g.minutes}`, `exercises: ${yamlList(g.lines)}`];
  const body = ['## Exercises', ...(g.lines.length ? g.lines.map((l) => `- ${l}`) : ['_—_']), '', '## Notes', g.notes || '_—_'];
  return `---\n${front.join('\n')}\n---\n\n${body.join('\n')}\n`;
}

const mondayOf = (date) => {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoDay(d);
};

/** Sessions this week / this month, minutes this month, and the run of consecutive weeks that met the target. */
function gymStats(sessions, target, today = new Date()) {
  const now = isoDay(today);
  const thisWeek = mondayOf(now);
  const perWeek = new Map();
  for (const g of sessions) perWeek.set(mondayOf(g.date), (perWeek.get(mondayOf(g.date)) || 0) + 1);
  const met = new Set([...perWeek].filter(([, n]) => n >= target).map(([w]) => w));
  const month = sessions.filter((g) => g.date.slice(0, 7) === now.slice(0, 7));
  return { week: perWeek.get(thisWeek) || 0, month: month.length, minutes: sum(month.map((g) => g.minutes)), streak: weekStreak(met, today).cur };
}

/** Best weight per exercise (ties: more reps), with the date it was lifted and the last time it was trained. */
function gymRecords(sessions) {
  const best = new Map();
  for (const g of [...sessions].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const e of g.exercises) {
      const key = e.name.toLowerCase();
      const cur = best.get(key);
      const better = !cur || (e.weight || 0) > (cur.weight || 0) || ((e.weight || 0) === (cur.weight || 0) && e.reps > cur.reps);
      best.set(key, better ? { ...e, date: g.date, last: g.date, count: (cur ? cur.count : 0) + 1 } : { ...cur, last: g.date, count: cur.count + 1 });
    }
  }
  return [...best.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

