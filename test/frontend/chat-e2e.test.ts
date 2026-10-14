import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../../src/server.ts';
import { fakeChatProvider } from '../../src/chat.ts';
import { emptyState } from '../../src/store.ts';
import { defaultPreferences } from '../../src/defaults.ts';
import { startApp } from '../../public/js/main.js';
import { FakeDocument, byClass, byTag, findAll, textOf } from './fakedom.ts';

let server: Server;
let base: string;
const say = (text: string) => ({ text, toolCalls: [], assistantContent: [{ type: 'text', text }] });
const json = { 'content-type': 'application/json' };
const now = () => new Date(2026, 9, 5, 7, 0); // Monday 5 Oct 2026, 07:00

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
  server = createApp(join(mkdtempSync(join(tmpdir(), 'doitwithme-chat-e2e-')), 'db.json'), { chat: fakeChatProvider(() => say('You have Chemistry on Monday.')) });
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

test('typing a question in Nudge shows the answer, keeps it in Earlier, and the plan is unchanged', async () => {
  assert.equal((await put(state())).status, 200);
  const { app, root } = boot();
  await settled(app);
  const planBefore = JSON.stringify((await (await fetch(`${base}/api/state`)).json()).tasks);
  const input = findAll(root, (e: any) => e.getAttribute('data-fk') === 'nudge-ask')[0];
  input.value = 'What do I have on Monday?';
  input.dispatch('input');
  byTag(root, 'form')[0].dispatch('submit');
  for (let i = 0; i < 100 && !/You have Chemistry on Monday\./.test(textOf(root)); i++) await new Promise((r) => setTimeout(r, 10));
  assert.match(textOf(root), /You have Chemistry on Monday\./);
  assert.match(textOf(root), /Looked at \d+ items/);
  assert.match(textOf(root), /You asked: What do I have on Monday\?/, 'the question stays visible above the reply');
  findAll(root, (e: any) => e.getAttribute('data-fk') === 'nudge-earlier')[0].click();
  for (let i = 0; i < 100 && !/What do I have on Monday\?/.test(textOf(byClass(root, 'earlier')[0] ?? root)); i++) await new Promise((r) => setTimeout(r, 10));
  assert.match(textOf(byClass(root, 'earlier')[0]), /What do I have on Monday\?/);
  assert.equal(JSON.stringify((await (await fetch(`${base}/api/state`)).json()).tasks), planBefore, 'chat never changes the plan');
});
