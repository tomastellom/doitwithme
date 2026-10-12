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

test('saveState puts the new state, reloads it and replans', async () => {
  const saved = full({ tasks: [{ id: 't' }, { id: 'u' }] });
  const { store, calls } = make({ getState: () => saved });
  await store.load();
  calls.length = 0;
  await store.saveState(saved);
  assert.deepEqual(calls, ['putState', 'getState', 'replan']);
  assert.equal(store.get().formError, null);
  assert.equal(store.get().state.tasks.length, 2);
  assert.equal(store.get().busy, false);
});

test('a rejected save keeps the page, shows the server message and changes nothing else', async () => {
  const { store, calls } = make({ putState: () => { throw new ApiError(400, 'tasks[0].maxBlock must be a number between 5 and 1440'); } });
  await store.load();
  const before = store.get().state;
  calls.length = 0;
  await store.saveState(full());
  assert.equal(store.get().status, 'ready');
  assert.equal(store.get().formError, 'tasks[0].maxBlock must be a number between 5 and 1440');
  assert.equal(store.get().state, before);
  assert.deepEqual(calls, ['putState']);
  assert.equal(store.get().busy, false);
  store.clearFormError();
  assert.equal(store.get().formError, null);
});

test('saving the first item leaves first-run mode', async () => {
  let saved = false;
  const { store } = make({
    getState: () => (saved ? full() : full({ tasks: [], commitments: [] })),
    putState: () => { saved = true; return { ok: true }; },
  });
  await store.load();
  assert.equal(store.get().isEmpty, true);
  await store.saveState(full());
  assert.equal(store.get().isEmpty, false);
});

test('other save failures are real errors', async () => {
  const { store } = make({ putState: () => { throw new ApiError(500, 'boom'); } });
  await store.load();
  await store.saveState(full());
  assert.equal(store.get().status, 'error');
  assert.equal(store.get().formError, null);
});

test('a second save while one runs is ignored', async () => {
  let release: Function = () => {};
  const gate = new Promise<void>((r) => (release = r));
  const { store, calls } = make({ putState: async () => { await gate; return { ok: true }; } });
  await store.load();
  calls.length = 0;
  const first = store.saveState(full());
  const second = store.saveState(full());
  release();
  await Promise.all([first, second]);
  assert.equal(calls.filter((c) => c === 'putState').length, 1);
});

test('saveState given a function builds the new state from the freshest server copy', async () => {
  const fresh = full({ tasks: [{ id: 't' }, { id: 'from-another-tab' }] });
  const put: any[] = [];
  const { store } = make({ getState: () => fresh, putState: (n: any) => { put.push(n); } });
  await store.load();
  await store.saveState((latest: any) => ({ ...latest, preferences: { minBreak: 5 } }));
  assert.deepEqual(put[0].tasks.map((t: any) => t.id), ['t', 'from-another-tab']);
  assert.deepEqual(put[0].preferences, { minBreak: 5 });
});

test('a new save clears the previous save error before it runs', async () => {
  let fail = true;
  const { store } = make({ putState: () => { if (fail) throw new ApiError(400, 'old message'); } });
  await store.load();
  await store.saveState(full());
  assert.equal(store.get().formError, 'old message');
  fail = false;
  const seen: any[] = [];
  store.subscribe((s: any) => seen.push(s.formError));
  await store.saveState(full());
  assert.equal(seen[0], null);
});

test('plan responses bring the travel legs into the store, and a missing list becomes empty', async () => {
  const legs = [{ date: '2026-10-05', start: 545, end: 600, fromName: 'Home', toName: 'Campus', estimated: false }];
  const a = make({ replan: () => ({ blocks: [], warnings: [], approvedSoft: [], dismissed: [], travel: legs }) });
  await a.store.load();
  assert.deepEqual(a.store.get().travel, legs);
  const b = make({ replan: () => ({ blocks: [], warnings: [], approvedSoft: [], dismissed: [] }) });
  await b.store.load();
  assert.deepEqual(b.store.get().travel, []);
});

test('the store learns whether Google Maps is ready, and treats any trouble as unavailable', async () => {
  const ready = make({ commuteStatus: () => ({ maps: 'ready' }) });
  await ready.store.load();
  assert.equal(ready.store.get().maps, 'ready');
  const broken = make({ commuteStatus: () => { throw new ApiError(500, 'nope'); } });
  await broken.store.load();
  assert.equal(broken.store.get().maps, 'unavailable');
  assert.equal(broken.store.get().status, 'ready');
  const none = make({});
  await none.store.load();
  assert.equal(none.store.get().maps, 'unavailable');
});

test('a save that names a place deleted elsewhere says so in plain words and refreshes the state', async () => {
  let reads = 0;
  const fresh = full({ places: [{ id: 'home' }] });
  const { store, calls } = make({
    getState: () => (++reads === 1 ? full({ places: [{ id: 'home' }, { id: 'anna' }] }) : fresh),
    putState: () => { throw new ApiError(400, 'commitments[2].placeId does not match any place'); },
  });
  await store.load();
  calls.length = 0;
  await store.saveState(full());
  assert.match(store.get().formError, /place you picked was deleted elsewhere/i);
  assert.doesNotMatch(store.get().formError, /placeId/);
  assert.deepEqual(store.get().state.places, [{ id: 'home' }]);
  assert.equal(store.get().busy, false);
  const commute = make({ putState: () => { throw new ApiError(400, 'commutes[0].toPlaceId does not match any place'); } });
  await commute.store.load();
  await commute.store.saveState(full());
  assert.match(commute.store.get().formError, /deleted elsewhere/i);
});

test('an estimate runs beside everything else: it flags itself, returns the answer and never takes the busy flag', async () => {
  let release: Function = () => {};
  const { store } = make({ estimate: () => new Promise((resolve) => { release = () => resolve({ rule: { minutes: 240 } }); }) });
  await store.load();
  const seen: any[] = [];
  store.subscribe((s: any) => seen.push([s.estimating, s.busy]));
  const first = store.estimate({ title: 'x' });
  assert.equal(store.get().estimating, true);
  assert.equal(store.get().busy, false);
  assert.equal(await store.estimate({ title: 'x' }), null, 'a second press while one runs is ignored');
  release();
  assert.deepEqual(await first, { rule: { minutes: 240 } });
  assert.equal(store.get().estimating, false);
});

test('a failed estimate clears the flag and passes the error on', async () => {
  const { store } = make({ estimate: () => { throw new ApiError(400, 'request.credits must be a number between 0.5 and 100'); } });
  await store.load();
  await assert.rejects(store.estimate({}), /request\.credits/);
  assert.equal(store.get().estimating, false);
  assert.equal(store.get().status, 'ready');
});

test('answering low stores the answer, keeps the result for Nudge and clears on okay', async () => {
  const { store, calls } = make({
    checkIn: (mood: string) => result({ checkIns: [{ date: '2026-10-05', mood }], moved: mood === 'low' ? { minutes: 180, dates: ['2026-10-08'] } : null }),
  });
  await store.load();
  await store.answerCheckIn('low');
  assert.deepEqual(calls.slice(-1), ['checkIn']);
  assert.deepEqual(store.get().state.checkIns, [{ date: '2026-10-05', mood: 'low' }]);
  assert.deepEqual(store.get().checkInResult, { mood: 'low', minutes: 180, dates: ['2026-10-08'] });
  store.clearConfirm();
  assert.equal(store.get().checkInResult, null);
  await store.answerCheckIn('okay');
  assert.deepEqual(store.get().checkInResult, { mood: 'okay', minutes: 0, dates: [] });
});

test('a failing check-in leaves the state alone and reports offline', async () => {
  const { store } = make({ checkIn: () => { throw new ApiError(0, 'The planner is not reachable'); } });
  await store.load();
  await store.answerCheckIn('low');
  assert.equal(store.get().status, 'offline');
  assert.equal(store.get().state.checkIns, undefined);
});

test('reopening a skipped check-in sets the flag and an answer clears it', async () => {
  const { store } = make({ checkIn: () => result({ checkIns: [{ date: '2026-10-05', mood: 'good' }], moved: null }) });
  await store.load();
  store.reopenCheckIn();
  assert.equal(store.get().reopened, true);
  await store.answerCheckIn('good');
  assert.equal(store.get().reopened, false);
});

test('the store keeps the attendance advice from every replan and starts empty', async () => {
  const { store } = make({ replan: () => result({ attendance: [{ commitmentId: 'lec', date: '2026-10-05', verdict: 'go', reasons: ['Labs need you there.'] }] }) });
  assert.deepEqual(store.get().attendance, []);
  await store.load();
  assert.equal(store.get().attendance[0].verdict, 'go');
  const bare = make();
  await bare.store.load();
  assert.deepEqual(bare.store.get().attendance, []);
});

const lecture = (over: any = {}) => ({ id: 'lec', title: 'Chemistry lecture', category: 'class', pattern: { kind: 'weekly', weekdays: [1], from: '2026-10-05', to: '2026-12-31' }, exceptions: [], ...over });
const offerFor = (over: any = {}) => ({ kind: 'skip', commitmentId: 'lec', date: '2026-10-06', minutes: 120, title: 'Chemistry lecture', taskTitle: 'Chemistry', ...over });

function skipRig(initial: any, over: any = {}) {
  let server = structuredClone(initial);
  const puts: any[] = [];
  const f = make({
    getState: () => structuredClone(server),
    putState: (s: any) => { puts.push(structuredClone(s)); server = structuredClone(s); return { ok: true }; },
    ...over,
  });
  return { ...f, puts, server: () => server };
}

test('skipClass adds the date once, replans and confirms with what moved in', async () => {
  const { store, puts, server } = skipRig(full({ commitments: [lecture()] }));
  await store.load();
  await store.skipClass(offerFor());
  assert.deepEqual(server().commitments[0].exceptions, ['2026-10-06']);
  assert.deepEqual(store.get().confirm, { used: true, skip: { commitmentId: 'lec', date: '2026-10-06', title: 'Chemistry lecture', taskTitle: 'Chemistry', minutes: 120 } });
  await store.skipClass(offerFor());
  assert.deepEqual(server().commitments[0].exceptions, ['2026-10-06'], 'a second press adds nothing');
  assert.equal(puts.length, 1, 'and does not even save');
});

test('skipClass for a class that is gone or no longer weekly changes nothing and says so', async () => {
  const gone = skipRig(full({ commitments: [] }));
  await gone.store.load();
  await gone.store.skipClass(offerFor());
  assert.equal(gone.puts.length, 0);
  assert.equal(gone.store.get().notice, 'That class changed, so I refreshed the plan.');
  assert.equal(gone.store.get().confirm, null);
  const once = skipRig(full({ commitments: [lecture({ pattern: { kind: 'once', date: '2026-10-06' } })] }));
  await once.store.load();
  await once.store.skipClass(offerFor());
  assert.equal(once.puts.length, 0);
  assert.equal(once.store.get().notice, 'That class changed, so I refreshed the plan.');
});

test('undoSkip removes only that date and clears the confirmation', async () => {
  const { store, server } = skipRig(full({ commitments: [lecture({ exceptions: ['2026-10-06', '2026-10-13'] })] }));
  await store.load();
  await store.undoSkip({ commitmentId: 'lec', date: '2026-10-06' });
  assert.deepEqual(server().commitments[0].exceptions, ['2026-10-13']);
  assert.equal(store.get().confirm, null);
});

test('a failing skip reports offline and changes nothing', async () => {
  const f = skipRig(full({ commitments: [lecture()] }), { putState: () => { throw new ApiError(0, 'The planner is not reachable'); } });
  await f.store.load();
  await f.store.skipClass(offerFor());
  assert.equal(f.store.get().status, 'offline');
});

test('after a class changed elsewhere, the page shows the fresh classes, not the old one', async () => {
  const { store } = skipRig(full({ commitments: [lecture()] }));
  await store.load();
  assert.equal(store.get().state.commitments.length, 1);
  const gone = skipRig(full({ commitments: [lecture()] }), {});
  await gone.store.load();
  // The class is deleted in another tab, then the stale page presses Skip it.
  (gone.server() as any).commitments = [];
  await gone.store.skipClass(offerFor());
  assert.equal(gone.store.get().notice, 'That class changed, so I refreshed the plan.');
  assert.deepEqual(gone.store.get().state.commitments, []);
});
