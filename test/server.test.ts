import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { createApp } from '../src/server.ts';
import { emptyState } from '../src/store.ts';
import { task } from './helpers.ts';

let server: Server;
let base: string;
let file: string;
let port: number;

before(async () => {
  file = join(mkdtempSync(join(tmpdir(), 'doitwithme-api-')), 'db.json');
  server = createApp(file);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
});

after(() => {
  server.close();
});

const json = { 'content-type': 'application/json' };
const put = (body: unknown) => fetch(`${base}/api/state`, { method: 'PUT', headers: json, body: JSON.stringify(body) });

test('GET /api/state on a fresh install returns an empty state', async () => {
  const res = await fetch(`${base}/api/state`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), emptyState());
});

test('PUT with an invalid body is a 400 and leaves the file untouched', async () => {
  const bad = { ...emptyState(), tasks: [task({ maxBlock: 0 })] };
  const res = await put(bad);
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /tasks\[0\]\.maxBlock/);
  assert.equal(existsSync(file), false);
});

test('PUT with a bad date like 2026-02-31 is rejected', async () => {
  const bad = { ...emptyState(), tasks: [task()], deadlines: [{ id: 'd', taskId: 't1', kind: 'exam', dueDate: '2026-02-31', effortMinutes: 60 }] };
  assert.equal((await put(bad)).status, 400);
});

test('PUT then GET returns what was saved', async () => {
  const good = { ...emptyState(), tasks: [task({ weeklyMinutes: 300 })] };
  assert.equal((await put(good)).status, 200);
  assert.deepEqual(await (await fetch(`${base}/api/state`)).json(), good);
});

test('POST /api/replan returns blocks and warnings and saves them', async () => {
  const res = await fetch(`${base}/api/replan`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ today: '2026-10-05' }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.blocks.length > 0);
  assert.ok(Array.isArray(body.warnings));
  const saved = await (await fetch(`${base}/api/state`)).json();
  assert.deepEqual(saved.blocks, body.blocks);
});

test('POST /api/replan rejects a bad request', async () => {
  const res = await fetch(`${base}/api/replan`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ today: 'tomorrow' }),
  });
  assert.equal(res.status, 400);
});

test('a cross-site style text/plain post is refused with 415', async () => {
  const res = await fetch(`${base}/api/replan`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify({ today: '2026-10-05' }),
  });
  assert.equal(res.status, 415);
});

test('malformed JSON is a 400', async () => {
  const res = await fetch(`${base}/api/state`, { method: 'PUT', headers: json, body: '{nope' });
  assert.equal(res.status, 400);
});

test('an unexpected Host header is refused with 403', async () => {
  const status = await new Promise<number>((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port, path: '/api/state', headers: { host: 'evil.example' } },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      },
    );
    req.on('error', reject);
    req.end();
  });
  assert.equal(status, 403);
});

test('unknown routes are 404', async () => {
  assert.equal((await fetch(`${base}/nope`)).status, 404);
});

test('a corrupt data file is a 500 that names the problem and is not overwritten', async () => {
  const bad = join(mkdtempSync(join(tmpdir(), 'doitwithme-corrupt-')), 'db.json');
  writeFileSync(bad, '{ broken');
  const s = createApp(bad);
  await new Promise<void>((resolve) => s.listen(0, '127.0.0.1', resolve));
  const p = (s.address() as AddressInfo).port;
  const res = await fetch(`http://127.0.0.1:${p}/api/state`);
  assert.equal(res.status, 500);
  assert.match((await res.json()).error, /db\.json/);
  s.close();
});
