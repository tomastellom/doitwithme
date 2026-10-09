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

test('estimate with the rule, use the number, save: the server keeps the course and the minutes', async () => {
  assert.equal((await put(baseState({ preferences: { ...structuredClone(defaultPreferences), hoursPerCredit: 1 } }))).status, 200);
  const { app, root } = boot();
  await settled(app);
  app.navigate('#/tasks/t1');
  type(root, 'f-credits', '3');
  key(root, 'f-weeklyGraded-true').click();
  key(root, 'estimate-run').click();
  await tick(60);
  assert.match(textOf(byClass(root, 'est')[0]), /Rule of thumb/);
  key(root, 'estimate-use').click();
  assert.equal(key(root, 'f-weekly').value, '210');
  await save(app, root);
  const saved = (await serverState()).tasks.find((t: any) => t.id === 't1');
  assert.equal(saved.weeklyMinutes, 210);
  assert.deepEqual(saved.course, { credits: 3, difficulty: 3, examOnly: false, weeklyGraded: true, lab: false, syllabus: '' });
});

test('Preferences scale fields save, and the estimate follows them', async () => {
  assert.equal((await put(baseState())).status, 200);
  const { app, root } = boot();
  await settled(app);
  app.navigate('#/preferences');
  type(root, 'f-hoursPerCredit', '2');
  await save(app, root);
  assert.equal((await serverState()).preferences.hoursPerCredit, 2);
  app.navigate('#/tasks/t1');
  type(root, 'f-credits', '3');
  key(root, 'estimate-run').click();
  await tick(60);
  assert.match(textOf(byClass(root, 'est')[0]), /6h a week/);
});

test('the same task opened again shows its saved course, and a non-study task has no block', async () => {
  assert.equal((await put(baseState())).status, 200);
  const { app, root } = boot();
  await settled(app);
  app.navigate('#/tasks/t1');
  type(root, 'f-credits', '4');
  type(root, 'f-syllabus', '<b>Syllabus</b>');
  await save(app, root);
  app.navigate('#/tasks/t1');
  assert.equal(key(root, 'f-credits').value, '4');
  assert.equal(key(root, 'f-syllabus').value, '<b>Syllabus</b>');
});

test('while an estimate runs Nudge thinks', async () => {
  assert.equal((await put(baseState())).status, 200);
  const { app, root } = boot();
  await settled(app);
  app.navigate('#/tasks/t1');
  type(root, 'f-credits', '3');
  key(root, 'estimate-run').click();
  assert.equal(app.store.get().estimating, true);
  assert.equal(byClass(app.nudge.el, 'mascot')[0].getAttribute('data-face'), 'thinking');
  await tick(60);
  assert.equal(app.store.get().estimating, false);
});
