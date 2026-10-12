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
import { FakeDocument, byTag, textOf } from './fakedom.ts';

let server: Server;
let base: string;
const json = { 'content-type': 'application/json' };
const now = () => new Date(2026, 9, 5, 7, 0); // Monday 5 Oct 2026, 07:00
const ASKING = /How are you today\?|treating you|feeling today/;

const roomy = () => ({
  ...emptyState(),
  tasks: [{ id: 't1', title: 'Study', category: 'study', weeklyMinutes: 2000, maxBlock: 120, onePerDay: false, priority: 3 }],
  preferences: { ...structuredClone(defaultPreferences), weekdayWindow: { start: 480, end: 1320 }, daysOff: [], checkInEnabled: true },
});
const put = (state: any) => fetch(`${base}/api/state`, { method: 'PUT', headers: json, body: JSON.stringify(state) });

before(async () => {
  server = createApp(join(mkdtempSync(join(tmpdir(), 'doitwithme-checkin-e2e-')), 'db.json'));
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
const click = (root: any, label: string) => byTag(root, 'button').find((b: any) => textOf(b).trim() === label)!.click();

test('open the app, answer Low, see the day shrink and the work move, then undo', async () => {
  assert.equal((await put(roomy())).status, 200);
  const { app, root } = boot();
  await settled(app);
  assert.match(textOf(root), ASKING);
  const today = () => app.store.get().state.blocks.filter((b: any) => b.date === '2026-10-05').reduce((t: number, b: any) => t + b.end - b.start, 0);
  const full = today();
  assert.ok(full > 120);
  click(root, 'Low');
  await settled(app);
  assert.equal(today(), 120);
  assert.match(textOf(root), /Kept 2h00 today, moved .* to /);
  click(root, "Actually, I'm okay");
  await settled(app);
  assert.equal(today(), full);
  assert.equal(app.store.get().state.checkIns[0].mood, 'okay');
});

test('Not now is remembered and only a button brings the question back', async () => {
  assert.equal((await put(roomy())).status, 200);
  const first = boot();
  await settled(first.app);
  click(first.root, 'Not now');
  await settled(first.app);
  const again = boot();
  await settled(again.app);
  assert.doesNotMatch(textOf(again.root), ASKING);
  click(again.root, 'Check in');
  assert.match(textOf(again.root), ASKING);
});

test('it never asks when the check-in is off', async () => {
  const off = roomy();
  off.preferences.checkInEnabled = false;
  assert.equal((await put(off)).status, 200);
  const { app, root } = boot();
  await settled(app);
  assert.doesNotMatch(textOf(root), ASKING);
});
