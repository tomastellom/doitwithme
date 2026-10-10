import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cheerFor, createMarks, dayIsAllDone, statusOf, withStatus } from '../../public/js/marks.js';
import { dayItems } from '../../public/js/model.js';

const lecture = { id: 'l', title: 'Lecture', category: 'class', start: 600, end: 720, pattern: { kind: 'weekly', weekdays: [2], from: '2026-10-01', to: '2026-12-01' }, exceptions: [], bufferBefore: 0 };
const block = (over: any = {}) => ({ taskId: 't', title: 'Chemistry', category: 'study', date: '2026-10-13', start: 480, end: 535, ...over });
const state = (over: any = {}) => ({ commitments: [lecture], tasks: [], deadlines: [], blocks: [block()], ...over });
const item = (s: any, kind: string) => dayItems(s, '2026-10-13').find((i: any) => i.kind === kind)!;

test('a block is marked by its task, day and time, and the mark can be cleared', () => {
  const s = state();
  const b = item(s, 'block');
  assert.equal(statusOf(s, b), null);
  const done = withStatus(s, b, 'done');
  assert.equal(statusOf(done, b), 'done');
  assert.equal(dayItems(done, '2026-10-13').find((i: any) => i.kind === 'block')!.status, 'done', 'the day shows it');
  assert.deepEqual(done.blocks[0], block({ status: 'done' }));
  assert.equal(statusOf(withStatus(done, b, 'waived'), b), 'waived');
  assert.deepEqual(withStatus(done, b, null).blocks[0], block(), 'clearing takes the mark off and nothing else');
  assert.equal(s.blocks[0].status, undefined, 'the input is never changed');
});

test('a commitment is marked for one day only, and clearing leaves no empty list behind', () => {
  const s = state();
  const c = item(s, 'commitment');
  const missed = withStatus(s, c, 'missed');
  assert.deepEqual(missed.commitmentMarks, [{ id: 'l', date: '2026-10-13', status: 'missed' }]);
  assert.equal(statusOf(missed, c), 'missed');
  assert.equal(statusOf(missed, { ...c, date: '2026-10-20' }), null, 'next Tuesday is untouched');
  const again = withStatus(missed, c, 'done');
  assert.deepEqual(again.commitmentMarks, [{ id: 'l', date: '2026-10-13', status: 'done' }], 'one mark per day');
  assert.equal('commitmentMarks' in withStatus(again, c, null), false);
});

test('a day is all done only when every planned thing on it is, trips aside', () => {
  const s = state();
  assert.equal(dayIsAllDone(s, '2026-10-13'), false);
  const half = withStatus(s, item(s, 'block'), 'done');
  assert.equal(dayIsAllDone(half, '2026-10-13'), false);
  const all = withStatus(half, item(half, 'commitment'), 'done');
  assert.equal(dayIsAllDone(all, '2026-10-13'), true);
  assert.equal(dayIsAllDone(state({ blocks: [], commitments: [] }), '2026-10-13'), false, 'an empty day is not a triumph');
});

test('the cheer names the thing and its time, and goes big when the day is finished', () => {
  const s = state();
  const b = item(s, 'block');
  const small = cheerFor(withStatus(s, b, 'done'), b, 0);
  assert.deepEqual([small.big, small.title], [false, 'Nice. Chemistry done.']);
  assert.match(small.text, /0h55 of Chemistry/);
  const both = withStatus(withStatus(s, b, 'done'), item(s, 'commitment'), 'done');
  assert.deepEqual([cheerFor(both, b).big, cheerFor(both, b).title], [true, 'That is everything for today.']);
});

test('the shared actions save through the store and cheer only when a save really made it done', async () => {
  const saved: any[] = [];
  const cheers: any[] = [];
  let current: any = { state: state(), formError: null };
  const store: any = {
    get: () => current,
    saveState: async (fn: any) => { const next = fn(current.state); saved.push(next); current = { ...current, state: next }; },
    cheer: (c: any) => cheers.push(c),
  };
  const marks = createMarks(store, { pick: () => 1 });
  const b = item(state(), 'block');
  await marks.done(b);
  assert.equal(saved.at(-1).blocks[0].status, 'done');
  assert.equal(cheers.length, 1);
  assert.equal(cheers[0].title, 'Well done. Chemistry done.');
  await marks.moveLater(b);
  assert.equal(saved.at(-1).blocks[0].status, 'missed');
  await marks.takeOff(b);
  assert.equal(saved.at(-1).blocks[0].status, 'waived');
  await marks.undo(b);
  assert.equal(saved.at(-1).blocks[0].status, undefined);
  assert.equal(cheers.length, 1, 'only ticking something done cheers');
  current = { ...current, formError: 'nope' };
  await marks.done(b);
  assert.equal(cheers.length, 1, 'a failed save does not cheer');
});
