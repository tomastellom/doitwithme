import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDom } from '../../public/js/dom.js';
import { FIELDS, createSetup } from '../../public/js/setup.js';
import { FakeDocument, byClass, byTag, findAll, textOf } from './fakedom.ts';

const example = JSON.parse(readFileSync('examples/sample-state.json', 'utf8'));
const stateWith = (over: any = {}) => ({ ...structuredClone(example), blocks: [{ taskId: 'chem', title: 'Chemistry', category: 'study', date: '2026-10-05', start: 480, end: 540 }], approvedSoft: ['2026-10-09'], dismissed: [], ...over });
const tick = () => new Promise((r) => setTimeout(r, 0));
const byKey = (root: any, key: string) => findAll(root, (e) => e.getAttribute('data-fk') === key)[0];
const named = (root: any, text: string) => byTag(root, 'button').find((b: any) => textOf(b).trim() === text);

function setup(state: any = stateWith(), opts: any = {}) {
  const calls: any[] = [];
  const navs: string[] = [];
  let current: any = { state, busy: false, formError: null, status: 'ready', ...opts.storeState };
  const store = {
    saveState: async (next: any) => {
      calls.push(next);
      if (opts.rejectWith) current = { ...current, formError: opts.rejectWith };
      else current = { ...current, state: next, formError: null };
    },
    get: () => current,
  };
  const doc: any = new FakeDocument();
  const dom = createDom(doc);
  const ctl: any = createSetup(dom, { store, getClock: () => ({ today: '2026-10-05', nowMinutes: 540, horizonDays: 14 }), navigate: (h: string) => navs.push(h), keepFocus: (fn: Function) => fn() });
  const render = (kindId: string, param: string | null = null) => ctl.render(kindId, { s: store.get(), route: { id: kindId, param } });
  return { ctl, render, calls, navs, store, setStore: (patch: any) => { current = { ...current, ...patch }; }, doc };
}
const type = (root: any, key: string, value: string) => { const el = byKey(root, key); el.value = value; el.dispatch('input'); };
const submit = async (root: any) => { byTag(root, 'form')[0].dispatch('submit'); await tick(); };

test('the hero and the sub-navigation point at the four setup screens', () => {
  const { render } = setup();
  const el: any = render('tasks');
  assert.equal(textOf(byTag(el, 'h1')[0]), 'Setup');
  const links = byClass(el, 'sub')[0].children.filter((c: any) => c.tag === 'a');
  assert.deepEqual(links.map((l: any) => textOf(l)), ['Commitments', 'Tasks', 'Due dates', 'Preferences']);
  assert.deepEqual(links.map((l: any) => l.getAttribute('href')), ['#/commitments', '#/tasks', '#/due-dates', '#/preferences']);
  assert.deepEqual(links.map((l: any) => l.getAttribute('aria-current')), [null, 'page', null, null]);
});

test('the list shows title, label and summary like board H, and marks the selected item', () => {
  const { render } = setup();
  const el: any = render('commitments', 'lesson-1');
  const items = byClass(el, 'item');
  assert.equal(items.length, 3);
  assert.match(textOf(items[0]), /Mass/);
  assert.match(textOf(items[1]), /Chemistry lecture/);
  assert.match(textOf(items[1]), /Tue, Thu \/ 10:00–12:00 \/ 1 Sep – 18 Dec \/ buffer 30 min/);
  const lesson = items.find((i: any) => textOf(i).includes('Private lesson'))!;
  assert.ok(lesson.hasClass('on'));
  assert.equal(lesson.getAttribute('aria-current'), 'true');
  assert.equal(lesson.getAttribute('href'), '#/commitments/lesson-1');
  assert.equal(items.filter((i: any) => i.hasClass('on')).length, 1);
  const add = byClass(el, 'add')[0];
  assert.equal(textOf(add), 'Add a commitment');
  assert.equal(add.getAttribute('href'), '#/commitments/new');
});

test('with nothing selected the form column says what to do, and an empty list says so', () => {
  const { render } = setup();
  assert.match(textOf(render('commitments')), /Pick one from the list, or add a new one\./);
  const empty = setup(stateWith({ commitments: [] }));
  assert.match(textOf(empty.render('commitments')), /Nothing here yet\./);
  assert.match(textOf(setup().render('commitments', 'no-such-id')), /Pick one from the list/);
});

test('selecting an item fills the form with its values', () => {
  const { render } = setup();
  const el: any = render('commitments', 'lesson-1');
  assert.equal(byKey(el, 'f-title').value, 'Private lesson');
  assert.equal(byKey(el, 'f-start').value, '16:00');
  assert.equal(byKey(el, 'f-end').value, '17:00');
  assert.equal(byKey(el, 'f-buffer').value, '30');
  assert.equal(byKey(el, 'f-from').value, '2026-09-01');
  assert.equal(byKey(el, 'f-repeats-weekly').getAttribute('aria-pressed'), 'true');
  assert.equal(byKey(el, 'f-weekdays-3').getAttribute('aria-pressed'), 'true');
  assert.equal(byClass(el, 'err').length, 0);
});

test('editing a field and pressing Save sends the whole state with only that item changed', async () => {
  const { render, calls, navs } = setup();
  const el: any = render('commitments', 'lesson-1');
  type(el, 'f-title', 'Piano lesson');
  await submit(el);
  assert.equal(calls.length, 1);
  const next = calls[0];
  assert.equal(next.commitments.find((c: any) => c.id === 'lesson-1').title, 'Piano lesson');
  assert.equal(next.commitments.length, 3);
  assert.deepEqual(next.blocks, stateWith().blocks);
  assert.deepEqual(next.approvedSoft, ['2026-10-09']);
  assert.deepEqual(next.tasks, stateWith().tasks);
  assert.deepEqual(navs, ['#/commitments/lesson-1']);
});

test('a client-side mistake is explained and nothing is sent', async () => {
  const { render, calls, navs } = setup();
  const el: any = render('commitments', 'lesson-1');
  type(el, 'f-end', '15:30');
  await submit(el);
  assert.equal(calls.length, 0);
  assert.deepEqual(navs, []);
  const err = byClass(el, 'err')[0];
  assert.equal(err.getAttribute('role'), 'alert');
  assert.match(textOf(err), /Nothing was saved\./);
  assert.match(textOf(err), /End time must be after the start time\./);
  assert.equal(byKey(el, 'f-end').value, '15:30');
});

test('a server rejection keeps the draft and shows the server words after the screen redraws', async () => {
  const { render, calls, setStore } = setup(stateWith(), { rejectWith: 'tasks[0].maxBlock must be a number between 5 and 1440' });
  let el: any = render('tasks', 'chem');
  type(el, 'f-title', 'Organic chemistry');
  await submit(el);
  assert.equal(calls.length, 1);
  el = render('tasks', 'chem');
  assert.match(textOf(byClass(el, 'err')[0]), /tasks\[0\]\.maxBlock must be a number between 5 and 1440/);
  assert.equal(byKey(el, 'f-title').value, 'Organic chemistry');
  const other: any = render('tasks', 'gym');
  assert.equal(byClass(other, 'err').length, 0);
  setStore({ formError: null });
});

test('a new commitment gets a fresh id, is appended, and the screen moves to it', async () => {
  const { render, calls, navs } = setup();
  const el: any = render('commitments', 'new');
  assert.equal(byKey(el, 'f-title').value, '');
  type(el, 'f-title', 'Choir');
  await submit(el);
  const next = calls[0];
  assert.equal(next.commitments.length, 4);
  const added = next.commitments[3];
  assert.equal(added.title, 'Choir');
  assert.ok(added.id.startsWith('c-'));
  assert.equal(added.pattern.kind, 'weekly');
  assert.deepEqual(navs, [`#/commitments/${added.id}`]);
  assert.equal(example.commitments.some((c: any) => c.id === added.id), false);
});

test('switching Repeats to Once swaps the weekday fields for a date, and toggling a weekday redraws', () => {
  const { render } = setup();
  const el: any = render('commitments', 'lesson-1');
  assert.ok(byKey(el, 'f-weekdays-3'));
  assert.equal(byKey(el, 'f-date'), undefined);
  byKey(el, 'f-repeats-once').click();
  assert.equal(byKey(el, 'f-weekdays-3'), undefined);
  assert.ok(byKey(el, 'f-date'));
  assert.equal(byKey(el, 'f-repeats-once').getAttribute('aria-pressed'), 'true');
});

test('Discard changes puts the saved values back', () => {
  const { render } = setup();
  const el: any = render('commitments', 'lesson-1');
  type(el, 'f-title', 'Changed my mind');
  named(el, 'Discard changes')!.click();
  assert.equal(byKey(el, 'f-title').value, 'Private lesson');
});

test('typing survives a redraw of the same item, and opening another item starts fresh', () => {
  const { render } = setup();
  const first: any = render('commitments', 'lesson-1');
  type(first, 'f-title', 'Half typed');
  const again: any = render('commitments', 'lesson-1');
  assert.equal(byKey(again, 'f-title').value, 'Half typed');
  const other: any = render('commitments', 'mass');
  assert.equal(byKey(other, 'f-title').value, 'Mass');
  const back: any = render('commitments', 'lesson-1');
  assert.equal(byKey(back, 'f-title').value, 'Private lesson');
});

test('deleting asks first, then removes the item and returns to the list', async () => {
  const { render, calls, navs } = setup();
  const el: any = render('commitments', 'lesson-1');
  named(el, 'Delete')!.click();
  assert.equal(calls.length, 0);
  assert.match(textOf(el), /Delete "Private lesson"\?/);
  named(el, 'Keep it')!.click();
  assert.equal(named(el, 'Delete') !== undefined, true);
  named(el, 'Delete')!.click();
  named(el, 'Yes, delete')!.click();
  await tick();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].commitments.some((c: any) => c.id === 'lesson-1'), false);
  assert.equal(calls[0].commitments.length, 2);
  assert.deepEqual(navs, ['#/commitments']);
});

test('deleting a task says its due dates go too, and sends the state without them', async () => {
  const { render, calls } = setup();
  const el: any = render('tasks', 'chem');
  named(el, 'Delete')!.click();
  assert.match(textOf(el), /Delete "Chemistry"\? Its 1 due date goes too\./);
  named(el, 'Yes, delete')!.click();
  await tick();
  assert.equal(calls[0].tasks.some((t: any) => t.id === 'chem'), false);
  assert.equal(calls[0].deadlines.length, 0);
  assert.deepEqual(calls[0].blocks, stateWith().blocks);
});

test('a new item has no Delete button, and preferences has no list and no Delete', () => {
  const { render } = setup();
  assert.equal(named(render('commitments', 'new'), 'Delete'), undefined);
  const prefs: any = render('preferences');
  assert.equal(byClass(prefs, 'item').length, 0);
  assert.equal(named(prefs, 'Delete'), undefined);
  assert.equal(byClass(prefs, 'add').length, 0);
  assert.equal(byKey(prefs, 'f-weekdayStart').value, '08:00');
});

test('saving preferences changes only the preferences and keeps softMode', async () => {
  const state = stateWith({ preferences: { ...example.preferences, softMode: 'auto' } });
  const { render, calls, navs } = setup(state);
  const el: any = render('preferences');
  type(el, 'f-minBlock', '45');
  await submit(el);
  assert.equal(calls[0].preferences.minBlock, 45);
  assert.equal(calls[0].preferences.softMode, 'auto');
  assert.deepEqual(calls[0].tasks, state.tasks);
  assert.deepEqual(navs, ['#/preferences']);
});

test('due dates pick from the tasks and list their summary', async () => {
  const { render, calls } = setup();
  const el: any = render('due-dates', 'chem-exam');
  assert.match(textOf(byClass(el, 'item')[0]), /Chemistry exam/);
  assert.match(textOf(byClass(el, 'item')[0]), /Chemistry \/ due Fri 23 Oct \/ 480 min/);
  assert.deepEqual(byTag(byKey(el, 'f-taskId'), 'option').map(textOf), ['Chemistry', 'Gym', 'Laundry', 'Side project']);
  type(el, 'f-effort', '600');
  await submit(el);
  assert.equal(calls[0].deadlines[0].effortMinutes, 600);
});

test('Save is disabled while a request runs', () => {
  const { render } = setup(stateWith(), { storeState: { busy: true } });
  const el: any = render('commitments', 'lesson-1');
  assert.equal(byTag(el, 'button').find((b: any) => textOf(b).trim() === 'Save')!.hasAttribute('disabled'), true);
});

test('hostile titles show as text in the list and as values in the form, never as elements', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const state = stateWith({ commitments: [{ ...example.commitments[0], id: 'evil', title: evil }] });
  const { render } = setup(state);
  const el: any = render('commitments', 'evil');
  assert.match(textOf(byClass(el, 'item')[0]), /<img src=x onerror=alert\(1\)>/);
  assert.equal(byKey(el, 'f-title').value, evil);
  assert.equal(findAll(el, (e) => e.tag === 'img').length, 0);
});

test('every kind has fields, and the field names are unique within a kind', () => {
  for (const [kind, fields] of Object.entries(FIELDS) as any) {
    assert.ok(fields.length > 0, kind);
    assert.equal(new Set(fields.map((f: any) => f.name)).size, fields.length, kind);
  }
});
