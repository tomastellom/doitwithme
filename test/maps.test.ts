import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/server.ts';
import { MapsError, fakeProvider, googleProvider, unavailableProvider } from '../src/maps.ts';

test('the unavailable provider says so and refuses lookups', async () => {
  assert.equal(unavailableProvider.status, 'unavailable');
  await assert.rejects(unavailableProvider.lookup({ fromAddress: 'a', toAddress: 'b', mode: 'car' }), /not connected/);
});

test('the fake provider answers with a fixed time', async () => {
  const fake = fakeProvider(33);
  assert.equal(fake.status, 'ready');
  assert.deepEqual(await fake.lookup({ fromAddress: 'a', toAddress: 'b', mode: 'bike' }), { minutes: 33 });
});

let server: Server;
let ready: Server;
let base: string;
let readyBase: string;
const listen = async (s: Server) => {
  await new Promise<void>((resolve) => s.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
};

before(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'doitwithme-maps-'));
  server = createApp(join(dir, 'a.json'));
  ready = createApp(join(dir, 'b.json'), { maps: fakeProvider(10) });
  base = await listen(server);
  readyBase = await listen(ready);
});
after(() => {
  server.close();
  ready.close();
});

test('the status endpoint reports whether Maps can be used', async () => {
  assert.deepEqual(await (await fetch(`${base}/api/commute/status`)).json(), { maps: 'unavailable' });
  assert.deepEqual(await (await fetch(`${readyBase}/api/commute/status`)).json(), { maps: 'ready' });
});

const KEY = 'AIza-secret-key-123';
const answer = (status: number, body: unknown, bad = false) => async () =>
  ({ ok: status >= 200 && status < 300, status, json: async () => { if (bad) throw new Error('not json'); return body; } }) as any;
function recorder(reply: any) {
  const calls: any[] = [];
  const fetchFn = (async (url: string, init: any) => { calls.push({ url, init }); return reply(url, init); }) as any;
  return { calls, fetchFn };
}
const ask = (p: any, mode: any = 'car') => p.lookup({ fromAddress: '1 Main St', toAddress: '9 Uni Rd', mode });

test('the Google provider sends one safe request and reads the duration', async () => {
  const { calls, fetchFn } = recorder(answer(200, { routes: [{ duration: '1400s' }] }));
  const provider = googleProvider({ key: KEY, fetchFn });
  assert.equal(provider.status, 'ready');
  assert.deepEqual(await ask(provider), { minutes: 24 }, '1400 s rounds up to 24 min');
  const [{ url, init }] = calls;
  assert.equal(url, 'https://routes.googleapis.com/directions/v2:computeRoutes');
  assert.equal(init.method, 'POST');
  assert.equal(init.redirect, 'error');
  assert.ok(init.signal);
  assert.equal(init.headers['x-goog-api-key'], KEY);
  assert.equal(init.headers['x-goog-fieldmask'], 'routes.duration');
  assert.equal(url.includes(KEY) || init.body.includes(KEY), false, 'the key is only in the header');
  assert.deepEqual(JSON.parse(init.body), { origin: { address: '1 Main St' }, destination: { address: '9 Uni Rd' }, travelMode: 'DRIVE' });
});

test('each travel mode maps to Google, the region is added only when set, and routingPreference never is', async () => {
  const { calls, fetchFn } = recorder(answer(200, { routes: [{ duration: '60s' }] }));
  const plain = googleProvider({ key: KEY, fetchFn });
  for (const mode of ['car', 'bike', 'transit', 'walk']) await ask(plain, mode);
  assert.deepEqual(calls.map((c) => JSON.parse(c.init.body).travelMode), ['DRIVE', 'BICYCLE', 'TRANSIT', 'WALK']);
  assert.equal(calls.some((c) => 'routingPreference' in JSON.parse(c.init.body) || 'regionCode' in JSON.parse(c.init.body)), false);
  const regional = recorder(answer(200, { routes: [{ duration: '60s' }] }));
  await ask(googleProvider({ key: KEY, fetchFn: regional.fetchFn, regionCode: 'es' }));
  assert.equal(JSON.parse(regional.calls[0].init.body).regionCode, 'es');
});

test('durations round up, never go above 600 minutes, and odd ones are refused', async () => {
  const minutes = async (duration: string) => (await ask(googleProvider({ key: KEY, fetchFn: recorder(answer(200, { routes: [{ duration }] })).fetchFn }))).minutes;
  assert.equal(await minutes('1s'), 1);
  assert.equal(await minutes('0s'), 0);
  assert.equal(await minutes('120s'), 2);
  assert.equal(await minutes('99999s'), 600);
  assert.equal(await minutes('1400.5s'), 24);
  for (const bad of ['soon', '-5s', '12m', '']) {
    await assert.rejects(ask(googleProvider({ key: KEY, fetchFn: recorder(answer(200, { routes: [{ duration: bad }] })).fetchFn })), (e: any) => e instanceof MapsError && e.code === 'bad-response');
  }
});

test('every failure has a code and a plain message that never contains the key', async () => {
  const cases: Array<[any, string, RegExp]> = [
    [answer(200, {}), 'no-route', /no route/],
    [answer(200, { routes: [] }), 'no-route', /no route/],
    [answer(401, { error: { message: `bad key ${KEY}` } }), 'key', /rejected the key/],
    [answer(403, { error: { message: `billing off ${KEY}` } }), 'key', /billing is on/],
    [answer(429, {}), 'quota', /quota/i],
    [answer(400, {}), 'address', /addresses/],
    [answer(404, {}), 'address', /addresses/],
    [answer(500, {}), 'bad-response', /Google/],
    [answer(200, null, true), 'bad-response', /Google/],
    [async () => { throw new Error(`network down ${KEY}`); }, 'offline', /reach Google/],
    [async () => { throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }); }, 'offline', /reach Google/],
  ];
  for (const [reply, code, text] of cases) {
    await assert.rejects(ask(googleProvider({ key: KEY, fetchFn: recorder(reply).fetchFn })), (e: any) => {
      assert.ok(e instanceof MapsError, 'a MapsError');
      assert.equal(e.code, code);
      assert.match(e.message, text);
      assert.equal(e.message.includes(KEY), false);
      return true;
    });
  }
});

test('hostile address text travels as JSON data only', async () => {
  const evil = '"}, "travelMode": "TRUCK", {"x":"<script>';
  const { calls, fetchFn } = recorder(answer(200, { routes: [{ duration: '60s' }] }));
  await googleProvider({ key: KEY, fetchFn }).lookup({ fromAddress: evil, toAddress: evil, mode: 'car' });
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.origin.address, evil);
  assert.equal(body.travelMode, 'DRIVE');
});
