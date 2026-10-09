import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { occurrencesOn as serverOccurrences } from '../../src/busy.ts';
import { addDays } from '../../public/js/time.js';
import { GROUP_IDS, GROUPS, dayItems, groupOfBlock, itemKey, labelOf, occurrencesOn, weekModel } from '../../public/js/model.js';

const block = (date: string, start: number, end: number, title: string, category: string) => ({
  taskId: title, title, category, date, start, end,
});
const commitment = (over: any = {}) => ({
  id: 'c', title: 'Lecture', category: 'class', start: 600, end: 720,
  pattern: { kind: 'once', date: '2026-10-13' }, exceptions: [], bufferBefore: 30, ...over,
});
const state = (over: any = {}) => ({ commitments: [], tasks: [], deadlines: [], blocks: [], ...over });
const all = new Set(GROUP_IDS);

test('groups are the five on the board, in order', () => {
  assert.deepEqual(GROUPS.map((g) => g.label), ['Fixed', 'Study', 'Gym', 'Chores and errands', 'Projects and social']);
});

test('categories map to groups, unknown ones are outlined', () => {
  assert.equal(groupOfBlock('study'), 'study');
  assert.equal(groupOfBlock('Gym'), 'gym');
  assert.equal(groupOfBlock('chores'), 'admin');
  assert.equal(groupOfBlock('errands'), 'admin');
  for (const c of ['personal project', 'social', 'mystery', '']) assert.equal(groupOfBlock(c), 'outline');
  assert.equal(labelOf('personal project'), 'project');
  assert.equal(labelOf('Class'), 'class');
});

test('the browser occurrence logic matches the server for every day of the example schedule', () => {
  const example = JSON.parse(readFileSync('examples/sample-state.json', 'utf8'));
  let date = '2026-08-25';
  let checked = 0;
  while (date <= '2027-01-10') {
    assert.deepEqual(occurrencesOn(date, example.commitments), serverOccurrences(date, example.commitments), date);
    date = addDays(date, 1);
    checked++;
  }
  assert.ok(checked > 100);
});

test('dayItems merges commitments and blocks in time order with labels and groups', () => {
  const s = state({
    commitments: [commitment()],
    blocks: [block('2026-10-13', 480, 555, 'Chemistry', 'study'), block('2026-10-13', 780, 840, 'Gym', 'gym'), block('2026-10-14', 480, 540, 'Other day', 'study')],
  });
  assert.deepEqual(dayItems(s, '2026-10-13').map((i) => [i.start, i.title, i.group, i.label, i.kind]), [
    [480, 'Chemistry', 'study', 'study', 'block'],
    [600, 'Lecture', 'fixed', 'class', 'commitment'],
    [780, 'Gym', 'gym', 'gym', 'block'],
  ]);
});

test('weekModel counts and totals are unfiltered, items are filtered, today is flagged', () => {
  const s = state({
    commitments: [commitment()],
    blocks: [block('2026-10-12', 480, 540, 'Chemistry', 'study'), block('2026-10-13', 480, 555, 'Chemistry', 'study'), block('2026-10-13', 780, 840, 'Gym', 'gym')],
  });
  const m = weekModel(s, '2026-10-12', new Set(['study']), '2026-10-13');
  assert.equal(m.week, 42);
  assert.equal(m.range, '12 – 18 Oct 2026');
  assert.equal(m.title, '12–18 Oct');
  assert.deepEqual(m.counts, { fixed: 1, study: 2, gym: 1, admin: 0, outline: 0 });
  assert.equal(m.total, 4);
  assert.equal(m.days.length, 7);
  const tue = m.days[1];
  assert.equal(tue.weekday, 'Tue');
  assert.equal(tue.num, 13);
  assert.equal(tue.isToday, true);
  assert.equal(tue.booked, 75 + 120 + 60);
  assert.deepEqual(tue.items.map((i) => i.title), ['Chemistry']);
  assert.equal(m.days[0].isToday, false);
});

test('weekModel works across the ISO week 53 and the year boundary', () => {
  const s = state({ blocks: [block('2026-12-31', 600, 660, 'A', 'study'), block('2027-01-01', 600, 660, 'B', 'study')] });
  const m = weekModel(s, '2026-12-28', all, '2026-12-30');
  assert.equal(m.week, 53);
  assert.equal(m.year, 2026);
  assert.equal(m.range, '28 Dec 2026 – 3 Jan 2027');
  assert.deepEqual(m.days.map((d) => d.num), [28, 29, 30, 31, 1, 2, 3]);
  assert.deepEqual(m.days[3].items.map((i) => i.title), ['A']);
  assert.deepEqual(m.days[4].items.map((i) => i.title), ['B']);
});

test('hostile text passes through the model untouched, escaping is the view\'s job', () => {
  const s = state({ blocks: [block('2026-10-12', 480, 540, '<img src=x onerror=alert(1)>', 'study')] });
  assert.equal(dayItems(s, '2026-10-12')[0].title, '<img src=x onerror=alert(1)>');
});

test('travel legs appear in the day, ignore the filters and do not count as booked time', () => {
  const travel = [
    { date: '2026-10-13', start: 545, end: 600, fromName: 'Home', toName: 'Campus', estimated: false },
    { date: '2026-10-13', start: 720, end: 750, fromName: 'Campus', toName: 'Home', estimated: true },
  ];
  const st = state({ commitments: [commitment()] });
  const items = dayItems(st, '2026-10-13', travel);
  assert.deepEqual(items.filter((i: any) => i.kind === 'travel').map((i: any) => [i.start, i.end, i.title, i.label]), [
    [545, 600, 'Home to Campus', 'commute'],
    [720, 750, 'Campus to Home', 'estimated'],
  ]);
  const model = weekModel(st, '2026-10-12', new Set(), '2026-10-12', travel);
  const day = model.days.find((d: any) => d.date === '2026-10-13');
  assert.equal(day.items.length, 2);
  assert.equal(day.booked, 120);
  assert.equal(model.total, 1);
  assert.equal(model.counts.fixed, 1);
});

test('every calendar item knows its date and what it comes from', () => {
  const st = state({
    commitments: [commitment({ id: 'lec' })],
    blocks: [{ taskId: 'chem', title: 'Chemistry', category: 'study', date: '2026-10-13', start: 480, end: 530, deadlineId: 'exam' }],
  });
  const travel = [{ date: '2026-10-13', start: 545, end: 600, fromName: 'Home', toName: 'Campus', estimated: false, placeId: 'campus', commuteId: 'r1' }];
  const items = dayItems(st, '2026-10-13', travel);
  const byKind = (k: string) => items.find((i: any) => i.kind === k);
  assert.deepEqual([byKind('commitment').commitmentId, byKind('commitment').date], ['lec', '2026-10-13']);
  assert.deepEqual([byKind('block').taskId, byKind('block').deadlineId, byKind('block').date], ['chem', 'exam', '2026-10-13']);
  assert.deepEqual([byKind('travel').placeId, byKind('travel').commuteId, byKind('travel').fromName, byKind('travel').toName, byKind('travel').estimated], ['campus', 'r1', 'Home', 'Campus', false]);
});

test('two commitments in one day each keep their own id, in the same order as before', () => {
  const st = state({ commitments: [commitment({ id: 'a', start: 600, end: 660 }), commitment({ id: 'b', start: 600, end: 660 })] });
  assert.deepEqual(dayItems(st, '2026-10-13').map((i: any) => i.commitmentId), ['a', 'b']);
});

test('item keys are unique per item and stable', () => {
  const a = { kind: 'commitment', commitmentId: 'lec', date: '2026-10-13', start: 600 };
  const b = { kind: 'block', taskId: 'lec', date: '2026-10-13', start: 600 };
  const t = { kind: 'travel', placeId: 'campus', date: '2026-10-13', start: 545 };
  assert.equal(itemKey(a), 'commitment:lec:2026-10-13:600');
  assert.equal(new Set([itemKey(a), itemKey(b), itemKey(t)]).size, 3);
  assert.equal(itemKey({ ...a }), itemKey(a));
});
