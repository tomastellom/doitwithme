import { defaultPreferences } from './defaults.ts';
import type {
  Block, Commitment, Deadline, Pattern, Preferences, SoftWindow, State, Task, Window,
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
  deadlines.forEach((d, i) => {
    if (!tasks.some((t) => t.id === d.taskId)) fail(`deadlines[${i}].taskId does not match any task`);
  });
  return {
    commitments,
    tasks,
    deadlines,
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
