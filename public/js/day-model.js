import { GROUP_IDS, groupOfBlock, labelOf, occurrencesOn } from './model.js';
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
  const entries = [];

  for (const o of occurrencesOn(date, state.commitments)) {
    if (o.bufferBefore > 0) {
      entries.push({ kind: 'buffer', start: Math.max(0, o.start - o.bufferBefore), end: o.start, title: `Buffer before ${o.title}` });
    }
    entries.push({ kind: 'item', group: 'fixed', start: o.start, end: o.end, title: o.title, label: labelOf(o.category) });
  }
  for (const b of state.blocks) {
    if (b.date === date) {
      entries.push({ kind: 'item', group: groupOfBlock(b.category), start: b.start, end: b.end, title: b.title, label: labelOf(b.category) });
    }
  }
  for (const leg of travel) {
    if (leg.date === date) {
      entries.push({ kind: 'travel', start: leg.start, end: leg.end, title: `${leg.fromName} to ${leg.toName}`, label: leg.estimated ? 'estimated' : 'commute' });
    }
  }
  entries.sort((a, b) => a.start - b.start || a.end - b.end);

  const rows = [];
  let cursor = window.start;
  for (const e of entries) {
    if (e.start - cursor >= MIN_GAP && cursor < window.end) rows.push({ kind: 'gap', start: cursor, end: Math.min(e.start, window.end) });
    rows.push(e);
    cursor = Math.max(cursor, e.end);
  }
  if (window.end - cursor >= MIN_GAP) rows.push({ kind: 'gap', start: cursor, end: window.end });

  const totals = Object.fromEntries(GROUP_IDS.map((id) => [id, 0]));
  let booked = 0;
  for (const e of entries) {
    if (e.kind === 'item') {
      totals[e.group] += e.end - e.start;
      booked += e.end - e.start;
    }
  }
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
    free,
    window,
    rows,
    totals,
  };
}
