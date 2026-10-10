import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDom } from '../../public/js/dom.js';
import { dayModel } from '../../public/js/day-model.js';
import { renderDay } from '../../public/js/day.js';
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
  const meta = textOf(byClass(el, 'meta')[0]);
  assert.match(meta, /Week 42 \/ 14 Oct 2026/);
  assert.match(meta, /Booked 2h25/);
  assert.match(meta, /All clear/);
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
  assert.match(text, /08:00–08:50/);
  assert.match(text, /50 min/);
  assert.match(text, /Free 10:20–15:30 \/ 5h10/);
  assert.match(text, /Buffer before Private lesson, Anna/);
  assert.match(text, /Travel and setup/);
  assert.equal(byClass(el, 'dv-buf').length, 1);
  assert.ok(byClass(el, 'dv-blk').some((b: any) => b.style.background === '#FF4B1F'), 'the study block is painted in the Study color');
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
  assert.match(textOf(byClass(el, 'meta')[0]), /2 need you/);
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
