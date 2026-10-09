# Commute Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The planner leaves room to get places. Places (home, campus, church, each student's address) and commute routes become travel blocks around events, shown in the Week, with Places and Commutes screens to manage them. Travel times are typed by the user for now; Google Maps plugs in later behind a provider interface.

**Architecture:** `State` gains `places` and `commutes`; `Commitment` gains an optional `placeId`; `Preferences` gains `travelAllowanceMinutes`. A pure module `src/travel.ts` turns a day's events into travel legs (busy time) and warnings. The planner treats legs as busy, returns them as `travel`, and the server sends them with every plan response. The browser draws them (hatched grey) and manages places and commutes through the existing Setup list-and-form engine.

**Tech Stack:** Dependency-free TypeScript run by Node's built-in type stripping (`import type`, `.ts` import extensions, no enums, no parameter properties); browser ES modules in `public/js` (no framework, no build); `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-10-commute-design.md`. Visual source of truth: boards P (Places) and Q (Commutes) on https://claude.ai/artifact/TNMnuzerDogRwvQxJSNdPP, plus the Setup boards H, M, N, O they extend.

## Global Constraints

- No npm dependencies. No `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`eval`/`new Function`, no inline styles (the server CSP blocks them), no network requests from the browser except same-origin `/api/...`. Modules must not touch `window`, `document` or `localStorage` at import time.
- All user text (place names, addresses, titles) reaches the page through `createTextNode`, `textContent` or `value` (the `dom.js` helper does this). It never reaches a regular expression unescaped.
- Backend code is TypeScript with `import type` for types and `.ts` extensions in imports.
- Old data files without `places`, `commutes`, `placeId` or `travelAllowanceMinutes` must load unchanged in meaning (empty lists, 30 minute allowance) and save back valid.
- Travel is derived on every plan and never stored. Past days are not recomputed.
- Visuals reuse existing tokens: square corners, ink borders, DM Mono labels. Travel is hatched grey (a pattern, not a category colour), no new colour besides the hatch grey `#DAD5C8` from board Q. No emojis.
- The key for Google Maps is never in state and never sent to the browser. This plan ships no Maps call.
- Every task ends with a green `npm test` and one commit whose message ends with the two trailer lines `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_015g9zWNaWwq6C6AoikFwJmf`. Do not push unless the user asks.
- Run all commands from `/Users/tomastello/doitwithme-phase1`.

## Review Focus

1. Place names and addresses containing regular-expression characters (`C++`, `(`, `\`, `[`), RTL override characters, markup or 300+ characters never throw, never mis-match another place, and render only as text (Tasks 2, 6).
2. Deleting a place leaves no commute or commitment pointing at it, the confirmation says how many are affected, and a save built on a fresher server copy that still references a deleted place is rejected with a plain sentence rather than corrupting the file (Tasks 1, 5, 6).
3. Midnight and tight edges: events starting at 00:00 or ending at 24:00, a buffer larger than the start time, overlapping events, two events at the same place, back-to-back events at different places (Task 2).
4. Old state files (no `places`, `commutes`, `placeId`, allowance) load, plan and save back; the browser copes with a state that lacks them (Tasks 1, 4, 5).
5. Plan stability: a 60-day horizon with many places and commitments stays fast; the same missing address warns once, not once per lesson; dismissing a warning survives a day change (Task 3).

## File Structure

```
src/
  types.ts        (modify) Place, Commute, Leg, new fields and warning kinds
  defaults.ts     (modify) travelAllowanceMinutes
  store.ts        (modify) emptyState has places and commutes
  validate.ts     (modify) places, commutes, placeId, allowance
  travel.ts       (new) legsOn, placeFor, minutesFor, appliesOn
  planner.ts      (modify) legs are busy time; plan() returns travel and travel warnings
  replan.ts       (modify) passes places/commutes, returns travel, warningKey knows placeName
  maps.ts         (new) TravelTimeProvider, unavailable and fake providers
  server.ts       (modify) travel in plan responses, GET /api/commute/status
examples/sample-state.json   (modify) Home, Campus, Parish, Anna and one route
public/js/
  api.js          (modify) commuteStatus
  store.js        (modify) travel and maps in the store
  model.js        (modify) travel legs in day items and the week model
  week.js         (modify) hatched travel entries, "Travel is off" line
  nudge-model.js  (modify) address-missing and travel-tight items
  setup-model.js  (modify) place and commute kinds, commitment place, allowance, cascade
  form.js         (modify) custom fields, disabled choice values
  setup.js        (modify) fields for places and commutes, confirm notes, hint
  main.js         (modify) sections, week wiring
public/css/app.css (modify) travel styles, disabled segments
test/             new and extended tests per task
docs/             README status, visual checklist, spec build status
```

---

### Task 1: Data model and validation

**Files:**
- Modify: `src/types.ts`, `src/defaults.ts`, `src/store.ts`, `src/validate.ts`
- Test: `test/validate.test.ts`

**Interfaces:**
- Consumes: existing `validateState`, `emptyState`.
- Produces: types `Place`, `PlaceKind`, `TravelMode`, `Repeats`, `TravelSource`, `Commute`, `Leg`; `Commitment.placeId?: string`; `Preferences.travelAllowanceMinutes: number`; `State.places`, `State.commutes`; `PlanInput.places?`, `PlanInput.commutes?`; `PlanResult.travel: Leg[]`; `WarningDetail.placeName?`; warning kinds `'address-missing'` and `'travel-tight'`.

- [ ] **Step 1: Write the failing tests**

Append to `test/validate.test.ts`:

```ts
const homeP = { id: 'home', name: 'Home', kind: 'home', address: 'Calle 1' };
const campusP = { id: 'campus', name: 'Campus', kind: 'campus', address: '' };
const routeC = (over: any = {}) => ({
  id: 'r1', fromPlaceId: 'home', toPlaceId: 'campus',
  repeats: { kind: 'weekly', weekdays: [1, 2] }, source: { method: 'typed', minutes: 45 }, marginMinutes: 10, ...over,
});
const withPlaces = (s: any) => { s.places = structuredClone([homeP, campusP]); };

test('places, commutes and a commitment place round-trip unchanged', () => {
  const s = sample();
  withPlaces(s);
  s.commutes = [routeC(), routeC({ id: 'r2', repeats: null, source: { method: 'maps', mode: 'bike', fallbackMinutes: 20 } }), routeC({ id: 'r3', repeats: { kind: 'monthly', monthDays: [1, 15] } })];
  s.commitments[0].placeId = 'campus';
  assert.deepEqual(validateState(s), s);
});

test('a file from before commutes loads with no places, no commutes and a 30 minute allowance', () => {
  const old = sample();
  delete old.places;
  delete old.commutes;
  delete old.preferences.travelAllowanceMinutes;
  const s = validateState(old);
  assert.deepEqual(s.places, []);
  assert.deepEqual(s.commutes, []);
  assert.equal(s.preferences.travelAllowanceMinutes, 30);
  assert.equal('placeId' in s.commitments[0], false);
});

test('bad places are rejected with plain sentences', () => {
  rejects((s) => { withPlaces(s); s.places[1].id = 'home'; }, /places contains a duplicate id/);
  rejects((s) => { withPlaces(s); s.places[1].kind = 'home'; }, /only one home/);
  rejects((s) => { withPlaces(s); s.places[0].kind = 'castle'; }, /places\[0\]\.kind/);
  rejects((s) => { withPlaces(s); s.places[0].name = '   '; }, /places\[0\]\.name must not be blank/);
  rejects((s) => { withPlaces(s); s.places[0].name = ''; }, /places\[0\]\.name/);
  rejects((s) => { withPlaces(s); s.places[0].address = 'x'.repeat(301); }, /places\[0\]\.address/);
  rejects((s) => { withPlaces(s); s.places[0].address = 5; }, /places\[0\]\.address/);
});

test('bad commutes are rejected', () => {
  rejects((s) => { withPlaces(s); s.commutes = [routeC({ toPlaceId: 'nowhere' })]; }, /commutes\[0\]\.toPlaceId does not match any place/);
  rejects((s) => { withPlaces(s); s.commutes = [routeC({ fromPlaceId: 'nowhere' })]; }, /commutes\[0\]\.fromPlaceId does not match any place/);
  rejects((s) => { withPlaces(s); s.commutes = [routeC({ toPlaceId: 'home' })]; }, /two different places/);
  rejects((s) => { withPlaces(s); s.commutes = [routeC(), routeC()]; }, /commutes contains a duplicate id/);
  rejects((s) => { withPlaces(s); s.commutes = [routeC({ repeats: { kind: 'weekly', weekdays: [] } })]; }, /weekdays must not be empty/);
  rejects((s) => { withPlaces(s); s.commutes = [routeC({ repeats: { kind: 'weekly', weekdays: [7] } })]; }, /weekdays\[0\]/);
  rejects((s) => { withPlaces(s); s.commutes = [routeC({ repeats: { kind: 'monthly', monthDays: [29] } })]; }, /monthDays\[0\]/);
  rejects((s) => { withPlaces(s); s.commutes = [routeC({ repeats: { kind: 'monthly', monthDays: [] } })]; }, /monthDays must not be empty/);
  rejects((s) => { withPlaces(s); s.commutes = [routeC({ repeats: { kind: 'daily' } })]; }, /repeats\.kind/);
  rejects((s) => { withPlaces(s); s.commutes = [routeC({ source: { method: 'typed', minutes: 601 } })]; }, /minutes/);
  rejects((s) => { withPlaces(s); s.commutes = [routeC({ source: { method: 'maps', mode: 'rocket', fallbackMinutes: 5 } })]; }, /mode/);
  rejects((s) => { withPlaces(s); s.commutes = [routeC({ source: { method: 'magic' } })]; }, /method/);
  rejects((s) => { withPlaces(s); s.commutes = [routeC({ marginMinutes: 121 })]; }, /marginMinutes/);
});

test('a commitment must point at a place that exists, and the allowance has limits', () => {
  rejects((s) => { s.commitments[0].placeId = 'nowhere'; }, /commitments\[0\]\.placeId does not match any place/);
  rejects((s) => { s.preferences.travelAllowanceMinutes = 601; }, /travelAllowanceMinutes/);
  rejects((s) => { s.preferences.travelAllowanceMinutes = 1.5; }, /travelAllowanceMinutes/);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/validate.test.ts`
Expected: the new tests FAIL (places are dropped as unknown fields, so round-trip differs; rejections are not thrown).

- [ ] **Step 3: Types**

In `src/types.ts`:

Add after `Window`:

```ts
export type PlaceKind = 'home' | 'campus' | 'student' | 'other';

export interface Place {
  id: string;
  name: string;
  kind: PlaceKind;
  address: string;
}

export type TravelMode = 'car' | 'bike' | 'transit' | 'walk';

export type Repeats =
  | { kind: 'weekly'; weekdays: number[] }
  | { kind: 'monthly'; monthDays: number[] };

export type TravelSource =
  | { method: 'typed'; minutes: Minutes }
  | { method: 'maps'; mode: TravelMode; fallbackMinutes: Minutes };

export interface Commute {
  id: string;
  fromPlaceId: string;
  toPlaceId: string;
  repeats: Repeats | null;
  source: TravelSource;
  marginMinutes: Minutes;
}

export interface Leg {
  date: DateStr;
  start: Minutes;
  end: Minutes;
  fromName: string;
  toName: string;
  estimated: boolean;
}
```

In `Commitment` add `placeId?: string;` after `bufferBefore`. In `Preferences` add `travelAllowanceMinutes: Minutes;` after `softMode`. In `WarningDetail` add `placeName?: string;`. Change the `Warning.kind` union to `'deadline-short' | 'weekly-short' | 'soft-time-used' | 'soft-offer' | 'address-missing' | 'travel-tight'`. In `PlanInput` add `places?: Place[]; commutes?: Commute[];`. In `PlanResult` add `travel: Leg[];`. In `State` add `places: Place[]; commutes: Commute[];` after `deadlines`.

In `src/defaults.ts` add `travelAllowanceMinutes: 30,` after `softMode: 'ask',`.

In `src/store.ts` `emptyState()` add `places: [], commutes: [],` after `deadlines: [],`.

- [ ] **Step 4: Validation**

In `src/validate.ts`:

Extend the type import to include `Commute, Place, PlaceKind, Repeats, TravelMode, TravelSource`.

Add before `function commitment`:

```ts
const PLACE_KINDS = ['home', 'campus', 'student', 'other'];
const MODES = ['car', 'bike', 'transit', 'walk'];

function place(v: unknown, path: string): Place {
  const o = obj(v, path);
  const name = str(o.name, `${path}.name`);
  if (name.trim().length === 0) fail(`${path}.name must not be blank`);
  if (typeof o.kind !== 'string' || !PLACE_KINDS.includes(o.kind)) fail(`${path}.kind must be home, campus, student or other`);
  if (typeof o.address !== 'string' || o.address.length > 300) fail(`${path}.address must be text of at most 300 characters`);
  return { id: str(o.id, `${path}.id`), name, kind: o.kind as PlaceKind, address: o.address as string };
}

function repeatsOf(v: unknown, path: string): Repeats | null {
  if (v === null) return null;
  const o = obj(v, path);
  if (o.kind === 'weekly') {
    const weekdays = arr(o.weekdays, `${path}.weekdays`).map((d, i) => int(d, `${path}.weekdays[${i}]`, 0, 6));
    if (weekdays.length === 0) fail(`${path}.weekdays must not be empty`);
    return { kind: 'weekly', weekdays };
  }
  if (o.kind === 'monthly') {
    const monthDays = arr(o.monthDays, `${path}.monthDays`).map((d, i) => int(d, `${path}.monthDays[${i}]`, 1, 28));
    if (monthDays.length === 0) fail(`${path}.monthDays must not be empty`);
    return { kind: 'monthly', monthDays };
  }
  return fail(`${path}.kind must be "weekly" or "monthly"`);
}

function sourceOf(v: unknown, path: string): TravelSource {
  const o = obj(v, path);
  if (o.method === 'typed') return { method: 'typed', minutes: int(o.minutes, `${path}.minutes`, 0, 600) };
  if (o.method === 'maps') {
    if (typeof o.mode !== 'string' || !MODES.includes(o.mode)) fail(`${path}.mode must be car, bike, transit or walk`);
    return { method: 'maps', mode: o.mode as TravelMode, fallbackMinutes: int(o.fallbackMinutes, `${path}.fallbackMinutes`, 0, 600) };
  }
  return fail(`${path}.method must be "typed" or "maps"`);
}

function commute(v: unknown, path: string): Commute {
  const o = obj(v, path);
  return {
    id: str(o.id, `${path}.id`),
    fromPlaceId: str(o.fromPlaceId, `${path}.fromPlaceId`),
    toPlaceId: str(o.toPlaceId, `${path}.toPlaceId`),
    repeats: repeatsOf(o.repeats, `${path}.repeats`),
    source: sourceOf(o.source, `${path}.source`),
    marginMinutes: int(o.marginMinutes, `${path}.marginMinutes`, 0, 120),
  };
}
```

In `commitment()` add to the returned object, after `bufferBefore`: `...(o.placeId === undefined ? {} : { placeId: str(o.placeId, `${path}.placeId`) }),`.

In `preferences()` add to `prefs`: `travelAllowanceMinutes: o.travelAllowanceMinutes === undefined ? defaultPreferences.travelAllowanceMinutes : int(o.travelAllowanceMinutes, `${path}.travelAllowanceMinutes`, 0, 600),`.

In `validateState`, after the `commitments` unique check and before `deadlines.forEach`, add:

```ts
  const placeList = arr(o.places ?? [], 'places');
  if (placeList.length > 200) fail('places must have at most 200 entries');
  const places = placeList.map((p, i) => place(p, `places[${i}]`));
  unique(places.map((p) => p.id), 'places');
  if (places.filter((p) => p.kind === 'home').length > 1) fail('places can have only one home');
  const commuteList = arr(o.commutes ?? [], 'commutes');
  if (commuteList.length > 400) fail('commutes must have at most 400 entries');
  const commutes = commuteList.map((c, i) => commute(c, `commutes[${i}]`));
  unique(commutes.map((c) => c.id), 'commutes');
  commutes.forEach((c, i) => {
    if (!places.some((p) => p.id === c.fromPlaceId)) fail(`commutes[${i}].fromPlaceId does not match any place`);
    if (!places.some((p) => p.id === c.toPlaceId)) fail(`commutes[${i}].toPlaceId does not match any place`);
    if (c.fromPlaceId === c.toPlaceId) fail(`commutes[${i}] must join two different places`);
  });
  commitments.forEach((c, i) => {
    if (c.placeId !== undefined && !places.some((p) => p.id === c.placeId)) fail(`commitments[${i}].placeId does not match any place`);
  });
```

and add `places, commutes,` to the returned state object (after `deadlines,`).

- [ ] **Step 5: Run and fix fallout**

Run: `node --test test/validate.test.ts` then `npm test`.
Expected: validate tests PASS. Other tests may fail only because they compare whole states or preferences that now carry the new fields (for example a server test comparing a GET response with a literal, or frontend tests with literal preferences). For each failure, confirm the only difference is the new fields and update the expectation. Ledger the files touched as one `Ruling:` line. `PlanResult.travel` being required will not fail anything yet because `plan()` is not changed until Task 3 (Node strips types without checking).

- [ ] **Step 6: Commit**

```bash
git add -A src test
git commit -m "feat: places, commutes and a travel allowance in the data model

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015g9zWNaWwq6C6AoikFwJmf"
```

---

### Task 2: Travel legs (pure logic)

**Files:**
- Create: `src/travel.ts`
- Test: `test/travel.test.ts`

**Interfaces:**
- Consumes: `occurrencesOn` from `src/busy.ts`, `weekdayOf` from `src/dates.ts`, the types from Task 1.
- Produces: `interface TravelContext { places: Place[]; commutes: Commute[]; allowance: Minutes }`, `interface DayTravel { legs: Leg[]; warnings: Warning[] }`, `placeFor(c: { title: string; placeId?: string }, places: Place[]): Place | null`, `appliesOn(c: Commute, date: DateStr): boolean`, `minutesFor(c: Commute): Minutes`, `legsOn(date: DateStr, commitments: Commitment[], ctx: TravelContext): DayTravel`.

- [ ] **Step 1: Write the failing tests**

Create `test/travel.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appliesOn, legsOn, minutesFor, placeFor } from '../src/travel.ts';
import type { Commute, Place } from '../src/types.ts';
import { commitment } from './helpers.ts';

const place = (id: string, name: string, kind: Place['kind'] = 'other', address = 'x'): Place => ({ id, name, kind, address });
const home = place('home', 'Home', 'home');
const campus = place('campus', 'Campus', 'campus');
const anna = place('anna', 'Anna', 'student', '');
const route = (over: Partial<Commute> = {}): Commute => ({
  id: 'r', fromPlaceId: 'home', toPlaceId: 'campus', repeats: null,
  source: { method: 'typed', minutes: 45 }, marginMinutes: 10, ...over,
});
const ctx = (over: any = {}) => ({ places: [home, campus, anna], commutes: [] as Commute[], allowance: 30, ...over });
// 2026-10-05 is a Monday, 2026-10-06 a Tuesday.
const MON = '2026-10-05';
const TUE = '2026-10-06';
const lecture = (over: any = {}) => commitment({
  id: 'lec', title: 'Chemistry lecture', placeId: 'campus', start: 600, end: 720, bufferBefore: 0,
  pattern: { kind: 'once', date: MON }, ...over,
});
const lesson = (over: any = {}) => commitment({
  id: 'les', title: 'Lesson Anna', start: 960, end: 1020, bufferBefore: 0, pattern: { kind: 'once', date: MON }, ...over,
});

test('with no Home place there is no travel at all', () => {
  const r = legsOn(MON, [lecture()], ctx({ places: [campus], commutes: [route()] }));
  assert.deepEqual(r, { legs: [], warnings: [] });
});

test('a located event gets an outbound leg before it and a return leg after the last one', () => {
  const r = legsOn(MON, [lecture()], ctx({ commutes: [route()] }));
  assert.deepEqual(r.legs, [
    { date: MON, start: 545, end: 600, fromName: 'Home', toName: 'Campus', estimated: false },
    { date: MON, start: 720, end: 775, fromName: 'Campus', toName: 'Home', estimated: false },
  ]);
  assert.deepEqual(r.warnings, []);
});

test('the outbound leg ends where the event buffer begins', () => {
  const r = legsOn(MON, [lecture({ bufferBefore: 30 })], ctx({ commutes: [route()] }));
  assert.deepEqual([r.legs[0].start, r.legs[0].end], [515, 570]);
});

test('no route means the allowance, flagged estimated, and a missing address warns once per trip', () => {
  const r = legsOn(MON, [lesson()], ctx());
  assert.deepEqual(r.legs.map((l) => [l.start, l.end, l.estimated, l.toName]), [[930, 960, true, 'Anna'], [1020, 1050, true, 'Home']]);
  assert.equal(r.warnings.length, 1);
  assert.equal(r.warnings[0].kind, 'address-missing');
  assert.equal(r.warnings[0].detail?.placeName, 'Anna');
  assert.match(r.warnings[0].message, /Anna has no address and no commute, so I used 30 minutes of travel/);
});

test('a place with an address and no route uses the allowance without warning', () => {
  const r = legsOn(MON, [lecture()], ctx());
  assert.equal(r.legs[0].estimated, true);
  assert.deepEqual(r.warnings, []);
});

test('a place is found by its own id first, then by a whole word of the title, longest name winning', () => {
  const places = [home, campus, anna, place('ann', 'Ann')];
  assert.equal(placeFor({ title: 'x', placeId: 'campus' }, places)?.id, 'campus');
  assert.equal(placeFor({ title: 'Campus tour', placeId: 'nowhere' }, places)?.id, 'campus');
  assert.equal(placeFor({ title: 'ANNA lesson' }, places)?.id, 'anna');
  assert.equal(placeFor({ title: 'Lesson with Ann' }, places)?.id, 'ann');
  assert.equal(placeFor({ title: 'Joanna lesson' }, places), null);
  assert.equal(placeFor({ title: 'Nothing here' }, places), null);
});

test('place names full of regular-expression characters neither throw nor match loosely', () => {
  const odd = [place('a', 'C++'), place('b', '(Room [2])'), place('c', 'a\\b'), place('d', '.*'), place('e', '   ')];
  assert.equal(placeFor({ title: 'Study in C++ club' }, odd)?.id, 'a');
  assert.equal(placeFor({ title: 'Meet at (Room [2]) later' }, odd)?.id, 'b');
  assert.equal(placeFor({ title: 'path a\\b here' }, odd)?.id, 'c');
  assert.equal(placeFor({ title: 'anything at all' }, odd), null);
  assert.equal(placeFor({ title: 'the .* wildcard' }, odd)?.id, 'd');
});

test('events with no place are left alone and events at Home need no leg', () => {
  const atHome = commitment({ id: 'h', title: 'Reading', placeId: 'home', pattern: { kind: 'once', date: MON } });
  const nowhere = commitment({ id: 'n', title: 'Call', pattern: { kind: 'once', date: MON } });
  assert.deepEqual(legsOn(MON, [atHome, nowhere], ctx()).legs, []);
});

test('two events at the same place share one trip there and back', () => {
  const second = lecture({ id: 'lec2', start: 780, end: 840 });
  const r = legsOn(MON, [lecture(), second], ctx({ commutes: [route()] }));
  assert.deepEqual(r.legs.map((l) => [l.start, l.end]), [[545, 600], [840, 895]]);
});

test('going from one place to another uses the allowance when no route joins them, and warns when it cannot fit', () => {
  const next = lesson({ start: 740, end: 800 });
  const r = legsOn(MON, [lecture(), next], ctx({ commutes: [route()] }));
  assert.deepEqual(r.legs.map((l) => [l.fromName, l.toName, l.start, l.end]), [
    ['Home', 'Campus', 545, 600],
    ['Campus', 'Anna', 710, 740],
    ['Anna', 'Home', 800, 830],
  ]);
  assert.deepEqual(r.warnings.map((w) => w.kind), ['address-missing', 'travel-tight']);
  const tight = r.warnings[1];
  assert.deepEqual(tight.detail, { placeName: 'Anna', date: MON, titles: ['Lesson Anna'] });
});

test('a route works in both directions', () => {
  const r = legsOn(MON, [lecture()], ctx({ commutes: [route({ fromPlaceId: 'campus', toPlaceId: 'home' })] }));
  assert.equal(r.legs[0].estimated, false);
  assert.equal(r.legs[0].end - r.legs[0].start, 55);
});

test('weekly and monthly routes apply only on their days, otherwise the allowance is used', () => {
  const weekly = route({ repeats: { kind: 'weekly', weekdays: [2] } });
  assert.equal(legsOn(MON, [lecture()], ctx({ commutes: [weekly] })).legs[0].estimated, true);
  const tue = lecture({ pattern: { kind: 'once', date: TUE } });
  const onTue = legsOn(TUE, [tue], ctx({ commutes: [weekly] }));
  assert.equal(onTue.legs[0].estimated, false);
  assert.equal(onTue.legs[0].end - onTue.legs[0].start, 55);
  const monthly = route({ repeats: { kind: 'monthly', monthDays: [6] } });
  assert.equal(legsOn(TUE, [tue], ctx({ commutes: [monthly] })).legs[0].estimated, false);
  assert.equal(legsOn(MON, [lecture()], ctx({ commutes: [monthly] })).legs[0].estimated, true);
  assert.equal(appliesOn(weekly, TUE), true);
  assert.equal(appliesOn(weekly, MON), false);
  assert.equal(appliesOn(route(), MON), true);
});

test('a route limited to certain days beats an every-day route for the same pair', () => {
  const every = route({ id: 'a', source: { method: 'typed', minutes: 20 } });
  const mondays = route({ id: 'b', repeats: { kind: 'weekly', weekdays: [1] }, source: { method: 'typed', minutes: 40 } });
  const r = legsOn(MON, [lecture()], ctx({ commutes: [every, mondays] }));
  assert.equal(r.legs[0].end - r.legs[0].start, 50);
});

test('a Google Maps route uses its typed fallback until Maps is connected', () => {
  const maps = route({ source: { method: 'maps', mode: 'bike', fallbackMinutes: 25 } });
  assert.equal(minutesFor(maps), 25);
  assert.equal(minutesFor(route()), 45);
  const r = legsOn(MON, [lecture()], ctx({ commutes: [maps] }));
  assert.equal(r.legs[0].end - r.legs[0].start, 35);
});

test('a cancelled date has no travel', () => {
  const r = legsOn(MON, [lecture({ exceptions: [MON] })], ctx({ commutes: [route()] }));
  assert.deepEqual(r.legs, []);
});

test('travel is clipped at midnight and warns when the day cannot hold it', () => {
  const early = lecture({ start: 10, end: 60 });
  const r = legsOn(MON, [early], ctx({ commutes: [route()] }));
  assert.deepEqual(r.legs[0], { date: MON, start: 0, end: 10, fromName: 'Home', toName: 'Campus', estimated: false });
  assert.deepEqual(r.warnings.map((w) => w.kind), ['travel-tight']);
  const atMidnight = legsOn(MON, [lecture({ start: 0, end: 30 })], ctx({ commutes: [route()] }));
  assert.deepEqual(atMidnight.legs.map((l) => [l.start, l.end]), [[30, 85]]);
  assert.deepEqual(atMidnight.warnings.map((w) => w.kind), ['travel-tight']);
  const late = legsOn(MON, [lecture({ start: 1400, end: 1430 })], ctx({ commutes: [route()] }));
  assert.deepEqual(late.legs.map((l) => [l.start, l.end]), [[1345, 1400], [1430, 1440]]);
});

test('a buffer larger than the start time cannot push travel below zero', () => {
  const r = legsOn(MON, [lecture({ start: 20, end: 60, bufferBefore: 60 })], ctx({ commutes: [route()] }));
  assert.ok(r.legs.every((l) => l.start >= 0 && l.end <= 1440 && l.end > l.start));
});

test('overlapping events at different places still produce legs in order and a warning', () => {
  const a = lecture({ start: 600, end: 700 });
  const b = lesson({ start: 650, end: 750 });
  const r = legsOn(MON, [b, a], ctx());
  assert.deepEqual(r.legs.map((l) => l.toName), ['Campus', 'Anna', 'Home']);
  assert.ok(r.warnings.some((w) => w.kind === 'travel-tight'));
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/travel.test.ts`
Expected: FAIL, cannot find module `../src/travel.ts`.

- [ ] **Step 3: Implement `src/travel.ts`**

```ts
import { occurrencesOn } from './busy.ts';
import { weekdayOf } from './dates.ts';
import type { Commitment, Commute, DateStr, Leg, Minutes, Place, Warning } from './types.ts';

export interface TravelContext {
  places: Place[];
  commutes: Commute[];
  allowance: Minutes;
}

export interface DayTravel {
  legs: Leg[];
  warnings: Warning[];
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A place is the event's own place, else a saved place whose name appears in the title as a whole word.
export function placeFor(c: { title: string; placeId?: string }, places: Place[]): Place | null {
  if (c.placeId !== undefined) {
    const own = places.find((p) => p.id === c.placeId);
    if (own) return own;
  }
  let best: Place | null = null;
  for (const p of places) {
    const name = p.name.trim();
    if (name.length === 0) continue;
    const word = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(name)}($|[^\\p{L}\\p{N}])`, 'iu');
    if (word.test(c.title) && (best === null || name.length > best.name.trim().length)) best = p;
  }
  return best;
}

export function appliesOn(c: Commute, date: DateStr): boolean {
  const r = c.repeats;
  if (r === null) return true;
  return r.kind === 'weekly' ? r.weekdays.includes(weekdayOf(date)) : r.monthDays.includes(Number(date.slice(8)));
}

export function minutesFor(c: Commute): Minutes {
  return c.source.method === 'typed' ? c.source.minutes : c.source.fallbackMinutes;
}

function routeFor(a: Place, b: Place, date: DateStr, commutes: Commute[]): Commute | null {
  const match = commutes.filter(
    (c) =>
      ((c.fromPlaceId === a.id && c.toPlaceId === b.id) || (c.fromPlaceId === b.id && c.toPlaceId === a.id)) &&
      appliesOn(c, date),
  );
  return match.find((c) => c.repeats !== null) ?? match[0] ?? null;
}

export function legsOn(date: DateStr, commitments: Commitment[], ctx: TravelContext): DayTravel {
  const home = ctx.places.find((p) => p.kind === 'home');
  if (!home) return { legs: [], warnings: [] };

  const located = commitments
    .flatMap((c) => {
      const place = placeFor(c, ctx.places);
      return place ? occurrencesOn(date, [c]).map((o) => ({ o, place })) : [];
    })
    .sort((a, b) => a.o.start - b.o.start || a.o.end - b.o.end);

  const cost = (from: Place, to: Place): { minutes: Minutes; estimated: boolean } => {
    const route = routeFor(from, to, date, ctx.commutes);
    return route
      ? { minutes: minutesFor(route) + route.marginMinutes, estimated: false }
      : { minutes: ctx.allowance, estimated: true };
  };

  const legs: Leg[] = [];
  const warnings: Warning[] = [];
  let here = home;
  let lastEnd = -1;

  for (const { o, place } of located) {
    if (place.id !== here.id) {
      const { minutes, estimated } = cost(here, place);
      if (estimated && place.address.trim() === '') {
        warnings.push({
          kind: 'address-missing',
          message: `${place.name} has no address and no commute, so I used ${ctx.allowance} minutes of travel`,
          detail: { placeName: place.name, minutes: ctx.allowance },
        });
      }
      const end = o.start - o.bufferBefore;
      const start = end - minutes;
      if (minutes > 0) {
        if (end > 0) {
          legs.push({ date, start: Math.max(0, start), end, fromName: here.name, toName: place.name, estimated });
        }
        if (start < Math.max(lastEnd, 0)) {
          warnings.push({
            kind: 'travel-tight',
            message: `Not enough time to get to ${o.title} on ${date}`,
            detail: { placeName: place.name, date, titles: [o.title] },
          });
        }
      }
      here = place;
    }
    lastEnd = Math.max(lastEnd, o.end);
  }

  if (here.id !== home.id && lastEnd < 1440) {
    const { minutes, estimated } = cost(here, home);
    if (minutes > 0) {
      legs.push({ date, start: lastEnd, end: Math.min(1440, lastEnd + minutes), fromName: here.name, toName: home.name, estimated });
    }
  }
  return { legs, warnings };
}
```

- [ ] **Step 4: Run to see them pass**

Run: `node --test test/travel.test.ts`
Expected: all PASS. If the overlapping-events test's leg order or the `.*` test fails, fix the implementation, not the expectation, unless the expectation contradicts the spec.

- [ ] **Step 5: Whole suite, commit**

Run: `npm test` (green), then:

```bash
git add src/travel.ts test/travel.test.ts
git commit -m "feat: work out travel legs between places for a day

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015g9zWNaWwq6C6AoikFwJmf"
```

---

### Task 3: Planner, server, Maps provider and the example

**Files:**
- Create: `src/maps.ts`
- Modify: `src/planner.ts`, `src/replan.ts`, `src/server.ts`, `examples/sample-state.json`
- Test: `test/travel-plan.test.ts`, `test/maps.test.ts`; fix fallout in existing tests

**Interfaces:**
- Consumes: `legsOn`, `DayTravel`, `TravelContext` (Task 2); types (Task 1).
- Produces: `plan()` returns `{ blocks, warnings, travel }`; `replan()` returns `{ state, warnings, travel }`; `warningKey` includes `detail.placeName`; plan responses (`/api/replan`, soft approve and undo, dismiss) carry `travel: Leg[]`; `TravelTimeProvider`, `unavailableProvider`, `fakeProvider(minutes)`; `createApp(path, { maps? })`; `GET /api/commute/status` returns `{ maps: 'unavailable' | 'ready' }`.

- [ ] **Step 1: Write the failing tests**

Create `test/maps.test.ts`:

```ts
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
```

Create `test/travel-plan.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plan } from '../src/planner.ts';
import { describeWarnings, replan, warningKey } from '../src/replan.ts';
import { defaultPreferences } from '../src/defaults.ts';
import { emptyState } from '../src/store.ts';
import { addDays } from '../src/dates.ts';
import type { Commute, Place, Preferences } from '../src/types.ts';
import { commitment, input, task } from './helpers.ts';

const prefs = (over: Partial<Preferences> = {}): Preferences => ({ ...structuredClone(defaultPreferences), softWindows: [], ...over });
const place = (id: string, name: string, kind: Place['kind'] = 'other', address = 'x'): Place => ({ id, name, kind, address });
const home = place('home', 'Home', 'home');
const campus = place('campus', 'Campus', 'campus');
const anna = place('anna', 'Anna', 'student', '');
const route: Commute = {
  id: 'r', fromPlaceId: 'home', toPlaceId: 'campus', repeats: null,
  source: { method: 'typed', minutes: 45 }, marginMinutes: 10,
};
const lecture = (date = '2026-10-05') => commitment({ id: 'lec', title: 'Lecture', placeId: 'campus', start: 600, end: 720, pattern: { kind: 'once', date } });
const lesson = (id: string, date: string) => commitment({ id, title: 'Lesson Anna', start: 960, end: 1020, pattern: { kind: 'once', date } });

test('travel is busy time: no block overlaps a leg, and the legs come back with the plan', () => {
  const r = plan(input({
    preferences: prefs(), commitments: [lecture()], places: [home, campus], commutes: [route],
    tasks: [task({ weeklyMinutes: 900 })],
  }));
  assert.deepEqual(r.travel.map((l) => [l.start, l.end]), [[545, 600], [720, 775]]);
  const monday = r.blocks.filter((b) => b.date === '2026-10-05');
  assert.ok(monday.length > 0);
  for (const b of monday) for (const l of r.travel) assert.ok(b.end <= l.start || b.start >= l.end, `${b.start}-${b.end} vs ${l.start}-${l.end}`);
});

test('without places the plan is exactly as before and travel is empty', () => {
  const a = plan(input({ preferences: prefs(), commitments: [lecture()], tasks: [task({ weeklyMinutes: 900 })] }));
  assert.deepEqual(a.travel, []);
  const b = plan(input({ preferences: prefs(), commitments: [lecture()], tasks: [task({ weeklyMinutes: 900 })], places: [], commutes: [] }));
  assert.deepEqual(a.blocks, b.blocks);
});

test('only days inside the horizon produce travel', () => {
  const r = plan(input({ preferences: prefs(), commitments: [lecture('2026-10-12'), lecture('2026-10-06')], places: [home, campus], horizonDays: 7 }));
  assert.deepEqual([...new Set(r.travel.map((l) => l.date))], ['2026-10-06']);
});

test('the same missing address warns once, however many lessons there are', () => {
  const r = plan(input({
    preferences: prefs(), commitments: [lesson('a', '2026-10-05'), lesson('b', '2026-10-06'), lesson('c', '2026-10-07')],
    places: [home, anna],
  }));
  assert.equal(r.warnings.filter((w) => w.kind === 'address-missing').length, 1);
  assert.equal(r.travel.length, 6);
});

test('warning keys name the place, so a dismissal survives a day change', () => {
  const r = plan(input({ preferences: prefs(), commitments: [lesson('a', '2026-10-05')], places: [home, anna] }));
  const missing = r.warnings.find((w) => w.kind === 'address-missing')!;
  assert.equal(warningKey(missing), 'address-missing|Anna');
  const tight = { kind: 'travel-tight' as const, message: 'm', detail: { placeName: 'Anna', date: '2026-10-05', titles: ['Lesson Anna'] } };
  assert.equal(warningKey(tight), 'travel-tight|Anna|2026-10-05');
  const later = replan({ ...emptyState(), commitments: [lesson('a', '2026-10-09')], places: [home, anna], dismissed: ['address-missing|Anna'] }, '2026-10-06');
  assert.deepEqual(later.state.dismissed, ['address-missing|Anna']);
  assert.equal(describeWarnings(later.warnings, later.state.dismissed).find((w) => w.kind === 'address-missing')!.dismissed, true);
});

test('replan passes places and commutes through and returns the legs', () => {
  const state = { ...emptyState(), commitments: [lecture()], places: [home, campus], commutes: [route] };
  const r = replan(state, '2026-10-05');
  assert.equal(r.travel.length, 2);
  assert.equal(r.state.places.length, 2);
});

test('a 60 day horizon with many places and events stays fast', () => {
  const places = [home, ...Array.from({ length: 40 }, (_, i) => place(`p${i}`, `Place${i}`, 'other', `Street ${i}`))];
  const commitments = Array.from({ length: 60 }, (_, i) =>
    commitment({ id: `c${i}`, title: `Event ${i}`, placeId: `p${i % 40}`, start: 600 + (i % 5) * 70, end: 650 + (i % 5) * 70, pattern: { kind: 'once', date: addDays('2026-10-05', i) } }));
  const t0 = performance.now();
  const r = plan(input({ preferences: prefs(), commitments, places, tasks: [task({ weeklyMinutes: 600 })], horizonDays: 60 }));
  assert.ok(performance.now() - t0 < 3000, `took ${Math.round(performance.now() - t0)} ms`);
  assert.ok(r.travel.length > 0);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/travel-plan.test.ts test/maps.test.ts`
Expected: FAIL (no `travel` in the result, no `src/maps.ts`).

- [ ] **Step 3: `src/maps.ts`**

```ts
import type { TravelMode } from './types.ts';

export interface TravelTimeProvider {
  status: 'unavailable' | 'ready';
  lookup(query: { fromAddress: string; toAddress: string; mode: TravelMode }): Promise<{ minutes: number }>;
}

// Used until a Google Maps key exists. The real provider arrives in the next plan and reads its key from the server environment only.
export const unavailableProvider: TravelTimeProvider = {
  status: 'unavailable',
  async lookup() {
    throw new Error('Google Maps is not connected yet');
  },
};

export function fakeProvider(minutes: number): TravelTimeProvider {
  return { status: 'ready', async lookup() { return { minutes }; } };
}
```

- [ ] **Step 4: Planner**

In `src/planner.ts`: add imports

```ts
import { legsOn } from './travel.ts';
import type { DayTravel, TravelContext } from './travel.ts';
```

and extend the type import with `Leg`. Add above `daySlots`:

```ts
const travelContext = (input: PlanInput): TravelContext => ({
  places: input.places ?? [],
  commutes: input.commutes ?? [],
  allowance: input.preferences.travelAllowanceMinutes,
});

// The planner asks about the same day many times while it tries options, so each day is worked out once per input.
const travelCache = new WeakMap<PlanInput, Map<DateStr, DayTravel>>();
export function travelOn(input: PlanInput, date: DateStr): DayTravel {
  let days = travelCache.get(input);
  if (!days) {
    days = new Map();
    travelCache.set(input, days);
  }
  let day = days.get(date);
  if (!day) {
    day = legsOn(date, input.commitments, travelContext(input));
    days.set(date, day);
  }
  return day;
}
```

In `daySlots` replace `const busy = busyOn(date, input.commitments);` with:

```ts
  const busy = [
    ...busyOn(date, input.commitments),
    ...travelOn(input, date).legs.map((l) => ({ title: 'Travel', start: l.start, end: l.end })),
  ];
```

At the end of `plan()`, replace the final `return { blocks, warnings };` with:

```ts
  const travel: Leg[] = [];
  const travelWarnings: Warning[] = [];
  const missing = new Set<string>();
  for (let i = 0; i < input.horizonDays; i++) {
    const day = travelOn(input, addDays(input.today, i));
    travel.push(...day.legs);
    for (const w of day.warnings) {
      if (w.kind === 'address-missing') {
        const name = w.detail?.placeName ?? '';
        if (missing.has(name)) continue;
        missing.add(name);
      }
      travelWarnings.push(w);
    }
  }
  return { blocks, warnings: [...warnings, ...travelWarnings], travel };
```

(`warnings` is the existing local array declared earlier in `plan()`.)

- [ ] **Step 5: Replan and the server**

In `src/replan.ts`: in `warningKey` change the `about` line to

```ts
  const about = [d.taskTitle, d.placeName, d.kind, d.dueDate, d.weekStart, d.date].filter((x) => x !== undefined);
```

Change the return type of `replan` to `{ state: State; warnings: Warning[]; travel: Leg[] }` (add `Leg` to the type import), pass `places: state.places, commutes: state.commutes,` into the `plan({...})` call, and return `{ state: {...}, warnings: result.warnings, travel: result.travel }`.

In `src/server.ts`: import `{ unavailableProvider }` and `type { TravelTimeProvider }` from `./maps.ts`; in `replanned()` add `travel: result.travel,` to `body`; change `createApp`'s options type to `{ publicDir?: string; exampleFile?: string; maps?: TravelTimeProvider }`, add `const maps = options.maps ?? unavailableProvider;`, and before the `/api/example` route add:

```ts
      if (req.method === 'GET' && pathname === '/api/commute/status') {
        return send(res, 200, { maps: maps.status });
      }
```

- [ ] **Step 6: The example**

Edit `examples/sample-state.json`:

1. Replace the first two lines `{\n  "commitments": [` with:

```json
{
  "places": [
    { "id": "home", "name": "Home", "kind": "home", "address": "Calle Ejemplo 123, Santiago" },
    { "id": "campus", "name": "Campus", "kind": "campus", "address": "Av. Universidad 450, Santiago" },
    { "id": "parish", "name": "Parish", "kind": "other", "address": "Plaza 1, Santiago" },
    { "id": "anna", "name": "Anna", "kind": "student", "address": "" }
  ],
  "commutes": [
    { "id": "home-campus", "fromPlaceId": "home", "toPlaceId": "campus", "repeats": { "kind": "weekly", "weekdays": [2, 4] }, "source": { "method": "typed", "minutes": 45 }, "marginMinutes": 10 }
  ],
  "commitments": [
```

2. After the line `      "id": "mass",` insert `      "placeId": "parish",`. After `      "id": "chem-lecture",` insert `      "placeId": "campus",`. Change `"title": "Private lesson",` to `"title": "Private lesson, Anna",`.

- [ ] **Step 7: Run and fix fallout**

Run: `npm test`
Expected: the new tests PASS. Existing tests may now fail because the sample plan changed (the new Anna warning, travel blocking time) or because server responses carry `travel`. For each failure, confirm the cause is travel or the new warning, and update the expectation (for example counts of warnings from the sample, or exact response bodies). Do not weaken a test that is about something else. Ledger the files you touched as a `Ruling:`.

- [ ] **Step 8: Commit**

```bash
git add -A src test examples
git commit -m "feat: the planner works around travel, and the server reports it

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015g9zWNaWwq6C6AoikFwJmf"
```

---

### Task 4: The browser knows about travel

**Files:**
- Modify: `public/js/api.js`, `public/js/store.js`, `public/js/model.js`, `public/js/week.js`, `public/js/nudge-model.js`, `public/css/app.css`
- Test: `test/frontend/api.test.ts`, `test/frontend/store.test.ts`, `test/frontend/model.test.ts`, `test/frontend/week.test.ts`, `test/frontend/nudge-model.test.ts`, `test/frontend/assets.test.ts`

**Interfaces:**
- Consumes: plan responses with `travel` (Task 3); `GET /api/commute/status`.
- Produces: `api.commuteStatus()`; store fields `travel: Leg[]` and `maps: 'unavailable' | 'ready'`; `dayItems(state, date, travel = [])` and `weekModel(state, start, visible, today, travel = [])` (travel items have `kind: 'travel'`, `group: 'travel'`, `title: 'Home to Campus'`, `label: 'commute' | 'estimated'`); `renderWeek` view option `travelOff`; nudge items for `address-missing` and `travel-tight`.

- [ ] **Step 1: Write the failing tests**

`test/frontend/api.test.ts`: read the file's existing style and add a test that `createApi(fetch).commuteStatus()` issues `GET /api/commute/status` (follow the pattern of the existing `getState` test).

`test/frontend/store.test.ts` append:

```ts
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
```

(Use the same `make`/`full` helpers and imports already at the top of that file. If `make` does not accept arbitrary method overrides, read its definition and adapt the calls without changing what is asserted.)

`test/frontend/model.test.ts` append:

```ts
test('travel legs appear in the day, ignore the filters and do not count as booked time', () => {
  const travel = [
    { date: '2026-10-13', start: 545, end: 600, fromName: 'Home', toName: 'Campus', estimated: false },
    { date: '2026-10-13', start: 720, end: 750, fromName: 'Campus', toName: 'Home', estimated: true },
  ];
  const st = state({ commitments: [commitment()] });
  const items = dayItems(st, '2026-10-13', travel);
  assert.deepEqual(items.filter((i: any) => i.kind === 'travel').map((i: any) => [i.start, i.end, i.title, i.label]), [
    [545, 600, 'Home to Campus', 'commute'],
    [720, 750, 'Campus to Home', 'estimated'],
  ]);
  const model = weekModel(st, '2026-10-12', new Set(), '2026-10-12', travel);
  const day = model.days.find((d: any) => d.date === '2026-10-13');
  assert.equal(day.items.length, 2);
  assert.equal(day.booked, 120);
  assert.equal(model.total, 1);
  assert.equal(model.counts.fixed, 1);
});
```

`test/frontend/week.test.ts` append (reusing its `dom`, `state`, `all`, imports of `weekModel`, `renderWeek`, `byClass`, `textOf`):

```ts
test('a commute is a hatched entry with its length, and the week says when travel is off', () => {
  const travel = [{ date: '2026-10-13', start: 545, end: 600, fromName: 'Home', toName: 'Campus', estimated: true }];
  const model = weekModel(state(), '2026-10-12', all, '2026-10-12', travel);
  const el: any = renderWeek(dom, { model, visible: all, needsYou: 0, isEmpty: false, travelOff: false }, { canAdd: false } as any);
  const entry = byClass(el, 'travel')[0];
  assert.match(textOf(entry), /Commute 55/);
  assert.match(textOf(entry), /09:05–10:00/);
  assert.match(textOf(entry), /estimated/);
  assert.equal(byClass(el, 'travel-off').length, 0);
  const off: any = renderWeek(dom, { model, visible: all, needsYou: 0, isEmpty: false, travelOff: true }, { canAdd: false } as any);
  assert.match(textOf(byClass(off, 'travel-off')[0]), /Travel is off\. Add a Home place\./);
});
```

`test/frontend/nudge-model.test.ts` append:

```ts
test('a missing address and a trip that does not fit become plain items that need you', () => {
  const missing = { kind: 'address-missing', key: 'address-missing|Anna', dismissed: false, message: '', detail: { placeName: 'Anna', minutes: 30 } };
  const tight = { kind: 'travel-tight', key: 'travel-tight|Anna|2026-10-13', dismissed: false, message: '', detail: { placeName: 'Anna', date: '2026-10-13', titles: ['Lesson Anna'] } };
  const { items, needsYou } = buildNudge([missing, tight] as any);
  assert.equal(items[0].headline, 'Anna has no address and no commute, so I used 30 minutes of travel.');
  assert.match(items[1].headline, /^Not enough time to get to Lesson Anna on /);
  assert.equal(needsYou, 2);
  assert.deepEqual(items.map((i: any) => i.key), ['address-missing|Anna', 'travel-tight|Anna|2026-10-13']);
  const gone = buildNudge([{ ...missing, dismissed: true }] as any);
  assert.equal(gone.items.length, 0);
});
```

`test/frontend/assets.test.ts` append a test that `public/css/app.css` has a `.travel` rule containing `repeating-linear-gradient` and `#DAD5C8`, a `.travel-off` rule, and a `.seg button:disabled` rule (read the file with `readFileSync` like the neighbouring CSS tests).

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/frontend/`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement**

`public/js/api.js`: add `commuteStatus: () => call('GET', '/api/commute/status'),` after `example`.

`public/js/store.js`: add `travel: [], maps: 'unavailable',` to the initial `current`; add `travel: r.travel ?? [],` inside `merged()` (next to `warnings`); in `load()`, after `const state = await api.getState();` add

```js
      let maps = 'unavailable';
      try {
        maps = (await api.commuteStatus()).maps === 'ready' ? 'ready' : 'unavailable';
      } catch {
        // Not knowing about Google Maps is never a reason to fail the page.
      }
```

and add `maps` to both the empty-state `set({...})` (together with `travel: []`) and, through `current = { ...current, state, maps };`, the normal path.

`public/js/model.js`: change `dayItems` to take `travel = []` and, after the blocks loop, add

```js
  for (const leg of travel) {
    if (leg.date === date) {
      items.push({ kind: 'travel', group: 'travel', start: leg.start, end: leg.end, title: `${leg.fromName} to ${leg.toName}`, label: leg.estimated ? 'estimated' : 'commute' });
    }
  }
```

In `weekModel(state, start, visible, today, travel = [])`: call `dayItems(state, date, travel)`; change `for (const item of items) counts[item.group]++;` to `for (const item of items) if (item.group in counts) counts[item.group]++;`; compute `booked: minutesOf(items.filter((item) => item.kind !== 'travel'))`; and filter visible items with `items.filter((item) => item.kind === 'travel' || visible.has(item.group))`.

`public/js/week.js`: in `renderWeek`, the `block` function becomes

```js
  const block = (item) =>
    item.kind === 'travel'
      ? h('div', { class: 'blk travel', title: item.title },
          h('div', { class: 'top' }, h('span', { class: 't' }, `${hhmm(item.start)}–${hhmm(item.end)}`), h('span', { class: 'k' }, item.label)),
          h('span', { class: 'n' }, `Commute ${item.end - item.start}`))
      : h('div', { class: `blk g-${item.group}` },
          h('div', { class: 'top' }, h('span', { class: 't' }, `${hhmm(item.start)}–${hhmm(item.end)}`), h('span', { class: 'k' }, item.label)),
          h('span', { class: 'n' }, item.title));
```

destructure `travelOff` from `view`, and in the non-empty return add `view.travelOff && h('p', { class: 'travel-off mono' }, 'Travel is off. Add a Home place.')` between `hero` and `grid`.

`public/js/nudge-model.js`: add `import`-free helpers and use them:

```js
const TRAVEL = ['address-missing', 'travel-tight'];

function travelHeadline(w) {
  const d = w.detail;
  return w.kind === 'address-missing'
    ? `${d.placeName} has no address and no commute, so I used ${d.minutes} minutes of travel.`
    : `Not enough time to get to ${d.titles[0]} on ${longDate(d.date)}.`;
}
```

In `buildNudge`, after `const items = shortfalls.map(...)`, add

```js
  const trips = open.filter((w) => TRAVEL.includes(w.kind));
  items.push(...trips.map((w) => ({ key: w.key, headline: travelHeadline(w), minutes: 0, category: 'travel', offer: null })));
```

and return `needsYou: shortfalls.length + trips.length`.

`public/css/app.css` append:

```css
.travel { border: 2px solid var(--ink); color: var(--ink); background: repeating-linear-gradient(135deg, var(--paper) 0 6px, #DAD5C8 6px 12px); }
.travel-off { color: var(--muted); margin: 8px 0 0; }
.seg button:disabled { color: var(--muted); border-style: dashed; cursor: not-allowed; }
```

- [ ] **Step 4: Run, commit**

Run: `npm test` (green; fix any existing test whose literal views lack the new fields only if the failure is about them).

```bash
git add -A public test
git commit -m "feat: show travel in the week and tell the browser about Maps status

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015g9zWNaWwq6C6AoikFwJmf"
```

---

### Task 5: Setup model for places and commutes

**Files:**
- Modify: `public/js/setup-model.js`
- Test: `test/frontend/setup-model.test.ts`

**Interfaces:**
- Consumes: existing `KINDS`, `applyItem`, `removeItem`, `itemsOf`, `parseWhole`, `WEEK_ORDER`.
- Produces: `PLACE_KINDS`, `TRAVEL_MODES`, `placeKind`, `commuteKind`; `KINDS.places` (prefix `p`, `confirmNote`), `KINDS.commutes` (prefix `r`); `KINDS.tasks.confirmNote`; `KIND_IDS = ['commitments', 'tasks', 'due-dates', 'places', 'commutes', 'preferences']`; commitment drafts carry `placeId`; preferences drafts carry `travelAllowance`; `removeItem(state, 'places', id)` cascades; `itemsOf` tolerates a missing list.

- [ ] **Step 1: Write the failing tests**

Append to `test/frontend/setup-model.test.ts` (use its existing imports and add `placeKind, commuteKind, PLACE_KINDS, TRAVEL_MODES` to the import from `setup-model.js`; `example` below is the parsed `examples/sample-state.json`, which the file may already load, otherwise add `const example = JSON.parse(readFileSync('examples/sample-state.json', 'utf8'));`):

```ts
const st = () => structuredClone(example);

test('places: blank, round trip, summaries and checks', () => {
  assert.deepEqual(placeKind.blank(), { name: '', kind: 'other', address: '' });
  const p = st().places[1];
  assert.deepEqual(placeKind.fromDraft(placeKind.toDraft(p), p.id, st()).item, p);
  assert.equal(placeKind.summary(p), p.address);
  assert.equal(placeKind.summary({ ...p, address: '' }), 'Address missing');
  assert.deepEqual(placeKind.fromDraft({ name: '  Gym ', kind: 'other', address: ' Av 1 ' }, 'p1', st()).item, { id: 'p1', name: 'Gym', kind: 'other', address: 'Av 1' });
  assert.match(placeKind.fromDraft({ name: ' ', kind: 'other', address: '' }, 'p1', st()).error, /name/);
  assert.match(placeKind.fromDraft({ name: 'x'.repeat(201), kind: 'other', address: '' }, 'p1', st()).error, /200/);
  assert.match(placeKind.fromDraft({ name: 'x', kind: 'other', address: 'y'.repeat(301) }, 'p1', st()).error, /300/);
  assert.match(placeKind.fromDraft({ name: 'x', kind: 'castle', address: '' }, 'p1', st()).error, /kind/);
  assert.match(placeKind.fromDraft({ name: 'Second', kind: 'home', address: '' }, 'p2', st()).error, /already a Home/);
  assert.equal(placeKind.fromDraft({ name: 'Home again', kind: 'home', address: '' }, 'home', st()).item.kind, 'home');
  assert.deepEqual(PLACE_KINDS, ['home', 'campus', 'student', 'other']);
});

test('commutes: blank starts at Home, drafts round trip for every shape of route', () => {
  const s = st();
  const blank = commuteKind.blank('2026-10-05', s);
  assert.equal(blank.fromPlaceId, 'home');
  assert.notEqual(blank.toPlaceId, 'home');
  assert.deepEqual([blank.repeats, blank.method, blank.minutes, blank.margin], ['weekly', 'typed', '30', '10']);
  const shapes = [
    { id: 'a', fromPlaceId: 'home', toPlaceId: 'campus', repeats: { kind: 'weekly', weekdays: [1, 3] }, source: { method: 'typed', minutes: 45 }, marginMinutes: 10 },
    { id: 'b', fromPlaceId: 'home', toPlaceId: 'anna', repeats: null, source: { method: 'maps', mode: 'bike', fallbackMinutes: 25 }, marginMinutes: 5 },
    { id: 'c', fromPlaceId: 'campus', toPlaceId: 'parish', repeats: { kind: 'monthly', monthDays: [1, 15] }, source: { method: 'typed', minutes: 0 }, marginMinutes: 0 },
  ];
  for (const c of shapes) assert.deepEqual(commuteKind.fromDraft(commuteKind.toDraft(c), c.id, s).item, c, c.id);
  assert.equal(commuteKind.toDraft(shapes[1]).repeats, 'per-lesson');
  assert.equal(commuteKind.toDraft(shapes[2]).monthDays, '1, 15');
});

test('commutes: plain sentences for every mistake', () => {
  const s = st();
  const good = commuteKind.toDraft({ id: 'a', fromPlaceId: 'home', toPlaceId: 'campus', repeats: { kind: 'weekly', weekdays: [1] }, source: { method: 'typed', minutes: 45 }, marginMinutes: 10 });
  const bad = (over: any) => commuteKind.fromDraft({ ...good, ...over }, 'a', s).error;
  assert.match(bad({ fromPlaceId: '' }), /where it starts/);
  assert.match(bad({ toPlaceId: 'nowhere' }), /where it ends/);
  assert.match(bad({ toPlaceId: 'home' }), /two different places/);
  assert.match(bad({ weekdays: [] }), /at least one day/);
  assert.match(bad({ repeats: 'monthly', monthDays: '' }), /Month days/);
  assert.match(bad({ repeats: 'monthly', monthDays: '1, 29' }), /Month days/);
  assert.match(bad({ repeats: 'monthly', monthDays: '1, x' }), /Month days/);
  assert.match(bad({ minutes: '-1' }), /Minutes/);
  assert.match(bad({ minutes: '601' }), /Minutes/);
  assert.match(bad({ margin: '121' }), /margin/);
  assert.match(bad({ method: 'magic' }), /How long/);
  assert.match(bad({ method: 'maps', mode: 'rocket' }), /travel/);
  assert.deepEqual(commuteKind.fromDraft({ ...good, repeats: 'monthly', monthDays: '15, 1, 15' }, 'a', s).item.repeats, { kind: 'monthly', monthDays: [1, 15] });
  assert.deepEqual(TRAVEL_MODES, ['car', 'bike', 'transit', 'walk']);
});

test('commutes: summaries and list titles read as sentences', () => {
  const s = st();
  const c = { id: 'a', fromPlaceId: 'home', toPlaceId: 'campus', repeats: { kind: 'weekly', weekdays: [4, 2] }, source: { method: 'typed', minutes: 45 }, marginMinutes: 10 };
  assert.equal(KINDS.commutes.itemTitle(c, s), 'Home to Campus');
  assert.equal(KINDS.commutes.itemLabel(c), 'weekly');
  assert.equal(commuteKind.summary(c, s), 'Tue, Thu / 45 min + 10 margin / typed');
  assert.equal(commuteKind.summary({ ...c, repeats: null, source: { method: 'maps', mode: 'transit', fallbackMinutes: 30 } }, s), 'every lesson / 30 min + 10 margin / Google Maps by transit');
  assert.equal(KINDS.commutes.itemLabel({ ...c, repeats: null }), 'per lesson');
  assert.equal(KINDS.commutes.itemLabel({ ...c, repeats: { kind: 'monthly', monthDays: [3] } }), 'monthly');
  assert.equal(commuteKind.summary({ ...c, repeats: { kind: 'monthly', monthDays: [1, 15] } }, s), 'day 1, 15 / 45 min + 10 margin / typed');
});

test('a commitment can name its place, and an unknown place is refused', () => {
  const s = st();
  const c = s.commitments.find((x: any) => x.id === 'chem-lecture');
  const draft = commitmentKind.toDraft(c);
  assert.equal(draft.placeId, 'campus');
  assert.equal(commitmentKind.fromDraft(draft, c.id, s).item.placeId, 'campus');
  assert.equal('placeId' in commitmentKind.fromDraft({ ...draft, placeId: '' }, c.id, s).item, false);
  assert.match(commitmentKind.fromDraft({ ...draft, placeId: 'nowhere' }, c.id, s).error, /place/);
  assert.equal(commitmentKind.blank('2026-10-05').placeId, '');
});

test('the travel allowance is a preference with limits, and nothing else about preferences changes', () => {
  const s = st();
  const d = preferencesKind.toDraft(s.preferences);
  assert.equal(d.travelAllowance, '30');
  assert.equal(preferencesKind.fromDraft({ ...d, travelAllowance: '45' }, '-', s).item.travelAllowanceMinutes, 45);
  assert.match(preferencesKind.fromDraft({ ...d, travelAllowance: '601' }, '-', s).error, /Travel allowance/);
  assert.match(preferencesKind.fromDraft({ ...d, travelAllowance: 'x' }, '-', s).error, /Travel allowance/);
  assert.deepEqual(preferencesKind.fromDraft(d, '-', s).item, { ...s.preferences, travelAllowanceMinutes: 30 });
});

test('deleting a place removes its commutes and clears it from commitments, and nothing else changes', () => {
  const s = st();
  const next = removeItem(s, 'places', 'campus');
  assert.equal(next.places.some((p: any) => p.id === 'campus'), false);
  assert.deepEqual(next.commutes, []);
  const lecture = next.commitments.find((c: any) => c.id === 'chem-lecture');
  assert.equal('placeId' in lecture, false);
  assert.equal(next.commitments.find((c: any) => c.id === 'mass').placeId, 'parish');
  assert.deepEqual(next.tasks, s.tasks);
  assert.deepEqual(next.blocks, s.blocks);
  assert.deepEqual(next.preferences, s.preferences);
  assert.equal(KINDS.places.confirmNote(s, 'campus'), ' Its 1 commute goes too. 1 commitment loses its place.');
  assert.equal(KINDS.places.confirmNote(s, 'anna'), '');
  assert.equal(KINDS.tasks.confirmNote(s, 'chem'), ' Its 1 due date goes too.');
  assert.equal(KINDS.tasks.confirmNote(s, 'gym'), '');
});

test('a state without places or commutes still lists and deletes safely', () => {
  const old = { ...st(), places: undefined, commutes: undefined };
  assert.deepEqual(itemsOf(old, 'places'), []);
  assert.deepEqual(itemsOf(old, 'commutes'), []);
  assert.doesNotThrow(() => removeItem(old, 'places', 'x'));
  assert.deepEqual(KIND_IDS, ['commitments', 'tasks', 'due-dates', 'places', 'commutes', 'preferences']);
});

test('adding and editing a commute only touches the commutes list', () => {
  const s = st();
  const item = { id: 'r-new', fromPlaceId: 'home', toPlaceId: 'anna', repeats: null, source: { method: 'typed', minutes: 20 }, marginMinutes: 5 };
  const next = applyItem(s, 'commutes', item);
  assert.equal(next.commutes.length, s.commutes.length + 1);
  assert.deepEqual({ ...next, commutes: null }, { ...s, commutes: null });
});
```

Also update the existing tests in that file that deep-equal a commitment draft or the preferences draft: add `placeId: ''` to the blank commitment draft expectation, `placeId: <value or ''>` to commitment `toDraft` expectations, and `travelAllowance: '30'` to preferences draft expectations. Make sure `commitmentKind`, `preferencesKind`, `removeItem`, `applyItem`, `itemsOf`, `KINDS`, `KIND_IDS` are imported.

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/frontend/setup-model.test.ts`
Expected: FAIL (the new names do not exist).

- [ ] **Step 3: Implement in `public/js/setup-model.js`**

Add exports near the top (after `DEADLINE_KINDS`):

```js
export const PLACE_KINDS = ['home', 'campus', 'student', 'other'];
export const TRAVEL_MODES = ['car', 'bike', 'transit', 'walk'];
```

Commitment kind: in `blank` add `placeId: ''` to the returned object; in `toDraft` add `placeId: c.placeId ?? '',`; change `fromDraft(d, id)` to `fromDraft(d, id, state)` and, right before the `return { item: ... }`, add

```js
    if (d.placeId && !(state.places ?? []).some((p) => p.id === d.placeId)) return { error: 'Pick a place from the list.' };
```

and extend the item with `...(d.placeId ? { placeId: d.placeId } : {}),` after `bufferBefore: buffer`.

Preferences kind: in `toDraft` add `travelAllowance: String(p.travelAllowanceMinutes ?? 30),`; in `fromDraft` before the final `return`, add

```js
    const travelAllowance = parseWhole(d.travelAllowance, 0, 600);
    if (travelAllowance === null) return { error: 'Travel allowance must be a whole number of minutes, 0 to 600.' };
```

and add `travelAllowanceMinutes: travelAllowance,` to the returned item.

Add before `export const KINDS`:

```js
export const placeKind = {
  blank() {
    return { name: '', kind: 'other', address: '' };
  },
  toDraft(p) {
    return { name: p.name, kind: p.kind, address: p.address };
  },
  fromDraft(d, id, state) {
    const name = d.name.trim();
    if (!name) return { error: 'Give the place a name.' };
    if (name.length > 200) return { error: 'The name can be at most 200 characters.' };
    const address = d.address.trim();
    if (address.length > 300) return { error: 'The address can be at most 300 characters.' };
    if (!PLACE_KINDS.includes(d.kind)) return { error: 'Pick a kind.' };
    if (d.kind === 'home' && (state.places ?? []).some((p) => p.kind === 'home' && p.id !== id)) {
      return { error: 'There is already a Home place. Edit that one, or change its kind first.' };
    }
    return { item: { id, name, kind: d.kind, address } };
  },
  summary: (p) => (p.address ? p.address : 'Address missing'),
};

const placeName = (state, id) => ((state.places ?? []).find((p) => p.id === id) || { name: 'Unknown place' }).name;
const repeatsLabel = (c) => (c.repeats === null ? 'per lesson' : c.repeats.kind);

export const commuteKind = {
  blank(today, state) {
    const places = state.places ?? [];
    const home = places.find((p) => p.kind === 'home') ?? places[0];
    const other = places.find((p) => home && p.id !== home.id);
    return {
      fromPlaceId: home ? home.id : '', toPlaceId: other ? other.id : '', repeats: 'weekly',
      weekdays: [1, 2, 3, 4], monthDays: '1', method: 'typed', minutes: '30', margin: '10', mode: 'transit',
    };
  },
  toDraft(c) {
    const maps = c.source.method === 'maps';
    return {
      fromPlaceId: c.fromPlaceId, toPlaceId: c.toPlaceId,
      repeats: c.repeats === null ? 'per-lesson' : c.repeats.kind,
      weekdays: c.repeats && c.repeats.kind === 'weekly' ? [...c.repeats.weekdays] : [1],
      monthDays: c.repeats && c.repeats.kind === 'monthly' ? c.repeats.monthDays.join(', ') : '1',
      method: c.source.method,
      minutes: String(maps ? c.source.fallbackMinutes : c.source.minutes),
      margin: String(c.marginMinutes),
      mode: maps ? c.source.mode : 'transit',
    };
  },
  fromDraft(d, id, state) {
    const places = state.places ?? [];
    if (!places.some((p) => p.id === d.fromPlaceId)) return { error: 'Pick where it starts.' };
    if (!places.some((p) => p.id === d.toPlaceId)) return { error: 'Pick where it ends.' };
    if (d.fromPlaceId === d.toPlaceId) return { error: 'Pick two different places.' };
    let repeats = null;
    if (d.repeats === 'weekly') {
      if (d.weekdays.length === 0) return { error: 'Pick at least one day.' };
      repeats = { kind: 'weekly', weekdays: [...d.weekdays].sort(byNumber) };
    } else if (d.repeats === 'monthly') {
      const days = String(d.monthDays).split(',').map((t) => t.trim()).filter((t) => t !== '').map((t) => parseWhole(t, 1, 28));
      if (days.length === 0 || days.includes(null)) return { error: 'Month days must be whole numbers from 1 to 28, like 1, 15.' };
      repeats = { kind: 'monthly', monthDays: [...new Set(days)].sort(byNumber) };
    } else if (d.repeats !== 'per-lesson') {
      return { error: 'Pick how often it repeats.' };
    }
    const minutes = parseWhole(d.minutes, 0, 600);
    if (minutes === null) return { error: 'Minutes must be a whole number from 0 to 600.' };
    const margin = parseWhole(d.margin, 0, 120);
    if (margin === null) return { error: 'The safety margin must be a whole number of minutes, 0 to 120.' };
    let source;
    if (d.method === 'typed') {
      source = { method: 'typed', minutes };
    } else if (d.method === 'maps') {
      if (!TRAVEL_MODES.includes(d.mode)) return { error: 'Pick how you travel.' };
      source = { method: 'maps', mode: d.mode, fallbackMinutes: minutes };
    } else {
      return { error: 'Pick how long it takes: type it, or let Google Maps find it.' };
    }
    return { item: { id, fromPlaceId: d.fromPlaceId, toPlaceId: d.toPlaceId, repeats, source, marginMinutes: margin } };
  },
  summary(c, state) {
    const when =
      c.repeats === null ? 'every lesson'
        : c.repeats.kind === 'weekly' ? WEEK_ORDER.filter((w) => c.repeats.weekdays.includes(w)).map((w) => WEEKDAYS[w]).join(', ')
          : `day ${c.repeats.monthDays.join(', ')}`;
    const minutes = c.source.method === 'typed' ? c.source.minutes : c.source.fallbackMinutes;
    const how = c.source.method === 'typed' ? 'typed' : `Google Maps by ${c.source.mode}`;
    return `${when} / ${minutes} min + ${c.marginMinutes} margin / ${how}`;
  },
};
```

Extend `KINDS`:

```js
  places: {
    id: 'places', title: 'Places', list: 'places', add: 'Add a place', prefix: 'p', kind: placeKind,
    itemTitle: (p) => p.name, itemLabel: (p) => p.kind,
    confirmNote(state, id) {
      const routes = (state.commutes ?? []).filter((c) => c.fromPlaceId === id || c.toPlaceId === id).length;
      const events = state.commitments.filter((c) => c.placeId === id).length;
      const parts = [];
      if (routes > 0) parts.push(`Its ${routes} commute${routes === 1 ? ' goes' : 's go'} too.`);
      if (events > 0) parts.push(`${events} commitment${events === 1 ? ' loses its' : 's lose their'} place.`);
      return parts.length > 0 ? ` ${parts.join(' ')}` : '';
    },
  },
  commutes: {
    id: 'commutes', title: 'Commutes', list: 'commutes', add: 'Add a commute', prefix: 'r', kind: commuteKind,
    itemTitle: (c, state) => `${placeName(state, c.fromPlaceId)} to ${placeName(state, c.toPlaceId)}`,
    itemLabel: repeatsLabel,
  },
```

placed between `'due-dates'` and `preferences` (order of keys does not matter, `KIND_IDS` does). Add to `tasks`: 

```js
    confirmNote(state, id) {
      const n = state.deadlines.filter((d) => d.taskId === id).length;
      return n > 0 ? ` Its ${n} due date${n === 1 ? ' goes' : 's go'} too.` : '';
    },
```

Set `export const KIND_IDS = ['commitments', 'tasks', 'due-dates', 'places', 'commutes', 'preferences'];`.

`itemsOf`: `KINDS[kindId].list ? state[KINDS[kindId].list] ?? [] : []`.

`removeItem`: after the tasks branch add

```js
  if (kindId === 'places') {
    next.commutes = (state.commutes ?? []).filter((c) => c.fromPlaceId !== id && c.toPlaceId !== id);
    next.commitments = state.commitments.map((c) => {
      if (c.placeId !== id) return c;
      const { placeId, ...rest } = c;
      return rest;
    });
  }
```

and make the first line safe for a missing list: `[spec.list]: (state[spec.list] ?? []).filter(...)`. In `applyItem`, use `const list = state[spec.list] ?? [];`.

- [ ] **Step 4: Run, commit**

Run: `node --test test/frontend/setup-model.test.ts` then `npm test`. The setup controller tests (`setup.test.ts`) still use the old inline "due dates go too" logic and keep passing until Task 6.

```bash
git add -A public test
git commit -m "feat: place and commute rules for the Setup screens

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015g9zWNaWwq6C6AoikFwJmf"
```

---

### Task 6: The Places and Commutes screens

**Files:**
- Modify: `public/js/form.js`, `public/js/setup.js`, `public/css/app.css`
- Test: `test/frontend/form.test.ts`, `test/frontend/setup.test.ts`

**Interfaces:**
- Consumes: `KINDS`, `KIND_IDS`, `placeKind`, `commuteKind`, `parseWhole`, `PLACE_KINDS`, `TRAVEL_MODES` (Task 5); `store.get().maps` (Task 4).
- Produces: field type `custom` (`render(dom, draft, ctx)` returns a node, wrapped in a `fld`); `choice` fields accept `disabledValues(ctx) => values[]`; `FIELDS.places`, `FIELDS.commutes`, a Place select on commitments and a Travel allowance field on preferences; the sub-navigation lists six screens; `ctx.maps` is passed to field renderers; deleting uses `spec.confirmNote`.

- [ ] **Step 1: Write the failing tests**

Read the top of `test/frontend/form.test.ts` for its helpers (a `render`-style function over `renderField`), then append tests that: (a) a `custom` field renders what its `render` returns inside an element with class `fld` (and `span3` when `span: 3`); (b) a `choice` field with `disabledValues: () => ['maps']` renders the `maps` button with a `disabled` attribute and the other without, and clicking the disabled one (call its click handler through the fake `click()`) does not change the draft; (c) a `select` with a `placeId` list renders the places as options.

Append to `test/frontend/setup.test.ts` (it already has `setup`, `render`, `type`, `submit`, `byKey`, `named`, `stateWith`, `tick` and loads the example state, which now has places):

```ts
test('the sub-navigation lists six screens with Places and Commutes', () => {
  const { render } = setup();
  const el: any = render('places');
  const links = byClass(el, 'sub')[0].children.filter((c: any) => c.tag === 'a');
  assert.deepEqual(links.map((l: any) => textOf(l)), ['Commitments', 'Tasks', 'Due dates', 'Places', 'Commutes', 'Preferences']);
});

test('the places list shows address or "Address missing", and the form edits the place', async () => {
  const { render, calls } = setup();
  const el: any = render('places', 'anna');
  const rows = byClass(el, 'item').map((r: any) => textOf(r));
  assert.ok(rows.some((r: string) => /Anna/.test(r) && /Address missing/.test(r)));
  assert.ok(rows.some((r: string) => /Home/.test(r) && /Calle Ejemplo 123/.test(r)));
  assert.equal(byKey(el, 'f-name').value, 'Anna');
  assert.match(textOf(el), /address missing/i);
  type(el, 'f-address', 'Los Olmos 88');
  await submit(el);
  assert.equal(calls[0].places.find((p: any) => p.id === 'anna').address, 'Los Olmos 88');
});

test('a hostile place name is saved and shown as text, and a second Home is refused in words', async () => {
  const { render, calls } = setup();
  const el: any = render('places', 'new');
  type(el, 'f-name', '<img src=x onerror=alert(1)> C++ (Room [2])');
  await submit(el);
  assert.equal(calls[0].places.at(-1).name, '<img src=x onerror=alert(1)> C++ (Room [2])');
  const again: any = render('places', 'new');
  type(again, 'f-name', 'Second home');
  byKey(again, 'f-kind').value = 'home';
  byKey(again, 'f-kind').dispatch('change');
  await submit(again);
  assert.match(textOf(byClass(again, 'err')[0]), /already a Home/);
  assert.equal(calls.length, 1);
});

test('deleting a place says what goes with it', () => {
  const { render } = setup();
  const el: any = render('places', 'campus');
  byKey(el, 'setup-delete').click();
  assert.match(textOf(byClass(el, 'confirm')[0]), /Delete "Campus"\? Its 1 commute goes too\. 1 commitment loses its place\./);
});

test('deleting a task still says how many due dates go with it', () => {
  const { render } = setup();
  const el: any = render('tasks', 'chem');
  byKey(el, 'setup-delete').click();
  assert.match(textOf(byClass(el, 'confirm')[0]), /Delete "Chemistry"\? Its 1 due date goes too\./);
});

test('a commitment can be given a place', async () => {
  const { render, calls } = setup();
  const el: any = render('commitments', 'lesson-1');
  const select = byKey(el, 'f-placeId');
  assert.ok(select);
  select.value = 'anna';
  select.dispatch('change');
  await submit(el);
  assert.equal(calls[0].commitments.find((c: any) => c.id === 'lesson-1').placeId, 'anna');
});

test('a new commute starts at Home, saves as typed time, and is appended', async () => {
  const { render, calls } = setup();
  const el: any = render('commutes', 'new');
  assert.equal(byKey(el, 'f-fromPlaceId').value, 'home');
  type(el, 'f-minutes', '40');
  type(el, 'f-margin', '5');
  await submit(el);
  const saved = calls[0].commutes.at(-1);
  assert.deepEqual(saved.source, { method: 'typed', minutes: 40 });
  assert.equal(saved.marginMinutes, 5);
  assert.deepEqual(saved.repeats, { kind: 'weekly', weekdays: [1, 2, 3, 4] });
});

test('Google Maps is dimmed until the server says it is ready', () => {
  const off = setup();
  const el: any = off.render('commutes', 'new');
  assert.notEqual(byKey(el, 'f-method-maps').getAttribute('disabled'), null);
  assert.equal(byKey(el, 'f-method-typed').getAttribute('disabled'), null);
  assert.match(textOf(el), /Google Maps is not connected yet/);
  const on = setup(stateWith(), { storeState: { maps: 'ready' } });
  const el2: any = on.render('commutes', 'new');
  assert.equal(byKey(el2, 'f-method-maps').getAttribute('disabled'), null);
  assert.doesNotMatch(textOf(el2), /not connected yet/);
});

test('with fewer than two places the commutes list asks for places first', () => {
  const { render } = setup(stateWith({ places: [], commutes: [] }));
  const el: any = render('commutes');
  assert.match(textOf(el), /Add at least two places first/);
});

test('monthly routes ask for days of the month, and the preview shows minutes plus margin after a redraw', async () => {
  const { render, calls } = setup();
  const el: any = render('commutes', 'new');
  byKey(el, 'f-repeats').value = 'monthly';
  byKey(el, 'f-repeats').dispatch('change');
  const again: any = render('commutes', 'new');
  type(again, 'f-monthDays', '1, 15');
  type(again, 'f-minutes', '45');
  const third: any = render('commutes', 'new');
  assert.match(textOf(third), /Commute 55/);
  await submit(third);
  assert.deepEqual(calls[0].commutes.at(-1).repeats, { kind: 'monthly', monthDays: [1, 15] });
});

test('the travel allowance sits with the other preferences', async () => {
  const { render, calls } = setup();
  const el: any = render('preferences');
  assert.equal(byKey(el, 'f-travelAllowance').value, '30');
  type(el, 'f-travelAllowance', '45');
  await submit(el);
  assert.equal(calls[0].preferences.travelAllowanceMinutes, 45);
});
```

Note on the monthly test: the repeats select is flagged `redraw: true` (Step 3), so choosing Every month redraws and reveals the month-days field. The preview strip is drawn from the draft when the screen is drawn; it does not update while typing, which is accepted (ledger it as a minor).

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/frontend/form.test.ts test/frontend/setup.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`public/js/form.js`: in the `case 'select'` handler change `onchange` so that fields flagged `redraw: true` redraw:

```js
      return wrap(label(def.label), h('select', {
        id, 'data-fk': id,
        onchange: (e) => { draft[def.name] = e.target.value; if (def.redraw) ctx.rerender(); },
      }, all.map((o) => h('option', { value: o.value, selected: o.value === current }, o.label))));
```

In `case 'choice'` compute `const off = def.disabledValues ? def.disabledValues(ctx) : [];` and render each button with `disabled: off.includes(o.value)` and an `onclick` that returns early when `off.includes(o.value)`. Add before `default:`:

```js
    case 'custom': {
      const node = def.render(dom, draft, ctx);
      return node === null ? null : wrap(node);
    }
```

`public/js/setup.js`:

Imports: add `PLACE_KINDS, TRAVEL_MODES, parseWhole` to the import from `./setup-model.js`. Add helpers near the top:

```js
const placeOptions = (state) => (state.places ?? []).map((p) => ({ value: p.id, label: p.name }));
const hint = (text) => ({ type: 'custom', span: 3, render: (dom) => dom.h('p', { class: 'hint' }, text) });
const mapsOff = (d, ctx) => ctx.maps !== 'ready';
```

Add to `FIELDS.commitments`, right after the `buffer` entry:

```js
    { name: 'placeId', label: 'Place', type: 'select', options: (state) => [{ value: '', label: 'No place' }, ...placeOptions(state)] },
```

Add to `FIELDS.preferences`, after `minBreak`:

```js
    { name: 'travelAllowance', label: 'Travel allowance, min', type: 'text', inputmode: 'numeric' },
```

(The grid keeps three columns; the allowance wraps to the next row, ahead of the days-off row. If the screen then reads badly against board O, say so in the ledger rather than moving things unasked.)

Add the new field lists:

```js
  places: [
    { name: 'name', label: 'Name', type: 'text', span: 2 },
    { name: 'kind', label: 'Kind', type: 'select', options: () => PLACE_KINDS.map((k) => ({ value: k, label: cap(k) })) },
    { name: 'address', label: 'Address', type: 'text', span: 3 },
    hint('A place with no address gets a default travel allowance and a note on the week: address missing.'),
  ],
  commutes: [
    { name: 'fromPlaceId', label: 'From', type: 'select', options: placeOptions },
    { name: 'toPlaceId', label: 'To', type: 'select', options: placeOptions },
    { name: 'repeats', label: 'Repeats', type: 'select', redraw: true, options: () => [{ value: 'weekly', label: 'Every week' }, { value: 'monthly', label: 'Every month' }, { value: 'per-lesson', label: 'Per lesson' }] },
    { name: 'weekdays', label: 'Days', type: 'weekdays', span: 3, show: (d) => d.repeats === 'weekly' },
    { name: 'monthDays', label: 'Days of the month, like 1, 15', type: 'text', span: 3, show: (d) => d.repeats === 'monthly' },
    { name: 'method', label: 'How long it takes', type: 'choice', span: 3, options: [{ value: 'typed', label: 'I type it' }, { value: 'maps', label: 'Google Maps finds it' }], disabledValues: (ctx) => (ctx.maps === 'ready' ? [] : ['maps']) },
    { name: 'minutes', label: 'Minutes, one way', type: 'text', inputmode: 'numeric' },
    { name: 'margin', label: 'Safety margin, min', type: 'text', inputmode: 'numeric' },
    { name: 'mode', label: 'If Google Maps finds it: how you travel', type: 'choice', span: 3, options: TRAVEL_MODES.map((m) => ({ value: m, label: m === 'transit' ? 'Bus' : cap(m) })) },
    { type: 'custom', name: 'note', span: 3, render: (dom, d, ctx) => ctx.maps === 'ready' ? null : dom.h('p', { class: 'hint' }, 'Google Maps is not connected yet. Until it is, the time you type is used, and the Maps choice stays dimmed.') },
    { type: 'custom', name: 'preview', span: 3, render: (dom, d) => {
      const total = (parseWhole(d.minutes, 0, 600) ?? 0) + (parseWhole(d.margin, 0, 120) ?? 0);
      return dom.h('div', { class: 'prev' },
        dom.h('span', { class: 'mono cap' }, 'How a day looks'),
        dom.h('div', { class: 'strip' },
          dom.h('div', { class: 'b com' }, `Commute ${total}`),
          dom.h('div', { class: 'b cls' }, 'Your event'),
          dom.h('div', { class: 'b com' }, `Commute ${total}`)));
    } },
  ],
```

A custom field whose `render` returns `null` produces nothing (see `case 'custom'` above), and `formColumn` filters those out with `.filter(Boolean)`.

In `formColumn`, pass maps: `const ctx = { state: s.state, maps: s.maps, scratch: local.scratch, rerender };` and add `.filter(Boolean)` after the `.map((f) => renderField(...))`.

In `deleteArea`, replace the `linked`/`extra` computation with `const extra = sel.spec.confirmNote ? sel.spec.confirmNote(s.state, sel.id) : '';`.

In `listColumn`, before the items, add

```js
      kindId === 'commutes' && (s.state.places ?? []).length < 2 && h('p', { class: 'hint' }, 'Add at least two places first, like Home and Campus.'),
```

`public/css/app.css` append:

```css
.setup .sub { flex-wrap: wrap; }
.prev { border-top: 4px solid var(--ink); padding-top: 12px; }
.strip { display: flex; gap: 6px; margin-top: 8px; }
.strip .b { flex: 1; box-sizing: border-box; padding: 10px; border: 2px solid var(--ink); font-size: 13px; overflow-wrap: anywhere; }
.strip .b.cls { flex: 3; background: var(--study); color: var(--on-study); }
.strip .b.com { color: var(--ink); background: repeating-linear-gradient(135deg, var(--paper) 0 6px, #DAD5C8 6px 12px); }
```

(If `.hint` has no rule in `app.css`, `grep -n "hint" public/css/app.css`; setup.js already uses the class, so a rule should exist. Do not add a duplicate.)

- [ ] **Step 4: Run, commit**

Run: `npm test` (green; fix only failures caused by the new fields, such as a preferences form test that counts fields).

```bash
git add -A public test
git commit -m "feat: the Places and Commutes screens

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015g9zWNaWwq6C6AoikFwJmf"
```

---

### Task 7: Wire it into the app and test it end to end

**Files:**
- Modify: `public/js/main.js`
- Test: `test/frontend/setup-e2e.test.ts`, `test/frontend/e2e.test.ts` (only if a count or list there changes)

**Interfaces:**
- Consumes: everything above.
- Produces: sections `places` and `commutes` registered in the Setup group (between Due dates and Preferences); the Setup tab is current on both; the Week receives `travel` and `travelOff`.

- [ ] **Step 1: Write the failing tests**

In `test/frontend/setup-e2e.test.ts`: update the existing first test so the id list is `['setup', 'commitments', 'tasks', 'due-dates', 'places', 'commutes', 'preferences']` and the menu links list is `['#/week', '#/commitments', '#/tasks', '#/due-dates', '#/places', '#/commutes', '#/preferences']`. Then append:

```ts
const placeRows = [
  { id: 'home', name: 'Home', kind: 'home', address: 'Calle 1' },
  { id: 'campus', name: 'Campus', kind: 'campus', address: 'Av 2' },
];
const route = { id: 'r1', fromPlaceId: 'home', toPlaceId: 'campus', repeats: null, source: { method: 'typed', minutes: 45 }, marginMinutes: 10 };
const lecture = { id: 'lec', title: 'Lecture', category: 'class', start: 600, end: 720, pattern: { kind: 'once', date: '2026-10-05' }, exceptions: [], bufferBefore: 0, placeId: 'campus' };

test('travel reaches the week and the plan keeps its blocks out of it', async () => {
  assert.equal((await put(baseState({ places: placeRows, commutes: [route], commitments: [lecture] }))).status, 200);
  const { app, root } = boot();
  await settled(app);
  const legs = app.store.get().travel;
  assert.deepEqual(legs.map((l: any) => [l.start, l.end]), [[545, 600], [720, 775]]);
  assert.match(textOf(root), /Commute 55/);
  for (const b of app.store.get().state.blocks.filter((x: any) => x.date === '2026-10-05')) {
    for (const l of legs) assert.ok(b.end <= l.start || b.start >= l.end);
  }
});

test('add a place through the form, then a commute between two places, and both are on the server', async () => {
  assert.equal((await put(baseState({ places: placeRows }))).status, 200);
  const { app, root, win } = boot();
  await settled(app);
  app.navigate('#/places/new');
  type(root, 'f-name', 'Parish');
  type(root, 'f-address', 'Plaza 1');
  await save(app, root);
  assert.ok((await serverState()).places.some((p: any) => p.name === 'Parish' && p.address === 'Plaza 1'));
  assert.match(win.location.hash, /^#\/places\//);
  app.navigate('#/commutes/new');
  type(root, 'f-minutes', '25');
  await save(app, root);
  const state = await serverState();
  assert.equal(state.commutes.length, 1);
  assert.deepEqual(state.commutes[0].source, { method: 'typed', minutes: 25 });
});

test('deleting a place through the form removes its commute from the server too', async () => {
  assert.equal((await put(baseState({ places: placeRows, commutes: [route], commitments: [lecture] }))).status, 200);
  const { app, root } = boot();
  await settled(app);
  app.navigate('#/places/campus');
  key(root, 'setup-delete').click();
  assert.match(textOf(byClass(root, 'confirm')[0]), /Its 1 commute goes too\. 1 commitment loses its place\./);
  key(root, 'setup-confirm').click();
  await app.store.idle();
  await tick();
  const state = await serverState();
  assert.deepEqual(state.commutes, []);
  assert.equal(state.places.some((p: any) => p.id === 'campus'), false);
  assert.equal('placeId' in state.commitments[0], false);
});

test('a missing address shows up in the Nudge and the week says when travel is off', async () => {
  const anna = { id: 'anna', name: 'Anna', kind: 'student', address: '' };
  const les = { ...lecture, id: 'les', title: 'Lesson Anna', placeId: 'anna' };
  assert.equal((await put(baseState({ places: [placeRows[0], anna], commitments: [les] }))).status, 200);
  const a = boot();
  await settled(a.app);
  assert.ok(a.app.store.get().warnings.some((w: any) => w.kind === 'address-missing'));
  assert.match(textOf(a.root), /Anna has no address and no commute/);
  assert.equal((await put(baseState({ places: [anna] }))).status, 200);
  const b = boot();
  await settled(b.app);
  assert.match(textOf(b.root), /Travel is off\. Add a Home place\./);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/frontend/setup-e2e.test.ts`
Expected: FAIL (unknown routes; week does not receive travel).

- [ ] **Step 3: Implement in `public/js/main.js`**

Replace the week section's `render` with:

```js
    render: (ctx) => {
      const s = ctx.s;
      const model = weekModel(s.state, currentWeek(), visible, getClock().today, s.travel);
      const { needsYou } = buildNudge(s.warnings);
      const places = s.state.places ?? [];
      const travelOff = places.length > 0 && !places.some((p) => p.kind === 'home');
      return renderWeek(dom, { model, visible, needsYou, isEmpty: s.isEmpty, travelOff }, weekActions);
    },
```

Change the setup section's `activeFor` to `['commitments', 'tasks', 'due-dates', 'places', 'commutes', 'preferences']`, and register, between `due-dates` and `preferences`:

```js
  registry.register({ id: 'places', title: 'Places', group: 'setup', description: 'Home, campus and where your lessons are.', render: setupPage('places') });
  registry.register({ id: 'commutes', title: 'Commutes', group: 'setup', description: 'How long it takes to get around.', render: setupPage('commutes') });
```

- [ ] **Step 4: Run, commit**

Run: `npm test`. Also start the real server and fetch the pieces once, as in earlier smoke tests: `PORT=8799 DATA_FILE=/private/tmp/claude-501/-Users-tomastello/c348e91c-9fe4-4235-be30-4fd252dc9005/scratchpad/commute-smoke.json node src/server.ts &`, then `curl -s -H 'Host: 127.0.0.1:8799' http://127.0.0.1:8799/api/commute/status` must print `{"maps":"unavailable"}`; stop the server afterwards.

```bash
git add -A public test
git commit -m "feat: wire Places, Commutes and travel into the app

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015g9zWNaWwq6C6AoikFwJmf"
```

---

### Task 8: Docs and the visual checklist

**Files:**
- Modify: `README.md`, `docs/ui-visual-check.md`, `docs/superpowers/specs/2026-10-10-commute-design.md`, `docs/superpowers/specs/2026-10-09-ui-design.md`

**Interfaces:**
- Consumes: the finished feature.
- Produces: accurate status text and a visual checklist for boards P and Q.

- [ ] **Step 1: Update the docs**

- `README.md`: read it first; in the status section say commute core is built (places, commutes, travel in the plan and the Week, typed times) and Google Maps lookup is the next commute plan; mention `GET /api/commute/status` if the README lists endpoints.
- `docs/ui-visual-check.md`: append a section "Places and Commutes (boards P, Q)": the six sub-tabs; Places list shows address or "Address missing" and the form hint; Commutes list and form (From, To, Repeats, days, "I type it" selected and "Google Maps finds it" dashed and dimmed, minutes, margin, travel mode segments, the grey note, the "How a day looks" strip with hatched commute blocks around a vermilion event); Week shows hatched grey "Commute NN" entries with the time and "commute" or "estimated"; load the example and look at Tuesday and Thursday (campus), Sunday (parish) and Thursday afternoon (Anna, estimated) and the Nudge line about Anna's missing address; delete the Home place and see "Travel is off. Add a Home place."
- Commute spec: change its status line to "built (core), Maps pending" and add under "Dropped from board Q" the ruling that the mode segments are always visible as on the board and only saved when Maps is chosen, and that the preview strip is illustrative (it shows the typed minutes plus margin around a placeholder event), and that past days show no travel because legs are only computed from today.
- UI spec build-status bullet: add that Places and Commutes are built per `docs/superpowers/plans/2026-10-10-commute-core.md`.

- [ ] **Step 2: Verify and commit**

Run: `npm test` (green; docs do not change tests, but `assets.test.ts` may read docs for referenced boards, so run the whole suite).

```bash
git add README.md docs
git commit -m "docs: commute core status and the Places and Commutes visual checks

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015g9zWNaWwq6C6AoikFwJmf"
```

---

## Self-review notes

- **Spec coverage:** data model (Task 1); resolution order, allowance, margin, return trips, `address-missing`, `travel-tight`, Home missing (Tasks 2, 3, 4, 7); Maps interface, `unavailable` provider, status endpoint (Tasks 3, 4, 6); Places and Commutes screens, Week legs, deletion cascades, the Place select and the allowance field (Tasks 5, 6, 7); old files (Tasks 1, 5). The real Google lookup, cache and key check are the next plan, as the spec says.
- **Deviations to ledger as rulings when they happen:** the mode segments are always shown (as on board Q) though the spec said "shown only for Maps"; the preview strip is illustrative, not computed; past days show no travel; the allowance field's position in the preferences grid.
- **Names used across tasks:** `legsOn`, `placeFor`, `minutesFor`, `appliesOn`, `DayTravel`, `TravelContext`, `travelOn`, `Leg`, `placeKind`, `commuteKind`, `PLACE_KINDS`, `TRAVEL_MODES`, `confirmNote`, `disabledValues`, `maps`, `travel`, `travelOff`, `travelAllowanceMinutes`, `travelAllowance` (draft), `placeId`, warning kinds `address-missing` and `travel-tight`, key formats `address-missing|<place>` and `travel-tight|<place>|<date>`.
