import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeWarnings, replan, warningKey } from '../src/replan.ts';
import { defaultPreferences } from '../src/defaults.ts';
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

const eveningPrefs = () => ({
  ...structuredClone(defaultPreferences),
  weekdayWindow: { start: 1080, end: 1200 },
  dayOffWindow: { start: 1080, end: 1200 },
  daysOff: [],
  softWindows: [{ weekday: 5, start: 1080, end: 1440 }],
  softMode: 'ask' as const,
});

function studyState(over: Partial<State> = {}): State {
  return { ...emptyState(), preferences: eveningPrefs(), tasks: [task({ weeklyMinutes: 5000 })], ...over };
}

test('an approved date is honored by the replan', () => {
  const { state } = replan(studyState({ approvedSoft: ['2026-10-09'] }), '2026-10-05', undefined, 7);
  assert.equal(state.blocks.filter((b) => b.date === '2026-10-09').length, 1);
});

test('approved dates in the past are dropped, future ones kept', () => {
  const { state } = replan(studyState({ approvedSoft: ['2026-10-01', '2026-10-09'] }), '2026-10-05', undefined, 7);
  assert.deepEqual(state.approvedSoft, ['2026-10-09']);
});

test('warningKey joins kind and message', () => {
  assert.equal(warningKey({ kind: 'weekly-short', message: 'Gym is short' }), 'weekly-short|Gym is short');
});

test('describeWarnings adds a key and a dismissed flag', () => {
  const w = { kind: 'weekly-short' as const, message: 'Gym is short' };
  assert.deepEqual(describeWarnings([w], ['weekly-short|Gym is short']), [
    { ...w, key: 'weekly-short|Gym is short', dismissed: true },
  ]);
  assert.equal(describeWarnings([w], [])[0].dismissed, false);
});

test('dismissed keys that no longer match a warning are pruned, matching ones kept', () => {
  const first = replan(studyState(), '2026-10-05', undefined, 7);
  const offer = first.warnings.find((w) => w.kind === 'soft-offer');
  assert.ok(offer);
  const key = warningKey(offer);
  const withDismissed = studyState({ dismissed: [key, 'stale|gone'] });
  assert.deepEqual(replan(withDismissed, '2026-10-05', undefined, 7).state.dismissed, [key]);
});

test('a dismissed warning is forgotten once its shortfall disappears', () => {
  const first = replan(studyState(), '2026-10-05', undefined, 7);
  const key = warningKey(first.warnings.find((w) => w.kind === 'soft-offer')!);
  const fixed = studyState({ tasks: [task({ weeklyMinutes: 100 })], dismissed: [key] });
  assert.deepEqual(replan(fixed, '2026-10-05', undefined, 7).state.dismissed, []);
});

test('a warning key ignores the minutes, so it survives time passing', () => {
  const detail = { taskTitle: 'Study', weekStart: '2026-10-05', minutes: 4340 };
  const a = { kind: 'weekly-short' as const, message: 'Study is short by 4340 min in the week of 2026-10-05', detail };
  const b = {
    kind: 'weekly-short' as const,
    message: 'Study is short by 4335 min in the week of 2026-10-05',
    detail: { ...detail, minutes: 4335 },
  };
  assert.equal(warningKey(a), warningKey(b));
  assert.equal(warningKey(a), 'weekly-short|Study|2026-10-05');
  assert.equal(
    warningKey({ kind: 'soft-offer', message: 'x', detail: { date: '2026-10-09', minutes: 75, costMinutes: 20 } }),
    'soft-offer|2026-10-09',
  );
});

test('a dismissed warning stays dismissed while its minutes drift during the day', () => {
  const early = replan(studyState(), '2026-10-05', 1080, 7);
  const w1 = early.warnings.find((w) => w.kind === 'weekly-short')!;
  const key = warningKey(w1);
  const later = replan(studyState({ dismissed: [key] }), '2026-10-05', 1145, 7);
  const w2 = later.warnings.find((w) => w.kind === 'weekly-short')!;
  assert.notEqual(w1.message, w2.message);
  assert.deepEqual(later.state.dismissed, [key]);
});

test('labels survive a replan untouched', () => {
  const labels = [{ id: 'study', name: 'Learning', color: '#FF4B1F', style: 'fill' as const }];
  const { state } = replan({ ...stateWith([]), labels }, '2026-10-05');
  assert.deepEqual(state.labels, labels);
});

const week = (blocks: Block[], over: Partial<State> = {}): State => ({
  ...emptyState(),
  tasks: [task({ id: 't1', title: 'Study', weeklyMinutes: 120, maxBlock: 60, category: 'study' })],
  blocks,
  ...over,
});
const study = (date: string, start: number, end: number, status?: Block['status']): Block => ({ taskId: 't1', title: 'Study', category: 'study', date, start, end, ...(status ? { status } : {}) });
const minutes = (bs: Block[]) => bs.reduce((t, b) => t + (b.end - b.start), 0);

test('a block ticked off as done stays exactly where it is, counts toward the week, and nothing is planned on top of it', () => {
  const done = study('2026-10-07', 480, 540, 'done');
  const { state } = replan(week([done]), '2026-10-05', undefined, 7);
  assert.deepEqual(state.blocks.find((b) => b.status === 'done'), done);
  const thisWeek = state.blocks.filter((b) => b.date >= '2026-10-05' && b.date <= '2026-10-11');
  assert.equal(minutes(thisWeek), 120, 'the week target of 120 is met, with the done hour counted');
  const sameDay = state.blocks.filter((b) => b.date === '2026-10-07' && b !== state.blocks.find((x) => x.status === 'done'));
  assert.ok(sameDay.every((b) => b.start >= 540 || b.end <= 480), 'no overlap with the done block');
});

test('a block marked not done stops counting, so its minutes are planned again in free time', () => {
  const missed = study('2026-10-05', 480, 540, 'missed');
  const { state, warnings } = replan(week([missed]), '2026-10-06', undefined, 6);
  assert.deepEqual(state.blocks.find((b) => b.status === 'missed'), missed, 'kept as history');
  const fresh = state.blocks.filter((b) => b.status === undefined && b.date >= '2026-10-06' && b.date <= '2026-10-11');
  assert.equal(minutes(fresh), 120, 'the full target is planned again, the missed hour does not count');
  assert.equal(warnings.filter((w) => w.kind === 'weekly-short').length, 0);
});

test('a block taken off the week counts as done for the target, and nothing replaces it', () => {
  const waived = study('2026-10-05', 480, 540, 'waived');
  const { state } = replan(week([waived]), '2026-10-06', undefined, 6);
  const fresh = state.blocks.filter((b) => b.status === undefined && b.date >= '2026-10-06' && b.date <= '2026-10-11');
  assert.equal(minutes(fresh), 60, 'only the other hour of the week is planned');
  assert.equal(state.blocks.find((b) => b.status === 'waived')?.start, 480);
});
