import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plan } from '../src/planner.ts';
import { defaultPreferences } from '../src/defaults.ts';
import type { PlanResult, Preferences } from '../src/types.ts';
import { deadline, input, task } from './helpers.ts';

// Weekdays offer 18:00-20:00 only. Friday evening is a soft window.
const evening = (over: Partial<Preferences> = {}): Preferences => ({
  ...structuredClone(defaultPreferences),
  weekdayWindow: { start: 1080, end: 1200 },
  dayOffWindow: { start: 1080, end: 1200 },
  daysOff: [],
  softWindows: [{ weekday: 5, start: 1080, end: 1440 }],
  softMode: 'ask',
  ...over,
});

const FRI = '2026-10-09';
const missing = (r: PlanResult): number =>
  r.warnings
    .filter((w) => w.kind === 'weekly-short' || w.kind === 'deadline-short')
    .reduce((t, w) => t + (w.detail?.minutes ?? 0), 0);

test('ask mode never opens soft time by itself and offers the best date', () => {
  const result = plan(input({ preferences: evening(), tasks: [task({ weeklyMinutes: 5000 })] }));
  assert.equal(result.blocks.filter((b) => b.date === FRI).length, 0);
  assert.deepEqual(result.warnings, [
    {
      kind: 'weekly-short',
      message: 'Study is short by 4280 min in the week of 2026-10-05',
      detail: { taskTitle: 'Study', weekStart: '2026-10-05', minutes: 4280 },
    },
    {
      kind: 'soft-offer',
      message: `Soft time on ${FRI} could cover 120 min of study`,
      detail: { date: FRI, minutes: 120, costMinutes: 0 },
    },
  ]);
});

test('an approved date is used and reported, and no further offer is made', () => {
  const result = plan(
    input({ preferences: evening(), approvedSoft: [FRI], tasks: [task({ weeklyMinutes: 5000 })] }),
  );
  const friday = result.blocks.filter((b) => b.date === FRI);
  assert.equal(friday.length, 1);
  assert.equal(friday[0].end - friday[0].start, 120);
  assert.deepEqual(result.warnings, [
    {
      kind: 'soft-time-used',
      message: `Used soft free time on ${FRI} for Study`,
      detail: { date: FRI, titles: ['Study'], minutes: 120 },
    },
    {
      kind: 'weekly-short',
      message: 'Study is short by 4160 min in the week of 2026-10-05',
      detail: { taskTitle: 'Study', weekStart: '2026-10-05', minutes: 4160 },
    },
  ]);
});

test('a deadline shortfall also gets an offer', () => {
  const result = plan(
    input({
      preferences: evening(),
      tasks: [task()],
      deadlines: [deadline({ dueDate: FRI, effortMinutes: 600 })],
    }),
  );
  assert.deepEqual(result.warnings, [
    {
      kind: 'deadline-short',
      message: `Study exam due ${FRI} is short by 120 min`,
      detail: { taskTitle: 'Study', kind: 'exam', dueDate: FRI, minutes: 120 },
    },
    {
      kind: 'soft-offer',
      message: `Soft time on ${FRI} could cover 120 min of study`,
      detail: { date: FRI, minutes: 120, costMinutes: 0 },
    },
  ]);
});

test('a tie between soft dates goes to the earliest', () => {
  const both = evening({
    softWindows: [
      { weekday: 5, start: 1080, end: 1440 },
      { weekday: 6, start: 1080, end: 1440 },
    ],
  });
  const result = plan(input({ preferences: both, tasks: [task({ weeklyMinutes: 5000 })] }));
  const offer = result.warnings.find((w) => w.kind === 'soft-offer');
  assert.equal(offer?.detail?.date, FRI);
});

test('non-study shortfalls never get an offer', () => {
  const result = plan(
    input({
      preferences: evening(),
      tasks: [task({ id: 'chores', title: 'Chores', category: 'chores', weeklyMinutes: 5000 })],
    }),
  );
  assert.ok(result.warnings.every((w) => w.kind !== 'soft-offer'));
  assert.equal(result.blocks.filter((b) => b.date === FRI).length, 0);
});

test('an offer is a promise: approving its date recovers exactly the offered minutes', () => {
  const base = input({ preferences: evening(), tasks: [task({ weeklyMinutes: 5000 })] });
  const before = plan(base);
  const offer = before.warnings.find((w) => w.kind === 'soft-offer');
  assert.ok(offer?.detail?.date);
  const after = plan({ ...base, approvedSoft: [offer.detail.date] });
  assert.equal(missing(before) - missing(after), offer.detail.minutes);
});

test('auto mode still opens soft time on its own', () => {
  const result = plan(
    input({
      preferences: evening({ softMode: 'auto' }),
      tasks: [task({ weeklyMinutes: 5000 })],
    }),
  );
  assert.equal(result.blocks.filter((b) => b.date === FRI).length, 1);
  assert.ok(result.warnings.every((w) => w.kind !== 'soft-offer'));
});

test('an offer that costs other tasks says so, and the cost is real', () => {
  const tasks = [
    task({ weeklyMinutes: 600, maxBlock: 120, priority: 3 }),
    task({ id: 'chores', title: 'Chores', category: 'chores', weeklyMinutes: 360, maxBlock: 60, priority: 3 }),
  ];
  const base = input({ preferences: evening(), tasks });
  const before = plan(base);
  const offer = before.warnings.find((w) => w.kind === 'soft-offer');
  assert.deepEqual(offer, {
    kind: 'soft-offer',
    message: `Soft time on ${FRI} could cover 75 min of study, but other tasks lose 20 min`,
    detail: { date: FRI, minutes: 75, costMinutes: 20 },
  });
  const other = (r: PlanResult): number =>
    r.warnings
      .filter((w) => w.kind === 'weekly-short' && w.detail?.taskTitle === 'Chores')
      .reduce((t, w) => t + (w.detail?.minutes ?? 0), 0);
  const after = plan({ ...base, approvedSoft: [FRI] });
  assert.equal(other(after) - other(before), offer.detail?.costMinutes);
});
