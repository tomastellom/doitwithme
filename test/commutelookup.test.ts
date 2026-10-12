import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BadLookup, isStale, keepMapsData, lookupCommute, refreshCommutes, usageFor } from '../src/commutelookup.ts';
import { MapsError } from '../src/maps.ts';
import { emptyState } from '../src/store.ts';
import type { State } from '../src/types.ts';

const TODAY = '2026-10-12';
const places = [
  { id: 'h', name: 'Home', kind: 'home' as const, address: '1 Main St' },
  { id: 'c', name: 'Campus', kind: 'campus' as const, address: '9 Uni Rd' },
  { id: 's', name: 'Anna', kind: 'student' as const, address: '' },
];
const commute = (id: string, to: string, source: any = { method: 'maps', mode: 'transit', fallbackMinutes: 40 }): any =>
  ({ id, fromPlaceId: 'h', toPlaceId: to, repeats: null, marginMinutes: 10, source });
const base = (commutes: any[] = [commute('k', 'c')]): State => ({ ...emptyState(), places, commutes });

function rig(initial: State, reply: (q: any) => any = () => ({ minutes: 33 }), limit = 5000) {
  let state = structuredClone(initial);
  const asked: any[] = [];
  const maps = { status: 'ready' as const, async lookup(q: any) { asked.push(q); return reply(q); } };
  const deps = { maps, limit, load: () => structuredClone(state), save: (s: State) => { state = structuredClone(s); } };
  return { deps, asked, state: () => state, setState: (s: State) => { state = structuredClone(s); } };
}

test('a lookup keeps the result with its date and addresses, and counts one use', async () => {
  const r = rig(base());
  assert.deepEqual(await lookupCommute(r.deps, 'k', TODAY), { ok: true, minutes: 33, at: TODAY });
  assert.deepEqual(r.asked, [{ fromAddress: '1 Main St', toAddress: '9 Uni Rd', mode: 'transit' }]);
  assert.deepEqual((r.state().commutes[0].source as any).found, { minutes: 33, at: TODAY, fromAddress: '1 Main St', toAddress: '9 Uni Rd', mode: 'transit' });
  assert.deepEqual(r.state().mapsUsage, { month: '2026-10', count: 1 });
});

test('an unknown or typed commute is a bad request, and a place without an address is explained', async () => {
  const r = rig(base([commute('k', 'c'), commute('t', 'c', { method: 'typed', minutes: 20 }), commute('a', 's')]));
  await assert.rejects(lookupCommute(r.deps, 'nope', TODAY), BadLookup);
  await assert.rejects(lookupCommute(r.deps, 't', TODAY), BadLookup);
  assert.deepEqual(await lookupCommute(r.deps, 'a', TODAY), { ok: false, code: 'address-missing', message: 'Add an address to Anna first.' });
  assert.equal(r.asked.length, 0);
  assert.equal(r.state().mapsUsage, undefined, 'nothing was counted');
});

test('the monthly limit stops the call before Google, and the next month starts fresh', async () => {
  const full = { ...base(), mapsUsage: { month: '2026-10', count: 3 } };
  const r = rig(full, () => ({ minutes: 20 }), 3);
  const refused: any = await lookupCommute(r.deps, 'k', TODAY);
  assert.deepEqual([refused.ok, refused.code], [false, 'limit']);
  assert.match(refused.message, /3 lookups/);
  assert.equal(r.asked.length, 0);
  assert.equal(((await lookupCommute(r.deps, 'k', '2026-11-01')) as any).ok, true);
  assert.deepEqual(r.state().mapsUsage, { month: '2026-11', count: 1 });
  assert.deepEqual(usageFor(r.state(), '2026-11-15', 3), { month: '2026-11', count: 1, limit: 3 });
  assert.deepEqual(usageFor(r.state(), '2026-12-01', 3), { month: '2026-12', count: 0, limit: 3 });
});

test('a failed lookup keeps the old result, says why and still counts', async () => {
  const old = { minutes: 50, at: '2026-09-30', fromAddress: '1 Main St', toAddress: '9 Uni Rd', mode: 'transit' };
  const start = base([commute('k', 'c', { method: 'maps', mode: 'transit', fallbackMinutes: 40, found: old })]);
  const r = rig(start, () => { throw new MapsError('no-route', 'Google found no route for that mode.'); });
  assert.deepEqual(await lookupCommute(r.deps, 'k', TODAY), { ok: false, code: 'no-route', message: 'Google found no route for that mode.' });
  assert.deepEqual((r.state().commutes[0].source as any).found, old);
  assert.equal(r.state().mapsUsage?.count, 1);
  const odd = rig(start, () => { throw new Error('secret AIza-key leaked'); });
  const result: any = await lookupCommute(odd.deps, 'k', TODAY);
  assert.deepEqual([result.ok, result.code], [false, 'bad-response']);
  assert.doesNotMatch(result.message, /AIza/);
});

test('a save made during the lookup survives, and a commute deleted meanwhile is not resurrected', async () => {
  const during = rig(base(), () => ({ minutes: 33 }));
  const original = during.deps.maps.lookup.bind(during.deps.maps);
  during.deps.maps.lookup = async (q: any) => {
    const s = during.state();
    during.setState({ ...s, tasks: [{ id: 'new' } as any], preferences: { ...s.preferences, minBreak: 25 } });
    return original(q);
  };
  await lookupCommute(during.deps, 'k', TODAY);
  assert.equal(during.state().preferences.minBreak, 25);
  assert.equal(during.state().tasks.length, 1);
  assert.equal((during.state().commutes[0].source as any).found.minutes, 33);
  const deleted = rig(base());
  const orig2 = deleted.deps.maps.lookup.bind(deleted.deps.maps);
  deleted.deps.maps.lookup = async (q: any) => { deleted.setState({ ...deleted.state(), commutes: [] }); return orig2(q); };
  const gone: any = await lookupCommute(deleted.deps, 'k', TODAY);
  assert.deepEqual([gone.ok, gone.code], [false, 'gone']);
  assert.deepEqual(deleted.state().commutes, []);
  assert.equal(deleted.state().mapsUsage?.count, 1);
});

test('stale means never looked up, older than 14 days, or for other addresses', () => {
  const f = (over: any = {}) => ({ minutes: 30, at: TODAY, fromAddress: '1 Main St', toAddress: '9 Uni Rd', mode: 'car', ...over });
  const withFound = (found: any) => commute('k', 'c', { method: 'maps', mode: 'car', fallbackMinutes: 40, ...(found ? { found } : {}) });
  assert.equal(isStale(withFound(undefined), places, TODAY), true);
  assert.equal(isStale(withFound(f()), places, TODAY), false);
  assert.equal(isStale(withFound(f({ at: '2026-09-28' })), places, TODAY), false, '14 days old is not stale yet');
  assert.equal(isStale(withFound(f({ at: '2026-09-27' })), places, TODAY), true);
  assert.equal(isStale(withFound(f({ toAddress: 'elsewhere' })), places, TODAY), true);
  assert.equal(isStale(withFound(f({ mode: 'walk' })), places, TODAY), true, 'found for another mode');
  assert.equal(isStale(commute('t', 'c', { method: 'typed', minutes: 20 }), places, TODAY), false);
  assert.equal(isStale(commute('a', 's'), places, TODAY), false, 'no address, nothing to look up');
});

test('refresh looks up only stale Maps commutes, at most ten, and stops at the first key problem', async () => {
  const fresh = commute('fresh', 'c', { method: 'maps', mode: 'car', fallbackMinutes: 40, found: { minutes: 30, at: TODAY, fromAddress: '1 Main St', toAddress: '9 Uni Rd', mode: 'car' } });
  const stale = Array.from({ length: 12 }, (_, i) => commute(`s${i}`, 'c'));
  const r = rig(base([fresh, commute('typed', 'c', { method: 'typed', minutes: 5 }), ...stale]));
  assert.deepEqual(await refreshCommutes(r.deps, TODAY), { updated: 10, failed: 0, skipped: 2 });
  assert.equal(r.asked.length, 10);
  const broken = rig(base([commute('a', 'c'), commute('b', 'c'), commute('d', 'c')]), () => { throw new MapsError('key', 'Google rejected the key.'); });
  assert.deepEqual(await refreshCommutes(broken.deps, TODAY), { updated: 0, failed: 1, skipped: 2 });
  assert.equal(broken.asked.length, 1);
  let n = 0;
  const other = rig(base([commute('a', 'c'), commute('b', 'c')]), () => { if (++n === 1) throw new MapsError('no-route', 'Google found no route for that mode.'); return { minutes: 9 }; });
  assert.deepEqual(await refreshCommutes(other.deps, TODAY), { updated: 1, failed: 1, skipped: 0 });
});

const failedWith = (code: string, at = TODAY) => ({ at, code, fromAddress: '1 Main St', toAddress: '9 Uni Rd', mode: 'transit' });

test('a failed lookup is remembered, and a stale commute that failed is not tried again at every page load', async () => {
  const r = rig(base(), () => { throw new MapsError('no-route', 'Google found no route for that mode.'); });
  await lookupCommute(r.deps, 'k', TODAY);
  assert.deepEqual((r.state().commutes[0].source as any).failed, failedWith('no-route'));
  for (let i = 0; i < 4; i++) await refreshCommutes(r.deps, TODAY);
  assert.equal(r.asked.length, 1, 'four more page loads asked Google nothing');
  assert.equal(r.state().mapsUsage?.count, 1);
});

test('the pause after a failure is a day for a hiccup and two weeks for no route or a bad address', () => {
  const withFailed = (failed: any) => commute('k', 'c', { method: 'maps', mode: 'transit', fallbackMinutes: 40, failed });
  assert.equal(isStale(withFailed(failedWith('offline')), places, TODAY), false, 'same day');
  assert.equal(isStale(withFailed(failedWith('offline')), places, '2026-10-13'), true, 'next day');
  assert.equal(isStale(withFailed(failedWith('no-route')), places, '2026-10-25'), false, '13 days later');
  assert.equal(isStale(withFailed(failedWith('address')), places, '2026-10-27'), true, '15 days later');
  assert.equal(isStale(withFailed({ ...failedWith('no-route'), toAddress: 'changed' }), places, TODAY), true, 'the addresses changed');
  assert.equal(isStale(withFailed({ ...failedWith('no-route'), mode: 'walk' }), places, TODAY), true, 'the mode changed');
});

test('a success clears the remembered failure', async () => {
  const start = base([commute('k', 'c', { method: 'maps', mode: 'transit', fallbackMinutes: 40, failed: failedWith('offline', '2026-10-01') })]);
  const r = rig(start);
  await lookupCommute(r.deps, 'k', TODAY);
  assert.equal('failed' in (r.state().commutes[0].source as any), false);
});

test('refresh stops when the network is down instead of trying every commute', async () => {
  const r = rig(base([commute('a', 'c'), commute('b', 'c'), commute('d', 'c')]), () => { throw new MapsError('offline', 'I could not reach Google.'); });
  assert.deepEqual(await refreshCommutes(r.deps, TODAY), { updated: 0, failed: 1, skipped: 2 });
  assert.equal(r.asked.length, 1);
});

test('lookups started together cannot get past the limit', async () => {
  const r = rig({ ...base(), mapsUsage: { month: '2026-10', count: 2 } }, () => ({ minutes: 20 }), 3);
  const all = await Promise.all([1, 2, 3, 4, 5].map(() => lookupCommute(r.deps, 'k', TODAY)));
  assert.equal(r.asked.length, 1, 'only one reached Google');
  assert.equal(all.filter((x) => x.ok).length, 1);
  assert.equal(all.filter((x: any) => !x.ok && x.code === 'limit').length, 4);
  assert.equal(r.state().mapsUsage?.count, 3);
});

test('a lookup that finishes after the mode was changed is thrown away', async () => {
  const r = rig(base());
  const original = r.deps.maps.lookup.bind(r.deps.maps);
  r.deps.maps.lookup = async (q: any) => {
    const s = r.state();
    r.setState({ ...s, commutes: s.commutes.map((c: any) => ({ ...c, source: { ...c.source, mode: 'walk' } })) });
    return original(q);
  };
  const result: any = await lookupCommute(r.deps, 'k', TODAY);
  assert.deepEqual([result.ok, result.code], [false, 'gone']);
  assert.equal('found' in (r.state().commutes[0].source as any), false);
});

test('the month is counted by the server clock, not by the date the browser sent', async () => {
  const r = rig(base());
  const deps = { ...r.deps, clock: () => '2026-10-31' };
  await lookupCommute(deps, 'k', '2026-09-01');
  assert.deepEqual(r.state().mapsUsage, { month: '2026-10', count: 1 });
  assert.equal((r.state().commutes[0].source as any).found.at, '2026-09-01', 'the result keeps the browser date');
});

test('saving state keeps the server count and any result the browser did not know about', () => {
  const found = { minutes: 30, at: TODAY, fromAddress: '1 Main St', toAddress: '9 Uni Rd', mode: 'transit' };
  const prev: State = { ...base([commute('k', 'c', { method: 'maps', mode: 'transit', fallbackMinutes: 40, found })]), mapsUsage: { month: '2026-10', count: 7 } };
  const incoming: State = { ...base([commute('k', 'c')]), mapsUsage: { month: '2026-10', count: 0 } };
  const kept = keepMapsData(prev, incoming);
  assert.deepEqual(kept.mapsUsage, { month: '2026-10', count: 7 }, 'the browser cannot lower the count');
  assert.deepEqual((kept.commutes[0].source as any).found, found, 'a result found meanwhile is kept');
  assert.equal(keepMapsData({ ...prev, mapsUsage: undefined }, incoming).mapsUsage, undefined);
  const moved = { ...incoming, places: places.map((p) => (p.id === 'c' ? { ...p, address: 'elsewhere' } : p)) };
  assert.equal('found' in (keepMapsData(prev, moved).commutes[0].source as any), false, 'not for other addresses');
  const walking: State = { ...base([commute('k', 'c', { method: 'maps', mode: 'walk', fallbackMinutes: 40 })]) };
  assert.equal('found' in (keepMapsData(prev, walking).commutes[0].source as any), false, 'not for another mode');
  const failed = failedWith('no-route');
  const prevFailed: State = base([commute('k', 'c', { method: 'maps', mode: 'transit', fallbackMinutes: 40, failed })]);
  assert.deepEqual((keepMapsData(prevFailed, incoming).commutes[0].source as any).failed, failed);
});
