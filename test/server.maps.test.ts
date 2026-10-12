import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { createApp } from '../src/server.ts';
import { MapsError } from '../src/maps.ts';
import { emptyState } from '../src/store.ts';

const json = { 'content-type': 'application/json' };
const TODAY = '2026-10-12';
let ready: Server;
let plain: Server;
let readyBase: string;
let plainBase: string;
let failure: MapsError | null = null;
const maps = { status: 'ready' as const, async lookup() { if (failure) throw failure; return { minutes: 41 }; } };
const listen = async (s: Server) => {
  await new Promise<void>((resolve) => s.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
};
const state = () => ({
  ...emptyState(),
  places: [{ id: 'h', name: 'Home', kind: 'home', address: '1 Main St' }, { id: 'c', name: 'Campus', kind: 'campus', address: '9 Uni Rd' }],
  commutes: [
    { id: 'k', fromPlaceId: 'h', toPlaceId: 'c', repeats: null, marginMinutes: 10, source: { method: 'maps', mode: 'bike', fallbackMinutes: 30 } },
    { id: 't', fromPlaceId: 'h', toPlaceId: 'c', repeats: null, marginMinutes: 0, source: { method: 'typed', minutes: 20 } },
  ],
});
const put = (base: string) => fetch(`${base}/api/state`, { method: 'PUT', headers: json, body: JSON.stringify(state()) });
const post = (base: string, path: string, body: unknown) => fetch(`${base}${path}`, { method: 'POST', headers: json, body: JSON.stringify(body) });

before(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'doitwithme-maps-api-'));
  ready = createApp(join(dir, 'a.json'), { maps, mapsLimit: 3 });
  plain = createApp(join(dir, 'b.json'));
  readyBase = await listen(ready);
  plainBase = await listen(plain);
  assert.equal((await put(readyBase)).status, 200);
  assert.equal((await put(plainBase)).status, 200);
});
after(() => { ready.close(); plain.close(); });

test('without a key the lookup endpoints say so and status stays as it was', async () => {
  assert.deepEqual(await (await fetch(`${plainBase}/api/commute/status`)).json(), { maps: 'unavailable' });
  assert.equal((await post(plainBase, '/api/commute/lookup', { today: TODAY, commuteId: 'k' })).status, 503);
  assert.equal((await post(plainBase, '/api/commute/refresh', { today: TODAY })).status, 503);
});

test('a lookup stores the result, shows in the state and the usage, and bad requests are 400', async () => {
  const body = await (await post(readyBase, '/api/commute/lookup', { today: TODAY, commuteId: 'k' })).json();
  assert.deepEqual(body, { ok: true, minutes: 41, at: TODAY });
  const saved = await (await fetch(`${readyBase}/api/state`)).json();
  assert.equal(saved.commutes[0].source.found.minutes, 41);
  assert.equal((await post(readyBase, '/api/commute/lookup', { today: TODAY, commuteId: 't' })).status, 400);
  assert.equal((await post(readyBase, '/api/commute/lookup', { today: TODAY, commuteId: 'nope' })).status, 400);
  assert.equal((await post(readyBase, '/api/commute/lookup', { today: 'soon', commuteId: 'k' })).status, 400);
  assert.equal((await post(readyBase, '/api/commute/lookup', { today: TODAY })).status, 400);
  assert.equal((await post(readyBase, '/api/commute/refresh', { today: 'soon' })).status, 400);
});

test('failures come back as plain messages, and the monthly limit is reported before Google is asked', async () => {
  failure = new MapsError('key', 'Google rejected the key. Check that the Routes API is enabled for it and that billing is on.');
  const failed = await (await post(readyBase, '/api/commute/lookup', { today: TODAY, commuteId: 'k' })).json();
  assert.deepEqual([failed.ok, failed.code], [false, 'key']);
  failure = null;
  const used = await (await fetch(`${readyBase}/api/commute/status`)).json();
  assert.equal(used.maps, 'ready');
  assert.equal(used.usage.limit, 3);
  const limited = await (await post(readyBase, '/api/commute/lookup', { today: TODAY, commuteId: 'k' })).json();
  assert.deepEqual([limited.ok, limited.code], [true, undefined], 'two of three used, one left');
  const over = await (await post(readyBase, '/api/commute/lookup', { today: TODAY, commuteId: 'k' })).json();
  assert.deepEqual([over.ok, over.code], [false, 'limit']);
});
