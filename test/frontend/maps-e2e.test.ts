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
import { FakeDocument } from './fakedom.ts';

let server: Server;
let base: string;
const json = { 'content-type': 'application/json' };
const now = () => new Date(2026, 9, 5, 7, 0); // Monday 5 Oct 2026, 07:00

const asked: any[] = [];
const stateWithMapsCommute = () => ({
  ...emptyState(),
  tasks: [{ id: 't', title: 'Study', category: 'study', weeklyMinutes: 300, maxBlock: 120, onePerDay: false, priority: 3 }],
  places: [{ id: 'h', name: 'Home', kind: 'home', address: '1 Main St' }, { id: 'c', name: 'Campus', kind: 'campus', address: '9 Uni Rd' }],
  commitments: [{ id: 'lec', title: 'Lecture at Campus', category: 'class', start: 720, end: 780, bufferBefore: 0, exceptions: [],
    pattern: { kind: 'weekly', weekdays: [1], from: '2026-10-05', to: '2026-12-31' } }],
  commutes: [{ id: 'k', fromPlaceId: 'h', toPlaceId: 'c', repeats: null, marginMinutes: 10, source: { method: 'maps', mode: 'transit', fallbackMinutes: 30 } }],
  preferences: { ...structuredClone(defaultPreferences), checkInEnabled: false },
});
const put = (s: any) => fetch(`${base}/api/state`, { method: 'PUT', headers: json, body: JSON.stringify(s) });

before(async () => {
  const maps = { status: 'ready' as const, async lookup(q: any) { asked.push(q); return { minutes: 50 }; } };
  server = createApp(join(mkdtempSync(join(tmpdir(), 'doitwithme-maps-e2e-')), 'db.json'), { maps });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => { server.close(); });

function boot() {
  const document: any = new FakeDocument();
  const root = document.createElement('div');
  const win: any = { location: { hash: '' }, localStorage: undefined, listeners: {}, addEventListener(t: string, f: Function) { (this.listeners[t] ??= []).push(f); } };
  const app: any = startApp({ root, document, fetch: (p: string, i: any) => fetch(base + p, i), win, now });
  return { app, root };
}
async function settled(app: any) {
  for (let i = 0; i < 300; i++) {
    const s = app.store.get();
    if (s.status !== 'loading' && !s.busy) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('the app did not settle');
}

const legsToCampus = (app: any) => app.store.get().travel.filter((l: any) => l.date === '2026-10-05' && l.toName === 'Campus');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('a stale Maps commute is refreshed at load, and the planner uses the found time plus the margin', async () => {
  assert.equal((await put(stateWithMapsCommute())).status, 200);
  const { app } = boot();
  await settled(app);
  await wait(150);
  await settled(app);
  assert.equal(asked.length, 1);
  assert.deepEqual(asked[0], { fromAddress: '1 Main St', toAddress: '9 Uni Rd', mode: 'transit' });
  const legs = legsToCampus(app);
  assert.equal(legs.length, 1);
  assert.equal(legs[0].end - legs[0].start, 60, '50 found plus 10 margin');
  assert.equal(legs[0].estimated, false);
  const saved = await (await fetch(`${base}/api/state`)).json();
  assert.equal(saved.commutes[0].source.found.minutes, 50);
  assert.equal(saved.mapsUsage.count, 1);
});

test('a second load finds the result fresh and asks Google nothing', async () => {
  const before = asked.length;
  const { app } = boot();
  await settled(app);
  await wait(150);
  assert.equal(asked.length, before);
});

test('changing the address of a place makes the old result stop counting, until it is looked up again', async () => {
  const saved: any = await (await fetch(`${base}/api/state`)).json();
  saved.places = saved.places.map((p: any) => (p.id === 'c' ? { ...p, address: '77 New Ave' } : p));
  assert.equal((await put(saved)).status, 200);
  const { app } = boot();
  await settled(app);
  await wait(150);
  await settled(app);
  assert.equal(asked.at(-1).toAddress, '77 New Ave', 'it looked the new address up');
  assert.equal(legsToCampus(app).length, 1);
});
