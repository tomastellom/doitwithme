import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/server.ts';
import { emptyState, saveState } from '../src/store.ts';
import { fakeWorkloadProvider } from '../src/workload.ts';
import type { WorkloadProvider } from '../src/workload.ts';

const body = { title: 'Chemistry', credits: 3, difficulty: 4, examOnly: false, weeklyGraded: true, lab: false, syllabus: 'Weekly sets.' };
const json = { 'content-type': 'application/json' };
const servers: Server[] = [];
const bases: Record<string, string> = {};

async function start(name: string, workload?: WorkloadProvider, hoursPerCredit: number | null = 1) {
  const file = join(mkdtempSync(join(tmpdir(), 'doitwithme-estimate-')), 'db.json');
  const state = emptyState();
  state.preferences.hoursPerCredit = hoursPerCredit;
  saveState(file, state);
  const server = createApp(file, workload ? { workload } : {});
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  bases[name] = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
const post = (name: string, b: unknown) => fetch(`${bases[name]}/api/estimate`, { method: 'POST', headers: json, body: JSON.stringify(b) });

before(async () => {
  await start('none');
  await start('ready', fakeWorkloadProvider(300, 'Labs are heavy.'));
  await start('failing', { status: 'ready', async estimate() { throw new Error('boom'); } });
  await start('share', undefined, null);
});
after(() => servers.forEach((s) => s.close()));

test('the rule answers using the saved scale, and nothing is written', async () => {
  const res = await post('none', body);
  assert.equal(res.status, 200);
  const r = await res.json();
  assert.equal(r.rule.minutes, 240);
  assert.equal(r.ai, null);
  assert.equal(r.aiStatus, 'unavailable');
  const state = await (await fetch(`${bases.none}/api/state`)).json();
  assert.equal(state.tasks.length, 0);
});

test('without hours per credit the share of a normal semester is used', async () => {
  assert.equal((await (await post('share', body)).json()).rule.minutes, 315);
});

test('a ready AI answer arrives beside the rule, and a failing one does not lose the rule', async () => {
  const ready = await (await post('ready', body)).json();
  assert.deepEqual(ready.ai, { minutes: 300, reason: 'Labs are heavy.' });
  assert.equal(ready.aiStatus, 'ready');
  const failing = await (await post('failing', body)).json();
  assert.equal(failing.aiStatus, 'failed');
  assert.equal(failing.rule.minutes, 240);
});

test('bad requests are refused with plain sentences', async () => {
  for (const [patch, pattern] of [[{ credits: 0 }, /credits/], [{ difficulty: 9 }, /difficulty/], [{ title: '' }, /title/], [{ syllabus: 'x'.repeat(20001) }, /syllabus/]] as const) {
    const res = await post('none', { ...body, ...patch });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, pattern);
  }
  const wrongType = await fetch(`${bases.none}/api/estimate`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
  assert.equal(wrongType.status, 415);
});
