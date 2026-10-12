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

const course = { credits: 3, difficulty: 3, examOnly: false, weeklyGraded: false, lab: false, syllabus: '', attendanceWeight: 0, recorded: 'yes' };
const state = () => ({
  ...emptyState(),
  tasks: [{ id: 'chem', title: 'Chemistry', category: 'study', weeklyMinutes: 10000, maxBlock: 120, onePerDay: false, priority: 3, course }],
  commitments: [{ id: 'lec', title: 'Chemistry lecture', category: 'class', start: 600, end: 720, bufferBefore: 0, exceptions: [], courseId: 'chem',
    pattern: { kind: 'weekly', weekdays: [1, 2, 3, 4, 5], from: '2026-10-05', to: '2026-12-31' } }],
  preferences: { ...structuredClone(defaultPreferences), weekdayWindow: { start: 480, end: 1320 }, daysOff: [], checkInEnabled: false },
});
const put = (s: any) => fetch(`${base}/api/state`, { method: 'PUT', headers: json, body: JSON.stringify(s) });

before(async () => {
  server = createApp(join(mkdtempSync(join(tmpdir(), 'doitwithme-skip-e2e-')), 'db.json'));
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
const exceptions = (app: any) => app.store.get().state.commitments.find((c: any) => c.id === 'lec').exceptions;
const shortBy = (app: any) => app.store.get().warnings.filter((w: any) => w.detail?.taskId === 'chem').reduce((t: number, w: any) => t + (w.detail.minutes ?? 0), 0);

test("Nudge offers to skip tomorrow's lecture, skipping frees the time, and Undo brings it back", async () => {
  assert.equal((await put(state())).status, 200);
  const { app, root } = boot();
  await settled(app);
  const offers = () => app.store.get().warnings.filter((w: any) => w.kind === 'skip-offer');
  assert.deepEqual(offers().map((w: any) => w.detail.date), ['2026-10-05', '2026-10-06', '2026-10-07']);
  const before = shortBy(app);
  for (let i = 0; i < 12 && !/Tomorrow 10:00/.test(textOf(root)); i++) click(root, '>');
  assert.match(textOf(root), /Chemistry lecture, Tomorrow 10:00, is recorded and counts 0%\./);
  click(root, 'Skip it');
  await settled(app);
  assert.deepEqual(exceptions(app), ['2026-10-06']);
  assert.match(textOf(root), /Skipped\. \d+h\d\d of Chemistry moved in\./);
  assert.ok(shortBy(app) < before, 'the shortfall shrank');
  assert.equal(offers().some((w: any) => w.detail.date === '2026-10-06'), false, 'the skipped day is not offered again');
  click(root, 'Undo');
  await settled(app);
  assert.deepEqual(exceptions(app), []);
  assert.equal(shortBy(app), before);
});

test('Leave it hides one class day and keeps the others offered', async () => {
  assert.equal((await put(state())).status, 200);
  const { app, root } = boot();
  await settled(app);
  for (let i = 0; i < 12 && !/Today 10:00/.test(textOf(root)); i++) click(root, '>');
  click(root, 'Leave it');
  await settled(app);
  const shown = app.store.get().warnings.filter((w: any) => w.kind === 'skip-offer' && !w.dismissed).map((w: any) => w.detail.date);
  assert.deepEqual(shown, ['2026-10-06', '2026-10-07']);
});
