import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDom } from '../../public/js/dom.js';
import { deadlinesModel } from '../../public/js/deadlines-model.js';
import { renderDeadlines } from '../../public/js/deadlines.js';
import { FakeDocument, byClass, byTag, findAll, textOf } from './fakedom.ts';

const dom = createDom(new FakeDocument() as any);
const clock = { today: '2026-10-09', nowMinutes: 600, horizonDays: 15 };
const blk = (deadlineId: string, date: string, start: number, end: number) => ({ taskId: 't', title: 'x', category: 'study', date, start, end, deadlineId });
const state = (over: any = {}) => ({
  tasks: [{ id: 'chem', title: 'Chemistry', category: 'study' }, { id: 'tax', title: 'Taxes', category: 'errands' }],
  deadlines: [
    { id: 'exam', taskId: 'chem', kind: 'exam', dueDate: '2026-10-23', effortMinutes: 480 },
    { id: 'tax', taskId: 'tax', kind: 'task', dueDate: '2026-10-19', effortMinutes: 120 },
  ],
  blocks: [blk('exam', '2026-10-08', 480, 600), blk('exam', '2026-10-12', 480, 750), blk('tax', '2026-10-12', 480, 600)],
  ...over,
});
const draw = (s = state(), over: any = {}) => renderDeadlines(dom, { model: deadlinesModel(s, clock), isEmpty: false, ...over }) as any;

test('the hero says how many are open and how many are short', () => {
  const el = draw();
  assert.equal(textOf(byTag(el, 'h1')[0]), 'Deadlines');
  const meta = textOf(byClass(el, 'meta')[0]);
  assert.match(meta, /2 open/);
  assert.match(meta, /1 short/);
});

test('each row has the date, title, bar numbers and a chip', () => {
  const el = draw();
  const rows = byClass(el, 'dl');
  assert.equal(rows.length, 2);
  assert.match(textOf(rows[0]), /19.*Oct.*Mon.*in 10 days/);
  assert.match(textOf(rows[0]), /Taxes task/);
  assert.match(textOf(rows[0]), /Covered/);
  assert.match(textOf(rows[1]), /Chemistry exam/);
  assert.match(textOf(rows[1]), /Done 2h00/);
  assert.match(textOf(rows[1]), /Planned 4h30/);
  assert.match(textOf(rows[1]), /Short 1h30/);
  assert.match(textOf(rows[1]), /Short 90 min/);
});

test('the bar is drawn with SVG shapes only, never a style attribute', () => {
  const el = draw();
  const svgs = findAll(el, (e: any) => e.tag === 'svg' && e.hasClass('dl-bar'));
  assert.equal(svgs.length, 2);
  assert.equal(findAll(el, (e: any) => e.getAttribute('style') !== null).length, 0);
  const shapes = findAll(svgs[1], (e: any) => e.tag === 'rect');
  assert.deepEqual(shapes.map((r: any) => r.getAttribute('class')), ['dl-done', 'dl-plan', 'dl-short']);
  const widths = shapes.map((r: any) => Number(r.getAttribute('width')));
  assert.ok(Math.abs(widths.reduce((a: number, b: number) => a + b, 0) - 100) < 0.01);
});

test('a due date beyond the plan window says Later, not Short', () => {
  const far = state({ deadlines: [{ id: 'f', taskId: 'chem', kind: 'exam', dueDate: '2026-12-01', effortMinutes: 600 }], blocks: [] });
  const el = draw(far);
  assert.match(textOf(byClass(el, 'dl')[0]), /Later/);
  assert.doesNotMatch(textOf(byClass(el, 'meta')[0]), /short/);
});

test('with no due dates the screen points at Setup, and hostile titles stay text', () => {
  const empty = draw(state({ deadlines: [] }));
  assert.match(textOf(empty), /No due dates yet/);
  assert.equal(findAll(empty, (e: any) => e.tag === 'a' && e.getAttribute('href') === '#/due-dates/new').length, 2);
  const evil = draw(state({ tasks: [{ id: 'chem', title: '<img src=x onerror=alert(1)>', category: 'study' }] }));
  assert.match(textOf(evil), /<img src=x onerror=alert\(1\)> exam/);
  assert.equal(findAll(evil, (e: any) => e.tag === 'img').length, 0);
});

test('there is an add button, and each row is a link to its own edit form', () => {
  const el = draw();
  const add = findAll(el, (e: any) => e.tag === 'a' && e.getAttribute('href') === '#/due-dates/new');
  assert.equal(add.length, 1);
  assert.match(textOf(add[0]), /\+ Add a due date/);
  const rows = byClass(el, 'dl');
  assert.deepEqual(rows.map((r: any) => [r.tag, r.getAttribute('href')]), [['a', '#/due-dates/tax'], ['a', '#/due-dates/exam']]);
  assert.match(textOf(byClass(el, 'meta')[0]), /Click a row to edit it/);
  const evil = draw(state({ deadlines: [{ id: 'a/b c', taskId: 'chem', kind: 'exam', dueDate: '2026-10-12', effortMinutes: 60 }] }));
  assert.equal(byClass(evil, 'dl')[0].getAttribute('href'), '#/due-dates/a%2Fb%20c');
});

test('the add button is there even when there are no due dates', () => {
  const empty = draw(state({ deadlines: [] }));
  assert.equal(findAll(empty, (e: any) => e.tag === 'a' && e.getAttribute('href') === '#/due-dates/new').length >= 1, true);
});
