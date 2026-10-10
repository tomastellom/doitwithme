import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDom } from '../../public/js/dom.js';
import { createDrawer } from '../../public/js/drawer.js';
import { createMarks } from '../../public/js/marks.js';
import { dayItems } from '../../public/js/model.js';
import { FakeDocument, byClass, byTag, findAll, textOf } from './fakedom.ts';

const example = JSON.parse(readFileSync('examples/sample-state.json', 'utf8'));
const tick = () => new Promise((r) => setTimeout(r, 0));
const key = (root: any, k: string) => findAll(root, (e) => e.getAttribute('data-fk') === k)[0];
const type = (root: any, k: string, v: string) => { const el = key(root, k); el.value = v; el.dispatch('input'); };

function rig(state: any = structuredClone(example), opts: any = {}) {
  const saves: any[] = [];
  const navs: string[] = [];
  const focused: string[] = [];
  const cheers: any[] = [];
  let current: any = { state, busy: false, formError: null, status: 'ready' };
  const store: any = {
    get: () => current,
    saveState: async (fn: any) => {
      const next = fn(opts.fresh ?? current.state);
      saves.push(next);
      if (opts.reject) current = { ...current, formError: opts.reject };
      else current = { ...current, state: next, formError: null };
    },
    cheer: (c: any) => cheers.push(c),
  };
  const dom = createDom(new FakeDocument() as any);
  const drawer: any = createDrawer(dom, { store, marks: createMarks(store, { pick: () => 0 }), navigate: (h: string) => navs.push(h), focusKey: (k: string) => focused.push(k) });
  const itemOf = (kind: string, date: string, match: (i: any) => boolean) => dayItems(current.state, date, opts.travel ?? []).find((i: any) => i.kind === kind && match(i));
  return { drawer, saves, navs, focused, cheers, store, itemOf, setState: (s: any) => { current = { ...current, state: s }; } };
}
// 2026-10-13 is a Tuesday: the chemistry lecture (Tue and Thu, 10:00-12:00) is on it.
const TUE = '2026-10-13';

test('closed by default, open on an item, named for screen readers, closes on Esc and the Close button', () => {
  const { drawer, itemOf, focused } = rig();
  assert.equal(drawer.isOpen(), false);
  assert.equal(drawer.el.getAttribute('hidden'), '');
  drawer.open(itemOf('commitment', TUE, (i) => i.commitmentId === 'chem-lecture'));
  assert.equal(drawer.isOpen(), true);
  assert.equal(drawer.el.getAttribute('hidden'), null);
  assert.equal(byClass(drawer.el, 'drawer')[0].getAttribute('role'), 'dialog');
  assert.equal(byClass(drawer.el, 'drawer')[0].getAttribute('aria-label'), 'Chemistry lecture');
  drawer.el.dispatch('keydown', { key: 'Escape' });
  assert.equal(drawer.isOpen(), false);
  assert.deepEqual(focused.at(-1)?.startsWith('blk-commitment:chem-lecture:'), true);
  drawer.open(itemOf('commitment', TUE, (i) => i.commitmentId === 'chem-lecture'));
  key(drawer.el, 'drawer-close').click();
  assert.equal(drawer.isOpen(), false);
  const scrim = byClass(drawer.el, 'scrim')[0];
  drawer.open(itemOf('commitment', TUE, (i) => i.commitmentId === 'chem-lecture'));
  scrim.click();
  assert.equal(drawer.isOpen(), false);
});

test('a commitment panel shows what it is, when, and the board U fields filled in', () => {
  const { drawer, itemOf } = rig();
  drawer.open(itemOf('commitment', TUE, (i) => i.commitmentId === 'chem-lecture'));
  const text = textOf(drawer.el);
  assert.match(text, /Class \/ every Tue, Thu/);
  assert.match(text, /Tue 13 Oct \/ 10:00–12:00/);
  assert.match(text, /Skip this day/);
  assert.match(text, /Changes apply to every week of this class/);
  assert.equal(key(drawer.el, 'f-title').value, 'Chemistry lecture');
  assert.equal(key(drawer.el, 'f-start').value, '10:00');
  assert.equal(key(drawer.el, 'f-end').value, '12:00');
  assert.ok(key(drawer.el, 'f-placeId'));
  assert.ok(key(drawer.el, 'f-weekdays-2'));
  assert.equal(key(drawer.el, 'f-from'), undefined, 'the date range and cancelled dates stay in Setup');
  assert.equal(findAll(drawer.el, (e: any) => e.tag === 'a' && e.getAttribute('href') === '#/commitments/chem-lecture').length, 1);
});

test('Skip this day adds only that date and closes the panel', async () => {
  const { drawer, itemOf, saves } = rig();
  drawer.open(itemOf('commitment', TUE, (i) => i.commitmentId === 'chem-lecture'));
  key(drawer.el, 'drawer-skip').click();
  await tick();
  const saved = saves[0].commitments.find((c: any) => c.id === 'chem-lecture');
  assert.deepEqual(saved.exceptions, [TUE]);
  assert.deepEqual(saves[0].commitments.find((c: any) => c.id === 'mass').exceptions, []);
  assert.equal(drawer.isOpen(), false);
});

test('a one-off commitment has no Skip this day, and a skipped day cannot be skipped twice', async () => {
  const once = structuredClone(example);
  once.commitments.push({ id: 'dentist', title: 'Dentist', category: 'meeting', start: 840, end: 900, pattern: { kind: 'once', date: TUE }, exceptions: [], bufferBefore: 0 });
  const { drawer, itemOf, saves } = rig(once);
  drawer.open(itemOf('commitment', TUE, (i) => i.commitmentId === 'dentist'));
  assert.equal(key(drawer.el, 'drawer-skip'), undefined);
  assert.ok(key(drawer.el, 'f-date'));
  drawer.close();
  const twice = structuredClone(example);
  twice.commitments.find((c: any) => c.id === 'chem-lecture').exceptions = [TUE];
  const r = rig(twice);
  r.drawer.open({ kind: 'commitment', commitmentId: 'chem-lecture', date: TUE, start: 600, end: 720, title: 'Chemistry lecture', label: 'class', group: 'fixed' });
  assert.equal(key(r.drawer.el, 'drawer-skip'), undefined, 'an already skipped day offers no second skip');
  assert.equal(r.saves.length, 0);
});

test('editing saves through the freshest copy, changes only that commitment and closes', async () => {
  const { drawer, itemOf, saves } = rig();
  drawer.open(itemOf('commitment', TUE, (i) => i.commitmentId === 'chem-lecture'));
  type(drawer.el, 'f-title', 'Organic chemistry lecture');
  type(drawer.el, 'f-end', '12:30');
  key(drawer.el, 'drawer-save').click();
  await tick();
  const next = saves[0];
  const changed = next.commitments.find((c: any) => c.id === 'chem-lecture');
  assert.deepEqual([changed.title, changed.end, changed.start], ['Organic chemistry lecture', 750, 600]);
  assert.deepEqual({ ...next, commitments: null }, { ...example, commitments: null });
  assert.deepEqual(next.commitments.filter((c: any) => c.id !== 'chem-lecture'), example.commitments.filter((c: any) => c.id !== 'chem-lecture'));
  assert.equal(drawer.isOpen(), false);
});

test('a mistake stays in the panel in plain words, and a server rejection too, with the typing kept', async () => {
  const a = rig();
  a.drawer.open(a.itemOf('commitment', TUE, (i) => i.commitmentId === 'chem-lecture'));
  type(a.drawer.el, 'f-end', '09:00');
  key(a.drawer.el, 'drawer-save').click();
  await tick();
  assert.equal(a.saves.length, 0);
  assert.match(textOf(byClass(a.drawer.el, 'err')[0]), /End time must be after the start time/);
  assert.equal(key(a.drawer.el, 'f-end').value, '09:00');
  const b = rig(structuredClone(example), { reject: 'commitments[1].title must be text of 1 to 200 characters' });
  b.drawer.open(b.itemOf('commitment', TUE, (i) => i.commitmentId === 'chem-lecture'));
  type(b.drawer.el, 'f-title', 'New name');
  key(b.drawer.el, 'drawer-save').click();
  await tick();
  assert.equal(b.drawer.isOpen(), true);
  assert.match(textOf(byClass(b.drawer.el, 'err')[0]), /commitments\[1\]\.title/);
  assert.equal(key(b.drawer.el, 'f-title').value, 'New name');
});

test('Discard puts the saved values back; Delete asks first and removes only that commitment', async () => {
  const { drawer, itemOf, saves } = rig();
  drawer.open(itemOf('commitment', TUE, (i) => i.commitmentId === 'chem-lecture'));
  type(drawer.el, 'f-title', 'Changed');
  key(drawer.el, 'drawer-discard').click();
  assert.equal(key(drawer.el, 'f-title').value, 'Chemistry lecture');
  key(drawer.el, 'drawer-delete').click();
  assert.match(textOf(drawer.el), /Delete "Chemistry lecture"\?/);
  assert.equal(saves.length, 0);
  key(drawer.el, 'drawer-keep').click();
  assert.equal(key(drawer.el, 'drawer-confirm'), undefined);
  key(drawer.el, 'drawer-delete').click();
  key(drawer.el, 'drawer-confirm').click();
  await tick();
  assert.equal(saves[0].commitments.some((c: any) => c.id === 'chem-lecture'), false);
  assert.equal(saves[0].commitments.length, example.commitments.length - 1);
  assert.equal(drawer.isOpen(), false);
});

test('a commitment that is already gone says so instead of crashing', async () => {
  const { drawer, saves } = rig();
  drawer.open({ kind: 'commitment', commitmentId: 'ghost', date: TUE, start: 600, end: 660, title: 'Ghost', label: 'class', group: 'fixed' });
  assert.match(textOf(drawer.el), /no longer there/);
  assert.equal(key(drawer.el, 'drawer-save'), undefined);
  assert.ok(key(drawer.el, 'drawer-close'));
  assert.equal(saves.length, 0);
});

test('a planned block explains itself and leads to its task and due date', () => {
  const state = structuredClone(example);
  state.blocks = [{ taskId: 'chem', title: 'Chemistry', category: 'study', date: TUE, start: 480, end: 535, deadlineId: 'chem-exam' }];
  const { drawer, itemOf, navs } = rig(state);
  drawer.open(itemOf('block', TUE, () => true));
  const text = textOf(drawer.el);
  assert.match(text, /Study \/ planned for you/);
  assert.match(text, /Tue 13 Oct \/ 08:00–08:55/);
  assert.match(text, /I put this here for the task Chemistry/);
  assert.match(text, /6h a week/);
  assert.match(text, /Change the task and I replan/);
  key(drawer.el, 'drawer-link-due').click();
  assert.deepEqual(navs, ['#/due-dates/chem-exam']);
  assert.equal(drawer.isOpen(), false);
  drawer.open(itemOf('block', TUE, () => true));
  key(drawer.el, 'drawer-link-task').click();
  assert.equal(navs[1], '#/tasks/chem');
});

test('a planned block whose task was deleted since says so and offers no dead link', () => {
  const state = structuredClone(example);
  state.tasks = state.tasks.filter((t: any) => t.id !== 'chem');
  state.deadlines = [];
  state.blocks = [{ taskId: 'chem', title: 'Chemistry', category: 'study', date: TUE, start: 480, end: 535 }];
  const { drawer, itemOf } = rig(state);
  drawer.open(itemOf('block', TUE, () => true));
  assert.match(textOf(drawer.el), /no longer there/);
  assert.equal(key(drawer.el, 'drawer-link-task'), undefined);
});

test('a trip explains where its time came from and links to the commute or the place', () => {
  const travel = [
    { date: TUE, start: 515, end: 570, fromName: 'Home', toName: 'Campus', estimated: false, placeId: 'campus', commuteId: 'home-campus' },
    { date: TUE, start: 900, end: 930, fromName: 'Home', toName: 'Anna', estimated: true, placeId: 'anna', commuteId: null },
  ];
  const { drawer, itemOf, navs } = rig(structuredClone(example), { travel });
  drawer.open(itemOf('travel', TUE, (i) => i.placeId === 'campus'));
  assert.match(textOf(drawer.el), /Travel \/ commute/);
  assert.match(textOf(drawer.el), /Commute 55/);
  assert.match(textOf(drawer.el), /Worked out from your commute Home to Campus/);
  key(drawer.el, 'drawer-link-commute').click();
  assert.equal(navs.at(-1), '#/commutes/home-campus');
  drawer.open(itemOf('travel', TUE, (i) => i.placeId === 'anna'));
  assert.match(textOf(drawer.el), /Travel \/ estimated/);
  assert.match(textOf(drawer.el), /No commute is set for Home to Anna, so I used your 30 minute allowance/);
  assert.match(textOf(drawer.el), /Anna has no address yet/);
  assert.match(textOf(key(drawer.el, 'drawer-link-commute')), /Add a commute/);
  key(drawer.el, 'drawer-link-commute').click();
  assert.equal(navs.at(-1), '#/commutes/new');
  drawer.open(itemOf('travel', TUE, (i) => i.placeId === 'anna'));
  key(drawer.el, 'drawer-link-place').click();
  assert.equal(navs.at(-1), '#/places/anna');
});

test('hostile titles stay text in the heading, the label and the confirmation', () => {
  const state = structuredClone(example);
  state.commitments[1].title = '<img src=x onerror=alert(1)> ‮';
  const { drawer, itemOf } = rig(state);
  drawer.open(itemOf('commitment', TUE, (i) => i.commitmentId === 'chem-lecture'));
  assert.equal(findAll(drawer.el, (e: any) => e.tag === 'img').length, 0);
  assert.match(textOf(byTag(drawer.el, 'h2')[0]), /<img src=x onerror=alert\(1\)>/);
  key(drawer.el, 'drawer-delete').click();
  assert.match(textOf(byClass(drawer.el, 'confirm')[0]), /<img src=x onerror=alert\(1\)>/);
});

test('Tab stays inside the panel, and typing "/" in a field is not swallowed', () => {
  const { drawer, itemOf } = rig();
  drawer.open(itemOf('commitment', TUE, (i) => i.commitmentId === 'chem-lecture'));
  const focusable = findAll(drawer.el, (e: any) => ['button', 'input', 'select', 'a'].includes(e.tag) && e.getAttribute('disabled') === null);
  const last = focusable[focusable.length - 1];
  const first = focusable[0];
  let moved: any = null;
  first.focus = () => { moved = first; };
  const ev = last.dispatch('keydown', { key: 'Tab' });
  drawer.el.dispatch('keydown', { key: 'Tab', target: last, shiftKey: false, preventDefault() {} });
  assert.equal(moved, first);
  const slash = key(drawer.el, 'f-title').dispatch('keydown', { key: '/' });
  assert.equal(slash.defaultPrevented, false);
  assert.ok(ev);
});

test('after Save or Skip, keyboard focus is handed back instead of being dropped', async () => {
  const a = rig();
  a.drawer.open(a.itemOf('commitment', TUE, (i) => i.commitmentId === 'chem-lecture'));
  key(a.drawer.el, 'drawer-save').click();
  await tick();
  assert.match(a.focused.at(-1) ?? '', /^blk-commitment:chem-lecture:/);
  const b = rig();
  b.drawer.open(b.itemOf('commitment', TUE, (i) => i.commitmentId === 'chem-lecture'));
  key(b.drawer.el, 'drawer-skip').click();
  await tick();
  assert.match(b.focused.at(-1) ?? '', /^blk-commitment:chem-lecture:/);
});

test('a new item: the panel opens on the chosen day and time, and Add saves a one-off commitment', async () => {
  const r = rig();
  r.drawer.openNew({ date: '2026-10-15', start: 9 * 60 + 15, returnKey: 'plus-2026-10-15' });
  assert.equal(r.drawer.isOpen(), true);
  assert.equal(key(r.drawer.el, 'f-start').value, '09:15');
  assert.equal(key(r.drawer.el, 'f-end').value, '10:15');
  assert.equal(key(r.drawer.el, 'f-date').value, '2026-10-15');
  key(r.drawer.el, 'drawer-save').click();
  await tick();
  assert.equal(r.saves.length, 0, 'a title is required');
  assert.match(textOf(r.drawer.el), /Give it a title/);
  type(r.drawer.el, 'f-title', 'Dentist');
  key(r.drawer.el, 'drawer-save').click();
  await tick();
  const added = r.saves[0].commitments.find((c: any) => c.title === 'Dentist');
  assert.deepEqual([added.start, added.end, added.pattern], [555, 615, { kind: 'once', date: '2026-10-15' }]);
  assert.equal(r.drawer.isOpen(), false);
  assert.equal(r.focused.at(-1), 'plus-2026-10-15');
});

test('a new item near midnight still ends the same day', () => {
  const r = rig();
  r.drawer.openNew({ date: '2026-10-15', start: 23 * 60 + 30 });
  assert.equal(key(r.drawer.el, 'f-end').value, '23:59');
});

const planned = () => structuredClone({ ...example, blocks: [{ taskId: 'chem', title: 'Chemistry', category: 'study', date: TUE, start: 480, end: 535 }] });
const theBlock = (r: any) => r.itemOf('block', TUE, () => true);

test('a planned block can be marked done from its panel: it is saved, the panel closes and Nudge is told to cheer', async () => {
  const r = rig(planned());
  r.drawer.open(theBlock(r));
  key(r.drawer.el, 'drawer-done').click();
  await tick();
  assert.equal(r.saves.at(-1).blocks[0].status, 'done');
  assert.equal(r.drawer.isOpen(), false);
  assert.equal(r.cheers.length, 1);
  assert.equal(r.cheers[0].title, 'Nice. Chemistry done.');
});

test('"I did not do this one" asks what to do with the time before anything is saved', async () => {
  const r = rig(planned());
  r.drawer.open(theBlock(r));
  key(r.drawer.el, 'drawer-notdone').click();
  assert.equal(r.saves.length, 0, 'nothing changes until a choice is made');
  const text = textOf(r.drawer.el);
  assert.match(text, /0h55 you still need|55 min you still need/);
  for (const k of ['drawer-later', 'drawer-takeoff', 'drawer-ai', 'drawer-back']) assert.ok(key(r.drawer.el, k), k);
  assert.notEqual(key(r.drawer.el, 'drawer-ai').getAttribute('disabled'), null, 'the AI choice is there but not connected yet');
  assert.match(textOf(key(r.drawer.el, 'drawer-ai')), /Not connected yet/);
  key(r.drawer.el, 'drawer-back').click();
  assert.ok(key(r.drawer.el, 'drawer-done'), 'Back returns to the first panel');
});

test('Find another time marks it not done so it is planned again; Take it off lowers the week instead', async () => {
  const later = rig(planned());
  later.drawer.open(theBlock(later));
  key(later.drawer.el, 'drawer-notdone').click();
  key(later.drawer.el, 'drawer-later').click();
  await tick();
  assert.equal(later.saves.at(-1).blocks[0].status, 'missed');
  assert.equal(later.drawer.isOpen(), false);
  const off = rig(planned());
  off.drawer.open(theBlock(off));
  key(off.drawer.el, 'drawer-notdone').click();
  key(off.drawer.el, 'drawer-takeoff').click();
  await tick();
  assert.equal(off.saves.at(-1).blocks[0].status, 'waived');
  assert.equal(off.cheers.length, 0, 'not done is never cheered');
});

test('for a block that belongs to a due date, taking it off says it shortens that due date', () => {
  const s = planned();
  s.blocks[0].deadlineId = 'chem-exam';
  const r = rig(s);
  r.drawer.open(theBlock(r));
  key(r.drawer.el, 'drawer-notdone').click();
  assert.match(textOf(key(r.drawer.el, 'drawer-takeoff')), /Shorten this by 55 min/);
});

test('a done block offers to be marked not done yet, and a not-done one offers Mark as done or Put it back', async () => {
  const s = planned();
  s.blocks[0].status = 'done';
  const done = rig(s);
  done.drawer.open(theBlock(done));
  assert.match(textOf(done.drawer.el), /Done\./);
  key(done.drawer.el, 'drawer-undo').click();
  await tick();
  assert.equal('status' in done.saves.at(-1).blocks[0], false);
  const s2 = planned();
  s2.blocks[0].status = 'missed';
  const missed = rig(s2);
  missed.drawer.open(theBlock(missed));
  assert.match(textOf(missed.drawer.el), /Not done\./);
  assert.ok(key(missed.drawer.el, 'drawer-done') && key(missed.drawer.el, 'drawer-undo'));
});

test('a class is ticked done or skipped for that day only, with no follow-up question', async () => {
  const r = rig(planned());
  r.drawer.open(r.itemOf('commitment', TUE, (i: any) => i.commitmentId === 'chem-lecture'));
  key(r.drawer.el, 'drawer-notdone').click();
  await tick();
  assert.deepEqual(r.saves.at(-1).commitmentMarks, [{ id: 'chem-lecture', date: TUE, status: 'missed' }]);
  const d = rig(planned());
  d.drawer.open(d.itemOf('commitment', TUE, (i: any) => i.commitmentId === 'chem-lecture'));
  assert.match(textOf(key(d.drawer.el, 'drawer-notdone')), /I did not go/);
  key(d.drawer.el, 'drawer-done').click();
  await tick();
  assert.deepEqual(d.saves.at(-1).commitmentMarks, [{ id: 'chem-lecture', date: TUE, status: 'done' }]);
});

test('the Month day checklist lists what is planned, ticks things off in place and opens an item', async () => {
  const r = rig(planned());
  r.drawer.openDay({ date: TUE, returnKey: 'review-2026-10-13' });
  assert.match(textOf(r.drawer.el), /Check off/);
  const ticks = findAll(r.drawer.el, (e: any) => (e.getAttribute('data-fk') ?? '').startsWith('daytick-'));
  assert.ok(ticks.length >= 2, 'the lecture and the study block');
  ticks[0].click();
  await tick();
  assert.ok(r.saves.length === 1);
  assert.ok(findAll(r.drawer.el, (e: any) => (e.getAttribute('data-fk') ?? '').startsWith('daytick-'))[0].getAttribute('aria-pressed') === 'true', 'the list redraws with the tick on');
  findAll(r.drawer.el, (e: any) => (e.getAttribute('data-fk') ?? '').startsWith('dayopen-'))[1].click();
  assert.ok(key(r.drawer.el, 'drawer-done') || key(r.drawer.el, 'drawer-undo'), 'a row opens that item\'s panel');
  r.drawer.close();
  assert.equal(r.focused.at(-1), 'review-2026-10-13');
});
