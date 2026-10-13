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

test('estimate posts the course to the estimate endpoint', async () => {
  const f = fakeFetch([{ status: 200, body: { rule: { minutes: 240 } } }]);
  const api = createApi(f.fn as any);
  assert.deepEqual(await api.estimate({ title: 'x' }), { rule: { minutes: 240 } });
  assert.deepEqual([f.calls[0].init.method, f.calls[0].path, JSON.parse(f.calls[0].init.body)], ['POST', '/api/estimate', { title: 'x' }]);
});

test('checkIn posts the mood with the clock', async () => {
  const f = fakeFetch([{ status: 200, body: {} }]);
  const api = createApi(f.fn as any);
  await api.checkIn('low', { today: '2026-10-05', nowMinutes: 540, horizonDays: 14 });
  assert.deepEqual([f.calls[0].init.method, f.calls[0].path, JSON.parse(f.calls[0].init.body)], ['POST', '/api/checkin', { today: '2026-10-05', nowMinutes: 540, horizonDays: 14, mood: 'low' }]);
});

test('lookupCommute and refreshCommutes post the clock', async () => {
  const f = fakeFetch([{ status: 200, body: { ok: true } }, { status: 200, body: { updated: 0 } }]);
  const api = createApi(f.fn as any);
  await api.lookupCommute('k', clock);
  await api.refreshCommutes(clock);
  assert.deepEqual([f.calls[0].path, JSON.parse(f.calls[0].init.body)], ['/api/commute/lookup', { today: '2026-10-05', commuteId: 'k' }]);
  assert.deepEqual([f.calls[1].path, JSON.parse(f.calls[1].init.body)], ['/api/commute/refresh', { today: '2026-10-05' }]);
});

test('chat calls use the right method, path and body', async () => {
  const f = fakeFetch([{ status: 200, body: { answer: 'hi', sent: 3, remaining: 29 } }, { status: 200, body: { entries: [] } }, { status: 200, body: { ok: true } }]);
  const api = createApi(f.fn as any);
  assert.deepEqual(await api.chat(clock, 'What is on?'), { answer: 'hi', sent: 3, remaining: 29 });
  await api.chatHistory();
  await api.clearChatHistory();
  assert.deepEqual(f.calls.map((c) => [c.init.method, c.path]), [['POST', '/api/chat'], ['GET', '/api/chat/history'], ['DELETE', '/api/chat/history']]);
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { today: '2026-10-05', nowMinutes: 540, message: 'What is on?' });
});
