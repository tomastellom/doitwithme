import { test } from 'node:test';
import assert from 'node:assert/strict';
import { busyOn, occurrencesOn } from '../src/busy.ts';
import { commitment } from './helpers.ts';

const mass = commitment({
  title: 'Mass',
  category: 'mass',
  start: 20 * 60,
  end: 21 * 60,
  bufferBefore: 30,
  pattern: { kind: 'weekly', weekdays: [0], from: '2026-09-01', to: '2026-12-31' },
});

test('weekly commitment appears on its weekday with the buffer before it', () => {
  assert.deepEqual(busyOn('2026-10-11', [mass]), [{ title: 'Mass', start: 1170, end: 1260 }]);
});

test('weekly commitment does not appear on other weekdays', () => {
  assert.deepEqual(busyOn('2026-10-10', [mass]), []);
});

test('weekly commitment does not appear outside its date range', () => {
  assert.deepEqual(busyOn('2027-01-03', [mass]), []);
  assert.deepEqual(busyOn('2026-08-30', [mass]), []);
});

test('an exception date removes one occurrence and frees the slot', () => {
  const cancelled = { ...mass, exceptions: ['2026-10-11'] };
  assert.deepEqual(busyOn('2026-10-11', [cancelled]), []);
  assert.equal(busyOn('2026-10-18', [cancelled]).length, 1);
});

test('one-off commitment appears only on its date', () => {
  const c = commitment();
  assert.equal(busyOn('2026-10-08', [c]).length, 1);
  assert.equal(busyOn('2026-10-09', [c]).length, 0);
});

test('buffer never pushes the start below midnight', () => {
  const c = commitment({ start: 10, end: 60, bufferBefore: 30 });
  assert.equal(busyOn('2026-10-08', [c])[0].start, 0);
});

test('occurrencesOn keeps the real start and the buffer separately', () => {
  assert.deepEqual(occurrencesOn('2026-10-11', [mass]), [
    { title: 'Mass', category: 'mass', start: 1200, end: 1260, bufferBefore: 30 },
  ]);
});
