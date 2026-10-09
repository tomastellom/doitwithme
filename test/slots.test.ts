import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freeSlots } from '../src/slots.ts';

const window = { start: 540, end: 1020 };

test('subtracts separate busy intervals', () => {
  const busy = [{ start: 600, end: 660 }, { start: 900, end: 960 }];
  assert.deepEqual(freeSlots(window, busy), [
    { start: 540, end: 600 },
    { start: 660, end: 900 },
    { start: 960, end: 1020 },
  ]);
});

test('merges overlapping busy intervals and ignores order', () => {
  const busy = [{ start: 660, end: 780 }, { start: 600, end: 720 }];
  assert.deepEqual(freeSlots(window, busy), [
    { start: 540, end: 600 },
    { start: 780, end: 1020 },
  ]);
});

test('a window fully covered by busy time has no slots', () => {
  assert.deepEqual(freeSlots(window, [{ start: 0, end: 1440 }]), []);
});

test('busy time outside the window changes nothing', () => {
  const busy = [{ start: 0, end: 300 }, { start: 1100, end: 1200 }];
  assert.deepEqual(freeSlots(window, busy), [{ start: 540, end: 1020 }]);
});

test('busy time that starts before the window trims its start', () => {
  assert.deepEqual(freeSlots(window, [{ start: 500, end: 600 }]), [{ start: 600, end: 1020 }]);
});

test('no busy time gives the whole window', () => {
  assert.deepEqual(freeSlots(window, []), [window]);
});
