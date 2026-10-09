import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState } from '../src/store.ts';
import { ValidationError, validateState } from '../src/validate.ts';
import { commitment, deadline, task } from './helpers.ts';

function sample(): any {
  return structuredClone({
    ...emptyState(),
    tasks: [task()],
    deadlines: [deadline()],
    commitments: [commitment()],
  });
}

function rejects(mutate: (s: any) => void, pattern: RegExp): void {
  const s = sample();
  mutate(s);
  assert.throws(
    () => validateState(s),
    (e: unknown) => e instanceof ValidationError && pattern.test(e.message),
  );
}

test('a valid state round-trips unchanged', () => {
  assert.deepEqual(validateState(sample()), sample());
});

test('unknown fields are dropped', () => {
  const s = sample();
  s.tasks[0].secret = 'x';
  assert.deepEqual(validateState(s), sample());
});

test('non-objects are rejected', () => {
  for (const bad of [null, 'x', 5, []]) {
    assert.throws(() => validateState(bad), ValidationError);
  }
});

test('task fields are checked', () => {
  rejects((s) => (s.tasks[0].maxBlock = 0), /tasks\[0\]\.maxBlock/);
  rejects((s) => (s.tasks[0].priority = 9), /tasks\[0\]\.priority/);
  rejects((s) => (s.tasks[0].weeklyMinutes = -5), /tasks\[0\]\.weeklyMinutes/);
  rejects((s) => (s.tasks[0].title = ''), /tasks\[0\]\.title/);
  rejects((s) => (s.tasks[0].onePerDay = 'yes'), /tasks\[0\]\.onePerDay/);
});

test('duplicate ids are rejected', () => {
  rejects((s) => s.tasks.push(task()), /duplicate/);
});

test('dates must be real calendar dates', () => {
  rejects((s) => (s.deadlines[0].dueDate = '2026-02-31'), /dueDate/);
  rejects((s) => (s.deadlines[0].dueDate = '10/12/2026'), /dueDate/);
});

test('a deadline must point at an existing task', () => {
  rejects((s) => (s.deadlines[0].taskId = 'nope'), /taskId/);
});

test('commitment fields are checked', () => {
  rejects((s) => ((s.commitments[0].start = 700), (s.commitments[0].end = 600)), /commitments\[0\]/);
  rejects((s) => (s.commitments[0].end = 2000), /commitments\[0\]\.end/);
  rejects((s) => (s.commitments[0].pattern = { kind: 'monthly' }), /pattern/);
  rejects(
    (s) => (s.commitments[0].pattern = { kind: 'weekly', weekdays: [7], from: '2026-09-01', to: '2026-12-01' }),
    /weekdays/,
  );
  rejects(
    (s) => (s.commitments[0].pattern = { kind: 'weekly', weekdays: [1], from: '2026-12-01', to: '2026-09-01' }),
    /pattern/,
  );
});

test('preference windows must end after they start', () => {
  rejects((s) => (s.preferences.weekdayWindow = { start: 600, end: 600 }), /weekdayWindow/);
  rejects((s) => (s.preferences.daysOff = [9]), /daysOff/);
});

test('soft windows on the same weekday must not overlap', () => {
  rejects(
    (s) =>
      (s.preferences.softWindows = [
        { weekday: 5, start: 1080, end: 1440 },
        { weekday: 5, start: 1140, end: 1380 },
      ]),
    /softWindows/,
  );
});

test('new fields default when missing, so old data files still load', () => {
  const old = sample();
  delete old.approvedSoft;
  delete old.dismissed;
  delete old.preferences.softMode;
  const s = validateState(old);
  assert.deepEqual(s.approvedSoft, []);
  assert.deepEqual(s.dismissed, []);
  assert.equal(s.preferences.softMode, 'ask');
});

test('softMode must be ask or auto', () => {
  rejects((s) => (s.preferences.softMode = 'sometimes'), /softMode/);
  assert.equal(validateState({ ...sample(), preferences: { ...sample().preferences, softMode: 'auto' } }).preferences.softMode, 'auto');
});

test('approvedSoft entries must be real, unique dates and at most 400', () => {
  rejects((s) => (s.approvedSoft = ['2026-02-31']), /approvedSoft\[0\]/);
  rejects((s) => (s.approvedSoft = ['2026-10-09', '2026-10-09']), /approvedSoft.*duplicate/);
  rejects(
    (s) => (s.approvedSoft = Array.from({ length: 401 }, (_, i) => `2027-01-${String((i % 28) + 1).padStart(2, '0')}`)),
    /approvedSoft/,
  );
});

test('dismissed entries must be text up to 300 characters and at most 400', () => {
  rejects((s) => (s.dismissed = ['x'.repeat(301)]), /dismissed\[0\]/);
  rejects((s) => (s.dismissed = ['']), /dismissed\[0\]/);
  rejects((s) => (s.dismissed = Array.from({ length: 401 }, (_, i) => `k${i}`)), /dismissed/);
});

const homeP = { id: 'home', name: 'Home', kind: 'home', address: 'Calle 1' };
const campusP = { id: 'campus', name: 'Campus', kind: 'campus', address: '' };
const routeC = (over: any = {}) => ({
  id: 'r1', fromPlaceId: 'home', toPlaceId: 'campus',
  repeats: { kind: 'weekly', weekdays: [1, 2] }, source: { method: 'typed', minutes: 45 }, marginMinutes: 10, ...over,
});
const withPlaces = (s: any) => { s.places = structuredClone([homeP, campusP]); };

test('places, commutes and a commitment place round-trip unchanged', () => {
  const s = sample();
  withPlaces(s);
  s.commutes = [routeC(), routeC({ id: 'r2', repeats: null, source: { method: 'maps', mode: 'bike', fallbackMinutes: 20 } }), routeC({ id: 'r3', repeats: { kind: 'monthly', monthDays: [1, 15] } })];
  s.commitments[0].placeId = 'campus';
  assert.deepEqual(validateState(s), s);
});

test('a file from before commutes loads with no places, no commutes and a 30 minute allowance', () => {
  const old = sample();
  delete old.places;
  delete old.commutes;
  delete old.preferences.travelAllowanceMinutes;
  const s = validateState(old);
  assert.deepEqual(s.places, []);
  assert.deepEqual(s.commutes, []);
  assert.equal(s.preferences.travelAllowanceMinutes, 30);
  assert.equal('placeId' in s.commitments[0], false);
});

test('bad places are rejected with plain sentences', () => {
  rejects((s) => { withPlaces(s); s.places[1].id = 'home'; }, /places contains a duplicate id/);
  rejects((s) => { withPlaces(s); s.places[1].kind = 'home'; }, /only one home/);
  rejects((s) => { withPlaces(s); s.places[0].kind = 'castle'; }, /places\[0\]\.kind/);
  rejects((s) => { withPlaces(s); s.places[0].name = '   '; }, /places\[0\]\.name must not be blank/);
  rejects((s) => { withPlaces(s); s.places[0].name = ''; }, /places\[0\]\.name/);
  rejects((s) => { withPlaces(s); s.places[0].address = 'x'.repeat(301); }, /places\[0\]\.address/);
  rejects((s) => { withPlaces(s); s.places[0].address = 5; }, /places\[0\]\.address/);
});

test('bad commutes are rejected', () => {
  rejects((s) => { withPlaces(s); s.commutes = [routeC({ toPlaceId: 'nowhere' })]; }, /commutes\[0\]\.toPlaceId does not match any place/);
  rejects((s) => { withPlaces(s); s.commutes = [routeC({ fromPlaceId: 'nowhere' })]; }, /commutes\[0\]\.fromPlaceId does not match any place/);
  rejects((s) => { withPlaces(s); s.commutes = [routeC({ toPlaceId: 'home' })]; }, /two different places/);
  rejects((s) => { withPlaces(s); s.commutes = [routeC(), routeC()]; }, /commutes contains a duplicate id/);
  rejects((s) => { withPlaces(s); s.commutes = [routeC({ repeats: { kind: 'weekly', weekdays: [] } })]; }, /weekdays must not be empty/);
  rejects((s) => { withPlaces(s); s.commutes = [routeC({ repeats: { kind: 'weekly', weekdays: [7] } })]; }, /weekdays\[0\]/);
  rejects((s) => { withPlaces(s); s.commutes = [routeC({ repeats: { kind: 'monthly', monthDays: [29] } })]; }, /monthDays\[0\]/);
  rejects((s) => { withPlaces(s); s.commutes = [routeC({ repeats: { kind: 'monthly', monthDays: [] } })]; }, /monthDays must not be empty/);
  rejects((s) => { withPlaces(s); s.commutes = [routeC({ repeats: { kind: 'daily' } })]; }, /repeats\.kind/);
  rejects((s) => { withPlaces(s); s.commutes = [routeC({ source: { method: 'typed', minutes: 601 } })]; }, /minutes/);
  rejects((s) => { withPlaces(s); s.commutes = [routeC({ source: { method: 'maps', mode: 'rocket', fallbackMinutes: 5 } })]; }, /mode/);
  rejects((s) => { withPlaces(s); s.commutes = [routeC({ source: { method: 'magic' } })]; }, /method/);
  rejects((s) => { withPlaces(s); s.commutes = [routeC({ marginMinutes: 121 })]; }, /marginMinutes/);
});

test('a commitment must point at a place that exists, and the allowance has limits', () => {
  rejects((s) => { s.commitments[0].placeId = 'nowhere'; }, /commitments\[0\]\.placeId does not match any place/);
  rejects((s) => { s.preferences.travelAllowanceMinutes = 601; }, /travelAllowanceMinutes/);
  rejects((s) => { s.preferences.travelAllowanceMinutes = 1.5; }, /travelAllowanceMinutes/);
});
