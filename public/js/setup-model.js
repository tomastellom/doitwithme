import { DEFAULT_LABELS, LOCKED_IDS, labelsOf } from './labels.js';
import { PALETTE } from './colors.js';
import { WEEKDAYS, addDays, hhmm, isValidDate, longDate, shortDate } from './time.js';

export const CATEGORIES = {
  commitments: ['class', 'lesson', 'mass', 'work', 'volunteering', 'meeting', 'social', 'other'],
  tasks: ['study', 'gym', 'chores', 'errands', 'personal project', 'social', 'other'],
};
export const DEADLINE_KINDS = ['exam', 'assignment', 'task', 'other'];
export const PLACE_KINDS = ['home', 'campus', 'student', 'other'];
export const TRAVEL_MODES = ['car', 'bike', 'transit', 'walk'];
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

// Plain decimals only ("2.5", "2,5" or ".5"), never exponents, signs or full-width digits.
export function parseDecimal(text, min, max) {
  const t = String(text).trim();
  if (!/^(\d{1,6}([.,]\d{1,6})?|[.,]\d{1,6})$/.test(t)) return null;
  const n = Number(t.replace(',', '.'));
  return n >= min && n <= max ? n : null;
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
      title: '', category: 'class', start: '09:00', end: '10:00', buffer: '0', placeId: '',
      repeats: 'weekly', weekdays: [1], from: today, to: addDays(today, 112), date: today, exceptions: [],
    };
  },
  toDraft(c) {
    const weekly = c.pattern.kind === 'weekly';
    return {
      title: c.title, category: c.category, start: hhmm(c.start), end: hhmm(c.end), buffer: String(c.bufferBefore), placeId: c.placeId ?? '',
      repeats: weekly ? 'weekly' : 'once',
      weekdays: weekly ? [...c.pattern.weekdays] : [1],
      from: weekly ? c.pattern.from : '', to: weekly ? c.pattern.to : '',
      date: weekly ? '' : c.pattern.date,
      exceptions: [...c.exceptions],
    };
  },
  fromDraft(d, id, state) {
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
    if (d.placeId && !(state.places ?? []).some((p) => p.id === d.placeId)) return { error: 'Pick a place from the list.' };
    return {
      item: { id, title, category: d.category, start, end, pattern, exceptions: [...d.exceptions].sort(), bufferBefore: buffer, ...(d.placeId ? { placeId: d.placeId } : {}) },
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

const TITLE_ERROR = 'The title can be at most 200 characters.';

const usage = (state, id) =>
  state.commitments.filter((c) => c.category === id).length + state.tasks.filter((t) => t.category === id).length;

export const labelKind = {
  blank() {
    return { name: '', color: PALETTE[5].hex, style: 'fill' };
  },
  toDraft(l) {
    return { name: l.name, color: l.color, style: l.style };
  },
  fromDraft(d, id, state) {
    const name = d.name.trim();
    if (!name) return { error: 'Give the label a name.' };
    if (name.length > 40) return { error: 'The name can be at most 40 characters.' };
    if (labelsOf(state).some((l) => l.id !== id && l.name.toLowerCase() === name.toLowerCase())) return { error: 'Another label already has that name.' };
    if (!PALETTE.some((c) => c.hex === d.color)) return { error: 'Pick a color from the list.' };
    if (d.style !== 'fill' && d.style !== 'outline') return { error: 'Pick filled or outlined.' };
    return { item: { id, name, color: d.color, style: d.style } };
  },
  summary(l, state) {
    const n = usage(state, l.id);
    return `${l.style === 'outline' ? 'outlined' : 'filled'} / ${n === 0 ? 'not used yet' : `${n} item${n === 1 ? '' : 's'}`}`;
  },
};

export const taskKind = {
  blank() {
    return {
      title: '', category: 'study', weekly: '', maxBlock: '90', onePerDay: false, priority: '3',
      credits: '', difficulty: '3', examOnly: false, weeklyGraded: false, lab: false, syllabus: '',
    };
  },
  toDraft(t) {
    return {
      title: t.title, category: t.category, weekly: t.weeklyMinutes === null ? '' : String(t.weeklyMinutes),
      maxBlock: String(t.maxBlock), onePerDay: t.onePerDay, priority: String(t.priority),
      credits: t.course ? String(t.course.credits) : '', difficulty: t.course ? String(t.course.difficulty) : '3',
      examOnly: t.course ? t.course.examOnly : false, weeklyGraded: t.course ? t.course.weeklyGraded : false,
      lab: t.course ? t.course.lab : false, syllabus: t.course ? t.course.syllabus : '',
    };
  },
  fromDraft(d, id) {
    const title = d.title.trim();
    if (!title) return { error: 'Give it a title.' };
    if (title.length > 200) return { error: TITLE_ERROR };
    const weeklyText = d.weekly.trim();
    const weekly = weeklyText === '' ? null : parseWhole(weeklyText, 0, 10080);
    if (weeklyText !== '' && weekly === null) return { error: 'Weekly minutes must be a whole number from 0 to 10080, or empty.' };
    const maxBlock = parseWhole(d.maxBlock, 5, 1440);
    if (maxBlock === null) return { error: 'Longest block must be a whole number of minutes, 5 to 1440.' };
    const priority = parseWhole(d.priority, 1, 5);
    if (priority === null) return { error: 'Priority must be 1 to 5.' };
    let course;
    if (d.category === 'study') {
      if (String(d.credits).trim() === '') {
        if (d.syllabus.trim() !== '') return { error: 'Add the credits to keep course details.' };
      } else {
        const credits = parseDecimal(d.credits, 0.5, 100);
        if (credits === null) return { error: 'Credits must be a number from 0.5 to 100, like 3.' };
        const difficulty = parseWhole(d.difficulty, 1, 5);
        if (difficulty === null) return { error: 'Difficulty must be 1 to 5.' };
        if (d.syllabus.length > 20000) return { error: 'Syllabus text can be at most 20000 characters.' };
        course = { credits, difficulty, examOnly: Boolean(d.examOnly), weeklyGraded: Boolean(d.weeklyGraded), lab: Boolean(d.lab), syllabus: d.syllabus };
      }
    }
    return { item: { id, title, category: d.category, weeklyMinutes: weekly, maxBlock, onePerDay: Boolean(d.onePerDay), priority, ...(course ? { course } : {}) } };
  },
  summary(t) {
    const weekly = t.weeklyMinutes === null ? 'no weekly target' : `${t.weeklyMinutes} min a week`;
    return `${weekly} / blocks up to ${t.maxBlock} min / priority ${t.priority}${t.onePerDay ? ' / one session a day' : ''}`;
  },
};

export const deadlineKind = {
  blank(today, state) {
    return { taskId: state.tasks[0] ? state.tasks[0].id : '', kind: 'exam', dueDate: addDays(today, 14), effort: '120' };
  },
  toDraft(d) {
    return { taskId: d.taskId, kind: d.kind, dueDate: d.dueDate, effort: String(d.effortMinutes) };
  },
  fromDraft(d, id, state) {
    if (state.tasks.length === 0) return { error: 'Add a task first, then give it a due date.' };
    if (!state.tasks.some((t) => t.id === d.taskId)) return { error: 'Pick a task.' };
    const kind = d.kind.trim();
    if (!kind) return { error: 'Give the kind a name (like exam).' };
    if (kind.length > 200) return { error: 'The kind can be at most 200 characters.' };
    if (!isValidDate(d.dueDate)) return { error: 'Pick a real due date.' };
    const effort = parseWhole(d.effort, 0, 100000);
    if (effort === null) return { error: 'Effort must be a whole number of minutes, 0 to 100000.' };
    return { item: { id, taskId: d.taskId, kind, dueDate: d.dueDate, effortMinutes: effort } };
  },
  summary(d, state) {
    const task = state.tasks.find((t) => t.id === d.taskId);
    return `${task ? task.title : 'A task that no longer exists'} / due ${longDate(d.dueDate)} / ${d.effortMinutes} min`;
  },
};

export const preferencesKind = {
  blank: (today, state) => preferencesKind.toDraft(state.preferences),
  toDraft(p) {
    return {
      weekdayStart: hhmm(p.weekdayWindow.start), weekdayEnd: hhmm(p.weekdayWindow.end),
      dayOffStart: hhmm(p.dayOffWindow.start), dayOffEnd: hhmm(p.dayOffWindow.end),
      daysOff: [...p.daysOff], minBlock: String(p.minBlock), minBreak: String(p.minBreak), travelAllowance: String(p.travelAllowanceMinutes ?? 30),
      hoursPerCredit: p.hoursPerCredit == null ? '' : String(p.hoursPerCredit),
      normalCredits: String(p.normalCredits ?? 30), fullLoadHours: String(p.fullLoadHours ?? 40),
      softWindows: p.softWindows.map((s) => ({ weekday: s.weekday, start: hhmm(s.start), end: hhmm(s.end) })),
    };
  },
  fromDraft(d, id, state) {
    const window = (startText, endText, label) => {
      const start = parseTime(startText);
      const end = parseTime(endText);
      if (start === null) return { error: `${label} start must look like 08:00.` };
      if (end === null) return { error: `${label} end must look like 22:00.` };
      if (end <= start) return { error: `${label} end must be after its start.` };
      return { start, end };
    };
    const weekday = window(d.weekdayStart, d.weekdayEnd, 'Weekday');
    if (weekday.error) return weekday;
    const dayOff = window(d.dayOffStart, d.dayOffEnd, 'Days-off');
    if (dayOff.error) return dayOff;
    const minBlock = parseWhole(d.minBlock, 5, 240);
    if (minBlock === null) return { error: 'Shortest block must be a whole number of minutes, 5 to 240.' };
    const minBreak = parseWhole(d.minBreak, 0, 120);
    if (minBreak === null) return { error: 'Break must be a whole number of minutes, 0 to 120.' };
    const travelAllowance = parseWhole(d.travelAllowance, 0, 600);
    if (travelAllowance === null) return { error: 'Travel allowance must be a whole number of minutes, 0 to 600.' };
    const hoursText = String(d.hoursPerCredit).trim();
    const hoursPerCredit = hoursText === '' ? null : parseDecimal(hoursText, 0.1, 20);
    if (hoursText !== '' && hoursPerCredit === null) return { error: 'Hours a week per credit must be a number from 0.1 to 20, or empty.' };
    const normalCredits = parseDecimal(d.normalCredits, 1, 200);
    if (normalCredits === null) return { error: 'Credits in a normal semester must be a number from 1 to 200.' };
    const fullLoadHours = parseDecimal(d.fullLoadHours, 1, 100);
    if (fullLoadHours === null) return { error: 'Study hours at a full load must be a number from 1 to 100.' };
    const softWindows = [];
    for (const s of d.softWindows) {
      const start = parseTime(s.start);
      const end = parseTime(s.end);
      if (start === null || end === null || end <= start) return { error: 'Soft window times must look like 18:00 and end after they start.' };
      softWindows.push({ weekday: Number(s.weekday), start, end });
    }
    for (let i = 0; i < softWindows.length; i++) {
      for (let j = i + 1; j < softWindows.length; j++) {
        const a = softWindows[i];
        const b = softWindows[j];
        if (a.weekday === b.weekday && a.start < b.end && b.start < a.end) return { error: 'Soft windows on the same day must not overlap.' };
      }
    }
    return {
      item: {
        ...state.preferences,
        weekdayWindow: { start: weekday.start, end: weekday.end },
        dayOffWindow: { start: dayOff.start, end: dayOff.end },
        daysOff: [...d.daysOff].sort(byNumber),
        minBlock,
        minBreak,
        travelAllowanceMinutes: travelAllowance,
        hoursPerCredit,
        normalCredits,
        fullLoadHours,
        softWindows,
      },
    };
  },
};

export const placeKind = {
  blank() {
    return { name: '', kind: 'other', address: '' };
  },
  toDraft(p) {
    return { name: p.name, kind: p.kind, address: p.address };
  },
  fromDraft(d, id, state) {
    const name = d.name.trim();
    if (!name) return { error: 'Give the place a name.' };
    if (name.length > 200) return { error: 'The name can be at most 200 characters.' };
    const address = d.address.trim();
    if (address.length > 300) return { error: 'The address can be at most 300 characters.' };
    if (!PLACE_KINDS.includes(d.kind)) return { error: 'Pick a kind.' };
    if (d.kind === 'home' && (state.places ?? []).some((p) => p.kind === 'home' && p.id !== id)) {
      return { error: 'There is already a Home place. Edit that one, or change its kind first.' };
    }
    return { item: { id, name, kind: d.kind, address } };
  },
  summary: (p) => (p.address ? p.address : 'Address missing'),
};

const placeName = (state, id) => ((state.places ?? []).find((p) => p.id === id) || { name: 'Unknown place' }).name;
const repeatsLabel = (c) => (c.repeats === null ? 'per lesson' : c.repeats.kind);

export const commuteKind = {
  blank(today, state) {
    const places = state.places ?? [];
    const home = places.find((p) => p.kind === 'home') ?? places[0];
    const other = places.find((p) => home && p.id !== home.id);
    return {
      fromPlaceId: home ? home.id : '', toPlaceId: other ? other.id : '', repeats: 'weekly',
      weekdays: [1, 2, 3, 4], monthDays: '1', method: 'typed', minutes: '30', margin: '10', mode: 'transit',
    };
  },
  toDraft(c) {
    const maps = c.source.method === 'maps';
    return {
      fromPlaceId: c.fromPlaceId, toPlaceId: c.toPlaceId,
      repeats: c.repeats === null ? 'per-lesson' : c.repeats.kind,
      weekdays: c.repeats && c.repeats.kind === 'weekly' ? [...c.repeats.weekdays] : [1],
      monthDays: c.repeats && c.repeats.kind === 'monthly' ? c.repeats.monthDays.join(', ') : '1',
      method: c.source.method,
      minutes: String(maps ? c.source.fallbackMinutes : c.source.minutes),
      margin: String(c.marginMinutes),
      mode: maps ? c.source.mode : 'transit',
    };
  },
  fromDraft(d, id, state) {
    const places = state.places ?? [];
    if (!places.some((p) => p.id === d.fromPlaceId)) return { error: 'Pick where it starts.' };
    if (!places.some((p) => p.id === d.toPlaceId)) return { error: 'Pick where it ends.' };
    if (d.fromPlaceId === d.toPlaceId) return { error: 'Pick two different places.' };
    let repeats = null;
    if (d.repeats === 'weekly') {
      if (d.weekdays.length === 0) return { error: 'Pick at least one day.' };
      repeats = { kind: 'weekly', weekdays: [...d.weekdays].sort(byNumber) };
    } else if (d.repeats === 'monthly') {
      const days = String(d.monthDays).split(',').map((t) => t.trim()).filter((t) => t !== '').map((t) => parseWhole(t, 1, 28));
      if (days.length === 0 || days.includes(null)) return { error: 'Month days must be whole numbers from 1 to 28, like 1, 15.' };
      repeats = { kind: 'monthly', monthDays: [...new Set(days)].sort(byNumber) };
    } else if (d.repeats !== 'per-lesson') {
      return { error: 'Pick how often it repeats.' };
    }
    const minutes = parseWhole(d.minutes, 0, 600);
    if (minutes === null) return { error: 'Minutes must be a whole number from 0 to 600.' };
    const margin = parseWhole(d.margin, 0, 120);
    if (margin === null) return { error: 'The safety margin must be a whole number of minutes, 0 to 120.' };
    let source;
    if (d.method === 'typed') {
      source = { method: 'typed', minutes };
    } else if (d.method === 'maps') {
      if (!TRAVEL_MODES.includes(d.mode)) return { error: 'Pick how you travel.' };
      source = { method: 'maps', mode: d.mode, fallbackMinutes: minutes };
    } else {
      return { error: 'Pick how long it takes: type it, or let Google Maps find it.' };
    }
    return { item: { id, fromPlaceId: d.fromPlaceId, toPlaceId: d.toPlaceId, repeats, source, marginMinutes: margin } };
  },
  summary(c, state) {
    const when =
      c.repeats === null ? 'every lesson'
        : c.repeats.kind === 'weekly' ? WEEK_ORDER.filter((w) => c.repeats.weekdays.includes(w)).map((w) => WEEKDAYS[w]).join(', ')
          : `day ${c.repeats.monthDays.join(', ')}`;
    const minutes = c.source.method === 'typed' ? c.source.minutes : c.source.fallbackMinutes;
    const how = c.source.method === 'typed' ? 'typed' : `Google Maps by ${c.source.mode}`;
    return `${when} / ${minutes} min + ${c.marginMinutes} margin / ${how}`;
  },
};

export const KINDS = {
  commitments: {
    id: 'commitments', title: 'Commitments', list: 'commitments', add: 'Add a commitment', prefix: 'c', kind: commitmentKind,
    itemTitle: (c) => c.title, itemLabel: (c) => c.category,
  },
  tasks: {
    id: 'tasks', title: 'Tasks', list: 'tasks', add: 'Add a task', prefix: 't', kind: taskKind,
    itemTitle: (t) => t.title, itemLabel: (t) => t.category,
    confirmNote(state, id) {
      const n = state.deadlines.filter((d) => d.taskId === id).length;
      return n > 0 ? ` Its ${n} due date${n === 1 ? ' goes' : 's go'} too.` : '';
    },
  },
  labels: {
    id: 'labels', title: 'Labels', list: 'labels', add: 'New label', prefix: 'label', kind: labelKind,
    itemTitle: (l) => l.name, itemLabel: (l) => (l.style === 'outline' ? 'outlined' : 'filled'),
    // Study and Other hold the planner together, so they can be renamed and recolored but not deleted.
    keep: (l) => (LOCKED_IDS.includes(l.id) ? `${l.name} is built in: you can rename and recolor it, but it cannot be deleted.` : null),
    confirmNote: (state, id) => {
      const n = usage(state, id);
      return n > 0 ? ` ${n} item${n === 1 ? '' : 's'} using it move${n === 1 ? 's' : ''} to Other.` : '';
    },
  },
  'due-dates': {
    id: 'due-dates', title: 'Due dates', list: 'deadlines', add: 'Add a due date', prefix: 'd', kind: deadlineKind,
    itemTitle: (d, state) => {
      const task = state.tasks.find((t) => t.id === d.taskId);
      return `${task ? task.title : 'Unknown task'} ${d.kind}`;
    },
    itemLabel: (d) => d.kind,
  },
  places: {
    id: 'places', title: 'Places', list: 'places', add: 'Add a place', prefix: 'p', kind: placeKind,
    itemTitle: (p) => p.name, itemLabel: (p) => p.kind,
    confirmNote(state, id) {
      const routes = (state.commutes ?? []).filter((c) => c.fromPlaceId === id || c.toPlaceId === id).length;
      const events = state.commitments.filter((c) => c.placeId === id).length;
      const parts = [];
      if (routes > 0) parts.push(`Its ${routes} commute${routes === 1 ? ' goes' : 's go'} too.`);
      if (events > 0) parts.push(`${events} commitment${events === 1 ? ' loses its' : 's lose their'} place.`);
      return parts.length > 0 ? ` ${parts.join(' ')}` : '';
    },
  },
  commutes: {
    id: 'commutes', title: 'Commutes', list: 'commutes', add: 'Add a commute', prefix: 'r', kind: commuteKind,
    itemTitle: (c, state) => `${placeName(state, c.fromPlaceId)} to ${placeName(state, c.toPlaceId)}`,
    itemLabel: repeatsLabel,
  },
  preferences: { id: 'preferences', title: 'Preferences', single: true, kind: preferencesKind },
};
export const KIND_IDS = ['commitments', 'tasks', 'due-dates', 'labels', 'places', 'commutes', 'preferences'];

const listOf = (state, spec) => (spec.list === 'labels' ? labelsOf(state) : state[spec.list] ?? []);
export const itemsOf = (state, kindId) => (KINDS[kindId].list ? listOf(state, KINDS[kindId]) : []);

export function applyItem(state, kindId, item) {
  const spec = KINDS[kindId];
  if (spec.single) return { ...state, preferences: item };
  const list = listOf(state, spec);
  const exists = list.some((x) => x.id === item.id);
  return { ...state, [spec.list]: exists ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item] };
}

export function removeItem(state, kindId, id) {
  const spec = KINDS[kindId];
  const next = { ...state, [spec.list]: listOf(state, spec).filter((x) => x.id !== id) };
  if (kindId === 'labels') {
    // Whatever used the label moves to Other, planned blocks included, so nothing keeps pointing at a label that is gone.
    const move = (x) => (x.category === id ? { ...x, category: 'other' } : x);
    next.commitments = state.commitments.map(move);
    next.tasks = state.tasks.map(move);
    next.blocks = (state.blocks ?? []).map(move);
  }
  if (kindId === 'tasks') next.deadlines = next.deadlines.filter((d) => d.taskId !== id);

  if (kindId === 'places') {
    next.commutes = (state.commutes ?? []).filter((c) => c.fromPlaceId !== id && c.toPlaceId !== id);
    next.commitments = state.commitments.map((c) => {
      if (c.placeId !== id) return c;
      const { placeId, ...rest } = c;
      return rest;
    });
  }
  return next;
}
