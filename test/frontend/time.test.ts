import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, currentClock, daysBetween, duration, hhmm, compactRange, isoWeek, isValidDate, longDate, rangeLabel, shortDate,
  weekdayOf, weekStart,
} from '../../public/js/time.js';

test('addDays, daysBetween and weekdayOf cross month and year boundaries', () => {
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1);
  assert.equal(weekdayOf('2026-10-08'), 4);
});

test('weekStart is the Monday on or before the date, Sunday included', () => {
  assert.equal(weekStart('2026-10-08'), '2026-10-05');
  assert.equal(weekStart('2026-10-11'), '2026-10-05');
  assert.equal(weekStart('2027-01-01'), '2026-12-28');
});

test('isoWeek follows ISO 8601, including week 53 and a Sunday', () => {
  assert.deepEqual(isoWeek('2026-10-12'), { week: 42, year: 2026 });
  assert.deepEqual(isoWeek('2026-10-05'), { week: 41, year: 2026 });
  assert.deepEqual(isoWeek('2027-01-01'), { week: 53, year: 2026 });
  assert.deepEqual(isoWeek('2026-10-18'), { week: 42, year: 2026 });
  assert.deepEqual(isoWeek('2026-01-01'), { week: 1, year: 2026 });
});

test('isValidDate rejects impossible and malformed dates', () => {
  assert.equal(isValidDate('2026-10-09'), true);
  for (const bad of ['2026-02-31', '2026-13-01', '10/09/2026', '', null, undefined, 5, '2026-1-9']) {
    assert.equal(isValidDate(bad as any), false, String(bad));
  }
});

test('hhmm and duration format minutes', () => {
  assert.equal(hhmm(545), '09:05');
  assert.equal(hhmm(0), '00:00');
  assert.equal(duration(155), '2h35');
  assert.equal(duration(0), '0h00');
  assert.equal(duration(5), '0h05');
  assert.equal(duration(60), '1h00');
});

test('date labels match the boards', () => {
  assert.equal(shortDate('2026-10-23'), '23 Oct');
  assert.equal(longDate('2026-10-23'), 'Fri 23 Oct');
  assert.equal(rangeLabel('2026-10-12'), '12 – 18 Oct 2026');
  assert.equal(rangeLabel('2026-10-26'), '26 Oct – 1 Nov 2026');
  assert.equal(rangeLabel('2026-12-28'), '28 Dec 2026 – 3 Jan 2027');
});

test('currentClock uses local date and time components', () => {
  assert.deepEqual(currentClock(new Date(2026, 9, 9, 14, 5)), { today: '2026-10-09', nowMinutes: 845, horizonDays: 14 });
  assert.equal(currentClock(new Date(2026, 0, 2, 0, 0), 7).horizonDays, 7);
  assert.equal(currentClock(new Date(2026, 0, 2, 0, 0)).today, '2026-01-02');
});

test('compactRange is the short title of a week: days and month, both months when it crosses', () => {
  assert.equal(compactRange('2026-10-12'), '12–18 Oct');
  assert.equal(compactRange('2026-10-26'), '26 Oct – 1 Nov');
  assert.equal(compactRange('2026-12-28'), '28 Dec – 3 Jan');
  assert.equal(compactRange('2026-09-28'), '28 Sep – 4 Oct');
});
