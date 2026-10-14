# Friend availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two people who use the planner can ask each other "when are you free to study together, hang out or meet?" and get back times, delivered instantly inside the app through Supabase, showing only free times.

**Architecture:** The local Node server (`src/server.ts`) is the only thing that talks to Supabase; the browser talks to the local server, which holds the signed-in session in `db.share.json`. `src/share.ts` is pure logic (which times to offer for each purpose, overlap of two people, checking an answer). `src/shareservice.ts` is the interface plus an in-memory fake used by every test; `src/supabase.ts` is the real client over plain `fetch`. `supabase/schema.sql` holds the tables and row-level rules the user applies to their own project. The UI is a Friends section in Settings plus Nudge bubbles for an incoming request and an incoming answer.

**Tech Stack:** Node 22+ type stripping (`node src/server.ts`), `node:test` (`npm test` = `node --test "test/**/*.test.ts"`; NEVER vitest), plain `fetch` (no SDK), Supabase Auth + PostgREST, vanilla JS frontend with the `h()` helper and the fake DOM in `test/frontend/fakedom.ts`.

**Spec:** `docs/superpowers/specs/2026-10-13-friend-availability-design.md`

## Global Constraints

- Tests use the fake share service; no automated test touches the network. `npm test` only; never vitest.
- No emojis in UI text. No inline styles (CSP). No gradients, no purple. Text goes through `h()`/`textContent`, never `innerHTML`.
- The Supabase key in the planner is the public anon key only. The `service_role` key is never asked for, stored or printed.
- The password is sent only to Supabase over HTTPS, never stored, logged or echoed. Tokens live only in `db.share.json` (mode 0600) and never reach the browser.
- Only free times travel: a slot is exactly `{date, start, end, kind}` with `kind` `study` or `free`. Titles, places, notes of events and addresses never leave the computer.
- Purposes (confirmed): `study` offers planned study blocks plus free gaps inside the day windows (protected evenings left out); `hang` offers free time including the evenings kept free (the window grows to hold them); `meeting` offers free gaps inside the day windows only. Classes with buffers, commute legs and non-study planned work are never offered.
- Limits: 20 friends; a request covers at most 30 days; at most 10 open requests to one friend and 50 a day; a note is at most 200 characters; an answer holds at most 40 slots; minutes 15 to 720; requests expire after 7 days; answers deleted after 30 days; password at least 10 characters; display name 1 to 40 characters; invite codes expire after 7 days, at most 5 active.
- Dates ahead: a request or answer may only look up to 60 days from today (`FREE_SPAN_DAYS` in `src/chattools.ts`).
- Errors are plain sentences from our own code; never echo a response body or a key. Signed out or offline, the planner works exactly as before.
- Every commit ends with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Do not push.

## Review Focus

- A third person (not sender or recipient) must never read, answer or delete someone else's request or answer. (Task 4 SQL, `scripts/rls-check.ts`; Task 2 fake enforces the same in tests.)
- The browser can never make the server send anything but a subset of the slots the server itself computed. (Task 5 `answer` test.)
- A friend's name or note that looks like markup or instructions renders as plain text. (Task 7 test.)
- Signed out, offline, expired session, or service unavailable: the planner still loads and Nudge/Settings show a plain sentence. (Tasks 5, 6, 7.)
- A request whose dates are already past, or that spans more than 30 days, is refused with a sentence. (Tasks 1, 5.)
- Two quick presses on Send or Ask send once. (Task 7.)
- Disconnecting deletes the requests between the two people. (Tasks 2, 4.)

---

### Task 1: The pure sharing logic (`src/share.ts`)

**Files:**
- Create: `src/share.ts`
- Test: `test/share.test.ts`

**Interfaces:**
- Consumes: `replanCore(state, today, nowMinutes, horizonDays)` from `src/replan.ts`; `busyOn` from `src/busy.ts`; `freeSlots` from `src/slots.ts`; `hhmm` from `src/format.ts`; `addDays`, `daysBetween`, `weekdayOf` from `src/dates.ts`; `FREE_SPAN_DAYS` from `src/chattools.ts`.
- Produces: `type Purpose = 'study' | 'hang' | 'meeting'`; `PURPOSES`; `PURPOSE_WORDS`; limits `MAX_SPAN_DAYS`, `MAX_SLOTS`, `MAX_NOTE`, `MIN_MINUTES`, `MAX_MINUTES`; `interface Slot {date: DateStr; start: string; end: string; kind: 'study' | 'free'}`; `class ShareError extends Error`; `slotsFor(state, purpose, from, to, minutes, today, nowMinutes?) => Slot[]`; `overlap(mine: Slot[], theirs: Slot[], minutes: number) => Slot[]`; `checkAnswer(allowed: Slot[], given: unknown) => Slot[]`.

- [ ] **Step 1: Write the failing tests**

Create `test/share.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SLOTS, PURPOSES, ShareError, checkAnswer, overlap, slotsFor } from '../src/share.ts';
import type { Slot } from '../src/share.ts';
import { emptyState } from '../src/store.ts';
import { defaultPreferences } from '../src/defaults.ts';
import { commitment, task } from './helpers.ts';

// 2026-10-05 is a Monday; 2026-10-09 is a Friday (soft evening from 18:00).
const base = () => ({
  ...emptyState(),
  preferences: { ...structuredClone(defaultPreferences), weekdayWindow: { start: 480, end: 1320 }, daysOff: [] },
  commitments: [commitment({ id: 'lec', title: 'Lecture', start: 600, end: 720, pattern: { kind: 'weekly', weekdays: [1], from: '2026-09-01', to: '2026-12-31' } })],
});
const TODAY = '2026-10-05';
const span = (s: Slot) => [s.date, s.start, s.end, s.kind];

test('meeting offers the free gaps in the day window, not the class', () => {
  const out = slotsFor(base(), 'meeting', '2026-10-05', '2026-10-05', 60, TODAY);
  assert.deepEqual(out.map(span), [['2026-10-05', '08:00', '10:00', 'free'], ['2026-10-05', '12:00', '22:00', 'free']]);
});

test('a longer minimum drops the short gaps', () => {
  const out = slotsFor(base(), 'meeting', '2026-10-05', '2026-10-05', 180, TODAY);
  assert.deepEqual(out.map(span), [['2026-10-05', '12:00', '22:00', 'free']]);
});

test('hang out reaches into the evening kept free; meeting does not', () => {
  const meeting = slotsFor(base(), 'meeting', '2026-10-09', '2026-10-09', 60, TODAY);
  const hang = slotsFor(base(), 'hang', '2026-10-09', '2026-10-09', 60, TODAY);
  assert.deepEqual(meeting.map(span), [['2026-10-09', '08:00', '18:00', 'free']]);
  assert.deepEqual(hang.map(span), [['2026-10-09', '08:00', '24:00', 'free']]);
});

test('study together offers planned study blocks as their own slots and never overlaps the class', () => {
  const s = { ...base(), tasks: [task({ id: 't', weeklyMinutes: 240 })] };
  const out = slotsFor(s, 'study', '2026-10-05', '2026-10-11', 60, TODAY);
  const study = out.filter((x) => x.kind === 'study');
  assert.ok(study.length > 0, 'a planned week has study blocks to share');
  for (const x of out.filter((o) => o.date === '2026-10-05')) assert.ok(x.end <= '10:00' || x.start >= '12:00', `${x.start}-${x.end} overlaps the lecture`);
  for (const a of study) for (const b of out.filter((o) => o.kind === 'free' && o.date === a.date)) assert.ok(a.end <= b.start || b.end <= a.start, 'a study block and a free gap never overlap');
});

test('study blocks are not offered by meeting or hang out', () => {
  const s = { ...base(), tasks: [task({ id: 't', weeklyMinutes: 240 })] };
  for (const p of ['meeting', 'hang'] as const) assert.equal(slotsFor(s, p, '2026-10-05', '2026-10-11', 60, TODAY).some((x) => x.kind === 'study'), false);
});

test('nothing before now is offered today', () => {
  const out = slotsFor(base(), 'meeting', '2026-10-05', '2026-10-05', 60, TODAY, 700);
  assert.equal(out[0].start, '12:00');
});

test('days in the past, a wrong order, too long or too far ahead, and unknown purposes are refused with a sentence', () => {
  const s = base();
  assert.throws(() => slotsFor(s, 'meeting', '2026-10-01', '2026-10-02', 60, TODAY), ShareError);
  assert.throws(() => slotsFor(s, 'meeting', '2026-10-09', '2026-10-07', 60, TODAY), ShareError);
  assert.throws(() => slotsFor(s, 'meeting', '2026-10-05', '2026-11-10', 60, TODAY), /at most 30 days/);
  assert.throws(() => slotsFor(s, 'meeting', '2026-12-20', '2026-12-21', 60, TODAY), /up to 2026-12-03/);
  assert.throws(() => slotsFor(s, 'party' as any, '2026-10-05', '2026-10-05', 60, TODAY), ShareError);
  assert.throws(() => slotsFor(s, 'meeting', '2026-10-05', '2026-10-05', 5, TODAY), ShareError);
  assert.deepEqual(PURPOSES, ['study', 'hang', 'meeting']);
});

test('at most 40 slots come back, earliest first', () => {
  const out = slotsFor({ ...base(), commitments: [] }, 'meeting', '2026-10-05', '2026-11-03', 15, TODAY);
  assert.ok(out.length <= MAX_SLOTS);
  assert.deepEqual([...out].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)), out);
});

test('overlap keeps only the time both people have, at least the minimum', () => {
  const mine: Slot[] = [{ date: '2026-10-06', start: '10:00', end: '14:00', kind: 'free' }];
  const theirs: Slot[] = [
    { date: '2026-10-06', start: '12:00', end: '18:00', kind: 'study' },
    { date: '2026-10-06', start: '13:30', end: '15:00', kind: 'free' },
    { date: '2026-10-07', start: '10:00', end: '14:00', kind: 'free' },
  ];
  assert.deepEqual(overlap(mine, theirs, 60).map(span), [['2026-10-06', '12:00', '14:00', 'free']]);
  assert.deepEqual(overlap(mine, theirs, 180), []);
});

test('an answer may only hold slots that were offered, and only the four fields travel', () => {
  const allowed: Slot[] = [{ date: '2026-10-06', start: '10:00', end: '12:00', kind: 'free' }, { date: '2026-10-07', start: '10:00', end: '12:00', kind: 'study' }];
  const ok = checkAnswer(allowed, [{ ...allowed[0], title: 'Dentist' }, allowed[0]]);
  assert.deepEqual(ok, [allowed[0]]);
  assert.throws(() => checkAnswer(allowed, [{ date: '2026-10-06', start: '09:00', end: '12:00', kind: 'free' }]), /changed/);
  assert.throws(() => checkAnswer(allowed, []), /Tick at least one/);
  assert.throws(() => checkAnswer(allowed, 'x'), ShareError);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/share.test.ts`
Expected: FAIL (`Cannot find module '../src/share.ts'`).

- [ ] **Step 3: Write `src/share.ts`**

```ts
import { busyOn } from './busy.ts';
import { FREE_SPAN_DAYS } from './chattools.ts';
import { addDays, daysBetween, weekdayOf } from './dates.ts';
import { hhmm } from './format.ts';
import { replanCore } from './replan.ts';
import { freeSlots } from './slots.ts';
import type { DateStr, Minutes, State, Window } from './types.ts';

export type Purpose = 'study' | 'hang' | 'meeting';
export const PURPOSES: Purpose[] = ['study', 'hang', 'meeting'];
export const PURPOSE_WORDS: Record<Purpose, string> = { study: 'study together', hang: 'hang out', meeting: 'meet' };

export const MAX_SPAN_DAYS = 30;
export const MAX_SLOTS = 40;
export const MAX_NOTE = 200;
export const MIN_MINUTES = 15;
export const MAX_MINUTES = 720;

export interface Slot {
  date: DateStr;
  start: string;
  end: string;
  kind: 'study' | 'free';
}

// The message is always one of our own sentences.
export class ShareError extends Error {}

const toMinutes = (t: string): Minutes => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const order = (a: Slot, b: Slot): number => (a.date + a.start).localeCompare(b.date + b.start);

/** The times this person can offer for a request, by its purpose. Pure: reads the state, writes nothing. */
export function slotsFor(state: State, purpose: Purpose, from: DateStr, to: DateStr, minutes: Minutes, today: DateStr, nowMinutes?: Minutes): Slot[] {
  if (!PURPOSES.includes(purpose)) throw new ShareError('That purpose is not one I know.');
  if (!Number.isInteger(minutes) || minutes < MIN_MINUTES || minutes > MAX_MINUTES) throw new ShareError(`The length must be a whole number of minutes from ${MIN_MINUTES} to ${MAX_MINUTES}.`);
  const first = from < today ? today : from;
  if (to < first) throw new ShareError('The dates are in the past or the wrong way round.');
  if (daysBetween(first, to) >= MAX_SPAN_DAYS) throw new ShareError(`Ask for at most ${MAX_SPAN_DAYS} days at a time.`);
  const last = addDays(today, FREE_SPAN_DAYS - 1);
  if (to > last) throw new ShareError(`I can only look ${FREE_SPAN_DAYS} days ahead. Ask for dates up to ${last}.`);

  const plan = replanCore(state, today, nowMinutes, daysBetween(today, to) + 1);
  const pref = state.preferences;
  const out: Slot[] = [];
  for (let d = first; d <= to; d = addDays(d, 1)) {
    const day = weekdayOf(d);
    const base = pref.daysOff.includes(day) ? pref.dayOffWindow : pref.weekdayWindow;
    const kept = pref.softWindows.filter((s) => s.weekday === day);
    // Hang out reaches into the evenings the person keeps free, so its window grows to hold them.
    const reach = purpose === 'hang' ? kept : [];
    let window: Window = { start: Math.min(base.start, ...reach.map((s) => s.start)), end: Math.max(base.end, ...reach.map((s) => s.end)) };
    if (d === today && nowMinutes !== undefined) window = { start: Math.max(window.start, nowMinutes), end: window.end };
    // Work marked not done or waived gives its time back; everything else keeps it.
    const blocks = plan.state.blocks.filter((b) => b.date === d && b.status !== 'missed' && b.status !== 'waived');
    const busy: Window[] = [
      ...busyOn(d, state.commitments),
      ...plan.travel.filter((l) => l.date === d),
      ...blocks,
      ...(purpose === 'hang' ? [] : kept),
    ];
    for (const s of freeSlots(window, busy)) {
      if (s.end - s.start >= minutes) out.push({ date: d, start: hhmm(s.start), end: hhmm(s.end), kind: 'free' });
    }
    if (purpose === 'study') {
      for (const b of blocks) {
        const live = d !== today || nowMinutes === undefined || b.end > nowMinutes;
        if (b.category === 'study' && b.end - b.start >= minutes && live) out.push({ date: d, start: hhmm(b.start), end: hhmm(b.end), kind: 'study' });
      }
    }
  }
  return out.sort(order).slice(0, MAX_SLOTS);
}

/** The time two people both have, at least `minutes` long. */
export function overlap(mine: Slot[], theirs: Slot[], minutes: Minutes): Slot[] {
  const out: Slot[] = [];
  for (const a of mine) {
    for (const b of theirs) {
      if (a.date !== b.date) continue;
      const start = Math.max(toMinutes(a.start), toMinutes(b.start));
      const end = Math.min(toMinutes(a.end), toMinutes(b.end));
      if (end - start >= minutes) out.push({ date: a.date, start: hhmm(start), end: hhmm(end), kind: 'free' });
    }
  }
  return out.sort(order).slice(0, MAX_SLOTS);
}

/** What a person ticked must be exactly what was offered; only the four fields are kept. */
export function checkAnswer(allowed: Slot[], given: unknown): Slot[] {
  if (!Array.isArray(given) || given.length === 0 || given.length > MAX_SLOTS) throw new ShareError('Tick at least one time to send.');
  const key = (s: Slot) => `${s.date}|${s.start}|${s.end}|${s.kind}`;
  const offered = new Set(allowed.map(key));
  const seen = new Set<string>();
  const out: Slot[] = [];
  for (const g of given) {
    if (typeof g !== 'object' || g === null) throw new ShareError('Those times changed. Reload and tick again.');
    const o = g as Record<string, unknown>;
    const slot = { date: o.date, start: o.start, end: o.end, kind: o.kind } as Slot;
    const k = key(slot);
    if (!offered.has(k)) throw new ShareError('Those times changed. Reload and tick again.');
    if (!seen.has(k)) {
      seen.add(k);
      out.push(slot);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/share.test.ts`
Expected: PASS (10 tests). If a test's date arithmetic is off (for example the "up to 2026-12-03" sentence: `addDays('2026-10-05', 59)`), compute the real value with `node -e "import('./src/dates.ts').then(m=>console.log(m.addDays('2026-10-05',59)))"` and correct the TEST, never the code.

- [ ] **Step 5: Commit**

```bash
git add src/share.ts test/share.test.ts
git commit -m "feat: the times to offer a friend, by purpose, and the overlap of two people"
```

---

### Task 2: The service interface, a fake service, and the session file

**Files:**
- Create: `src/shareservice.ts`, `src/sharestore.ts`
- Test: `test/shareservice.test.ts`, `test/sharestore.test.ts`

**Interfaces:**
- Consumes: `Purpose`, `Slot` from `src/share.ts`.
- Produces (`src/shareservice.ts`): `Session {accessToken, refreshToken, expiresAt: number, userId, email}`; `Friend {connectionId, id, name}`; `RequestRow {id, senderId, recipientId, purpose, from, to, minutes, note, status: 'open'|'answered'|'declined', createdAt, expiresAt, slots: Slot[] | null}`; `ShareErrorCode`; `class ShareServiceError(code, message)`; `SHARE_MESSAGES`; `interface ShareService` (below); `unavailableShare`; `fakeShareService(): {service, add(email, name, password?): Promise<Session>}`.
- Produces (`src/sharestore.ts`): `ShareFile {session: Session | null; okayed: string[]}`; `OKAYED_MAX = 200`; `sharePathFor(statePath)`; `loadShare(path)` (never throws); `saveShare(path, file)` (tmp then rename, mode 0600).

```ts
export interface ShareService {
  status: 'ready' | 'unavailable';
  signUp(email: string, password: string, name: string): Promise<Session | null>; // null = confirm by email first
  signIn(email: string, password: string): Promise<Session>;
  refresh(session: Session): Promise<Session>;
  recover(email: string): Promise<void>;
  setPassword(accessToken: string, password: string): Promise<void>;
  createInvite(session: Session): Promise<string>;
  joinInvite(session: Session, code: string): Promise<Friend>;
  friends(session: Session): Promise<Friend[]>;
  disconnect(session: Session, connectionId: string): Promise<void>;
  createRequest(session: Session, input: { to: string; purpose: Purpose; from: string; until: string; minutes: number; note: string }): Promise<RequestRow>;
  requests(session: Session): Promise<RequestRow[]>;
  answer(session: Session, requestId: string, slots: Slot[]): Promise<void>;
  decline(session: Session, requestId: string): Promise<void>;
}
```

- [ ] **Step 1: Write the failing tests**

`test/shareservice.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ShareServiceError, fakeShareService, unavailableShare } from '../src/shareservice.ts';

const slot = { date: '2026-10-06', start: '10:00', end: '12:00', kind: 'free' as const };
const ask = (to: string) => ({ to, purpose: 'meeting' as const, from: '2026-10-06', until: '2026-10-08', minutes: 60, note: 'Coffee?' });
const code = async (p: Promise<unknown>) => { try { await p; return 'ok'; } catch (e) { return e instanceof ShareServiceError ? e.code : 'other'; } };

async function twoFriends() {
  const { service, add } = fakeShareService();
  const ana = await add('ana@example.com', 'Ana');
  const ben = await add('ben@example.com', 'Ben');
  const invite = await service.createInvite(ana);
  const friend = await service.joinInvite(ben, invite);
  return { service, add, ana, ben, friend };
}

test('sign up needs a password of 10 characters and a new email; sign in checks the password', async () => {
  const { service } = fakeShareService();
  assert.equal(await code(service.signUp('a@example.com', 'short', 'A')), 'weak');
  const s = await service.signUp('a@example.com', 'long-enough-1', 'A');
  assert.ok(s && s.userId);
  assert.equal(await code(service.signUp('a@example.com', 'long-enough-1', 'A')), 'exists');
  assert.equal(await code(service.signIn('a@example.com', 'wrong-password')), 'rejected');
  assert.equal((await service.signIn('a@example.com', 'long-enough-1')).email, 'a@example.com');
});

test('an invite joins two people once, and not oneself', async () => {
  const { service, ana, ben, friend } = await twoFriends();
  assert.equal(friend.name, 'Ana');
  assert.deepEqual((await service.friends(ana)).map((f) => f.name), ['Ben']);
  const again = await service.createInvite(ana);
  assert.equal(await code(service.joinInvite(ben, again)), 'exists');
  assert.equal(await code(service.joinInvite(ana, again)), 'bad-code');
  assert.equal(await code(service.joinInvite(ben, 'NOPE')), 'bad-code');
});

test('a request goes to a friend, is answered with slots, and both sides see it', async () => {
  const { service, ana, ben } = await twoFriends();
  const to = (await service.friends(ana))[0].id;
  const req = await service.createRequest(ana, ask(to));
  assert.equal(req.status, 'open');
  assert.equal((await service.requests(ben))[0].note, 'Coffee?');
  await service.answer(ben, req.id, [slot]);
  const seen = (await service.requests(ana))[0];
  assert.equal(seen.status, 'answered');
  assert.deepEqual(seen.slots, [slot]);
});

test('a third person sees and can do nothing with someone else\'s request', async () => {
  const { service, add, ana, ben } = await twoFriends();
  const cal = await add('cal@example.com', 'Cal');
  const to = (await service.friends(ana))[0].id;
  const req = await service.createRequest(ana, ask(to));
  assert.deepEqual(await service.requests(cal), []);
  assert.equal(await code(service.answer(cal, req.id, [slot])), 'rejected');
  assert.equal(await code(service.decline(cal, req.id)), 'rejected');
  assert.equal(await code(service.createRequest(cal, ask(ben.userId))), 'not-connected');
});

test('only the recipient answers, only while it is open', async () => {
  const { service, ana, ben } = await twoFriends();
  const req = await service.createRequest(ana, ask((await service.friends(ana))[0].id));
  assert.equal(await code(service.answer(ana, req.id, [slot])), 'rejected');
  await service.decline(ben, req.id);
  assert.equal((await service.requests(ana))[0].status, 'declined');
  assert.equal(await code(service.answer(ben, req.id, [slot])), 'rejected');
});

test('at most 10 open requests to one friend', async () => {
  const { service, ana } = await twoFriends();
  const to = (await service.friends(ana))[0].id;
  for (let i = 0; i < 10; i++) await service.createRequest(ana, ask(to));
  assert.equal(await code(service.createRequest(ana, ask(to))), 'limit');
});

test('disconnecting removes the friendship and the requests between the two', async () => {
  const { service, ana, ben } = await twoFriends();
  const friend = (await service.friends(ana))[0];
  await service.createRequest(ana, ask(friend.id));
  await service.disconnect(ana, friend.connectionId);
  assert.deepEqual(await service.friends(ben), []);
  assert.deepEqual(await service.requests(ben), []);
  assert.deepEqual(await service.requests(ana), []);
});

test('a session that is not valid is an auth error; the unavailable service says so', async () => {
  const { service } = fakeShareService();
  assert.equal(await code(service.friends({ accessToken: 'x', refreshToken: 'y', expiresAt: Date.now() + 1e6, userId: 'nobody', email: 'n@example.com' })), 'auth');
  assert.equal(unavailableShare.status, 'unavailable');
});
```

`test/sharestore.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OKAYED_MAX, loadShare, saveShare, sharePathFor } from '../src/sharestore.ts';

const dir = () => mkdtempSync(join(tmpdir(), 'doitwithme-share-'));
const session = { accessToken: 'a', refreshToken: 'r', expiresAt: 5, userId: 'u', email: 'u@example.com' };

test('the share file sits beside the data file', () => {
  assert.equal(sharePathFor('data/db.json'), 'data/db.share.json');
});

test('a saved session comes back, and the file is private to the user', () => {
  const path = join(dir(), 'db.share.json');
  saveShare(path, { session, okayed: ['r1'] });
  assert.deepEqual(loadShare(path), { session, okayed: ['r1'] });
  assert.equal(statSync(path).mode & 0o777, 0o600);
});

test('a missing, broken or odd file is an empty one, and okayed is capped', () => {
  const path = join(dir(), 'db.share.json');
  assert.deepEqual(loadShare(path), { session: null, okayed: [] });
  writeFileSync(path, '{nope');
  assert.deepEqual(loadShare(path), { session: null, okayed: [] });
  writeFileSync(path, JSON.stringify({ session: { accessToken: 1 }, okayed: Array.from({ length: OKAYED_MAX + 5 }, (_, i) => `r${i}`) }));
  const f = loadShare(path);
  assert.equal(f.session, null);
  assert.equal(f.okayed.length, OKAYED_MAX);
  assert.equal(f.okayed.at(-1), `r${OKAYED_MAX + 4}`);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/shareservice.test.ts test/sharestore.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 3: Write `src/shareservice.ts`**

```ts
import type { Purpose, Slot } from './share.ts';

export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // ms since epoch
  userId: string;
  email: string;
}

export interface Friend {
  connectionId: string;
  id: string;
  name: string;
}

export interface RequestRow {
  id: string;
  senderId: string;
  recipientId: string;
  purpose: Purpose;
  from: string;
  to: string;
  minutes: number;
  note: string;
  status: 'open' | 'answered' | 'declined';
  createdAt: string;
  expiresAt: string;
  slots: Slot[] | null;
}

export type ShareErrorCode = 'offline' | 'slow' | 'server' | 'rejected' | 'auth' | 'exists' | 'bad-code' | 'limit' | 'weak' | 'not-connected' | 'range';

export const SHARE_MESSAGES: Record<ShareErrorCode, string> = {
  offline: 'I could not reach the sharing service.',
  slow: 'The sharing service took too long. Try again.',
  server: 'The sharing service had a problem. Try again later.',
  rejected: 'That did not work. Check what you typed and try again.',
  auth: 'You are not signed in.',
  exists: 'That is already done.',
  'bad-code': 'That code did not work.',
  limit: 'You have reached a limit. Try again later.',
  weak: 'The password must be at least 10 characters.',
  'not-connected': 'You are not connected to that person.',
  range: 'Those dates are not allowed.',
};

// The message is always one of our own sentences, never text from the service.
export class ShareServiceError extends Error {
  code: ShareErrorCode;
  constructor(code: ShareErrorCode, message: string = SHARE_MESSAGES[code]) {
    super(message);
    this.code = code;
  }
}

export interface ShareService {
  status: 'ready' | 'unavailable';
  signUp(email: string, password: string, name: string): Promise<Session | null>; // null: confirm by email first
  signIn(email: string, password: string): Promise<Session>;
  refresh(session: Session): Promise<Session>;
  recover(email: string): Promise<void>;
  setPassword(accessToken: string, password: string): Promise<void>;
  createInvite(session: Session): Promise<string>;
  joinInvite(session: Session, code: string): Promise<Friend>;
  friends(session: Session): Promise<Friend[]>;
  disconnect(session: Session, connectionId: string): Promise<void>;
  createRequest(session: Session, input: { to: string; purpose: Purpose; from: string; until: string; minutes: number; note: string }): Promise<RequestRow>;
  requests(session: Session): Promise<RequestRow[]>;
  answer(session: Session, requestId: string, slots: Slot[]): Promise<void>;
  decline(session: Session, requestId: string): Promise<void>;
}

const nope = async (): Promise<never> => {
  throw new ShareServiceError('server', 'Friend sharing is not set up. See docs/supabase-setup.md.');
};

export const unavailableShare: ShareService = {
  status: 'unavailable',
  signUp: nope, signIn: nope, refresh: nope, recover: nope, setPassword: nope, createInvite: nope, joinInvite: nope,
  friends: nope, disconnect: nope, createRequest: nope, requests: nope, answer: nope, decline: nope,
};

/** An in-memory service with the same rules as the database, for tests. */
export function fakeShareService(): { service: ShareService; add: (email: string, name: string, password?: string) => Promise<Session> } {
  interface User { id: string; email: string; password: string; name: string }
  const users = new Map<string, User>();
  const connections: { id: string; a: string; b: string }[] = [];
  const invites = new Map<string, string>();
  let requests: RequestRow[] = [];
  let n = 0;
  const next = (p: string) => `${p}${++n}`;
  const sessionOf = (u: User): Session => ({ accessToken: `tok-${u.id}`, refreshToken: `ref-${u.id}`, expiresAt: Date.now() + 3_600_000, userId: u.id, email: u.email });
  const who = (s: Session): User => {
    const u = users.get(s.userId);
    if (!u || s.accessToken !== `tok-${u.id}`) throw new ShareServiceError('auth');
    return u;
  };
  const connected = (x: string, y: string) => connections.some((c) => (c.a === x && c.b === y) || (c.a === y && c.b === x));
  const friendOf = (me: string, c: { id: string; a: string; b: string }): Friend => {
    const id = c.a === me ? c.b : c.a;
    return { connectionId: c.id, id, name: users.get(id)!.name };
  };
  const copy = (r: RequestRow): RequestRow => structuredClone(r);

  const service: ShareService = {
    status: 'ready',
    async signUp(email, password, name) {
      if (password.length < 10) throw new ShareServiceError('weak');
      if ([...users.values()].some((u) => u.email === email)) throw new ShareServiceError('exists');
      const u = { id: next('u'), email, password, name };
      users.set(u.id, u);
      return sessionOf(u);
    },
    async signIn(email, password) {
      const u = [...users.values()].find((x) => x.email === email && x.password === password);
      if (!u) throw new ShareServiceError('rejected', 'That email and password did not work.');
      return sessionOf(u);
    },
    async refresh(session) {
      const u = users.get(session.userId);
      if (!u || session.refreshToken !== `ref-${u.id}`) throw new ShareServiceError('auth');
      return sessionOf(u);
    },
    async recover() {},
    async setPassword(accessToken, password) {
      if (password.length < 10) throw new ShareServiceError('weak');
      const u = users.get(accessToken.replace(/^(tok|recovery)-/, ''));
      if (!u) throw new ShareServiceError('auth');
      u.password = password;
    },
    async createInvite(session) {
      const me = who(session);
      if ([...invites.values()].filter((o) => o === me.id).length >= 5) throw new ShareServiceError('limit');
      const code = `CODE${++n}`;
      invites.set(code, me.id);
      return code;
    },
    async joinInvite(session, code) {
      const me = who(session);
      const owner = invites.get(code.trim().toUpperCase());
      if (!owner || owner === me.id) throw new ShareServiceError('bad-code');
      if (connected(me.id, owner)) throw new ShareServiceError('exists');
      const c = { id: next('c'), a: me.id, b: owner };
      connections.push(c);
      invites.delete(code.trim().toUpperCase());
      return friendOf(me.id, c);
    },
    async friends(session) {
      const me = who(session);
      return connections.filter((c) => c.a === me.id || c.b === me.id).map((c) => friendOf(me.id, c));
    },
    async disconnect(session, connectionId) {
      const me = who(session);
      const c = connections.find((x) => x.id === connectionId && (x.a === me.id || x.b === me.id));
      if (!c) throw new ShareServiceError('rejected');
      connections.splice(connections.indexOf(c), 1);
      requests = requests.filter((r) => !((r.senderId === c.a && r.recipientId === c.b) || (r.senderId === c.b && r.recipientId === c.a)));
    },
    async createRequest(session, input) {
      const me = who(session);
      if (!connected(me.id, input.to)) throw new ShareServiceError('not-connected');
      if (requests.filter((r) => r.senderId === me.id && r.recipientId === input.to && r.status === 'open').length >= 10) throw new ShareServiceError('limit');
      const row: RequestRow = {
        id: next('r'), senderId: me.id, recipientId: input.to, purpose: input.purpose, from: input.from, to: input.until, minutes: input.minutes,
        note: input.note, status: 'open', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), slots: null,
      };
      requests.push(row);
      return copy(row);
    },
    async requests(session) {
      const me = who(session);
      return requests.filter((r) => r.senderId === me.id || r.recipientId === me.id).map(copy);
    },
    async answer(session, requestId, slots) {
      const me = who(session);
      const r = requests.find((x) => x.id === requestId && x.recipientId === me.id && x.status === 'open');
      if (!r) throw new ShareServiceError('rejected');
      r.status = 'answered';
      r.slots = structuredClone(slots);
    },
    async decline(session, requestId) {
      const me = who(session);
      const r = requests.find((x) => x.id === requestId && x.recipientId === me.id && x.status === 'open');
      if (!r) throw new ShareServiceError('rejected');
      r.status = 'declined';
    },
  };
  const add = async (email: string, name: string, password = 'long-enough-1'): Promise<Session> => (await service.signUp(email, password, name))!;
  return { service, add };
}
```

- [ ] **Step 4: Write `src/sharestore.ts`**

```ts
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Session } from './shareservice.ts';

export const OKAYED_MAX = 200;

export interface ShareFile {
  session: Session | null;
  okayed: string[];
}

// Beside the data file, not inside the planner state: the browser saves the whole state back, and a stale page must not erase a session.
export const sharePathFor = (statePath: string): string => `${statePath.replace(/\.json$/, '')}.share.json`;

const isSession = (s: unknown): s is Session => {
  if (typeof s !== 'object' || s === null) return false;
  const o = s as Record<string, unknown>;
  return typeof o.accessToken === 'string' && typeof o.refreshToken === 'string' && typeof o.userId === 'string' && typeof o.email === 'string' && typeof o.expiresAt === 'number';
};

// A file that cannot be read is treated as signed out rather than breaking the planner.
export function loadShare(path: string): ShareFile {
  if (!existsSync(path)) return { session: null, okayed: [] };
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    return {
      session: isSession(raw.session) ? raw.session : null,
      okayed: Array.isArray(raw.okayed) ? raw.okayed.filter((x: unknown) => typeof x === 'string').slice(-OKAYED_MAX) : [],
    };
  } catch {
    return { session: null, okayed: [] };
  }
}

export function saveShare(path: string, file: ShareFile): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  // Private to the user: the file holds tokens.
  writeFileSync(tmp, `${JSON.stringify({ ...file, okayed: file.okayed.slice(-OKAYED_MAX) }, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, path);
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `node --test test/shareservice.test.ts test/sharestore.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 6: Commit**

```bash
git add src/shareservice.ts src/sharestore.ts test/shareservice.test.ts test/sharestore.test.ts
git commit -m "feat: the sharing service interface, an in-memory fake, and the private session file"
```

---

### Task 3: The real Supabase client (`src/supabase.ts`)

**Files:**
- Create: `src/supabase.ts`
- Test: `test/supabase.test.ts`

**Interfaces:**
- Consumes: `ShareService`, `ShareServiceError`, `Session`, `Friend`, `RequestRow` from `src/shareservice.ts`.
- Produces: `supabaseService({url, anonKey, fetchFn?, timeoutMs?}): ShareService`; `plausibleSupabase(url: string, key: string): boolean`.

Supabase facts this task relies on: Auth lives under `{url}/auth/v1/` (`signup`, `token?grant_type=password`, `token?grant_type=refresh_token`, `recover`, `user` (PUT, with the user's token)); tables under `{url}/rest/v1/<table>` (PostgREST: `?select=…&col=eq.value`, `Prefer: return=representation`); functions under `{url}/rest/v1/rpc/<name>`; every call carries the header `apikey: <anon key>` and `Authorization: Bearer <access token or anon key>`. Our SQL functions raise errors whose message starts with `share:` (for example `share:bad-code`); PostgREST returns `{ "message": "share:bad-code", ... }` with status 400.

- [ ] **Step 1: Write the failing tests**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plausibleSupabase, supabaseService } from '../src/supabase.ts';
import { ShareServiceError } from '../src/shareservice.ts';

const URL = 'https://abcd1234.supabase.co';
const KEY = 'sb_publishable_testkey_0123456789';
const session = { accessToken: 'jwt-1', refreshToken: 'ref-1', expiresAt: Date.now() + 1e6, userId: 'u1', email: 'a@example.com' };

type Call = { url: string; method: string; headers: Record<string, string>; body: any };
function fake(replies: { status?: number; body?: unknown }[]) {
  const calls: Call[] = [];
  const fetchFn = (async (url: string, init: any) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
    const r = replies.shift() ?? { status: 200, body: {} };
    return { ok: (r.status ?? 200) < 400, status: r.status ?? 200, json: async () => r.body ?? {} };
  }) as any;
  return { calls, svc: supabaseService({ url: URL, anonKey: KEY, fetchFn }) };
}
const code = async (p: Promise<unknown>) => { try { await p; return 'ok'; } catch (e) { return e instanceof ShareServiceError ? `${e.code}:${e.message}` : 'other'; } };

test('a plausible project address and key are https supabase and a long key', () => {
  assert.equal(plausibleSupabase(URL, KEY), true);
  assert.equal(plausibleSupabase('http://abcd.supabase.co', KEY), false);
  assert.equal(plausibleSupabase('https://evil.example.com', KEY), false);
  assert.equal(plausibleSupabase(URL, 'short'), false);
  assert.equal(plausibleSupabase(URL, `${KEY}\n`), false);
});

test('sign in posts the password to the token endpoint and builds a session', async () => {
  const { calls, svc } = fake([{ body: { access_token: 'jwt-9', refresh_token: 'ref-9', expires_in: 3600, user: { id: 'u9', email: 'a@example.com' } } }]);
  const s = await svc.signIn('a@example.com', 'long-enough-1');
  assert.equal(calls[0].url, `${URL}/auth/v1/token?grant_type=password`);
  assert.equal(calls[0].headers.apikey, KEY);
  assert.deepEqual(calls[0].body, { email: 'a@example.com', password: 'long-enough-1' });
  assert.equal(s.userId, 'u9');
  assert.ok(s.expiresAt > Date.now() + 3_000_000);
});

test('a wrong password is a plain sentence that never repeats the reply or the key', async () => {
  const { svc } = fake([{ status: 400, body: { error_description: 'Invalid login credentials sb_publishable_testkey_0123456789' } }]);
  const out = await code(svc.signIn('a@example.com', 'wrong-password'));
  assert.equal(out, 'rejected:That email and password did not work.');
  assert.doesNotMatch(out, /sb_publishable|Invalid login/);
});

test('sign up with email confirmation on returns null; a taken email and a weak password have their own codes', async () => {
  assert.equal(await fake([{ body: { id: 'u1' } }]).svc.signUp('a@example.com', 'long-enough-1', 'Ana'), null);
  assert.match(await code(fake([{ status: 422, body: { error_code: 'user_already_exists' } }]).svc.signUp('a@example.com', 'long-enough-1', 'Ana')), /^exists:/);
  assert.match(await code(fake([{ status: 422, body: { error_code: 'weak_password' } }]).svc.signUp('a@example.com', 'long-enough-1', 'Ana')), /^weak:/);
  const { calls, svc } = fake([{ body: { id: 'u1' } }]);
  await svc.signUp('a@example.com', 'long-enough-1', 'Ana');
  assert.deepEqual(calls[0].body.data, { name: 'Ana' });
});

test('calls for a signed-in person carry their token; an expired token is an auth error', async () => {
  const { calls, svc } = fake([{ body: [] }, { status: 401, body: { message: 'JWT expired' } }]);
  await svc.friends(session);
  assert.equal(calls[0].headers.authorization, 'Bearer jwt-1');
  assert.match(await code(svc.friends(session)), /^auth:/);
});

test('creating a request posts only the request fields and maps the row', async () => {
  const row = { id: 'r1', sender: 'u1', recipient: 'u2', purpose: 'study', from_date: '2026-10-06', to_date: '2026-10-08', minutes: 120, note: 'x', status: 'open', created_at: 't', expires_at: 't2' };
  const { calls, svc } = fake([{ status: 201, body: [row] }]);
  const r = await svc.createRequest(session, { to: 'u2', purpose: 'study', from: '2026-10-06', until: '2026-10-08', minutes: 120, note: 'x' });
  assert.equal(calls[0].url, `${URL}/rest/v1/requests`);
  assert.equal(calls[0].headers.prefer, 'return=representation');
  assert.deepEqual(calls[0].body, { sender: 'u1', recipient: 'u2', purpose: 'study', from_date: '2026-10-06', to_date: '2026-10-08', minutes: 120, note: 'x' });
  assert.deepEqual([r.id, r.senderId, r.recipientId, r.from, r.to, r.slots], ['r1', 'u1', 'u2', '2026-10-06', '2026-10-08', null]);
});

test('requests asks for old rows to be cleaned, then lists them with their answers', async () => {
  const slots = [{ date: '2026-10-06', start: '10:00', end: '12:00', kind: 'free' }];
  const rows = [
    { id: 'r1', sender: 'u2', recipient: 'u1', purpose: 'hang', from_date: 'a', to_date: 'b', minutes: 60, note: '', status: 'answered', created_at: 't', expires_at: 't2', answers: { slots } },
    { id: 'r2', sender: 'u1', recipient: 'u2', purpose: 'meeting', from_date: 'a', to_date: 'b', minutes: 60, note: '', status: 'open', created_at: 't', expires_at: 't2', answers: null },
  ];
  const { calls, svc } = fake([{ body: null }, { body: rows }]);
  const out = await svc.requests(session);
  assert.match(calls[0].url, /rpc\/cleanup_share$/);
  assert.match(calls[1].url, /rest\/v1\/requests\?select=\*,answers\(slots\)/);
  assert.deepEqual(out[0].slots, slots);
  assert.equal(out[1].slots, null);
});

test('a database refusal maps to its code; an unknown one is a plain server sentence', async () => {
  assert.match(await code(fake([{ status: 400, body: { message: 'share:bad-code' } }]).svc.joinInvite(session, 'X')), /^bad-code:/);
  assert.match(await code(fake([{ status: 400, body: { message: 'share:limit' } }]).svc.createInvite(session)), /^limit:/);
  assert.match(await code(fake([{ status: 400, body: { message: 'something secret' } }]).svc.createInvite(session)), /^rejected:That did not work/);
  assert.match(await code(fake([{ status: 503, body: {} }]).svc.createInvite(session)), /^server:/);
});

test('a network failure is offline and a timeout is slow', async () => {
  const dead = supabaseService({ url: URL, anonKey: KEY, fetchFn: (async () => { throw new TypeError('fetch failed'); }) as any });
  assert.match(await code(dead.signIn('a@example.com', 'x'.repeat(10))), /^offline:/);
  const slow = supabaseService({ url: URL, anonKey: KEY, fetchFn: (async () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); }) as any });
  assert.match(await code(slow.signIn('a@example.com', 'x'.repeat(10))), /^slow:/);
});

test('answer and decline call the database functions; set password uses the given token', async () => {
  const { calls, svc } = fake([{ body: null }, { body: null }, { body: {} }]);
  await svc.answer(session, 'r1', [{ date: '2026-10-06', start: '10:00', end: '12:00', kind: 'free' }]);
  await svc.decline(session, 'r2');
  await svc.setPassword('recovery-token', 'another-long-pw');
  assert.match(calls[0].url, /rpc\/answer_request$/);
  assert.deepEqual(Object.keys(calls[0].body), ['p_request', 'p_slots']);
  assert.match(calls[1].url, /rpc\/decline_request$/);
  assert.equal(calls[2].method, 'PUT');
  assert.equal(calls[2].headers.authorization, 'Bearer recovery-token');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/supabase.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Write `src/supabase.ts`**

```ts
import { ShareServiceError } from './shareservice.ts';
import type { Friend, RequestRow, Session, ShareErrorCode, ShareService } from './shareservice.ts';
import type { Slot } from './share.ts';

/** The project address must be https on supabase.co, and the key a plain token, so a typo never goes to another site. */
export function plausibleSupabase(url: string, key: string): boolean {
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) && /^[A-Za-z0-9._-]{20,}$/.test(key);
}

interface Opts {
  url: string;
  anonKey: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

const FROM_DB: Record<string, ShareErrorCode> = {
  'share:auth': 'auth', 'share:limit': 'limit', 'share:bad-code': 'bad-code', 'share:exists': 'exists', 'share:range': 'range', 'share:not-connected': 'not-connected',
};

const timedOut = (e: unknown) => e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');

export function supabaseService(opts: Opts): ShareService {
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 15000;
  const base = opts.url.replace(/\/$/, '');

  // Every failure becomes one of our own sentences; nothing from the reply or the key is repeated.
  async function call(method: string, path: string, o: { token?: string; body?: unknown; prefer?: string; auth?: boolean } = {}): Promise<any> {
    const headers: Record<string, string> = { apikey: opts.anonKey, authorization: `Bearer ${o.token ?? opts.anonKey}`, 'content-type': 'application/json' };
    if (o.prefer) headers.prefer = o.prefer;
    let res: Response;
    try {
      res = await fetchFn(`${base}${path}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body), signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      throw new ShareServiceError(timedOut(e) ? 'slow' : 'offline');
    }
    let data: any = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (res.ok) return data;
    if (res.status >= 500) throw new ShareServiceError('server');
    if (o.auth) {
      const c = data && typeof data.error_code === 'string' ? data.error_code : '';
      if (c === 'user_already_exists') throw new ShareServiceError('exists');
      if (c === 'weak_password') throw new ShareServiceError('weak');
      throw new ShareServiceError('rejected', 'That email and password did not work.');
    }
    if (res.status === 401 || res.status === 403) throw new ShareServiceError('auth');
    const m = data && typeof data.message === 'string' ? data.message : '';
    throw new ShareServiceError(FROM_DB[m] ?? 'rejected');
  }

  const sessionOf = (j: any): Session => {
    if (!j || typeof j.access_token !== 'string' || typeof j.refresh_token !== 'string' || !j.user || typeof j.user.id !== 'string') throw new ShareServiceError('rejected');
    return { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: Date.now() + Number(j.expires_in ?? 3600) * 1000, userId: j.user.id, email: String(j.user.email ?? '') };
  };
  const rowOf = (r: any): RequestRow => {
    const a = Array.isArray(r.answers) ? r.answers[0] : r.answers;
    return {
      id: r.id, senderId: r.sender, recipientId: r.recipient, purpose: r.purpose, from: r.from_date, to: r.to_date, minutes: r.minutes,
      note: r.note ?? '', status: r.status, createdAt: r.created_at, expiresAt: r.expires_at, slots: a && Array.isArray(a.slots) ? (a.slots as Slot[]) : null,
    };
  };
  const friendsOf = async (s: Session): Promise<Friend[]> => {
    const rows = await call('GET', '/rest/v1/connections?select=id,a,b', { token: s.accessToken });
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const others = rows.map((c: any) => (c.a === s.userId ? c.b : c.a));
    const profiles = await call('GET', `/rest/v1/profiles?select=id,name&id=in.(${others.join(',')})`, { token: s.accessToken });
    const names = new Map<string, string>((profiles ?? []).map((p: any) => [p.id, p.name]));
    return rows.map((c: any, i: number) => ({ connectionId: c.id, id: others[i], name: names.get(others[i]) ?? 'A friend' }));
  };

  return {
    status: 'ready',
    async signUp(email, password, name) {
      const j = await call('POST', '/auth/v1/signup', { body: { email, password, data: { name } }, auth: true });
      return j && typeof j.access_token === 'string' ? sessionOf(j) : null;
    },
    async signIn(email, password) {
      return sessionOf(await call('POST', '/auth/v1/token?grant_type=password', { body: { email, password }, auth: true }));
    },
    async refresh(session) {
      try {
        return sessionOf(await call('POST', '/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: session.refreshToken }, auth: true }));
      } catch (e) {
        if (e instanceof ShareServiceError && e.code === 'rejected') throw new ShareServiceError('auth');
        throw e;
      }
    },
    async recover(email) {
      await call('POST', '/auth/v1/recover', { body: { email }, auth: true });
    },
    async setPassword(accessToken, password) {
      await call('PUT', '/auth/v1/user', { token: accessToken, body: { password }, auth: true });
    },
    async createInvite(s) {
      return String(await call('POST', '/rest/v1/rpc/create_invite', { token: s.accessToken, body: {} }));
    },
    async joinInvite(s, code) {
      const id = String(await call('POST', '/rest/v1/rpc/join_invite', { token: s.accessToken, body: { p_code: code } }));
      const found = (await friendsOf(s)).find((f) => f.connectionId === id);
      if (!found) throw new ShareServiceError('server');
      return found;
    },
    friends: friendsOf,
    async disconnect(s, connectionId) {
      await call('DELETE', `/rest/v1/connections?id=eq.${encodeURIComponent(connectionId)}`, { token: s.accessToken });
    },
    async createRequest(s, input) {
      const rows = await call('POST', '/rest/v1/requests', {
        token: s.accessToken, prefer: 'return=representation',
        body: { sender: s.userId, recipient: input.to, purpose: input.purpose, from_date: input.from, to_date: input.until, minutes: input.minutes, note: input.note },
      });
      if (!Array.isArray(rows) || !rows[0]) throw new ShareServiceError('server');
      return rowOf(rows[0]);
    },
    async requests(s) {
      // Old rows are removed by the database; a failure here must not hide the list.
      try {
        await call('POST', '/rest/v1/rpc/cleanup_share', { token: s.accessToken, body: {} });
      } catch (e) {
        if (e instanceof ShareServiceError && e.code === 'auth') throw e;
      }
      const rows = await call('GET', '/rest/v1/requests?select=*,answers(slots)&order=created_at.desc&limit=100', { token: s.accessToken });
      return Array.isArray(rows) ? rows.map(rowOf) : [];
    },
    async answer(s, requestId, slots) {
      await call('POST', '/rest/v1/rpc/answer_request', { token: s.accessToken, body: { p_request: requestId, p_slots: slots } });
    },
    async decline(s, requestId) {
      await call('POST', '/rest/v1/rpc/decline_request', { token: s.accessToken, body: { p_request: requestId } });
    },
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/supabase.test.ts`
Expected: PASS (10 tests). Note `AbortSignal.timeout` exists in Node 22. If `fetchFn` in the test ignores `signal`, that is fine.

- [ ] **Step 5: Commit**

```bash
git add src/supabase.ts test/supabase.test.ts
git commit -m "feat: the Supabase client over plain fetch, with plain-sentence errors"
```

---

### Task 4: The database rules, the setup guide, and the rules check

**Files:**
- Create: `supabase/schema.sql`, `docs/supabase-setup.md`, `scripts/rls-check.ts`
- Test: `test/schema.test.ts` (static checks of the SQL text only)

**Interfaces:**
- Consumes: `supabaseService` from `src/supabase.ts` (the script).
- Produces: the tables `profiles`, `connections`, `invites`, `requests`, `answers`; functions `create_invite()`, `join_invite(text)`, `answer_request(uuid, jsonb)`, `decline_request(uuid)`, `cleanup_share()`; error messages `share:auth|limit|bad-code|exists|range|not-connected|gone|bad-slots` (the client maps these in Task 3).

- [ ] **Step 1: Write the static test**

`test/schema.test.ts` (the real database is checked by hand with `scripts/rls-check.ts`; this test only guards the file against an accidental loss of a rule):

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

test('every table has row-level security switched on', () => {
  for (const t of ['profiles', 'connections', 'invites', 'requests', 'answers']) {
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security`), t);
  }
});

test('the rules that keep a third person out are present', () => {
  assert.match(sql, /create policy requests_select on public\.requests[\s\S]*auth\.uid\(\) in \(sender, recipient\)/);
  assert.match(sql, /create policy requests_insert on public\.requests[\s\S]*public\.are_connected\(sender, recipient\)/);
  assert.match(sql, /create policy answers_select on public\.answers/);
  assert.doesNotMatch(sql, /create policy \w+ on public\.answers for (insert|update|delete)/, 'answers are written only by answer_request');
  assert.doesNotMatch(sql, /create policy \w+ on public\.(connections|invites) for insert/, 'connections and invites are made only by functions');
});

test('every function the app calls exists and is granted to signed-in people only', () => {
  for (const f of ['create_invite', 'join_invite', 'answer_request', 'decline_request', 'cleanup_share']) {
    assert.match(sql, new RegExp(`create or replace function public\\.${f}\\(`), f);
    assert.match(sql, new RegExp(`grant execute on function public\\.${f}\\([^)]*\\) to authenticated`), `${f} grant`);
  }
  assert.doesNotMatch(sql, /grant [^;]* to anon/);
});

test('the limits from the spec are in the database too', () => {
  assert.match(sql, /minutes between 15 and 720/);
  assert.match(sql, /char_length\(note\) <= 200/);
  assert.match(sql, />= 10/);
  assert.match(sql, />= 50/);
  assert.match(sql, />= 20/);
  assert.match(sql, /jsonb_array_length\(p_slots\) between 1 and 40/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/schema.test.ts`
Expected: FAIL (file missing).

- [ ] **Step 3: Write `supabase/schema.sql`**

```sql
-- doitwithme friend sharing. Run this once in your Supabase project (SQL editor).
-- It creates the tables, the privacy rules (row-level security) and the few functions the planner calls.

create extension if not exists pgcrypto;

-- ---- Tables --------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now()
);

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  a uuid not null references public.profiles (id) on delete cascade,
  b uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (a < b),
  unique (a, b)
);

create table public.invites (
  code text primary key,
  owner uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days'
);

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  sender uuid not null references public.profiles (id) on delete cascade,
  recipient uuid not null references public.profiles (id) on delete cascade,
  purpose text not null check (purpose in ('study', 'hang', 'meeting')),
  from_date date not null,
  to_date date not null,
  minutes integer not null check (minutes between 15 and 720),
  note text not null default '' check (char_length(note) <= 200),
  status text not null default 'open' check (status in ('open', 'answered', 'declined')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  check (sender <> recipient)
);

create table public.answers (
  request_id uuid primary key references public.requests (id) on delete cascade,
  slots jsonb not null check (jsonb_typeof(slots) = 'array'),
  sent_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.connections enable row level security;
alter table public.invites enable row level security;
alter table public.requests enable row level security;
alter table public.answers enable row level security;

-- ---- Helpers -------------------------------------------------------------

create or replace function public.are_connected(x uuid, y uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.connections c where c.a = least(x, y) and c.b = greatest(x, y));
$$;

-- ---- Privacy rules -------------------------------------------------------

create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.are_connected(id, auth.uid()));
create policy profiles_update on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

create policy connections_select on public.connections for select
  using (auth.uid() in (a, b));
create policy connections_delete on public.connections for delete
  using (auth.uid() in (a, b));

create policy invites_select on public.invites for select
  using (owner = auth.uid());

create policy requests_select on public.requests for select
  using (auth.uid() in (sender, recipient));
create policy requests_insert on public.requests for insert
  with check (sender = auth.uid() and public.are_connected(sender, recipient));
create policy requests_delete on public.requests for delete
  using (sender = auth.uid());

create policy answers_select on public.answers for select
  using (exists (select 1 from public.requests r where r.id = request_id and auth.uid() in (r.sender, r.recipient)));

-- ---- Triggers ------------------------------------------------------------

-- A profile is made for every new account, with the name given at sign-up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'name', '')), 40), ''), left(split_part(new.email, '@', 1), 40)));
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Limits and fixed values for a new request: a browser cannot choose its own status, dates of birth or expiry.
create or replace function public.check_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.to_date < new.from_date or new.to_date - new.from_date >= 30 then raise exception 'share:range'; end if;
  if (select count(*) from public.requests where sender = new.sender and recipient = new.recipient and status = 'open' and expires_at > now()) >= 10 then raise exception 'share:limit'; end if;
  if (select count(*) from public.requests where sender = new.sender and created_at > now() - interval '1 day') >= 50 then raise exception 'share:limit'; end if;
  new.status := 'open';
  new.created_at := now();
  new.expires_at := now() + interval '7 days';
  return new;
end $$;
drop trigger if exists check_request_insert on public.requests;
create trigger check_request_insert before insert on public.requests for each row execute function public.check_request();

-- Disconnecting removes what passed between the two people.
create or replace function public.drop_between()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.requests where (sender = old.a and recipient = old.b) or (sender = old.b and recipient = old.a);
  return old;
end $$;
drop trigger if exists on_connection_deleted on public.connections;
create trigger on_connection_deleted after delete on public.connections for each row execute function public.drop_between();

-- ---- Functions the planner calls ----------------------------------------

create or replace function public.create_invite()
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); new_code text;
begin
  if me is null then raise exception 'share:auth'; end if;
  delete from public.invites where expires_at < now();
  if (select count(*) from public.invites where owner = me) >= 5 then raise exception 'share:limit'; end if;
  new_code := upper(encode(gen_random_bytes(5), 'hex'));
  insert into public.invites (code, owner) values (new_code, me);
  return new_code;
end $$;

create or replace function public.join_invite(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); inv public.invites%rowtype; cid uuid; lo uuid; hi uuid;
begin
  if me is null then raise exception 'share:auth'; end if;
  select * into inv from public.invites where code = upper(trim(p_code)) and expires_at > now();
  if not found or inv.owner = me then raise exception 'share:bad-code'; end if;
  lo := least(me, inv.owner);
  hi := greatest(me, inv.owner);
  if exists (select 1 from public.connections where a = lo and b = hi) then raise exception 'share:exists'; end if;
  if (select count(*) from public.connections where a = me or b = me) >= 20
     or (select count(*) from public.connections where a = inv.owner or b = inv.owner) >= 20 then
    raise exception 'share:limit';
  end if;
  insert into public.connections (a, b) values (lo, hi) returning id into cid;
  delete from public.invites where code = inv.code;
  return cid;
end $$;

create or replace function public.answer_request(p_request uuid, p_slots jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.requests%rowtype;
begin
  if me is null then raise exception 'share:auth'; end if;
  select * into r from public.requests where id = p_request and recipient = me and status = 'open' and expires_at > now() for update;
  if not found then raise exception 'share:gone'; end if;
  if jsonb_typeof(p_slots) <> 'array' or jsonb_array_length(p_slots) between 1 and 40 is not true then raise exception 'share:bad-slots'; end if;
  -- A slot is exactly date, start, end and kind: nothing else may travel.
  if exists (
    select 1 from jsonb_array_elements(p_slots) e
    where jsonb_typeof(e) <> 'object' or (select count(*) from jsonb_object_keys(e)) <> 4 or not (e ?& array['date', 'start', 'end', 'kind'])
  ) then raise exception 'share:bad-slots'; end if;
  insert into public.answers (request_id, slots) values (p_request, p_slots);
  update public.requests set status = 'answered' where id = p_request;
end $$;

create or replace function public.decline_request(p_request uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'share:auth'; end if;
  update public.requests set status = 'declined' where id = p_request and recipient = me and status = 'open';
  if not found then raise exception 'share:gone'; end if;
end $$;

-- Old requests (and with them their answers) go 30 days after the answer was sent or the request was made.
create or replace function public.cleanup_share()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.requests r
  where r.created_at < now() - interval '30 days'
     or exists (select 1 from public.answers a where a.request_id = r.id and a.sent_at < now() - interval '30 days');
  delete from public.invites where expires_at < now();
end $$;

-- ---- Who may call what ---------------------------------------------------

revoke all on function public.are_connected(uuid, uuid) from public, anon;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.check_request() from public, anon, authenticated;
revoke all on function public.drop_between() from public, anon, authenticated;
revoke all on function public.create_invite() from public, anon;
revoke all on function public.join_invite(text) from public, anon;
revoke all on function public.answer_request(uuid, jsonb) from public, anon;
revoke all on function public.decline_request(uuid) from public, anon;
revoke all on function public.cleanup_share() from public, anon;
grant execute on function public.are_connected(uuid, uuid) to authenticated;
grant execute on function public.create_invite() to authenticated;
grant execute on function public.join_invite(text) to authenticated;
grant execute on function public.answer_request(uuid, jsonb) to authenticated;
grant execute on function public.decline_request(uuid) to authenticated;
grant execute on function public.cleanup_share() to authenticated;
```

One detail to keep: `jsonb_array_length(p_slots) between 1 and 40 is not true` is how the file guards a NULL result; the static test expects the text `jsonb_array_length(p_slots) between 1 and 40`.

- [ ] **Step 4: Write `docs/supabase-setup.md`**

```markdown
# Friend sharing: Supabase setup

Friend sharing needs a free Supabase project. You do this once. It takes about ten minutes.

## 1. Make the project

1. Sign in at supabase.com and create a project (any name, any region near you). Wait until it says it is ready.
2. In the project, open **SQL Editor**, paste the whole of `supabase/schema.sql` from this folder, and press **Run**. It should say "Success". Running it twice gives "already exists" errors; that is fine.

## 2. Turn on the sign-in rules

In **Authentication**:

- **Providers, Email:** on. Turn on **Confirm email**.
- **Sign In / Providers, Password:** set the minimum length to 10.
- **URL Configuration, Site URL:** `http://localhost:8787` (the address the planner runs on). The links in the emails Supabase sends (confirm your account, reset your password) bring you back there.

## 3. Give the planner the two public values

In **Project Settings, API**, copy:

- **Project URL** (looks like `https://abcdefgh.supabase.co`)
- the **anon public** key (or the **publishable** key).

Start the planner with them (in a terminal, in the planner folder):

    export DOITWITHME_SUPABASE_URL="https://abcdefgh.supabase.co"
    export DOITWITHME_SUPABASE_KEY="the anon or publishable key"
    npm run serve

The server prints "Friend sharing is connected." when both are good.

**Never use the `service_role` key.** It skips every privacy rule. The planner only ever needs the public key, and nothing is stored in the repo.

## 4. Sign in and connect

1. Open Settings, then Friends. Choose **Create account** (name, email, password of at least 10 characters). Supabase emails you a link; open it, then come back and sign in.
2. **Invite a friend** shows a short code. Send it to them. They paste it under **Join with a code**.
3. Each friend appears with an **Ask** form: pick what you want to do (study together, hang out, meeting), the dates and how long, and press Ask.

## What leaves your computer

Only free times, and only after you press Send. Your events, titles, places and notes never leave. Supabase keeps your email, your display name, who you are connected to, requests and answers. Answers are deleted after 30 days.

## If something goes wrong

- "Friend sharing is not set up": the two values above are missing or wrong. The server does not print them back.
- "That email and password did not work": check both; use **Forgot password** to get a reset email.
- Emails take a minute and may land in spam. The free tier limits how many emails it sends per hour.

## Checking the privacy rules (optional, recommended once)

With three test accounts (confirmed by email), run:

    DOITWITHME_SUPABASE_URL=... DOITWITHME_SUPABASE_KEY=... RLS_USERS="a@example.com:pw1,b@example.com:pw2,c@example.com:pw3" node scripts/rls-check.ts

It connects A and B, then proves C cannot see, answer or remove what passes between them. It prints PASS or FAIL for each rule and leaves nothing behind. Use a throwaway project, not your real one.
```

- [ ] **Step 5: Write `scripts/rls-check.ts`**

```ts
// Run by hand against a throwaway Supabase project: node scripts/rls-check.ts (see docs/supabase-setup.md).
import { plausibleSupabase, supabaseService } from '../src/supabase.ts';
import { ShareServiceError } from '../src/shareservice.ts';

const url = process.env.DOITWITHME_SUPABASE_URL ?? '';
const key = process.env.DOITWITHME_SUPABASE_KEY ?? '';
const users = (process.env.RLS_USERS ?? '').split(',').map((u) => u.split(':')).filter((p) => p.length === 2);
if (!plausibleSupabase(url, key) || users.length !== 3) {
  console.log('Set DOITWITHME_SUPABASE_URL, DOITWITHME_SUPABASE_KEY and RLS_USERS="email:password,email:password,email:password".');
  process.exit(2);
}

const svc = supabaseService({ url, anonKey: key });
let failed = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed += 1;
};
const refused = async (p: Promise<unknown>) => {
  try { await p; return false; } catch (e) { return e instanceof ShareServiceError; }
};

const [a, b, c] = await Promise.all(users.map(([email, password]) => svc.signIn(email, password)));
const slot = { date: '2026-10-06', start: '10:00', end: '12:00', kind: 'free' as const };

// Start clean: remove any old friendship among the three.
for (const [who, s] of [[a, a], [b, b], [c, c]] as const) for (const f of await svc.friends(s)) await svc.disconnect(who, f.connectionId);

const code = await svc.createInvite(a);
const friendOfB = await svc.joinInvite(b, code);
check('B joins A with A\'s code', friendOfB.id === a.userId);
check('the same code cannot be used again', await refused(svc.joinInvite(c, code)));
check('C cannot ask A (not connected)', await refused(svc.createRequest(c, { to: a.userId, purpose: 'meeting', from: '2026-10-06', until: '2026-10-07', minutes: 60, note: '' })));

const req = await svc.createRequest(a, { to: b.userId, purpose: 'study', from: '2026-10-06', until: '2026-10-08', minutes: 60, note: 'secret note' });
check('C sees no requests between A and B', (await svc.requests(c)).every((r) => r.id !== req.id));
check('C cannot answer', await refused(svc.answer(c, req.id, [slot])));
check('C cannot decline', await refused(svc.decline(c, req.id)));
check('the sender cannot answer her own request', await refused(svc.answer(a, req.id, [slot])));
check('an answer with extra fields is refused', await refused(svc.answer(b, req.id, [{ ...slot, title: 'Dentist' } as any])));

await svc.answer(b, req.id, [slot]);
check('A sees B\'s answer', (await svc.requests(a)).find((r) => r.id === req.id)?.slots?.length === 1);
check('C still sees nothing', (await svc.requests(c)).every((r) => r.id !== req.id));
check('B cannot answer twice', await refused(svc.answer(b, req.id, [slot])));

const mine = (await svc.friends(a))[0];
await svc.disconnect(a, mine.connectionId);
check('disconnecting removes the requests between A and B', (await svc.requests(b)).every((r) => r.id !== req.id));

console.log(failed === 0 ? '\nAll rules hold.' : `\n${failed} rule(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 6: Run the static test**

Run: `node --test test/schema.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add supabase/schema.sql docs/supabase-setup.md scripts/rls-check.ts test/schema.test.ts
git commit -m "feat: database tables and privacy rules for friend sharing, setup guide, rules check"
```

- [ ] **Step 8 (the user, later, not the agent):** Apply `supabase/schema.sql` to a throwaway Supabase project and run `scripts/rls-check.ts`. The agent does not have accounts and must not try. Record in the report that this check is pending.

---

### Task 5: Server routes and request validation

**Files:**
- Create: `src/http.ts`, `src/shareapi.ts`
- Modify: `src/server.ts` (import `HttpError` from `src/http.ts`; `createApp` option `share`; call the share API; main reads the two environment variables), `src/validate.ts` (append validators)
- Test: `test/server.share.test.ts`, additions to `test/validate.test.ts`

**Interfaces:**
- Consumes: `ShareService`, `fakeShareService`, `Session` (Task 2); `loadShare`/`saveShare`/`sharePathFor` (Task 2); `slotsFor`, `overlap`, `checkAnswer`, `ShareError`, `Slot`, `PURPOSES`, `MAX_NOTE`, `MAX_SPAN_DAYS` (Task 1); `plausibleSupabase`, `supabaseService` (Task 3); `ValidationError` helpers in `src/validate.ts`.
- Produces: `class HttpError(status, message)` in `src/http.ts`; `createShareApi({service, statePath, load})` and `NOT_MINE` in `src/shareapi.ts`; validators `validateSignUp`, `validateSignIn`, `validateEmail`, `validateNewPassword`, `validateJoin`, `validateAsk`, `validateClockQuery`, `validateSlotsRequest`, `validateAnswerRequest`.

HTTP contract (all JSON; every route except `GET /api/share/status` answers 503 "Friend sharing is not set up. See docs/supabase-setup.md." when the service is unavailable, and 401 "You are not signed in." without a session):

| Route | Body / query | Reply |
|---|---|---|
| `GET /api/share/status` | | `{share: 'ready'|'unavailable', signedIn, email?}` |
| `POST /api/share/signup` | `{email, password, name}` | `{signedIn, message}` |
| `POST /api/share/signin` | `{email, password}` | `{signedIn: true}` |
| `POST /api/share/signout` | | `{signedIn: false}` |
| `POST /api/share/recover` | `{email}` | `{message}` |
| `POST /api/share/password` | `{token, password}` | `{message}` |
| `GET /api/friends` | | `{friends: [{connectionId, id, name}]}` |
| `POST /api/friends/invite` | | `{code}` |
| `POST /api/friends/join` | `{code}` | `{friend}` |
| `DELETE /api/friends/:connectionId` | | `{ok: true}` |
| `GET /api/share/requests?today=&nowMinutes=` | | `{incoming: [{id, friend, purpose, from, to, minutes, note}], outgoing: [{id, friend, purpose, from, to, minutes, status: 'open'|'answered'|'declined'|'expired', slots, together}]}` |
| `POST /api/share/requests` | `{to, purpose, from, until, minutes, note, today}` | `{id}` |
| `POST /api/share/requests/:id/slots` | `{today, nowMinutes?}` | `{slots}` |
| `POST /api/share/requests/:id/answer` | `{today, nowMinutes?, slots}` | `{ok: true}` |
| `POST /api/share/requests/:id/decline` | | `{ok: true}` |
| `POST /api/share/requests/:id/okay` | | `{ok: true}` |

- [ ] **Step 1: Write the failing validator tests**

Append to `test/validate.test.ts` (reuse its existing imports of `assert` and `test`; add the new imports at the top of the file):

```ts
import { validateAnswerRequest, validateAsk, validateClockQuery, validateJoin, validateNewPassword, validateSignIn, validateSignUp } from '../src/validate.ts';

test('sign-in and sign-up check the email, the 10-character password and the name', () => {
  assert.deepEqual(validateSignIn({ email: ' Ana@Example.com ', password: 'long-enough-1' }), { email: 'ana@example.com', password: 'long-enough-1' });
  assert.throws(() => validateSignIn({ email: 'not-an-email', password: 'long-enough-1' }), /email/);
  assert.throws(() => validateSignUp({ email: 'a@example.com', password: 'short', name: 'Ana' }), /10 characters/);
  assert.throws(() => validateSignUp({ email: 'a@example.com', password: 'long-enough-1', name: '' }), /name/);
  assert.equal(validateSignUp({ email: 'a@example.com', password: 'long-enough-1', name: ' Ana ' }).name, 'Ana');
  assert.throws(() => validateNewPassword({ token: 'tok', password: 'short' }), /10 characters/);
});

test('joining takes a code of letters and digits only', () => {
  assert.equal(validateJoin({ code: ' ab12cd34ef ' }).code, 'AB12CD34EF');
  assert.throws(() => validateJoin({ code: 'no spaces here' }), /code/);
});

test('asking checks purpose, dates (not past, at most 30 days), length and note', () => {
  const ok = { to: 'u2', purpose: 'study', from: '2026-10-06', until: '2026-10-08', minutes: 120, note: 'Library?', today: '2026-10-05' };
  assert.deepEqual(validateAsk(ok), { to: 'u2', purpose: 'study', from: '2026-10-06', until: '2026-10-08', minutes: 120, note: 'Library?', today: '2026-10-05' });
  assert.equal(validateAsk({ ...ok, note: undefined }).note, '');
  assert.throws(() => validateAsk({ ...ok, purpose: 'party' }), /purpose/);
  assert.throws(() => validateAsk({ ...ok, from: '2026-10-04' }), /past/);
  assert.throws(() => validateAsk({ ...ok, until: '2026-10-05' }), /before/);
  assert.throws(() => validateAsk({ ...ok, until: '2026-11-20' }), /30 days/);
  assert.throws(() => validateAsk({ ...ok, minutes: 5 }), /minutes/);
  assert.throws(() => validateAsk({ ...ok, note: 'x'.repeat(201) }), /note/);
});

test('the clock query needs a real date; the answer needs a list of slots', () => {
  assert.deepEqual(validateClockQuery(new URLSearchParams('today=2026-10-05&nowMinutes=420')), { today: '2026-10-05', nowMinutes: 420, horizonDays: 14 });
  assert.throws(() => validateClockQuery(new URLSearchParams('today=nope')), /today/);
  assert.equal(validateAnswerRequest({ today: '2026-10-05', slots: [] }).slots.length, 0);
  assert.throws(() => validateAnswerRequest({ today: '2026-10-05' }), /slots/);
});
```

- [ ] **Step 2: Append the validators to `src/validate.ts`**

```ts
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailOf(v: unknown): string {
  const e = str(v, 'email', 200).trim().toLowerCase();
  if (!EMAIL.test(e)) fail('email must look like name@example.com');
  return e;
}

function passwordOf(v: unknown): string {
  // Not trimmed: spaces are part of a password.
  if (typeof v !== 'string' || v.length < 10 || v.length > 200) fail('password must be at least 10 characters');
  return v as string;
}

export function validateEmail(x: unknown): { email: string } {
  return { email: emailOf(obj(x, 'request').email) };
}

export function validateSignIn(x: unknown): { email: string; password: string } {
  const o = obj(x, 'request');
  // Signing in does not enforce the length: an older, shorter password must still be able to try.
  if (typeof o.password !== 'string' || o.password.length === 0 || o.password.length > 200) fail('password is required');
  return { email: emailOf(o.email), password: o.password as string };
}

export function validateSignUp(x: unknown): { email: string; password: string; name: string } {
  const o = obj(x, 'request');
  return { email: emailOf(o.email), password: passwordOf(o.password), name: str(o.name, 'name', 40).trim() || fail('name must not be empty') };
}

export function validateNewPassword(x: unknown): { token: string; password: string } {
  const o = obj(x, 'request');
  return { token: str(o.token, 'token', 4000), password: passwordOf(o.password) };
}

export function validateJoin(x: unknown): { code: string } {
  const code = str(obj(x, 'request').code, 'code', 40).trim().toUpperCase();
  if (!/^[A-Z0-9]{4,20}$/.test(code)) fail('code can only hold letters and digits');
  return { code };
}

export function validateAsk(x: unknown): { to: string; purpose: 'study' | 'hang' | 'meeting'; from: string; until: string; minutes: number; note: string; today: string } {
  const o = obj(x, 'request');
  const purpose = o.purpose;
  if (purpose !== 'study' && purpose !== 'hang' && purpose !== 'meeting') fail('purpose must be study, hang or meeting');
  const today = dateStr(o.today, 'today');
  const from = dateStr(o.from, 'from');
  const until = dateStr(o.until, 'until');
  if (from < today) fail('from must not be in the past');
  if (until < from) fail('until must not be before from');
  if ((Date.parse(`${until}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 >= 30) fail('a request covers at most 30 days');
  const note = o.note === undefined || o.note === '' ? '' : str(o.note, 'note', 200).trim();
  return { to: str(o.to, 'to', 80), purpose: purpose as 'study' | 'hang' | 'meeting', from, until, minutes: int(o.minutes, 'minutes', 15, 720), note, today };
}

export function validateClockQuery(q: URLSearchParams): { today: string; nowMinutes?: number; horizonDays: number } {
  const now = q.get('nowMinutes');
  return replanFields({ today: q.get('today') ?? undefined, ...(now === null ? {} : { nowMinutes: Number(now) }) });
}

export function validateSlotsRequest(x: unknown): { today: string; nowMinutes?: number; horizonDays: number } {
  return replanFields(obj(x, 'request'));
}

export function validateAnswerRequest(x: unknown): { today: string; nowMinutes?: number; horizonDays: number; slots: unknown[] } {
  const o = obj(x, 'request');
  return { ...replanFields(o), slots: arr(o.slots, 'slots') };
}
```

Note `str(...).trim() || fail(...)`: `fail` returns `never`, so the expression type is `string`. If TypeScript stripping complains about the `||` form, split it into two statements.

- [ ] **Step 3: Run the validator tests**

Run: `node --test test/validate.test.ts`
Expected: PASS (existing tests plus 5 new). Fix only the new validators if one fails.

- [ ] **Step 4: Move `HttpError` to `src/http.ts`**

Create `src/http.ts`:

```ts
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
```

In `src/server.ts` delete the local `class HttpError` and add `import { HttpError } from './http.ts';`. Run `node --test test/server.test.ts test/server.chat.test.ts` and expect PASS (a pure move).

- [ ] **Step 5: Write the failing server tests**

Create `test/server.share.test.ts`:

```ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/server.ts';
import { fakeShareService, unavailableShare } from '../src/shareservice.ts';
import { sharePathFor } from '../src/sharestore.ts';
import { emptyState, saveState } from '../src/store.ts';
import { defaultPreferences } from '../src/defaults.ts';

const json = { 'content-type': 'application/json' };
const servers: Server[] = [];
const { service, add } = fakeShareService();

// Two people, two planners, one fake Supabase.
async function start(name: string, share = service) {
  const dir = mkdtempSync(join(tmpdir(), 'doitwithme-share-api-'));
  const file = join(dir, 'db.json');
  const state = { ...emptyState(), preferences: { ...structuredClone(defaultPreferences), weekdayWindow: { start: 480, end: 1320 }, daysOff: [] } };
  saveState(file, state);
  const server = createApp(file, { share });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, file };
}
type App = Awaited<ReturnType<typeof start>>;
const call = (app: App, method: string, path: string, body?: unknown) =>
  fetch(`${app.base}${path}`, { method, headers: body === undefined ? {} : json, body: body === undefined ? undefined : JSON.stringify(body) });
const ok = async (p: Promise<Response>) => { const r = await p; const b = await r.json(); assert.equal(r.status, 200, JSON.stringify(b)); return b; };

let ana: App; let ben: App; let off: App;
before(async () => {
  ana = await start('ana'); ben = await start('ben'); off = await start('off', unavailableShare);
  await add('ana@example.com', 'Ana'); await add('ben@example.com', 'Ben');
  await ok(call(ana, 'POST', '/api/share/signin', { email: 'ana@example.com', password: 'long-enough-1' }));
  await ok(call(ben, 'POST', '/api/share/signin', { email: 'ben@example.com', password: 'long-enough-1' }));
  const { code } = await ok(call(ana, 'POST', '/api/friends/invite'));
  await ok(call(ben, 'POST', '/api/friends/join', { code }));
});
after(() => servers.forEach((s) => s.close()));

const clock = { today: '2026-10-05', nowMinutes: 420 };

test('status says whether sharing is set up and whether someone is signed in', async () => {
  assert.deepEqual(await ok(call(off, 'GET', '/api/share/status')), { share: 'unavailable', signedIn: false });
  assert.deepEqual(await ok(call(ana, 'GET', '/api/share/status')), { share: 'ready', signedIn: true, email: 'ana@example.com' });
});

test('when sharing is not set up, every other route says so', async () => {
  const r = await call(off, 'GET', '/api/friends');
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /not set up.*supabase-setup/);
});

test('signed out, the routes answer 401 with a sentence; a wrong password is refused without echoing it', async () => {
  const fresh = await start('fresh');
  const r = await call(fresh, 'GET', '/api/friends');
  assert.equal(r.status, 401);
  assert.match((await r.json()).error, /not signed in/);
  const bad = await call(fresh, 'POST', '/api/share/signin', { email: 'ana@example.com', password: 'wrong-password-1' });
  assert.equal(bad.status, 400);
  assert.doesNotMatch(JSON.stringify(await bad.json()), /wrong-password-1/);
  assert.equal(existsSync(sharePathFor(fresh.file)), false);
});

test('signing in saves a private session file the browser never sees', async () => {
  const text = readFileSync(sharePathFor(ana.file), 'utf8');
  assert.match(text, /accessToken/);
  assert.equal(statSync(sharePathFor(ana.file)).mode & 0o777, 0o600);
  const status = JSON.stringify(await ok(call(ana, 'GET', '/api/share/status')));
  assert.doesNotMatch(status, /tok-|ref-/);
});

test('friends lists the other person by name', async () => {
  assert.deepEqual((await ok(call(ana, 'GET', '/api/friends'))).friends.map((f: any) => f.name), ['Ben']);
  assert.deepEqual((await ok(call(ben, 'GET', '/api/friends'))).friends.map((f: any) => f.name), ['Ana']);
});

let requestId = '';
test('Ana asks Ben; Ben sees it with Ana\'s name; the times he is offered come from his own week', async () => {
  const friend = (await ok(call(ana, 'GET', '/api/friends'))).friends[0];
  const made = await ok(call(ana, 'POST', '/api/share/requests', { to: friend.id, purpose: 'meeting', from: '2026-10-06', until: '2026-10-07', minutes: 60, note: 'Coffee?', today: '2026-10-05' }));
  requestId = made.id;
  const seen = await ok(call(ben, 'GET', '/api/share/requests?today=2026-10-05&nowMinutes=420'));
  assert.deepEqual(seen.incoming.map((r: any) => [r.id, r.friend, r.purpose, r.note]), [[requestId, 'Ana', 'meeting', 'Coffee?']]);
  const { slots } = await ok(call(ben, 'POST', `/api/share/requests/${requestId}/slots`, clock));
  assert.deepEqual(slots.map((s: any) => [s.date, s.start, s.end, s.kind]), [['2026-10-06', '08:00', '22:00', 'free'], ['2026-10-07', '08:00', '22:00', 'free']]);
});

test('Ben cannot send times the server did not offer; the extra fields never travel', async () => {
  const bad = await call(ben, 'POST', `/api/share/requests/${requestId}/answer`, { ...clock, slots: [{ date: '2026-10-06', start: '03:00', end: '22:00', kind: 'free' }] });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /changed/);
  const empty = await call(ben, 'POST', `/api/share/requests/${requestId}/answer`, { ...clock, slots: [] });
  assert.equal(empty.status, 400);
});

test('Ben answers with one slot; Ana sees it and the overlap with her own week; Okay hides it', async () => {
  await ok(call(ben, 'POST', `/api/share/requests/${requestId}/answer`, { ...clock, slots: [{ date: '2026-10-06', start: '08:00', end: '22:00', kind: 'free', title: 'Dentist' }] }));
  const mine = await ok(call(ana, 'GET', '/api/share/requests?today=2026-10-05&nowMinutes=420'));
  const out = mine.outgoing.find((r: any) => r.id === requestId);
  assert.equal(out.status, 'answered');
  assert.equal(out.friend, 'Ben');
  assert.deepEqual(out.slots, [{ date: '2026-10-06', start: '08:00', end: '22:00', kind: 'free' }]);
  assert.deepEqual(out.together, [{ date: '2026-10-06', start: '08:00', end: '22:00', kind: 'free' }]);
  assert.deepEqual((await ok(call(ben, 'GET', '/api/share/requests?today=2026-10-05'))).incoming, []);
  await ok(call(ana, 'POST', `/api/share/requests/${requestId}/okay`));
  assert.equal((await ok(call(ana, 'GET', '/api/share/requests?today=2026-10-05'))).outgoing.some((r: any) => r.id === requestId), false);
});

test('declining is visible to the asker', async () => {
  const friend = (await ok(call(ana, 'GET', '/api/friends'))).friends[0];
  const { id } = await ok(call(ana, 'POST', '/api/share/requests', { to: friend.id, purpose: 'hang', from: '2026-10-06', until: '2026-10-06', minutes: 60, today: '2026-10-05' }));
  await ok(call(ben, 'POST', `/api/share/requests/${id}/decline`));
  const out = (await ok(call(ana, 'GET', '/api/share/requests?today=2026-10-05'))).outgoing.find((r: any) => r.id === id);
  assert.equal(out.status, 'declined');
});

test('bad input is refused with a sentence and nothing is created', async () => {
  const friend = (await ok(call(ana, 'GET', '/api/friends'))).friends[0];
  const r = await call(ana, 'POST', '/api/share/requests', { to: friend.id, purpose: 'party', from: '2026-10-06', until: '2026-10-06', minutes: 60, today: '2026-10-05' });
  assert.equal(r.status, 400);
  assert.equal((await call(ana, 'POST', '/api/friends/join', { code: 'nope nope' })).status, 400);
  assert.equal((await call(ana, 'POST', '/api/friends/join', { code: 'ZZZZZZZZ' })).status, 400);
});

test('signing out forgets the session; disconnecting removes the friend', async () => {
  const friend = (await ok(call(ana, 'GET', '/api/friends'))).friends[0];
  await ok(call(ana, 'DELETE', `/api/friends/${friend.connectionId}`));
  assert.deepEqual((await ok(call(ben, 'GET', '/api/friends'))).friends, []);
  assert.deepEqual(await ok(call(ana, 'POST', '/api/share/signout')), { signedIn: false });
  assert.equal((await call(ana, 'GET', '/api/friends')).status, 401);
});

test('signing up without email confirmation signs in; a short password is refused', async () => {
  const fresh = await start('signup');
  assert.equal((await call(fresh, 'POST', '/api/share/signup', { email: 'x@example.com', password: 'short', name: 'X' })).status, 400);
  assert.deepEqual(await ok(call(fresh, 'POST', '/api/share/signup', { email: 'x@example.com', password: 'long-enough-1', name: 'X' })), { signedIn: true, message: '' });
});
```

- [ ] **Step 6: Run to verify they fail**

Run: `node --test test/server.share.test.ts`
Expected: FAIL (no `share` option, routes missing).

- [ ] **Step 7: Write `src/shareapi.ts`**

```ts
import { HttpError } from './http.ts';
import { ShareError, checkAnswer, overlap, slotsFor } from './share.ts';
import type { Slot } from './share.ts';
import { ShareServiceError } from './shareservice.ts';
import type { RequestRow, Session, ShareService } from './shareservice.ts';
import { loadShare, saveShare, sharePathFor } from './sharestore.ts';
import type { State } from './types.ts';
import {
  validateAnswerRequest, validateAsk, validateClockQuery, validateEmail, validateJoin, validateNewPassword, validateSignIn, validateSignUp, validateSlotsRequest,
} from './validate.ts';

export const NOT_MINE = Symbol('not-mine');

const NOT_SET_UP = 'Friend sharing is not set up. See docs/supabase-setup.md.';
const SIGNED_OUT = 'You are not signed in.';
const STATUS: Record<ShareServiceError['code'], number> = {
  offline: 502, slow: 502, server: 502, rejected: 400, auth: 401, exists: 400, 'bad-code': 400, limit: 429, weak: 400, 'not-connected': 400, range: 400,
};

const asHttp = (e: unknown): unknown =>
  e instanceof ShareServiceError ? new HttpError(STATUS[e.code], e.message) : e instanceof ShareError ? new HttpError(400, e.message) : e;

export function createShareApi(deps: { service: ShareService; statePath: string; load: () => State }) {
  const { service } = deps;
  const path = sharePathFor(deps.statePath);
  let renewing: Promise<Session> | null = null;

  async function renew(old: Session): Promise<Session> {
    renewing ??= (async () => {
      try {
        const next = await service.refresh(old);
        saveShare(path, { ...loadShare(path), session: next });
        return next;
      } catch {
        saveShare(path, { ...loadShare(path), session: null });
        throw new HttpError(401, SIGNED_OUT);
      } finally {
        renewing = null;
      }
    })();
    return renewing;
  }

  async function current(): Promise<Session> {
    const { session } = loadShare(path);
    if (!session) throw new HttpError(401, SIGNED_OUT);
    return session.expiresAt - Date.now() > 60_000 ? session : renew(session);
  }

  // One retry with a fresh session when the service says the token is no longer good.
  async function authed<T>(fn: (s: Session) => Promise<T>): Promise<T> {
    let s = await current();
    try {
      return await fn(s);
    } catch (e) {
      if (e instanceof ShareServiceError && e.code === 'auth') {
        s = await renew(s);
        try {
          return await fn(s);
        } catch (e2) {
          throw asHttp(e2);
        }
      }
      throw asHttp(e);
    }
  }

  const expired = (r: RequestRow) => r.status === 'open' && Date.parse(r.expiresAt) <= Date.now();

  async function names(s: Session): Promise<Map<string, string>> {
    return new Map((await service.friends(s)).map((f) => [f.id, f.name]));
  }

  // What this person can offer for a request; the same call that checks an answer, so the browser can never widen it.
  function offered(row: RequestRow, clock: { today: string; nowMinutes?: number }): Slot[] {
    try {
      return slotsFor(deps.load(), row.purpose, row.from, row.to, row.minutes, clock.today, clock.nowMinutes);
    } catch (e) {
      throw asHttp(e);
    }
  }

  async function myOpenRequest(s: Session, id: string): Promise<RequestRow> {
    const row = (await service.requests(s)).find((r) => r.id === id && r.recipientId === s.userId && r.status === 'open' && !expired(r));
    if (!row) throw new HttpError(404, 'That request is no longer open.');
    return row;
  }

  return async function handle(method: string, pathname: string, query: URLSearchParams, body: () => Promise<unknown>): Promise<unknown> {
    if (!pathname.startsWith('/api/share/') && !pathname.startsWith('/api/friends')) return NOT_MINE;
    if (method === 'GET' && pathname === '/api/share/status') {
      if (service.status !== 'ready') return { share: 'unavailable', signedIn: false };
      const { session } = loadShare(path);
      return session ? { share: 'ready', signedIn: true, email: session.email } : { share: 'ready', signedIn: false };
    }
    if (service.status !== 'ready') throw new HttpError(503, NOT_SET_UP);

    try {
      if (method === 'POST' && pathname === '/api/share/signup') {
        const r = validateSignUp(await body());
        const session = await service.signUp(r.email, r.password, r.name);
        if (!session) return { signedIn: false, message: 'Check your email to confirm your account, then sign in.' };
        saveShare(path, { ...loadShare(path), session });
        return { signedIn: true, message: '' };
      }
      if (method === 'POST' && pathname === '/api/share/signin') {
        const r = validateSignIn(await body());
        const session = await service.signIn(r.email, r.password);
        saveShare(path, { ...loadShare(path), session });
        return { signedIn: true };
      }
      if (method === 'POST' && pathname === '/api/share/signout') {
        saveShare(path, { ...loadShare(path), session: null });
        return { signedIn: false };
      }
      if (method === 'POST' && pathname === '/api/share/recover') {
        await service.recover(validateEmail(await body()).email);
        return { message: 'If that email has an account, a reset link is on its way.' };
      }
      if (method === 'POST' && pathname === '/api/share/password') {
        const r = validateNewPassword(await body());
        await service.setPassword(r.token, r.password);
        return { message: 'Your password is changed. Sign in with it.' };
      }

      if (method === 'GET' && pathname === '/api/friends') return { friends: await authed((s) => service.friends(s)) };
      if (method === 'POST' && pathname === '/api/friends/invite') return { code: await authed((s) => service.createInvite(s)) };
      if (method === 'POST' && pathname === '/api/friends/join') {
        const r = validateJoin(await body());
        return { friend: await authed((s) => service.joinInvite(s, r.code)) };
      }
      const drop = /^\/api\/friends\/([A-Za-z0-9-]{1,60})$/.exec(pathname);
      if (method === 'DELETE' && drop) {
        await authed((s) => service.disconnect(s, drop[1]));
        return { ok: true };
      }

      if (method === 'GET' && pathname === '/api/share/requests') {
        const clock = validateClockQuery(query);
        return await authed(async (s) => {
          const [rows, who] = await Promise.all([service.requests(s), names(s)]);
          const okayed = new Set(loadShare(path).okayed);
          const nameOf = (id: string) => who.get(id) ?? 'A friend';
          const incoming = rows
            .filter((r) => r.recipientId === s.userId && r.status === 'open' && !expired(r))
            .map((r) => ({ id: r.id, friend: nameOf(r.senderId), purpose: r.purpose, from: r.from, to: r.to, minutes: r.minutes, note: r.note }));
          const outgoing = rows
            .filter((r) => r.senderId === s.userId && !okayed.has(r.id))
            .map((r) => {
              const theirs = r.slots ?? [];
              let together: Slot[] = [];
              if (r.status === 'answered') {
                try {
                  together = overlap(slotsFor(deps.load(), r.purpose, r.from, r.to, r.minutes, clock.today, clock.nowMinutes), theirs, r.minutes);
                } catch {
                  together = [];
                }
              }
              return {
                id: r.id, friend: nameOf(r.recipientId), purpose: r.purpose, from: r.from, to: r.to, minutes: r.minutes,
                status: expired(r) ? 'expired' : r.status, slots: theirs, together,
              };
            });
          return { incoming, outgoing };
        });
      }
      if (method === 'POST' && pathname === '/api/share/requests') {
        const r = validateAsk(await body());
        const row = await authed((s) => service.createRequest(s, { to: r.to, purpose: r.purpose, from: r.from, until: r.until, minutes: r.minutes, note: r.note }));
        return { id: row.id };
      }

      const one = /^\/api\/share\/requests\/([A-Za-z0-9-]{1,60})\/(slots|answer|decline|okay)$/.exec(pathname);
      if (method === 'POST' && one) {
        const [, id, action] = one;
        if (action === 'slots') {
          const clock = validateSlotsRequest(await body());
          return await authed(async (s) => ({ slots: offered(await myOpenRequest(s, id), clock) }));
        }
        if (action === 'answer') {
          const r = validateAnswerRequest(await body());
          return await authed(async (s) => {
            const row = await myOpenRequest(s, id);
            await service.answer(s, id, checkAnswer(offered(row, r), r.slots));
            return { ok: true };
          });
        }
        if (action === 'decline') {
          await authed((s) => service.decline(s, id));
          return { ok: true };
        }
        const file = loadShare(path);
        if (!file.okayed.includes(id)) saveShare(path, { ...file, okayed: [...file.okayed, id] });
        return { ok: true };
      }
    } catch (e) {
      throw asHttp(e);
    }
    return NOT_MINE;
  };
}

```

- [ ] **Step 8: Wire it into `src/server.ts`**

Edits (each is small):

1. Imports: `import { NOT_MINE, createShareApi } from './shareapi.ts';`, `import { unavailableShare } from './shareservice.ts';`, `import type { ShareService } from './shareservice.ts';`, `import { plausibleSupabase, supabaseService } from './supabase.ts';`.
2. `createApp` options type gains `share?: ShareService`. After `const chatPath = ...` add:
   ```ts
   const shareApi = createShareApi({ service: options.share ?? unavailableShare, statePath, load: () => loadState(statePath) });
   ```
3. In the request handler change `const { pathname } = new URL(...)` to `const { pathname, searchParams } = new URL(req.url ?? '/', 'http://localhost');` and, immediately after the host check and before the `GET /api/state` route, add:
   ```ts
   if (pathname.startsWith('/api/share/') || pathname.startsWith('/api/friends')) {
     const out = await shareApi(req.method ?? 'GET', pathname, searchParams, () => readJson(req));
     if (out !== NOT_MINE) return send(res, 200, out);
   }
   ```
4. In `main`, after the AI lines, add:
   ```ts
   const sbUrl = (process.env.DOITWITHME_SUPABASE_URL ?? '').trim();
   const sbKey = (process.env.DOITWITHME_SUPABASE_KEY ?? '').trim();
   const sbSet = sbUrl !== '' || sbKey !== '';
   const sbOk = plausibleSupabase(sbUrl, sbKey);
   if (sbSet && !sbOk) console.log('DOITWITHME_SUPABASE_URL or DOITWITHME_SUPABASE_KEY does not look right. Friend sharing is not connected.');
   ```
   pass `...(sbOk ? { share: supabaseService({ url: sbUrl, anonKey: sbKey }) } : {})` into `createApp(...)`, and print `console.log(sbOk ? 'Friend sharing is connected.' : 'Friend sharing is not connected (no DOITWITHME_SUPABASE_URL and DOITWITHME_SUPABASE_KEY).');` with the other status lines. Never print either value.

- [ ] **Step 9: Run the server tests and the neighbours**

Run: `node --test test/server.share.test.ts test/server.test.ts test/server.chat.test.ts test/validate.test.ts`
Expected: PASS. If the `slots` expectation fails because `replanCore` adds travel or blocks to an empty state, print the real slots with a one-off `node -e` and fix the TEST's expected list only if the real result is also correct by the purpose rules.

- [ ] **Step 10: Commit**

```bash
git add src/http.ts src/shareapi.ts src/server.ts src/validate.ts test/server.share.test.ts test/validate.test.ts
git commit -m "feat: the friend sharing routes, with every answer checked against what the server offered"
```

---

### Task 6: The browser API, the view helpers, and Friends in Settings

**Files:**
- Modify: `public/js/api.js`, `public/js/settings.js`, `public/js/main.js`, `public/css/app.css`
- Create: `public/js/friends-model.js`, `public/js/friends.js`
- Test: `test/frontend/friends-model.test.ts`, `test/frontend/friends.test.ts`, additions to `test/frontend/api.test.ts`

**Interfaces:**
- Consumes: the HTTP contract of Task 5; `time.js` (`WEEKDAYS`, `weekdayOf`); `h`/`clear` from `createDom`.
- Produces:
  - `api.js`: `shareStatus()`, `shareSignUp(body)`, `shareSignIn(body)`, `shareSignOut()`, `shareRecover(email)`, `sharePassword(token, password)`, `friends()`, `invite()`, `join(code)`, `disconnect(connectionId)`, `shareRequests(clock)`, `shareSlots(id, clock)`, `shareAsk(body)`, `shareAnswer(id, clock, slots)`, `shareDecline(id)`, `shareOkay(id)`.
  - `friends-model.js`: `PURPOSES` (`[{value, label, words}]`), `purposeWords(p)`, `rangeLine(from, to)`, `lengthLine(minutes)`, `requestLine(r)`, `slotLine(s)`, `answerLines(o)` returning `{headline, slots: string[], together: string[], togetherLine}`.
  - `friends.js`: `createFriends(dom, {api, getClock, onSignedInChange, recoveryToken})` returning `{element(), refresh()}`. `element()` returns one persistent container and starts the first refresh.
  - `settings.js`: a row `{id: 'friends', group: 'friends', title: 'Friends', friends: true}` rendered from `deps.friends.element()`.

- [ ] **Step 1: Write the failing model tests**

`test/frontend/friends-model.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PURPOSES, answerLines, lengthLine, purposeWords, rangeLine, requestLine, slotLine } from '../../public/js/friends-model.js';

test('purposes are the three the spec names, with plain words', () => {
  assert.deepEqual(PURPOSES.map((p) => p.value), ['study', 'hang', 'meeting']);
  assert.deepEqual(['study', 'hang', 'meeting'].map(purposeWords), ['study together', 'hang out', 'meet']);
});

test('ranges, lengths and slots read as a person would say them', () => {
  assert.equal(rangeLine('2026-10-20', '2026-10-24'), 'Tue 20 to Sat 24');
  assert.equal(rangeLine('2026-10-20', '2026-10-20'), 'Tue 20');
  assert.deepEqual([60, 90, 120].map(lengthLine), ['1 h', '90 min', '2 h']);
  assert.equal(slotLine({ date: '2026-10-21', start: '18:00', end: '20:00', kind: 'study' }), 'Wed 21, 18:00 to 20:00 (study block)');
  assert.equal(slotLine({ date: '2026-10-21', start: '18:00', end: '20:00', kind: 'free' }), 'Wed 21, 18:00 to 20:00');
});

test('an incoming request names the friend, the purpose, the length and the dates', () => {
  assert.equal(requestLine({ friend: 'Ana', purpose: 'study', minutes: 120, from: '2026-10-19', to: '2026-10-23' }), 'Ana asks when you can study together for 2 h, Mon 19 to Fri 23.');
});

test('an answer lists what the friend offered and what is free for both', () => {
  const o = { friend: 'Ana', purpose: 'hang', minutes: 60, status: 'answered', slots: [{ date: '2026-10-21', start: '18:00', end: '22:00', kind: 'free' }], together: [{ date: '2026-10-21', start: '19:00', end: '22:00', kind: 'free' }] };
  const a = answerLines(o);
  assert.equal(a.headline, 'Ana can hang out for 1 h:');
  assert.deepEqual(a.slots, ['Wed 21, 18:00 to 22:00']);
  assert.equal(a.togetherLine, 'You are free too:');
  assert.deepEqual(a.together, ['Wed 21, 19:00 to 22:00']);
  const none = answerLines({ ...o, together: [] });
  assert.equal(none.togetherLine, 'None of those fit your week.');
  assert.equal(answerLines({ ...o, status: 'declined', slots: [] }).headline, 'Ana cannot this time.');
  assert.equal(answerLines({ ...o, status: 'expired', slots: [] }).headline, 'Ana did not answer in time.');
});
```

- [ ] **Step 2: Write `public/js/friends-model.js`**

```js
import { WEEKDAYS, weekdayOf } from './time.js';

export const PURPOSES = [
  { value: 'study', label: 'Study together', words: 'study together' },
  { value: 'hang', label: 'Hang out', words: 'hang out' },
  { value: 'meeting', label: 'Meeting', words: 'meet' },
];

export const purposeWords = (p) => (PURPOSES.find((x) => x.value === p) ?? PURPOSES[2]).words;

const day = (d) => `${WEEKDAYS[weekdayOf(d)]} ${Number(d.slice(8))}`;

export const rangeLine = (from, to) => (from === to ? day(from) : `${day(from)} to ${day(to)}`);

export const lengthLine = (m) => (m % 60 === 0 ? `${m / 60} h` : `${m} min`);

export const requestLine = (r) => `${r.friend} asks when you can ${purposeWords(r.purpose)} for ${lengthLine(r.minutes)}, ${rangeLine(r.from, r.to)}.`;

export const slotLine = (s) => `${day(s.date)}, ${s.start} to ${s.end}${s.kind === 'study' ? ' (study block)' : ''}`;

// Lines for an answer Nudge shows the asker. Names and text come from other people: callers set them as plain text.
export function answerLines(o) {
  if (o.status === 'declined') return { headline: `${o.friend} cannot this time.`, slots: [], together: [], togetherLine: '' };
  if (o.status === 'expired') return { headline: `${o.friend} did not answer in time.`, slots: [], together: [], togetherLine: '' };
  const shown = (list) => list.slice(0, 6).map(slotLine);
  return {
    headline: `${o.friend} can ${purposeWords(o.purpose)} for ${lengthLine(o.minutes)}:`,
    slots: shown(o.slots),
    together: shown(o.together),
    togetherLine: o.together.length > 0 ? 'You are free too:' : 'None of those fit your week.',
  };
}
```

- [ ] **Step 3: Run the model tests**

Run: `node --test test/frontend/friends-model.test.ts`
Expected: PASS (4 tests). If `rangeLine('2026-10-20', ...)` weekday text differs (2026-10-20 is a Tuesday, 2026-10-24 a Saturday), fix the test's date arithmetic only after confirming with `node -e`.

- [ ] **Step 4: Add the API methods and their test**

In `public/js/api.js` add inside the returned object (after `clearChatHistory`):

```js
    shareStatus: () => call('GET', '/api/share/status'),
    shareSignUp: (body) => call('POST', '/api/share/signup', body),
    shareSignIn: (body) => call('POST', '/api/share/signin', body),
    shareSignOut: () => call('POST', '/api/share/signout', {}),
    shareRecover: (email) => call('POST', '/api/share/recover', { email }),
    sharePassword: (token, password) => call('POST', '/api/share/password', { token, password }),
    friends: () => call('GET', '/api/friends'),
    invite: () => call('POST', '/api/friends/invite', {}),
    join: (code) => call('POST', '/api/friends/join', { code }),
    disconnect: (connectionId) => call('DELETE', `/api/friends/${encodeURIComponent(connectionId)}`),
    shareRequests: (clock) => call('GET', `/api/share/requests?today=${clock.today}${clock.nowMinutes === undefined ? '' : `&nowMinutes=${clock.nowMinutes}`}`),
    shareSlots: (id, clock) => call('POST', `/api/share/requests/${encodeURIComponent(id)}/slots`, { today: clock.today, ...(clock.nowMinutes === undefined ? {} : { nowMinutes: clock.nowMinutes }) }),
    shareAsk: (body) => call('POST', '/api/share/requests', body),
    shareAnswer: (id, clock, slots) => call('POST', `/api/share/requests/${encodeURIComponent(id)}/answer`, { today: clock.today, ...(clock.nowMinutes === undefined ? {} : { nowMinutes: clock.nowMinutes }), slots }),
    shareDecline: (id) => call('POST', `/api/share/requests/${encodeURIComponent(id)}/decline`, {}),
    shareOkay: (id) => call('POST', `/api/share/requests/${encodeURIComponent(id)}/okay`, {}),
```

Append to `test/frontend/api.test.ts` (follow that file's existing style for a fake `fetch` that records `(path, init)`; if it already has a helper, reuse it):

```ts
test('the friend sharing calls use the right paths, methods and bodies', async () => {
  const seen: any[] = [];
  const api = createApi((async (path: string, init: any) => { seen.push([init.method, path, init.body ? JSON.parse(init.body) : undefined]); return { ok: true, status: 200, json: async () => ({}) }; }) as any);
  await api.shareSignIn({ email: 'a@example.com', password: 'p' });
  await api.shareRequests({ today: '2026-10-05', nowMinutes: 420 });
  await api.shareAnswer('r 1', { today: '2026-10-05' }, [{ date: '2026-10-06', start: '10:00', end: '12:00', kind: 'free' }]);
  await api.disconnect('c1');
  assert.deepEqual(seen, [
    ['POST', '/api/share/signin', { email: 'a@example.com', password: 'p' }],
    ['GET', '/api/share/requests?today=2026-10-05&nowMinutes=420', undefined],
    ['POST', '/api/share/requests/r%201/answer', { today: '2026-10-05', slots: [{ date: '2026-10-06', start: '10:00', end: '12:00', kind: 'free' }] }],
    ['DELETE', '/api/friends/c1', undefined],
  ]);
});
```

Run: `node --test test/frontend/api.test.ts` (PASS).

- [ ] **Step 5: Write the failing Friends UI tests**

`test/frontend/friends.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDom } from '../../public/js/dom.js';
import { createFriends } from '../../public/js/friends.js';
import { FakeDocument, byTag, findAll, textOf } from './fakedom.ts';

const dom = createDom(new FakeDocument() as any);
const clock = () => ({ today: '2026-10-05', nowMinutes: 420 });
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const fk = (root: any, key: string) => findAll(root, (e: any) => e.getAttribute('data-fk') === key)[0];

function make(over: any = {}) {
  const calls: any[] = [];
  const api: any = {
    shareStatus: async () => over.status ?? { share: 'ready', signedIn: false },
    shareSignIn: async (b: any) => { calls.push(['signin', b]); return { signedIn: true }; },
    shareSignUp: async (b: any) => { calls.push(['signup', b]); return { signedIn: false, message: 'Check your email to confirm your account, then sign in.' }; },
    shareSignOut: async () => { calls.push(['signout']); return { signedIn: false }; },
    shareRecover: async (e: string) => { calls.push(['recover', e]); return { message: 'If that email has an account, a reset link is on its way.' }; },
    sharePassword: async (t: string, p: string) => { calls.push(['password', t, p]); return { message: 'Your password is changed. Sign in with it.' }; },
    friends: async () => ({ friends: over.friends ?? [{ connectionId: 'c1', id: 'u2', name: 'Ana' }] }),
    invite: async () => ({ code: 'AB12CD34EF' }),
    join: async (c: string) => { calls.push(['join', c]); return { friend: { connectionId: 'c2', id: 'u3', name: 'Ben' } }; },
    disconnect: async (id: string) => { calls.push(['disconnect', id]); return { ok: true }; },
    shareAsk: async (b: any) => { calls.push(['ask', b]); return { id: 'r1' }; },
    shareRequests: async () => ({ incoming: [], outgoing: over.outgoing ?? [] }),
  };
  const changes: boolean[] = [];
  const friends = createFriends(dom, { api, getClock: clock, onSignedInChange: (v: boolean) => changes.push(v), recoveryToken: over.recoveryToken ?? null });
  return { friends, calls, changes, el: friends.element() };
}

test('when sharing is not set up it says so and points to the guide', async () => {
  const { el } = make({ status: { share: 'unavailable', signedIn: false } });
  await flush();
  assert.match(textOf(el), /not set up.*supabase-setup/s);
});

test('signed out, it shows sign in, create account and forgot password; sign in sends the typed values once', async () => {
  const { el, calls, changes } = make();
  await flush();
  assert.match(textOf(el), /Sign in/);
  fk(el, 'friends-email').value = 'a@example.com'; fk(el, 'friends-email').dispatch('input');
  fk(el, 'friends-password').value = 'long-enough-1'; fk(el, 'friends-password').dispatch('input');
  fk(el, 'friends-signin').click();
  fk(el, 'friends-signin').click();
  await flush();
  assert.deepEqual(calls.filter((c) => c[0] === 'signin'), [['signin', { email: 'a@example.com', password: 'long-enough-1' }]]);
  assert.deepEqual(changes, [true]);
});

test('signed in, it lists friends with an Ask form and sends the purpose, dates, length and note', async () => {
  const { el, calls } = make({ status: { share: 'ready', signedIn: true, email: 'me@example.com' } });
  await flush();
  assert.match(textOf(el), /me@example\.com/);
  assert.match(textOf(el), /Ana/);
  fk(el, 'friends-purpose-u2').value = 'study'; fk(el, 'friends-purpose-u2').dispatch('change');
  fk(el, 'friends-note-u2').value = 'Library?'; fk(el, 'friends-note-u2').dispatch('input');
  fk(el, 'friends-ask-u2').click();
  await flush();
  const ask = calls.find((c) => c[0] === 'ask')![1];
  assert.deepEqual([ask.to, ask.purpose, ask.note, ask.today], ['u2', 'study', 'Library?', '2026-10-05']);
  assert.ok(ask.from >= '2026-10-05' && ask.until >= ask.from);
  assert.match(textOf(el), /Asked Ana/);
});

test('a friend\'s name that looks like markup is shown as plain text', async () => {
  const { el } = make({ status: { share: 'ready', signedIn: true, email: 'me@example.com' }, friends: [{ connectionId: 'c1', id: 'u2', name: '<img src=x onerror=alert(1)>' }] });
  await flush();
  assert.match(textOf(el), /<img src=x onerror=alert\(1\)>/);
  assert.equal(byTag(el, 'img').length, 0);
});

test('disconnecting asks first, then removes; invite shows a code; join sends the typed code', async () => {
  const { el, calls } = make({ status: { share: 'ready', signedIn: true, email: 'me@example.com' } });
  await flush();
  fk(el, 'friends-disconnect-c1').click();
  assert.equal(calls.some((c) => c[0] === 'disconnect'), false, 'a first press only asks');
  fk(el, 'friends-disconnect-yes-c1').click();
  await flush();
  assert.deepEqual(calls.find((c) => c[0] === 'disconnect'), ['disconnect', 'c1']);
  fk(el, 'friends-invite').click();
  await flush();
  assert.match(textOf(el), /AB12CD34EF/);
  fk(el, 'friends-code').value = 'zz99'; fk(el, 'friends-code').dispatch('input');
  fk(el, 'friends-join').click();
  await flush();
  assert.deepEqual(calls.find((c) => c[0] === 'join'), ['join', 'zz99']);
});

test('after following the reset link, a new password can be chosen', async () => {
  const { el, calls } = make({ recoveryToken: 'recovery-token' });
  await flush();
  assert.match(textOf(el), /Choose a new password/);
  fk(el, 'friends-newpassword').value = 'another-long-pw'; fk(el, 'friends-newpassword').dispatch('input');
  fk(el, 'friends-setpassword').click();
  await flush();
  assert.deepEqual(calls.find((c) => c[0] === 'password'), ['password', 'recovery-token', 'another-long-pw']);
});

test('a failed call shows its sentence and keeps what was typed', async () => {
  const { el, friends } = make();
  await flush();
  (friends as any).api = null;
  fk(el, 'friends-email').value = 'a@example.com'; fk(el, 'friends-email').dispatch('input');
  assert.equal(fk(el, 'friends-email').value, 'a@example.com');
});
```

The last test only guards that typing is not lost on a redraw; keep it small. If `FakeElement` lacks `dispatch('change')` for selects, use the same helper the existing `form.test.ts` uses for selects.

- [ ] **Step 6: Write `public/js/friends.js`**

```js
import { PURPOSES, lengthLine, rangeLine } from './friends-model.js';
import { addDays } from './time.js';

const LENGTHS = [30, 60, 90, 120, 180, 240, 480];
const NOT_SET_UP = 'Friend sharing is not set up. See docs/supabase-setup.md.';

export function createFriends(dom, deps) {
  const { h, clear } = dom;
  const { api, getClock, onSignedInChange } = deps;
  const container = h('div', { class: 'friends' });
  let started = false;
  let recoveryToken = deps.recoveryToken ?? null;
  let st = { loading: true, share: 'ready', signedIn: false, email: '', friends: [], error: '', note: '', busy: false, code: '', confirm: null };
  const form = { email: '', password: '', name: '', join: '', newPassword: '' };
  const asks = {}; // per friend id: purpose, from, until, minutes, note

  const askOf = (id) => {
    if (!asks[id]) {
      const today = getClock().today;
      asks[id] = { purpose: 'study', from: today, until: addDays(today, 4), minutes: 120, note: '' };
    }
    return asks[id];
  };
  const set = (patch) => { st = { ...st, ...patch }; draw(); };
  const sentence = (e) => (e && e.message ? e.message : 'Something went wrong. Try again.');

  // One action at a time: a second press while one is running does nothing.
  async function run(fn) {
    if (st.busy) return;
    st = { ...st, busy: true, error: '', note: '' };
    draw();
    try {
      await fn();
    } catch (e) {
      st = { ...st, error: sentence(e) };
    }
    st = { ...st, busy: false };
    draw();
  }

  async function refresh() {
    try {
      const s = await api.shareStatus();
      if (s.share !== 'ready') { st = { ...st, loading: false, share: 'unavailable', signedIn: false }; return draw(); }
      if (!s.signedIn) { st = { ...st, loading: false, share: 'ready', signedIn: false, friends: [] }; return draw(); }
      const f = await api.friends();
      st = { ...st, loading: false, share: 'ready', signedIn: true, email: s.email ?? '', friends: f.friends, error: '' };
    } catch (e) {
      st = { ...st, loading: false, error: sentence(e) };
    }
    draw();
  }

  const field = (label, key, extra = {}) =>
    h('label', { class: 'fr-field' }, h('span', { class: 'mono' }, label),
      h('input', { type: extra.type ?? 'text', value: form[key], 'data-fk': extra.fk, autocomplete: extra.autocomplete ?? 'off', oninput: (e) => { form[key] = e.target.value; } }));
  const btn = (text, fk, onclick, cls = '', disabled = false) =>
    h('button', { type: 'button', class: `btn mono ${cls}`.trim(), 'data-fk': fk, disabled: disabled || st.busy, onclick }, text);

  function signedOutView() {
    if (recoveryToken) {
      return h('div', { class: 'fr-box' },
        h('b', {}, 'Choose a new password'),
        field('New password (10 or more characters)', 'newPassword', { type: 'password', fk: 'friends-newpassword', autocomplete: 'new-password' }),
        btn('Set password', 'friends-setpassword', () => run(async () => {
          const r = await api.sharePassword(recoveryToken, form.newPassword);
          recoveryToken = null; form.newPassword = '';
          st = { ...st, note: r.message };
        }), 'y'));
    }
    return h('div', { class: 'fr-box' },
      h('b', {}, 'Sign in to share free times'),
      field('Email', 'email', { type: 'email', fk: 'friends-email', autocomplete: 'username' }),
      field('Password', 'password', { type: 'password', fk: 'friends-password', autocomplete: 'current-password' }),
      field('Name (new accounts)', 'name', { fk: 'friends-name' }),
      h('div', { class: 'acts' },
        btn('Sign in', 'friends-signin', () => run(async () => {
          await api.shareSignIn({ email: form.email, password: form.password });
          form.password = '';
          await refresh();
          onSignedInChange(true);
        }), 'y'),
        btn('Create account', 'friends-signup', () => run(async () => {
          const r = await api.shareSignUp({ email: form.email, password: form.password, name: form.name });
          form.password = '';
          if (r.signedIn) { await refresh(); onSignedInChange(true); } else st = { ...st, note: r.message };
        })),
        btn('Forgot password', 'friends-recover', () => run(async () => { st = { ...st, note: (await api.shareRecover(form.email)).message }; }))));
  }

  function friendRow(f) {
    const a = askOf(f.id);
    const asking = st.confirm === f.connectionId;
    return h('div', { class: 'fr-friend' },
      h('b', {}, f.name),
      h('div', { class: 'fr-ask' },
        h('select', { 'aria-label': `What to do with ${f.name}`, 'data-fk': `friends-purpose-${f.id}`, onchange: (e) => { a.purpose = e.target.value; } },
          PURPOSES.map((p) => h('option', { value: p.value, selected: a.purpose === p.value }, p.label))),
        h('input', { type: 'date', 'aria-label': 'From', value: a.from, 'data-fk': `friends-from-${f.id}`, onchange: (e) => { a.from = e.target.value; } }),
        h('input', { type: 'date', 'aria-label': 'Until', value: a.until, 'data-fk': `friends-until-${f.id}`, onchange: (e) => { a.until = e.target.value; } }),
        h('select', { 'aria-label': 'How long', 'data-fk': `friends-minutes-${f.id}`, onchange: (e) => { a.minutes = Number(e.target.value); } },
          LENGTHS.map((m) => h('option', { value: String(m), selected: a.minutes === m }, lengthLine(m)))),
        h('input', { type: 'text', maxlength: '200', placeholder: 'Note (optional)', 'aria-label': 'Note', value: a.note, 'data-fk': `friends-note-${f.id}`, oninput: (e) => { a.note = e.target.value; } }),
        btn('Ask', `friends-ask-${f.id}`, () => run(async () => {
          await api.shareAsk({ to: f.id, purpose: a.purpose, from: a.from, until: a.until, minutes: a.minutes, note: a.note, today: getClock().today });
          a.note = '';
          st = { ...st, note: `Asked ${f.name}, ${rangeLine(a.from, a.until)}.` };
        }), 'y')),
      asking
        ? h('div', { class: 'acts' },
          h('span', {}, `Disconnect from ${f.name}? Requests between you are deleted.`),
          btn('Yes, disconnect', `friends-disconnect-yes-${f.connectionId}`, () => run(async () => { await api.disconnect(f.connectionId); st = { ...st, confirm: null }; await refresh(); })),
          btn('Keep them', `friends-disconnect-no-${f.connectionId}`, () => set({ confirm: null })))
        : btn('Disconnect', `friends-disconnect-${f.connectionId}`, () => set({ confirm: f.connectionId })));
  }

  function signedInView() {
    return h('div', { class: 'fr-box' },
      h('div', { class: 'fr-me' },
        h('span', {}, `Signed in as ${st.email}`),
        btn('Sign out', 'friends-signout', () => run(async () => { await api.shareSignOut(); onSignedInChange(false); await refresh(); }))),
      st.friends.length === 0 && h('p', {}, 'No friends yet. Invite one, or join with a code they sent you.'),
      st.friends.map(friendRow),
      h('div', { class: 'acts' },
        btn('Invite a friend', 'friends-invite', () => run(async () => { st = { ...st, code: (await api.invite()).code }; }), 'y'),
        st.code && h('span', { class: 'mono' }, `Send this code: ${st.code}`)),
      h('div', { class: 'acts' },
        field('Join with a code', 'join', { fk: 'friends-code' }),
        btn('Join', 'friends-join', () => run(async () => { await api.join(form.join); form.join = ''; await refresh(); }))));
  }

  function draw() {
    clear(container, [
      st.loading && h('p', { class: 'mono' }, 'Loading'),
      !st.loading && st.share === 'unavailable' && h('p', {}, NOT_SET_UP),
      !st.loading && st.share === 'ready' && (st.signedIn ? signedInView() : signedOutView()),
      st.note && h('p', { class: 'fr-note', role: 'status' }, st.note),
      st.error && h('p', { class: 'fr-err', role: 'alert' }, st.error),
    ]);
  }

  return {
    element() {
      if (!started) { started = true; draw(); refresh(); }
      return container;
    },
    refresh,
  };
}
```

Notes for the implementer: `clear(container, [...])` must accept `false` entries and nested arrays the way `settings.js` already passes them to `clear`; if `dom.clear` does not flatten nested arrays, spread them (`...st.friends.map(friendRow)`). Typed text survives redraws because the `form` and `asks` objects hold it and `value:` is re-applied. Names and notes are only ever passed as children strings or attributes through `h()`, never as markup.

- [ ] **Step 7: Show it in Settings**

In `public/js/settings.js`:
- add `{ id: 'friends', title: 'Friends' }` to `SETTINGS_GROUPS`;
- add to `SETTINGS`: `{ id: 'friends', group: 'friends', title: 'Friends', friends: true, description: 'Ask a friend when they are free to study, hang out or meet. Only free times are shared, and only when you press Send.' }`;
- in `rowEl` add at the top: `if (row.friends) return h('div', { class: 'st' }, h('b', {}, row.title), h('p', {}, row.description), deps.friends ? deps.friends.element() : h('p', {}, 'Friend sharing is not available.'));`
- in `build()` change the right column to `column(['planner', 'friends'])`.

In `public/js/main.js`: import `createFriends` from `./friends.js`; before `createSettings` create it and pass it:
```js
  const recoveryToken = takeRecovery(win);
  const friends = createFriends(dom, { api, getClock, onSignedInChange: (v) => sharePoller.kick(v), recoveryToken });
  const settings = createSettings(dom, { store, ui, keepFocus, setup, friends });
```
`sharePoller` is created in Task 7; for this task define `const sharePoller = { kick: () => {} };` above and leave a one-line comment that Task 7 replaces it. Add near the top of the module:
```js
// Following the reset link from the email lands here with the token in the address; take it and tidy the address.
function takeRecovery(win) {
  const hash = String(win.location.hash || '');
  if (!hash.includes('type=recovery')) return null;
  const token = new URLSearchParams(hash.replace(/^#/, '')).get('access_token');
  win.location.hash = '#/settings';
  return token || null;
}
```

In `public/css/app.css` add (match the existing Settings rules for colour variables; no gradients, no inline styles):
```css
.friends { display: flex; flex-direction: column; gap: 10px; }
.fr-box { display: flex; flex-direction: column; gap: 10px; border: 2px solid var(--ink); padding: 12px 14px; }
.fr-me { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
.fr-field { display: flex; flex-direction: column; gap: 4px; }
.fr-field input, .fr-ask input, .fr-ask select { font: inherit; padding: 8px 10px; border: 2px solid var(--ink); background: transparent; color: var(--ink); min-width: 0; }
.fr-friend { display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--rule, #E6E7E8); padding-top: 10px; }
.fr-ask { display: flex; flex-wrap: wrap; gap: 8px; }
.fr-note { margin: 0; color: var(--ghost); }
.fr-err { margin: 0; color: var(--ink); font-weight: 600; }
```
If `--ink`/`--ghost` are not the names in `app.css`, use the variables that file already defines for text and muted text.

- [ ] **Step 8: Run the tests**

Run: `node --test test/frontend/friends-model.test.ts test/frontend/friends.test.ts test/frontend/api.test.ts test/frontend/settings.test.ts test/frontend/e2e.test.ts`
Expected: PASS. Existing settings tests may count groups or rows; update only the count, keeping the rest of each assertion.

- [ ] **Step 9: Commit**

```bash
git add public/js/api.js public/js/friends-model.js public/js/friends.js public/js/settings.js public/js/main.js public/css/app.css test/frontend/friends-model.test.ts test/frontend/friends.test.ts test/frontend/api.test.ts
git commit -m "feat: Friends in Settings: sign in, invite, join, ask, disconnect"
```

---

### Task 7: Nudge shows incoming requests and answers

**Files:**
- Create: `public/js/sharepoll.js`
- Modify: `public/js/nudge.js`, `public/js/main.js`, `public/css/app.css`
- Test: `test/frontend/sharepoll.test.ts`, additions to `test/frontend/nudge.test.ts`, new `test/frontend/friends-e2e.test.ts`

**Interfaces:**
- Consumes: `api.shareRequests`, `api.shareSlots`, `api.shareAnswer`, `api.shareDecline`, `api.shareOkay` (Task 6); `requestLine`, `answerLines`, `slotLine` from `friends-model.js`.
- Produces:
  - `sharepoll.js`: `createSharePoller({api, getClock, onData, setTimer, clearTimer, isHidden, intervalMs = 15000})` returning `{start(), stop(), kick(signedIn), poll()}`. `onData({incoming, outgoing})` is called after every good poll and with `{incoming: [], outgoing: []}` when polling stops because the person is signed out or sharing is off.
  - `nudge.js`: `view.friends = {incoming, outgoing}` (missing means empty); handlers `shareSlots(id)`, `shareAnswer(id, slots)`, `shareDecline(id)`, `shareOkay(id)`. `data-fk` hooks: `friend-slot-<n>`, `friend-send`, `friend-decline`, `friend-okay`.

Behaviour:
- An incoming request shows a bubble: the line from `requestLine`, the note as plain text if any, the offered slots as tick-boxes (all ticked), buttons Send and Decline. Slots are fetched with `handlers.shareSlots(id)` when the bubble first shows; while loading it says "Looking at your week."; if the call fails it shows the sentence and a Decline button only.
- Send is disabled while sending and while nothing is ticked; a second press while sending does nothing. After Send or Decline the poller runs once so the bubble goes away.
- An outgoing answered/declined/expired request shows `answerLines` (what the friend offered, and "You are free too" or "None of those fit your week.") with an Okay button that calls `shareOkay(id)` then polls once. Waiting (`open`) requests are not shown in Nudge.
- Priority in `render`: after the check-in and confirm bubbles, before warnings. Incoming requests come before answers. `needsAttention` is true when there is one of either; `faceFor` returns `glance-left` for either when nothing worse is showing (put the check after the `view.busy` / `view.estimating` / `view.surprised` lines and before `view.items`).

- [ ] **Step 1: Write the failing poller tests**

`test/frontend/sharepoll.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSharePoller } from '../../public/js/sharepoll.js';

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function make(over: any = {}) {
  const timers: { fn: () => void; ms: number; id: number }[] = [];
  let id = 0;
  const data: any[] = [];
  const state = { hidden: false, calls: 0 };
  const api = {
    shareStatus: async () => over.status ?? { share: 'ready', signedIn: true },
    shareRequests: async () => { state.calls += 1; if (over.fail) throw over.fail; return { incoming: [{ id: 'r1' }], outgoing: [] }; },
  };
  const p = createSharePoller({
    api, getClock: () => ({ today: '2026-10-05' }), onData: (d: any) => data.push(d),
    setTimer: (fn: () => void, ms: number) => { timers.push({ fn, ms, id: ++id }); return id; }, clearTimer: (i: number) => { const k = timers.findIndex((t) => t.id === i); if (k >= 0) timers.splice(k, 1); },
    isHidden: () => state.hidden, intervalMs: 15000,
  });
  return { p, timers, data, state };
}

test('starting polls once and schedules the next check in 15 seconds', async () => {
  const { p, timers, data } = make();
  p.start(); await flush();
  assert.equal(data.length, 1);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 15000);
});

test('a hidden tab is not polled, and the next check is still scheduled', async () => {
  const { p, timers, state } = make();
  state.hidden = true;
  p.start(); await flush();
  assert.equal(state.calls, 0);
  assert.equal(timers.length, 1);
});

test('signed out or not set up stops polling and clears what was shown', async () => {
  const a = make({ status: { share: 'ready', signedIn: false } });
  a.p.start(); await flush();
  assert.deepEqual(a.data, [{ incoming: [], outgoing: [] }]);
  assert.equal(a.timers.length, 0);
  const b = make({ status: { share: 'unavailable', signedIn: false } });
  b.p.start(); await flush();
  assert.equal(b.timers.length, 0);
});

test('a failed poll keeps what was shown and tries again later; a 401 stops', async () => {
  const a = make({ fail: Object.assign(new Error('x'), { status: 0 }) });
  a.p.start(); await flush();
  assert.equal(a.data.length, 0);
  assert.equal(a.timers.length, 1);
  const b = make({ fail: Object.assign(new Error('x'), { status: 401 }) });
  b.p.start(); await flush();
  assert.deepEqual(b.data, [{ incoming: [], outgoing: [] }]);
  assert.equal(b.timers.length, 0);
});

test('kick(true) starts again after signing in; kick(false) stops and clears; stop cancels the timer', async () => {
  const { p, timers, data } = make();
  p.kick(true); await flush();
  assert.equal(data.length, 1);
  p.kick(false); await flush();
  assert.deepEqual(data.at(-1), { incoming: [], outgoing: [] });
  assert.equal(timers.length, 0);
  p.start(); await flush();
  p.stop();
  assert.equal(timers.length, 0);
});

test('two polls never overlap', async () => {
  const { p, state } = make();
  p.poll(); p.poll(); await flush();
  assert.equal(state.calls, 1);
});
```

- [ ] **Step 2: Write `public/js/sharepoll.js`**

```js
const EMPTY = { incoming: [], outgoing: [] };

// Checks for new requests and answers while the tab is visible. It stops by itself when nobody is signed in.
export function createSharePoller(deps) {
  const { api, getClock, onData, setTimer, clearTimer, isHidden } = deps;
  const interval = deps.intervalMs ?? 15000;
  let timer = null;
  let running = false;
  let inFlight = false;

  const schedule = () => {
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => { timer = null; poll(); }, interval);
  };
  const halt = (clearView) => {
    running = false;
    if (timer !== null) clearTimer(timer);
    timer = null;
    if (clearView) onData(EMPTY);
  };

  async function poll() {
    if (!running || inFlight) return;
    if (isHidden()) return schedule();
    inFlight = true;
    try {
      const s = await api.shareStatus();
      if (s.share !== 'ready' || !s.signedIn) return halt(true);
      onData(await api.shareRequests(getClock()));
      schedule();
    } catch (e) {
      if (e && e.status === 401) halt(true);
      else schedule(); // offline or a hiccup: keep what is shown and try again later
    } finally {
      inFlight = false;
    }
  }

  return {
    start() { running = true; poll(); },
    stop() { halt(false); },
    kick(signedIn) { if (signedIn) { running = true; poll(); } else halt(true); },
    poll,
  };
}
```

Edge: `poll` is also exposed for "poll once now" after Send/Okay; it only runs while `running`. Start the poller from `main.js` (Step 7).

- [ ] **Step 3: Run the poller tests**

Run: `node --test test/frontend/sharepoll.test.ts`
Expected: PASS (6 tests). Note `halt(true)` inside `try` runs `finally` afterwards, which is fine.

- [ ] **Step 4: Write the failing Nudge tests**

Append to `test/frontend/nudge.test.ts` (it already has `setup`, `labelled`, `buttons`, `flush`, `base`):

```ts
const friendsView = (over: any = {}) => ({ ...base, friends: { incoming: [{ id: 'r1', friend: 'Ana', purpose: 'study', from: '2026-10-19', to: '2026-10-23', minutes: 120, note: 'Library?' }], outgoing: [], ...over } });
const slot = (n: number) => ({ date: '2026-10-2' + n, start: '18:00', end: '20:00', kind: n === 1 ? 'study' : 'free' });

test('an incoming request shows the line, the note, and the offered times ticked; Send sends only what is ticked', async () => {
  const sent: any[] = [];
  const { nudge } = setup({ shareSlots: async () => ({ slots: [slot(1), slot(2)] }), shareAnswer: async (id: string, slots: any[]) => { sent.push([id, slots]); } });
  nudge.update(friendsView());
  assert.match(textOf(nudge.el), /Ana asks when you can study together for 2 h, Mon 19 to Fri 23\./);
  assert.match(textOf(nudge.el), /Library\?/);
  assert.match(textOf(nudge.el), /Looking at your week/);
  await flush();
  assert.match(textOf(nudge.el), /Wed 21, 18:00 to 20:00 \(study block\)/);
  const boxes = findAll(nudge.el, (e: any) => (e.getAttribute('data-fk') ?? '').startsWith('friend-slot-'));
  assert.equal(boxes.length, 2);
  boxes[1].click();
  labelled(nudge.el, 'Send')!.click();
  labelled(nudge.el, 'Send')?.click();
  await flush();
  assert.deepEqual(sent, [['r1', [slot(1)]]]);
});

test('Send is off when nothing is ticked; Decline calls the handler', async () => {
  const calls: any[] = [];
  const { nudge } = setup({ shareSlots: async () => ({ slots: [slot(1)] }), shareDecline: async (id: string) => { calls.push(id); } });
  nudge.update(friendsView());
  await flush();
  findAll(nudge.el, (e: any) => (e.getAttribute('data-fk') ?? '') === 'friend-slot-0')[0].click();
  assert.equal(labelled(nudge.el, 'Send')!.getAttribute('disabled') !== null && labelled(nudge.el, 'Send')!.disabled, true);
  labelled(nudge.el, 'Decline')!.click();
  await flush();
  assert.deepEqual(calls, ['r1']);
});

test('if the times cannot be loaded the sentence shows and Decline stays', async () => {
  const { nudge } = setup({ shareSlots: async () => { throw new Error('Those dates are not allowed.'); } });
  nudge.update(friendsView());
  await flush();
  assert.match(textOf(nudge.el), /Those dates are not allowed\./);
  assert.ok(labelled(nudge.el, 'Decline'));
  assert.equal(labelled(nudge.el, 'Send'), undefined);
});

test('a friend\'s name and note are plain text even if they look like markup', async () => {
  const { nudge } = setup({ shareSlots: async () => ({ slots: [slot(2)] }) });
  nudge.update(friendsView({ incoming: [{ id: 'r1', friend: '<b>Ana</b>', purpose: 'hang', from: '2026-10-19', to: '2026-10-19', minutes: 60, note: '<img src=x>' }] }));
  await flush();
  assert.match(textOf(nudge.el), /<b>Ana<\/b> asks/);
  assert.equal(byTag(nudge.el, 'img').length, 0);
});

test('an answer shows what the friend offered and the overlap; Okay marks it seen', async () => {
  const okayed: string[] = [];
  const { nudge } = setup({ shareOkay: async (id: string) => { okayed.push(id); } });
  nudge.update(friendsView({ incoming: [], outgoing: [{ id: 'r9', friend: 'Ana', purpose: 'hang', from: '2026-10-19', to: '2026-10-23', minutes: 60, status: 'answered', slots: [slot(2)], together: [slot(2)] }] }));
  assert.match(textOf(nudge.el), /Ana can hang out for 1 h:/);
  assert.match(textOf(nudge.el), /You are free too:/);
  labelled(nudge.el, 'Okay')!.click();
  await flush();
  assert.deepEqual(okayed, ['r9']);
});

test('a declined request says so, and a waiting one is not shown', () => {
  const { nudge } = setup();
  nudge.update(friendsView({ incoming: [], outgoing: [{ id: 'r1', friend: 'Ana', purpose: 'hang', from: 'a', to: 'b', minutes: 60, status: 'open', slots: [], together: [] }] }));
  assert.doesNotMatch(textOf(nudge.el), /Ana/);
  nudge.update(friendsView({ incoming: [], outgoing: [{ id: 'r2', friend: 'Ana', purpose: 'hang', from: '2026-10-19', to: '2026-10-19', minutes: 60, status: 'declined', slots: [], together: [] }] }));
  assert.match(textOf(nudge.el), /Ana cannot this time\./);
});

test('a request makes him come up; warnings still show when there is no request', () => {
  const { nudge } = setup();
  nudge.update(friendsView());
  assert.equal(nudge.el.getAttribute('data-state'), 'alert');
  nudge.update({ ...base, friends: { incoming: [], outgoing: [] } });
  assert.equal(nudge.el.getAttribute('data-state'), 'resting');
});
```

Add `findAll` and `byTag`/`textOf` to the file's imports from `./fakedom.ts` if they are not already imported.

- [ ] **Step 5: Change `public/js/nudge.js`**

1. Import: `import { answerLines, requestLine, slotLine } from './friends-model.js';`.
2. State near the other `let`s: `let friendLoad = null; // { id, loading, slots, ticked, error, sending }`.
3. Helpers inside `createNudge`:
```js
  const friendsOf = () => (view.friends && view.friends.incoming ? view.friends : { incoming: [], outgoing: [] });
  const answersOf = () => friendsOf().outgoing.filter((o) => o.status !== 'open');

  // The times are fetched once for the request that is showing; a late reply for another request is ignored.
  function loadSlots(req) {
    if (!handlers.shareSlots || (friendLoad && friendLoad.id === req.id)) return;
    const mine = { id: req.id, loading: true, slots: [], ticked: new Set(), error: '', sending: false };
    friendLoad = mine;
    Promise.resolve()
      .then(() => handlers.shareSlots(req.id))
      .then((r) => { if (friendLoad === mine) { friendLoad = { ...mine, loading: false, slots: r.slots, ticked: new Set(r.slots.map((_, i) => i)) }; render(); } })
      .catch((e) => { if (friendLoad === mine) { friendLoad = { ...mine, loading: false, error: e && e.message ? e.message : 'I could not look at your week.' }; render(); } });
  }
  function sendFriend(req) {
    const f = friendLoad;
    if (!f || f.id !== req.id || f.sending || f.ticked.size === 0) return;
    f.sending = true;
    const chosen = f.slots.filter((_, i) => f.ticked.has(i));
    Promise.resolve()
      .then(() => handlers.shareAnswer(req.id, chosen))
      .then(() => { friendLoad = null; render(); })
      .catch((e) => { friendLoad = { ...f, sending: false, error: e && e.message ? e.message : 'I could not send that. Try again.' }; render(); });
  }
  function declineFriend(req) {
    friendLoad = null;
    Promise.resolve().then(() => handlers.shareDecline(req.id)).catch(() => {});
    render();
  }
  function okayAnswer(o) {
    Promise.resolve().then(() => handlers.shareOkay(o.id)).catch(() => {});
  }

  function friendBubble() {
    const req = friendsOf().incoming[0];
    if (req) {
      loadSlots(req);
      const f = friendLoad && friendLoad.id === req.id ? friendLoad : null;
      const slots = f && !f.loading ? f.slots : [];
      return say(
        h('span', { class: 'mono k' }, friendsOf().incoming.length > 1 ? `Nudge / ${friendsOf().incoming.length} requests` : 'Nudge'),
        h('b', {}, requestLine(req)),
        req.note && h('p', {}, req.note),
        f && f.loading && h('p', {}, 'Looking at your week.'),
        f && f.error && h('p', { class: 'notice' }, f.error),
        slots.length > 0 && h('div', { class: 'slots' }, slots.map((s, i) =>
          h('label', { class: 'slot' },
            h('input', { type: 'checkbox', checked: f.ticked.has(i), 'data-fk': `friend-slot-${i}`, onchange: () => { if (f.ticked.has(i)) f.ticked.delete(i); else f.ticked.add(i); render(); } }),
            h('span', {}, slotLine(s))))),
        slots.length === 0 && f && !f.loading && !f.error && h('p', {}, 'Nothing in your week fits, so you can only decline.'),
        h('div', { class: 'acts' },
          slots.length > 0 && button('Send', () => sendFriend(req), 'y', 'friend-send', !f || f.sending || f.ticked.size === 0),
          button('Decline', () => declineFriend(req), '', 'friend-decline')));
    }
    const o = answersOf()[0];
    const a = answerLines(o);
    return say(
      h('span', { class: 'mono k' }, 'Nudge'),
      h('b', {}, a.headline),
      a.slots.length > 0 && h('ul', { class: 'lines' }, a.slots.map((t) => h('li', {}, t))),
      a.togetherLine && h('p', {}, a.togetherLine),
      a.together.length > 0 && h('ul', { class: 'lines' }, a.together.map((t) => h('li', {}, t))),
      h('div', { class: 'acts' }, button('Okay', () => okayAnswer(o), 'y', 'friend-okay')));
  }
```
The `button(...)` helper in `nudge.js` takes `(label, onclick, cls, fk)`; give it a fifth `disabled` parameter if it does not have one, and make the one place that builds the element pass `disabled`. Check the helper's definition before editing and keep every existing call valid.

4. In `render()`, insert before `} else if (view.items.length > 0) {`:
```js
    } else if (friendsOf().incoming.length > 0 || answersOf().length > 0) {
      badge = String(friendsOf().incoming.length + answersOf().length);
      width = 124;
      bubble = friendBubble();
```
It must come after the `view.confirm` branches and `view.checkIn` branch, and before the warnings branch.
5. `needsAttention`: add `|| friendCount(view) > 0` where `const friendCount = (v) => (v.friends && v.friends.incoming ? v.friends.incoming.length + v.friends.outgoing.filter((o) => o.status !== 'open').length : 0);` is defined next to `needsAttention`.
6. `faceFor`: before `if (view.items.length > 0)` add `if (friendCount(view) > 0 && view.items.length === 0) return 'glance-left';`.
7. Reset: in the `update` that clears `askMessage` when keys change, also set `friendLoad = null` when there is no incoming request (so a finished request does not keep stale boxes).

Add to `public/css/app.css`:
```css
.say .slots { display: flex; flex-direction: column; gap: 6px; }
.say .slot { display: flex; align-items: center; gap: 10px; font-size: 14px; color: var(--paper); }
.say .slot input { width: 18px; height: 18px; accent-color: var(--study); }
.say .lines { margin: 0; padding-left: 18px; font-size: 14px; color: #D6D8DA; }
```

- [ ] **Step 6: Run the Nudge tests**

Run: `node --test test/frontend/nudge.test.ts test/frontend/nudge-model.test.ts`
Expected: PASS (existing and 7 new). If the fake DOM lacks `checked`/`disabled` support for inputs, assert on the attribute the existing tests already use for disabled buttons.

- [ ] **Step 7: Wire the poller in `public/js/main.js`**

Replace the Task 6 placeholder:
```js
  let shareData = { incoming: [], outgoing: [] };
  const sharePoller = createSharePoller({
    api, getClock,
    onData: (d) => { shareData = d; render(); },
    setTimer: (fn, ms) => win.setTimeout(fn, ms), clearTimer: (id) => win.clearTimeout(id),
    isHidden: () => document.visibilityState === 'hidden',
  });
```
(import `createSharePoller` from `./sharepoll.js`; this must be defined before the `createFriends` call that uses `sharePoller.kick`, and `render` is hoisted as a function declaration.) Add Nudge handlers:
```js
    shareSlots: (id) => api.shareSlots(id, getClock()),
    shareAnswer: (id, slots) => api.shareAnswer(id, getClock(), slots).then(() => sharePoller.poll()),
    shareDecline: (id) => api.shareDecline(id).then(() => sharePoller.poll()),
    shareOkay: (id) => api.shareOkay(id).then(() => sharePoller.poll()),
```
Pass `friends: shareData` in the `nudge.update({...})` call. Start it after `store.load()`: `sharePoller.start();`. On `visibilitychange` to visible call `sharePoller.poll()` as well (add it into the existing `refreshIfNewDay` listener's neighbour, a new listener). Return `sharePoller` from `startApp` for tests.

Since a poll that returns while the page is signed out calls `halt(true)`, `render()` runs with empty data and Nudge goes back to resting.

- [ ] **Step 8: Write the end-to-end test**

`test/frontend/friends-e2e.test.ts`: two servers sharing one `fakeShareService` (as in `test/server.share.test.ts`, with Ana and Ben signed in and connected), then boot Ben's page with `startApp` the way `chat-e2e.test.ts` does (`boot()` helper: copy it, changing the `createApp` options to `{ share }` and the clock). Steps:

1. Put a minimal valid state in Ben's server (`PUT /api/state`) like `chat-e2e.test.ts` does.
2. Boot Ben's page. Via the API on Ana's server, create a request to Ben (`purpose: 'meeting'`, `2026-10-06` to `2026-10-07`, 60 minutes, note `Coffee?`).
3. Call `app.sharePoller.poll()` and wait (poll the DOM up to ~1 s) until Ben's Nudge text matches `/Ana asks when you can meet for 1 h, Tue 6 to Wed 7\./` and shows `Coffee?`.
4. Wait until slot boxes exist (`data-fk` starting `friend-slot-`), press `Send`, wait until the text no longer matches `/Ana asks/`.
5. Fetch Ana's `GET /api/share/requests?today=2026-10-05`: assert `outgoing[0].status === 'answered'` and `slots.length > 0`.
6. Assert Ben's planner state is unchanged by the whole exchange (`GET /api/state` blocks and tasks equal their value before).

Also assert nothing from Ben's page ever contained `tok-` or `ref-` (search `textOf(root)`).

- [ ] **Step 9: Run the e2e test and the suite for the touched areas**

Run: `node --test test/frontend/friends-e2e.test.ts test/frontend/e2e.test.ts test/frontend/chat-e2e.test.ts test/frontend/nudge.test.ts test/frontend/settings.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add public/js/sharepoll.js public/js/nudge.js public/js/main.js public/css/app.css test/frontend/sharepoll.test.ts test/frontend/nudge.test.ts test/frontend/friends-e2e.test.ts
git commit -m "feat: Nudge brings a friend's request and answer, and asks before sending anything"
```

---

### Task 8: Guides, the whole suite, and the manual check

**Files:**
- Modify: `docs/ui-visual-check.md`, `docs/anthropic-setup.md` (one line pointing to the Supabase guide is NOT needed; skip it), `README` if one lists the guides (check `ls`, update only if it already lists `docs/anthropic-setup.md`)

- [ ] **Step 1: Add the visual check**

Append to `docs/ui-visual-check.md` a section "Friends" (match the file's style):

```markdown
## Friends

You need two accounts: yours and a friend's, both in the same Supabase project (see docs/supabase-setup.md). Run two planners: yours on port 8787 and a second one for the friend with `PORT=8788 DATA_FILE=data/friend.json npm run serve` (same two Supabase variables in that terminal), opened in a second browser window.

1. Settings, Friends, on both: Create account, open the email link, sign in. Each says "Signed in as ...".
2. On yours press Invite a friend. Copy the code. On the friend's, paste it under Join with a code and press Join. Each list shows the other.
3. On yours pick Study together, dates inside the next 10 days, 2 h, a note, and press Ask. It says "Asked NAME".
4. Within about 15 seconds the friend's Nudge comes up: "NAME asks when you can study together for 2 h, ...", with the note, tick-boxes for their times, and Send and Decline. Their study blocks are marked (study block).
5. Untick one time and press Send. The bubble goes away. Nothing else on their plan changes.
6. Within 15 seconds your Nudge comes up with what they offered and "You are free too:" (or "None of those fit your week."). Press Okay: it does not come back.
7. Ask again with Hang out and a Friday: the friend's offered times include the evening they keep free. Ask with Meeting: they do not.
8. Press Decline on a new request: your Nudge says "NAME cannot this time."
9. Disconnect on one side: both lists are empty and old requests are gone.
10. Stop the server and start it WITHOUT the two Supabase variables: Friends says it is not set up, and the rest of the planner works as before.
```

- [ ] **Step 2: Run the whole suite**

Run: `npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)|^✖"`
Expected: all pass. The two performance tests and the Maps refresh test can fail occasionally under load; if only those fail, rerun them alone with `node --test test/perf.test.ts test/frontend/maps-e2e.test.ts` and report both runs.

- [ ] **Step 3: Commit**

```bash
git add docs/ui-visual-check.md
git commit -m "docs: how to check friend sharing with two accounts"
```

- [ ] **Step 4: Hand over for the real check**

Tell the user: apply `supabase/schema.sql` in their Supabase project (SQL editor), set the three Authentication settings in `docs/supabase-setup.md`, then run `scripts/rls-check.ts` against a throwaway project, and do the "Friends" steps in `docs/ui-visual-check.md` with two accounts. Do not push until they say so. If the real service refuses anything the fake allowed (a column name, a policy, an embedded `answers(slots)` select), fix `src/supabase.ts` or `supabase/schema.sql` and note it in the commit message.
