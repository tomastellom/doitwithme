import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replan } from '../src/replan.ts';
import { emptyState } from '../src/store.ts';
import type { Block, State } from '../src/types.ts';
import { task } from './helpers.ts';

const old = (date: string, start: number, end: number): Block => ({
  taskId: 't1', title: 'Study', category: 'study', date, start, end,
});

function stateWith(blocks: Block[]): State {
  return { ...emptyState(), tasks: [task({ weeklyMinutes: 600 })], blocks };
}

test('blocks before today are kept exactly', () => {
  const past = old('2026-10-03', 480, 540);
  const { state } = replan(stateWith([past]), '2026-10-05');
  assert.deepEqual(state.blocks[0], past);
});

test('future blocks are replaced, not duplicated', () => {
  const stale = old('2026-10-08', 100, 160);
  const { state } = replan(stateWith([stale]), '2026-10-05');
  assert.ok(!state.blocks.some((b) => b.start === 100 && b.date === '2026-10-08'));
});

test('today\'s finished blocks are kept and unfinished ones are replanned', () => {
  const done = old('2026-10-05', 480, 540);
  const notYet = old('2026-10-05', 900, 960);
  const { state } = replan(stateWith([done, notYet]), '2026-10-05', 600);
  assert.deepEqual(state.blocks.filter((b) => b.date === '2026-10-05')[0], done);
  assert.ok(!state.blocks.some((b) => b.date === '2026-10-05' && b.start === 900 && b.end === 960));
});

test('replanning twice gives the same result', () => {
  const once = replan(stateWith([]), '2026-10-05').state;
  const twice = replan(once, '2026-10-05').state;
  assert.deepEqual(twice, once);
});

test('the input state is not mutated', () => {
  const input = stateWith([old('2026-10-08', 100, 160)]);
  const copy = structuredClone(input);
  replan(input, '2026-10-05');
  assert.deepEqual(input, copy);
});

test('work done earlier counts, so a finished week plans nothing more', () => {
  const done = [old('2026-10-05', 480, 780), old('2026-10-06', 480, 780)];
  // Wednesday to Sunday only: next week has its own fresh target.
  const { state } = replan(stateWith(done), '2026-10-07', undefined, 5);
  assert.equal(state.blocks.length, 2);
});

test('replanning in the middle of a block keeps the part already done', () => {
  const { state } = replan(stateWith([old('2026-10-05', 480, 525)]), '2026-10-05', 500);
  assert.deepEqual(state.blocks[0], old('2026-10-05', 480, 500));
  const mondayMinutes = state.blocks
    .filter((b) => b.date === '2026-10-05')
    .reduce((t, b) => t + b.end - b.start, 0);
  assert.ok(mondayMinutes <= 90, `Monday has ${mondayMinutes} min`);
  const again = replan(state, '2026-10-05', 520).state;
  assert.deepEqual(again.blocks[0], old('2026-10-05', 480, 500));
});
