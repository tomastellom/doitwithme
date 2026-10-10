import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDom } from '../../public/js/dom.js';
import { weekModel } from '../../public/js/model.js';
import { renderWeek } from '../../public/js/week.js';
import { FakeDocument, byClass, byTag, findAll, textOf } from './fakedom.ts';

const dom = createDom(new FakeDocument() as any);
const block = (date: string, start: number, end: number, title: string, category: string) => ({ taskId: title, title, category, date, start, end });
const state = (over: any = {}) => ({
  commitments: [{ id: 'm', title: 'Mass', category: 'mass', start: 1200, end: 1260, pattern: { kind: 'once', date: '2026-10-18' }, exceptions: [], bufferBefore: 30 }],
  tasks: [], deadlines: [], blocks: [
    block('2026-10-12', 480, 535, 'Chemistry', 'study'),
    block('2026-10-13', 765, 825, 'Gym', 'gym'),
    block('2026-10-14', 585, 620, 'Side project', 'personal project'),
    block('2026-10-12', 635, 665, 'Laundry', 'chores'),
  ], ...over,
});
const all = new Set<string>();

function setup(over: any = {}, actionOver: any = {}) {
  const calls: any[] = [];
  const actions = {
    toggleGroup: (id: string) => calls.push(['toggle', id]),
    go: (n: number) => calls.push(['go', n]),
    today: () => calls.push(['today']),
    loadExample: () => calls.push(['example']),
    focusNudge: () => calls.push(['nudge']),
    canAdd: false,
    ...actionOver,
  };
  const s = over.state ?? state();
  const hidden = over.hidden ?? all;
  const el: any = renderWeek(dom, { model: weekModel(s, '2026-10-12', hidden, '2026-10-13'), hidden, needsYou: over.needsYou ?? 0, isEmpty: over.isEmpty ?? false, hours: over.hours, nowMinutes: over.nowMinutes }, actions);
  return { el, calls };
}

test('the hero shows the ISO week, the range and the weekly status', () => {
  const { el } = setup({ needsYou: 2 });
  assert.equal(textOf(byTag(el, 'h1')[0]), '12–18 Oct');
  assert.match(textOf(byClass(el, 'meta')[0]), /Week 42 \/ 2026/);
  assert.match(textOf(el), /7 days/);
  assert.match(textOf(el), /2 need you/);
  assert.equal(setup({ needsYou: 1 }).el.textContent.includes('1 needs you'), true);
  assert.match(textOf(setup({ needsYou: 0 }).el), /All clear/);
});

test('seven day columns with weekday, number, booked time and blocks in the board format', () => {
  const { el } = setup();
  const days = byClass(el, 'day');
  assert.equal(days.length, 7);
  const mon = days[0];
  assert.match(textOf(mon), /Mon/);
  assert.match(textOf(mon), /12/);
  assert.match(textOf(mon), /Booked 1h25/);
  assert.match(textOf(mon), /08:00–08:55/);
  assert.match(textOf(mon), /Chemistry/);
  const chem = byClass(mon, 'blk').find((b) => textOf(b).includes('Chemistry'))!;
  assert.ok(chem.hasClass('is-fill'));
  assert.equal(chem.style.background, '#FF4B1F', 'filled with the label color');
  assert.equal(chem.style.color, '#111111', 'with readable text');
  assert.match(chem.getAttribute('aria-label'), /Study/);
  const project = byClass(days[2], 'blk')[0];
  assert.ok(project.hasClass('is-outline'));
  assert.equal(project.style.borderColor, '#111111');
  assert.match(project.getAttribute('aria-label'), /Personal project/);
  const mass = byClass(days[6], 'blk')[0];
  assert.ok(mass.hasClass('is-fill'));
  assert.equal(mass.style.background, '#111111');
  assert.equal(mass.style.color, '#FFFFFF');
  assert.equal(days[1].hasClass('today'), true);
});

test('a day with nothing visible is simply empty hours on the grid', () => {
  const { el } = setup();
  const thu = byClass(el, 'day')[3];
  assert.equal(byClass(thu, 'blk').length, 0);
  assert.equal(byClass(thu, 'cbody').length, 1);
});

test('the filter list shows each label in use with its count, toggles it and reflects pressed state', () => {
  const { el, calls } = setup({ hidden: new Set(['gym', 'mass', 'chores', 'personal project']) });
  const fl = byClass(el, 'fl');
  assert.equal(fl.length, 5, 'Study, Gym, Chores, Personal project and Mass: only labels in use');
  const study = fl.find((b) => textOf(b).includes('Study'))!;
  assert.equal(study.getAttribute('aria-pressed'), 'true');
  assert.equal(textOf(byClass(study, 'ct')[0]), '1');
  const gym = fl.find((b) => textOf(b).includes('Gym'))!;
  assert.equal(gym.getAttribute('aria-pressed'), 'false');
  gym.click();
  assert.deepEqual(calls, [['toggle', 'gym']]);
  assert.equal(findAll(el, (e) => e.hasClass('blk') && textOf(e).includes('Gym')).length, 0);
  assert.equal(textOf(byClass(fl.find((b) => textOf(b).includes('Mass'))!, 'ct')[0]), '1');
  assert.ok(byClass(el, 'fl-all').length === 1, 'Show all is offered while something is hidden');
});

test('week navigation buttons call the actions and the needs-you button focuses Nudge', () => {
  const { el, calls } = setup({ needsYou: 1 });
  const named = (label: string) => byTag(el, 'button').find((b) => b.getAttribute('aria-label') === label || textOf(b).trim() === label)!;
  named('Previous week').click();
  named('Today').click();
  named('Next week').click();
  byClass(el, 'needs')[0].click();
  assert.deepEqual(calls, [['go', -1], ['today'], ['go', 1], ['nudge']]);
});

test('hostile titles render as text and create no elements', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const { el } = setup({ state: state({ blocks: [block('2026-10-12', 480, 540, evil, evil)] }) });
  assert.match(textOf(el), /<img src=x onerror=alert\(1\)>/);
  assert.equal(findAll(el, (e) => e.tag === 'img').length, 0);
});

test('first run: lead text, Load the example, no filters or booked lines', () => {
  const { el, calls } = setup({ isEmpty: true, state: state({ blocks: [], commitments: [] }) });
  assert.match(textOf(el), /Nothing planned yet\. Start with what is fixed: classes, work, lessons\. I plan everything else around it\./);
  assert.equal(byClass(el, 'fl').length, 0);
  assert.doesNotMatch(textOf(el), /Booked/);
  assert.equal(byClass(el, 'cbody').length, 7);
  byTag(el, 'button').find((b) => textOf(b).trim() === 'Load the example')!.click();
  assert.deepEqual(calls, [['example']]);
  assert.equal(byTag(el, 'a').filter((a: any) => !a.hasClass('dh')).length, 0, 'only the day headers are links');
});

test('first run offers Add a commitment only when the setup section exists', () => {
  const { el } = setup({ isEmpty: true, state: state({ blocks: [], commitments: [] }) }, { canAdd: true });
  const link = byTag(el, 'a')[0];
  assert.equal(textOf(link).trim(), 'Add a commitment');
  assert.equal(link.getAttribute('href'), '#/commitments/new');
});

test('the week header takes focus and the arrow keys change week', () => {
  const { el, calls } = setup();
  const h1 = byTag(el, 'h1')[0];
  assert.equal(h1.getAttribute('tabindex'), '0');
  assert.equal(h1.getAttribute('data-fk'), 'week-header');
  h1.dispatch('keydown', { key: 'ArrowRight' });
  h1.dispatch('keydown', { key: 'ArrowLeft' });
  const other = h1.dispatch('keydown', { key: 'a' });
  assert.deepEqual(calls, [['go', 1], ['go', -1]]);
  assert.equal(other.defaultPrevented, false);
});

test('controls carry stable focus keys', () => {
  const { el } = setup({ needsYou: 1 });
  const keys = byTag(el, 'button').map((b) => b.getAttribute('data-fk'));
  for (const k of ['prev', 'today', 'next', 'needs', 'fl-study', 'fl-gym']) assert.ok(keys.includes(k), k);
});

test('a commute is a hatched entry with its length, and the week says when travel is off', () => {
  const travel = [{ date: '2026-10-13', start: 545, end: 600, fromName: 'Home', toName: 'Campus', estimated: true }];
  const model = weekModel(state(), '2026-10-12', all, '2026-10-12', travel);
  const el: any = renderWeek(dom, { model, hidden: all, needsYou: 0, isEmpty: false, travelOff: false }, { canAdd: false } as any);
  const entry = byClass(el, 'travel')[0];
  assert.match(textOf(entry), /Commute 55/);
  assert.match(textOf(entry), /09:05–10:00/);
  assert.match(entry.getAttribute('aria-label'), /estimated/);
  assert.equal(byClass(el, 'travel-off').length, 0);
  const off: any = renderWeek(dom, { model, hidden: all, needsYou: 0, isEmpty: false, travelOff: true }, { canAdd: false } as any);
  assert.match(textOf(byClass(off, 'travel-off')[0]), /Travel is off\. Add a Home place\./);
});

test('every item in the week is a button that opens the editor, with a name for screen readers', () => {
  const calls: any[] = [];
  const st = state({ commitments: [{ id: 'm', title: '<img src=x onerror=alert(1)>', category: 'mass', start: 1200, end: 1260, pattern: { kind: 'once', date: '2026-10-12' }, exceptions: [], bufferBefore: 0 }] });
  const travel = [{ date: '2026-10-12', start: 1100, end: 1130, fromName: 'Home', toName: 'Parish', estimated: true, placeId: 'p', commuteId: null }];
  const model = weekModel(st, '2026-10-12', all, '2026-10-12', travel);
  const el: any = renderWeek(dom, { model, hidden: all, needsYou: 0, isEmpty: false, travelOff: false }, { open: (item: any) => calls.push([item.kind, item.title]), canAdd: false } as any);
  const items = findAll(el, (e: any) => e.tag === 'button' && (e.getAttribute('data-fk') ?? '').startsWith('blk-'));
  assert.ok(items.length >= 6);
  for (const b of items) {
    assert.equal(b.getAttribute('type'), 'button');
    assert.match(b.getAttribute('aria-label'), /Opens the editor\.$/);
  }
  const mass = items.find((b: any) => b.getAttribute('aria-label').includes('<img'));
  mass.click();
  assert.deepEqual(calls, [['commitment', '<img src=x onerror=alert(1)>']]);
  assert.equal(findAll(el, (e: any) => e.tag === 'img').length, 0);
  const trip = items.find((b: any) => b.hasClass('travel'));
  trip.click();
  assert.equal(calls[1][0], 'travel');
  assert.equal(new Set(items.map((b: any) => b.getAttribute('data-fk'))).size, items.length, 'keys are unique');
});

test('each day header opens that day', () => {
  const { el } = setup();
  const heads = byClass(el, 'dh');
  assert.equal(heads.length, 7);
  assert.deepEqual(heads.map((h: any) => [h.tag, h.getAttribute('href')]).slice(0, 2), [['a', '#/day/2026-10-12'], ['a', '#/day/2026-10-13']]);
  assert.match(heads[1].getAttribute('aria-label'), /Open Tue 13/);
});

test('tiles sit at their real time: an hour axis, heights from lengths, and the text shrinks to fit', () => {
  const lecture = { id: 'l', title: 'Chemistry lecture', category: 'class', start: 600, end: 720, pattern: { kind: 'once', date: '2026-10-13' }, exceptions: [], bufferBefore: 0 };
  const quick = block('2026-10-13', 540, 570, 'Email', 'chores');
  const s = state({ commitments: [lecture], blocks: [quick] });
  const { el } = setup({ state: s });
  const axis = byClass(el, 'axis')[0];
  assert.equal(byClass(axis, 'mono').length, 16, '07:00 to 22:00, one label an hour');
  assert.equal(textOf(byClass(axis, 'mono')[0]), '07:00');
  const tue = byClass(el, 'day')[1];
  const tiles = byClass(tue, 'blk');
  const long = tiles.find((t: any) => textOf(t).includes('lecture'))!;
  const short = tiles.find((t: any) => textOf(t).includes('Email'))!;
  assert.equal(long.style.top, `${(600 - 420) * 56 / 60}px`);
  assert.equal(long.style.height, `${120 * 56 / 60 - 2}px`);
  assert.ok(long.hasClass('full') && byClass(long, 'k').length === 1, 'a long tile has room for its label');
  assert.ok(short.hasClass('one') && byClass(short, 'k').length === 0, 'a short tile keeps just the name and the start');
  assert.equal(textOf(byClass(short, 'n')[0]), 'Email');
  assert.match(short.getAttribute('title'), /Email, 09:00–09:30/);
  assert.equal(byClass(tue, 'cbody')[0].style.height, `${15 * 56}px`);
});

test('the chosen hours decide the axis, and a tile outside them stretches it so nothing is hidden', () => {
  const { el } = setup({ hours: { from: 9, to: 13 } });
  const labels = byClass(byClass(el, 'axis')[0], 'mono').map(textOf);
  assert.equal(labels[0], '08:00', 'the 08:00 chemistry block is before 09:00');
  assert.equal(labels.at(-1), '21:00', 'Mass runs to 21:00');
});

test('overlapping tiles share the width instead of covering each other', () => {
  const s = state({ blocks: [block('2026-10-13', 600, 660, 'A', 'study'), block('2026-10-13', 630, 690, 'B', 'gym')] });
  const { el } = setup({ state: s });
  const [a, b] = byClass(byClass(el, 'day')[1], 'blk').filter((t: any) => /^(A|B)/.test(textOf(t).trim().replace(/^[a-z]+/, '')) || true).slice(-2);
  assert.equal(a.style.width, '50%');
  assert.equal(b.style.width, '50%');
  assert.notEqual(a.style.left, b.style.left);
});

test('today shows a now line only when the time is inside the hours', () => {
  const inside = setup({ nowMinutes: 11 * 60 + 20 });
  assert.equal(byClass(byClass(inside.el, 'day')[1], 'now').length, 1);
  assert.equal(byClass(byClass(inside.el, 'day')[0], 'now').length, 0);
  const outside = setup({ nowMinutes: 3 * 60 });
  assert.equal(byClass(outside.el, 'now').length, 0);
});

test('clicking empty space on a day offers to add something at that time, snapped to a quarter hour', () => {
  const adds: any[] = [];
  const { el } = setup({}, { add: (date: string, start: number) => adds.push([date, start]) });
  const thu = byClass(el, 'day')[3];
  const body = byClass(thu, 'cbody')[0];
  body.dispatch('click', { target: body, clientY: 2 * 56 + 20 });
  assert.deepEqual(adds, [['2026-10-15', 9 * 60 + 15]], 'two hours and twenty minutes after 07:00 is 09:20, snapped down to 09:15');
  const tile = byClass(byClass(el, 'day')[0], 'blk')[0];
  const before = adds.length;
  byClass(byClass(el, 'day')[0], 'cbody')[0].dispatch('click', { target: tile, clientY: 5 });
  assert.equal(adds.length, before, 'a click that lands on a tile is for the tile');
});

test('the hero has a plain Add button for keyboard users, defaulting to today when it is in view', () => {
  const adds: any[] = [];
  const { el } = setup({}, { add: (date: string, start: number) => adds.push([date, start]) });
  const add = findAll(el, (e: any) => e.getAttribute('data-fk') === 'add')[0];
  assert.match(textOf(add), /\+ Add/);
  add.click();
  assert.deepEqual(adds, [['2026-10-13', 9 * 60]]);
});

test('every planned tile has its own tick box that marks it done, and trips have none', () => {
  const ticks: any[] = [];
  const travel = [{ date: '2026-10-13', start: 545, end: 600, fromName: 'Home', toName: 'Campus', estimated: false }];
  const s = state();
  const model = weekModel(s, '2026-10-12', all, '2026-10-13', travel);
  const el: any = renderWeek(dom, { model, hidden: all, needsYou: 0, isEmpty: false }, { tick: (i: any) => ticks.push(i.title), canAdd: false } as any);
  const tiles = byClass(el, 'blk').filter((b: any) => !b.hasClass('travel'));
  const boxes = byClass(el, 'tick');
  assert.equal(boxes.length, tiles.length, 'one per planned tile, none for the trip');
  const chem = boxes.find((b: any) => b.getAttribute('aria-label') === 'Mark Chemistry as done')!;
  assert.equal(chem.tag, 'button');
  assert.equal(chem.getAttribute('aria-pressed'), 'false');
  chem.click();
  assert.deepEqual(ticks, ['Chemistry']);
  assert.ok(tiles.every((t: any) => byTag(t, 'button').length === 1), 'a tile holds no other button, its tick box is a neighbour');
  assert.ok(tiles[0].hasClass('has-tick'), 'the tile leaves room for its box');
});

test('a done tile is faded with its box ticked; a not-done tile is dashed with a tag and keeps its place', () => {
  const s = state({ blocks: [
    { ...block('2026-10-12', 480, 535, 'Chemistry', 'study'), status: 'done' },
    { ...block('2026-10-12', 600, 655, 'Gym', 'gym'), status: 'missed' },
    { ...block('2026-10-12', 700, 755, 'Laundry', 'chores'), status: 'waived' },
  ] });
  const model = weekModel(s, '2026-10-12', all, '2026-10-13');
  const el: any = renderWeek(dom, { model, hidden: all, needsYou: 0, isEmpty: false }, { tick: () => {}, canAdd: false } as any);
  const mon = byClass(el, 'day')[0];
  const find = (name: string) => byClass(mon, 'blk').find((b: any) => textOf(b).includes(name))!;
  assert.ok(find('Chemistry').hasClass('is-done'));
  assert.equal(find('Chemistry').style.background, '#FFBBAA', 'a done tile is its own color washed pale and solid, so the hour lines never show through');
  assert.equal(find('Chemistry').style.color, '#2B2E31');
  assert.match(find('Chemistry').getAttribute('aria-label'), /done/);
  const done = byClass(mon, 'tick').find((b: any) => b.getAttribute('aria-pressed') === 'true')!;
  assert.match(done.getAttribute('aria-label'), /Chemistry is done/);
  assert.ok(find('Gym').hasClass('is-missed'));
  assert.equal(find('Gym').style.background, undefined, 'it is drawn dashed on paper instead of filled');
  assert.equal(textOf(byClass(find('Gym'), 'tag')[0]), 'Not done');
  assert.equal(textOf(byClass(find('Laundry'), 'tag')[0]), 'Taken off');
  assert.match(find('Gym').getAttribute('aria-label'), /not done/);
  assert.equal(find('Gym').style.top, find('Gym').style.top, 'still at its time');
});

test('a very short tile and the one after it never draw on top of each other', () => {
  const s = state({ blocks: [block('2026-10-13', 790, 795, 'Quick', 'study'), block('2026-10-13', 805, 835, 'Laundry', 'chores')] });
  const { el } = setup({ state: s });
  const tiles = byClass(byClass(el, 'day')[1], 'blk').filter((t: any) => /Quick|Laundry/.test(textOf(t)));
  assert.equal(tiles.length, 2);
  assert.ok(tiles.every((t: any) => t.style.width === '50%'), 'the 5 minute tile is drawn 30 px tall, so they share the width');
});
