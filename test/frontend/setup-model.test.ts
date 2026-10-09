import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATEGORIES, WEEK_ORDER, commitmentKind, newId, parseTime, parseWhole } from '../../public/js/setup-model.js';
import { KINDS, KIND_IDS, applyItem, deadlineKind, itemsOf, preferencesKind, removeItem, taskKind } from '../../public/js/setup-model.js';

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
  const prefs = { ...example.preferences, softMode: 'auto' };
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

test('KINDS describes the four setup screens', () => {
  assert.deepEqual(KIND_IDS, ['commitments', 'tasks', 'due-dates', 'preferences']);
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
