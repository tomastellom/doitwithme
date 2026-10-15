import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLANK_READBACK, COPY, lengthText, readBack } from '../../public/js/setup-copy.js';

const state = { places: [{ id: 'p1', name: 'North campus' }], tasks: [{ id: 't1', title: 'Chemistry' }] };

test('every kind has a title, a purpose sentence, examples and an add button', () => {
  for (const id of ['commitments', 'tasks', 'due-dates', 'labels', 'places', 'commutes']) {
    const c = (COPY as any)[id];
    assert.ok(c.title && c.lead.endsWith('.') && c.examples.length > 0 && c.add, id);
  }
  assert.deepEqual(['commitments', 'tasks', 'due-dates', 'places', 'commutes'].map((id) => (COPY as any)[id].title), ['Fixed times', 'To do', 'Due dates', 'Places and travel', 'Travel']);
});

test('lengths read as a person says them', () => {
  assert.deepEqual([30, 60, 90, 120, 135].map(lengthText), ['30 min', '1 h', '1h30', '2 h', '2h15']);
});

test('a weekly fixed time reads back with days in week order, the place and the start date', () => {
  const d = { title: 'Chemistry lecture', start: '10:00', end: '12:00', repeats: 'weekly', weekdays: [3, 1], placeId: 'p1', from: '2026-10-12', to: '2026-12-01', date: '' };
  assert.equal(readBack('commitments', d, state), 'Chemistry lecture, every Monday and Wednesday, 10:00 to 12:00, at North campus, starting 12 Oct.');
});

test('three days, every day, and a one-time date read back correctly', () => {
  const base = { title: 'Gym', start: '18:00', end: '19:00', repeats: 'weekly', weekdays: [5, 1, 3], placeId: '', from: '', to: '', date: '' };
  assert.equal(readBack('commitments', base, state), 'Gym, every Monday, Wednesday and Friday, 18:00 to 19:00.');
  assert.equal(readBack('commitments', { ...base, weekdays: [0, 1, 2, 3, 4, 5, 6] }, state), 'Gym, every day, 18:00 to 19:00.');
  assert.equal(readBack('commitments', { ...base, repeats: 'once', date: '2026-10-13', start: '9:00' }, state), 'Gym, on Tue 13 Oct, 09:00 to 19:00.');
});

test('an incomplete or invalid draft reads back as nothing, never undefined or NaN', () => {
  const ok = { title: 'Gym', start: '18:00', end: '19:00', repeats: 'weekly', weekdays: [1], placeId: '', from: '', to: '', date: '' };
  assert.equal(readBack('commitments', { ...ok, title: '  ' }, state), '');
  assert.equal(readBack('commitments', { ...ok, start: 'soon' }, state), '');
  assert.equal(readBack('commitments', { ...ok, weekdays: [] }, state), '');
  assert.equal(readBack('commitments', { ...ok, repeats: 'once', date: 'nope' }, state), '');
  for (const out of [readBack('commitments', ok, state), readBack('tasks', { title: 'x', weekly: 'abc', maxBlock: '' }, state)]) assert.doesNotMatch(out, /undefined|NaN/);
  assert.ok(BLANK_READBACK.endsWith('.'));
});

test('a place that no longer exists is simply left out', () => {
  const d = { title: 'Gym', start: '18:00', end: '19:00', repeats: 'weekly', weekdays: [1], placeId: 'gone', from: '', to: '', date: '' };
  assert.equal(readBack('commitments', d, state), 'Gym, every Monday, 18:00 to 19:00.');
});

test('a to-do reads back its weekly time and longest block; with no weekly time it says so', () => {
  assert.equal(readBack('tasks', { title: 'Chemistry', weekly: '360', maxBlock: '120' }, state), 'Chemistry needs 6 h a week, in blocks of up to 2 h.');
  assert.equal(readBack('tasks', { title: 'Essay', weekly: '', maxBlock: '90' }, state), 'Essay has no weekly time set.');
  assert.equal(readBack('tasks', { title: ' ', weekly: '60', maxBlock: '60' }, state), '');
});

test('a due date reads back the task, the kind, the day and the effort', () => {
  assert.equal(readBack('due-dates', { taskId: 't1', kind: 'exam', dueDate: '2026-10-23', effort: '180' }, state), 'Chemistry exam on Fri 23 Oct, needing 3 h.');
  assert.equal(readBack('due-dates', { taskId: 'nope', kind: 'exam', dueDate: '2026-10-23', effort: '180' }, state), '');
  assert.equal(readBack('due-dates', { taskId: 't1', kind: 'exam', dueDate: '2026-10-23', effort: 'lots' }, state), '');
});

test('kinds without a read-back give nothing', () => {
  assert.equal(readBack('labels', { name: 'x' }, state), '');
});

test('a title that looks like markup comes back as the same plain text', () => {
  const d = { title: '<b>Gym</b>', start: '18:00', end: '19:00', repeats: 'weekly', weekdays: [1], placeId: '', from: '', to: '', date: '' };
  assert.match(readBack('commitments', d, state), /^<b>Gym<\/b>, every Monday/);
});
