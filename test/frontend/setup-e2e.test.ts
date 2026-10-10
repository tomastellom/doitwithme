import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../../src/server.ts';
import { emptyState } from '../../src/store.ts';
import { defaultPreferences } from '../../src/defaults.ts';
import { startApp } from '../../public/js/main.js';
import { FakeDocument, byClass, byTag, findAll, textOf } from './fakedom.ts';

let server: Server;
let base: string;
const json = { 'content-type': 'application/json' };
const now = () => new Date(2026, 9, 5, 9, 0); // Monday 5 Oct 2026, 09:00
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

const task = (over: any = {}) => ({ id: 't1', title: 'Study', category: 'study', weeklyMinutes: 300, maxBlock: 120, onePerDay: false, priority: 3, ...over });
const baseState = (over: any = {}) => ({ ...emptyState(), tasks: [task()], preferences: structuredClone(defaultPreferences), ...over });
const put = (state: any) => fetch(`${base}/api/state`, { method: 'PUT', headers: json, body: JSON.stringify(state) });
const serverState = async () => (await fetch(`${base}/api/state`)).json();

before(async () => {
  server = createApp(join(mkdtempSync(join(tmpdir(), 'doitwithme-setup-')), 'db.json'));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
});

function boot() {
  const document: any = new FakeDocument();
  const root = document.createElement('div');
  const win: any = { location: { hash: '' }, localStorage: undefined, listeners: {}, addEventListener(t: string, f: Function) { (this.listeners[t] ??= []).push(f); } };
  const app: any = startApp({ root, document, fetch: (p: string, i: any) => fetch(base + p, i), win, now });
  return { app, root, document, win };
}
async function settled(app: any) {
  for (let i = 0; i < 300; i++) {
    const s = app.store.get();
    if (s.status !== 'loading' && !s.busy) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('the app did not settle');
}
const key = (root: any, k: string) => findAll(root, (e) => e.getAttribute('data-fk') === k)[0];
const type = (root: any, k: string, value: string) => { const el = key(root, k); el.value = value; el.dispatch('input'); };
const save = async (app: any, root: any) => { byTag(root, 'form')[0].dispatch('submit'); await app.store.idle(); await tick(); };
const button = (root: any, label: string) => byTag(root, 'button').find((b: any) => textOf(b).trim() === label)!;

test('the Setup tab and Menu entries exist, and the tab is current on every setup route', async () => {
  assert.equal((await put(baseState())).status, 200);
  const { app, root } = boot();
  await settled(app);
  const tabs = () => findAll(root, (e) => e.tag === 'a' && e.hasClass('tab'));
  assert.deepEqual(tabs().map(textOf), ['Day', 'Week', 'Month', 'Deadlines', 'Setup']);
  for (const id of ['setup', 'commitments', 'tasks', 'due-dates', 'places', 'commutes', 'preferences']) {
    app.navigate(`#/${id}`);
    assert.equal(tabs().find((t: any) => textOf(t) === 'Setup').getAttribute('aria-current'), 'page', id);
    assert.equal(textOf(byTag(root, 'h1')[0]), 'Setup');
  }
  app.navigate('#/week');
  assert.equal(tabs().find((t: any) => textOf(t) === 'Setup').getAttribute('aria-current'), null);
  app.menu.open(null);
  const menuLinks = byClass(app.menu.el, 'it').map((l: any) => l.getAttribute('href'));
  assert.deepEqual(menuLinks, ['#/day', '#/week', '#/month', '#/deadlines', '#/commitments', '#/tasks', '#/due-dates', '#/places', '#/commutes', '#/preferences', '#/settings']);
});

test('add a commitment through the form: it is saved on the server and shows on the week', async () => {
  assert.equal((await put(baseState())).status, 200);
  const { app, root, win } = boot();
  await settled(app);
  app.navigate('#/commitments/new');
  type(root, 'f-title', 'Chemistry lecture');
  key(root, 'f-weekdays-1').click();
  key(root, 'f-weekdays-2').click();
  type(root, 'f-start', '10:00');
  type(root, 'f-end', '12:00');
  type(root, 'f-buffer', '30');
  await save(app, root);
  const state = await serverState();
  assert.equal(state.commitments.length, 1);
  assert.equal(state.commitments[0].title, 'Chemistry lecture');
  assert.deepEqual(state.commitments[0].pattern.weekdays, [2]);
  assert.equal(state.commitments[0].start, 600);
  assert.equal(state.commitments[0].end, 720);
  assert.equal(state.commitments[0].bufferBefore, 30);
  assert.deepEqual(state.tasks, [task()]);
  assert.equal(win.location.hash, `#/commitments/${encodeURIComponent(state.commitments[0].id)}`);
  assert.match(textOf(byClass(root, 'item')[0]), /Chemistry lecture/);
  app.navigate('#/week');
  const tuesday = byClass(root, 'day')[1];
  assert.match(textOf(tuesday), /Chemistry lecture/);
  assert.match(textOf(tuesday), /10:00–12:00/);
});

test('a mistake the page can see is explained and nothing is saved', async () => {
  assert.equal((await put(baseState())).status, 200);
  const { app, root } = boot();
  await settled(app);
  app.navigate('#/commitments/new');
  type(root, 'f-title', 'Backwards');
  type(root, 'f-start', '17:00');
  type(root, 'f-end', '16:00');
  await save(app, root);
  assert.match(textOf(byClass(root, 'err')[0]), /End time must be after the start time\./);
  assert.equal((await serverState()).commitments.length, 0);
  type(root, 'f-end', '18:00');
  await save(app, root);
  assert.equal((await serverState()).commitments.length, 1);
});

test('deleting a task also removes its due dates on the server', async () => {
  assert.equal((await put(baseState({ deadlines: [{ id: 'd1', taskId: 't1', kind: 'exam', dueDate: '2026-10-23', effortMinutes: 120 }] }))).status, 200);
  const { app, root } = boot();
  await settled(app);
  app.navigate('#/tasks/t1');
  button(root, 'Delete').click();
  assert.match(textOf(root), /Its 1 due date goes too\./);
  button(root, 'Yes, delete').click();
  await app.store.idle();
  await tick();
  const state = await serverState();
  assert.deepEqual(state.tasks, []);
  assert.deepEqual(state.deadlines, []);
});

test('editing preferences changes only the preferences', async () => {
  assert.equal((await put(baseState({ approvedSoft: [] }))).status, 200);
  const { app, root } = boot();
  await settled(app);
  app.navigate('#/preferences');
  type(root, 'f-minBlock', '45');
  await save(app, root);
  const state = await serverState();
  assert.equal(state.preferences.minBlock, 45);
  assert.equal(state.preferences.softMode, 'ask');
  assert.deepEqual(state.tasks, [task()]);
});

test('a due date can be added for an existing task', async () => {
  assert.equal((await put(baseState())).status, 200);
  const { app, root } = boot();
  await settled(app);
  app.navigate('#/due-dates/new');
  type(root, 'f-dueDate', '2026-10-23');
  type(root, 'f-effort', '480');
  await save(app, root);
  const state = await serverState();
  assert.equal(state.deadlines.length, 1);
  assert.deepEqual([state.deadlines[0].taskId, state.deadlines[0].dueDate, state.deadlines[0].effortMinutes], ['t1', '2026-10-23', 480]);
});

test('on a first run the Add a commitment link opens an empty form', async () => {
  assert.equal((await put(emptyState())).status, 200);
  const { app, root, win } = boot();
  await settled(app);
  const link = byTag(root, 'a').find((a: any) => textOf(a).trim() === 'Add a commitment')!;
  assert.equal(link.getAttribute('href'), '#/commitments/new');
  app.navigate(link.getAttribute('href'));
  assert.equal(win.location.hash, '#/commitments/new');
  assert.equal(key(root, 'f-title').value, '');
  type(root, 'f-title', 'My first class');
  await save(app, root);
  assert.equal((await serverState()).commitments.length, 1);
  assert.equal(app.store.get().isEmpty, false);
});

test('hostile text typed into a form is saved as text and shown as text', async () => {
  assert.equal((await put(baseState())).status, 200);
  const { app, root } = boot();
  await settled(app);
  const evil = '<img src=x onerror=alert(1)>';
  app.navigate('#/tasks/new');
  type(root, 'f-title', evil);
  await save(app, root);
  assert.equal((await serverState()).tasks.find((t: any) => t.title === evil)?.title, evil);
  assert.equal(findAll(root, (e) => e.tag === 'img').length, 0);
  app.navigate('#/week');
  assert.equal(findAll(root, (e) => e.tag === 'img').length, 0);
});

test('keyboard focus stays on a toggle after it redraws the form', async () => {
  assert.equal((await put(baseState())).status, 200);
  const { app, root, document } = boot();
  await settled(app);
  app.navigate('#/commitments/new');
  const friday = key(root, 'f-weekdays-5');
  friday.focus();
  friday.click();
  assert.equal(document.activeElement.getAttribute('data-fk'), 'f-weekdays-5');
  assert.equal(document.activeElement.getAttribute('aria-pressed'), 'true');
  assert.equal(findAll(root, (e) => e === document.activeElement).length, 1);
});

const placeRows = [
  { id: 'home', name: 'Home', kind: 'home', address: 'Calle 1' },
  { id: 'campus', name: 'Campus', kind: 'campus', address: 'Av 2' },
];
const route = { id: 'r1', fromPlaceId: 'home', toPlaceId: 'campus', repeats: null, source: { method: 'typed', minutes: 45 }, marginMinutes: 10 };
const lecture = { id: 'lec', title: 'Lecture', category: 'class', start: 600, end: 720, pattern: { kind: 'once', date: '2026-10-05' }, exceptions: [], bufferBefore: 0, placeId: 'campus' };

test('travel reaches the week and the plan keeps its blocks out of it', async () => {
  assert.equal((await put(baseState({ places: placeRows, commutes: [route], commitments: [lecture] }))).status, 200);
  const { app, root } = boot();
  await settled(app);
  const legs = app.store.get().travel;
  assert.deepEqual(legs.map((l: any) => [l.start, l.end]), [[545, 600], [720, 775]]);
  assert.match(textOf(root), /Commute 55/);
  for (const b of app.store.get().state.blocks.filter((x: any) => x.date === '2026-10-05')) {
    for (const l of legs) assert.ok(b.end <= l.start || b.start >= l.end);
  }
});

test('add a place through the form, then a commute between two places, and both are on the server', async () => {
  assert.equal((await put(baseState({ places: placeRows }))).status, 200);
  const { app, root, win } = boot();
  await settled(app);
  app.navigate('#/places/new');
  type(root, 'f-name', 'Parish');
  type(root, 'f-address', 'Plaza 1');
  await save(app, root);
  assert.ok((await serverState()).places.some((p: any) => p.name === 'Parish' && p.address === 'Plaza 1'));
  assert.match(win.location.hash, /^#\/places\//);
  app.navigate('#/commutes/new');
  type(root, 'f-minutes', '25');
  await save(app, root);
  const state = await serverState();
  assert.equal(state.commutes.length, 1);
  assert.deepEqual(state.commutes[0].source, { method: 'typed', minutes: 25 });
});

test('deleting a place through the form removes its commute from the server too', async () => {
  assert.equal((await put(baseState({ places: placeRows, commutes: [route], commitments: [lecture] }))).status, 200);
  const { app, root } = boot();
  await settled(app);
  app.navigate('#/places/campus');
  key(root, 'setup-delete').click();
  assert.match(textOf(byClass(root, 'confirm')[0]), /Its 1 commute goes too\. 1 commitment loses its place\./);
  key(root, 'setup-confirm').click();
  await app.store.idle();
  await tick();
  const state = await serverState();
  assert.deepEqual(state.commutes, []);
  assert.equal(state.places.some((p: any) => p.id === 'campus'), false);
  assert.equal('placeId' in state.commitments[0], false);
});

test('a missing address shows up in the Nudge and the week says when travel is off', async () => {
  const anna = { id: 'anna', name: 'Anna', kind: 'student', address: '' };
  const les = { ...lecture, id: 'les', title: 'Lesson Anna', placeId: 'anna' };
  assert.equal((await put(baseState({ places: [placeRows[0], anna], commitments: [les] }))).status, 200);
  const a = boot();
  await settled(a.app);
  assert.ok(a.app.store.get().warnings.some((w: any) => w.kind === 'address-missing'));
  assert.match(textOf(a.root), /Anna has no address and no commute/);
  assert.equal((await put(baseState({ places: [anna] }))).status, 200);
  const b = boot();
  await settled(b.app);
  assert.match(textOf(b.root), /Travel is off\. Add a Home place\./);
});
