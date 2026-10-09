import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../../public/js/api.js';
import { createStore } from '../../public/js/store.js';

const clock = { today: '2026-10-05', nowMinutes: 540, horizonDays: 14 };
const full = (over: any = {}) => ({
  commitments: [], tasks: [{ id: 't' }], deadlines: [], preferences: {}, blocks: [], approvedSoft: [], dismissed: [], ...over,
});
const result = (over: any = {}) => ({ blocks: [{ date: '2026-10-05' }], warnings: [], approvedSoft: [], dismissed: [], ...over });

function fakeApi(over: any = {}) {
  const calls: string[] = [];
  const rec = (name: string, fn: Function) => async (...args: any[]) => { calls.push(name); return fn(...args); };
  const api = {
    getState: rec('getState', () => full()),
    putState: rec('putState', () => ({ ok: true })),
    example: rec('example', () => full()),
    replan: rec('replan', () => result()),
    approve: rec('approve', () => result()),
    undo: rec('undo', () => result()),
    dismiss: rec('dismiss', () => result()),
    ...Object.fromEntries(Object.entries(over).map(([k, v]: any) => [k, rec(k, v)])),
  };
  return { api, calls };
}
const make = (over: any = {}) => { const f = fakeApi(over); return { ...f, store: createStore(f.api as any, () => clock) }; };

test('load replans a populated schedule and merges the plan into the state', async () => {
  const { store, calls } = make();
  await store.load();
  const s = store.get();
  assert.equal(s.status, 'ready');
  assert.equal(s.isEmpty, false);
  assert.deepEqual(calls, ['getState', 'replan']);
  assert.deepEqual(s.state.blocks, [{ date: '2026-10-05' }]);
  assert.deepEqual(s.state.tasks, [{ id: 't' }]);
});

test('an empty schedule is flagged and not replanned', async () => {
  const { store, calls } = make({ getState: () => full({ tasks: [], commitments: [] }) });
  await store.load();
  assert.equal(store.get().isEmpty, true);
  assert.equal(store.get().status, 'ready');
  assert.deepEqual(calls, ['getState']);
});

test('a network failure is offline, any other failure is an error, and retry recovers', async () => {
  let fail: any = new ApiError(0, 'The planner is not reachable');
  const { store } = make({ getState: () => { if (fail) throw fail; return full(); } });
  await store.load();
  assert.equal(store.get().status, 'offline');
  fail = new ApiError(500, 'boom');
  await store.load();
  assert.deepEqual([store.get().status, store.get().error], ['error', 'boom']);
  fail = null;
  await store.load();
  assert.equal(store.get().status, 'ready');
});

test('approve builds the confirmation from the response', async () => {
  const { store } = make({
    approve: () => result({ warnings: [{ kind: 'soft-time-used', detail: { date: '2026-10-09', titles: ['Chemistry'], minutes: 120 } }], approvedSoft: ['2026-10-09'] }),
  });
  await store.load();
  await store.approve('2026-10-09');
  assert.deepEqual(store.get().confirm, { date: '2026-10-09', weekday: 'Friday', minutes: 120, titles: ['Chemistry'], used: true });
  assert.deepEqual(store.get().approvedSoft, ['2026-10-09']);
  store.clearConfirm();
  assert.equal(store.get().confirm, null);
});

test('clearConfirm also clears a notice', async () => {
  const { store } = make({ dismiss: () => { throw new ApiError(409, 'gone'); } });
  await store.load();
  await store.dismiss(['k']);
  assert.ok(store.get().notice);
  store.clearConfirm();
  assert.equal(store.get().notice, null);
});

test('undo clears the confirmation and updates the approvals', async () => {
  const { store } = make({ undo: () => result({ approvedSoft: [] }) });
  await store.load();
  await store.approve('2026-10-09');
  await store.undo('2026-10-09');
  assert.equal(store.get().confirm, null);
  assert.deepEqual(store.get().approvedSoft, []);
});

test('a second click while a request runs does not send another request', async () => {
  let release: Function = () => {};
  const gate = new Promise<void>((r) => (release = r));
  const { store, calls } = make({ approve: async () => { await gate; return result(); } });
  await store.load();
  const first = store.approve('2026-10-09');
  const second = store.approve('2026-10-09');
  const third = store.replan();
  assert.equal(store.get().busy, true);
  release();
  await Promise.all([first, second, third]);
  assert.equal(calls.filter((c) => c === 'approve').length, 1);
  assert.equal(calls.filter((c) => c === 'replan').length, 1);
  assert.equal(store.get().busy, false);
});

test('dismiss sends every key, ignores a 409, and surfaces other errors', async () => {
  const sent: string[] = [];
  const { store } = make({
    dismiss: (key: string) => { sent.push(key); if (key === 'gone') throw new ApiError(409, 'no longer open'); return result({ dismissed: ['a'] }); },
  });
  await store.load();
  await store.dismiss(['a', 'gone']);
  assert.deepEqual(sent, ['a', 'gone']);
  assert.equal(store.get().status, 'ready');
  assert.deepEqual(store.get().dismissed, ['a']);
  const bad = make({ dismiss: () => { throw new ApiError(500, 'boom'); } });
  await bad.store.load();
  await bad.store.dismiss(['x']);
  assert.equal(bad.store.get().status, 'error');
  assert.equal(bad.store.get().busy, false);
});

test('loadExample saves the example, reloads and replans', async () => {
  const { store, calls } = make({ getState: () => full({ tasks: [], commitments: [] }) });
  await store.load();
  await store.loadExample();
  assert.deepEqual(calls, ['getState', 'example', 'putState', 'getState', 'replan']);
});

test('subscribe notifies on change and idle resolves when not busy', async () => {
  const { store } = make();
  const seen: string[] = [];
  const off = store.subscribe((s: any) => seen.push(s.status));
  await store.load();
  off();
  assert.ok(seen.includes('loading') && seen.includes('ready'));
  await store.idle();
});

test('actions do nothing before any data is loaded, so Replan cannot break an offline page', async () => {
  const { store, calls } = make({ getState: () => { throw new ApiError(0, 'The planner is not reachable'); } });
  await store.load();
  const before = [...calls];
  await store.replan();
  await store.approve('2026-10-09');
  await store.undo('2026-10-09');
  await store.dismiss(['k']);
  await store.loadExample();
  assert.deepEqual(calls, before);
  assert.equal(store.get().state, null);
  assert.equal(store.get().status, 'offline');
  assert.equal(store.get().busy, false);
});

test('an unexpected failure shows a generic message, never an internal one', async () => {
  const { store } = make({ replan: () => { throw new TypeError('commitments is not iterable'); } });
  await store.load();
  assert.equal(store.get().status, 'error');
  assert.equal(store.get().error, 'Something unexpected happened. Reload the page.');
});

test('when every dismissed key is stale the plan is refreshed and the user is told', async () => {
  const { store, calls } = make({
    dismiss: () => { throw new ApiError(409, 'That warning is no longer open'); },
    replan: () => result({ blocks: [{ date: '2026-10-06' }] }),
  });
  await store.load();
  await store.dismiss(['gone', 'also-gone']);
  assert.equal(store.get().notice, 'That warning changed, so I refreshed the plan.');
  assert.equal(store.get().status, 'ready');
  assert.deepEqual(store.get().state.blocks, [{ date: '2026-10-06' }]);
  assert.equal(calls.filter((c) => c === 'replan').length, 2);
  await store.replan();
  assert.equal(store.get().notice, null);
});
