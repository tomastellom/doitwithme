import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDom } from '../../public/js/dom.js';
import { dayModel } from '../../public/js/day-model.js';
import { renderDay } from '../../public/js/day.js';
import { tintOf } from '../../public/js/colors.js';
import { FakeDocument, byClass, byTag, findAll, textOf } from './fakedom.ts';

const dom = createDom(new FakeDocument() as any);
const example = JSON.parse(readFileSync('examples/sample-state.json', 'utf8'));
const block = (start: number, end: number, title: string, category: string) => ({ taskId: title, title, category, date: '2026-10-14', start, end });
const state = () => ({ ...structuredClone(example), blocks: [block(480, 530, 'Chemistry', 'study'), block(585, 620, 'Side project', 'personal project')] });
const key = (root: any, k: string) => findAll(root, (e) => e.getAttribute('data-fk') === k)[0];

function draw(over: any = {}, actionOver: any = {}) {
  const calls: any[] = [];
  const actions = { go: (n: number) => calls.push(['go', n]), today: () => calls.push(['today']), loadExample: () => calls.push(['example']), canAdd: true, ...actionOver };
  const view = { model: dayModel(state(), '2026-10-14'), needsYou: 0, isEmpty: false, isToday: true, prevLabel: 'Tue', nextLabel: 'Thu', ...over };
  return { el: renderDay(dom, view, actions) as any, calls };
}

test('the hero shows the day, stepping buttons name the neighbours, and the meta lines are there', () => {
  const { el, calls } = draw();
  assert.equal(textOf(byTag(el, 'h1')[0]), 'Wed 14');
  assert.deepEqual(byClass(el, 'step')[0].children.map((b: any) => textOf(b)), ['Tue', 'Today', 'Thu']);
  key(el, 'prev').click();
  key(el, 'today').click();
  key(el, 'next').click();
  assert.deepEqual(calls, [['go', -1], ['today'], ['go', 1]]);
  const sub = textOf(byClass(el, 'sub')[0]);
  assert.match(sub, /Week 42 \/ 14 Oct 2026/);
  assert.match(sub, /Booked 2h25/);
  assert.match(textOf(byClass(el, 'status')[0]), /All clear/);
  assert.equal(byClass(el, 'meta').length, 0, 'the old meta block is gone');
});

test('the Day header has the Day, Week, Month switch with Day current, no Add button, and keeps Booked', () => {
  const { el } = draw({}, { add: () => {} });
  const keys = findAll(el, (e: any) => (e.getAttribute('data-fk') ?? '').startsWith('view-')).map((e: any) => e.getAttribute('data-fk'));
  assert.deepEqual(keys, ['view-day', 'view-week', 'view-month']);
  assert.equal(key(el, 'view-day').getAttribute('aria-current'), 'page');
  assert.equal(key(el, 'view-day').getAttribute('href'), '#/day');
  assert.equal(key(el, 'view-week').getAttribute('href'), '#/week');
  assert.equal(key(el, 'view-month').getAttribute('href'), '#/month');
  assert.equal(key(el, 'add'), undefined);
  assert.equal(byClass(el, 'hero-add').length, 0);
  assert.match(textOf(byClass(el, 'sub')[0]), /Booked/);
});

test('arrow keys on the title step through days', () => {
  const { el, calls } = draw();
  key(el, 'day-header').dispatch('keydown', { key: 'ArrowRight' });
  key(el, 'day-header').dispatch('keydown', { key: 'ArrowLeft' });
  assert.deepEqual(calls, [['go', 1], ['go', -1]]);
});

test('rows show time, block, duration, gaps and buffers', () => {
  const { el } = draw();
  const text = textOf(el);
  const chem = byClass(el, 'dv-blk').find((b: any) => textOf(b).includes('Chemistry'))!;
  assert.ok(chem.hasClass('one'), 'a 50-minute block is a short tile that says only its name');
  assert.match(chem.getAttribute('title'), /08:00–08:50/, 'its time is in the tooltip');
  assert.match(text, /Free 10:20–15:30 \/ 5h10/);
  assert.match(text, /Buffer before Private lesson, Anna/);
  assert.match(text, /Travel and setup/);
  assert.equal(byClass(el, 'dv-buf').length, 1);
  assert.ok(byClass(el, 'dv-blk').some((b: any) => b.style.background === tintOf('#FF4B1F').fill), 'the study block is painted a soft tint of the Study color');
});

test('the side lists the groups and the free time in the window', () => {
  const { el } = draw();
  const side = textOf(byClass(el, 'dv-side')[0]);
  assert.match(side, /Today by label/);
  assert.match(side, /Lesson.*1h00/);
  assert.match(side, /Study.*0h50/);
  assert.match(side, /Personal project.*0h35/);
  assert.match(side, /Free in the 08:00–22:00 window/);
  assert.match(textOf(byClass(el, 'dv-free')[0]), /^\d+h\d\d$/);
});

test('needs-you count shows instead of All clear', () => {
  const { el } = draw({ needsYou: 2 });
  assert.match(textOf(byClass(el, 'status')[0]), /2 need you/);
});

test('travel rows are hatched and named', () => {
  const travel = [{ date: '2026-10-14', start: 900, end: 930, fromName: 'Home', toName: 'Anna', estimated: false }];
  const { el } = draw({ model: dayModel(state(), '2026-10-14', travel) });
  const row = byClass(el, 'travel')[0];
  assert.match(textOf(row), /Home to Anna/);
});

test('a hostile title is text, and an empty schedule offers the example', () => {
  const evil = { ...state(), blocks: [block(480, 530, '<img src=x onerror=alert(1)>', 'study')] };
  const { el } = draw({ model: dayModel(evil, '2026-10-14') });
  assert.match(textOf(el), /<img src=x onerror=alert\(1\)>/);
  assert.equal(findAll(el, (e: any) => e.tag === 'img').length, 0);
  const { el: empty, calls } = draw({ isEmpty: true });
  assert.match(textOf(empty), /Nothing planned yet/);
  assert.equal(key(empty, 'example').getAttribute('class'), 'btn', 'Load the example is the plain button');
  assert.equal(byClass(empty, 'cta')[0].children.find((c: any) => c.tag === 'a').getAttribute('class'), 'btn y', 'Add a fixed time is the main link');
  key(empty, 'example').click();
  assert.deepEqual(calls, [['example']]);
});

test('other days say Day by label, and the step buttons keep their visible words in their names', () => {
  const { el } = draw({ isToday: false });
  assert.match(textOf(byClass(el, 'dv-side')[0]), /Day by label/);
  assert.equal(key(el, 'prev').getAttribute('aria-label'), 'Previous day, Tue');
  assert.equal(key(el, 'next').getAttribute('aria-label'), 'Next day, Thu');
});

test('item rows in the day are buttons that open the editor; buffers and gaps are not', () => {
  const opened: any[] = [];
  const { el } = draw({}, { open: (item: any) => opened.push([item.kind, item.title]) });
  const buttons = findAll(el, (e: any) => e.tag === 'button' && (e.getAttribute('data-fk') ?? '').startsWith('blk-'));
  assert.ok(buttons.length >= 3);
  buttons.find((b: any) => textOf(b).includes('Private lesson'))!.click();
  assert.deepEqual(opened, [['commitment', 'Private lesson, Anna']]);
  assert.equal(byClass(el, 'dv-buf').length, 1);
  assert.equal(byClass(el, 'dv-buf')[0].tag === 'button', false);
  assert.equal(byClass(el, 'dv-gap').every((g: any) => g.tag !== 'button'), true);
});

test('a low day shows a Light day tag and a normal day does not', () => {
  assert.match(textOf(byClass(draw({ light: true }).el, 'right')[0]), /Light day/);
  assert.doesNotMatch(textOf(byClass(draw({ light: false }).el, 'right')[0]), /Light day/);
});

const dayTile = (b: any) => {
  const { el } = draw({ model: dayModel({ ...structuredClone(example), commitments: [], blocks: [b] }, '2026-10-14') });
  return findAll(el, (e: any) => (e.getAttribute('data-fk') ?? '').startsWith('blk-'))[0] as any;
};

test('a short block shows only its name; its time stays in the tooltip and the screen-reader label', () => {
  const tile = dayTile(block(600, 630, 'Quick call', 'chores'));
  assert.ok(tile.hasClass('one'));
  assert.equal(byClass(tile, 'n').length, 1);
  assert.equal(byClass(tile, 't').length, 0);
  assert.match(tile.getAttribute('title'), /10:00–10:30/);
  assert.match(tile.getAttribute('aria-label'), /10:00–10:30/);
});

test('a tall block shows its name and time with duration and no kind line', () => {
  const tile = dayTile(block(600, 720, 'Chemistry lecture', 'study'));
  assert.ok(tile.hasClass('full'));
  assert.equal(byClass(tile, 'k').length, 0);
  assert.equal(textOf(byClass(tile, 't')[0]), '10:00–12:00 · 120 min');
});

test('a block that was not done still says so on a short tile', () => {
  const tile = dayTile({ ...block(600, 630, 'Quick call', 'chores'), status: 'missed' });
  assert.ok(tile.hasClass('one'));
  assert.equal(byClass(tile, 'tag').length, 1);
});
