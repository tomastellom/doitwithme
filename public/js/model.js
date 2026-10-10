import { WEEKDAYS, addDays, compactRange, isoWeek, rangeLabel, weekdayOf } from './time.js';

import { labelFor, labelsOf } from './labels.js';

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

export const itemKey = (i) => `${i.kind}:${i.commitmentId ?? i.taskId ?? i.placeId ?? ''}:${i.date}:${i.start}`;

export function dayItems(state, date, travel = []) {
  const labels = labelsOf(state);
  const look = (category) => {
    const l = labelFor(labels, category);
    return { group: l.id, label: l.name, color: l.color, look: l.style };
  };
  const marks = new Map((state.commitmentMarks ?? []).map((m) => [`${m.id}|${m.date}`, m.status]));
  const items = [];
  for (const c of state.commitments) {
    for (const o of occurrencesOn(date, [c])) {
      items.push({ kind: 'commitment', commitmentId: c.id, date, ...look(o.category), start: o.start, end: o.end, title: o.title, status: marks.get(`${c.id}|${date}`) ?? null });
    }
  }
  for (const b of state.blocks) {
    if (b.date === date) {
      items.push({ kind: 'block', taskId: b.taskId, ...(b.deadlineId ? { deadlineId: b.deadlineId } : {}), date, ...look(b.category), start: b.start, end: b.end, title: b.title, status: b.status ?? null });
    }
  }
  for (const leg of travel) {
    if (leg.date === date) {
      items.push({ kind: 'travel', group: 'travel', date, placeId: leg.placeId, commuteId: leg.commuteId ?? null, fromName: leg.fromName, toName: leg.toName, estimated: leg.estimated, start: leg.start, end: leg.end, title: `${leg.fromName} to ${leg.toName}`, label: leg.estimated ? 'estimated' : 'commute' });
    }
  }
  return items.sort((a, b) => a.start - b.start || a.end - b.end);
}

const minutesOf = (items) => items.reduce((t, i) => t + (i.end - i.start), 0);

// `hidden` holds the ids of labels the person has switched off; a new label is shown until they do.
export function weekModel(state, start, hidden, today, travel = []) {
  const counts = {};
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(start, i);
    const items = dayItems(state, date, travel);
    for (const item of items) if (item.kind !== 'travel') counts[item.group] = (counts[item.group] ?? 0) + 1;
    days.push({
      date,
      weekday: WEEKDAYS[weekdayOf(date)],
      num: Number(date.slice(8)),
      isToday: date === today,
      booked: minutesOf(items.filter((item) => item.kind !== 'travel')),
      items: items.filter((item) => item.kind === 'travel' || !hidden.has(item.group)),
    });
  }
  const { week, year } = isoWeek(start);
  const filters = labelsOf(state)
    .map((l) => ({ id: l.id, name: l.name, color: l.color, look: l.style, count: counts[l.id] ?? 0 }))
    .filter((f) => f.count > 0 || hidden.has(f.id));
  return { start, week, year, range: rangeLabel(start), title: compactRange(start), days, counts, filters, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}
