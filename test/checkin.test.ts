import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCheckIn } from '../src/checkin.ts';
import { emptyState } from '../src/store.ts';
import { task } from './helpers.ts';

const clock = { today: '2026-10-05', horizonDays: 14 };
const busy = () => ({ ...emptyState(), tasks: [task({ weeklyMinutes: 2000 })] });

test('low reports what moved and to which days', () => {
  const { state, moved } = applyCheckIn(busy(), 'low', clock);
  assert.ok(moved && moved.minutes > 0);
  assert.ok(moved.dates.length > 0 && moved.dates.every((d) => d > clock.today));
  assert.deepEqual(state.checkIns, [{ date: clock.today, mood: 'low' }]);
});

test('good, okay and skipped report nothing moved and replace an earlier answer', () => {
  const low = applyCheckIn(busy(), 'low', clock).state;
  const { state, moved } = applyCheckIn(low, 'okay', clock);
  assert.equal(moved, null);
  assert.deepEqual(state.checkIns, [{ date: clock.today, mood: 'okay' }]);
  assert.equal(applyCheckIn(busy(), 'skipped', clock).moved, null);
});

test('answering low twice moves nothing the second time', () => {
  const once = applyCheckIn(busy(), 'low', clock).state;
  assert.equal(applyCheckIn(once, 'low', clock).moved?.minutes, 0);
});

test('the input state is not changed', () => {
  const input = busy();
  const copy = structuredClone(input);
  applyCheckIn(input, 'low', clock);
  assert.deepEqual(input, copy);
});
