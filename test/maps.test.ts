import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/server.ts';
import { fakeProvider, unavailableProvider } from '../src/maps.ts';

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
