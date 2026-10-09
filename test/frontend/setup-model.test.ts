import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATEGORIES, WEEK_ORDER, commitmentKind, newId, parseTime, parseWhole } from '../../public/js/setup-model.js';
import { KINDS, KIND_IDS, PLACE_KINDS, TRAVEL_MODES, parseDecimal, applyItem, commuteKind, deadlineKind, itemsOf, placeKind, preferencesKind, removeItem, taskKind } from '../../public/js/setup-model.js';

const example = JSON.parse(readFileSync('examples/sample-state.json', 'utf8'));
const lesson = () => example.commitments.find((c: any) => c.id === 'lesson-1');

test('parseTime accepts real times and rejects the rest', () => {
  assert.equal(parseTime('16:00'), 960);
  assert.equal(parseTime('9:05'), 545);
  assert.equal(parseTime(' 08:30 '), 510);
  assert.equal(parseTime('24:00'), 1440);
  assert.equal(parseTime('00:00'), 0);
  for (const bad of ['25:00', '9:5', '12:60', '24:01', '', 'noon', '1600', '12:00pm', '-1:00']) {
    assert.equal(parseTime(bad), null, bad);
  }
});

test('parseWhole accepts whole numbers in range only', () => {
  assert.equal(parseWhole('30', 0, 240), 30);
  assert.equal(parseWhole(' 0 ', 0, 240), 0);
  for (const bad of ['', '-1', '1.5', '1e3', '241', 'abc', '99999999999999999999']) {
    assert.equal(parseWhole(bad, 0, 240), null, bad);
  }
});

test('newId makes distinct, prefixed ids', () => {
  const ids = new Set(Array.from({ length: 50 }, () => newId('c')));
  assert.equal(ids.size, 50);
  assert.ok([...ids].every((id) => id.startsWith('c-')));
});

test('week order is Monday to Sunday and the commitment categories include the ones on the boards', () => {
  assert.deepEqual(WEEK_ORDER, [1, 2, 3, 4, 5, 6, 0]);
  for (const c of ['class', 'lesson', 'mass', 'work']) assert.ok(CATEGORIES.commitments.includes(c), c);
});

test('every example commitment survives a trip through a draft unchanged', () => {
  for (const c of example.commitments) {
    const result = commitmentKind.fromDraft(commitmentKind.toDraft(c), c.id, example);
    assert.deepEqual(result.item, c, c.id);
  }
});

test('a one-off commitment round-trips too, with its cancelled dates sorted', () => {
  const once = { id: 'x', title: 'Dentist', category: 'meeting', start: 840, end: 900, pattern: { kind: 'once', date: '2026-10-20' }, exceptions: [], bufferBefore: 15 };
  assert.deepEqual(commitmentKind.fromDraft(commitmentKind.toDraft(once), 'x').item, once);
  const cancelled = { ...lesson(), exceptions: ['2026-11-04', '2026-10-21'] };
  assert.deepEqual(commitmentKind.fromDraft(commitmentKind.toDraft(cancelled), cancelled.id).item.exceptions, ['2026-10-21', '2026-11-04']);
});

test('a blank commitment draft is a weekly Monday class starting today', () => {
  const d = commitmentKind.blank('2026-10-05');
  assert.equal(d.repeats, 'weekly');
  assert.deepEqual(d.weekdays, [1]);
  assert.equal(d.from, '2026-10-05');
  assert.ok(d.to > d.from);
  assert.equal(d.title, '');
});

test('fromDraft reports the first problem in plain words', () => {
  const ok = () => commitmentKind.toDraft(lesson());
  const err = (over: any) => commitmentKind.fromDraft({ ...ok(), ...over }, 'x').error;
  assert.equal(err({ title: '   ' }), 'Give it a title.');
  assert.equal(err({ title: 'x'.repeat(201) }), 'The title can be at most 200 characters.');
  assert.equal(err({ start: '9:5' }), 'Start time must look like 16:00.');
  assert.equal(err({ end: 'late' }), 'End time must look like 17:00.');
  assert.equal(err({ start: '17:00', end: '17:00' }), 'End time must be after the start time.');
  assert.equal(err({ start: '18:00', end: '17:00' }), 'End time must be after the start time.');
  assert.equal(err({ buffer: '-5' }), 'Buffer must be a whole number of minutes, 0 to 240.');
  assert.equal(err({ buffer: '241' }), 'Buffer must be a whole number of minutes, 0 to 240.');
  assert.equal(err({ weekdays: [] }), 'Pick at least one weekday.');
  assert.equal(err({ from: '2026-02-31' }), 'Pick real start and end dates.');
  assert.equal(err({ from: '2026-12-01', to: '2026-09-01' }), 'The end date must be on or after the start date.');
  assert.equal(err({ exceptions: ['not a date'] }), 'Cancelled dates must be real dates.');
  assert.equal(err({ repeats: 'once', date: '2026-02-31' }), 'Pick a real date.');
  assert.equal(commitmentKind.fromDraft({ ...ok(), end: '24:00' }, 'x').item.end, 1440);
});

test('hostile text is kept as plain text in the item', () => {
  const evil = '<img src=x onerror=alert(1)> "quoted"';
  const item = commitmentKind.fromDraft({ ...commitmentKind.toDraft(lesson()), title: evil }, 'x').item;
  assert.equal(item.title, evil);
});

test('summaries match the board', () => {
  assert.equal(commitmentKind.summary(example.commitments.find((c: any) => c.id === 'chem-lecture')), 'Tue, Thu / 10:00–12:00 / 1 Sep – 18 Dec / buffer 30 min');
  assert.equal(commitmentKind.summary({ ...lesson(), pattern: { kind: 'once', date: '2026-10-14' } }), 'Wed 14 Oct / 16:00–17:00 / buffer 30 min');
  assert.equal(commitmentKind.summary({ ...lesson(), bufferBefore: 0, pattern: { kind: 'once', date: '2026-10-14' } }), 'Wed 14 Oct / 16:00–17:00');
});

const task = () => example.tasks.find((t: any) => t.id === 'chem');

test('tasks round-trip through a draft and report plain errors', () => {
  for (const t of example.tasks) assert.deepEqual(taskKind.fromDraft(taskKind.toDraft(t), t.id, example).item, t, t.id);
  const noTarget = { ...task(), weeklyMinutes: null };
  assert.equal(taskKind.toDraft(noTarget).weekly, '');
  assert.equal(taskKind.fromDraft(taskKind.toDraft(noTarget), 'x', example).item.weeklyMinutes, null);
  const err = (over: any) => taskKind.fromDraft({ ...taskKind.toDraft(task()), ...over }, 'x', example).error;
  assert.equal(err({ title: '' }), 'Give it a title.');
  assert.equal(err({ title: 'x'.repeat(201) }), 'The title can be at most 200 characters.');
  assert.equal(err({ weekly: '-3' }), 'Weekly minutes must be a whole number from 0 to 10080, or empty.');
  assert.equal(err({ weekly: '10081' }), 'Weekly minutes must be a whole number from 0 to 10080, or empty.');
  assert.equal(err({ maxBlock: '4' }), 'Longest block must be a whole number of minutes, 5 to 1440.');
  assert.equal(err({ priority: '6' }), 'Priority must be 1 to 5.');
  assert.equal(taskKind.blank().category, 'study');
});

test('task summaries read like the list on the board', () => {
  assert.equal(taskKind.summary(task()), '360 min a week / blocks up to 90 min / priority 2');
  assert.equal(taskKind.summary(example.tasks.find((t: any) => t.id === 'gym')), '180 min a week / blocks up to 60 min / priority 3 / one session a day');
  assert.equal(taskKind.summary({ ...task(), weeklyMinutes: null }), 'no weekly target / blocks up to 90 min / priority 2');
});

test('due dates round-trip and need a real task', () => {
  const d = example.deadlines[0];
  assert.deepEqual(deadlineKind.fromDraft(deadlineKind.toDraft(d), d.id, example).item, d);
  const err = (over: any, state = example) => deadlineKind.fromDraft({ ...deadlineKind.toDraft(d), ...over }, 'x', state).error;
  assert.equal(err({ taskId: 'nope' }), 'Pick a task.');
  assert.equal(err({}, { ...example, tasks: [] }), 'Add a task first, then give it a due date.');
  assert.equal(err({ kind: '  ' }), 'Give the kind a name (like exam).');
  assert.equal(err({ kind: 'x'.repeat(201) }), 'The kind can be at most 200 characters.');
  assert.equal(err({ dueDate: '2026-02-31' }), 'Pick a real due date.');
  assert.equal(err({ effort: '-1' }), 'Effort must be a whole number of minutes, 0 to 100000.');
  assert.equal(deadlineKind.blank('2026-10-05', example).taskId, example.tasks[0].id);
  assert.equal(deadlineKind.blank('2026-10-05', { ...example, tasks: [] }).taskId, '');
  assert.equal(deadlineKind.summary(d, example), 'Chemistry / due Fri 23 Oct / 480 min');
  assert.equal(deadlineKind.summary({ ...d, taskId: 'gone' }, example), 'A task that no longer exists / due Fri 23 Oct / 480 min');
});

test('preferences round-trip, keep softMode, and validate windows', () => {
  const prefs = { ...example.preferences, softMode: 'auto', travelAllowanceMinutes: 30, hoursPerCredit: null, normalCredits: 30, fullLoadHours: 40 };
  const state = { ...example, preferences: prefs };
  const draft = preferencesKind.toDraft(prefs);
  const result = preferencesKind.fromDraft(draft, '-', state);
  assert.deepEqual(result.item, prefs);
  assert.equal(result.item.softMode, 'auto');
  const err = (over: any) => preferencesKind.fromDraft({ ...draft, ...over }, '-', state).error;
  assert.equal(err({ weekdayStart: '25:00' }), 'Weekday start must look like 08:00.');
  assert.equal(err({ weekdayEnd: 'late' }), 'Weekday end must look like 22:00.');
  assert.equal(err({ weekdayStart: '22:00', weekdayEnd: '08:00' }), 'Weekday end must be after its start.');
  assert.equal(err({ dayOffStart: 'x' }), 'Days-off start must look like 08:00.');
  assert.equal(err({ dayOffEnd: 'x' }), 'Days-off end must look like 22:00.');
  assert.equal(err({ dayOffStart: '20:00', dayOffEnd: '10:00' }), 'Days-off end must be after its start.');
  assert.equal(err({ minBlock: '4' }), 'Shortest block must be a whole number of minutes, 5 to 240.');
  assert.equal(err({ minBreak: '121' }), 'Break must be a whole number of minutes, 0 to 120.');
  assert.equal(err({ softWindows: [{ weekday: 5, start: '19:00', end: '18:00' }] }), 'Soft window times must look like 18:00 and end after they start.');
  assert.equal(err({ softWindows: [{ weekday: 5, start: '18:00', end: '24:00' }, { weekday: 5, start: '19:00', end: '23:00' }] }), 'Soft windows on the same day must not overlap.');
  assert.equal(preferencesKind.fromDraft({ ...draft, softWindows: [{ weekday: 5, start: '18:00', end: '24:00' }, { weekday: 6, start: '18:00', end: '24:00' }] }, '-', state).item.softWindows.length, 2);
});

test('KINDS describes the six setup screens', () => {
  assert.deepEqual(KIND_IDS, ['commitments', 'tasks', 'due-dates', 'places', 'commutes', 'preferences']);
  assert.equal(KINDS['due-dates'].list, 'deadlines');
  assert.equal(KINDS.preferences.single, true);
  assert.equal(KINDS.commitments.add, 'Add a commitment');
  assert.equal(KINDS['due-dates'].itemTitle(example.deadlines[0], example), 'Chemistry exam');
  assert.equal(KINDS.tasks.itemLabel(task()), 'study');
  assert.equal(KINDS['due-dates'].itemLabel(example.deadlines[0]), 'exam');
});

const sampleState = () => ({ ...structuredClone(example), blocks: [{ taskId: 'chem', title: 'Chemistry', category: 'study', date: '2026-10-05', start: 480, end: 540 }], approvedSoft: ['2026-10-09'], dismissed: ['k'] });

test('applyItem replaces by id or appends, and never changes anything else or the input', () => {
  const state = sampleState();
  const frozen = structuredClone(state);
  const edited = applyItem(state, 'tasks', { ...task(), title: 'Organic chemistry' });
  assert.deepEqual(state, frozen);
  assert.equal(edited.tasks.find((t: any) => t.id === 'chem').title, 'Organic chemistry');
  assert.equal(edited.tasks.length, state.tasks.length);
  assert.deepEqual({ ...edited, tasks: 0 }, { ...state, tasks: 0 });
  const added = applyItem(state, 'commitments', { ...state.commitments[0], id: 'brand-new' });
  assert.equal(added.commitments.length, state.commitments.length + 1);
  assert.deepEqual(added.blocks, state.blocks);
  assert.deepEqual(added.approvedSoft, ['2026-10-09']);
  const prefs = applyItem(state, 'preferences', { ...state.preferences, minBlock: 45 });
  assert.equal(prefs.preferences.minBlock, 45);
  assert.deepEqual(prefs.tasks, state.tasks);
});

test('removeItem removes by id, and removing a task removes its due dates', () => {
  const state = sampleState();
  const frozen = structuredClone(state);
  const noLesson = removeItem(state, 'commitments', 'lesson-1');
  assert.deepEqual(state, frozen);
  assert.equal(noLesson.commitments.some((c: any) => c.id === 'lesson-1'), false);
  assert.equal(noLesson.commitments.length, state.commitments.length - 1);
  const noChem = removeItem(state, 'tasks', 'chem');
  assert.equal(noChem.tasks.some((t: any) => t.id === 'chem'), false);
  assert.equal(noChem.deadlines.length, 0);
  assert.deepEqual(noChem.blocks, state.blocks);
  assert.deepEqual(removeItem(state, 'due-dates', 'chem-exam').tasks, state.tasks);
  assert.deepEqual(removeItem(state, 'tasks', 'nope'), state);
  assert.deepEqual(itemsOf(state, 'due-dates'), state.deadlines);
  assert.deepEqual(itemsOf(state, 'preferences'), []);
});

const st = () => structuredClone(example);

test('places: blank, round trip, summaries and checks', () => {
  assert.deepEqual(placeKind.blank(), { name: '', kind: 'other', address: '' });
  const p = st().places[1];
  assert.deepEqual(placeKind.fromDraft(placeKind.toDraft(p), p.id, st()).item, p);
  assert.equal(placeKind.summary(p), p.address);
  assert.equal(placeKind.summary({ ...p, address: '' }), 'Address missing');
  assert.deepEqual(placeKind.fromDraft({ name: '  Gym ', kind: 'other', address: ' Av 1 ' }, 'p1', st()).item, { id: 'p1', name: 'Gym', kind: 'other', address: 'Av 1' });
  assert.match(placeKind.fromDraft({ name: ' ', kind: 'other', address: '' }, 'p1', st()).error, /name/);
  assert.match(placeKind.fromDraft({ name: 'x'.repeat(201), kind: 'other', address: '' }, 'p1', st()).error, /200/);
  assert.match(placeKind.fromDraft({ name: 'x', kind: 'other', address: 'y'.repeat(301) }, 'p1', st()).error, /300/);
  assert.match(placeKind.fromDraft({ name: 'x', kind: 'castle', address: '' }, 'p1', st()).error, /kind/);
  assert.match(placeKind.fromDraft({ name: 'Second', kind: 'home', address: '' }, 'p2', st()).error, /already a Home/);
  assert.equal(placeKind.fromDraft({ name: 'Home again', kind: 'home', address: '' }, 'home', st()).item.kind, 'home');
  assert.deepEqual(PLACE_KINDS, ['home', 'campus', 'student', 'other']);
});

test('commutes: blank starts at Home, drafts round trip for every shape of route', () => {
  const s = st();
  const blank = commuteKind.blank('2026-10-05', s);
  assert.equal(blank.fromPlaceId, 'home');
  assert.notEqual(blank.toPlaceId, 'home');
  assert.deepEqual([blank.repeats, blank.method, blank.minutes, blank.margin], ['weekly', 'typed', '30', '10']);
  const shapes = [
    { id: 'a', fromPlaceId: 'home', toPlaceId: 'campus', repeats: { kind: 'weekly', weekdays: [1, 3] }, source: { method: 'typed', minutes: 45 }, marginMinutes: 10 },
    { id: 'b', fromPlaceId: 'home', toPlaceId: 'anna', repeats: null, source: { method: 'maps', mode: 'bike', fallbackMinutes: 25 }, marginMinutes: 5 },
    { id: 'c', fromPlaceId: 'campus', toPlaceId: 'parish', repeats: { kind: 'monthly', monthDays: [1, 15] }, source: { method: 'typed', minutes: 0 }, marginMinutes: 0 },
  ];
  for (const c of shapes) assert.deepEqual(commuteKind.fromDraft(commuteKind.toDraft(c), c.id, s).item, c, c.id);
  assert.equal(commuteKind.toDraft(shapes[1]).repeats, 'per-lesson');
  assert.equal(commuteKind.toDraft(shapes[2]).monthDays, '1, 15');
});

test('commutes: plain sentences for every mistake', () => {
  const s = st();
  const good = commuteKind.toDraft({ id: 'a', fromPlaceId: 'home', toPlaceId: 'campus', repeats: { kind: 'weekly', weekdays: [1] }, source: { method: 'typed', minutes: 45 }, marginMinutes: 10 });
  const bad = (over: any) => commuteKind.fromDraft({ ...good, ...over }, 'a', s).error;
  assert.match(bad({ fromPlaceId: '' }), /where it starts/);
  assert.match(bad({ toPlaceId: 'nowhere' }), /where it ends/);
  assert.match(bad({ toPlaceId: 'home' }), /two different places/);
  assert.match(bad({ weekdays: [] }), /at least one day/);
  assert.match(bad({ repeats: 'monthly', monthDays: '' }), /Month days/);
  assert.match(bad({ repeats: 'monthly', monthDays: '1, 29' }), /Month days/);
  assert.match(bad({ repeats: 'monthly', monthDays: '1, x' }), /Month days/);
  assert.match(bad({ minutes: '-1' }), /Minutes/);
  assert.match(bad({ minutes: '601' }), /Minutes/);
  assert.match(bad({ margin: '121' }), /margin/);
  assert.match(bad({ method: 'magic' }), /how long/);
  assert.match(bad({ method: 'maps', mode: 'rocket' }), /travel/);
  assert.deepEqual(commuteKind.fromDraft({ ...good, repeats: 'monthly', monthDays: '15, 1, 15' }, 'a', s).item.repeats, { kind: 'monthly', monthDays: [1, 15] });
  assert.deepEqual(TRAVEL_MODES, ['car', 'bike', 'transit', 'walk']);
});

test('commutes: summaries and list titles read as sentences', () => {
  const s = st();
  const c = { id: 'a', fromPlaceId: 'home', toPlaceId: 'campus', repeats: { kind: 'weekly', weekdays: [4, 2] }, source: { method: 'typed', minutes: 45 }, marginMinutes: 10 };
  assert.equal(KINDS.commutes.itemTitle(c, s), 'Home to Campus');
  assert.equal(KINDS.commutes.itemLabel(c), 'weekly');
  assert.equal(commuteKind.summary(c, s), 'Tue, Thu / 45 min + 10 margin / typed');
  assert.equal(commuteKind.summary({ ...c, repeats: null, source: { method: 'maps', mode: 'transit', fallbackMinutes: 30 } }, s), 'every lesson / 30 min + 10 margin / Google Maps by transit');
  assert.equal(KINDS.commutes.itemLabel({ ...c, repeats: null }), 'per lesson');
  assert.equal(KINDS.commutes.itemLabel({ ...c, repeats: { kind: 'monthly', monthDays: [3] } }), 'monthly');
  assert.equal(commuteKind.summary({ ...c, repeats: { kind: 'monthly', monthDays: [1, 15] } }, s), 'day 1, 15 / 45 min + 10 margin / typed');
});

test('a commitment can name its place, and an unknown place is refused', () => {
  const s = st();
  const c = s.commitments.find((x: any) => x.id === 'chem-lecture');
  const draft = commitmentKind.toDraft(c);
  assert.equal(draft.placeId, 'campus');
  assert.equal(commitmentKind.fromDraft(draft, c.id, s).item.placeId, 'campus');
  assert.equal('placeId' in commitmentKind.fromDraft({ ...draft, placeId: '' }, c.id, s).item, false);
  assert.match(commitmentKind.fromDraft({ ...draft, placeId: 'nowhere' }, c.id, s).error, /place/);
  assert.equal(commitmentKind.blank('2026-10-05').placeId, '');
});

test('the travel allowance is a preference with limits, and nothing else about preferences changes', () => {
  const s = st();
  const d = preferencesKind.toDraft(s.preferences);
  assert.equal(d.travelAllowance, '30');
  assert.equal(preferencesKind.fromDraft({ ...d, travelAllowance: '45' }, '-', s).item.travelAllowanceMinutes, 45);
  assert.match(preferencesKind.fromDraft({ ...d, travelAllowance: '601' }, '-', s).error, /Travel allowance/);
  assert.match(preferencesKind.fromDraft({ ...d, travelAllowance: 'x' }, '-', s).error, /Travel allowance/);
  assert.deepEqual(preferencesKind.fromDraft(d, '-', s).item, { ...s.preferences, travelAllowanceMinutes: 30, hoursPerCredit: null, normalCredits: 30, fullLoadHours: 40 });
});

test('deleting a place removes its commutes and clears it from commitments, and nothing else changes', () => {
  const s = st();
  const next = removeItem(s, 'places', 'campus');
  assert.equal(next.places.some((p: any) => p.id === 'campus'), false);
  assert.deepEqual(next.commutes, []);
  const lecture = next.commitments.find((c: any) => c.id === 'chem-lecture');
  assert.equal('placeId' in lecture, false);
  assert.equal(next.commitments.find((c: any) => c.id === 'mass').placeId, 'parish');
  assert.deepEqual(next.tasks, s.tasks);
  assert.deepEqual(next.blocks, s.blocks);
  assert.deepEqual(next.preferences, s.preferences);
  assert.equal(KINDS.places.confirmNote(s, 'campus'), ' Its 1 commute goes too. 1 commitment loses its place.');
  assert.equal(KINDS.places.confirmNote(s, 'anna'), '');
  assert.equal(KINDS.tasks.confirmNote(s, 'chem'), ' Its 1 due date goes too.');
  assert.equal(KINDS.tasks.confirmNote(s, 'gym'), '');
});

test('a state without places or commutes still lists and deletes safely', () => {
  const old = { ...st(), places: undefined, commutes: undefined };
  assert.deepEqual(itemsOf(old, 'places'), []);
  assert.deepEqual(itemsOf(old, 'commutes'), []);
  assert.doesNotThrow(() => removeItem(old, 'places', 'x'));
  assert.deepEqual(KIND_IDS, ['commitments', 'tasks', 'due-dates', 'places', 'commutes', 'preferences']);
});

test('adding and editing a commute only touches the commutes list', () => {
  const s = st();
  const item = { id: 'r-new', fromPlaceId: 'home', toPlaceId: 'anna', repeats: null, source: { method: 'typed', minutes: 20 }, marginMinutes: 5 };
  const next = applyItem(s, 'commutes', item);
  assert.equal(next.commutes.length, s.commutes.length + 1);
  assert.deepEqual({ ...next, commutes: null }, { ...s, commutes: null });
});

test('parseDecimal accepts plain decimals inside the limits only', () => {
  assert.equal(parseDecimal('3', 0.5, 100), 3);
  assert.equal(parseDecimal(' 2.5 ', 0.5, 100), 2.5);
  assert.equal(parseDecimal('0.5', 0.5, 100), 0.5);
  for (const bad of ['', 'abc', '1e3', '-1', '0.4', '100.5', '1.', '1,', '.5x', '2,5,1', '1.2.3', 'NaN', 'Infinity', '０５']) assert.equal(parseDecimal(bad, 0.5, 100), null, bad);
  assert.equal(parseDecimal('2,5', 0.5, 100), 2.5, 'a comma is a decimal point');
  assert.equal(parseDecimal('.5', 0.5, 100), 0.5);
  assert.equal(parseDecimal(',5', 0.5, 100), 0.5);
  assert.equal(parseDecimal('2.123456', 0.5, 100), 2.123456);
});

test('a study task keeps its course details through a draft, and other tasks have none', () => {
  const study = { id: 't', title: 'Chemistry', category: 'study', weeklyMinutes: 360, maxBlock: 90, onePerDay: false, priority: 2,
    course: { credits: 3, difficulty: 4, examOnly: false, weeklyGraded: true, lab: true, syllabus: 'Sets.' } };
  const draft = taskKind.toDraft(study);
  assert.deepEqual([draft.credits, draft.difficulty, draft.examOnly, draft.weeklyGraded, draft.lab, draft.syllabus], ['3', '4', false, true, true, 'Sets.']);
  assert.deepEqual(taskKind.fromDraft(draft, 't', example).item, study);
  const plain = taskKind.toDraft({ ...study, course: undefined });
  assert.deepEqual([plain.credits, plain.difficulty, plain.syllabus], ['', '3', '']);
  assert.equal('course' in taskKind.fromDraft(plain, 't', example).item, false);
  assert.equal('course' in taskKind.fromDraft({ ...draft, category: 'gym' }, 't', example).item, false);
  assert.equal(taskKind.fromDraft({ ...draft, credits: '2.5' }, 't', example).item.course.credits, 2.5);
});

test('course details are refused in plain sentences', () => {
  const draft = { ...taskKind.blank(), title: 'Chemistry', category: 'study', credits: '3' };
  const err = (over: any) => taskKind.fromDraft({ ...draft, ...over }, 't', example).error;
  assert.match(err({ credits: '0' }), /Credits/);
  assert.match(err({ credits: 'x' }), /Credits/);
  assert.match(err({ credits: '101' }), /Credits/);
  assert.match(err({ difficulty: '6' }), /Difficulty/);
  assert.match(err({ syllabus: 'x'.repeat(20001) }), /Syllabus/);
  assert.match(err({ credits: '', syllabus: 'Some text' }), /credits/);
  assert.equal(taskKind.fromDraft({ ...draft, credits: '', syllabus: '' }, 't', example).error, undefined);
});

test('the scale preferences round trip, blank hours per credit means none, and limits are enforced', () => {
  const s = structuredClone(example);
  s.preferences.hoursPerCredit = 1;
  const d = preferencesKind.toDraft(s.preferences);
  assert.deepEqual([d.hoursPerCredit, d.normalCredits, d.fullLoadHours], ['1', '30', '40']);
  const item = preferencesKind.fromDraft(d, '-', s).item;
  assert.deepEqual([item.hoursPerCredit, item.normalCredits, item.fullLoadHours], [1, 30, 40]);
  assert.equal(preferencesKind.fromDraft({ ...d, hoursPerCredit: '' }, '-', s).item.hoursPerCredit, null);
  const err = (over: any) => preferencesKind.fromDraft({ ...d, ...over }, '-', s).error;
  assert.match(err({ hoursPerCredit: '0' }), /Hours a week per credit/);
  assert.match(err({ hoursPerCredit: '21' }), /Hours a week per credit/);
  assert.match(err({ normalCredits: '0' }), /normal semester/);
  assert.match(err({ fullLoadHours: '101' }), /full load/);
  assert.equal(preferencesKind.toDraft({ ...s.preferences, hoursPerCredit: undefined, normalCredits: undefined, fullLoadHours: undefined }).normalCredits, '30');
});
