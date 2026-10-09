import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createApi } from '../../public/js/api.js';

function fakeFetch(responses: any[]) {
  const calls: any[] = [];
  const fn = async (path: string, init: any) => {
    calls.push({ path, init });
    const r = responses.shift();
    if (r instanceof Error) throw r;
    return { ok: r.status < 400, status: r.status, json: async () => { if (r.bad) throw new Error('bad json'); return r.body; } };
  };
  return { fn, calls };
}
const clock = { today: '2026-10-05', nowMinutes: 540, horizonDays: 14 };

test('each call uses the right method, path and JSON body', async () => {
  const f = fakeFetch(Array.from({ length: 7 }, () => ({ status: 200, body: { ok: true } })));
  const api = createApi(f.fn as any);
  await api.getState();
  await api.putState({ a: 1 });
  await api.example();
  await api.replan(clock);
  await api.approve('2026-10-09', clock);
  await api.undo('2026-10-09', clock);
  await api.dismiss('k|x', clock);
  assert.deepEqual(f.calls.map((c) => [c.init.method, c.path]), [
    ['GET', '/api/state'], ['PUT', '/api/state'], ['GET', '/api/example'], ['POST', '/api/replan'],
    ['POST', '/api/soft/approve'], ['POST', '/api/soft/undo'], ['POST', '/api/warnings/dismiss'],
  ]);
  assert.equal(f.calls[0].init.body, undefined);
  assert.equal(f.calls[1].init.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(f.calls[4].init.body), { ...clock, date: '2026-10-09' });
  assert.deepEqual(JSON.parse(f.calls[6].init.body), { ...clock, key: 'k|x' });
});

test('a network failure is an ApiError with status 0', async () => {
  const api = createApi(fakeFetch([new TypeError('failed')]).fn as any);
  await assert.rejects(api.getState(), (e: any) => e instanceof ApiError && e.status === 0);
});

test('an error response carries the server message, or a generic one when the body is not JSON', async () => {
  const api = createApi(fakeFetch([{ status: 400, body: { error: 'date must not be in the past' } }, { status: 500, bad: true }]).fn as any);
  await assert.rejects(api.approve('2026-10-01', clock), (e: any) => e.status === 400 && e.message === 'date must not be in the past');
  await assert.rejects(api.getState(), (e: any) => e.status === 500 && /500/.test(e.message));
});

test('commuteStatus asks the server whether Google Maps can be used', async () => {
  const f = fakeFetch([{ status: 200, body: { maps: 'unavailable' } }]);
  const api = createApi(f.fn as any);
  assert.deepEqual(await api.commuteStatus(), { maps: 'unavailable' });
  assert.deepEqual([f.calls[0].init.method, f.calls[0].path], ['GET', '/api/commute/status']);
});
