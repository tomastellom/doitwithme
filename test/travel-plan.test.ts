import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plan } from '../src/planner.ts';
import { describeWarnings, replan, warningKey } from '../src/replan.ts';
import { defaultPreferences } from '../src/defaults.ts';
import { emptyState } from '../src/store.ts';
import { addDays } from '../src/dates.ts';
import type { Commute, Place, Preferences } from '../src/types.ts';
import { commitment, input, task } from './helpers.ts';

const prefs = (over: Partial<Preferences> = {}): Preferences => ({ ...structuredClone(defaultPreferences), softWindows: [], ...over });
const place = (id: string, name: string, kind: Place['kind'] = 'other', address = 'x'): Place => ({ id, name, kind, address });
const home = place('home', 'Home', 'home');
const campus = place('campus', 'Campus', 'campus');
const anna = place('anna', 'Anna', 'student', '');
const route: Commute = {
  id: 'r', fromPlaceId: 'home', toPlaceId: 'campus', repeats: null,
  source: { method: 'typed', minutes: 45 }, marginMinutes: 10,
};
const lecture = (date = '2026-10-05') => commitment({ id: 'lec', title: 'Lecture', placeId: 'campus', start: 600, end: 720, pattern: { kind: 'once', date } });
const lesson = (id: string, date: string) => commitment({ id, title: 'Lesson Anna', start: 960, end: 1020, pattern: { kind: 'once', date } });

test('travel is busy time: no block overlaps a leg, and the legs come back with the plan', () => {
  const r = plan(input({
    preferences: prefs(), commitments: [lecture()], places: [home, campus], commutes: [route],
    tasks: [task({ weeklyMinutes: 900 })],
  }));
  assert.deepEqual(r.travel.map((l) => [l.start, l.end]), [[545, 600], [720, 775]]);
  const monday = r.blocks.filter((b) => b.date === '2026-10-05');
  assert.ok(monday.length > 0);
  for (const b of monday) for (const l of r.travel) assert.ok(b.end <= l.start || b.start >= l.end, `${b.start}-${b.end} vs ${l.start}-${l.end}`);
});

test('without places the plan is exactly as before and travel is empty', () => {
  const a = plan(input({ preferences: prefs(), commitments: [lecture()], tasks: [task({ weeklyMinutes: 900 })] }));
  assert.deepEqual(a.travel, []);
  const b = plan(input({ preferences: prefs(), commitments: [lecture()], tasks: [task({ weeklyMinutes: 900 })], places: [], commutes: [] }));
  assert.deepEqual(a.blocks, b.blocks);
});

test('only days inside the horizon produce travel', () => {
  const r = plan(input({ preferences: prefs(), commitments: [lecture('2026-10-12'), lecture('2026-10-06')], places: [home, campus], horizonDays: 7 }));
  assert.deepEqual([...new Set(r.travel.map((l) => l.date))], ['2026-10-06']);
});

test('the same missing address warns once, however many lessons there are', () => {
  const r = plan(input({
    preferences: prefs(), commitments: [lesson('a', '2026-10-05'), lesson('b', '2026-10-06'), lesson('c', '2026-10-07')],
    places: [home, anna],
  }));
  assert.equal(r.warnings.filter((w) => w.kind === 'address-missing').length, 1);
  assert.equal(r.travel.length, 6);
});

test('warning keys name the place, so a dismissal survives a day change', () => {
  const r = plan(input({ preferences: prefs(), commitments: [lesson('a', '2026-10-05')], places: [home, anna] }));
  const missing = r.warnings.find((w) => w.kind === 'address-missing')!;
  assert.equal(warningKey(missing), 'address-missing|Anna');
  const tight = { kind: 'travel-tight' as const, message: 'm', detail: { placeName: 'Anna', date: '2026-10-05', titles: ['Lesson Anna'] } };
  assert.equal(warningKey(tight), 'travel-tight|Anna|2026-10-05');
  const later = replan({ ...emptyState(), commitments: [lesson('a', '2026-10-09')], places: [home, anna], dismissed: ['address-missing|Anna'] }, '2026-10-06');
  assert.deepEqual(later.state.dismissed, ['address-missing|Anna']);
  assert.equal(describeWarnings(later.warnings, later.state.dismissed).find((w) => w.kind === 'address-missing')!.dismissed, true);
});

test('replan passes places and commutes through and returns the legs', () => {
  const state = { ...emptyState(), commitments: [lecture()], places: [home, campus], commutes: [route] };
  const r = replan(state, '2026-10-05');
  assert.equal(r.travel.length, 2);
  assert.equal(r.state.places.length, 2);
});

test('a 60 day horizon with many places and events stays fast', () => {
  const places = [home, ...Array.from({ length: 40 }, (_, i) => place(`p${i}`, `Place${i}`, 'other', `Street ${i}`))];
  const commitments = Array.from({ length: 60 }, (_, i) =>
    commitment({ id: `c${i}`, title: `Event ${i}`, placeId: `p${i % 40}`, start: 600 + (i % 5) * 70, end: 650 + (i % 5) * 70, pattern: { kind: 'once', date: addDays('2026-10-05', i) } }));
  const t0 = performance.now();
  const r = plan(input({ preferences: prefs(), commitments, places, tasks: [task({ weeklyMinutes: 600 })], horizonDays: 60 }));
  assert.ok(performance.now() - t0 < 3000, `took ${Math.round(performance.now() - t0)} ms`);
  assert.ok(r.travel.length > 0);
});
