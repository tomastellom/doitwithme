import { defaultPreferences } from './defaults.ts';
import type {
  Label,
  Block, Commitment, Commute, Course, Deadline, Pattern, Place, PlaceKind, Preferences, Repeats, SoftWindow, State, Task,
  TravelMode, TravelSource, Window,
} from './types.ts';

export class ValidationError extends Error {}

export function fail(message: string): never {
  throw new ValidationError(message);
}

export function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function num(v: unknown, path: string, min: number, max = Number.POSITIVE_INFINITY): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
    fail(`${path} must be a number between ${min} and ${max}`);
  }
  return v as number;
}

export function int(v: unknown, path: string, min: number, max: number): number {
  const n = num(v, path, min, max);
  if (!Number.isInteger(n)) fail(`${path} must be a whole number`);
  return n;
}

export function dateStr(v: unknown, path: string): string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) fail(`${path} must be a date like 2026-10-08`);
  const text = v as string;
  const t = Date.parse(`${text}T00:00:00Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== text) {
    fail(`${path} is not a real calendar date`);
  }
  return text;
}

function str(v: unknown, path: string, max = 200): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > max) fail(`${path} must be text of 1 to ${max} characters`);
  return v as string;
}

function bool(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') fail(`${path} must be true or false`);
  return v as boolean;
}

function arr(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) fail(`${path} must be a list`);
  return v as unknown[];
}

function obj(v: unknown, path: string): Record<string, unknown> {
  if (!isObj(v)) fail(`${path} must be an object`);
  return v as Record<string, unknown>;
}

function windowOf(v: unknown, path: string): Window {
  const o = obj(v, path);
  const start = int(o.start, `${path}.start`, 0, 1440);
  const end = int(o.end, `${path}.end`, 0, 1440);
  if (end <= start) fail(`${path} must end after it starts`);
  return { start, end };
}

function unique(ids: string[], path: string): void {
  if (new Set(ids).size !== ids.length) fail(`${path} contains a duplicate id`);
}

function pattern(v: unknown, path: string): Pattern {
  const o = obj(v, path);
  if (o.kind === 'once') return { kind: 'once', date: dateStr(o.date, `${path}.date`) };
  if (o.kind === 'weekly') {
    const weekdays = arr(o.weekdays, `${path}.weekdays`).map((d, i) => int(d, `${path}.weekdays[${i}]`, 0, 6));
    if (weekdays.length === 0) fail(`${path}.weekdays must not be empty`);
    const from = dateStr(o.from, `${path}.from`);
    const to = dateStr(o.to, `${path}.to`);
    if (to < from) fail(`${path} must end on or after its start date`);
    return { kind: 'weekly', weekdays, from, to };
  }
  return fail(`${path}.kind must be "once" or "weekly"`);
}

const PLACE_KINDS = ['home', 'campus', 'student', 'other'];
const MODES = ['car', 'bike', 'transit', 'walk'];

function place(v: unknown, path: string): Place {
  const o = obj(v, path);
  const name = str(o.name, `${path}.name`);
  if (name.trim().length === 0) fail(`${path}.name must not be blank`);
  if (typeof o.kind !== 'string' || !PLACE_KINDS.includes(o.kind)) fail(`${path}.kind must be home, campus, student or other`);
  if (typeof o.address !== 'string' || o.address.length > 300) fail(`${path}.address must be text of at most 300 characters`);
  return { id: str(o.id, `${path}.id`), name, kind: o.kind as PlaceKind, address: o.address as string };
}

function repeatsOf(v: unknown, path: string): Repeats | null {
  if (v === null) return null;
  const o = obj(v, path);
  if (o.kind === 'weekly') {
    const weekdays = arr(o.weekdays, `${path}.weekdays`).map((d, i) => int(d, `${path}.weekdays[${i}]`, 0, 6));
    if (weekdays.length === 0) fail(`${path}.weekdays must not be empty`);
    return { kind: 'weekly', weekdays };
  }
  if (o.kind === 'monthly') {
    const monthDays = arr(o.monthDays, `${path}.monthDays`).map((d, i) => int(d, `${path}.monthDays[${i}]`, 1, 28));
    if (monthDays.length === 0) fail(`${path}.monthDays must not be empty`);
    return { kind: 'monthly', monthDays };
  }
  return fail(`${path}.kind must be "weekly" or "monthly"`);
}

function sourceOf(v: unknown, path: string): TravelSource {
  const o = obj(v, path);
  if (o.method === 'typed') return { method: 'typed', minutes: int(o.minutes, `${path}.minutes`, 0, 600) };
  if (o.method === 'maps') {
    if (typeof o.mode !== 'string' || !MODES.includes(o.mode)) fail(`${path}.mode must be car, bike, transit or walk`);
    return { method: 'maps', mode: o.mode as TravelMode, fallbackMinutes: int(o.fallbackMinutes, `${path}.fallbackMinutes`, 0, 600) };
  }
  return fail(`${path}.method must be "typed" or "maps"`);
}

function commute(v: unknown, path: string): Commute {
  const o = obj(v, path);
  return {
    id: str(o.id, `${path}.id`),
    fromPlaceId: str(o.fromPlaceId, `${path}.fromPlaceId`),
    toPlaceId: str(o.toPlaceId, `${path}.toPlaceId`),
    repeats: repeatsOf(o.repeats, `${path}.repeats`),
    source: sourceOf(o.source, `${path}.source`),
    marginMinutes: int(o.marginMinutes, `${path}.marginMinutes`, 0, 120),
  };
}

function commitment(v: unknown, path: string): Commitment {
  const o = obj(v, path);
  const w = windowOf({ start: o.start, end: o.end }, path);
  return {
    id: str(o.id, `${path}.id`),
    title: str(o.title, `${path}.title`),
    category: str(o.category, `${path}.category`),
    start: w.start,
    end: w.end,
    pattern: pattern(o.pattern, `${path}.pattern`),
    exceptions: arr(o.exceptions, `${path}.exceptions`).map((d, i) => dateStr(d, `${path}.exceptions[${i}]`)),
    bufferBefore: int(o.bufferBefore, `${path}.bufferBefore`, 0, 240),
    ...(o.placeId === undefined ? {} : { placeId: str(o.placeId, `${path}.placeId`) }),
  };
}

export function courseOf(v: unknown, path: string): Course {
  const o = obj(v, path);
  if (typeof o.syllabus !== 'string' || o.syllabus.length > 20000) fail(`${path}.syllabus must be text of at most 20000 characters`);
  return {
    credits: num(o.credits, `${path}.credits`, 0.5, 100),
    difficulty: int(o.difficulty, `${path}.difficulty`, 1, 5),
    examOnly: bool(o.examOnly, `${path}.examOnly`),
    weeklyGraded: bool(o.weeklyGraded, `${path}.weeklyGraded`),
    lab: bool(o.lab, `${path}.lab`),
    syllabus: o.syllabus as string,
  };
}

function task(v: unknown, path: string): Task {
  const o = obj(v, path);
  return {
    id: str(o.id, `${path}.id`),
    title: str(o.title, `${path}.title`),
    category: str(o.category, `${path}.category`),
    weeklyMinutes: o.weeklyMinutes === null ? null : int(o.weeklyMinutes, `${path}.weeklyMinutes`, 0, 10080),
    maxBlock: int(o.maxBlock, `${path}.maxBlock`, 5, 1440),
    onePerDay: bool(o.onePerDay, `${path}.onePerDay`),
    priority: int(o.priority, `${path}.priority`, 1, 5),
    ...(o.course === undefined ? {} : { course: courseOf(o.course, `${path}.course`) }),
  };
}

function deadline(v: unknown, path: string): Deadline {
  const o = obj(v, path);
  return {
    id: str(o.id, `${path}.id`),
    taskId: str(o.taskId, `${path}.taskId`),
    kind: str(o.kind, `${path}.kind`),
    dueDate: dateStr(o.dueDate, `${path}.dueDate`),
    effortMinutes: int(o.effortMinutes, `${path}.effortMinutes`, 0, 100000),
  };
}

function block(v: unknown, path: string): Block {
  const o = obj(v, path);
  const w = windowOf({ start: o.start, end: o.end }, path);
  return {
    taskId: str(o.taskId, `${path}.taskId`),
    title: str(o.title, `${path}.title`),
    category: str(o.category, `${path}.category`),
    date: dateStr(o.date, `${path}.date`),
    start: w.start,
    end: w.end,
    ...(o.deadlineId === undefined ? {} : { deadlineId: str(o.deadlineId, `${path}.deadlineId`) }),
  };
}

function label(v: unknown, path: string): Label {
  const o = obj(v, path);
  const name = str(o.name, `${path}.name`).trim();
  if (name.length < 1 || name.length > 40) fail(`${path}.name must be 1 to 40 characters`);
  if (typeof o.color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(o.color)) fail(`${path}.color must look like #FF4B1F`);
  if (o.style !== 'fill' && o.style !== 'outline') fail(`${path}.style must be "fill" or "outline"`);
  return { id: str(o.id, `${path}.id`), name, color: (o.color as string).toUpperCase(), style: o.style as 'fill' | 'outline' };
}

function softMode(v: unknown, path: string): 'ask' | 'auto' {
  if (v !== 'ask' && v !== 'auto') fail(`${path} must be "ask" or "auto"`);
  return v as 'ask' | 'auto';
}

function preferences(v: unknown, path: string): Preferences {
  const o = obj(v, path);
  const prefs: Preferences = {
    weekdayWindow: windowOf(o.weekdayWindow, `${path}.weekdayWindow`),
    dayOffWindow: windowOf(o.dayOffWindow, `${path}.dayOffWindow`),
    daysOff: arr(o.daysOff, `${path}.daysOff`).map((d, i) => int(d, `${path}.daysOff[${i}]`, 0, 6)),
    minBlock: int(o.minBlock, `${path}.minBlock`, 5, 240),
    minBreak: int(o.minBreak, `${path}.minBreak`, 0, 120),
    softMode: o.softMode === undefined ? 'ask' : softMode(o.softMode, `${path}.softMode`),
    travelAllowanceMinutes:
      o.travelAllowanceMinutes === undefined
        ? defaultPreferences.travelAllowanceMinutes
        : int(o.travelAllowanceMinutes, `${path}.travelAllowanceMinutes`, 0, 600),
    hoursPerCredit: o.hoursPerCredit === undefined || o.hoursPerCredit === null ? null : num(o.hoursPerCredit, `${path}.hoursPerCredit`, 0.1, 20),
    normalCredits: o.normalCredits === undefined ? defaultPreferences.normalCredits : num(o.normalCredits, `${path}.normalCredits`, 1, 200),
    fullLoadHours: o.fullLoadHours === undefined ? defaultPreferences.fullLoadHours : num(o.fullLoadHours, `${path}.fullLoadHours`, 1, 100),
    softWindows: arr(o.softWindows, `${path}.softWindows`).map((s, i): SoftWindow => {
      const so = obj(s, `${path}.softWindows[${i}]`);
      const w = windowOf(so, `${path}.softWindows[${i}]`);
      return { weekday: int(so.weekday, `${path}.softWindows[${i}].weekday`, 0, 6), ...w };
    }),
  };
  const soft = prefs.softWindows;
  for (let i = 0; i < soft.length; i++) {
    for (let j = i + 1; j < soft.length; j++) {
      if (soft[i].weekday === soft[j].weekday && soft[i].start < soft[j].end && soft[j].start < soft[i].end) {
        fail(`${path}.softWindows[${i}] and [${j}] overlap on the same weekday`);
      }
    }
  }
  return prefs;
}

function approvedSoft(v: unknown): string[] {
  const list = arr(v ?? [], 'approvedSoft');
  if (list.length > 400) fail('approvedSoft must have at most 400 dates');
  const dates = list.map((d, i) => dateStr(d, `approvedSoft[${i}]`));
  if (new Set(dates).size !== dates.length) fail('approvedSoft contains a duplicate date');
  return dates;
}

function dismissed(v: unknown): string[] {
  const list = arr(v ?? [], 'dismissed');
  if (list.length > 400) fail('dismissed must have at most 400 entries');
  return list.map((k, i) => str(k, `dismissed[${i}]`, 300));
}

export function validateState(x: unknown): State {
  const o = obj(x, 'state');
  const tasks = arr(o.tasks, 'tasks').map((t, i) => task(t, `tasks[${i}]`));
  const deadlines = arr(o.deadlines, 'deadlines').map((d, i) => deadline(d, `deadlines[${i}]`));
  const commitments = arr(o.commitments, 'commitments').map((c, i) => commitment(c, `commitments[${i}]`));
  unique(tasks.map((t) => t.id), 'tasks');
  unique(deadlines.map((d) => d.id), 'deadlines');
  unique(commitments.map((c) => c.id), 'commitments');
  const placeList = arr(o.places ?? [], 'places');
  if (placeList.length > 200) fail('places must have at most 200 entries');
  const places = placeList.map((p, i) => place(p, `places[${i}]`));
  unique(places.map((p) => p.id), 'places');
  if (places.filter((p) => p.kind === 'home').length > 1) fail('places can have only one home');
  const commuteList = arr(o.commutes ?? [], 'commutes');
  if (commuteList.length > 400) fail('commutes must have at most 400 entries');
  const commutes = commuteList.map((c, i) => commute(c, `commutes[${i}]`));
  unique(commutes.map((c) => c.id), 'commutes');
  commutes.forEach((c, i) => {
    if (!places.some((p) => p.id === c.fromPlaceId)) fail(`commutes[${i}].fromPlaceId does not match any place`);
    if (!places.some((p) => p.id === c.toPlaceId)) fail(`commutes[${i}].toPlaceId does not match any place`);
    if (c.fromPlaceId === c.toPlaceId) fail(`commutes[${i}] must join two different places`);
  });
  commitments.forEach((c, i) => {
    if (c.placeId !== undefined && !places.some((p) => p.id === c.placeId)) fail(`commitments[${i}].placeId does not match any place`);
  });
  deadlines.forEach((d, i) => {
    if (!tasks.some((t) => t.id === d.taskId)) fail(`deadlines[${i}].taskId does not match any task`);
  });
  let labels: Label[] | undefined;
  if (o.labels !== undefined) {
    if (!Array.isArray(o.labels)) fail('labels must be a list');
    if (o.labels.length > 100) fail('labels must have at most 100 entries');
    labels = o.labels.map((l, i) => label(l, `labels[${i}]`));
    unique(labels.map((l) => l.id), 'labels');
    if (new Set(labels.map((l) => l.name.toLowerCase())).size !== labels.length) fail('labels cannot have the same name twice');
  }
  return {
    commitments,
    tasks,
    deadlines,
    places,
    commutes,
    ...(labels === undefined ? {} : { labels }),
    preferences: preferences(o.preferences ?? defaultPreferences, 'preferences'),
    blocks: arr(o.blocks ?? [], 'blocks').map((b, i) => block(b, `blocks[${i}]`)),
    approvedSoft: approvedSoft(o.approvedSoft),
    dismissed: dismissed(o.dismissed),
  };
}

function replanFields(o: Record<string, unknown>): { today: string; nowMinutes?: number; horizonDays: number } {
  return {
    today: dateStr(o.today, 'today'),
    ...(o.nowMinutes === undefined ? {} : { nowMinutes: int(o.nowMinutes, 'nowMinutes', 0, 1440) }),
    horizonDays: o.horizonDays === undefined ? 14 : int(o.horizonDays, 'horizonDays', 1, 60),
  };
}

export function validateReplanRequest(x: unknown): { today: string; nowMinutes?: number; horizonDays: number } {
  return replanFields(obj(x, 'request'));
}

export function validateSoftRequest(x: unknown): {
  today: string;
  nowMinutes?: number;
  horizonDays: number;
  date: string;
} {
  const o = obj(x, 'request');
  return { ...replanFields(o), date: dateStr(o.date, 'date') };
}

export function validateDismissRequest(x: unknown): {
  today: string;
  nowMinutes?: number;
  horizonDays: number;
  key: string;
} {
  const o = obj(x, 'request');
  return { ...replanFields(o), key: str(o.key, 'key', 300) };
}

export function validateEstimateRequest(x: unknown): { title: string; course: Course } {
  const o = obj(x, 'request');
  return { title: str(o.title, 'title'), course: courseOf(o, 'request') };
}
