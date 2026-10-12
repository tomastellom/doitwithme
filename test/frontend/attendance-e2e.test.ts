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
const ASKING = /How are you today\?|treating you|feeling today/;

const course = { credits: 3, difficulty: 3, examOnly: false, weeklyGraded: false, lab: false, syllabus: '', attendanceWeight: 0, recorded: 'yes' };
const state = () => ({
  ...emptyState(),
  tasks: [{ id: 'chem', title: 'Chemistry', category: 'study', weeklyMinutes: 10000, maxBlock: 120, onePerDay: false, priority: 3, course }],
  commitments: [{ id: 'lec', title: 'Chemistry lecture', category: 'class', start: 600, end: 720, bufferBefore: 0, exceptions: [], courseId: 'chem',
    pattern: { kind: 'weekly', weekdays: [1], from: '2026-10-05', to: '2026-12-31' } }],
  preferences: { ...structuredClone(defaultPreferences), weekdayWindow: { start: 480, end: 1320 }, daysOff: [], checkInEnabled: false },
});
const put = (s: any) => fetch(`${base}/api/state`, { method: 'PUT', headers: json, body: JSON.stringify(s) });

before(async () => {
  server = createApp(join(mkdtempSync(join(tmpdir(), 'doitwithme-attendance-e2e-')), 'db.json'));
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

test('a behind, recorded, zero-weight class shows Skippable, and skipping it frees the time', async () => {
  assert.equal((await put(state())).status, 200);
  const { app } = boot();
  await settled(app);
  const adviceFor = (date: string) => app.store.get().attendance.find((a: any) => a.commitmentId === 'lec' && a.date === date);
  assert.equal(adviceFor('2026-10-05').verdict, 'skippable');
  const used = (date: string) => app.store.get().state.blocks.filter((b: any) => b.date === date && b.start < 720 && b.end > 600).length;
  assert.equal(used('2026-10-05'), 0, 'the lecture holds its slot');
  await app.store.saveState((fresh: any) => ({
    ...fresh,
    commitments: fresh.commitments.map((c: any) => (c.id === 'lec' ? { ...c, exceptions: ['2026-10-05'] } : c)),
  }));
  await settled(app);
  assert.equal(adviceFor('2026-10-05'), undefined, 'a skipped date gets no advice');
  assert.equal(adviceFor('2026-10-12').verdict, 'skippable', 'the next week still does');
  assert.ok(used('2026-10-05') > 0, 'the planner now uses the freed slot');
});
