import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATEGORIES, WEEK_ORDER, commitmentKind, newId, parseTime, parseWhole } from '../../public/js/setup-model.js';

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
    const result = commitmentKind.fromDraft(commitmentKind.toDraft(c), c.id);
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
