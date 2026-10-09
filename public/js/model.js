import { WEEKDAYS, addDays, compactRange, isoWeek, rangeLabel, weekdayOf } from './time.js';

export const GROUPS = [
  { id: 'fixed', label: 'Fixed' },
  { id: 'study', label: 'Study' },
  { id: 'gym', label: 'Gym' },
  { id: 'admin', label: 'Chores and errands' },
  { id: 'outline', label: 'Projects and social' },
];
export const GROUP_IDS = GROUPS.map((g) => g.id);

export function groupOfBlock(category) {
  const c = String(category).toLowerCase().trim();
  if (c === 'study') return 'study';
  if (c === 'gym') return 'gym';
  if (c === 'chores' || c === 'errands') return 'admin';
  return 'outline';
}

export function labelOf(category) {
  const c = String(category).toLowerCase().trim();
  return c.startsWith('personal ') ? c.slice('personal '.length) : c;
}

// Same rule as src/busy.ts; test/frontend/model.test.ts keeps the two in step.
export function occurrencesOn(date, commitments) {
  const out = [];
  for (const c of commitments) {
    if (c.exceptions.includes(date)) continue;
    const p = c.pattern;
    const hit =
      p.kind === 'once'
        ? p.date === date
        : date >= p.from && date <= p.to && p.weekdays.includes(weekdayOf(date));
    if (hit) {
      out.push({ title: c.title, category: c.category, start: c.start, end: c.end, bufferBefore: c.bufferBefore });
    }
  }
  return out;
}

export function dayItems(state, date, travel = []) {
  const items = [];
  for (const o of occurrencesOn(date, state.commitments)) {
    items.push({ kind: 'commitment', group: 'fixed', start: o.start, end: o.end, title: o.title, label: labelOf(o.category) });
  }
  for (const b of state.blocks) {
    if (b.date === date) {
      items.push({ kind: 'block', group: groupOfBlock(b.category), start: b.start, end: b.end, title: b.title, label: labelOf(b.category) });
    }
  }
  for (const leg of travel) {
    if (leg.date === date) {
      items.push({ kind: 'travel', group: 'travel', start: leg.start, end: leg.end, title: `${leg.fromName} to ${leg.toName}`, label: leg.estimated ? 'estimated' : 'commute' });
    }
  }
  return items.sort((a, b) => a.start - b.start || a.end - b.end);
}

const minutesOf = (items) => items.reduce((t, i) => t + (i.end - i.start), 0);

export function weekModel(state, start, visible, today, travel = []) {
  const counts = Object.fromEntries(GROUP_IDS.map((id) => [id, 0]));
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(start, i);
    const items = dayItems(state, date, travel);
    for (const item of items) if (item.group in counts) counts[item.group]++;
    days.push({
      date,
      weekday: WEEKDAYS[weekdayOf(date)],
      num: Number(date.slice(8)),
      isToday: date === today,
      booked: minutesOf(items.filter((item) => item.kind !== 'travel')),
      items: items.filter((item) => item.kind === 'travel' || visible.has(item.group)),
    });
  }
  const { week, year } = isoWeek(start);
  return { start, week, year, range: rangeLabel(start), title: compactRange(start), days, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}
