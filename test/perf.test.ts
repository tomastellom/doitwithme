import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replan } from '../src/replan.ts';
import { emptyState } from '../src/store.ts';
import { addDays } from '../src/dates.ts';
import type { Block, State } from '../src/types.ts';
import { deadline, task } from './helpers.ts';

test('replanning stays fast with a year of history, many tasks and far deadlines', () => {
  const tasks = Array.from({ length: 8 }, (_, i) =>
    task({ id: `t${i}`, title: `Task ${i}`, category: i < 3 ? 'study' : 'chores', weeklyMinutes: 120, priority: (i % 5) + 1 }),
  );
  const history: Block[] = [];
  for (let k = 1; k <= 400; k++) {
    for (let j = 0; j < 4; j++) {
      history.push({ taskId: `t${j}`, title: `Task ${j}`, category: 'study', date: addDays('2026-10-05', -k), start: 480 + j * 60, end: 520 + j * 60 });
    }
  }
  const state: State = {
    ...emptyState(),
    tasks,
    blocks: history,
    deadlines: [
      deadline({ id: 'a', taskId: 't0', dueDate: '2027-03-01', effortMinutes: 600 }),
      deadline({ id: 'b', taskId: 't1', dueDate: '2027-05-01', effortMinutes: 600 }),
      deadline({ id: 'c', taskId: 't2', dueDate: '2026-10-01', effortMinutes: 60 }),
    ],
  };
  const t0 = performance.now();
  replan(state, '2026-10-05', undefined, 30);
  const ms = performance.now() - t0;
  assert.ok(ms < 4000, `replan took ${Math.round(ms)} ms`);
});
