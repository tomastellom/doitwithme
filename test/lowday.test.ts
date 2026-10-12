import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planDays } from '../src/planner.ts';
import { replan } from '../src/replan.ts';
import { emptyState } from '../src/store.ts';
import type { Block } from '../src/types.ts';
import { commitment, input, task } from './helpers.ts';

const TODAY = '2026-10-05'; // Monday
const minutes = (blocks: Block[], date: string) => blocks.filter((b) => b.date === date).reduce((t, b) => t + b.end - b.start, 0);
const plenty = () => input({ tasks: [task({ weeklyMinutes: 2000 })], lowDays: [TODAY] });

test('a low day keeps only the minimum of generated work and later days take up the rest', () => {
  const normal = planDays(input({ tasks: [task({ weeklyMinutes: 2000 })] }));
  const low = planDays(plenty());
  assert.ok(minutes(normal, TODAY) > 120);
  assert.equal(minutes(low, TODAY), 120);
  assert.ok(minutes(low, '2026-10-06') >= minutes(normal, '2026-10-06'));
});

test('minutes ticked done today count toward the cap and are kept', () => {
  const done: Block = { taskId: 't1', title: 'Study', category: 'study', date: TODAY, start: 480, end: 540, status: 'done' };
  const low = planDays({ ...plenty(), pastBlocks: [done] });
  assert.equal(minutes(low, TODAY), 60);
});

test('a cap smaller than the smallest block places nothing', () => {
  const prefs = { ...input().preferences, lowDayMinutes: 20, minBlock: 30 };
  assert.equal(minutes(planDays({ ...plenty(), preferences: prefs }), TODAY), 0);
});

test('a cap of zero keeps the day empty of generated work', () => {
  const prefs = { ...input().preferences, lowDayMinutes: 0 };
  assert.equal(minutes(planDays({ ...plenty(), preferences: prefs }), TODAY), 0);
});

test('commitments are never moved on a low day', () => {
  const state = {
    ...emptyState(),
    tasks: [task({ weeklyMinutes: 2000 })],
    commitments: [commitment({ pattern: { kind: 'once', date: TODAY } })],
    checkIns: [{ date: TODAY, mood: 'low' as const }],
  };
  const { state: out } = replan(state, TODAY);
  assert.equal(out.commitments.length, 1);
  assert.equal(minutes(out.blocks, TODAY), 120);
});

test('late in the day the cap applies to what is still to be placed', () => {
  const state = { ...emptyState(), tasks: [task({ weeklyMinutes: 2000 })], checkIns: [{ date: TODAY, mood: 'low' as const }] };
  const { state: out } = replan(state, TODAY, 20 * 60);
  assert.ok(minutes(out.blocks, TODAY) <= 120);
});

test('answering okay after low restores the day', () => {
  const base = { ...emptyState(), tasks: [task({ weeklyMinutes: 2000 })] };
  const low = replan({ ...base, checkIns: [{ date: TODAY, mood: 'low' as const }] }, TODAY).state;
  const okay = replan({ ...low, checkIns: [{ date: TODAY, mood: 'okay' as const }] }, TODAY).state;
  assert.ok(minutes(okay.blocks, TODAY) > minutes(low.blocks, TODAY));
  assert.deepEqual(okay.blocks, replan(base, TODAY).state.blocks);
});

test('only low days are capped: a low answer for an earlier day does nothing', () => {
  const state = { ...emptyState(), tasks: [task({ weeklyMinutes: 2000 })], checkIns: [{ date: '2026-10-04', mood: 'low' as const }] };
  assert.deepEqual(replan(state, TODAY).state.blocks, replan({ ...state, checkIns: [] }, TODAY).state.blocks);
});

test('answers older than 60 days are dropped when replanning', () => {
  const state = { ...emptyState(), checkIns: [{ date: '2026-07-01', mood: 'low' as const }, { date: '2026-10-04', mood: 'okay' as const }] };
  assert.deepEqual(replan(state, TODAY).state.checkIns, [{ date: '2026-10-04', mood: 'okay' }]);
  assert.equal(replan(emptyState(), TODAY).state.checkIns, undefined);
});

test('later replans on a low day do not refill it', () => {
  let state: any = { ...emptyState(), tasks: [task({ weeklyMinutes: 2000 })], checkIns: [{ date: TODAY, mood: 'low' as const }] };
  state = replan(state, TODAY, 9 * 60).state;
  assert.equal(minutes(state.blocks, TODAY), 120);
  state = replan(state, TODAY, 12 * 60).state;
  state = replan(state, TODAY, 15 * 60).state;
  assert.equal(minutes(state.blocks, TODAY), 120);
});
