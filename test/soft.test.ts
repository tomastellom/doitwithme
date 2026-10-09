import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plan } from '../src/planner.ts';
import { defaultPreferences } from '../src/defaults.ts';
import type { Preferences } from '../src/types.ts';
import { commitment, deadline, input, task } from './helpers.ts';

// Weekdays offer 18:00-20:00 only. Friday evening is a soft window.
const evening = (): Preferences => ({
  ...structuredClone(defaultPreferences),
  weekdayWindow: { start: 1080, end: 1200 },
  dayOffWindow: { start: 1080, end: 1200 },
  daysOff: [],
  softWindows: [{ weekday: 5, start: 1080, end: 1440 }],
  softMode: 'auto',
});

const FRI = '2026-10-09';

test('soft time is left alone when the deadline fits without it', () => {
  const result = plan(
    input({
      preferences: evening(),
      tasks: [task()],
      deadlines: [deadline({ dueDate: FRI, effortMinutes: 480 })],
    }),
  );
  assert.equal(result.blocks.filter((b) => b.date === FRI).length, 0);
  assert.deepEqual(result.warnings, []);
});

test('soft time is used, and reported, when a deadline would otherwise be missed', () => {
  const result = plan(
    input({
      preferences: evening(),
      tasks: [task()],
      deadlines: [deadline({ dueDate: FRI, effortMinutes: 600 })],
    }),
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
  ]);
});

test('an opened soft window takes study work but never chores', () => {
  const result = plan(
    input({
      preferences: evening(),
      tasks: [task(), task({ id: 'chores', title: 'Chores', category: 'chores', weeklyMinutes: 5000, priority: 1 })],
      deadlines: [deadline({ dueDate: FRI, effortMinutes: 600 })],
    }),
  );
  const friday = result.blocks.filter((b) => b.date === FRI);
  assert.ok(friday.length > 0);
  assert.ok(friday.every((b) => b.category === 'study'));
});

test('a study task short of its weekly target may use soft time as a last resort', () => {
  const result = plan(input({ preferences: evening(), tasks: [task({ weeklyMinutes: 5000 })] }));
  assert.equal(result.blocks.filter((b) => b.date === FRI).length, 1);
  assert.ok(result.warnings.some((w) => w.kind === 'soft-time-used'));
});

test('a non-study weekly shortfall never opens a soft window', () => {
  const result = plan(
    input({
      preferences: evening(),
      tasks: [task({ id: 'chores', title: 'Chores', category: 'chores', weeklyMinutes: 5000 })],
    }),
  );
  assert.equal(result.blocks.filter((b) => b.date === FRI).length, 0);
  assert.ok(result.warnings.every((w) => w.kind !== 'soft-time-used'));
});

test('an errand with a deadline never takes soft time, and its shortfall is reported', () => {
  const blockWeekdayEvenings = commitment({
    start: 1080,
    end: 1200,
    pattern: { kind: 'weekly', weekdays: [1, 2, 3, 4], from: '2026-01-01', to: '2026-12-31' },
  });
  const errand = task({ id: 'taxes', title: 'Taxes', category: 'errands' });
  const result = plan(
    input({
      preferences: evening(),
      commitments: [blockWeekdayEvenings],
      tasks: [errand],
      deadlines: [deadline({ id: 'dt', taskId: 'taxes', kind: 'task', dueDate: FRI, effortMinutes: 120 })],
    }),
  );
  assert.equal(result.blocks.filter((b) => b.date === FRI).length, 0);
  assert.deepEqual(result.warnings, [
    {
      kind: 'deadline-short',
      message: `Taxes task due ${FRI} is short by 120 min`,
      detail: { taskTitle: 'Taxes', category: 'errands', kind: 'task', dueDate: FRI, minutes: 120 },
    },
  ]);
});

test('a shortfall that soft time cannot fix does not open soft time', () => {
  const result = plan(
    input({
      preferences: evening(),
      tasks: [task({ weeklyMinutes: 300 }), task({ id: 'old', title: 'Old exam prep', category: 'study' })],
      deadlines: [deadline({ id: 'dold', taskId: 'old', dueDate: '2026-10-01', effortMinutes: 60 })],
    }),
  );
  assert.equal(result.blocks.filter((b) => b.date === FRI).length, 0);
  assert.ok(result.warnings.every((w) => w.kind !== 'soft-time-used'));
  assert.equal(result.warnings.filter((w) => w.kind === 'deadline-short').length, 1);
});
