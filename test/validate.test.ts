import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState } from '../src/store.ts';
import { ValidationError, validateEstimateRequest, validateState } from '../src/validate.ts';
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

const course = (over: any = {}) => ({ credits: 3, difficulty: 4, examOnly: false, weeklyGraded: true, lab: false, syllabus: 'Weekly problem sets.', ...over });

test('a task with a course round-trips, and a task without one gains nothing', () => {
  const s = sample();
  s.tasks[0].course = course();
  assert.deepEqual(validateState(s), s);
  assert.equal('course' in validateState(sample()).tasks[0], false);
});

test('a file from before the estimate loads with the scale defaults', () => {
  const old = sample();
  delete old.preferences.hoursPerCredit;
  delete old.preferences.normalCredits;
  delete old.preferences.fullLoadHours;
  const p = validateState(old).preferences;
  assert.deepEqual([p.hoursPerCredit, p.normalCredits, p.fullLoadHours], [null, 30, 40]);
});

test('scale preferences accept their limits and refuse the rest', () => {
  const ok = sample();
  ok.preferences.hoursPerCredit = 0.1;
  ok.preferences.normalCredits = 200;
  ok.preferences.fullLoadHours = 100;
  assert.doesNotThrow(() => validateState(ok));
  ok.preferences.hoursPerCredit = null;
  assert.doesNotThrow(() => validateState(ok));
  rejects((s) => { s.preferences.hoursPerCredit = 0; }, /hoursPerCredit/);
  rejects((s) => { s.preferences.hoursPerCredit = 20.5; }, /hoursPerCredit/);
  rejects((s) => { s.preferences.hoursPerCredit = '1'; }, /hoursPerCredit/);
  rejects((s) => { s.preferences.normalCredits = 0; }, /normalCredits/);
  rejects((s) => { s.preferences.normalCredits = 201; }, /normalCredits/);
  rejects((s) => { s.preferences.fullLoadHours = 0; }, /fullLoadHours/);
  rejects((s) => { s.preferences.fullLoadHours = 101; }, /fullLoadHours/);
});

test('a course is checked field by field in plain words', () => {
  rejects((s) => { s.tasks[0].course = course({ credits: 0.4 }); }, /course\.credits/);
  rejects((s) => { s.tasks[0].course = course({ credits: 100.5 }); }, /course\.credits/);
  rejects((s) => { s.tasks[0].course = course({ credits: '3' }); }, /course\.credits/);
  rejects((s) => { s.tasks[0].course = course({ difficulty: 0 }); }, /course\.difficulty/);
  rejects((s) => { s.tasks[0].course = course({ difficulty: 6 }); }, /course\.difficulty/);
  rejects((s) => { s.tasks[0].course = course({ difficulty: 2.5 }); }, /course\.difficulty/);
  rejects((s) => { s.tasks[0].course = course({ lab: 'yes' }); }, /course\.lab/);
  rejects((s) => { s.tasks[0].course = course({ examOnly: 1 }); }, /course\.examOnly/);
  rejects((s) => { s.tasks[0].course = course({ weeklyGraded: null }); }, /course\.weeklyGraded/);
  rejects((s) => { s.tasks[0].course = course({ syllabus: 5 }); }, /course\.syllabus/);
  rejects((s) => { s.tasks[0].course = course({ syllabus: 'x'.repeat(20001) }); }, /course\.syllabus/);
  const edge = sample();
  edge.tasks[0].course = course({ credits: 100, syllabus: 'x'.repeat(20000) });
  assert.doesNotThrow(() => validateState(edge));
  const hostile = sample();
  hostile.tasks[0].course = course({ syllabus: '<img src=x onerror=alert(1)> ‮' });
  assert.equal(validateState(hostile).tasks[0].course!.syllabus, '<img src=x onerror=alert(1)> ‮');
});

test('an estimate request needs a title and a valid course', () => {
  const ok = { title: 'Chemistry', credits: 3, difficulty: 4, examOnly: false, weeklyGraded: true, lab: false, syllabus: '' };
  assert.deepEqual(validateEstimateRequest(ok), { title: 'Chemistry', course: { credits: 3, difficulty: 4, examOnly: false, weeklyGraded: true, lab: false, syllabus: '' } });
  assert.throws(() => validateEstimateRequest({ ...ok, title: '' }), /title/);
  assert.throws(() => validateEstimateRequest({ ...ok, credits: 0 }), /credits/);
  assert.throws(() => validateEstimateRequest({ ...ok, syllabus: 'x'.repeat(20001) }), /syllabus/);
  assert.throws(() => validateEstimateRequest(null), /request/);
});

test('labels are optional, and a good list round-trips', () => {
  const s = sample();
  assert.equal('labels' in validateState(s), false, 'an older file with no labels stays without them');
  s.labels = [
    { id: 'study', name: 'Studying', color: '#FF4B1F', style: 'fill' },
    { id: 'label-piano', name: 'Piano', color: '#00a3a3', style: 'outline' },
  ];
  assert.deepEqual(validateState(s).labels, [
    { id: 'study', name: 'Studying', color: '#FF4B1F', style: 'fill' },
    { id: 'label-piano', name: 'Piano', color: '#00A3A3', style: 'outline' },
  ]);
});

test('bad labels are refused with a message that names the problem', () => {
  const good = { id: 'a', name: 'A', color: '#111111', style: 'fill' };
  rejects((s) => { s.labels = 'nope'; }, /labels must be a list/);
  rejects((s) => { s.labels = [{ ...good, name: '   ' }]; }, /labels\[0\]\.name/);
  rejects((s) => { s.labels = [{ ...good, name: 'x'.repeat(41) }]; }, /labels\[0\]\.name/);
  rejects((s) => { s.labels = [{ ...good, color: 'red' }]; }, /labels\[0\]\.color/);
  rejects((s) => { s.labels = [{ ...good, style: 'dotted' }]; }, /labels\[0\]\.style/);
  rejects((s) => { s.labels = [good, { ...good, name: 'B' }]; }, /duplicate id/);
  rejects((s) => { s.labels = [good, { ...good, id: 'b', name: 'a' }]; }, /same name/);
  rejects((s) => { s.labels = Array.from({ length: 101 }, (_, i) => ({ ...good, id: `l${i}`, name: `L${i}` })); }, /at most 100/);
});
