import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planDays } from '../src/planner.ts';
import { defaultPreferences } from '../src/defaults.ts';
import type { Block, Preferences } from '../src/types.ts';
import { commitment, input, task } from './helpers.ts';

const prefs = (over: Partial<Preferences> = {}): Preferences => ({
  ...structuredClone(defaultPreferences),
  softWindows: [],
  ...over,
});

const minutes = (blocks: Block[]): number => blocks.reduce((t, b) => t + b.end - b.start, 0);
const on = (blocks: Block[], date: string): Block[] => blocks.filter((b) => b.date === date);

test('a weekly target is fully placed within the week, spread evenly', () => {
  const blocks = planDays(input({ preferences: prefs(), tasks: [task({ weeklyMinutes: 600 })] }));
  assert.equal(minutes(blocks), 600);
  assert.deepEqual(on(blocks, '2026-10-05'), [
    { taskId: 't1', title: 'Study', category: 'study', date: '2026-10-05', start: 480, end: 570 },
  ]);
});

test('days off use the day-off window', () => {
  const blocks = planDays(input({ preferences: prefs(), tasks: [task({ weeklyMinutes: 600 })] }));
  assert.equal(on(blocks, '2026-10-10')[0].start, 600);
  assert.ok(blocks.every((b) => b.end <= 1320));
  assert.ok(on(blocks, '2026-10-11').every((b) => b.end <= 1200));
});

test('blocks never overlap a commitment', () => {
  const lecture = commitment({
    start: 480,
    end: 600,
    pattern: { kind: 'once', date: '2026-10-05' },
  });
  const blocks = planDays(
    input({ preferences: prefs(), commitments: [lecture], tasks: [task({ weeklyMinutes: 600 })] }),
  );
  assert.equal(on(blocks, '2026-10-05')[0].start, 600);
});

test('nothing is placed over Sunday mass, even in a tight day-off window', () => {
  const mass = commitment({
    title: 'Mass',
    start: 1200,
    end: 1260,
    bufferBefore: 30,
    pattern: { kind: 'weekly', weekdays: [0], from: '2026-09-01', to: '2026-12-31' },
  });
  const blocks = planDays(
    input({
      preferences: prefs({ dayOffWindow: { start: 1000, end: 1200 }, daysOff: [0] }),
      commitments: [mass],
      tasks: [task({ weeklyMinutes: 1500, maxBlock: 600 })],
    }),
  );
  const sunday = on(blocks, '2026-10-11');
  assert.ok(sunday.length > 0);
  assert.ok(sunday.every((b) => b.end <= 1170));
});

test('a cancelled private lesson frees its slot for study', () => {
  const lesson = commitment({
    title: 'Private lesson',
    start: 480,
    end: 1320,
    pattern: { kind: 'weekly', weekdays: [2], from: '2026-09-01', to: '2026-12-31' },
  });
  const t = task({ weeklyMinutes: 120 });
  const withLesson = planDays(input({ preferences: prefs(), commitments: [lesson], tasks: [t] }));
  assert.equal(on(withLesson, '2026-10-06').length, 0);
  assert.equal(minutes(withLesson), 120);

  const cancelled = { ...lesson, exceptions: ['2026-10-06'] };
  const freed = planDays(input({ preferences: prefs(), commitments: [cancelled], tasks: [t] }));
  assert.equal(on(freed, '2026-10-06').length, 1);
  assert.equal(minutes(freed), 120);
});

test('nowMinutes keeps today\'s blocks in the future', () => {
  const blocks = planDays(
    input({ preferences: prefs(), nowMinutes: 780, tasks: [task({ weeklyMinutes: 600 })] }),
  );
  assert.equal(on(blocks, '2026-10-05')[0].start, 780);
});

test('a break is left between two blocks in the same slot', () => {
  const blocks = planDays(
    input({
      preferences: prefs(),
      tasks: [
        task({ id: 'a', title: 'A', weeklyMinutes: 700, priority: 1 }),
        task({ id: 'b', title: 'B', weeklyMinutes: 700, priority: 5 }),
      ],
    }),
  );
  const monday = on(blocks, '2026-10-05');
  assert.equal(monday[0].taskId, 'a');
  assert.equal(monday[1].taskId, 'b');
  assert.equal(monday[1].start - monday[0].end, 10);
});

test('when time is scarce the higher priority task gets it', () => {
  const blocks = planDays(
    input({
      preferences: prefs({ weekdayWindow: { start: 480, end: 540 }, daysOff: [] }),
      tasks: [
        task({ id: 'low', title: 'Low', weeklyMinutes: 600, priority: 5 }),
        task({ id: 'high', title: 'High', weeklyMinutes: 600, priority: 1 }),
      ],
    }),
  );
  assert.ok(on(blocks, '2026-10-05').every((b) => b.taskId === 'high'));
});

test('gym sessions are spread across the week, not stacked', () => {
  const gym = task({ id: 'gym', title: 'Gym', category: 'gym', weeklyMinutes: 180, maxBlock: 60, onePerDay: true });
  const blocks = planDays(input({ preferences: prefs(), tasks: [gym] }));
  assert.deepEqual(blocks.map((b) => b.date), ['2026-10-05', '2026-10-07', '2026-10-09']);
});

test('a day fully covered by commitments gets no blocks and does not throw', () => {
  const busy = commitment({
    start: 480,
    end: 540,
    pattern: { kind: 'weekly', weekdays: [0, 1, 2, 3, 4, 5, 6], from: '2026-01-01', to: '2026-12-31' },
  });
  const blocks = planDays(
    input({
      preferences: prefs({ weekdayWindow: { start: 480, end: 540 }, daysOff: [] }),
      commitments: [busy],
      tasks: [task({ weeklyMinutes: 600 })],
    }),
  );
  assert.deepEqual(blocks, []);
});

test('a task with maxBlock 0 neither hangs the planner nor starves others', () => {
  const blocks = planDays(
    input({
      preferences: prefs(),
      tasks: [task({ id: 'bad', weeklyMinutes: 100, maxBlock: 0, priority: 1 }), task({ id: 'ok', weeklyMinutes: 100 })],
    }),
  );
  assert.equal(minutes(blocks.filter((b) => b.taskId === 'bad')), 0);
  assert.equal(minutes(blocks.filter((b) => b.taskId === 'ok')), 100);
});

test('planning across a year boundary keeps the weekly target', () => {
  const blocks = planDays(
    input({
      today: '2026-12-30',
      horizonDays: 5,
      preferences: prefs(),
      tasks: [task({ weeklyMinutes: 100 })],
    }),
  );
  assert.equal(minutes(blocks), 100);
  assert.ok(on(blocks, '2027-01-02').length > 0);
  assert.deepEqual(blocks.map((b) => b.date), [...blocks.map((b) => b.date)].sort());
});

test('blocks already done earlier this week count toward the weekly target', () => {
  const done: Block = { taskId: 't1', title: 'Study', category: 'study', date: '2026-10-05', start: 480, end: 780 };
  const blocks = planDays(
    input({
      today: '2026-10-07',
      horizonDays: 5,
      preferences: prefs(),
      pastBlocks: [done],
      tasks: [task({ weeklyMinutes: 600 })],
    }),
  );
  assert.equal(minutes(blocks), 300);
});
