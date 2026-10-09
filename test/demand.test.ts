import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demandsFor } from '../src/demand.ts';
import { daysBetween } from '../src/dates.ts';
import type { Block } from '../src/types.ts';
import { deadline, input, task } from './helpers.ts';

// Every calendar day counts as usable.
const allDays = (a: string, b: string): number => daysBetween(a, b);

const MON = '2026-10-05';

function block(over: Partial<Block> = {}): Block {
  return { taskId: 't1', title: 'Study', category: 'study', date: MON, start: 540, end: 630, ...over };
}

test('weekly target is spread evenly over the days left in the week', () => {
  const inp = input({ tasks: [task({ weeklyMinutes: 600 })] });
  const [d] = demandsFor(inp, MON, [], allDays);
  assert.equal(d.deadline, null);
  assert.equal(d.allowedLeft, 90);
});

test('once today\'s share is placed nothing more is allowed today', () => {
  const inp = input({ tasks: [task({ weeklyMinutes: 600 })] });
  assert.deepEqual(demandsFor(inp, MON, [block()], allDays), []);
});

test('tomorrow\'s share is recomputed from what is still undone', () => {
  const inp = input({ tasks: [task({ weeklyMinutes: 600 })] });
  const [d] = demandsFor(inp, '2026-10-06', [block()], allDays);
  assert.equal(d.allowedLeft, 85);
});

test('undone work carries forward and raises the daily share', () => {
  const inp = input({ tasks: [task({ weeklyMinutes: 600 })] });
  const [d] = demandsFor(inp, '2026-10-08', [], allDays);
  assert.equal(d.allowedLeft, 150);
});

test('a target smaller than minBlock is allowed in one piece', () => {
  const inp = input({ tasks: [task({ weeklyMinutes: 20 })] });
  assert.equal(demandsFor(inp, MON, [], allDays)[0].allowedLeft, 20);
});

test('days that cannot hold work are not counted when spreading', () => {
  const inp = input({ tasks: [task({ weeklyMinutes: 600 })] });
  const onlyOneMoreDay = () => 1;
  assert.equal(demandsFor(inp, MON, [], onlyOneMoreDay)[0].allowedLeft, 300);
});

test('onePerDay task gets one maxBlock session on an open day', () => {
  const inp = input({ tasks: [task({ id: 'gym', weeklyMinutes: 180, maxBlock: 60, onePerDay: true })] });
  assert.equal(demandsFor(inp, MON, [], allDays)[0].allowedLeft, 60);
});

test('onePerDay task rests the day after a session when there is slack', () => {
  const inp = input({ tasks: [task({ id: 'gym', weeklyMinutes: 180, maxBlock: 60, onePerDay: true })] });
  const monday = block({ taskId: 'gym', start: 540, end: 600 });
  assert.deepEqual(demandsFor(inp, '2026-10-06', [monday], allDays), []);
  assert.equal(demandsFor(inp, '2026-10-07', [monday], allDays)[0].allowedLeft, 60);
});

test('onePerDay task trains on consecutive days when it must', () => {
  const inp = input({ tasks: [task({ id: 'gym', weeklyMinutes: 180, maxBlock: 60, onePerDay: true })] });
  // Friday done, 120 min still due, only Saturday and Sunday left: two sessions
  // in two days, so Saturday cannot rest even though Friday had one.
  const friday = block({ taskId: 'gym', date: '2026-10-09', start: 540, end: 600 });
  assert.equal(demandsFor(inp, '2026-10-10', [friday], allDays)[0].allowedLeft, 60);
});

test('deadline demand ramps up as the due date approaches', () => {
  const inp = input({
    tasks: [task()],
    deadlines: [deadline({ dueDate: '2026-10-12', effortMinutes: 600 })],
  });
  assert.equal(demandsFor(inp, MON, [], allDays)[0].allowedLeft, 75);
  assert.equal(demandsFor(inp, '2026-10-09', [], allDays)[0].allowedLeft, 150);
});

test('only blocks tagged with the deadline count toward it', () => {
  const inp = input({
    tasks: [task()],
    deadlines: [deadline({ dueDate: '2026-10-12', effortMinutes: 600 })],
  });
  const done = [
    block({ start: 540, end: 840, deadlineId: 'd1' }),
    block({ date: '2026-10-05', start: 900, end: 1000 }),
  ];
  const [d] = demandsFor(inp, '2026-10-06', done, allDays);
  assert.equal(d.deadline?.id, 'd1');
  assert.equal(d.allowedLeft, 45);
});

test('a deadline due today is still scheduled today', () => {
  const inp = input({
    tasks: [task()],
    deadlines: [deadline({ dueDate: MON, effortMinutes: 60 })],
  });
  assert.equal(demandsFor(inp, MON, [], allDays)[0].allowedLeft, 60);
});

test('a deadline already past produces no demand', () => {
  const inp = input({
    tasks: [task()],
    deadlines: [deadline({ dueDate: '2026-10-04', effortMinutes: 60 })],
  });
  assert.deepEqual(demandsFor(inp, MON, [], allDays), []);
});

test('higher priority outranks lower priority with equal need', () => {
  const inp = input({
    tasks: [
      task({ id: 'low', title: 'Low', weeklyMinutes: 300, priority: 5 }),
      task({ id: 'high', title: 'High', weeklyMinutes: 300, priority: 1 }),
    ],
  });
  assert.deepEqual(demandsFor(inp, MON, [], allDays).map((d) => d.task.id), ['high', 'low']);
});

test('zero targets, zero effort and zero maxBlock produce no demand', () => {
  const inp = input({
    tasks: [
      task({ id: 'a', weeklyMinutes: 0 }),
      task({ id: 'b', weeklyMinutes: 100, maxBlock: 0 }),
      task({ id: 'c' }),
    ],
    deadlines: [deadline({ taskId: 'c', effortMinutes: 0 })],
  });
  assert.deepEqual(demandsFor(inp, MON, [], allDays), []);
});
