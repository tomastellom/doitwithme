import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDom } from '../../public/js/dom.js';
import { addMonths, monthModel, monthStart } from '../../public/js/month-model.js';
import { renderMonth } from '../../public/js/month.js';
import { FakeDocument, byClass, byTag, findAll, textOf } from './fakedom.ts';

const dom = createDom(new FakeDocument() as any);
const block = (date: string, start: number, end: number, title: string, category: string) => ({ taskId: title, title, category, date, start, end });
const state = (over: any = {}) => ({
  commitments: [{ id: 'm', title: 'Mass', category: 'mass', start: 1200, end: 1260, pattern: { kind: 'once', date: '2026-10-18' }, exceptions: [], bufferBefore: 30 }],
  tasks: [{ id: 'chem', title: 'Chemistry', category: 'study' }],
  deadlines: [{ id: 'exam', taskId: 'chem', kind: 'exam', dueDate: '2026-10-23', effortMinutes: 300 }],
  blocks: [block('2026-10-12', 480, 535, 'Chemistry', 'study'), block('2026-10-13', 765, 825, 'Gym', 'gym'), block('2026-10-13', 600, 640, 'Side project', 'personal project')],
  ...over,
});
const model = (s = state(), anchor = '2026-10-14') => monthModel(s, anchor, '2026-10-14', []);

test('month arithmetic: the first of the month, and stepping across year ends', () => {
  assert.equal(monthStart('2026-10-14'), '2026-10-01');
  assert.equal(addMonths('2026-10-14', 1), '2026-11-01');
  assert.equal(addMonths('2026-12-31', 1), '2027-01-01');
  assert.equal(addMonths('2026-01-15', -1), '2025-12-01');
});

test('October 2026 starts on a Thursday, so the grid begins on Mon 28 Sep and has five rows', () => {
  const m = model();
  assert.equal(m.title, 'October');
  assert.equal(m.year, 2026);
  assert.equal(m.cells.length, 35);
  assert.equal(m.cells[0].date, '2026-09-28');
  assert.equal(m.cells[0].inMonth, false);
  assert.equal(m.cells[3].date, '2026-10-01');
  assert.equal(m.cells[3].inMonth, true);
  assert.equal(m.cells[34].date, '2026-11-01');
});

test('a month that needs six rows gets six rows, and February 2027 fits in four', () => {
  assert.equal(monthModel(state(), '2026-08-10', '2026-10-14', []).cells.length, 42);
  assert.equal(monthModel(state(), '2027-02-10', '2026-10-14', []).cells.length, 28);
});

test('each day carries one dot per planned item, in time order, tagged with its group', () => {
  const m = model();
  const day = (d: string) => m.cells.find((c: any) => c.date === d);
  const ids = (d: string) => day(d).dots.map((g: any) => g.id);
  assert.deepEqual(ids('2026-10-12'), ['study']);
  assert.deepEqual(ids('2026-10-13'), ['personal project', 'gym']);
  assert.deepEqual(ids('2026-10-18'), ['mass']);
  assert.deepEqual(day('2026-10-12').dots[0], { id: 'study', name: 'Study', color: '#FF4B1F', look: 'fill', status: null });
  assert.deepEqual(day('2026-10-15').dots, []);
  assert.deepEqual(m.cells[0].dots, [], 'days of the neighbouring month stay empty');
});

test('today, past days and due dates are marked, and a busy day caps its dots', () => {
  const m = model();
  const day = (d: string) => m.cells.find((c: any) => c.date === d);
  assert.equal(day('2026-10-14').isToday, true);
  assert.equal(day('2026-10-13').isPast, true);
  assert.equal(day('2026-10-15').isPast, false);
  assert.equal(day('2026-10-23').due, true);
  assert.equal(m.due, 1);
  const busy = state({ blocks: Array.from({ length: 12 }, (_, i) => block('2026-10-20', 60 + i * 30, 80 + i * 30, `t${i}`, 'study')) });
  const cell = model(busy).cells.find((c: any) => c.date === '2026-10-20');
  assert.equal(cell.dots.length, 8);
  assert.equal(cell.more, 4);
});

function draw(over: any = {}, actionOver: any = {}) {
  const calls: any[] = [];
  const actions = { go: (n: number) => calls.push(['go', n]), today: () => calls.push(['today']), loadExample: () => calls.push(['example']), canAdd: false, ...actionOver };
  const el: any = renderMonth(dom, { model: over.model ?? model(), needsYou: over.needsYou ?? 0, isEmpty: over.isEmpty ?? false }, actions);
  return { el, calls };
}

test('the hero names the month, steps with real buttons, and arrow keys step too', () => {
  const { el, calls } = draw();
  assert.equal(textOf(byTag(el, 'h1')[0]), 'October');
  assert.match(textOf(byClass(el, 'meta')[0]), /2026/);
  const btn = (k: string) => findAll(el, (e: any) => e.getAttribute('data-fk') === k)[0];
  btn('prev').click();
  btn('today').click();
  btn('next').click();
  byTag(el, 'h1')[0].dispatch('keydown', { key: 'ArrowRight', preventDefault() {} });
  assert.deepEqual(calls, [['go', -1], ['today'], ['go', 1], ['go', 1]]);
  assert.equal(btn('prev').getAttribute('aria-label'), 'Previous month');
});

test('every day is a link to its Day screen, with a spoken summary, and the dots are decoration', () => {
  const { el } = draw();
  const cells = byClass(el, 'cell');
  assert.equal(cells.length, 35);
  const tue = cells.find((c: any) => c.getAttribute('href') === '#/day/2026-10-13')!;
  assert.equal(tue.tag, 'a');
  assert.match(tue.getAttribute('aria-label'), /Tuesday 13 October, 2 planned/);
  assert.equal(byClass(tue, 'dot').length, 2);
  assert.ok(byClass(tue, 'dot').every((d: any) => d.getAttribute('aria-hidden') === 'true'));
  assert.ok(cells.find((c: any) => c.getAttribute('href') === '#/day/2026-10-14').hasClass('today'));
  assert.equal(textOf(byClass(cells.find((c: any) => c.getAttribute('href') === '#/day/2026-10-23')!, 'due')[0]), 'Due');
});

test('with nothing planned the month points at the example, and the grid still shows', () => {
  const { el, calls } = draw({ isEmpty: true, model: model(state({ commitments: [], blocks: [], deadlines: [] })) });
  assert.match(textOf(el), /Nothing planned yet/);
  findAll(el, (e: any) => e.getAttribute('data-fk') === 'example')[0].click();
  assert.deepEqual(calls, [['example']]);
  assert.equal(byClass(el, 'cell').length, 35);
});

test('every day has its own Add button next to its link, so a link never holds a button', () => {
  const adds: string[] = [];
  const { el } = draw({}, { add: (date: string) => adds.push(date) });
  const plus = findAll(el, (e: any) => e.tag === 'button' && (e.getAttribute('data-fk') ?? '').startsWith('plus-'));
  assert.equal(plus.length, 35);
  const tue = plus.find((b: any) => b.getAttribute('data-fk') === 'plus-2026-10-13')!;
  assert.match(tue.getAttribute('aria-label'), /Add to Tuesday 13 October/);
  tue.click();
  assert.deepEqual(adds, ['2026-10-13']);
  assert.ok(byClass(el, 'cell').every((c: any) => byTag(c, 'button').length === 0), 'no button inside a link');
});

test('a day with things planned has a check-off button, done dots fade, and an empty day has none', () => {
  const reviews: string[] = [];
  const s = state({ blocks: [{ ...block('2026-10-12', 480, 535, 'Chemistry', 'study'), status: 'done' }, block('2026-10-13', 765, 825, 'Gym', 'gym')] });
  const { el } = draw({ model: monthModel(s, '2026-10-14', '2026-10-14', []) }, { review: (d: string) => reviews.push(d) });
  const rv = findAll(el, (e: any) => (e.getAttribute('data-fk') ?? '').startsWith('review-'));
  assert.ok(rv.length >= 3);
  assert.ok(rv.every((b: any) => b.tag === 'button'));
  assert.equal(rv.find((b: any) => b.getAttribute('data-fk') === 'review-2026-10-15'), undefined, 'nothing planned on the 15th');
  rv.find((b: any) => b.getAttribute('data-fk') === 'review-2026-10-12')!.click();
  assert.deepEqual(reviews, ['2026-10-12']);
  const dot = byClass(findAll(el, (e: any) => e.getAttribute('data-fk') === 'cell-2026-10-12')[0], 'dot')[0];
  assert.ok(dot.hasClass('is-done'));
});
