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
  server = createApp(join(mkdtempSync(join(tmpdir(), 'doitwithme-click-')), 'db.json'));
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
const blk = (root: any, part: string) => findAll(root, (e: any) => e.tag === 'button' && (e.getAttribute('data-fk') ?? '').startsWith('blk-') && e.getAttribute('data-fk').includes(part))[0];

test('click a lecture in the week, change its time in the panel, and the server and the week agree', async () => {
  assert.equal((await put(await exampleState())).status, 200);
  const { app, root } = boot();
  await settled(app);
  blk(root, 'commitment:chem-lecture:2026-10-06').click();
  assert.equal(key(root, 'f-title').value, 'Chemistry lecture');
  type(root, 'f-end', '12:30');
  key(root, 'drawer-save').click();
  await app.store.idle();
  await tick(60);
  const saved = (await serverState()).commitments.find((c: any) => c.id === 'chem-lecture');
  assert.equal(saved.end, 750);
  assert.match(textOf(blk(root, 'commitment:chem-lecture:2026-10-06')), /10:00–12:30/);
  assert.equal(byClass(root, 'drawer-root')[0].getAttribute('hidden'), '');
});

test('Skip this day removes only that Tuesday and keeps Thursday', async () => {
  assert.equal((await put(await exampleState())).status, 200);
  const { app, root } = boot();
  await settled(app);
  blk(root, 'commitment:chem-lecture:2026-10-06').click();
  key(root, 'drawer-skip').click();
  await app.store.idle();
  await tick(60);
  assert.deepEqual((await serverState()).commitments.find((c: any) => c.id === 'chem-lecture').exceptions, ['2026-10-06']);
  assert.equal(blk(root, 'commitment:chem-lecture:2026-10-06'), undefined);
  assert.ok(blk(root, 'commitment:chem-lecture:2026-10-08'));
});

test('a planned block leads to its task form, and a trip leads to the commute', async () => {
  assert.equal((await put(await exampleState())).status, 200);
  const { app, root, win } = boot();
  await settled(app);
  blk(root, 'block:').click();
  key(root, 'drawer-link-task').click();
  assert.match(win.location.hash, /^#\/tasks\//);
  assert.equal(textOf(byTag(root, 'h1')[0]), 'Setup');
  app.navigate('#/week');
  blk(root, 'travel:').click();
  assert.match(textOf(byClass(root, 'drawer')[0]), /Travel \//);
  key(root, 'drawer-link-commute').click();
  assert.match(win.location.hash, /^#\/commutes\//);
});

test('the Day screen opens the same panel, and Esc closes it', async () => {
  assert.equal((await put(await exampleState())).status, 200);
  const { app, root } = boot();
  await settled(app);
  app.navigate('#/day/2026-10-06');
  blk(root, 'commitment:chem-lecture').click();
  assert.equal(key(root, 'f-title').value, 'Chemistry lecture');
  byClass(root, 'drawer-root')[0].dispatch('keydown', { key: 'Escape' });
  assert.equal(byClass(root, 'drawer-root')[0].getAttribute('hidden'), '');
});

test('typing a slash in the panel does not open the Menu', async () => {
  assert.equal((await put(await exampleState())).status, 200);
  const { app, root, document } = boot();
  await settled(app);
  blk(root, 'commitment:chem-lecture:2026-10-06').click();
  document.dispatch('keydown', { key: '/', target: key(root, 'f-title') });
  assert.equal(app.menu.isOpen(), false);
});

test('the Deadlines page adds and edits through the existing form', async () => {
  assert.equal((await put(await exampleState())).status, 200);
  const { app, root, win } = boot();
  await settled(app);
  app.navigate('#/deadlines');
  const add = findAll(root, (e: any) => e.tag === 'a' && e.getAttribute('href') === '#/due-dates/new')[0];
  assert.ok(add);
  app.navigate(add.getAttribute('href'));
  assert.equal(textOf(byTag(root, 'h1')[0]), 'Setup');
  app.navigate('#/deadlines');
  app.navigate(byClass(root, 'dl')[0].getAttribute('href'));
  assert.match(win.location.hash, /^#\/due-dates\/.+/);
});

test('click empty space on a day, name it, and it is saved on the server and shown on the week', async () => {
  assert.equal((await put(await exampleState())).status, 200);
  const { app, root } = boot();
  await settled(app);
  const fri = byClass(root, 'day')[4];
  const body = byClass(fri, 'cbody')[0];
  body.dispatch('click', { target: body, clientY: 8 * 56 });
  assert.equal(key(root, 'f-date').value, '2026-10-09');
  assert.equal(key(root, 'f-start').value, '15:00');
  type(root, 'f-title', 'Dentist');
  key(root, 'drawer-save').click();
  await app.store.idle();
  await tick(60);
  const saved = (await serverState()).commitments.find((c: any) => c.title === 'Dentist');
  assert.deepEqual([saved.start, saved.pattern], [900, { kind: 'once', date: saved.pattern.date }]);
  assert.match(textOf(byClass(root, 'day')[4]), /Dentist/);
});

test('the plus on a Month day opens the same panel for that day', async () => {
  assert.equal((await put(await exampleState())).status, 200);
  const { app, root } = boot();
  await settled(app);
  app.navigate('#/month');
  key(root, 'plus-2026-10-20').click();
  assert.equal(key(root, 'f-date').value, '2026-10-20');
  assert.equal(key(root, 'f-start').value, '09:00');
});
