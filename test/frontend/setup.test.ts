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
  const estimates: any[] = [];
  const navs: string[] = [];
  let current: any = { state, busy: false, formError: null, status: 'ready', ...opts.storeState };
  const store = {
    saveState: async (next: any) => {
      const payload = typeof next === 'function' ? next(opts.fresh ?? current.state) : next;
      calls.push(payload);
      if (opts.rejectWith) current = { ...current, formError: opts.rejectWith };
      else current = { ...current, state: payload, formError: null };
    },
    estimate: async (body: any) => {
      estimates.push(body);
      if (opts.estimateFails) throw new Error(opts.estimateFails);
      return opts.estimateResult ?? { rule: { minutes: 240, reason: '3 credits at 1h a week each. Hard course (4 of 5): about 4h a week.' }, ai: null, aiStatus: 'unavailable' };
    },
    get: () => current,
  };
  const doc: any = new FakeDocument();
  const dom = createDom(doc);
  const ctl: any = createSetup(dom, { store, getClock: () => ({ today: '2026-10-05', nowMinutes: 540, horizonDays: 14 }), navigate: (h: string) => navs.push(h), keepFocus: (fn: Function) => fn() });
  const render = (kindId: string, param: string | null = null) => ctl.render(kindId, { s: store.get(), route: { id: kindId, param } });
  return { ctl, render, calls, estimates, navs, store, setStore: (patch: any) => { current = { ...current, ...patch }; }, doc };
}
const type = (root: any, key: string, value: string) => { const el = byKey(root, key); el.value = value; el.dispatch('input'); };
const submit = async (root: any) => { byTag(root, 'form')[0].dispatch('submit'); await tick(); };

test('the hero and the sub-navigation point at the six setup screens', () => {
  const { render } = setup();
  const el: any = render('tasks');
  assert.equal(textOf(byTag(el, 'h1')[0]), 'Setup');
  const links = byClass(el, 'sub')[0].children.filter((c: any) => c.tag === 'a');
  assert.deepEqual(links.map((l: any) => textOf(l)), ['Commitments', 'Tasks', 'Due dates', 'Places', 'Commutes', 'Preferences']);
  assert.deepEqual(links.map((l: any) => l.getAttribute('href')), ['#/commitments', '#/tasks', '#/due-dates', '#/places', '#/commutes', '#/preferences']);
  assert.deepEqual(links.map((l: any) => l.getAttribute('aria-current')), [null, 'page', null, null, null, null]);
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
  assert.equal(byKey(el, 'f-title').value, 'Private lesson, Anna');
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
  assert.equal(byKey(el, 'f-title').value, 'Private lesson, Anna');
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
  assert.equal(byKey(back, 'f-title').value, 'Private lesson, Anna');
});

test('deleting asks first, then removes the item and returns to the list', async () => {
  const { render, calls, navs } = setup();
  const el: any = render('commitments', 'lesson-1');
  named(el, 'Delete')!.click();
  assert.equal(calls.length, 0);
  assert.match(textOf(el), /Delete "Private lesson, Anna"\?/);
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

test('a save is built on the freshest server copy, so another tab\'s items survive', async () => {
  const fresh = stateWith({ tasks: [...stateWith().tasks, { id: 'other-tab', title: 'Essay', category: 'study', weeklyMinutes: 60, maxBlock: 60, priority: 3, oneSessionPerDay: false }] });
  const { render, calls } = setup(stateWith(), { fresh });
  const el: any = render('preferences');
  await submit(el);
  assert.ok(calls[0].tasks.some((t: any) => t.id === 'other-tab'));
});

test('a cancelled date that was picked but not added is saved with the item', async () => {
  const { render, calls } = setup();
  const el: any = render('commitments', 'mass');
  type(el, 'f-exceptions', '2026-10-18');
  await submit(el);
  assert.ok(calls[0].commitments.find((c: any) => c.id === 'mass').exceptions.includes('2026-10-18'));
});

test('the sub-navigation lists six screens with Places and Commutes', () => {
  const { render } = setup();
  const el: any = render('places');
  const links = byClass(el, 'sub')[0].children.filter((c: any) => c.tag === 'a');
  assert.deepEqual(links.map((l: any) => textOf(l)), ['Commitments', 'Tasks', 'Due dates', 'Places', 'Commutes', 'Preferences']);
});

test('the places list shows address or "Address missing", and the form edits the place', async () => {
  const { render, calls } = setup();
  const el: any = render('places', 'anna');
  const rows = byClass(el, 'item').map((r: any) => textOf(r));
  assert.ok(rows.some((r: string) => /Anna/.test(r) && /Address missing/.test(r)));
  assert.ok(rows.some((r: string) => /Home/.test(r) && /Calle Ejemplo 123/.test(r)));
  assert.equal(byKey(el, 'f-name').value, 'Anna');
  assert.match(textOf(el), /address missing/i);
  type(el, 'f-address', 'Los Olmos 88');
  await submit(el);
  assert.equal(calls[0].places.find((p: any) => p.id === 'anna').address, 'Los Olmos 88');
});

test('a hostile place name is saved and shown as text, and a second Home is refused in words', async () => {
  const { render, calls } = setup();
  const el: any = render('places', 'new');
  type(el, 'f-name', '<img src=x onerror=alert(1)> C++ (Room [2])');
  await submit(el);
  assert.equal(calls[0].places.at(-1).name, '<img src=x onerror=alert(1)> C++ (Room [2])');
  const again: any = render('places', 'new');
  type(again, 'f-name', 'Second home');
  byKey(again, 'f-kind').value = 'home';
  byKey(again, 'f-kind').dispatch('change');
  await submit(again);
  assert.match(textOf(byClass(again, 'err')[0]), /already a Home/);
  assert.equal(calls.length, 1);
});

test('deleting a place says what goes with it', () => {
  const { render } = setup();
  const el: any = render('places', 'campus');
  byKey(el, 'setup-delete').click();
  assert.match(textOf(byClass(el, 'confirm')[0]), /Delete "Campus"\? Its 1 commute goes too\. 1 commitment loses its place\./);
});

test('deleting a task still says how many due dates go with it', () => {
  const { render } = setup();
  const el: any = render('tasks', 'chem');
  byKey(el, 'setup-delete').click();
  assert.match(textOf(byClass(el, 'confirm')[0]), /Delete "Chemistry"\? Its 1 due date goes too\./);
});

test('a commitment can be given a place', async () => {
  const { render, calls } = setup();
  const el: any = render('commitments', 'lesson-1');
  const select = byKey(el, 'f-placeId');
  assert.ok(select);
  select.value = 'anna';
  select.dispatch('change');
  await submit(el);
  assert.equal(calls[0].commitments.find((c: any) => c.id === 'lesson-1').placeId, 'anna');
});

test('a new commute starts at Home, saves as typed time, and is appended', async () => {
  const { render, calls } = setup();
  const el: any = render('commutes', 'new');
  const chosen = byTag(byKey(el, 'f-fromPlaceId'), 'option').find((o: any) => o.getAttribute('selected') !== null);
  assert.equal(chosen.value, 'home');
  type(el, 'f-minutes', '40');
  type(el, 'f-margin', '5');
  await submit(el);
  const saved = calls[0].commutes.at(-1);
  assert.deepEqual(saved.source, { method: 'typed', minutes: 40 });
  assert.equal(saved.marginMinutes, 5);
  assert.deepEqual(saved.repeats, { kind: 'weekly', weekdays: [1, 2, 3, 4] });
});

test('Google Maps is dimmed until the server says it is ready', () => {
  const off = setup();
  const el: any = off.render('commutes', 'new');
  assert.notEqual(byKey(el, 'f-method-maps').getAttribute('disabled'), null);
  assert.equal(byKey(el, 'f-method-typed').getAttribute('disabled'), null);
  assert.match(textOf(el), /Google Maps is not connected yet/);
  const on = setup(stateWith(), { storeState: { maps: 'ready' } });
  const el2: any = on.render('commutes', 'new');
  assert.equal(byKey(el2, 'f-method-maps').getAttribute('disabled'), null);
  assert.doesNotMatch(textOf(el2), /not connected yet/);
});

test('with fewer than two places the commutes list asks for places first', () => {
  const { render } = setup(stateWith({ places: [], commutes: [] }));
  const el: any = render('commutes');
  assert.match(textOf(el), /Add at least two places first/);
});

test('monthly routes ask for days of the month, and the preview shows minutes plus margin after a redraw', async () => {
  const { render, calls } = setup();
  const el: any = render('commutes', 'new');
  byKey(el, 'f-repeats').value = 'monthly';
  byKey(el, 'f-repeats').dispatch('change');
  const again: any = render('commutes', 'new');
  type(again, 'f-monthDays', '1, 15');
  type(again, 'f-minutes', '45');
  const third: any = render('commutes', 'new');
  assert.match(textOf(third), /Commute 55/);
  await submit(third);
  assert.deepEqual(calls[0].commutes.at(-1).repeats, { kind: 'monthly', monthDays: [1, 15] });
});

test('the travel allowance sits with the other preferences', async () => {
  const { render, calls } = setup();
  const el: any = render('preferences');
  assert.equal(byKey(el, 'f-travelAllowance').value, '30');
  type(el, 'f-travelAllowance', '45');
  await submit(el);
  assert.equal(calls[0].preferences.travelAllowanceMinutes, 45);
});

const studyWith = (over: any = {}) => stateWith({ tasks: stateWith().tasks.map((t: any) => (t.id === 'chem' ? { ...t, ...over } : t)) });

test('the Course details block is only there for study tasks', () => {
  const { render } = setup();
  const study: any = render('tasks', 'chem');
  assert.ok(byKey(study, 'f-credits'));
  assert.ok(byKey(study, 'f-syllabus'));
  assert.ok(byKey(study, 'estimate-run'));
  assert.match(textOf(study), /Course details/);
  const gym: any = render('tasks', 'gym');
  assert.equal(byKey(gym, 'f-credits'), undefined);
  assert.equal(byKey(gym, 'estimate-run'), undefined);
});

test('course details are saved with the task', async () => {
  const { render, calls } = setup();
  const el: any = render('tasks', 'chem');
  type(el, 'f-credits', '3');
  type(el, 'f-syllabus', 'Weekly problem sets.');
  byKey(el, 'f-weeklyGraded-true').click();
  await submit(render('tasks', 'chem'));
  const saved = calls[0].tasks.find((t: any) => t.id === 'chem');
  assert.deepEqual(saved.course, { credits: 3, difficulty: 3, examOnly: false, weeklyGraded: true, lab: false, syllabus: 'Weekly problem sets.' });
});

test('Estimate hours asks the server with the draft and shows the suggestion card', async () => {
  const { render, estimates } = setup();
  let el: any = render('tasks', 'chem');
  type(el, 'f-title', 'Organic chemistry');
  type(el, 'f-credits', '3');
  byKey(el, 'f-weeklyGraded-true').click();
  el = render('tasks', 'chem');
  byKey(el, 'estimate-run').click();
  await tick();
  assert.deepEqual(estimates[0], { title: 'Organic chemistry', credits: 3, difficulty: 3, examOnly: false, weeklyGraded: true, lab: false, syllabus: '' });
  el = render('tasks', 'chem');
  const card = byClass(el, 'est')[0];
  assert.match(textOf(card), /4h a week/);
  assert.match(textOf(card), /3 credits at 1h a week each/);
  assert.match(textOf(card), /Rule of thumb/);
  assert.match(textOf(card), /AI is not connected yet/);
});

test('Use this fills minutes a week and closes the card, Keep mine just closes it', async () => {
  const { render } = setup();
  let el: any = render('tasks', 'chem');
  type(el, 'f-credits', '3');
  byKey(el, 'estimate-run').click();
  await tick();
  el = render('tasks', 'chem');
  byKey(el, 'estimate-use').click();
  el = render('tasks', 'chem');
  assert.equal(byKey(el, 'f-weekly').value, '240');
  assert.equal(byClass(el, 'est').length, 0);
  byKey(el, 'estimate-run').click();
  await tick();
  el = render('tasks', 'chem');
  type(el, 'f-weekly', '500');
  byKey(el, 'estimate-keep').click();
  el = render('tasks', 'chem');
  assert.equal(byKey(el, 'f-weekly').value, '500');
  assert.equal(byClass(el, 'est').length, 0);
});

test('an AI answer is the headline and the rule becomes the second line', async () => {
  const { render } = setup(stateWith(), { estimateResult: { rule: { minutes: 240, reason: 'Rule words.' }, ai: { minutes: 300, reason: 'AI words.' }, aiStatus: 'ready' } });
  let el: any = render('tasks', 'chem');
  type(el, 'f-credits', '3');
  byKey(el, 'estimate-run').click();
  await tick();
  el = render('tasks', 'chem');
  const card = textOf(byClass(el, 'est')[0]);
  assert.match(card, /5h a week/);
  assert.match(card, /AI words\./);
  assert.match(card, /Rule of thumb: 4h a week/);
  assert.doesNotMatch(card, /not connected/);
  byKey(el, 'estimate-use').click();
  assert.equal(byKey(render('tasks', 'chem'), 'f-weekly').value, '300');
});

test('an AI failure still shows the rule with a plain note', async () => {
  const { render } = setup(stateWith(), { estimateResult: { rule: { minutes: 240, reason: 'Rule words.' }, ai: null, aiStatus: 'failed', aiMessage: 'The AI could not answer this time. The rule of thumb is shown.' } });
  let el: any = render('tasks', 'chem');
  type(el, 'f-credits', '3');
  byKey(el, 'estimate-run').click();
  await tick();
  el = render('tasks', 'chem');
  assert.match(textOf(byClass(el, 'est')[0]), /The AI could not answer this time/);
  assert.match(textOf(byClass(el, 'est')[0]), /4h a week/);
});

test('missing credits explain themselves and send nothing; a failing request shows a plain sentence', async () => {
  const { render, estimates } = setup();
  let el: any = render('tasks', 'chem');
  byKey(el, 'estimate-run').click();
  await tick();
  assert.equal(estimates.length, 0);
  assert.match(textOf(render('tasks', 'chem')), /Add the credits first/);
  const failing = setup(stateWith(), { estimateFails: 'request.credits must be a number between 0.5 and 100' });
  el = failing.render('tasks', 'chem');
  type(el, 'f-credits', '3');
  byKey(el, 'estimate-run').click();
  await tick();
  assert.match(textOf(failing.render('tasks', 'chem')), /request\.credits must be a number/);
});

test('the card belongs to the open item and disappears when another is opened', async () => {
  const { render } = setup();
  let el: any = render('tasks', 'chem');
  type(el, 'f-credits', '3');
  byKey(el, 'estimate-run').click();
  await tick();
  assert.equal(byClass(render('tasks', 'chem'), 'est').length, 1);
  render('tasks', 'gym');
  assert.equal(byClass(render('tasks', 'chem'), 'est').length, 0);
});

test('a hostile syllabus is sent as plain text and the form stays intact', async () => {
  const { render, estimates } = setup();
  let el: any = render('tasks', 'chem');
  type(el, 'f-credits', '3');
  type(el, 'f-syllabus', '<img src=x onerror=alert(1)> ‮');
  byKey(el, 'estimate-run').click();
  await tick();
  assert.equal(estimates[0].syllabus, '<img src=x onerror=alert(1)> ‮');
  assert.equal(findAll(render('tasks', 'chem'), (e: any) => e.tag === 'img').length, 0);
});

test('Preferences has the three scale fields', async () => {
  const { render, calls } = setup();
  const el: any = render('preferences');
  assert.equal(byKey(el, 'f-hoursPerCredit').value, '');
  assert.equal(byKey(el, 'f-normalCredits').value, '30');
  assert.equal(byKey(el, 'f-fullLoadHours').value, '40');
  type(el, 'f-hoursPerCredit', '1');
  await submit(el);
  assert.equal(calls[0].preferences.hoursPerCredit, 1);
});

test('a card made for other answers is not offered any more, and Use this refuses to apply it', async () => {
  const { render } = setup();
  let el: any = render('tasks', 'chem');
  type(el, 'f-credits', '3');
  byKey(el, 'estimate-run').click();
  await tick();
  el = render('tasks', 'chem');
  assert.equal(byClass(el, 'est').length, 1);
  type(el, 'f-credits', '6');
  const use = byKey(el, 'estimate-use');
  use.click();
  el = render('tasks', 'chem');
  assert.equal(byKey(el, 'f-weekly').value, '360', 'the old suggestion was not applied');
  assert.equal(byClass(el, 'est').length, 0);
  byKey(el, 'f-lab-true').click();
  type(el, 'f-credits', '3');
  assert.equal(byClass(render('tasks', 'chem'), 'est').length, 0, 'a different set of answers has no card');
});

test('estimate problems look like the form errors, a busy estimate and a long title say so', async () => {
  const { render, estimates } = setup();
  let el: any = render('tasks', 'chem');
  byKey(el, 'estimate-run').click();
  await tick();
  const err = byClass(render('tasks', 'chem'), 'err')[0];
  assert.equal(err.getAttribute('role'), 'alert');
  assert.match(textOf(err), /Add the credits first/);
  el = render('tasks', 'chem');
  type(el, 'f-credits', '3');
  type(el, 'f-title', 'x'.repeat(201));
  byKey(el, 'estimate-run').click();
  await tick();
  assert.equal(estimates.length, 0);
  assert.match(textOf(render('tasks', 'chem')), /title can be at most 200 characters/);
});

test('a second estimate while another is running explains itself', async () => {
  const busy = setup();
  (busy.store as any).estimate = async () => null;
  let el: any = busy.render('tasks', 'chem');
  type(el, 'f-credits', '3');
  byKey(el, 'estimate-run').click();
  await tick();
  assert.match(textOf(busy.render('tasks', 'chem')), /already running/);
});

test('after Use this the keyboard lands on minutes a week, after Keep mine on the Estimate button', async () => {
  const { render, doc } = setup();
  let el: any = render('tasks', 'chem');
  type(el, 'f-credits', '3');
  byKey(el, 'estimate-run').click();
  await tick();
  el = render('tasks', 'chem');
  byKey(el, 'estimate-use').click();
  assert.equal(doc.activeElement, byKey(el, 'f-weekly'));
  byKey(el, 'estimate-run').click();
  await tick();
  byKey(el, 'estimate-keep').click();
  assert.equal(doc.activeElement, byKey(el, 'estimate-run'));
});
