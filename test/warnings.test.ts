import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plan } from '../src/planner.ts';
import { defaultPreferences } from '../src/defaults.ts';
import type { Preferences } from '../src/types.ts';
import { deadline, input, task } from './helpers.ts';

// One 60-minute window every day, no soft windows.
const tight = (): Preferences => ({
  ...structuredClone(defaultPreferences),
  weekdayWindow: { start: 480, end: 540 },
  dayOffWindow: { start: 480, end: 540 },
  daysOff: [],
  softWindows: [],
});

test('an unmeetable deadline is reported with the exact shortfall', () => {
  const result = plan(
    input({
      preferences: tight(),
      tasks: [task()],
      deadlines: [deadline({ dueDate: '2026-10-07', effortMinutes: 600 })],
    }),
  );
  assert.deepEqual(result.warnings, [
    {
      kind: 'deadline-short',
      message: 'Study exam due 2026-10-07 is short by 420 min',
      detail: { taskId: 't1', deadlineId: 'd1', taskTitle: 'Study', category: 'study', kind: 'exam', dueDate: '2026-10-07', minutes: 420 },
    },
  ]);
});

test('a meetable deadline produces no warning', () => {
  const result = plan(
    input({
      preferences: tight(),
      tasks: [task()],
      deadlines: [deadline({ dueDate: '2026-10-07', effortMinutes: 60 })],
    }),
  );
  assert.deepEqual(result.warnings, []);
});

test('a weekly target that cannot fit is reported', () => {
  const result = plan(input({ preferences: tight(), tasks: [task({ weeklyMinutes: 600 })] }));
  assert.deepEqual(result.warnings, [
    {
      kind: 'weekly-short',
      message: 'Study is short by 180 min in the week of 2026-10-05',
      detail: { taskId: 't1', taskTitle: 'Study', category: 'study', weekStart: '2026-10-05', minutes: 180 },
    },
  ]);
});

test('a deadline beyond the horizon is not reported yet', () => {
  const result = plan(
    input({
      preferences: tight(),
      tasks: [task()],
      deadlines: [deadline({ dueDate: '2026-11-30', effortMinutes: 600 })],
    }),
  );
  assert.deepEqual(result.warnings, []);
});

test('an overdue deadline with work left is reported, not ignored', () => {
  const result = plan(
    input({
      preferences: tight(),
      tasks: [task()],
      deadlines: [deadline({ dueDate: '2026-10-01', effortMinutes: 60 })],
    }),
  );
  assert.deepEqual(result.warnings, [
    {
      kind: 'deadline-short',
      message: 'Study exam due 2026-10-01 is short by 60 min',
      detail: { taskId: 't1', deadlineId: 'd1', taskTitle: 'Study', category: 'study', kind: 'exam', dueDate: '2026-10-01', minutes: 60 },
    },
  ]);
});

test('work done before today counts toward a deadline', () => {
  const result = plan(
    input({
      preferences: tight(),
      tasks: [task()],
      deadlines: [deadline({ dueDate: '2026-10-07', effortMinutes: 60 })],
      pastBlocks: [
        { taskId: 't1', title: 'Study', category: 'study', date: '2026-10-03', start: 480, end: 540, deadlineId: 'd1' },
      ],
    }),
  );
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.blocks, []);
});
