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

const exampleState = async () => (await fetch(`${base}/api/example`)).json();

test('the Day tab shows today, steps to the next day, and reads a date from the address', async () => {
  assert.equal((await put(await exampleState())).status, 200);
  const { app, root, win } = boot();
  await settled(app);
  app.navigate('#/day');
  assert.equal(textOf(byTag(root, 'h1')[0]), 'Mon 5');
  key(root, 'next').click();
  assert.match(win.location.hash, /^#\/day\/2026-10-06$/);
  assert.equal(textOf(byTag(root, 'h1')[0]), 'Tue 6');
  app.navigate('#/day/2026-10-31');
  key(root, 'next').click();
  assert.match(win.location.hash, /2026-11-01$/);
  app.navigate('#/day/not-a-date');
  assert.equal(textOf(byTag(root, 'h1')[0]), 'Mon 5');
  const tabs = findAll(root, (e: any) => e.tag === 'a' && e.hasClass('tab'));
  assert.equal(tabs.find((t: any) => textOf(t) === 'Day').getAttribute('aria-current'), 'page');
});

test('the Deadlines tab lists the example due dates with a shortfall for the exam', async () => {
  assert.equal((await put(await exampleState())).status, 200);
  const { app, root } = boot();
  await settled(app);
  app.navigate('#/deadlines');
  assert.equal(textOf(byTag(root, 'h1')[0]), 'Deadlines');
  assert.match(textOf(root), /Chemistry exam/);
  assert.ok(byClass(root, 'dl').length >= 1);
});

test('Settings saves soft time to the server and keeps every other preference', async () => {
  const example = await exampleState();
  assert.equal((await put(example)).status, 200);
  const { app, root } = boot();
  await settled(app);
  app.navigate('#/settings');
  assert.equal(key(root, 'set-softMode-ask').getAttribute('aria-pressed'), 'true');
  key(root, 'set-softMode-auto').click();
  await app.store.idle();
  await new Promise((r) => setTimeout(r, 30));
  const saved = await serverState();
  assert.equal(saved.preferences.softMode, 'auto');
  assert.deepEqual({ ...saved.preferences, softMode: 'ask' }, { ...example.preferences, softMode: 'ask', travelAllowanceMinutes: 30 });
  assert.equal(saved.tasks.length, example.tasks.length);
  assert.equal(key(root, 'set-softMode-auto').getAttribute('aria-pressed'), 'true');
});

test('the Menu offers Settings, and the Settings sub-links open each group', async () => {
  assert.equal((await put(await exampleState())).status, 200);
  const { app, root } = boot();
  await settled(app);
  app.menu.open(null);
  assert.ok(byClass(app.menu.el, 'it').some((l: any) => l.getAttribute('href') === '#/settings'));
  app.navigate('#/settings/planner');
  const current = findAll(root, (e: any) => e.tag === 'a' && e.getAttribute('aria-current') === 'page' && e.getAttribute('href')?.startsWith('#/settings/'));
  assert.equal(textOf(current[0]), 'Planner');
});

test('moving between tabs marks the new screen with the way it came in; staying put does not', async () => {
  await put(baseState());
  const { app, root } = boot();
  await settled(app);
  const entering = () => findAll(root, (e: any) => e.hasAttribute('data-enter')).map((e: any) => e.getAttribute('data-enter'));
  assert.deepEqual(entering(), [], 'the first screen just appears');
  app.navigate('#/day');
  assert.deepEqual(entering(), ['back']);
  app.navigate('#/deadlines');
  assert.deepEqual(entering(), ['fwd']);
  app.navigate('#/deadlines');
  assert.deepEqual(entering(), []);
});

test('stepping through days slides the same way you step', async () => {
  await put(baseState());
  const { app, root } = boot();
  await settled(app);
  const entering = () => findAll(root, (e: any) => e.hasAttribute('data-enter')).map((e: any) => e.getAttribute('data-enter'));
  app.navigate('#/day/2026-10-06');
  app.navigate('#/day/2026-10-07');
  assert.deepEqual(entering(), ['step-fwd']);
  app.navigate('#/day/2026-10-06');
  assert.deepEqual(entering(), ['step-back']);
});

test('with timers the old screen slides out while the new one slides in, then is removed', async () => {
  await put(baseState());
  const document: any = new FakeDocument();
  const root = document.createElement('div');
  const timers: Array<{ fn: Function; ms: number }> = [];
  const win: any = { location: { hash: '' }, localStorage: undefined, listeners: {}, addEventListener(t: string, f: Function) { (this.listeners[t] ??= []).push(f); }, setTimeout: (fn: Function, ms: number) => timers.push({ fn, ms }), clearTimeout() {} };
  const app: any = startApp({ root, document, fetch: (p: string, i: any) => fetch(base + p, i), win, now });
  await settled(app);
  const view = byTag(root, 'main')[0];
  assert.equal(view.children.length, 1, 'the first screen just appears');
  app.navigate('#/day');
  assert.equal(view.children.length, 2, 'old and new are both there while they slide');
  assert.match(view.children[0].getAttribute('class'), /slide-in-back/);
  assert.match(view.children[1].getAttribute('class'), /slide-out-back/);
  assert.equal(view.children[1].hasAttribute('inert'), true, 'the old copy cannot be tabbed into');
  assert.equal(view.children[1].getAttribute('aria-hidden'), 'true');
  assert.equal(view.getAttribute('data-sliding'), 'back');
  app.render();
  assert.equal(view.children.length, 2, 'a redraw during the slide waits, so it cannot cut the slide short');
  timers.splice(0).filter((t) => t.ms === 520).forEach((t) => t.fn());
  assert.equal(view.children.length, 1);
  assert.equal(view.hasAttribute('data-sliding'), false);
  app.navigate('#/week');
  app.navigate('#/deadlines');
  assert.equal(view.children.length, 2, 'a new move while sliding settles the first one');
  timers.splice(0).filter((t) => t.ms === 520).forEach((t) => t.fn());
  app.navigate('#/day/2026-10-06');
  timers.splice(0).filter((t) => t.ms === 520).forEach((t) => t.fn());
  app.navigate('#/day/2026-10-07');
  assert.match(view.children[0].getAttribute('class'), /step-in-fwd/, 'stepping keeps the title row and buttons still');
  assert.match(view.children[1].getAttribute('class'), /step-out-fwd/);
});

test('opening another screen or another record starts at the top; redrawing the same one keeps your place', async () => {
  await put(await exampleState());
  const document: any = new FakeDocument();
  const root = document.createElement('div');
  const jumps: any[] = [];
  const win: any = { location: { hash: '' }, localStorage: undefined, listeners: {}, addEventListener(t: string, f: Function) { (this.listeners[t] ??= []).push(f); }, scrollTo: (...a: any[]) => jumps.push(a) };
  const app: any = startApp({ root, document, fetch: (p: string, i: any) => fetch(base + p, i), win, now });
  await settled(app);
  assert.equal(jumps.length, 0, 'the first screen needs no jump');
  app.navigate('#/tasks');
  assert.equal(jumps.length, 1);
  assert.deepEqual(jumps[0], [0, 0]);
  app.navigate('#/tasks/some-task');
  assert.equal(jumps.length, 2, 'a different record is a new page');
  app.render();
  assert.equal(jumps.length, 2, 'a plain redraw keeps the scroll');
});

test('moving between Setup pages keeps the Setup title row and buttons still', async () => {
  await put(baseState());
  const { app, root } = boot();
  await settled(app);
  const entering = () => findAll(root, (e: any) => e.hasAttribute('data-enter')).map((e: any) => e.getAttribute('data-enter'));
  app.navigate('#/tasks');
  app.navigate('#/due-dates');
  assert.deepEqual(entering(), ['step-fwd']);
  app.navigate('#/tasks');
  assert.deepEqual(entering(), ['step-back']);
  app.navigate('#/week');
  assert.deepEqual(entering(), ['back'], 'leaving Setup for another tab slides the whole screen');
});

test('pressing Today on the week you are already on does not jump the page', async () => {
  await put(await exampleState());
  const document: any = new FakeDocument();
  const root = document.createElement('div');
  const jumps: any[] = [];
  const win: any = { location: { hash: '' }, localStorage: undefined, listeners: {}, addEventListener(t: string, f: Function) { (this.listeners[t] ??= []).push(f); }, scrollTo: (...a: any[]) => jumps.push(a) };
  const app: any = startApp({ root, document, fetch: (p: string, i: any) => fetch(base + p, i), win, now });
  await settled(app);
  app.navigate('#/week/2026-10-05');
  app.navigate('#/week');
  assert.equal(jumps.length, 0, 'the same week is not a new page');
  app.navigate('#/week/2026-10-12');
  assert.equal(jumps.length, 1);
});
