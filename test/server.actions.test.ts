import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { createApp } from '../src/server.ts';
import { emptyState } from '../src/store.ts';
import { defaultPreferences } from '../src/defaults.ts';
import { task } from './helpers.ts';

let server: Server;
let base: string;
let file: string;

const FRI = '2026-10-09';
const json = { 'content-type': 'application/json' };
const clock = { today: '2026-10-05', horizonDays: 7 };
const post = (path: string, body: unknown, headers: Record<string, string> = json) =>
  fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });

before(async () => {
  file = join(mkdtempSync(join(tmpdir(), 'doitwithme-actions-')), 'db.json');
  server = createApp(file);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const state = {
    ...emptyState(),
    tasks: [task({ weeklyMinutes: 5000 })],
    preferences: {
      ...structuredClone(defaultPreferences),
      weekdayWindow: { start: 1080, end: 1200 },
      dayOffWindow: { start: 1080, end: 1200 },
      daysOff: [],
      softWindows: [{ weekday: 5, start: 1080, end: 1440 }],
      softMode: 'ask',
    },
  };
  const res = await fetch(`${base}/api/state`, { method: 'PUT', headers: json, body: JSON.stringify(state) });
  assert.equal(res.status, 200);
});

after(() => {
  server.close();
});

test('replan returns warnings with a key and a dismissed flag, and an offer', async () => {
  const body = await (await post('/api/replan', clock)).json();
  assert.equal(body.blocks.filter((b: any) => b.date === FRI).length, 0);
  assert.ok(body.warnings.every((w: any) => typeof w.key === 'string' && w.dismissed === false));
  assert.equal(body.warnings.find((w: any) => w.kind === 'soft-offer').detail.date, FRI);
});

test('approve opens the date, replans, and is idempotent', async () => {
  const first = await post('/api/soft/approve', { ...clock, date: FRI });
  assert.equal(first.status, 200);
  const a = await first.json();
  assert.equal(a.blocks.filter((b: any) => b.date === FRI).length, 1);
  assert.deepEqual(a.approvedSoft, [FRI]);
  assert.ok(a.warnings.some((w: any) => w.kind === 'soft-time-used'));
  const b = await (await post('/api/soft/approve', { ...clock, date: FRI })).json();
  assert.deepEqual(b.approvedSoft, [FRI]);
});

test('undo takes the date back out and replans', async () => {
  const body = await (await post('/api/soft/undo', { ...clock, date: FRI })).json();
  assert.deepEqual(body.approvedSoft, []);
  assert.equal(body.blocks.filter((b: any) => b.date === FRI).length, 0);
  const again = await (await post('/api/soft/undo', { ...clock, date: FRI })).json();
  assert.deepEqual(again.approvedSoft, []);
});

test('dismiss marks the warning dismissed and keeps its key', async () => {
  const before = await (await post('/api/replan', clock)).json();
  const key = before.warnings.find((w: any) => w.kind === 'soft-offer').key;
  const body = await (await post('/api/warnings/dismiss', { ...clock, key })).json();
  assert.deepEqual(body.dismissed, [key]);
  assert.equal(body.warnings.find((w: any) => w.key === key).dismissed, true);
  const twice = await (await post('/api/warnings/dismiss', { ...clock, key })).json();
  assert.deepEqual(twice.dismissed, [key]);
});

test('garbage is a 4xx and leaves the data file byte-for-byte unchanged', async () => {
  const snapshot = readFileSync(file, 'utf8');
  const cases: Array<[string, unknown, number, Record<string, string>?]> = [
    ['/api/soft/approve', { ...clock, date: 'nope' }, 400],
    ['/api/soft/approve', { ...clock, date: '2026-02-31' }, 400],
    ['/api/soft/approve', { ...clock, date: '2026-10-01' }, 400],
    ['/api/soft/approve', { date: FRI }, 400],
    ['/api/soft/undo', { ...clock, date: 5 }, 400],
    ['/api/warnings/dismiss', { ...clock, key: 'x'.repeat(301) }, 400],
    ['/api/warnings/dismiss', { ...clock, key: '' }, 400],
    ['/api/soft/approve', { ...clock, date: FRI }, 415, { 'content-type': 'text/plain' }],
  ];
  for (const [path, body, status, headers] of cases) {
    const res = await post(path, body, headers);
    assert.equal(res.status, status, `${path} ${JSON.stringify(body)}`);
  }
  assert.equal(readFileSync(file, 'utf8'), snapshot);
});
