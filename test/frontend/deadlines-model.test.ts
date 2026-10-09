import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deadlinesModel } from '../../public/js/deadlines-model.js';

const clock = { today: '2026-10-09', nowMinutes: 600, horizonDays: 15 };
const task = (id: string, title: string, category = 'study') => ({ id, title, category, weeklyMinutes: null, maxBlock: 90, onePerDay: false, priority: 3 });
const dl = (id: string, taskId: string, dueDate: string, effortMinutes: number, kind = 'exam') => ({ id, taskId, kind, dueDate, effortMinutes });
const blk = (deadlineId: string, date: string, start: number, end: number) => ({ taskId: 't', title: 'x', category: 'study', date, start, end, deadlineId });
const base = (over: any = {}) => ({ tasks: [task('chem', 'Chemistry'), task('tax', 'Taxes', 'errands')], deadlines: [], blocks: [], ...over });

test('open due dates are listed soonest first with a plain count', () => {
  const m = deadlinesModel(base({ deadlines: [dl('b', 'chem', '2026-10-23', 480), dl('a', 'tax', '2026-10-19', 120, 'task'), dl('old', 'chem', '2026-10-01', 60)] }), clock);
  assert.deepEqual(m.rows.map((r: any) => r.id), ['a', 'b']);
  assert.equal(m.open, 2);
});

test('a row names the date, the days left, the title and the task', () => {
  const m = deadlinesModel(base({ deadlines: [dl('b', 'chem', '2026-10-23', 480)] }), clock);
  const r = m.rows[0];
  assert.deepEqual([r.day, r.month, r.weekday, r.daysLabel], [23, 'Oct', 'Fri', 'in 14 days']);
  assert.equal(r.title, 'Chemistry exam');
  assert.equal(r.sub, 'Study / Chemistry');
  assert.equal(deadlinesModel(base({ deadlines: [dl('t', 'chem', '2026-10-09', 60)] }), clock).rows[0].daysLabel, 'today');
  assert.equal(deadlinesModel(base({ deadlines: [dl('t', 'chem', '2026-10-10', 60)] }), clock).rows[0].daysLabel, 'tomorrow');
});

test('done, planned and short minutes follow the board, split at the current minute', () => {
  const blocks = [
    blk('b', '2026-10-08', 480, 540),
    blk('b', '2026-10-09', 540, 600),
    blk('b', '2026-10-09', 700, 760),
    blk('b', '2026-10-12', 480, 570),
    blk('other', '2026-10-12', 480, 570),
  ];
  const m = deadlinesModel(base({ deadlines: [dl('b', 'chem', '2026-10-23', 480)], blocks }), clock);
  const r = m.rows[0];
  assert.deepEqual([r.done, r.planned, r.short], [120, 150, 210]);
  assert.equal(r.status, 'short');
  assert.equal(m.shorts, 1);
  assert.ok(Math.abs(r.doneW + r.plannedW + r.shortW - 100) < 0.001);
});

test('a covered due date has no short part', () => {
  const m = deadlinesModel(base({ deadlines: [dl('b', 'tax', '2026-10-19', 120, 'task')], blocks: [blk('b', '2026-10-12', 480, 600)] }), clock);
  assert.equal(m.rows[0].status, 'covered');
  assert.equal(m.rows[0].short, 0);
  assert.equal(m.rows[0].title, 'Taxes task');
  assert.equal(m.shorts, 0);
});

test('more planned than needed still fills the bar to 100 at most', () => {
  const m = deadlinesModel(base({ deadlines: [dl('b', 'chem', '2026-10-12', 60)], blocks: [blk('b', '2026-10-10', 480, 720)] }), clock);
  const r = m.rows[0];
  assert.equal(r.short, 0);
  assert.ok(r.doneW + r.plannedW + r.shortW <= 100.001);
});

test('effort 0 is covered, a due date beyond the plan window is later and never short', () => {
  const zero = deadlinesModel(base({ deadlines: [dl('z', 'chem', '2026-10-12', 0)] }), clock).rows[0];
  assert.equal(zero.status, 'covered');
  assert.deepEqual([zero.doneW, zero.plannedW, zero.shortW], [0, 0, 0]);
  const far = deadlinesModel(base({ deadlines: [dl('f', 'chem', '2026-12-01', 600)] }), clock);
  assert.equal(far.rows[0].status, 'later');
  assert.equal(far.rows[0].short, 0);
  assert.equal(far.shorts, 0);
});

test('a due date whose task was deleted still lists without crashing', () => {
  const m = deadlinesModel(base({ tasks: [], deadlines: [dl('x', 'gone', '2026-10-12', 60)] }), clock);
  assert.equal(m.rows[0].title, 'Unknown task exam');
  assert.equal(m.rows[0].sub, 'Unknown task');
});
