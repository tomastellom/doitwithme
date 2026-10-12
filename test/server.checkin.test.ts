import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { createApp } from '../src/server.ts';
import { emptyState } from '../src/store.ts';
import { task } from './helpers.ts';

let server: Server;
let base: string;
const json = { 'content-type': 'application/json' };
const clock = { today: '2026-10-05', horizonDays: 14 };
const post = (body: unknown) => fetch(`${base}/api/checkin`, { method: 'POST', headers: json, body: JSON.stringify(body) });

before(async () => {
  server = createApp(join(mkdtempSync(join(tmpdir(), 'doitwithme-checkin-')), 'db.json'));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const state = { ...emptyState(), tasks: [task({ weeklyMinutes: 2000 })] };
  assert.equal((await fetch(`${base}/api/state`, { method: 'PUT', headers: json, body: JSON.stringify(state) })).status, 200);
});
after(() => { server.close(); });

test('low is stored, replans and says what moved; okay takes it back', async () => {
  const low = await (await post({ ...clock, mood: 'low' })).json();
  assert.deepEqual(low.checkIns, [{ date: clock.today, mood: 'low' }]);
  assert.ok(low.moved.minutes > 0);
  const today = (blocks: any[]) => blocks.filter((x) => x.date === clock.today).reduce((t, x) => t + x.end - x.start, 0);
  assert.equal(today(low.blocks), 120);
  const okay = await (await post({ ...clock, mood: 'okay' })).json();
  assert.equal(okay.moved, null);
  assert.deepEqual(okay.checkIns, [{ date: clock.today, mood: 'okay' }]);
  const saved = await (await fetch(`${base}/api/state`)).json();
  assert.deepEqual(saved.checkIns, [{ date: clock.today, mood: 'okay' }]);
});

test('a bad mood, a missing clock or a wrong content type changes nothing', async () => {
  const before = await (await fetch(`${base}/api/state`)).text();
  assert.equal((await post({ ...clock, mood: 'great' })).status, 400);
  assert.equal((await post({ ...clock, mood: '<script>' })).status, 400);
  assert.equal((await post({ mood: 'low' })).status, 400);
  assert.equal((await fetch(`${base}/api/checkin`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })).status, 415);
  assert.equal(await (await fetch(`${base}/api/state`)).text(), before);
});
