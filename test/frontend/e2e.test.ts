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

const task = (over: any = {}) => ({ id: 't1', title: 'Study', category: 'study', weeklyMinutes: 5000, maxBlock: 120, onePerDay: false, priority: 3, ...over });
const studyState = (over: any = {}) => ({
  ...emptyState(),
  tasks: [task()],
  preferences: {
    ...structuredClone(defaultPreferences),
    weekdayWindow: { start: 1080, end: 1200 }, dayOffWindow: { start: 1080, end: 1200 },
    daysOff: [], softWindows: [{ weekday: 5, start: 1080, end: 1440 }], softMode: 'ask',
  },
  ...over,
});
const put = (state: any) => fetch(`${base}/api/state`, { method: 'PUT', headers: json, body: JSON.stringify(state) });

before(async () => {
  server = createApp(join(mkdtempSync(join(tmpdir(), 'doitwithme-e2e-')), 'db.json'));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
});

function boot(fetchFn?: any) {
  const document: any = new FakeDocument();
  const root = document.createElement('div');
  const win: any = { location: { hash: '' }, localStorage: undefined, listeners: {}, addEventListener(t: string, f: Function) { (this.listeners[t] ??= []).push(f); } };
  const app: any = startApp({ root, document, fetch: fetchFn ?? ((p: string, i: any) => fetch(base + p, i)), win, now });
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
const click = (root: any, label: string) => byTag(root, 'button').find((b: any) => textOf(b).trim() === label)!.click();
const fridayColumn = (root: any) => byClass(root, 'day')[4];

test('the real server serves the page and its script', async () => {
  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<div id="app">/);
  const script = await fetch(`${base}/js/main.js`);
  assert.equal(script.status, 200);
  assert.match(script.headers.get('content-type') ?? '', /javascript/);
});

test('boots, draws the week, and walks the whole approve, undo and dismiss story', async () => {
  assert.equal((await put(studyState())).status, 200);
  const { app, root } = boot();
  await settled(app);

  // the shell and the week
  assert.equal(textOf(byTag(root, 'h1')[0]), 'Week 41');
  assert.match(textOf(root), /5 – 11 Oct 2026/);
  assert.equal(byClass(root, 'day').length, 7);
  assert.match(textOf(byClass(root, 'day')[0]), /18:00–20:00/);
  assert.match(textOf(fridayColumn(root)), /Nothing planned/);
  assert.equal(byTag(root, 'nav').length, 1);
  assert.equal(findAll(root, (e) => e.tag === 'a' && e.hasClass('tab')).length, 1);

  // Nudge speaks and offers Friday evening
  const nudge = byClass(root, 'nudge')[0];
  assert.match(textOf(nudge), /Study is 4280 min short in the week of 5 Oct\./);
  assert.match(textOf(nudge), /Friday evening is free\./);

  // approve
  click(nudge, 'Use Friday evening');
  await app.store.idle();
  assert.match(textOf(fridayColumn(root)), /18:00–20:00/);
  assert.match(textOf(byClass(root, 'nudge')[0]), /Done\. Friday evening is in your plan\./);
  assert.match(textOf(byClass(root, 'nudge')[0]), /120 min of Study moved in\./);

  // undo
  click(byClass(root, 'nudge')[0], 'Undo');
  await app.store.idle();
  assert.match(textOf(fridayColumn(root)), /Nothing planned/);

  // dismiss ("Leave it") clears the warnings and Nudge goes quiet
  for (let i = 0; i < 5 && /Leave it/.test(textOf(byClass(root, 'nudge')[0])); i++) {
    click(byClass(root, 'nudge')[0], 'Leave it');
    await app.store.idle();
  }
  assert.match(textOf(byClass(root, 'nudge')[0]), /All clear\./);
  assert.match(textOf(root), /All clear/);
});

test('week navigation and the Menu work through the router', async () => {
  assert.equal((await put(studyState())).status, 200);
  const { app, root, document } = boot();
  await settled(app);
  click(root, 'Next');
  assert.equal(textOf(byTag(root, 'h1')[0]), 'Week 42');
  app.navigate('#/__proto__');
  assert.equal(textOf(byTag(root, 'h1')[0]), 'Week 41');
  app.navigate('#/week/2026-02-31');
  assert.equal(textOf(byTag(root, 'h1')[0]), 'Week 41');
  document.dispatch('keydown', { key: '/', target: { tag: 'body' } });
  assert.equal(app.menu.isOpen(), true);
  const typing = document.dispatch('keydown', { key: '/', target: { tag: 'input' } });
  assert.equal(typing.defaultPrevented, false);
});

test('an empty data file shows the first-run screen and Load the example fills it in', async () => {
  assert.equal((await put(emptyState())).status, 200);
  const { app, root } = boot();
  await settled(app);
  assert.match(textOf(root), /Nothing planned yet\./);
  click(root, 'Load the example');
  await app.store.idle();
  assert.doesNotMatch(textOf(root), /Nothing planned yet\./);
  assert.ok(byClass(root, 'blk').length > 0);
});

test('offline never shows a blank screen, and Retry recovers', async () => {
  assert.equal((await put(studyState())).status, 200);
  let down = true;
  const { app, root } = boot(async (p: string, i: any) => {
    if (down) throw new TypeError('failed');
    return fetch(base + p, i);
  });
  await settled(app);
  assert.match(textOf(root), /I can't reach the planner\./);
  assert.match(textOf(byClass(root, 'nudge')[0]), /npm run serve/);
  down = false;
  click(byClass(root, 'nudge')[0], 'Retry');
  await settled(app);
  assert.equal(byClass(root, 'day').length, 7);
});

test('a corrupt data file shows what went wrong instead of a blank screen', async () => {
  const { app, root } = boot(async () => ({ ok: false, status: 500, json: async () => ({ error: 'data/db.json is not a valid state file: tasks must be a list' }) }));
  await settled(app);
  assert.match(textOf(root), /Something went wrong\./);
  assert.match(textOf(root), /data\/db\.json is not a valid state file/);
  assert.equal(app.store.get().status, 'error');
});

test('hostile titles from the server render as text only', async () => {
  const evil = '<img src=x onerror=alert(1)>';
  assert.equal((await put(studyState({ tasks: [task({ title: evil, weeklyMinutes: 100 })] }))).status, 200);
  const { app, root } = boot();
  await settled(app);
  assert.match(textOf(root), /<img src=x onerror=alert\(1\)>/);
  assert.equal(findAll(root, (e) => e.tag === 'img').length, 0);
});

test('the Replan button is disabled while a request runs', async () => {
  assert.equal((await put(studyState())).status, 200);
  let release: Function = () => {};
  const gate = new Promise<void>((r) => (release = r));
  let held = false;
  const { app, root } = boot(async (p: string, i: any) => {
    if (held && p === '/api/replan') await gate;
    return fetch(base + p, i);
  });
  await settled(app);
  held = true;
  const replan = () => byTag(root, 'button').find((b: any) => textOf(b).includes('Replan'))!;
  replan().click();
  assert.equal(replan().hasAttribute('disabled'), true);
  release();
  await app.store.idle();
  assert.equal(replan().hasAttribute('disabled'), false);
});
