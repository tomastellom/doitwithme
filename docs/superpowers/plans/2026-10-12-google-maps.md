# Google Maps commute lookup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A commute can use Google Maps for its travel time: looked up when saved, kept with its date, refreshed when stale, capped per month, and always falling back to the typed time with a plain explanation.

**Architecture:** A Google Routes provider (`src/maps.ts`) implements the existing `TravelTimeProvider`. A new `src/commutelookup.ts` runs lookups and refreshes against the saved state, counting usage. Two endpoints expose it. `minutesFor` reads the saved result when its addresses still match. The browser shows the result in the commute form, triggers a lookup on save and refreshes stale ones at load.

**Tech Stack:** TypeScript run by Node's type stripping (`node --test`), plain ES module browser code, hand-rolled fake DOM in tests. Run all tests with `npm test`. No real Google call anywhere in the test suite.

**Spec:** `docs/superpowers/specs/2026-10-12-google-maps-design.md`

## Global Constraints

- The API key is read only from the server environment (`GOOGLE_MAPS_API_KEY`). It is never stored in state, sent to the browser, logged, or put in an error message or URL.
- Google is called only at `https://routes.googleapis.com/directions/v2:computeRoutes`, with `redirect: 'error'`, a 10 second timeout, key in `X-Goog-Api-Key`, field mask `routes.duration`, addresses only in the JSON body, and never a `routingPreference`.
- Failures never fail a replan; the typed fallback is used and the form says why.
- Monthly cap default 5000 (`MAPS_MONTHLY_LIMIT`); a failed lookup still counts.
- Staleness: a result older than 14 days or for different addresses is refreshed; one refresh does at most 10 lookups.
- No emojis, no gradients, no inline styles (CSP), all text through `h()`, real buttons, keyboard reachable.
- Do not push. The user pushes when they say yes.
- Commit trailer on every commit: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- The key never appears in any thrown message, response body, saved state or request URL, even when Google's error body contains it (Tasks 2 and 3).
- A place address changed after a lookup: the old result is ignored, the typed time is used (Task 1).
- A save made by the browser while a lookup is in flight is not overwritten, and a commute or place deleted meanwhile does not crash (Task 3).
- The monthly limit stops the call before Google is contacted, and the month rolls over by `today` (Task 3).
- A refresh stops at the first key or quota failure and never exceeds 10 lookups (Task 3).
- Hostile text in an address or place name is sent only as JSON data and shown only as text (Tasks 2 and 4).

---

## File structure

- `src/types.ts`, `src/validate.ts`, `src/travel.ts`: `found`, `mapsUsage`, `minutesFor(commute, places)` (Task 1).
- `src/maps.ts`: `MapsError`, `googleProvider` (Task 2).
- `src/commutelookup.ts` (new), `src/server.ts`: lookup, refresh, usage, endpoints, env wiring (Task 3).
- `public/js/api.js`, `public/js/store.js`, `public/js/maps-ui.js` (new), `public/js/setup.js`: the browser side (Task 4).
- `docs/google-maps-setup.md` (new), `docs/ui-visual-check.md`, an end-to-end test (Task 5).

---

### Task 1: Data, validation and `minutesFor`

**Files:**
- Modify: `src/types.ts`, `src/validate.ts`, `src/travel.ts`
- Test: `test/validate.test.ts`, `test/travel.test.ts`

**Interfaces:**
- Produces: `interface MapsFound { minutes: Minutes; at: DateStr; fromAddress: string; toAddress: string }`; `TravelSource` maps variant gains `found?: MapsFound`; `State.mapsUsage?: { month: string; count: number }`; `minutesFor(c: Commute, places?: Place[]): Minutes`.

- [ ] **Step 1: Write the failing tests**

Append to `test/validate.test.ts` (`emptyState` and `validateState` are already imported):

```ts
const mapsState = (found: any, usage?: any) => ({
  ...emptyState(),
  places: [
    { id: 'h', name: 'Home', kind: 'home', address: '1 Main St' },
    { id: 'c', name: 'Campus', kind: 'campus', address: '9 Uni Rd' },
  ],
  commutes: [{ id: 'k', fromPlaceId: 'h', toPlaceId: 'c', repeats: null, marginMinutes: 10,
    source: { method: 'maps', mode: 'transit', fallbackMinutes: 40, ...(found === undefined ? {} : { found }) } }],
  ...(usage === undefined ? {} : { mapsUsage: usage }),
});
const found = { minutes: 55, at: '2026-10-12', fromAddress: '1 Main St', toAddress: '9 Uni Rd' };

test('a Maps commute may carry its last result, and the month count is validated', () => {
  const ok: any = validateState(mapsState(found, { month: '2026-10', count: 12 }));
  assert.deepEqual(ok.commutes[0].source.found, found);
  assert.deepEqual(ok.mapsUsage, { month: '2026-10', count: 12 });
  assert.equal('found' in (validateState(mapsState(undefined)) as any).commutes[0].source, false);
  assert.equal((validateState(mapsState(undefined)) as any).mapsUsage, undefined);
});

test('a saved Maps result and the month count reject bad values', () => {
  assert.throws(() => validateState(mapsState({ ...found, minutes: 601 })), /found\.minutes/);
  assert.throws(() => validateState(mapsState({ ...found, minutes: 1.5 })), /found\.minutes/);
  assert.throws(() => validateState(mapsState({ ...found, at: 'today' })), /found\.at/);
  assert.throws(() => validateState(mapsState({ ...found, fromAddress: 'x'.repeat(501) })), /fromAddress/);
  assert.throws(() => validateState(mapsState(found, { month: '2026-1', count: 1 })), /mapsUsage\.month/);
  assert.throws(() => validateState(mapsState(found, { month: '2026-10', count: -1 })), /mapsUsage\.count/);
  assert.throws(() => validateState(mapsState(found, { month: '2026-10', count: 1000001 })), /mapsUsage\.count/);
});
```

Append to `test/travel.test.ts` (it already imports from `../src/travel.ts`; add `minutesFor` to that import if it is not there):

```ts
const place = (id: string, address: string): any => ({ id, name: id, kind: 'other', address });
const mapsCommute = (found?: any): any => ({ id: 'k', fromPlaceId: 'a', toPlaceId: 'b', repeats: null, marginMinutes: 0,
  source: { method: 'maps', mode: 'car', fallbackMinutes: 40, ...(found ? { found } : {}) } });
const result = { minutes: 55, at: '2026-10-12', fromAddress: '1 Main St', toAddress: '9 Uni Rd' };

test('minutesFor uses a typed time as it is, and a Maps result only while both addresses still match', () => {
  const places = [place('a', '1 Main St'), place('b', '9 Uni Rd')];
  assert.equal(minutesFor({ ...mapsCommute(), source: { method: 'typed', minutes: 25 } } as any, places), 25);
  assert.equal(minutesFor(mapsCommute(result), places), 55);
  assert.equal(minutesFor(mapsCommute(), places), 40, 'not looked up yet');
  assert.equal(minutesFor(mapsCommute(result), [place('a', '2 Other St'), place('b', '9 Uni Rd')]), 40, 'the start address changed');
  assert.equal(minutesFor(mapsCommute(result), [place('a', '1 Main St'), place('b', '')]), 40, 'the end address changed');
  assert.equal(minutesFor(mapsCommute(result), []), 40, 'a missing place');
  assert.equal(minutesFor(mapsCommute(result)), 40, 'no places given');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/validate.test.ts test/travel.test.ts`
Expected: FAIL (`found` is dropped, `minutesFor` ignores it).

- [ ] **Step 3: Implement**

`src/types.ts`: add before `export type TravelSource`:

```ts
export interface MapsFound {
  minutes: Minutes;
  at: DateStr;
  fromAddress: string;
  toAddress: string;
}
```

change the maps variant to `| { method: 'maps'; mode: TravelMode; fallbackMinutes: Minutes; found?: MapsFound };` and add to `State` after `checkIns?: CheckIn[];`:

```ts
  mapsUsage?: { month: string; count: number };
```

`src/validate.ts`: add `MapsFound` to the type import. Add above `sourceOf`:

```ts
function foundOf(v: unknown, path: string): MapsFound {
  const o = obj(v, path);
  const address = (x: unknown, p: string): string => {
    if (typeof x !== 'string' || x.length > 500) fail(`${p} must be text of at most 500 characters`);
    return x as string;
  };
  return {
    minutes: int(o.minutes, `${path}.minutes`, 0, 600),
    at: dateStr(o.at, `${path}.at`),
    fromAddress: address(o.fromAddress, `${path}.fromAddress`),
    toAddress: address(o.toAddress, `${path}.toAddress`),
  };
}

function usageOf(v: unknown): { month: string; count: number } {
  const o = obj(v, 'mapsUsage');
  if (typeof o.month !== 'string' || !/^\d{4}-\d{2}$/.test(o.month)) fail('mapsUsage.month must look like 2026-10');
  return { month: o.month as string, count: int(o.count, 'mapsUsage.count', 0, 1000000) };
}
```

In `sourceOf`, change the `maps` return to:

```ts
    return {
      method: 'maps', mode: o.mode as TravelMode, fallbackMinutes: int(o.fallbackMinutes, `${path}.fallbackMinutes`, 0, 600),
      ...(o.found === undefined ? {} : { found: foundOf(o.found, `${path}.found`) }),
    };
```

In `validateState`'s returned object add after the `checkIns` line: `...(o.mapsUsage === undefined ? {} : { mapsUsage: usageOf(o.mapsUsage) }),`.

`src/travel.ts`: replace `minutesFor` with:

```ts
// A Maps result is used only while both places still have the addresses it was found for; otherwise the typed fallback.
export function minutesFor(c: Commute, places: Place[] = []): Minutes {
  if (c.source.method === 'typed') return c.source.minutes;
  const found = c.source.found;
  if (found) {
    const from = places.find((p) => p.id === c.fromPlaceId);
    const to = places.find((p) => p.id === c.toPlaceId);
    if (from && to && from.address === found.fromAddress && to.address === found.toAddress) return found.minutes;
  }
  return c.source.fallbackMinutes;
}
```

and in `legsOn`'s `cost` change `minutesFor(route)` to `minutesFor(route, ctx.places)`.

- [ ] **Step 4: Run to verify they pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src test && git commit -m "feat: a commute can keep its last Google Maps result" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The Google provider

**Files:**
- Modify: `src/maps.ts`
- Test: `test/maps.test.ts`

**Interfaces:**
- Produces: `type MapsErrorCode = 'key' | 'quota' | 'address' | 'no-route' | 'offline' | 'bad-response'`; `class MapsError extends Error { code: MapsErrorCode }`; `googleProvider(opts: { key: string; fetchFn?: typeof fetch; regionCode?: string; timeoutMs?: number }): TravelTimeProvider` with `status: 'ready'`.

- [ ] **Step 1: Write the failing tests** (append to `test/maps.test.ts`; change its first import line group to also import `googleProvider, MapsError` from `../src/maps.ts`)

```ts
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/maps.test.ts`
Expected: FAIL (`googleProvider` is not exported).

- [ ] **Step 3: Implement** (append to `src/maps.ts`)

```ts
export type MapsErrorCode = 'key' | 'quota' | 'address' | 'no-route' | 'offline' | 'bad-response';

// The message is always one of our own sentences, never Google's text, so it can never carry the key.
export class MapsError extends Error {
  code: MapsErrorCode;
  constructor(code: MapsErrorCode, message: string) {
    super(message);
    this.name = 'MapsError';
    this.code = code;
  }
}

const GOOGLE_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const GOOGLE_MODE: Record<TravelMode, string> = { car: 'DRIVE', bike: 'BICYCLE', transit: 'TRANSIT', walk: 'WALK' };
const MESSAGES: Record<MapsErrorCode, string> = {
  key: 'Google rejected the key. Check that the Routes API is enabled for it and that billing is on.',
  quota: 'Google says the quota is used up for now.',
  address: 'Google could not find one of the addresses.',
  'no-route': 'Google found no route for that mode.',
  offline: 'I could not reach Google.',
  'bad-response': 'Google answered in a way I could not read.',
};
const fail = (code: MapsErrorCode): never => {
  throw new MapsError(code, MESSAGES[code]);
};

export function googleProvider(opts: { key: string; fetchFn?: typeof fetch; regionCode?: string; timeoutMs?: number }): TravelTimeProvider {
  const { key, regionCode, timeoutMs = 10000 } = opts;
  const fetchFn = opts.fetchFn ?? fetch;
  return {
    status: 'ready',
    async lookup({ fromAddress, toAddress, mode }) {
      const body = {
        origin: { address: fromAddress },
        destination: { address: toAddress },
        travelMode: GOOGLE_MODE[mode],
        ...(regionCode ? { regionCode } : {}),
      };
      let res: Response;
      try {
        res = await fetchFn(GOOGLE_URL, {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(timeoutMs),
          headers: { 'content-type': 'application/json', 'x-goog-api-key': key, 'x-goog-fieldmask': 'routes.duration' },
          body: JSON.stringify(body),
        });
      } catch {
        return fail('offline');
      }
      if (res.status === 401 || res.status === 403) return fail('key');
      if (res.status === 429) return fail('quota');
      if (res.status === 400 || res.status === 404) return fail('address');
      if (!res.ok) return fail('bad-response');
      let data: any;
      try {
        data = await res.json();
      } catch {
        return fail('bad-response');
      }
      const routes = data && typeof data === 'object' ? data.routes : undefined;
      if (routes === undefined || (Array.isArray(routes) && routes.length === 0)) return fail('no-route');
      const duration = Array.isArray(routes) ? routes[0]?.duration : undefined;
      if (typeof duration !== 'string' || !/^\d+(\.\d+)?s$/.test(duration)) return fail('bad-response');
      return { minutes: Math.min(600, Math.ceil(Number.parseFloat(duration) / 60)) };
    },
  };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src test && git commit -m "feat: the Google Routes provider" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Lookups, refresh, the cap and the endpoints

**Files:**
- Create: `src/commutelookup.ts`
- Modify: `src/server.ts`, `src/validate.ts`
- Test: `test/commutelookup.test.ts` (new), `test/server.maps.test.ts` (new), `test/maps.test.ts` (update the existing status test)

**Interfaces:**
- Consumes: `MapsError`, `googleProvider` (Task 2); `MapsFound`, `mapsUsage` (Task 1).
- Produces:
  - `type LookupResult = { ok: true; minutes: number; at: DateStr } | { ok: false; code: string; message: string }`
  - `class BadLookup extends Error`
  - `interface LookupDeps { maps: TravelTimeProvider; load(): State; save(s: State): void; limit: number }`
  - `usageFor(state, today, limit): { month: string; count: number; limit: number }`
  - `isStale(c: Commute, places: Place[], today: DateStr): boolean`
  - `lookupCommute(deps, commuteId, today): Promise<LookupResult>` (throws `BadLookup` for an unknown or typed commute)
  - `refreshCommutes(deps, today): Promise<{ updated: number; failed: number; skipped: number }>`
  - `validateLookupRequest(x): { today: string; commuteId: string }`, `validateRefreshRequest(x): { today: string }`
  - `createApp` option `mapsLimit?: number`. Endpoints `POST /api/commute/lookup`, `POST /api/commute/refresh`; `GET /api/commute/status` answers `{ maps }` alone when unavailable, and `{ maps, usage }` when ready.

- [ ] **Step 1: Write the failing tests**

`test/commutelookup.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BadLookup, isStale, lookupCommute, refreshCommutes, usageFor } from '../src/commutelookup.ts';
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
  assert.deepEqual((r.state().commutes[0].source as any).found, { minutes: 33, at: TODAY, fromAddress: '1 Main St', toAddress: '9 Uni Rd' });
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
  assert.equal((await lookupCommute(r.deps, 'k', '2026-11-01') as any).ok, true);
  assert.deepEqual(r.state().mapsUsage, { month: '2026-11', count: 1 });
  assert.deepEqual(usageFor(r.state(), '2026-11-15', 3), { month: '2026-11', count: 1, limit: 3 });
  assert.deepEqual(usageFor(r.state(), '2026-12-01', 3), { month: '2026-12', count: 0, limit: 3 });
});

test('a failed lookup keeps the old result, says why and still counts', async () => {
  const old = { minutes: 50, at: '2026-09-30', fromAddress: '1 Main St', toAddress: '9 Uni Rd' };
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
  const f = (over: any = {}) => ({ minutes: 30, at: TODAY, fromAddress: '1 Main St', toAddress: '9 Uni Rd', ...over });
  const withFound = (found: any) => commute('k', 'c', { method: 'maps', mode: 'car', fallbackMinutes: 40, ...(found ? { found } : {}) });
  assert.equal(isStale(withFound(undefined), places, TODAY), true);
  assert.equal(isStale(withFound(f()), places, TODAY), false);
  assert.equal(isStale(withFound(f({ at: '2026-09-28' })), places, TODAY), false, '14 days old is not stale yet');
  assert.equal(isStale(withFound(f({ at: '2026-09-27' })), places, TODAY), true);
  assert.equal(isStale(withFound(f({ toAddress: 'elsewhere' })), places, TODAY), true);
  assert.equal(isStale(commute('t', 'c', { method: 'typed', minutes: 20 }), places, TODAY), false);
  assert.equal(isStale(commute('a', 's'), places, TODAY), false, 'no address, nothing to look up');
});

test('refresh looks up only stale Maps commutes, at most ten, and stops at the first key problem', async () => {
  const fresh = commute('fresh', 'c', { method: 'maps', mode: 'car', fallbackMinutes: 40, found: { minutes: 30, at: TODAY, fromAddress: '1 Main St', toAddress: '9 Uni Rd' } });
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
```


`test/server.maps.test.ts`:

```ts
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
let fail: MapsError | null = null;
const maps = { status: 'ready' as const, async lookup() { if (fail) throw fail; return { minutes: 41 }; } };
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
  fail = new MapsError('key', 'Google rejected the key. Check that the Routes API is enabled for it and that billing is on.');
  const failed = await (await post(readyBase, '/api/commute/lookup', { today: TODAY, commuteId: 'k' })).json();
  assert.deepEqual([failed.ok, failed.code], [false, 'key']);
  fail = null;
  const limited = await (await post(readyBase, '/api/commute/lookup', { today: TODAY, commuteId: 'k' })).json();
  assert.deepEqual([limited.ok, limited.code], [false, 'limit']);
  const status = await (await fetch(`${readyBase}/api/commute/status`)).json();
  assert.equal(status.maps, 'ready');
  assert.deepEqual([status.usage.count, status.usage.limit], [2, 3]);
  assert.match(status.usage.month, /^\d{4}-\d{2}$/);
});
```

Update the existing status test in `test/maps.test.ts`: replace `assert.deepEqual(await (await fetch(`${readyBase}/api/commute/status`)).json(), { maps: 'ready' });` with

```ts
  const status = await (await fetch(`${readyBase}/api/commute/status`)).json();
  assert.equal(status.maps, 'ready');
  assert.deepEqual([status.usage.count, status.usage.limit], [0, 5000]);
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/commutelookup.test.ts test/server.maps.test.ts test/maps.test.ts`
Expected: FAIL (module not found, no endpoints).

- [ ] **Step 3: Implement**

`src/validate.ts`: add at the end:

```ts
export function validateLookupRequest(x: unknown): { today: string; commuteId: string } {
  const o = obj(x, 'request');
  return { today: dateStr(o.today, 'today'), commuteId: str(o.commuteId, 'commuteId') };
}

export function validateRefreshRequest(x: unknown): { today: string } {
  const o = obj(x, 'request');
  return { today: dateStr(o.today, 'today') };
}
```

`src/commutelookup.ts`:

```ts
import { daysBetween } from './dates.ts';
import { MapsError } from './maps.ts';
import type { TravelTimeProvider } from './maps.ts';
import type { Commute, DateStr, Place, State } from './types.ts';

export type LookupResult = { ok: true; minutes: number; at: DateStr } | { ok: false; code: string; message: string };

export class BadLookup extends Error {}

export interface LookupDeps {
  maps: TravelTimeProvider;
  load(): State;
  save(state: State): void;
  limit: number;
}

const STALE_DAYS = 14;
const MAX_REFRESH = 10;

export function usageFor(state: State, today: DateStr, limit: number): { month: string; count: number; limit: number } {
  const month = today.slice(0, 7);
  return { month, count: state.mapsUsage && state.mapsUsage.month === month ? state.mapsUsage.count : 0, limit };
}

const counted = (state: State, today: DateStr): State => {
  const month = today.slice(0, 7);
  const count = state.mapsUsage && state.mapsUsage.month === month ? state.mapsUsage.count : 0;
  return { ...state, mapsUsage: { month, count: count + 1 } };
};

const placeOf = (places: Place[], id: string): Place | undefined => places.find((p) => p.id === id);

// Worth looking up again: never found, older than two weeks, or found for other addresses.
export function isStale(c: Commute, places: Place[], today: DateStr): boolean {
  if (c.source.method !== 'maps') return false;
  const from = placeOf(places, c.fromPlaceId);
  const to = placeOf(places, c.toPlaceId);
  if (!from || !to || from.address.trim() === '' || to.address.trim() === '') return false;
  const found = c.source.found;
  if (!found) return true;
  return found.fromAddress !== from.address || found.toAddress !== to.address || daysBetween(found.at, today) > STALE_DAYS;
}

export async function lookupCommute(deps: LookupDeps, commuteId: string, today: DateStr): Promise<LookupResult> {
  const before = deps.load();
  const c = before.commutes.find((x) => x.id === commuteId);
  if (!c || c.source.method !== 'maps') throw new BadLookup('That commute does not use Google Maps.');
  const mode = c.source.mode;
  const from = placeOf(before.places, c.fromPlaceId);
  const to = placeOf(before.places, c.toPlaceId);
  if (!from || !to) throw new BadLookup('That commute has a place that is gone.');
  for (const p of [from, to]) {
    if (p.address.trim() === '') return { ok: false, code: 'address-missing', message: `Add an address to ${p.name} first.` };
  }
  const { count, limit } = usageFor(before, today, deps.limit);
  if (count >= limit) {
    return { ok: false, code: 'limit', message: `This month's ${limit} lookups are used up, so your typed time is used until next month.` };
  }
  let minutes = 0;
  let failure: { code: string; message: string } | null = null;
  try {
    minutes = (await deps.maps.lookup({ fromAddress: from.address, toAddress: to.address, mode })).minutes;
  } catch (e) {
    failure = e instanceof MapsError ? { code: e.code, message: e.message } : { code: 'bad-response', message: 'Google answered in a way I could not read.' };
  }
  // Read again after the wait: the browser may have saved something in the meantime.
  const now = counted(deps.load(), today);
  if (failure) {
    deps.save(now);
    return { ok: false, ...failure };
  }
  const target = now.commutes.find((x) => x.id === commuteId);
  if (!target || target.source.method !== 'maps') {
    deps.save(now);
    return { ok: false, code: 'gone', message: 'That commute changed while I was looking, so I kept it as it was.' };
  }
  const found = { minutes, at: today, fromAddress: from.address, toAddress: to.address };
  deps.save({
    ...now,
    commutes: now.commutes.map((x) => (x.id === commuteId && x.source.method === 'maps' ? { ...x, source: { ...x.source, found } } : x)),
  });
  return { ok: true, minutes, at: today };
}

export async function refreshCommutes(deps: LookupDeps, today: DateStr): Promise<{ updated: number; failed: number; skipped: number }> {
  const state = deps.load();
  const due = state.commutes.filter((c) => isStale(c, state.places, today));
  let updated = 0;
  let failed = 0;
  let done = 0;
  for (const c of due.slice(0, MAX_REFRESH)) {
    done++;
    const r = await lookupCommute(deps, c.id, today);
    if (r.ok) updated++;
    else {
      failed++;
      if (r.code === 'key' || r.code === 'quota' || r.code === 'limit') break;
    }
  }
  return { updated, failed, skipped: due.length - done };
}
```

`src/server.ts`: add imports `import { BadLookup, lookupCommute, refreshCommutes, usageFor } from './commutelookup.ts';`, `import { googleProvider } from './maps.ts';` (change the existing maps import line to import `googleProvider` and `unavailableProvider` together), and add `validateLookupRequest, validateRefreshRequest` to the validate import. In `createApp` options type add `mapsLimit?: number` and after `const maps = ...` add:

```ts
  const mapsLimit = options.mapsLimit ?? 5000;
  const lookupDeps = { maps, limit: mapsLimit, load: () => loadState(statePath), save: (s: State) => saveState(statePath, s) };
  const monthNow = () => new Date().toISOString().slice(0, 10);
```

Replace the status branch with:

```ts
      if (req.method === 'GET' && pathname === '/api/commute/status') {
        return send(res, 200, maps.status === 'ready' ? { maps: maps.status, usage: usageFor(loadState(statePath), monthNow(), mapsLimit) } : { maps: maps.status });
      }
      if (req.method === 'POST' && pathname === '/api/commute/lookup') {
        const request = validateLookupRequest(await readJson(req));
        if (maps.status !== 'ready') throw new HttpError(503, 'Google Maps is not connected yet');
        try {
          return send(res, 200, await lookupCommute(lookupDeps, request.commuteId, request.today));
        } catch (e) {
          if (e instanceof BadLookup) throw new HttpError(400, e.message);
          throw e;
        }
      }
      if (req.method === 'POST' && pathname === '/api/commute/refresh') {
        const request = validateRefreshRequest(await readJson(req));
        if (maps.status !== 'ready') throw new HttpError(503, 'Google Maps is not connected yet');
        return send(res, 200, await refreshCommutes(lookupDeps, request.today));
      }
```

(Delete the old status `if` block.) In the `import.meta.main` block build the provider from the environment:

```ts
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const region = process.env.GOOGLE_MAPS_REGION;
  const limit = Number(process.env.MAPS_MONTHLY_LIMIT);
  createApp(file, {
    ...(typeof key === 'string' && key.trim() !== '' ? { maps: googleProvider({ key: key.trim(), ...(region ? { regionCode: region } : {}) }) } : {}),
    ...(Number.isInteger(limit) && limit > 0 ? { mapsLimit: limit } : {}),
  }).listen(port, '127.0.0.1', () => {
```

(replacing `createApp(file).listen(port, '127.0.0.1', () => {`; the log line after it stays, and add `console.log(key ? 'Google Maps is connected.' : 'Google Maps is not connected (no GOOGLE_MAPS_API_KEY).');` without printing the key.)

- [ ] **Step 4: Run to verify they pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src test && git commit -m "feat: look commutes up with Google Maps, refresh stale ones, and cap the month" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The browser side

**Files:**
- Create: `public/js/maps-ui.js`
- Modify: `public/js/api.js`, `public/js/store.js`, `public/js/setup.js`
- Test: `test/frontend/maps-ui.test.ts` (new), `test/frontend/api.test.ts`, `test/frontend/store.test.ts`, `test/frontend/setup.test.ts`

**Interfaces:**
- Consumes: the endpoints and `found` (Tasks 1 and 3).
- Produces: `api.lookupCommute(id, clock)` and `api.refreshCommutes(clock)`; store fields `mapsUsage` (`{ month, count, limit }` or null) and `mapsNote` (`{ commuteId, ok, message }` or null); store methods `lookupCommute(id)` and `refreshCommutes()`; `mapsLines(item, state, ctx)` and `renderMapsBlock(dom, d, ctx)` in `maps-ui.js`; the commutes form gets a custom field `mapsBlock`.

- [ ] **Step 1: Write the failing tests**

`test/frontend/maps-ui.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDom } from '../../public/js/dom.js';
import { mapsLines, renderMapsBlock } from '../../public/js/maps-ui.js';
import { FakeDocument, byTag, findAll, textOf } from './fakedom.ts';

const places = [{ id: 'h', name: 'Home', kind: 'home', address: '1 Main St' }, { id: 'c', name: 'Campus', kind: 'campus', address: '9 Uni Rd' }];
const item = (found?: any) => ({ id: 'k', fromPlaceId: 'h', toPlaceId: 'c', repeats: null, marginMinutes: 10, source: { method: 'maps', mode: 'transit', fallbackMinutes: 40, ...(found ? { found } : {}) } });
const found = { minutes: 55, at: '2026-10-12', fromAddress: '1 Main St', toAddress: '9 Uni Rd' };
const ctx = (over: any = {}) => ({ state: { places }, maps: 'ready', mapsUsage: { month: '2026-10', count: 12, limit: 5000 }, mapsNote: null, busy: false, ...over });

test('the lines say what Google found, or that nothing was looked up and the typed time is used', () => {
  assert.equal(mapsLines(item(found), { mode: 'transit', minutes: '40' }, ctx()).found, 'Google found 55 min on 12 Oct.');
  assert.equal(mapsLines(item(), { mode: 'transit', minutes: '40' }, ctx()).found, 'Not looked up yet. Using your typed 40 min.');
  assert.equal(mapsLines(item({ ...found, toAddress: 'old' }), { mode: 'transit', minutes: '35' }, ctx()).found, 'Not looked up yet for these addresses. Using your typed 35 min.');
  assert.equal(mapsLines(null, { mode: 'transit', minutes: '40' }, ctx()).found, 'Save it and I will look the time up.');
});

test('usage, the last failure for this commute, and the walk and bike warning', () => {
  assert.equal(mapsLines(item(), { mode: 'car', minutes: '40' }, ctx()).usage, 'Used 12 of 5000 lookups this month.');
  assert.equal(mapsLines(item(), { mode: 'car', minutes: '40' }, ctx({ mapsUsage: null })).usage, null);
  const note = { commuteId: 'k', ok: false, message: 'Google found no route for that mode.' };
  assert.equal(mapsLines(item(), { mode: 'car', minutes: '40' }, ctx({ mapsNote: note })).failure, 'Google found no route for that mode.');
  assert.equal(mapsLines(item(), { mode: 'car', minutes: '40' }, ctx({ mapsNote: { ...note, commuteId: 'other' } })).failure, null);
  assert.equal(mapsLines(item(), { mode: 'car', minutes: '40' }, ctx({ mapsNote: { ...note, ok: true, message: null } })).failure, null);
  const warn = 'Walking and bicycling routes may be missing sidewalks or bike paths. Check the time before you rely on it.';
  assert.equal(mapsLines(item(), { mode: 'walk', minutes: '40' }, ctx()).warning, warn);
  assert.equal(mapsLines(item(), { mode: 'bike', minutes: '40' }, ctx()).warning, warn);
  assert.equal(mapsLines(item(), { mode: 'transit', minutes: '40' }, ctx()).warning, null);
});

test('the block has a Refresh now button that looks the commute up, and is off when Maps is not ready or busy', () => {
  const dom = createDom(new FakeDocument() as any);
  const calls: string[] = [];
  const draw = (over: any = {}) => renderMapsBlock(dom, { method: 'maps', mode: 'transit', minutes: '40' }, ctx({ item: item(found), lookup: (id: string) => calls.push(id), ...over })) as any;
  const el = draw();
  assert.match(textOf(el), /Google found 55 min on 12 Oct\./);
  const button = byTag(el, 'button')[0];
  assert.equal(textOf(button).trim(), 'Refresh now');
  button.click();
  assert.deepEqual(calls, ['k']);
  assert.notEqual(byTag(draw({ busy: true }), 'button')[0].getAttribute('disabled'), null);
  assert.notEqual(byTag(draw({ maps: 'unavailable' }), 'button')[0].getAttribute('disabled'), null);
  assert.equal(renderMapsBlock(dom, { method: 'typed', mode: 'transit', minutes: '40' }, ctx()), null, 'nothing for a typed commute');
});

test('hostile text from Google or a place name stays text', () => {
  const dom = createDom(new FakeDocument() as any);
  const evil = '<img src=x onerror=alert(1)>';
  const el: any = renderMapsBlock(dom, { method: 'maps', mode: 'car', minutes: '40' }, ctx({ item: item(), mapsNote: { commuteId: 'k', ok: false, message: evil }, lookup() {} }));
  assert.match(textOf(el), /<img src=x onerror=alert\(1\)>/);
  assert.equal(findAll(el, (e: any) => e.tag === 'img').length, 0);
});
```


Append to `test/frontend/api.test.ts`:

```ts
test('lookupCommute and refreshCommutes post the clock', async () => {
  const f = fakeFetch([{ status: 200, body: { ok: true } }, { status: 200, body: { updated: 0 } }]);
  const api = createApi(f.fn as any);
  await api.lookupCommute('k', { today: '2026-10-12', nowMinutes: 540, horizonDays: 14 });
  await api.refreshCommutes({ today: '2026-10-12', nowMinutes: 540, horizonDays: 14 });
  assert.deepEqual([f.calls[0].path, JSON.parse(f.calls[0].init.body)], ['/api/commute/lookup', { today: '2026-10-12', commuteId: 'k' }]);
  assert.deepEqual([f.calls[1].path, JSON.parse(f.calls[1].init.body)], ['/api/commute/refresh', { today: '2026-10-12' }]);
});
```

Append to `test/frontend/store.test.ts` (it has `make`, `full`, `result`, `ApiError`, `clock`):

```ts
test('the store keeps the Maps usage from the status, and a lookup shows its answer for that commute', async () => {
  const usage = { month: '2026-10', count: 4, limit: 5000 };
  const { store, calls } = make({
    commuteStatus: () => ({ maps: 'ready', usage }),
    refreshCommutes: () => ({ updated: 0, failed: 0, skipped: 0 }),
    lookupCommute: () => ({ ok: false, code: 'no-route', message: 'Google found no route for that mode.' }),
  });
  await store.load();
  assert.deepEqual(store.get().mapsUsage, usage);
  assert.ok(calls.includes('refreshCommutes'), 'stale results are refreshed at load');
  await store.lookupCommute('k');
  assert.deepEqual(store.get().mapsNote, { commuteId: 'k', ok: false, message: 'Google found no route for that mode.' });
  assert.equal(store.get().status, 'ready');
});

test('a successful lookup replans, and a server refusal is a note, not an error page', async () => {
  const ok = make({ commuteStatus: () => ({ maps: 'ready' }), refreshCommutes: () => ({ updated: 0 }), lookupCommute: () => ({ ok: true, minutes: 41, at: '2026-10-12' }) });
  await ok.store.load();
  await ok.store.lookupCommute('k');
  assert.deepEqual(ok.store.get().mapsNote, { commuteId: 'k', ok: true, message: null });
  assert.equal(ok.calls.filter((c: string) => c === 'replan').length, 2, 'once at load and once after the lookup');
  const refused = make({ commuteStatus: () => ({ maps: 'ready' }), refreshCommutes: () => ({ updated: 0 }), lookupCommute: () => { throw new ApiError(400, 'That commute does not use Google Maps.'); } });
  await refused.store.load();
  await refused.store.lookupCommute('k');
  assert.equal(refused.store.get().status, 'ready');
  assert.equal(refused.store.get().mapsNote.message, 'That commute does not use Google Maps.');
});

test('a refresh that updated something replans, and a failing refresh is ignored', async () => {
  const updated = make({ commuteStatus: () => ({ maps: 'ready' }), refreshCommutes: () => ({ updated: 2, failed: 0, skipped: 0 }) });
  await updated.store.load();
  assert.equal(updated.calls.filter((c: string) => c === 'replan').length, 2);
  const broken = make({ commuteStatus: () => ({ maps: 'ready' }), refreshCommutes: () => { throw new ApiError(0, 'The planner is not reachable'); } });
  await broken.store.load();
  assert.equal(broken.store.get().status, 'ready');
  const none = make();
  await none.store.load();
  assert.equal(none.store.get().status, 'ready');
});
```

For `test/frontend/setup.test.ts` append (its `setup`, `render`, `byKey`, `named`, `submit`, `stateWith` exist; the fake store there needs `lookupCommute`, so add it to the `store` object in `setup()` as `lookupCommute: async (id: string) => { lookups.push(id); },` with `const lookups: any[] = [];` declared next to `estimates` and returned from `setup()` as `lookups`):

```ts
test('the commute form shows the Maps lines, and saving a Maps commute asks for a lookup', async () => {
  const withMaps = stateWith({
    places: [{ id: 'home', name: 'Home', kind: 'home', address: '1 Main St' }, { id: 'campus', name: 'Campus', kind: 'campus', address: '9 Uni Rd' }],
    commutes: [{ id: 'r1', fromPlaceId: 'home', toPlaceId: 'campus', repeats: null, marginMinutes: 10, source: { method: 'maps', mode: 'walk', fallbackMinutes: 40 } }],
  });
  const { render, lookups, setStore } = setup(withMaps, { storeState: { maps: 'ready', mapsUsage: { month: '2026-10', count: 3, limit: 5000 } } });
  const el: any = render('commutes', 'r1');
  assert.match(textOf(el), /Not looked up yet\. Using your typed 40 min\./);
  assert.match(textOf(el), /Used 3 of 5000 lookups this month\./);
  assert.match(textOf(el), /Walking and bicycling routes may be missing sidewalks or bike paths/);
  assert.ok(named(el, 'Refresh now'));
  await submit(el);
  assert.deepEqual(lookups, ['r1']);
});

test('a typed commute asks for no lookup and shows no Maps lines', async () => {
  const typed = stateWith({
    places: [{ id: 'home', name: 'Home', kind: 'home', address: '1 Main St' }, { id: 'campus', name: 'Campus', kind: 'campus', address: '9 Uni Rd' }],
    commutes: [{ id: 'r1', fromPlaceId: 'home', toPlaceId: 'campus', repeats: null, marginMinutes: 10, source: { method: 'typed', minutes: 20 } }],
  });
  const { render, lookups } = setup(typed, { storeState: { maps: 'ready' } });
  const el: any = render('commutes', 'r1');
  assert.doesNotMatch(textOf(el), /Google found|Not looked up/);
  await submit(el);
  assert.deepEqual(lookups, []);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/frontend/maps-ui.test.ts test/frontend/api.test.ts test/frontend/store.test.ts test/frontend/setup.test.ts`
Expected: FAIL (module not found, no store methods).

- [ ] **Step 3: Implement**

`public/js/api.js`: add after `checkIn:`:

```js
    lookupCommute: (commuteId, clock) => call('POST', '/api/commute/lookup', { today: clock.today, commuteId }),
    refreshCommutes: (clock) => call('POST', '/api/commute/refresh', { today: clock.today }),
```

`public/js/maps-ui.js`:

```js
import { shortDate } from './time.js';

const PATHS_WARNING = 'Walking and bicycling routes may be missing sidewalks or bike paths. Check the time before you rely on it.';

// What the commute form says about Google Maps, as plain sentences. Pure, so it is easy to test.
export function mapsLines(item, draft, ctx) {
  const places = (ctx.state && ctx.state.places) || [];
  let found;
  if (!item || item.source.method !== 'maps') {
    found = 'Save it and I will look the time up.';
  } else {
    const f = item.source.found;
    const from = places.find((p) => p.id === item.fromPlaceId);
    const to = places.find((p) => p.id === item.toPlaceId);
    if (!f) found = `Not looked up yet. Using your typed ${draft.minutes} min.`;
    else if (!from || !to || from.address !== f.fromAddress || to.address !== f.toAddress) found = `Not looked up yet for these addresses. Using your typed ${draft.minutes} min.`;
    else found = `Google found ${f.minutes} min on ${shortDate(f.at)}.`;
  }
  const note = ctx.mapsNote;
  return {
    found,
    failure: item && note && note.commuteId === item.id && !note.ok && note.message ? note.message : null,
    usage: ctx.mapsUsage ? `Used ${ctx.mapsUsage.count} of ${ctx.mapsUsage.limit} lookups this month.` : null,
    warning: draft.mode === 'walk' || draft.mode === 'bike' ? PATHS_WARNING : null,
  };
}

export function renderMapsBlock(dom, draft, ctx) {
  if (draft.method !== 'maps') return null;
  const { h } = dom;
  const lines = mapsLines(ctx.item ?? null, draft, ctx);
  const canRefresh = Boolean(ctx.item) && ctx.maps === 'ready' && !ctx.busy;
  return h('div', { class: 'mapsb' },
    h('p', { class: 'hint' }, lines.found),
    lines.failure && h('p', { class: 'hint err-line', role: 'status' }, lines.failure),
    lines.warning && h('p', { class: 'hint' }, lines.warning),
    lines.usage && h('p', { class: 'hint mono' }, lines.usage),
    h('button', { type: 'button', class: 'go2 mono', 'data-fk': 'maps-refresh', disabled: !canRefresh, onclick: () => ctx.lookup(ctx.item.id) }, 'Refresh now'));
}
```

`public/js/store.js`: add `mapsUsage: null, mapsNote: null,` to the initial `current`. In `load()` replace the maps block so it also keeps usage:

```js
      let maps = 'unavailable';
      let mapsUsage = null;
      try {
        const status = await api.commuteStatus();
        maps = status.maps === 'ready' ? 'ready' : 'unavailable';
        mapsUsage = status.usage ?? null;
      } catch {
        // Not knowing about Google Maps is never a reason to fail the page.
      }
```

(change `current = { ...current, state, maps };` to include `mapsUsage`, and the empty-state `set({...maps...})` call to include `mapsUsage`). After the final `set(merged(r, { isEmpty: false, confirm: null }));` in `load()` add `if (maps === 'ready') await refreshStale();`. Add inside `createStore` before `return {`:

```js
  // Results older than two weeks, or for changed addresses, are looked up again. Best effort: any failure is ignored.
  async function refreshStale() {
    try {
      const r = await api.refreshCommutes(getClock());
      if (r && r.updated > 0) {
        const state = await api.getState();
        const plan = await api.replan(getClock());
        current = { ...current, state };
        set(merged(plan, {}));
      }
    } catch {
      // The typed times keep working.
    }
  }
```

and add to the returned object after `reopenCheckIn`:

```js
    lookupCommute: (id) =>
      guard(async () => {
        let r;
        try {
          r = await api.lookupCommute(id, getClock());
        } catch (e) {
          if (e && typeof e.status === 'number' && e.status !== 0 && e.message) {
            set({ mapsNote: { commuteId: id, ok: false, message: e.message } });
            return;
          }
          throw e;
        }
        let mapsUsage = current.mapsUsage;
        try {
          mapsUsage = (await api.commuteStatus()).usage ?? mapsUsage;
        } catch {
          // The usage line just stays as it was.
        }
        const state = await api.getState();
        const plan = await api.replan(getClock());
        current = { ...current, state, mapsUsage };
        set(merged(plan, { mapsNote: { commuteId: id, ok: r.ok, message: r.ok ? null : r.message } }));
      }),
    refreshCommutes: () => refreshStale(),
```

`public/js/setup.js`: add `import { renderMapsBlock } from './maps-ui.js';`. In `FIELDS.commutes` add after the `mode` field:

```js
    { name: 'mapsBlock', type: 'custom', span: 3, show: (d) => d.method === 'maps', render: (dom, d, ctx) => renderMapsBlock(dom, d, ctx) },
```

and change the `note` hint text to `'Google Maps is not connected yet. To connect it, follow docs/google-maps-setup.md. Until then, the time you type is used, and the Maps choice stays dimmed.'` (update any existing test that matches the old sentence). In `formColumn` extend the `ctx` object:

```js
    const ctx = { state: s.state, maps: s.maps, mapsUsage: s.mapsUsage, mapsNote: s.mapsNote, busy: s.busy, item: sel.item, lookup: (id) => store.lookupCommute(id), scratch: local.scratch, rerender, estimate: estimateApi() };
```

(`store` is in scope in `createSetup`; use the same name the file already uses.) In `save(sel)`, after the final `await finish(...)` line add:

```js
    if (kindId === 'commutes' && result.item.source.method === 'maps' && typeof store.lookupCommute === 'function' && !store.get().formError) {
      await store.lookupCommute(result.item.id);
    }
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test`
Expected: all pass. If an existing test matches the old "Google Maps is not connected yet. Until it is, ..." sentence, update it to the new text.

- [ ] **Step 5: Commit**

```bash
git add public test && git commit -m "feat: the commute form shows what Google found and can refresh it" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The setup guide, end to end and the visual check

**Files:**
- Create: `docs/google-maps-setup.md`, `test/frontend/maps-e2e.test.ts`
- Modify: `docs/ui-visual-check.md`

**Interfaces:**
- Consumes: everything above, through the real server with a fake provider (`createApp(file, { maps })`). Copy the scaffolding of `test/frontend/attendance-e2e.test.ts` (server setup, `boot`, `settled`, `put`, `now` of Monday 5 Oct 2026 07:00), keeping `checkInEnabled: false`.

- [ ] **Step 1: Write the end-to-end test**

```ts
// Same imports and scaffolding as test/frontend/attendance-e2e.test.ts, but the server is created with a fake provider:
//   const asked: any[] = [];
//   server = createApp(file, { maps: { status: 'ready', async lookup(q: any) { asked.push(q); return { minutes: 50 }; } } });
const stateWithMapsCommute = () => ({
  ...emptyState(),
  tasks: [{ id: 't', title: 'Study', category: 'study', weeklyMinutes: 300, maxBlock: 120, onePerDay: false, priority: 3 }],
  places: [{ id: 'h', name: 'Home', kind: 'home', address: '1 Main St' }, { id: 'c', name: 'Campus', kind: 'campus', address: '9 Uni Rd' }],
  commitments: [{ id: 'lec', title: 'Lecture at Campus', category: 'class', start: 720, end: 780, bufferBefore: 0, exceptions: [],
    pattern: { kind: 'weekly', weekdays: [1], from: '2026-10-05', to: '2026-12-31' } }],
  commutes: [{ id: 'k', fromPlaceId: 'h', toPlaceId: 'c', repeats: null, marginMinutes: 10, source: { method: 'maps', mode: 'transit', fallbackMinutes: 30 } }],
  preferences: { ...structuredClone(defaultPreferences), checkInEnabled: false },
});

test('a stale Maps commute is refreshed at load, and the planner uses the found time plus the margin', async () => {
  assert.equal((await put(stateWithMapsCommute())).status, 200);
  const { app } = boot();
  await settled(app);
  await new Promise((r) => setTimeout(r, 100));
  await settled(app);
  assert.equal(asked.length, 1);
  assert.deepEqual(asked[0], { fromAddress: '1 Main St', toAddress: '9 Uni Rd', mode: 'transit' });
  const legs = app.store.get().travel.filter((l: any) => l.date === '2026-10-05' && l.toName === 'Campus');
  assert.equal(legs.length, 1);
  assert.equal(legs[0].end - legs[0].start, 60, '50 found plus 10 margin');
  assert.equal(legs[0].estimated, false);
  const saved = await (await fetch(`${base}/api/state`)).json();
  assert.equal(saved.commutes[0].source.found.minutes, 50);
  assert.equal(saved.mapsUsage.count, 1);
});

test('a second load finds the result fresh and asks Google nothing', async () => {
  const before = asked.length;
  const { app } = boot();
  await settled(app);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(asked.length, before);
});

test('changing the address of a place makes the old result stop counting, until it is looked up again', async () => {
  const state: any = await (await fetch(`${base}/api/state`)).json();
  state.places = state.places.map((p: any) => (p.id === 'c' ? { ...p, address: '77 New Ave' } : p));
  assert.equal((await put(state)).status, 200);
  const { app } = boot();
  await settled(app);
  const first = app.store.get().travel.filter((l: any) => l.date === '2026-10-05' && l.toName === 'Campus');
  assert.ok(first.length === 1);
  await new Promise((r) => setTimeout(r, 100));
  await settled(app);
  assert.equal(asked.at(-1).toAddress, '77 New Ave', 'it looked the new address up');
});
```

(`put` here accepts any state; reuse the scaffolding's `put`.)

- [ ] **Step 2: Run it**

Run: `node --test test/frontend/maps-e2e.test.ts`
Expected after Tasks 1 to 4: PASS. If it fails, fix the product code, not the test, unless a helper name differs from the attendance e2e file.

- [ ] **Step 3: Write the setup guide** (`docs/google-maps-setup.md`)

```md
# Connecting Google Maps

Maps is optional. Without it, every commute uses the time you type. With it, a commute set to "Google Maps finds it" looks its time up once, keeps it, and checks again every two weeks or when an address changes.

## What it costs

Google gives a free monthly allowance for route lookups (about 10,000 for the basic kind at the time of writing, then about $5 per 1,000). This app counts every lookup and stops at 5,000 a month by default, so a personal planner stays far inside the free allowance. Check Google's current prices before you start: https://developers.google.com/maps/billing-and-pricing/pricing

## Steps

1. Go to https://console.cloud.google.com and create a project (any name).
2. Turn on billing for the project. Google asks for a card even if you stay inside the free allowance.
3. Set a budget alert: Billing, Budgets and alerts, create a budget (for example 5 dollars) with email alerts.
4. Enable the **Routes API**: APIs and Services, Library, search "Routes API", Enable.
5. Create a key: APIs and Services, Credentials, Create credentials, API key.
6. Restrict the key: open it, under API restrictions choose "Restrict key" and tick only **Routes API**. Save.
7. Start the planner with the key in the environment:

   GOOGLE_MAPS_API_KEY=your-key npm run serve

   The server prints "Google Maps is connected." (never the key). Optional: `GOOGLE_MAPS_REGION=es` (two letters) helps Google read incomplete addresses; `MAPS_MONTHLY_LIMIT=2000` lowers the cap.
8. Open Plan, Commutes. Give both places a full address, choose "Google Maps finds it", pick how you travel and save. The form shows "Google found NN min".

Never paste the key into the app, a file in this folder, or a chat. If it leaks, delete it in the Google console and make a new one.

## What the messages mean

- "Google rejected the key. Check that the Routes API is enabled for it and that billing is on." The key is wrong, the Routes API is off for it, or billing is off.
- "Google says the quota is used up for now." Wait and try again later.
- "Google could not find one of the addresses." Write the address in full, with the city.
- "Google found no route for that mode." For example no bus data in that area. Pick another mode or type the time.
- "I could not reach Google." You are offline. The typed time is used.
- "This month's 5000 lookups are used up." The cap of this app. The typed time is used until next month.

When anything fails, your typed time is used and nothing breaks.
```

- [ ] **Step 4: Visual check doc**

Append to `docs/ui-visual-check.md`:

```md
## Google Maps

- Without a key: Plan, Commutes: the "Google Maps finds it" choice is dimmed and says to follow docs/google-maps-setup.md.
- With a key (see docs/google-maps-setup.md): choose Google Maps finds it, pick a mode and save. Under the form a line says "Google found NN min on 12 Oct." with a Refresh now button and "Used N of 5000 lookups this month."
- Pick Walk or Bike: a sentence warns that walking and bicycling routes may be missing sidewalks or bike paths.
- Give a place no address and press Refresh now: "Add an address to NAME first." Break the key on purpose: the form shows the plain "Google rejected the key" sentence and your typed time keeps being used.
- Week: the Commute entries use the found time plus your margin; they say "Commute NN".
```

- [ ] **Step 5: Full run**

Run: `npm test`
Expected: all pass (rerun `node --test test/perf.test.ts` alone if it is the only failure).

```bash
git add test docs && git commit -m "docs: connecting Google Maps, and the Maps end-to-end test" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-review

- **Spec coverage:** `found` and `mapsUsage` with validation, and `minutesFor` that ignores a result when an address changed (Task 1); the provider with the exact URL, headers, field mask, mode map, no `routingPreference`, optional region, rounding up, 600 clamp, error codes with our own messages, key never in messages or URL (Task 2); lookup with missing address, monthly limit and rollover, failed lookups counted and keeping the old result, re-reading state after the network wait, deleted commute handled, refresh with staleness, cap of 10 and stopping at key, quota or limit, the endpoints with 503 and 400, status with usage, env wiring and `MAPS_MONTHLY_LIMIT` (Task 3); form lines, Refresh now, walk and bike warning, usage line, lookup on save, refresh at load best effort, failures as notes not error pages (Task 4); setup guide with budget alert and key restriction, end to end with the fake provider, visual list (Task 5). Out of scope items are not built.
- **Placeholder scan:** none. Task 4's setup test additions say to add `lookupCommute` and `lookups` to the existing `setup()` helper, and the exact lines are given.
- **Types:** `MapsFound`, `found`, `mapsUsage`, `minutesFor(c, places)`, `MapsError`, `MapsErrorCode`, `googleProvider`, `LookupResult`, `BadLookup`, `LookupDeps`, `usageFor`, `isStale`, `lookupCommute`, `refreshCommutes`, `validateLookupRequest`, `validateRefreshRequest`, `mapsLimit`, `api.lookupCommute`, `api.refreshCommutes`, store `mapsUsage`/`mapsNote`/`lookupCommute`/`refreshCommutes`, `mapsLines`, `renderMapsBlock` are spelled the same throughout.
