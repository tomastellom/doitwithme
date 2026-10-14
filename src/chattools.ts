import { busyOn, occurrencesOn } from './busy.ts';
import { addDays, daysBetween, weekdayOf } from './dates.ts';
import { hhmm } from './format.ts';
import { replanCore } from './replan.ts';
import { freeSlots } from './slots.ts';
import type { DateStr, Leg, Minutes, State, Window } from './types.ts';

export const FIND_LIMIT = 40;
export const FIND_SPAN_DAYS = 366;
export const FREE_LIMIT = 40;
export const FREE_SPAN_DAYS = 60;
const COURSE_TEXT = 600;

export interface ToolContext {
  state: State;
  today: DateStr;
  nowMinutes?: Minutes;
  // Filled by free_time the first time it is used, then reused by the next lookups of the same message.
  plan?: { state: State; travel: Leg[] };
}

export interface ToolDef {
  name: string;
  description: string;
  input_schema: object;
}

export type ToolOutput = { items: unknown[]; note?: string } | { error: string };

export const TOOLS: ToolDef[] = [
  {
    name: 'find',
    description:
      'Search the planner. Returns events (classes, lessons, gym and so on, one item per day), planned work, tasks, deadlines and courses. ' +
      'Every word in "words" must appear in the title, category or place. Without "words" it lists everything in the date range (courses only when words are given). ' +
      'The date range is at most 366 days; ask again for another range if you need one.',
    input_schema: {
      type: 'object',
      properties: {
        words: { type: 'string', description: 'Words to look for, for example "lesson ana". Leave out to list everything in the range.' },
        from: { type: 'string', description: 'First date, YYYY-MM-DD. Default: today.' },
        to: { type: 'string', description: 'Last date, YYYY-MM-DD. Default: 60 days after "from".' },
        kinds: { type: 'array', items: { type: 'string', enum: ['event', 'planned', 'task', 'deadline', 'course'] }, description: 'Limit the search to these kinds. Default: all.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'free_time',
    description:
      'Find free time. Returns the gaps of at least "minutes" between "from" and "to" (within the next 60 days from today) that are not taken by classes (with their buffers), commutes, planned work or ticked-off work, inside the planner\'s day windows. ' +
      'Evenings the person keeps free are not offered. Always use this for free time; never work it out yourself.',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'First date, YYYY-MM-DD.' },
        to: { type: 'string', description: 'Last date, YYYY-MM-DD.' },
        minutes: { type: 'integer', description: 'The shortest gap wanted, 15 to 720.' },
      },
      required: ['from', 'to', 'minutes'],
      additionalProperties: false,
    },
  },
];

// The message is always one of our own sentences, and goes back to the AI as the tool's answer.
class ToolError extends Error {}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
function asDate(v: unknown, fallback?: DateStr): DateStr {
  if (v === undefined) {
    if (fallback === undefined) throw new ToolError('A date is missing. Dates look like 2026-10-12.');
    return fallback;
  }
  // Round-tripping catches days that do not exist, such as 2026-02-31 (some engines roll them over instead of refusing).
  const ms = typeof v === 'string' && DATE.test(v) ? Date.parse(`${v}T00:00:00Z`) : Number.NaN;
  if (typeof v !== 'string' || Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== v) throw new ToolError('Dates look like 2026-10-12.');
  return v;
}

function wordsOf(v: unknown): string[] {
  if (v === undefined) return [];
  if (typeof v !== 'string') throw new ToolError('words must be text.');
  return v.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
}

const KINDS = ['event', 'planned', 'task', 'deadline', 'course'];
function kindsOf(v: unknown): Set<string> {
  if (v === undefined) return new Set(KINDS);
  if (!Array.isArray(v) || v.some((k) => typeof k !== 'string' || !KINDS.includes(k))) throw new ToolError(`kinds can only be ${KINDS.join(', ')}.`);
  return new Set(v as string[]);
}

const matches = (words: string[], ...fields: (string | undefined)[]): boolean => {
  const hay = fields.filter(Boolean).join(' ').toLowerCase();
  return words.every((w) => hay.includes(w));
};

type Item = Record<string, unknown> & { date?: DateStr; start?: string };
const byDate = (a: Item, b: Item): number => (a.date ?? '9999').localeCompare(b.date ?? '9999') || (a.start ?? '').localeCompare(b.start ?? '');

function find(ctx: ToolContext, input: Record<string, unknown>): ToolOutput {
  const words = wordsOf(input.words);
  const from = asDate(input.from, ctx.today);
  const to = asDate(input.to, addDays(from, 60));
  if (to < from) throw new ToolError('"to" must not be before "from".');
  if (daysBetween(from, to) > FIND_SPAN_DAYS) throw new ToolError(`Ask for at most ${FIND_SPAN_DAYS} days at a time.`);
  const kinds = kindsOf(input.kinds);
  const { state } = ctx;
  const placeOf = (id?: string) => state.places.find((p) => p.id === id);
  const items: Item[] = [];

  if (kinds.has('event')) {
    for (const c of state.commitments) {
      const place = placeOf(c.placeId);
      if (!matches(words, c.title, c.category, place?.name, place?.address)) continue;
      for (let d = from; d <= to; d = addDays(d, 1)) {
        if (occurrencesOn(d, [c]).length === 0) continue;
        items.push({ kind: 'event', title: c.title, category: c.category, date: d, start: hhmm(c.start), end: hhmm(c.end), ...(place ? { place: place.name, ...(words.length > 0 ? { address: place.address } : {}) } : {}) });
      }
    }
  }
  if (kinds.has('planned')) {
    for (const b of state.blocks) {
      if (b.date < from || b.date > to || !matches(words, b.title, b.category)) continue;
      items.push({ kind: 'planned', title: b.title, category: b.category, date: b.date, start: hhmm(b.start), end: hhmm(b.end), ...(b.status ? { status: b.status } : {}) });
    }
  }
  if (kinds.has('deadline')) {
    for (const dl of state.deadlines) {
      if (dl.dueDate < from || dl.dueDate > to) continue;
      const t = state.tasks.find((x) => x.id === dl.taskId);
      if (!matches(words, t?.title, dl.kind)) continue;
      items.push({ kind: 'deadline', task: t?.title ?? '', type: dl.kind, date: dl.dueDate, effortMinutes: dl.effortMinutes });
    }
  }
  if (kinds.has('task')) {
    for (const t of state.tasks) {
      if (matches(words, t.title, t.category)) items.push({ kind: 'task', title: t.title, category: t.category, weeklyMinutes: t.weeklyMinutes });
    }
  }
  // A syllabus is long and personal: courses only come back when the question names something.
  if (kinds.has('course') && words.length > 0) {
    for (const t of state.tasks) {
      const c = t.course;
      if (!c || !matches(words, t.title)) continue;
      items.push({ kind: 'course', title: t.title, credits: c.credits, difficulty: c.difficulty, attendanceWeight: c.attendanceWeight, recorded: c.recorded, examShare: c.examShare, syllabus: c.syllabus.slice(0, COURSE_TEXT) });
    }
  }
  items.sort(byDate);
  if (items.length > FIND_LIMIT) return { items: items.slice(0, FIND_LIMIT), note: `Showing the first ${FIND_LIMIT}. Narrow the words or the dates to see the rest.` };
  return { items };
}

function freeTime(ctx: ToolContext, input: Record<string, unknown>): ToolOutput {
  const asked = asDate(input.from);
  const to = asDate(input.to);
  const minutes = input.minutes;
  if (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 15 || minutes > 720) throw new ToolError('minutes must be a whole number from 15 to 720.');
  // Nothing in the past is free time.
  const from = asked < ctx.today ? ctx.today : asked;
  if (to < from) throw new ToolError('"to" must not be before "from", and not in the past.');
  // The plan below only covers this many days from today; past it, commute legs and planned work are unknown.
  const last = addDays(ctx.today, FREE_SPAN_DAYS - 1);
  if (to > last) throw new ToolError(`free_time only looks ${FREE_SPAN_DAYS} days ahead from today. Ask for dates up to ${last}.`);
  if (daysBetween(from, to) >= FREE_SPAN_DAYS) throw new ToolError(`Ask for at most ${FREE_SPAN_DAYS} days at a time.`);

  // The planner's own plan knows the classes, buffers, commute legs and planned work; its window is the longest one we answer for.
  ctx.plan ??= replanCore(ctx.state, ctx.today, ctx.nowMinutes, FREE_SPAN_DAYS);
  const { plan } = ctx;
  const pref = ctx.state.preferences;
  const slots: { date: DateStr; start: string; end: string; minutes: number }[] = [];
  for (let d = from; d <= to && slots.length <= FREE_LIMIT; d = addDays(d, 1)) {
    const day = weekdayOf(d);
    const base = pref.daysOff.includes(day) ? pref.dayOffWindow : pref.weekdayWindow;
    const window: Window = d === ctx.today && ctx.nowMinutes !== undefined ? { start: Math.max(base.start, ctx.nowMinutes), end: base.end } : base;
    const busy: Window[] = [
      ...busyOn(d, ctx.state.commitments),
      ...plan.travel.filter((l) => l.date === d),
      // Work marked not done or waived gives its time back; everything else keeps it.
      ...plan.state.blocks.filter((b) => b.date === d && b.status !== 'missed' && b.status !== 'waived'),
      // The evenings the person keeps free are not offered, as the planner does not use them either.
      ...pref.softWindows.filter((s) => s.weekday === day),
    ];
    for (const s of freeSlots(window, busy)) {
      if (s.end - s.start >= minutes) slots.push({ date: d, start: hhmm(s.start), end: hhmm(s.end), minutes: s.end - s.start });
    }
  }
  if (slots.length > FREE_LIMIT) return { items: slots.slice(0, FREE_LIMIT), note: `Showing the first ${FREE_LIMIT}. Ask for a shorter range to see more.` };
  return { items: slots };
}

export function runTool(ctx: ToolContext, name: string, input: unknown): ToolOutput {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new ToolError('The input must be an object.');
    if (name === 'find') return find(ctx, input as Record<string, unknown>);
    if (name === 'free_time') return freeTime(ctx, input as Record<string, unknown>);
    throw new ToolError(`There is no tool called ${name}.`);
  } catch (e) {
    if (e instanceof ToolError) return { error: e.message };
    throw e;
  }
}
