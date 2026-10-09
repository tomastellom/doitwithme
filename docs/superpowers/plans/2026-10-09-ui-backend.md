# UI Backend (Ask Mode, Nudge Actions, Static Serving) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the planner an "ask first" mode for soft evenings, structured warnings, approvals and dismissals that Nudge can act on, and serve the future UI files and an example state safely from the local server.

**Architecture:** Extend the existing pure planner (`plan()`) with `softMode`, `approvedSoft` and structured `detail` on warnings; extend `replan()` to keep approvals current and prune dismissals; add three action endpoints plus safe static file serving and `/api/example` to the existing `node:http` server. No UI code is written here.

**Tech Stack:** Node 25 with built-in TypeScript type stripping, `node:test`, `node:http`, `node:fs`. No npm dependencies.

**Spec:** `docs/superpowers/specs/2026-10-09-ui-design.md` (sections "Planner changes needed by Nudge", "Server changes"). Builds on branch `phase-1-core-planner` code; work happens on branch `ui-v1` in the worktree `/Users/tomastello/doitwithme-phase1`.

## Global Constraints

- Zero npm dependencies. Type stripping rules: `import type` for type-only imports, `.ts` extensions in import paths, no enums, namespaces or constructor parameter properties.
- The planner stays pure and deterministic: no clock reads, no randomness, no I/O inside `src/planner.ts`, `src/demand.ts`, `src/slots.ts`.
- The server listens on `127.0.0.1` only, keeps the Host-header allowlist, and still requires `Content-Type: application/json` on every `PUT` and `POST`.
- Old data files (without `softMode`, `approvedSoft`, `dismissed`) must keep loading, with defaults filled in.
- Re-planning never rewrites past days. Dates before today are dropped from `approvedSoft` on replan.
- A user-approved soft date is honored in both soft modes. `auto` mode behaves exactly as it does today.
- A warning's `message` text is unchanged by this plan (the CLI and old tests read it). Structure is added in `detail`.
- Every commit message ends with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Run all commands from `/Users/tomastello/doitwithme-phase1`. Do not push.

## Review Focus

Failure modes the spec implies but no feature test would exercise by default. Each has a pinned test in the task named.

1. An old data file without the new fields must load and get defaults, not fail validation (Task 1).
2. Path traversal in every encoding (`..`, `%2e%2e`, `..%2f`, `%5c`, null byte, a symlink inside `public/`) must never return a file from outside `public/` (Task 6).
3. Action endpoints with garbage (bad or past date, a 301-character key, `text/plain`) must give a 4xx and leave the data file byte-for-byte unchanged; approving the same date twice must not duplicate it (Task 5).
4. An offer must never promise minutes the replan does not deliver: approving the offered date reduces the shortfall by exactly the offered minutes (Task 3).
5. A dismissed warning must reappear when its shortfall changes, and the dismissed list must not grow without bound (Task 4 and Task 5).

## File Structure

```
src/
  types.ts      (modify) Preferences.softMode, State.approvedSoft/dismissed, Warning.detail/soft-offer, PlanInput.approvedSoft
  defaults.ts   (modify) softMode: 'ask'
  validate.ts   (modify) new fields, str() max, action request validators
  store.ts      (modify) emptyState fields
  planner.ts    (modify) warning detail, ask mode, offers
  replan.ts     (modify) approvedSoft pass-through, dismissed pruning, warningKey, describeWarnings
  server.ts     (modify) action endpoints, decorated warnings, static files, security headers, /api/example
test/
  validate.test.ts, store.test.ts, warnings.test.ts, soft.test.ts   (modify)
  ask.test.ts, replan.test.ts (append), server.actions.test.ts, server.static.test.ts   (new / append)
```

---

### Task 1: New state fields, defaults and validation

**Files:**
- Modify: `src/types.ts`, `src/defaults.ts`, `src/store.ts`, `src/validate.ts`
- Modify (tests): `test/validate.test.ts`, `test/store.test.ts`, `test/soft.test.ts`

**Interfaces:**
- Produces: `Preferences.softMode: 'ask' | 'auto'` (default `'ask'`); `State.approvedSoft: DateStr[]`; `State.dismissed: string[]`; `PlanInput.approvedSoft?: DateStr[]`; `Warning.detail?: WarningDetail` and warning kind `'soft-offer'`; `WarningDetail = { taskTitle?, kind?, dueDate?, weekStart?, date?, titles?: string[], minutes? }`. `validateState` fills defaults when the new fields are missing.

- [ ] **Step 1: Write the failing tests**

Append to `test/validate.test.ts`:

```ts
test('new fields default when missing, so old data files still load', () => {
  const old = sample();
  delete old.approvedSoft;
  delete old.dismissed;
  delete old.preferences.softMode;
  const s = validateState(old);
  assert.deepEqual(s.approvedSoft, []);
  assert.deepEqual(s.dismissed, []);
  assert.equal(s.preferences.softMode, 'ask');
});

test('softMode must be ask or auto', () => {
  rejects((s) => (s.preferences.softMode = 'sometimes'), /softMode/);
  assert.equal(validateState({ ...sample(), preferences: { ...sample().preferences, softMode: 'auto' } }).preferences.softMode, 'auto');
});

test('approvedSoft entries must be real, unique dates and at most 400', () => {
  rejects((s) => (s.approvedSoft = ['2026-02-31']), /approvedSoft\[0\]/);
  rejects((s) => (s.approvedSoft = ['2026-10-09', '2026-10-09']), /approvedSoft.*duplicate/);
  rejects(
    (s) => (s.approvedSoft = Array.from({ length: 401 }, (_, i) => `2027-01-${String((i % 28) + 1).padStart(2, '0')}`)),
    /approvedSoft/,
  );
});

test('dismissed entries must be text up to 300 characters and at most 400', () => {
  rejects((s) => (s.dismissed = ['x'.repeat(301)]), /dismissed\[0\]/);
  rejects((s) => (s.dismissed = ['']), /dismissed\[0\]/);
  rejects((s) => (s.dismissed = Array.from({ length: 401 }, (_, i) => `k${i}`)), /dismissed/);
});
```

Append to `test/store.test.ts`:

```ts
test('a data file saved before the new fields existed still loads with defaults', () => {
  const path = join(dir(), 'db.json');
  const old: any = { ...emptyState() };
  delete old.approvedSoft;
  delete old.dismissed;
  delete old.preferences.softMode;
  writeFileSync(path, JSON.stringify(old));
  const s = loadState(path);
  assert.deepEqual(s.approvedSoft, []);
  assert.deepEqual(s.dismissed, []);
  assert.equal(s.preferences.softMode, 'ask');
});
```

In `test/soft.test.ts`, the existing tests rely on today's automatic behavior, so pin it explicitly. Replace the `evening` helper:

```ts
const evening = (): Preferences => ({
  ...structuredClone(defaultPreferences),
  weekdayWindow: { start: 1080, end: 1200 },
  dayOffWindow: { start: 1080, end: 1200 },
  daysOff: [],
  softWindows: [{ weekday: 5, start: 1080, end: 1440 }],
  softMode: 'auto',
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npm test`
Expected: FAIL on the four new validate tests and the new store test (`approvedSoft` and `softMode` are not known yet). All older tests still pass.

- [ ] **Step 3: Implement**

In `src/types.ts`, change `Preferences`, `Warning`, `PlanInput` and `State`:

```ts
export interface Preferences {
  weekdayWindow: Window;
  dayOffWindow: Window;
  daysOff: number[];
  minBlock: Minutes;
  minBreak: Minutes;
  softWindows: SoftWindow[];
  softMode: 'ask' | 'auto';
}
```

```ts
export interface WarningDetail {
  taskTitle?: string;
  kind?: string;
  dueDate?: DateStr;
  weekStart?: DateStr;
  date?: DateStr;
  titles?: string[];
  minutes?: number;
}

export interface Warning {
  kind: 'deadline-short' | 'weekly-short' | 'soft-time-used' | 'soft-offer';
  message: string;
  detail?: WarningDetail;
}
```

In `PlanInput` add after `pastBlocks: Block[];`:

```ts
  approvedSoft?: DateStr[];
```

In `State` add after `blocks: Block[];`:

```ts
  approvedSoft: DateStr[];
  dismissed: string[];
```

In `src/defaults.ts`, replace the closing of the object:

```ts
    { weekday: 6, start: 18 * 60, end: 24 * 60 },
  ],
  softMode: 'ask',
};
```

In `src/store.ts`, `emptyState()` gains two fields:

```ts
    blocks: [],
    approvedSoft: [],
    dismissed: [],
  };
```

In `src/validate.ts`:

1. Replace the `str` helper with a version that takes a maximum:

```ts
function str(v: unknown, path: string, max = 200): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > max) fail(`${path} must be text of 1 to ${max} characters`);
  return v as string;
}
```

2. In `preferences()`, add `softMode` to the object literal, right after the `minBreak` line:

```ts
    minBreak: int(o.minBreak, `${path}.minBreak`, 0, 120),
    softMode: o.softMode === undefined ? 'ask' : softMode(o.softMode, `${path}.softMode`),
```

and add this helper above `preferences()`:

```ts
function softMode(v: unknown, path: string): 'ask' | 'auto' {
  if (v !== 'ask' && v !== 'auto') fail(`${path} must be "ask" or "auto"`);
  return v as 'ask' | 'auto';
}
```

3. Add list validators above `validateState`:

```ts
function approvedSoft(v: unknown): string[] {
  const list = arr(v ?? [], 'approvedSoft');
  if (list.length > 400) fail('approvedSoft must have at most 400 dates');
  const dates = list.map((d, i) => dateStr(d, `approvedSoft[${i}]`));
  if (new Set(dates).size !== dates.length) fail('approvedSoft contains a duplicate date');
  return dates;
}

function dismissed(v: unknown): string[] {
  const list = arr(v ?? [], 'dismissed');
  if (list.length > 400) fail('dismissed must have at most 400 entries');
  return list.map((k, i) => str(k, `dismissed[${i}]`, 300));
}
```

4. In `validateState`'s returned object, add the two fields after `blocks`:

```ts
    blocks: arr(o.blocks ?? [], 'blocks').map((b, i) => block(b, `blocks[${i}]`)),
    approvedSoft: approvedSoft(o.approvedSoft),
    dismissed: dismissed(o.dismissed),
  };
```

- [ ] **Step 4: Run to verify everything passes**

Run: `npm test`
Expected: PASS for every test file (the planner ignores `softMode` until Task 3, so nothing else changes).

- [ ] **Step 5: Commit**

```bash
git add src test
git commit -m "feat: add softMode, approvedSoft and dismissed with backward-compatible validation" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Structured warning details

**Files:**
- Modify: `src/planner.ts`
- Modify (tests): `test/warnings.test.ts`, `test/soft.test.ts`

**Interfaces:**
- Consumes: `WarningDetail` from Task 1.
- Produces: every warning the planner creates now carries `detail`:
  - `deadline-short`: `{ taskTitle, kind, dueDate, minutes }` where `kind` is the deadline kind (for example `exam`).
  - `weekly-short`: `{ taskTitle, weekStart, minutes }`.
  - `soft-time-used`: `{ date, titles, minutes }` (titles de-duplicated in order of first use, minutes the total length of the blocks inside soft windows that day).
  `message` text is unchanged.

- [ ] **Step 1: Update the tests so they fail**

In `test/warnings.test.ts`, replace the three expected-warning arrays:

```ts
  assert.deepEqual(result.warnings, [
    {
      kind: 'deadline-short',
      message: 'Study exam due 2026-10-07 is short by 420 min',
      detail: { taskTitle: 'Study', kind: 'exam', dueDate: '2026-10-07', minutes: 420 },
    },
  ]);
```

```ts
  assert.deepEqual(result.warnings, [
    {
      kind: 'weekly-short',
      message: 'Study is short by 180 min in the week of 2026-10-05',
      detail: { taskTitle: 'Study', weekStart: '2026-10-05', minutes: 180 },
    },
  ]);
```

```ts
  assert.deepEqual(result.warnings, [
    {
      kind: 'deadline-short',
      message: 'Study exam due 2026-10-01 is short by 60 min',
      detail: { taskTitle: 'Study', kind: 'exam', dueDate: '2026-10-01', minutes: 60 },
    },
  ]);
```

(They replace, respectively, the arrays in the tests "an unmeetable deadline is reported with the exact shortfall", "a weekly target that cannot fit is reported", and "an overdue deadline with work left is reported, not ignored".)

In `test/soft.test.ts`, replace the expected warnings of "soft time is used, and reported, when a deadline would otherwise be missed":

```ts
  assert.deepEqual(result.warnings, [
    {
      kind: 'soft-time-used',
      message: `Used soft free time on ${FRI} for Study`,
      detail: { date: FRI, titles: ['Study'], minutes: 120 },
    },
  ]);
```

and of "an errand with a deadline never takes soft time, and its shortfall is reported":

```ts
  assert.deepEqual(result.warnings, [
    {
      kind: 'deadline-short',
      message: `Taxes task due ${FRI} is short by 120 min`,
      detail: { taskTitle: 'Taxes', kind: 'task', dueDate: FRI, minutes: 120 },
    },
  ]);
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL: the five updated tests report that `detail` is missing from the actual warnings.

- [ ] **Step 3: Implement**

In `src/planner.ts`, in `shortfalls()`, replace the two `warning:` objects:

```ts
        warning: {
          kind: 'deadline-short',
          message: `${task.title} ${dl.kind} due ${dl.dueDate} is short by ${rem} min`,
          detail: { taskTitle: task.title, kind: dl.kind, dueDate: dl.dueDate, minutes: rem },
        },
```

```ts
          warning: {
            kind: 'weekly-short',
            message: `${task.title} is short by ${task.weeklyMinutes - done} min in the week of ${ws}`,
            detail: { taskTitle: task.title, weekStart: ws, minutes: task.weeklyMinutes - done },
          },
```

and in `softUseWarnings()` replace the body of `if (used.length > 0) { ... }`:

```ts
    if (used.length > 0) {
      const titles = [...new Set(used.map((b) => b.title))];
      out.push({
        kind: 'soft-time-used',
        message: `Used soft free time on ${date} for ${titles.join(', ')}`,
        detail: { date, titles, minutes: minutesOf(used) },
      });
    }
```

- [ ] **Step 4: Run to verify everything passes**

Run: `npm test`
Expected: PASS for every test file.

- [ ] **Step 5: Commit**

```bash
git add src test
git commit -m "feat: add structured detail to planner warnings" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Ask mode, approved dates and offers

**Files:**
- Modify: `src/planner.ts` (replace `plan()`)
- Test: `test/ask.test.ts`

**Interfaces:**
- Consumes: `Preferences.softMode`, `PlanInput.approvedSoft`, `Warning.detail`, `shortfalls`, `softUseWarnings`, `planDays` (existing).
- Produces: `plan(input)` behavior:
  - `softMode: 'auto'`: unchanged from today, except dates in `approvedSoft` are always open.
  - `softMode: 'ask'`: only `approvedSoft` dates are open. If a study shortfall remains, the unopened soft date whose opening reduces the study shortfall most (earliest wins a tie) yields one extra warning `{ kind: 'soft-offer', message: 'Soft time on <date> could cover <n> min of study', detail: { date, minutes: n } }`, placed after the shortfall warnings. No offer when no soft date helps.
  - Warning order: `soft-time-used` warnings, then shortfall warnings, then the offer.

- [ ] **Step 1: Write the failing tests**

Create `test/ask.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plan } from '../src/planner.ts';
import { defaultPreferences } from '../src/defaults.ts';
import type { PlanResult, Preferences } from '../src/types.ts';
import { deadline, input, task } from './helpers.ts';

// Weekdays offer 18:00-20:00 only. Friday evening is a soft window.
const evening = (over: Partial<Preferences> = {}): Preferences => ({
  ...structuredClone(defaultPreferences),
  weekdayWindow: { start: 1080, end: 1200 },
  dayOffWindow: { start: 1080, end: 1200 },
  daysOff: [],
  softWindows: [{ weekday: 5, start: 1080, end: 1440 }],
  softMode: 'ask',
  ...over,
});

const FRI = '2026-10-09';
const missing = (r: PlanResult): number =>
  r.warnings
    .filter((w) => w.kind === 'weekly-short' || w.kind === 'deadline-short')
    .reduce((t, w) => t + (w.detail?.minutes ?? 0), 0);

test('ask mode never opens soft time by itself and offers the best date', () => {
  const result = plan(input({ preferences: evening(), tasks: [task({ weeklyMinutes: 5000 })] }));
  assert.equal(result.blocks.filter((b) => b.date === FRI).length, 0);
  assert.deepEqual(result.warnings, [
    {
      kind: 'weekly-short',
      message: 'Study is short by 4280 min in the week of 2026-10-05',
      detail: { taskTitle: 'Study', weekStart: '2026-10-05', minutes: 4280 },
    },
    {
      kind: 'soft-offer',
      message: `Soft time on ${FRI} could cover 120 min of study`,
      detail: { date: FRI, minutes: 120 },
    },
  ]);
});

test('an approved date is used and reported, and no further offer is made', () => {
  const result = plan(
    input({ preferences: evening(), approvedSoft: [FRI], tasks: [task({ weeklyMinutes: 5000 })] }),
  );
  const friday = result.blocks.filter((b) => b.date === FRI);
  assert.equal(friday.length, 1);
  assert.equal(friday[0].end - friday[0].start, 120);
  assert.deepEqual(result.warnings, [
    {
      kind: 'soft-time-used',
      message: `Used soft free time on ${FRI} for Study`,
      detail: { date: FRI, titles: ['Study'], minutes: 120 },
    },
    {
      kind: 'weekly-short',
      message: 'Study is short by 4160 min in the week of 2026-10-05',
      detail: { taskTitle: 'Study', weekStart: '2026-10-05', minutes: 4160 },
    },
  ]);
});

test('a deadline shortfall also gets an offer', () => {
  const result = plan(
    input({
      preferences: evening(),
      tasks: [task()],
      deadlines: [deadline({ dueDate: FRI, effortMinutes: 600 })],
    }),
  );
  assert.deepEqual(result.warnings, [
    {
      kind: 'deadline-short',
      message: `Study exam due ${FRI} is short by 120 min`,
      detail: { taskTitle: 'Study', kind: 'exam', dueDate: FRI, minutes: 120 },
    },
    {
      kind: 'soft-offer',
      message: `Soft time on ${FRI} could cover 120 min of study`,
      detail: { date: FRI, minutes: 120 },
    },
  ]);
});

test('a tie between soft dates goes to the earliest', () => {
  const both = evening({
    softWindows: [
      { weekday: 5, start: 1080, end: 1440 },
      { weekday: 6, start: 1080, end: 1440 },
    ],
  });
  const result = plan(input({ preferences: both, tasks: [task({ weeklyMinutes: 5000 })] }));
  const offer = result.warnings.find((w) => w.kind === 'soft-offer');
  assert.equal(offer?.detail?.date, FRI);
});

test('non-study shortfalls never get an offer', () => {
  const result = plan(
    input({
      preferences: evening(),
      tasks: [task({ id: 'chores', title: 'Chores', category: 'chores', weeklyMinutes: 5000 })],
    }),
  );
  assert.ok(result.warnings.every((w) => w.kind !== 'soft-offer'));
  assert.equal(result.blocks.filter((b) => b.date === FRI).length, 0);
});

test('an offer is a promise: approving its date recovers exactly the offered minutes', () => {
  const base = input({ preferences: evening(), tasks: [task({ weeklyMinutes: 5000 })] });
  const before = plan(base);
  const offer = before.warnings.find((w) => w.kind === 'soft-offer');
  assert.ok(offer?.detail?.date);
  const after = plan({ ...base, approvedSoft: [offer.detail.date] });
  assert.equal(missing(before) - missing(after), offer.detail.minutes);
});

test('auto mode still opens soft time on its own', () => {
  const result = plan(
    input({
      preferences: evening({ softMode: 'auto' }),
      tasks: [task({ weeklyMinutes: 5000 })],
    }),
  );
  assert.equal(result.blocks.filter((b) => b.date === FRI).length, 1);
  assert.ok(result.warnings.every((w) => w.kind !== 'soft-offer'));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/ask.test.ts`
Expected: FAIL. Today the planner ignores `softMode`, so the first test sees a Friday block and no offer.

- [ ] **Step 3: Implement**

In `src/planner.ts`, replace everything from `export function plan(input: PlanInput): PlanResult {` to the end of the file with:

```ts
const studyDeficit = (found: Shortfall[]): number =>
  found.filter((f) => f.category === 'study').reduce((t, f) => t + f.minutes, 0);

export function plan(input: PlanInput): PlanResult {
  const softDates = Array.from({ length: input.horizonDays }, (_, i) => addDays(input.today, i)).filter(
    (d) => input.preferences.softWindows.some((s) => s.weekday === weekdayOf(d)),
  );
  const opened = new Set<DateStr>(input.approvedSoft ?? []);
  const candidates = softDates.filter((d) => !opened.has(d));
  const run = (open: ReadonlySet<DateStr>) => {
    const blocks = planDays(input, open);
    return { blocks, found: shortfalls(input, [...input.pastBlocks, ...blocks]) };
  };

  let { blocks, found } = run(opened);
  let deficit = studyDeficit(found);
  let offer: { date: DateStr; minutes: number } | null = null;

  if (input.preferences.softMode === 'auto') {
    for (const date of candidates) {
      if (deficit === 0) break;
      const trial = run(new Set(opened).add(date));
      const trialDeficit = studyDeficit(trial.found);
      if (trialDeficit < deficit) {
        opened.add(date);
        blocks = trial.blocks;
        found = trial.found;
        deficit = trialDeficit;
      }
    }
  } else if (deficit > 0) {
    for (const date of candidates) {
      const gain = deficit - studyDeficit(run(new Set(opened).add(date)).found);
      if (gain > 0 && (offer === null || gain > offer.minutes)) offer = { date, minutes: gain };
    }
  }

  const warnings: Warning[] = [...softUseWarnings(input, blocks, opened), ...found.map((s) => s.warning)];
  if (offer) {
    warnings.push({
      kind: 'soft-offer',
      message: `Soft time on ${offer.date} could cover ${offer.minutes} min of study`,
      detail: { date: offer.date, minutes: offer.minutes },
    });
  }
  return { blocks, warnings };
}
```

- [ ] **Step 4: Run to verify everything passes**

Run: `npm test`
Expected: PASS for every test file, including the unchanged auto-mode tests in `test/soft.test.ts` (they pin `softMode: 'auto'` since Task 1).

- [ ] **Step 5: Commit**

```bash
git add src test
git commit -m "feat: ask mode with approved soft dates and offers" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Replan keeps approvals current and prunes dismissals

**Files:**
- Modify: `src/replan.ts` (replace whole file)
- Test: `test/replan.test.ts` (append)

**Interfaces:**
- Consumes: `plan`, `Warning`, `State.approvedSoft`, `State.dismissed`.
- Produces:
  - `warningKey(w: Warning): string` returns `` `${w.kind}|${w.message}` ``.
  - `DescribedWarning = Warning & { key: string; dismissed: boolean }` and `describeWarnings(warnings: Warning[], dismissed: string[]): DescribedWarning[]`.
  - `replan(...)` now passes `approvedSoft` (dates before `today` dropped) to the planner, and returns a state whose `dismissed` keeps only keys that match a current warning.

- [ ] **Step 1: Write the failing tests**

Append to `test/replan.test.ts` (add the imports it needs at the top: `import { describeWarnings, warningKey } from '../src/replan.ts';` merged with the existing `replan` import, and `import { defaultPreferences } from '../src/defaults.ts';`):

```ts
const eveningPrefs = () => ({
  ...structuredClone(defaultPreferences),
  weekdayWindow: { start: 1080, end: 1200 },
  dayOffWindow: { start: 1080, end: 1200 },
  daysOff: [],
  softWindows: [{ weekday: 5, start: 1080, end: 1440 }],
  softMode: 'ask' as const,
});

function studyState(over: Partial<State> = {}): State {
  return { ...emptyState(), preferences: eveningPrefs(), tasks: [task({ weeklyMinutes: 5000 })], ...over };
}

test('an approved date is honored by the replan', () => {
  const { state } = replan(studyState({ approvedSoft: ['2026-10-09'] }), '2026-10-05', undefined, 7);
  assert.equal(state.blocks.filter((b) => b.date === '2026-10-09').length, 1);
});

test('approved dates in the past are dropped, future ones kept', () => {
  const { state } = replan(studyState({ approvedSoft: ['2026-10-01', '2026-10-09'] }), '2026-10-05', undefined, 7);
  assert.deepEqual(state.approvedSoft, ['2026-10-09']);
});

test('warningKey joins kind and message', () => {
  assert.equal(warningKey({ kind: 'weekly-short', message: 'Gym is short' }), 'weekly-short|Gym is short');
});

test('describeWarnings adds a key and a dismissed flag', () => {
  const w = { kind: 'weekly-short' as const, message: 'Gym is short' };
  assert.deepEqual(describeWarnings([w], ['weekly-short|Gym is short']), [
    { ...w, key: 'weekly-short|Gym is short', dismissed: true },
  ]);
  assert.equal(describeWarnings([w], [])[0].dismissed, false);
});

test('dismissed keys that no longer match a warning are pruned, matching ones kept', () => {
  const first = replan(studyState(), '2026-10-05', undefined, 7);
  const offer = first.warnings.find((w) => w.kind === 'soft-offer');
  assert.ok(offer);
  const key = warningKey(offer);
  const withDismissed = studyState({ dismissed: [key, 'stale|gone'] });
  assert.deepEqual(replan(withDismissed, '2026-10-05', undefined, 7).state.dismissed, [key]);
});

test('a dismissed warning is forgotten once its shortfall disappears', () => {
  const first = replan(studyState(), '2026-10-05', undefined, 7);
  const key = warningKey(first.warnings.find((w) => w.kind === 'soft-offer')!);
  const fixed = studyState({ tasks: [task({ weeklyMinutes: 100 })], dismissed: [key] });
  assert.deepEqual(replan(fixed, '2026-10-05', undefined, 7).state.dismissed, []);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/replan.test.ts`
Expected: FAIL: `warningKey` and `describeWarnings` are not exported, and approved dates are not passed through.

- [ ] **Step 3: Implement**

Replace the whole of `src/replan.ts` with:

```ts
import { addDays, weekStart } from './dates.ts';
import { plan } from './planner.ts';
import type { Block, DateStr, Minutes, State, Warning } from './types.ts';

export const warningKey = (w: Warning): string => `${w.kind}|${w.message}`;

export interface DescribedWarning extends Warning {
  key: string;
  dismissed: boolean;
}

export function describeWarnings(warnings: Warning[], dismissed: string[]): DescribedWarning[] {
  return warnings.map((w) => ({ ...w, key: warningKey(w), dismissed: dismissed.includes(warningKey(w)) }));
}

export function replan(
  state: State,
  today: DateStr,
  nowMinutes?: Minutes,
  horizonDays = 14,
): { state: State; warnings: Warning[] } {
  const kept: Block[] = [];
  for (const b of state.blocks) {
    if (b.date < today) kept.push(b);
    else if (b.date === today && nowMinutes !== undefined && b.start < nowMinutes) {
      kept.push(b.end <= nowMinutes ? b : { ...b, end: nowMinutes });
    }
  }
  // The planner only needs this week and the day before it (weekly targets,
  // rest days) plus blocks tagged to a deadline. Older history only slows it down.
  const cutoff = addDays(weekStart(today), -1);
  const relevant = kept.filter((b) => b.date >= cutoff || b.deadlineId !== undefined);
  const approvedSoft = state.approvedSoft.filter((d) => d >= today);
  const result = plan({
    today,
    ...(nowMinutes === undefined ? {} : { nowMinutes }),
    horizonDays,
    commitments: state.commitments,
    tasks: state.tasks,
    deadlines: state.deadlines,
    preferences: state.preferences,
    pastBlocks: relevant,
    approvedSoft,
  });
  const open = new Set(result.warnings.map(warningKey));
  const dismissed = state.dismissed.filter((k) => open.has(k));
  return {
    state: { ...state, approvedSoft, dismissed, blocks: [...kept, ...result.blocks] },
    warnings: result.warnings,
  };
}
```

- [ ] **Step 4: Run to verify everything passes**

Run: `npm test`
Expected: PASS for every test file.

- [ ] **Step 5: Commit**

```bash
git add src test
git commit -m "feat: replan honors approved soft dates and prunes dismissals" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Nudge action endpoints

**Files:**
- Modify: `src/validate.ts`, `src/server.ts` (replace whole file)
- Test: `test/server.actions.test.ts`

**Interfaces:**
- Consumes: `describeWarnings`, `replan`, `loadState`, `saveState`, validators.
- Produces:
  - `validateSoftRequest(x)` returns `{ today, nowMinutes?, horizonDays, date }`; `validateDismissRequest(x)` returns `{ today, nowMinutes?, horizonDays, key }` (key 1 to 300 characters); `validateReplanRequest` keeps its shape.
  - `POST /api/soft/approve`, `POST /api/soft/undo` (body `{ today, nowMinutes?, horizonDays?, date }`) and `POST /api/warnings/dismiss` (body `{ today, nowMinutes?, horizonDays?, key }`). Each mutates the stored state, replans, saves, and answers `{ blocks, warnings, approvedSoft, dismissed }` where every warning also carries `key` and `dismissed`.
  - Approve rejects a date before `today` (400) and is idempotent. Undo is idempotent. Lists are capped at 400 entries (400 error beyond that).
  - `POST /api/replan` now returns the same response shape (a superset of before).

- [ ] **Step 1: Write the failing tests**

Create `test/server.actions.test.ts`:

```ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { createApp } from '../src/server.ts';
import { emptyState } from '../src/store.ts';
import { defaultPreferences } from '../src/defaults.ts';
import { task } from './helpers.ts';

let server: Server;
let base: string;
let file: string;

const FRI = '2026-10-09';
const json = { 'content-type': 'application/json' };
const clock = { today: '2026-10-05', horizonDays: 7 };
const post = (path: string, body: unknown, headers: Record<string, string> = json) =>
  fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });

before(async () => {
  file = join(mkdtempSync(join(tmpdir(), 'doitwithme-actions-')), 'db.json');
  server = createApp(file);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const state = {
    ...emptyState(),
    tasks: [task({ weeklyMinutes: 5000 })],
    preferences: {
      ...structuredClone(defaultPreferences),
      weekdayWindow: { start: 1080, end: 1200 },
      dayOffWindow: { start: 1080, end: 1200 },
      daysOff: [],
      softWindows: [{ weekday: 5, start: 1080, end: 1440 }],
      softMode: 'ask',
    },
  };
  const res = await fetch(`${base}/api/state`, { method: 'PUT', headers: json, body: JSON.stringify(state) });
  assert.equal(res.status, 200);
});

after(() => {
  server.close();
});

test('replan returns warnings with a key and a dismissed flag, and an offer', async () => {
  const body = await (await post('/api/replan', clock)).json();
  assert.equal(body.blocks.filter((b: any) => b.date === FRI).length, 0);
  assert.ok(body.warnings.every((w: any) => typeof w.key === 'string' && w.dismissed === false));
  assert.equal(body.warnings.find((w: any) => w.kind === 'soft-offer').detail.date, FRI);
});

test('approve opens the date, replans, and is idempotent', async () => {
  const first = await post('/api/soft/approve', { ...clock, date: FRI });
  assert.equal(first.status, 200);
  const a = await first.json();
  assert.equal(a.blocks.filter((b: any) => b.date === FRI).length, 1);
  assert.deepEqual(a.approvedSoft, [FRI]);
  assert.ok(a.warnings.some((w: any) => w.kind === 'soft-time-used'));
  const b = await (await post('/api/soft/approve', { ...clock, date: FRI })).json();
  assert.deepEqual(b.approvedSoft, [FRI]);
});

test('undo takes the date back out and replans', async () => {
  const body = await (await post('/api/soft/undo', { ...clock, date: FRI })).json();
  assert.deepEqual(body.approvedSoft, []);
  assert.equal(body.blocks.filter((b: any) => b.date === FRI).length, 0);
  const again = await (await post('/api/soft/undo', { ...clock, date: FRI })).json();
  assert.deepEqual(again.approvedSoft, []);
});

test('dismiss marks the warning dismissed and keeps its key', async () => {
  const before = await (await post('/api/replan', clock)).json();
  const key = before.warnings.find((w: any) => w.kind === 'soft-offer').key;
  const body = await (await post('/api/warnings/dismiss', { ...clock, key })).json();
  assert.deepEqual(body.dismissed, [key]);
  assert.equal(body.warnings.find((w: any) => w.key === key).dismissed, true);
  const twice = await (await post('/api/warnings/dismiss', { ...clock, key })).json();
  assert.deepEqual(twice.dismissed, [key]);
});

test('garbage is a 4xx and leaves the data file byte-for-byte unchanged', async () => {
  const snapshot = readFileSync(file, 'utf8');
  const cases: Array<[string, unknown, number, Record<string, string>?]> = [
    ['/api/soft/approve', { ...clock, date: 'nope' }, 400],
    ['/api/soft/approve', { ...clock, date: '2026-02-31' }, 400],
    ['/api/soft/approve', { ...clock, date: '2026-10-01' }, 400],
    ['/api/soft/approve', { date: FRI }, 400],
    ['/api/soft/undo', { ...clock, date: 5 }, 400],
    ['/api/warnings/dismiss', { ...clock, key: 'x'.repeat(301) }, 400],
    ['/api/warnings/dismiss', { ...clock, key: '' }, 400],
    ['/api/soft/approve', { ...clock, date: FRI }, 415, { 'content-type': 'text/plain' }],
  ];
  for (const [path, body, status, headers] of cases) {
    const res = await post(path, body, headers);
    assert.equal(res.status, status, `${path} ${JSON.stringify(body)}`);
  }
  assert.equal(readFileSync(file, 'utf8'), snapshot);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/server.actions.test.ts`
Expected: FAIL: the new routes answer 404 and warnings carry no `key`.

- [ ] **Step 3: Implement the validators**

In `src/validate.ts`, replace the existing `validateReplanRequest` function (at the end of the file) with:

```ts
function replanFields(o: Record<string, unknown>): { today: string; nowMinutes?: number; horizonDays: number } {
  return {
    today: dateStr(o.today, 'today'),
    ...(o.nowMinutes === undefined ? {} : { nowMinutes: int(o.nowMinutes, 'nowMinutes', 0, 1440) }),
    horizonDays: o.horizonDays === undefined ? 14 : int(o.horizonDays, 'horizonDays', 1, 60),
  };
}

export function validateReplanRequest(x: unknown): { today: string; nowMinutes?: number; horizonDays: number } {
  return replanFields(obj(x, 'request'));
}

export function validateSoftRequest(x: unknown): {
  today: string;
  nowMinutes?: number;
  horizonDays: number;
  date: string;
} {
  const o = obj(x, 'request');
  return { ...replanFields(o), date: dateStr(o.date, 'date') };
}

export function validateDismissRequest(x: unknown): {
  today: string;
  nowMinutes?: number;
  horizonDays: number;
  key: string;
} {
  const o = obj(x, 'request');
  return { ...replanFields(o), key: str(o.key, 'key', 300) };
}
```

- [ ] **Step 4: Implement the server**

Replace the whole of `src/server.ts` with:

```ts
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { describeWarnings, replan } from './replan.ts';
import { loadState, saveState } from './store.ts';
import type { State } from './types.ts';
import {
  ValidationError,
  validateDismissRequest,
  validateReplanRequest,
  validateSoftRequest,
  validateState,
} from './validate.ts';

const MAX_BODY = 1_000_000;
const MAX_LIST = 400;
const ALLOWED_HOSTS = /^(localhost|127\.0\.0\.1)(:\d+)?$/;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const type = req.headers['content-type'] ?? '';
  if (!type.startsWith('application/json')) {
    throw new HttpError(415, 'Content-Type must be application/json');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'Body is too large');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Body is not valid JSON');
  }
}

interface Clock {
  today: string;
  nowMinutes?: number;
  horizonDays: number;
}

function replanAndSave(statePath: string, state: State, clock: Clock) {
  const result = replan(state, clock.today, clock.nowMinutes, clock.horizonDays);
  saveState(statePath, result.state);
  return {
    blocks: result.state.blocks,
    warnings: describeWarnings(result.warnings, result.state.dismissed),
    approvedSoft: result.state.approvedSoft,
    dismissed: result.state.dismissed,
  };
}

export function createApp(statePath: string): Server {
  return createServer(async (req, res) => {
    try {
      if (!ALLOWED_HOSTS.test(req.headers.host ?? '')) throw new HttpError(403, 'Forbidden host');
      const { pathname } = new URL(req.url ?? '/', 'http://localhost');

      if (req.method === 'GET' && pathname === '/api/state') {
        return send(res, 200, loadState(statePath));
      }
      if (req.method === 'PUT' && pathname === '/api/state') {
        const state = validateState(await readJson(req));
        saveState(statePath, state);
        return send(res, 200, { ok: true });
      }
      if (req.method === 'POST' && pathname === '/api/replan') {
        const request = validateReplanRequest(await readJson(req));
        return send(res, 200, replanAndSave(statePath, loadState(statePath), request));
      }
      if (req.method === 'POST' && pathname === '/api/soft/approve') {
        const request = validateSoftRequest(await readJson(req));
        if (request.date < request.today) throw new HttpError(400, 'date must not be in the past');
        const state = loadState(statePath);
        if (!state.approvedSoft.includes(request.date)) {
          if (state.approvedSoft.length >= MAX_LIST) throw new HttpError(400, 'too many approved dates');
          state.approvedSoft = [...state.approvedSoft, request.date];
        }
        return send(res, 200, replanAndSave(statePath, state, request));
      }
      if (req.method === 'POST' && pathname === '/api/soft/undo') {
        const request = validateSoftRequest(await readJson(req));
        const state = loadState(statePath);
        state.approvedSoft = state.approvedSoft.filter((d) => d !== request.date);
        return send(res, 200, replanAndSave(statePath, state, request));
      }
      if (req.method === 'POST' && pathname === '/api/warnings/dismiss') {
        const request = validateDismissRequest(await readJson(req));
        const state = loadState(statePath);
        if (!state.dismissed.includes(request.key)) {
          if (state.dismissed.length >= MAX_LIST) throw new HttpError(400, 'too many dismissed warnings');
          state.dismissed = [...state.dismissed, request.key];
        }
        return send(res, 200, replanAndSave(statePath, state, request));
      }
      throw new HttpError(404, 'Not found');
    } catch (err) {
      const status = err instanceof HttpError ? err.status : err instanceof ValidationError ? 400 : 500;
      send(res, status, { error: err instanceof Error ? err.message : String(err) });
    }
  });
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 8787);
  const file = process.env.DATA_FILE ?? 'data/db.json';
  createApp(file).listen(port, '127.0.0.1', () => {
    console.log(`Listening on http://127.0.0.1:${port} (data file: ${file})`);
  });
}
```

- [ ] **Step 5: Run to verify everything passes**

Run: `npm test`
Expected: PASS for every test file, including the older `test/server.test.ts` (the replan response is a superset of the old one).

- [ ] **Step 6: Commit**

```bash
git add src test
git commit -m "feat: add approve, undo and dismiss endpoints for Nudge" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Static files, security headers and the example endpoint

**Files:**
- Modify: `src/server.ts`
- Test: `test/server.static.test.ts`

**Interfaces:**
- Consumes: `createApp` from Task 5.
- Produces:
  - `createApp(statePath, options?: { publicDir?: string; exampleFile?: string })`. Defaults: `public/` and `examples/sample-state.json` next to the source folder.
  - `GET` and `HEAD` for any non-`/api/` path serve files under `publicDir` only (`/` serves `index.html`). Known content types only (`.html .css .js .json .svg .woff2 .png .ico .txt`); anything else is 404. The resolved real path (symlinks followed) must lie inside `publicDir`, else 404. Paths containing a null byte or backslash after decoding, or that fail to decode, are 404 or 400. Other methods on non-API paths are 404.
  - Every response (API and static) carries `Content-Security-Policy: default-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`. Static responses also carry `Cache-Control: no-store`.
  - `GET /api/example` returns the validated example state and writes nothing.

- [ ] **Step 1: Write the failing tests**

Create `test/server.static.test.ts`:

```ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';

let server: Server;
let port: number;
let stateFile: string;

before(async () => {
  const root = mkdtempSync(join(tmpdir(), 'doitwithme-static-'));
  const pub = join(root, 'public');
  mkdirSync(pub);
  writeFileSync(join(pub, 'index.html'), '<h1>home</h1>');
  writeFileSync(join(pub, 'app.js'), 'export {};');
  writeFileSync(join(pub, 'blob.exe'), 'x');
  writeFileSync(join(root, 'secret.txt'), 'TOPSECRET');
  symlinkSync(join(root, 'secret.txt'), join(pub, 'link.txt'));
  stateFile = join(root, 'db.json');
  server = createApp(stateFile, { publicDir: pub });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

after(() => {
  server.close();
});

function raw(path: string, method = 'GET'): Promise<{ status: number; headers: Record<string, any>; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('/ serves index.html with security headers', async () => {
  const r = await raw('/');
  assert.equal(r.status, 200);
  assert.equal(r.body, '<h1>home</h1>');
  assert.match(r.headers['content-type'], /text\/html/);
  assert.equal(r.headers['content-security-policy'], "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.equal(r.headers['referrer-policy'], 'no-referrer');
  assert.equal(r.headers['cache-control'], 'no-store');
});

test('scripts get a JavaScript content type', async () => {
  const r = await raw('/app.js');
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /text\/javascript/);
});

test('missing files and unknown file types are 404', async () => {
  assert.equal((await raw('/missing.js')).status, 404);
  assert.equal((await raw('/blob.exe')).status, 404);
});

test('path traversal in every encoding never returns a file from outside public', async () => {
  const attempts = [
    '/../secret.txt',
    '/%2e%2e/secret.txt',
    '/..%2fsecret.txt',
    '/%2e%2e%2fsecret.txt',
    '/..%5csecret.txt',
    '/%00',
    '/app.js%00.png',
    '/link.txt',
  ];
  for (const path of attempts) {
    const r = await raw(path);
    assert.ok(r.status === 404 || r.status === 400, `${path} gave ${r.status}`);
    assert.ok(!r.body.includes('TOPSECRET'), `${path} leaked the secret`);
  }
});

test('HEAD works without a body and other methods are 404', async () => {
  const head = await raw('/', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.equal((await raw('/', 'POST')).status, 404);
});

test('API responses carry the security headers too', async () => {
  const r = await raw('/api/state');
  assert.equal(r.status, 200);
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.match(r.headers['content-security-policy'], /default-src 'self'/);
});

test('/api/example returns a valid example state and writes nothing', async () => {
  const r = await raw('/api/example');
  assert.equal(r.status, 200);
  const state = JSON.parse(r.body);
  assert.ok(state.tasks.length > 0);
  assert.ok(Array.isArray(state.approvedSoft));
  assert.equal(existsSync(stateFile), false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/server.static.test.ts`
Expected: FAIL: `createApp` takes no options, `/` answers 404 and there are no security headers.

- [ ] **Step 3: Implement**

In `src/server.ts`:

1. Replace the first import line and add the new ones (keep the other imports as they are):

```ts
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
```

2. After the `ALLOWED_HOSTS` line, add:

```ts
const HEADERS = {
  'content-security-policy':
    "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const DEFAULT_PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const DEFAULT_EXAMPLE = fileURLToPath(new URL('../examples/sample-state.json', import.meta.url));
```

3. Replace `send` so every API response carries the headers:

```ts
function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { ...HEADERS, 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}
```

4. Add `serveStatic` above `createApp`:

```ts
function serveStatic(publicDir: string, pathname: string, method: string, res: ServerResponse): void {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    throw new HttpError(400, 'Bad path');
  }
  if (decoded.includes('\0') || decoded.includes('\\')) throw new HttpError(404, 'Not found');
  let root: string;
  try {
    root = realpathSync(publicDir);
  } catch {
    throw new HttpError(404, 'Not found');
  }
  const relative = decoded.endsWith('/') ? `${decoded}index.html` : decoded;
  const full = resolve(root, `.${relative}`);
  if (full !== root && !full.startsWith(root + sep)) throw new HttpError(404, 'Not found');
  const type = TYPES[extname(full).toLowerCase()];
  if (!type) throw new HttpError(404, 'Not found');
  let real: string;
  try {
    real = realpathSync(full);
  } catch {
    throw new HttpError(404, 'Not found');
  }
  if (!real.startsWith(root + sep) || !statSync(real).isFile()) throw new HttpError(404, 'Not found');
  res.writeHead(200, { ...HEADERS, 'content-type': type, 'cache-control': 'no-store' });
  res.end(method === 'HEAD' ? undefined : readFileSync(real));
}
```

5. Change the `createApp` signature and add the example route and the static fallthrough. Replace `export function createApp(statePath: string): Server {` with:

```ts
export function createApp(
  statePath: string,
  options: { publicDir?: string; exampleFile?: string } = {},
): Server {
  const publicDir = options.publicDir ?? DEFAULT_PUBLIC;
  const exampleFile = options.exampleFile ?? DEFAULT_EXAMPLE;
```

Add this route just before the final `throw new HttpError(404, 'Not found');` inside the `try`, and replace that `throw` with the fallthrough:

```ts
      if (req.method === 'GET' && pathname === '/api/example') {
        return send(res, 200, validateState(JSON.parse(readFileSync(exampleFile, 'utf8'))));
      }
      if ((req.method === 'GET' || req.method === 'HEAD') && !pathname.startsWith('/api/')) {
        return serveStatic(publicDir, pathname, req.method, res);
      }
      throw new HttpError(404, 'Not found');
```

- [ ] **Step 4: Run to verify everything passes**

Run: `npm test`
Expected: PASS for every test file. If a traversal attempt returns a file, stop and fix `serveStatic` before anything else; do not loosen the test.

- [ ] **Step 5: Commit**

```bash
git add src test
git commit -m "feat: serve public files safely with security headers and an example endpoint" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Documentation and final check

**Files:**
- Modify: `README.md`, `docs/superpowers/specs/2026-10-09-ui-design.md`

- [ ] **Step 1: Amend the spec**

In `docs/superpowers/specs/2026-10-09-ui-design.md`, insert this section immediately before the heading `## Planner changes needed by Nudge`:

```markdown
## Server endpoints for Nudge's actions

Nudge's buttons use dedicated endpoints instead of the UI rewriting the whole state, so a click can never overwrite a concurrent edit and each action is one atomic change followed by a replan. This supersedes the earlier "saves with PUT" wording in the Nudge section.

- `POST /api/soft/approve` `{ today, nowMinutes?, horizonDays?, date }`: adds `date` to `approvedSoft` (idempotent; a past date is a 400).
- `POST /api/soft/undo` (same body): removes `date`.
- `POST /api/warnings/dismiss` `{ today, nowMinutes?, horizonDays?, key }`: adds the warning key to `dismissed`.
- Each answers `{ blocks, warnings, approvedSoft, dismissed }`; every warning carries `key` and `dismissed`. `POST /api/replan` answers the same shape.
```

- [ ] **Step 2: Update the README**

In `README.md`, replace the API bullet list under "Your real data lives in `data/db.json`..." so it reads:

```markdown
- `GET /api/state` returns everything.
- `PUT /api/state` replaces it (validated; bad input is rejected and nothing is written).
- `POST /api/replan` with `{ "today": "2026-10-05", "nowMinutes": 780, "horizonDays": 14 }` re-plans from today and saves.
- `POST /api/soft/approve` and `POST /api/soft/undo` (with a `date`) allow or take back Friday and Saturday evenings; `POST /api/warnings/dismiss` (with a `key`) dismisses a warning.
- `GET /api/example` returns the example schedule without saving it.
```

and replace the soft-time bullet in "How planning works" with:

```markdown
- Friday and Saturday evenings are "soft". By default (`softMode: "ask"`) the planner never uses them by itself: when study would fall short it offers a date and waits for your yes. With `softMode: "auto"` it uses them for study as a last resort and tells you. Chores, gym and errands never take them.
```

- [ ] **Step 3: Run everything one last time**

Run: `npm test`
Expected: PASS, no skipped tests. Then run `node src/cli.ts examples/sample-state.json | tail -3`; expected: the plan prints and ends with `No warnings.` or a list of warnings (no crash).

Run: `git status --short`
Expected: only the two documentation files modified.

- [ ] **Step 4: Commit**

```bash
git add README.md docs
git commit -m "docs: describe ask mode and Nudge endpoints" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-review notes

- **Spec coverage:** `softMode`, `approvedSoft`, `dismissed`, structured warnings and offers (Tasks 1 to 3); approvals pruned and dismissals pruned (Task 4); Nudge actions, static serving, security headers, example endpoint (Tasks 5 and 6). Not covered here by design: every frontend file (separate plan after the user approved boards K and L).
- **Types:** `WarningDetail`, `softMode`, `approvedSoft`, `dismissed`, `describeWarnings`, `warningKey`, `validateSoftRequest`, `validateDismissRequest` are each defined in exactly one task and used with the same names later.
- **Known limits, stated plainly:** the code in this plan has not been run yet. Two existing test groups are edited on purpose (warning shapes in Task 2, `softMode: 'auto'` pinned in Task 1). The 413 oversize-body guard from Phase 1 still has no automated test.
