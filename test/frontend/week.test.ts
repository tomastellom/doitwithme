import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDom } from '../../public/js/dom.js';
import { GROUP_IDS, weekModel } from '../../public/js/model.js';
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
const all = new Set(GROUP_IDS);

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
  const visible = over.visible ?? all;
  const el: any = renderWeek(dom, { model: weekModel(s, '2026-10-12', visible, '2026-10-13'), visible, needsYou: over.needsYou ?? 0, isEmpty: over.isEmpty ?? false }, actions);
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
  assert.ok(chem.hasClass('g-study'));
  assert.equal(textOf(byClass(chem, 'k')[0]), 'study');
  assert.ok(byClass(days[2], 'blk')[0].hasClass('g-outline'));
  assert.equal(textOf(byClass(byClass(days[2], 'blk')[0], 'k')[0]), 'project');
  assert.ok(byClass(days[6], 'blk')[0].hasClass('g-fixed'));
  assert.equal(days[1].hasClass('today'), true);
});

test('days with nothing visible show the dashed placeholder', () => {
  const { el } = setup();
  assert.match(textOf(byClass(byClass(el, 'day')[3], 'ghost')[0]), /Nothing planned/);
});

test('the filter list shows counts, toggles groups and reflects pressed state', () => {
  const { el, calls } = setup({ visible: new Set(['study']) });
  const fl = byClass(el, 'fl');
  assert.equal(fl.length, 5);
  const study = fl.find((b) => textOf(b).includes('Study'))!;
  assert.equal(study.getAttribute('aria-pressed'), 'true');
  assert.equal(textOf(byClass(study, 'ct')[0]), '1');
  const gym = fl.find((b) => textOf(b).includes('Gym'))!;
  assert.equal(gym.getAttribute('aria-pressed'), 'false');
  gym.click();
  assert.deepEqual(calls, [['toggle', 'gym']]);
  assert.equal(findAll(el, (e) => e.hasClass('blk') && textOf(e).includes('Gym')).length, 0);
  assert.equal(textOf(byClass(fl.find((b) => textOf(b).includes('Fixed'))!, 'ct')[0]), '1');
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
  assert.equal(byClass(el, 'ghost').length, 7);
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
  const el: any = renderWeek(dom, { model, visible: all, needsYou: 0, isEmpty: false, travelOff: false }, { canAdd: false } as any);
  const entry = byClass(el, 'travel')[0];
  assert.match(textOf(entry), /Commute 55/);
  assert.match(textOf(entry), /09:05–10:00/);
  assert.match(textOf(entry), /estimated/);
  assert.equal(byClass(el, 'travel-off').length, 0);
  const off: any = renderWeek(dom, { model, visible: all, needsYou: 0, isEmpty: false, travelOff: true }, { canAdd: false } as any);
  assert.match(textOf(byClass(off, 'travel-off')[0]), /Travel is off\. Add a Home place\./);
});

test('every item in the week is a button that opens the editor, with a name for screen readers', () => {
  const calls: any[] = [];
  const st = state({ commitments: [{ id: 'm', title: '<img src=x onerror=alert(1)>', category: 'mass', start: 1200, end: 1260, pattern: { kind: 'once', date: '2026-10-12' }, exceptions: [], bufferBefore: 0 }] });
  const travel = [{ date: '2026-10-12', start: 1100, end: 1130, fromName: 'Home', toName: 'Parish', estimated: true, placeId: 'p', commuteId: null }];
  const model = weekModel(st, '2026-10-12', all, '2026-10-12', travel);
  const el: any = renderWeek(dom, { model, visible: all, needsYou: 0, isEmpty: false, travelOff: false }, { open: (item: any) => calls.push([item.kind, item.title]), canAdd: false } as any);
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
