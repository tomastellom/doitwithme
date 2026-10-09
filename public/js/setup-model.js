import { WEEKDAYS, addDays, hhmm, isValidDate, longDate, shortDate } from './time.js';

export const CATEGORIES = {
  commitments: ['class', 'lesson', 'mass', 'work', 'volunteering', 'meeting', 'social', 'other'],
  tasks: ['study', 'gym', 'chores', 'errands', 'personal project', 'social', 'other'],
};
export const DEADLINE_KINDS = ['exam', 'assignment', 'task', 'other'];
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function parseTime(text) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(text).trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (minutes > 59) return null;
  if (hours === 24) return minutes === 0 ? 1440 : null;
  return hours > 23 ? null : hours * 60 + minutes;
}

export function parseWhole(text, min, max) {
  const t = String(text).trim();
  if (!/^\d{1,9}$/.test(t)) return null;
  const n = Number(t);
  return n >= min && n <= max ? n : null;
}

export const newId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const isDates = (list) => list.every(isValidDate);
const byNumber = (a, b) => a - b;

export const commitmentKind = {
  blank(today) {
    return {
      title: '', category: 'class', start: '09:00', end: '10:00', buffer: '0',
      repeats: 'weekly', weekdays: [1], from: today, to: addDays(today, 112), date: today, exceptions: [],
    };
  },
  toDraft(c) {
    const weekly = c.pattern.kind === 'weekly';
    return {
      title: c.title, category: c.category, start: hhmm(c.start), end: hhmm(c.end), buffer: String(c.bufferBefore),
      repeats: weekly ? 'weekly' : 'once',
      weekdays: weekly ? [...c.pattern.weekdays] : [1],
      from: weekly ? c.pattern.from : '', to: weekly ? c.pattern.to : '',
      date: weekly ? '' : c.pattern.date,
      exceptions: [...c.exceptions],
    };
  },
  fromDraft(d, id) {
    const title = d.title.trim();
    if (!title) return { error: 'Give it a title.' };
    if (title.length > 200) return { error: 'The title can be at most 200 characters.' };
    const start = parseTime(d.start);
    const end = parseTime(d.end);
    if (start === null) return { error: 'Start time must look like 16:00.' };
    if (end === null) return { error: 'End time must look like 17:00.' };
    if (end <= start) return { error: 'End time must be after the start time.' };
    const buffer = parseWhole(d.buffer, 0, 240);
    if (buffer === null) return { error: 'Buffer must be a whole number of minutes, 0 to 240.' };
    let pattern;
    if (d.repeats === 'once') {
      if (!isValidDate(d.date)) return { error: 'Pick a real date.' };
      pattern = { kind: 'once', date: d.date };
    } else {
      if (d.weekdays.length === 0) return { error: 'Pick at least one weekday.' };
      if (!isValidDate(d.from) || !isValidDate(d.to)) return { error: 'Pick real start and end dates.' };
      if (d.to < d.from) return { error: 'The end date must be on or after the start date.' };
      pattern = { kind: 'weekly', weekdays: [...d.weekdays].sort(byNumber), from: d.from, to: d.to };
    }
    if (!isDates(d.exceptions)) return { error: 'Cancelled dates must be real dates.' };
    return {
      item: { id, title, category: d.category, start, end, pattern, exceptions: [...d.exceptions].sort(), bufferBefore: buffer },
    };
  },
  summary(c) {
    const time = `${hhmm(c.start)}–${hhmm(c.end)}`;
    const buffer = c.bufferBefore > 0 ? ` / buffer ${c.bufferBefore} min` : '';
    if (c.pattern.kind === 'once') return `${longDate(c.pattern.date)} / ${time}${buffer}`;
    const days = WEEK_ORDER.filter((w) => c.pattern.weekdays.includes(w)).map((w) => WEEKDAYS[w]).join(', ');
    return `${days} / ${time} / ${shortDate(c.pattern.from)} – ${shortDate(c.pattern.to)}${buffer}`;
  },
};
