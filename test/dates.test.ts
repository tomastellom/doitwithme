import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, daysBetween, weekdayOf, weekStart } from '../src/dates.ts';

test('weekdayOf returns 0 for Sunday and 4 for Thursday', () => {
  assert.equal(weekdayOf('2026-10-08'), 4);
  assert.equal(weekdayOf('2026-10-11'), 0);
});

test('addDays crosses month and year boundaries both ways', () => {
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2026-10-08', 0), '2026-10-08');
});

test('daysBetween counts calendar days and is signed', () => {
  assert.equal(daysBetween('2026-10-08', '2026-10-11'), 3);
  assert.equal(daysBetween('2026-10-11', '2026-10-08'), -3);
  assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1);
});

test('weekStart is the Monday on or before the date, Sunday included', () => {
  assert.equal(weekStart('2026-10-08'), '2026-10-05');
  assert.equal(weekStart('2026-10-05'), '2026-10-05');
  assert.equal(weekStart('2026-10-11'), '2026-10-05');
  assert.equal(weekStart('2027-01-01'), '2026-12-28');
});
