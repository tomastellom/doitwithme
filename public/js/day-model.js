import { labelFor, labelsOf } from './labels.js';
import { occurrencesOn } from './model.js';
import { WEEKDAYS, isoWeek, shortDate, weekdayOf } from './time.js';

const MIN_GAP = 15;

function busyMinutes(entries, window) {
  let total = 0;
  let cursor = window.start;
  for (const e of [...entries].sort((a, b) => a.start - b.start || a.end - b.end)) {
    const start = Math.max(e.start, cursor, window.start);
    const end = Math.min(e.end, window.end);
    if (end > start) {
      total += end - start;
      cursor = end;
    }
  }
  return total;
}

export function dayModel(state, date, travel = []) {
  const pref = state.preferences;
  const window = pref.daysOff.includes(weekdayOf(date)) ? pref.dayOffWindow : pref.weekdayWindow;
  const labels = labelsOf(state);
  const look = (category) => {
    const l = labelFor(labels, category);
    return { group: l.id, label: l.name, color: l.color, look: l.style };
  };
  const marks = new Map((state.commitmentMarks ?? []).map((m) => [`${m.id}|${m.date}`, m.status]));
  const entries = [];

  for (const c of state.commitments) {
    for (const o of occurrencesOn(date, [c])) {
      if (o.bufferBefore > 0) {
        entries.push({ kind: 'buffer', start: Math.max(0, o.start - o.bufferBefore), end: o.start, title: `Buffer before ${o.title}` });
      }
      entries.push({ kind: 'item', commitmentId: c.id, date, ...look(o.category), start: o.start, end: o.end, title: o.title, status: marks.get(`${c.id}|${date}`) ?? null });
    }
  }
  for (const b of state.blocks) {
    if (b.date === date) {
      entries.push({ kind: 'item', taskId: b.taskId, ...(b.deadlineId ? { deadlineId: b.deadlineId } : {}), date, ...look(b.category), start: b.start, end: b.end, title: b.title, status: b.status ?? null });
    }
  }
  for (const leg of travel) {
    if (leg.date === date) {
      entries.push({ kind: 'travel', date, placeId: leg.placeId, commuteId: leg.commuteId ?? null, fromName: leg.fromName, toName: leg.toName, estimated: leg.estimated, start: leg.start, end: leg.end, title: `${leg.fromName} to ${leg.toName}`, label: leg.estimated ? 'estimated' : 'commute' });
    }
  }
  entries.sort((a, b) => a.start - b.start || a.end - b.end);

  const rows = [];
  let cursor = window.start;
  for (const e of entries) {
    const gapEnd = Math.min(e.start, window.end);
    if (gapEnd - cursor >= MIN_GAP) rows.push({ kind: 'gap', start: cursor, end: gapEnd });
    rows.push(e);
    cursor = Math.max(cursor, e.end);
  }
  if (window.end - cursor >= MIN_GAP) rows.push({ kind: 'gap', start: cursor, end: window.end });

  const totals = {};
  const itemEntries = entries.filter((e) => e.kind === 'item');
  for (const e of entries) {
    if (e.kind === 'item') {
      totals[e.group] = (totals[e.group] ?? 0) + (e.end - e.start);
    }
  }
  const breakdown = labels.map((l) => ({ id: l.id, name: l.name, color: l.color, look: l.style, minutes: totals[l.id] ?? 0 })).filter((b) => b.minutes > 0);
  const booked = busyMinutes(itemEntries, { start: 0, end: 1440 });
  const length = window.end - window.start;
  const free = Math.max(0, Math.min(length, length - busyMinutes(entries, window)));
  const { week, year } = isoWeek(date);
  return {
    date,
    label: `${WEEKDAYS[weekdayOf(date)]} ${Number(date.slice(8))}`,
    week,
    year,
    weekLine: `Week ${week} / ${shortDate(date)} ${date.slice(0, 4)}`,
    booked,
    breakdown,
    free,
    window,
    rows,
    totals,
  };
}
