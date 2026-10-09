# Core Planner (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure-logic planner that fits flexible tasks and deadlines around fixed commitments, plus local storage, replanning, a small local JSON API, and a plain-text week printout. No graphical UI.

**Architecture:** A dependency-free TypeScript project run directly by Node's built-in type stripping. Pure functions (`dates`, `busy`, `slots`, `demand`, `planner`, `replan`) hold all scheduling logic. `validate` and `store` guard and persist one JSON state file. `server` exposes the state and replanning over HTTP on localhost. `format` and `cli` print the plan as text.

**Tech Stack:** Node 25 (`node:test`, `node:assert`, `node:http`, `node:fs`), TypeScript syntax executed via Node's type stripping. No npm dependencies (disk is nearly full), no build step, no type checker.

**Spec:** `docs/superpowers/specs/2026-10-08-study-planner-design.md` (Phase 1 only).

## Global Constraints

- Runs on the local machine only. No external services in this phase (no AI, no Maps, no Google).
- Zero npm dependencies. Node's built-in type stripping runs the `.ts` files: use `import type` for type-only imports, `.ts` extensions in import paths, no enums, no namespaces, no constructor parameter properties.
- The planner is pure logic and deterministic. No randomness, no clock reads inside planner code (`today` and `nowMinutes` are inputs).
- Dates are `YYYY-MM-DD` strings. Times are integer minutes since midnight. All date math is done in UTC so DST cannot shift a day.
- Re-planning never rewrites past days and never touches commitments.
- A deadline that cannot be met is always reported as a warning, never dropped silently.
- No UI is designed or built. The text printout is a debugging view, not a design. UI waits for the user's references.
- Personal data lives in `data/` which is gitignored. Only example data is committed.
- Every commit message ends with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Deferred from the spec (not in this plan, on purpose)

- **Errand grouping by location, and the Place entity:** needs addresses and commute, which is Phase 3.
- **Course entity and AI workload estimates:** Phase 2. Until then a study subject is a `Task` with category `study` and a weekly target the user types.
- **Category-based default priority table:** this phase uses a numeric `priority` (1 highest, 5 lowest) set per task. The sample file follows the spec's default order.
- **Check-in and class-attendance advice:** Phases 4 and 5.
- **Weekly-shortfall warnings** only cover weeks fully inside the planning horizon (default 14 days, so at least one full week is always covered).

## Review Focus

Failure modes the spec implies but no feature test would exercise by default. Each has a pinned test in the task named.

1. A task with `maxBlock` 0 must not hang or starve other tasks (Task 3 and Task 4).
2. A day completely covered by commitments produces no blocks, no crash, and honest shortfall warnings (Task 4 and Task 5).
3. A deadline due today still gets scheduled, and an already-overdue one produces a warning instead of silence (Task 3 and Task 5).
4. A corrupt data file must raise a clear error and never be overwritten with an empty state. Hostile or malformed API bodies (bad dates like 2026-02-31, wrong types, cross-site `text/plain` posts, wrong Host header) get a 4xx and leave the file untouched (Task 7 and Task 8).
5. Planning across a year boundary and across the Sunday-to-Monday week boundary keeps weekly targets correct (Task 1 and Task 4).

## File Structure

```
package.json
src/
  dates.ts       date helpers (UTC, Monday-based weeks)
  types.ts       all shared types
  defaults.ts    default preferences
  busy.ts        expand commitments into per-day occurrences / busy intervals
  slots.ts       subtract busy intervals from a window
  demand.ts      how much of each task/deadline is wanted today (the ramp)
  planner.ts     fill free slots day by day, warnings, soft-window opening
  replan.ts      keep the past, re-plan the rest
  validate.ts    ValidationError + strict validators for state and requests
  store.ts       load/save the JSON state file
  server.ts      local HTTP API
  format.ts      plain-text week printout
  cli.ts         `npm run plan`
test/
  helpers.ts     small builders used by tests
  *.test.ts      one per source file
examples/
  sample-state.json
```

---

### Task 1: Project scaffold and date helpers

**Files:**
- Create: `package.json`
- Create: `src/dates.ts`
- Test: `test/dates.test.ts`

**Interfaces:**
- Produces: `type DateStr = string`; `weekdayOf(d): number` (0 = Sunday); `addDays(d, n): DateStr`; `daysBetween(a, b): number` (b minus a); `weekStart(d): DateStr` (the Monday on or before `d`).

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "doitwithme",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test \"test/**/*.test.ts\"",
    "serve": "node src/server.ts",
    "plan": "node src/cli.ts"
  }
}
```

- [ ] **Step 2: Write the failing test**

Create `test/dates.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, daysBetween, weekdayOf, weekStart } from '../src/dates.ts';

test('weekdayOf returns 0 for Sunday and 4 for Thursday', () => {
  assert.equal(weekdayOf('2026-10-08'), 4);
  assert.equal(weekdayOf('2026-10-11'), 0);
});

test('addDays crosses month and year boundaries both ways', () => {
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2026-10-08', 0), '2026-10-08');
});

test('daysBetween counts calendar days and is signed', () => {
  assert.equal(daysBetween('2026-10-08', '2026-10-11'), 3);
  assert.equal(daysBetween('2026-10-11', '2026-10-08'), -3);
  assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1);
});

test('weekStart is the Monday on or before the date, Sunday included', () => {
  assert.equal(weekStart('2026-10-08'), '2026-10-05');
  assert.equal(weekStart('2026-10-05'), '2026-10-05');
  assert.equal(weekStart('2026-10-11'), '2026-10-05');
  assert.equal(weekStart('2027-01-01'), '2026-12-28');
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/dates.ts`. If instead it reports "no tests found" or the runner rejects `.ts` files, stop and report: the runner pattern or Node version is wrong.

- [ ] **Step 4: Write the implementation**

Create `src/dates.ts`:

```ts
export type DateStr = string;

const DAY_MS = 86_400_000;

const parse = (d: DateStr): number => Date.parse(`${d}T00:00:00Z`);

export function weekdayOf(d: DateStr): number {
  return new Date(parse(d)).getUTCDay();
}

export function addDays(d: DateStr, n: number): DateStr {
  return new Date(parse(d) + n * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(a: DateStr, b: DateStr): number {
  return Math.round((parse(b) - parse(a)) / DAY_MS);
}

export function weekStart(d: DateStr): DateStr {
  return addDays(d, -((weekdayOf(d) + 6) % 7));
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add package.json src/dates.ts test/dates.test.ts
git commit -m "feat: add date helpers and test runner" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Types, defaults, commitment occurrences, free slots

**Files:**
- Create: `src/types.ts`, `src/defaults.ts`, `src/busy.ts`, `src/slots.ts`
- Create: `test/helpers.ts`
- Test: `test/busy.test.ts`, `test/slots.test.ts`

**Interfaces:**
- Consumes: `DateStr`, `weekdayOf` from `src/dates.ts`.
- Produces:
  - Types in `src/types.ts` (exact definitions below).
  - `defaultPreferences: Preferences`.
  - `occurrencesOn(date, commitments): Occurrence[]` and `busyOn(date, commitments): Busy[]` where `Busy = { start, end, title }` already includes the buffer before the event.
  - `freeSlots(window: Window, busy: Window[]): Window[]`.
  - Test builders `task()`, `deadline()`, `commitment()`, `input()` in `test/helpers.ts`.

- [ ] **Step 1: Create the shared types**

Create `src/types.ts`:

```ts
import type { DateStr } from './dates.ts';
export type { DateStr };

export type Minutes = number;

export interface Window {
  start: Minutes;
  end: Minutes;
}

export type Pattern =
  | { kind: 'once'; date: DateStr }
  | { kind: 'weekly'; weekdays: number[]; from: DateStr; to: DateStr };

export interface Commitment {
  id: string;
  title: string;
  category: string;
  start: Minutes;
  end: Minutes;
  pattern: Pattern;
  exceptions: DateStr[];
  bufferBefore: Minutes;
}

export interface Task {
  id: string;
  title: string;
  category: string;
  weeklyMinutes: Minutes | null;
  maxBlock: Minutes;
  onePerDay: boolean;
  priority: number;
}

export interface Deadline {
  id: string;
  taskId: string;
  kind: string;
  dueDate: DateStr;
  effortMinutes: Minutes;
}

export interface SoftWindow extends Window {
  weekday: number;
}

export interface Preferences {
  weekdayWindow: Window;
  dayOffWindow: Window;
  daysOff: number[];
  minBlock: Minutes;
  minBreak: Minutes;
  softWindows: SoftWindow[];
}

export interface Block {
  taskId: string;
  title: string;
  category: string;
  date: DateStr;
  start: Minutes;
  end: Minutes;
  deadlineId?: string;
}

export interface Warning {
  kind: 'deadline-short' | 'weekly-short' | 'soft-time-used';
  message: string;
}

export interface PlanInput {
  today: DateStr;
  nowMinutes?: Minutes;
  horizonDays: number;
  commitments: Commitment[];
  tasks: Task[];
  deadlines: Deadline[];
  preferences: Preferences;
  pastBlocks: Block[];
}

export interface PlanResult {
  blocks: Block[];
  warnings: Warning[];
}

export interface State {
  commitments: Commitment[];
  tasks: Task[];
  deadlines: Deadline[];
  preferences: Preferences;
  blocks: Block[];
}
```

Create `src/defaults.ts`:

```ts
import type { Preferences } from './types.ts';

export const defaultPreferences: Preferences = {
  weekdayWindow: { start: 8 * 60, end: 22 * 60 },
  dayOffWindow: { start: 10 * 60, end: 20 * 60 },
  daysOff: [0, 6],
  minBlock: 30,
  minBreak: 10,
  softWindows: [
    { weekday: 5, start: 18 * 60, end: 24 * 60 },
    { weekday: 6, start: 18 * 60, end: 24 * 60 },
  ],
};
```

Create `test/helpers.ts`:

```ts
import { defaultPreferences } from '../src/defaults.ts';
import type { Commitment, Deadline, PlanInput, Task } from '../src/types.ts';

export function task(over: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Study',
    category: 'study',
    weeklyMinutes: null,
    maxBlock: 120,
    onePerDay: false,
    priority: 3,
    ...over,
  };
}

export function deadline(over: Partial<Deadline> = {}): Deadline {
  return { id: 'd1', taskId: 't1', kind: 'exam', dueDate: '2026-10-12', effortMinutes: 60, ...over };
}

export function commitment(over: Partial<Commitment> = {}): Commitment {
  return {
    id: 'c1',
    title: 'Class',
    category: 'class',
    start: 600,
    end: 660,
    pattern: { kind: 'once', date: '2026-10-08' },
    exceptions: [],
    bufferBefore: 0,
    ...over,
  };
}

// 2026-10-05 is a Monday.
export function input(over: Partial<PlanInput> = {}): PlanInput {
  return {
    today: '2026-10-05',
    horizonDays: 7,
    commitments: [],
    tasks: [],
    deadlines: [],
    preferences: structuredClone(defaultPreferences),
    pastBlocks: [],
    ...over,
  };
}
```

- [ ] **Step 2: Write the failing tests**

Create `test/busy.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { busyOn, occurrencesOn } from '../src/busy.ts';
import { commitment } from './helpers.ts';

const mass = commitment({
  title: 'Mass',
  category: 'mass',
  start: 20 * 60,
  end: 21 * 60,
  bufferBefore: 30,
  pattern: { kind: 'weekly', weekdays: [0], from: '2026-09-01', to: '2026-12-31' },
});

test('weekly commitment appears on its weekday with the buffer before it', () => {
  assert.deepEqual(busyOn('2026-10-11', [mass]), [{ title: 'Mass', start: 1170, end: 1260 }]);
});

test('weekly commitment does not appear on other weekdays', () => {
  assert.deepEqual(busyOn('2026-10-10', [mass]), []);
});

test('weekly commitment does not appear outside its date range', () => {
  assert.deepEqual(busyOn('2027-01-03', [mass]), []);
  assert.deepEqual(busyOn('2026-08-30', [mass]), []);
});

test('an exception date removes one occurrence and frees the slot', () => {
  const cancelled = { ...mass, exceptions: ['2026-10-11'] };
  assert.deepEqual(busyOn('2026-10-11', [cancelled]), []);
  assert.equal(busyOn('2026-10-18', [cancelled]).length, 1);
});

test('one-off commitment appears only on its date', () => {
  const c = commitment();
  assert.equal(busyOn('2026-10-08', [c]).length, 1);
  assert.equal(busyOn('2026-10-09', [c]).length, 0);
});

test('buffer never pushes the start below midnight', () => {
  const c = commitment({ start: 10, end: 60, bufferBefore: 30 });
  assert.equal(busyOn('2026-10-08', [c])[0].start, 0);
});

test('occurrencesOn keeps the real start and the buffer separately', () => {
  assert.deepEqual(occurrencesOn('2026-10-11', [mass]), [
    { title: 'Mass', category: 'mass', start: 1200, end: 1260, bufferBefore: 30 },
  ]);
});
```

Create `test/slots.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freeSlots } from '../src/slots.ts';

const window = { start: 540, end: 1020 };

test('subtracts separate busy intervals', () => {
  const busy = [{ start: 600, end: 660 }, { start: 900, end: 960 }];
  assert.deepEqual(freeSlots(window, busy), [
    { start: 540, end: 600 },
    { start: 660, end: 900 },
    { start: 960, end: 1020 },
  ]);
});

test('merges overlapping busy intervals and ignores order', () => {
  const busy = [{ start: 660, end: 780 }, { start: 600, end: 720 }];
  assert.deepEqual(freeSlots(window, busy), [
    { start: 540, end: 600 },
    { start: 780, end: 1020 },
  ]);
});

test('a window fully covered by busy time has no slots', () => {
  assert.deepEqual(freeSlots(window, [{ start: 0, end: 1440 }]), []);
});

test('busy time outside the window changes nothing', () => {
  const busy = [{ start: 0, end: 300 }, { start: 1100, end: 1200 }];
  assert.deepEqual(freeSlots(window, busy), [{ start: 540, end: 1020 }]);
});

test('busy time that starts before the window trims its start', () => {
  assert.deepEqual(freeSlots(window, [{ start: 500, end: 600 }]), [{ start: 600, end: 1020 }]);
});

test('no busy time gives the whole window', () => {
  assert.deepEqual(freeSlots(window, []), [window]);
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npm test`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/busy.ts` and `src/slots.ts`.

- [ ] **Step 4: Write the implementations**

Create `src/busy.ts`:

```ts
import { weekdayOf } from './dates.ts';
import type { Commitment, DateStr, Minutes } from './types.ts';

export interface Occurrence {
  title: string;
  category: string;
  start: Minutes;
  end: Minutes;
  bufferBefore: Minutes;
}

export interface Busy {
  title: string;
  start: Minutes;
  end: Minutes;
}

export function occurrencesOn(date: DateStr, commitments: Commitment[]): Occurrence[] {
  const out: Occurrence[] = [];
  for (const c of commitments) {
    if (c.exceptions.includes(date)) continue;
    const p = c.pattern;
    const hit =
      p.kind === 'once'
        ? p.date === date
        : date >= p.from && date <= p.to && p.weekdays.includes(weekdayOf(date));
    if (hit) {
      out.push({
        title: c.title,
        category: c.category,
        start: c.start,
        end: c.end,
        bufferBefore: c.bufferBefore,
      });
    }
  }
  return out;
}

export function busyOn(date: DateStr, commitments: Commitment[]): Busy[] {
  return occurrencesOn(date, commitments).map((o) => ({
    title: o.title,
    start: Math.max(0, o.start - o.bufferBefore),
    end: o.end,
  }));
}
```

Create `src/slots.ts`:

```ts
import type { Window } from './types.ts';

export function freeSlots(window: Window, busy: Window[]): Window[] {
  const sorted = [...busy].sort((a, b) => a.start - b.start);
  const slots: Window[] = [];
  let cursor = window.start;
  for (const b of sorted) {
    if (b.start > cursor) slots.push({ start: cursor, end: Math.min(b.start, window.end) });
    cursor = Math.max(cursor, b.end);
    if (cursor >= window.end) break;
  }
  if (cursor < window.end) slots.push({ start: cursor, end: window.end });
  return slots.filter((s) => s.end > s.start);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, all tests (dates, busy, slots).

- [ ] **Step 6: Commit**

```bash
git add src test
git commit -m "feat: add types, commitment occurrences and free slots" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Demand (how much of each task is wanted today)

This is the heart of the ramp: spread remaining work evenly over the days that can actually hold it, so the daily amount rises as a deadline nears or as days get blocked.

**Files:**
- Create: `src/demand.ts`
- Test: `test/demand.test.ts`

**Interfaces:**
- Consumes: `PlanInput`, `Block`, `Task`, `Deadline`, `DateStr` from `src/types.ts`; `addDays`, `daysBetween`, `weekStart` from `src/dates.ts`.
- Produces:
  - `type UsableDays = (date: DateStr, end: DateStr) => number` (count of usable days in `(date, end]`).
  - `interface Demand { task: Task; deadline: Deadline | null; allowedLeft: number; score: number }`.
  - `demandsFor(input: PlanInput, date: DateStr, all: Block[], usableDays: UsableDays): Demand[]`, sorted by `score` descending. `allowedLeft` is the minutes this demand may still receive today. A weekly demand has `deadline: null`. A block placed for a deadline carries `deadlineId`, and only such blocks count toward that deadline.

- [ ] **Step 1: Write the failing tests**

Create `test/demand.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demandsFor } from '../src/demand.ts';
import { daysBetween } from '../src/dates.ts';
import type { Block } from '../src/types.ts';
import { deadline, input, task } from './helpers.ts';

// Every calendar day counts as usable.
const allDays = (a: string, b: string): number => daysBetween(a, b);

const MON = '2026-10-05';

function block(over: Partial<Block> = {}): Block {
  return { taskId: 't1', title: 'Study', category: 'study', date: MON, start: 540, end: 630, ...over };
}

test('weekly target is spread evenly over the days left in the week', () => {
  const inp = input({ tasks: [task({ weeklyMinutes: 600 })] });
  const [d] = demandsFor(inp, MON, [], allDays);
  assert.equal(d.deadline, null);
  assert.equal(d.allowedLeft, 90);
});

test('once today\'s share is placed nothing more is allowed today', () => {
  const inp = input({ tasks: [task({ weeklyMinutes: 600 })] });
  assert.deepEqual(demandsFor(inp, MON, [block()], allDays), []);
});

test('tomorrow\'s share is recomputed from what is still undone', () => {
  const inp = input({ tasks: [task({ weeklyMinutes: 600 })] });
  const [d] = demandsFor(inp, '2026-10-06', [block()], allDays);
  assert.equal(d.allowedLeft, 85);
});

test('undone work carries forward and raises the daily share', () => {
  const inp = input({ tasks: [task({ weeklyMinutes: 600 })] });
  const [d] = demandsFor(inp, '2026-10-08', [], allDays);
  assert.equal(d.allowedLeft, 150);
});

test('a target smaller than minBlock is allowed in one piece', () => {
  const inp = input({ tasks: [task({ weeklyMinutes: 20 })] });
  assert.equal(demandsFor(inp, MON, [], allDays)[0].allowedLeft, 20);
});

test('days that cannot hold work are not counted when spreading', () => {
  const inp = input({ tasks: [task({ weeklyMinutes: 600 })] });
  const onlyOneMoreDay = () => 1;
  assert.equal(demandsFor(inp, MON, [], onlyOneMoreDay)[0].allowedLeft, 300);
});

test('onePerDay task gets one maxBlock session on an open day', () => {
  const inp = input({ tasks: [task({ id: 'gym', weeklyMinutes: 180, maxBlock: 60, onePerDay: true })] });
  assert.equal(demandsFor(inp, MON, [], allDays)[0].allowedLeft, 60);
});

test('onePerDay task rests the day after a session when there is slack', () => {
  const inp = input({ tasks: [task({ id: 'gym', weeklyMinutes: 180, maxBlock: 60, onePerDay: true })] });
  const monday = block({ taskId: 'gym', start: 540, end: 600 });
  assert.deepEqual(demandsFor(inp, '2026-10-06', [monday], allDays), []);
  assert.equal(demandsFor(inp, '2026-10-07', [monday], allDays)[0].allowedLeft, 60);
});

test('onePerDay task trains on consecutive days when it must', () => {
  const inp = input({ tasks: [task({ id: 'gym', weeklyMinutes: 180, maxBlock: 60, onePerDay: true })] });
  // Friday done, 120 min still due, only Saturday and Sunday left: two sessions
  // in two days, so Saturday cannot rest even though Friday had one.
  const friday = block({ taskId: 'gym', date: '2026-10-09', start: 540, end: 600 });
  assert.equal(demandsFor(inp, '2026-10-10', [friday], allDays)[0].allowedLeft, 60);
});

test('deadline demand ramps up as the due date approaches', () => {
  const inp = input({
    tasks: [task()],
    deadlines: [deadline({ dueDate: '2026-10-12', effortMinutes: 600 })],
  });
  assert.equal(demandsFor(inp, MON, [], allDays)[0].allowedLeft, 75);
  assert.equal(demandsFor(inp, '2026-10-09', [], allDays)[0].allowedLeft, 150);
});

test('only blocks tagged with the deadline count toward it', () => {
  const inp = input({
    tasks: [task()],
    deadlines: [deadline({ dueDate: '2026-10-12', effortMinutes: 600 })],
  });
  const done = [
    block({ start: 540, end: 840, deadlineId: 'd1' }),
    block({ date: '2026-10-05', start: 900, end: 1000 }),
  ];
  const [d] = demandsFor(inp, '2026-10-06', done, allDays);
  assert.equal(d.deadline?.id, 'd1');
  assert.equal(d.allowedLeft, 45);
});

test('a deadline due today is still scheduled today', () => {
  const inp = input({
    tasks: [task()],
    deadlines: [deadline({ dueDate: MON, effortMinutes: 60 })],
  });
  assert.equal(demandsFor(inp, MON, [], allDays)[0].allowedLeft, 60);
});

test('a deadline already past produces no demand', () => {
  const inp = input({
    tasks: [task()],
    deadlines: [deadline({ dueDate: '2026-10-04', effortMinutes: 60 })],
  });
  assert.deepEqual(demandsFor(inp, MON, [], allDays), []);
});

test('higher priority outranks lower priority with equal need', () => {
  const inp = input({
    tasks: [
      task({ id: 'low', title: 'Low', weeklyMinutes: 300, priority: 5 }),
      task({ id: 'high', title: 'High', weeklyMinutes: 300, priority: 1 }),
    ],
  });
  assert.deepEqual(demandsFor(inp, MON, [], allDays).map((d) => d.task.id), ['high', 'low']);
});

test('zero targets, zero effort and zero maxBlock produce no demand', () => {
  const inp = input({
    tasks: [
      task({ id: 'a', weeklyMinutes: 0 }),
      task({ id: 'b', weeklyMinutes: 100, maxBlock: 0 }),
      task({ id: 'c' }),
    ],
    deadlines: [deadline({ taskId: 'c', effortMinutes: 0 })],
  });
  assert.deepEqual(demandsFor(inp, MON, [], allDays), []);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/demand.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/demand.ts`.

- [ ] **Step 3: Write the implementation**

Create `src/demand.ts`:

```ts
import { addDays, weekStart } from './dates.ts';
import type { Block, DateStr, Deadline, PlanInput, Task } from './types.ts';

export type UsableDays = (date: DateStr, end: DateStr) => number;

export interface Demand {
  task: Task;
  deadline: Deadline | null;
  allowedLeft: number;
  score: number;
}

const ceil5 = (n: number): number => Math.ceil(n / 5) * 5;
const sum = (blocks: Block[]): number => blocks.reduce((t, b) => t + (b.end - b.start), 0);

export function demandsFor(
  input: PlanInput,
  date: DateStr,
  all: Block[],
  usableDays: UsableDays,
): Demand[] {
  const { minBlock } = input.preferences;
  const out: Demand[] = [];

  for (const task of input.tasks) {
    if (task.maxBlock < 1) continue;
    const mine = all.filter((b) => b.taskId === task.id);
    const weight = 6 - task.priority;

    if (task.weeklyMinutes !== null && task.weeklyMinutes > 0) {
      const ws = weekStart(date);
      const weekly = mine.filter((b) => !b.deadlineId && weekStart(b.date) === ws);
      const doneToday = sum(weekly.filter((b) => b.date === date));
      const remainingStart = task.weeklyMinutes - (sum(weekly) - doneToday);
      if (remainingStart > 0) {
        const daysLeft = 1 + usableDays(date, addDays(ws, 6));
        let allowedTotal: number;
        if (task.onePerDay) {
          const hadYesterday = mine.some((b) => b.date === addDays(date, -1));
          const sessionsLeft = Math.ceil(remainingStart / task.maxBlock);
          allowedTotal =
            hadYesterday && sessionsLeft < daysLeft ? 0 : Math.min(task.maxBlock, remainingStart);
        } else {
          allowedTotal = Math.min(
            remainingStart,
            Math.max(ceil5(remainingStart / daysLeft), Math.min(minBlock, remainingStart)),
          );
        }
        const allowedLeft = allowedTotal - doneToday;
        if (allowedLeft > 0) {
          out.push({ task, deadline: null, allowedLeft, score: (remainingStart / daysLeft) * weight });
        }
      }
    }

    for (const dl of input.deadlines) {
      if (dl.taskId !== task.id || dl.dueDate < date) continue;
      const tagged = mine.filter((b) => b.deadlineId === dl.id);
      const doneToday = sum(tagged.filter((b) => b.date === date));
      const remainingStart = dl.effortMinutes - (sum(tagged) - doneToday);
      if (remainingStart <= 0) continue;
      const daysLeft = 1 + usableDays(date, dl.dueDate);
      const allowedTotal = Math.min(
        remainingStart,
        Math.max(ceil5(remainingStart / daysLeft), Math.min(minBlock, remainingStart)),
      );
      const allowedLeft = allowedTotal - doneToday;
      if (allowedLeft > 0) {
        out.push({ task, deadline: dl, allowedLeft, score: (remainingStart / daysLeft) * weight });
      }
    }
  }

  return out.sort((a, b) => b.score - a.score);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/demand.test.ts`
Expected: PASS, 14 tests. If a number is off, recompute it by hand from the rule (share = remaining / days that can still hold work, rounded up to 5 minutes, at least `min(minBlock, remaining)`) and decide whether the test or the code is wrong before changing either.

- [ ] **Step 5: Commit**

```bash
git add src/demand.ts test/demand.test.ts
git commit -m "feat: add demand ramp for tasks and deadlines" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Day-filling planner

**Files:**
- Create: `src/planner.ts`
- Test: `test/planner.test.ts`

**Interfaces:**
- Consumes: `demandsFor`, `UsableDays` from `src/demand.ts`; `busyOn` from `src/busy.ts`; `freeSlots` from `src/slots.ts`; `addDays`, `weekdayOf` from `src/dates.ts`; types from `src/types.ts`.
- Produces:
  - `interface Slot extends Window { soft: boolean }`.
  - `daySlots(input: PlanInput, date: DateStr): Slot[]` (free slots on a date, all `soft: false` in this task).
  - `planDays(input: PlanInput): Block[]` returns only the newly placed blocks, in date then time order. It never reads or alters `input.pastBlocks` except to count them.

- [ ] **Step 1: Write the failing tests**

Create `test/planner.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planDays } from '../src/planner.ts';
import { defaultPreferences } from '../src/defaults.ts';
import type { Block, Preferences } from '../src/types.ts';
import { commitment, input, task } from './helpers.ts';

const prefs = (over: Partial<Preferences> = {}): Preferences => ({
  ...structuredClone(defaultPreferences),
  softWindows: [],
  ...over,
});

const minutes = (blocks: Block[]): number => blocks.reduce((t, b) => t + b.end - b.start, 0);
const on = (blocks: Block[], date: string): Block[] => blocks.filter((b) => b.date === date);

test('a weekly target is fully placed within the week, spread evenly', () => {
  const blocks = planDays(input({ preferences: prefs(), tasks: [task({ weeklyMinutes: 600 })] }));
  assert.equal(minutes(blocks), 600);
  assert.deepEqual(on(blocks, '2026-10-05'), [
    { taskId: 't1', title: 'Study', category: 'study', date: '2026-10-05', start: 480, end: 570 },
  ]);
});

test('days off use the day-off window', () => {
  const blocks = planDays(input({ preferences: prefs(), tasks: [task({ weeklyMinutes: 600 })] }));
  assert.equal(on(blocks, '2026-10-10')[0].start, 600);
  assert.ok(blocks.every((b) => b.end <= 1320));
  assert.ok(on(blocks, '2026-10-11').every((b) => b.end <= 1200));
});

test('blocks never overlap a commitment', () => {
  const lecture = commitment({
    start: 480,
    end: 600,
    pattern: { kind: 'once', date: '2026-10-05' },
  });
  const blocks = planDays(
    input({ preferences: prefs(), commitments: [lecture], tasks: [task({ weeklyMinutes: 600 })] }),
  );
  assert.equal(on(blocks, '2026-10-05')[0].start, 600);
});

test('nothing is placed over Sunday mass, even in a tight day-off window', () => {
  const mass = commitment({
    title: 'Mass',
    start: 1200,
    end: 1260,
    bufferBefore: 30,
    pattern: { kind: 'weekly', weekdays: [0], from: '2026-09-01', to: '2026-12-31' },
  });
  const blocks = planDays(
    input({
      preferences: prefs({ dayOffWindow: { start: 1000, end: 1200 }, daysOff: [0] }),
      commitments: [mass],
      tasks: [task({ weeklyMinutes: 1500, maxBlock: 600 })],
    }),
  );
  const sunday = on(blocks, '2026-10-11');
  assert.ok(sunday.length > 0);
  assert.ok(sunday.every((b) => b.end <= 1170));
});

test('a cancelled private lesson frees its slot for study', () => {
  const lesson = commitment({
    title: 'Private lesson',
    start: 480,
    end: 1320,
    pattern: { kind: 'weekly', weekdays: [2], from: '2026-09-01', to: '2026-12-31' },
  });
  const t = task({ weeklyMinutes: 120 });
  const withLesson = planDays(input({ preferences: prefs(), commitments: [lesson], tasks: [t] }));
  assert.equal(on(withLesson, '2026-10-06').length, 0);
  assert.equal(minutes(withLesson), 120);

  const cancelled = { ...lesson, exceptions: ['2026-10-06'] };
  const freed = planDays(input({ preferences: prefs(), commitments: [cancelled], tasks: [t] }));
  assert.equal(on(freed, '2026-10-06').length, 1);
  assert.equal(minutes(freed), 120);
});

test('nowMinutes keeps today\'s blocks in the future', () => {
  const blocks = planDays(
    input({ preferences: prefs(), nowMinutes: 780, tasks: [task({ weeklyMinutes: 600 })] }),
  );
  assert.equal(on(blocks, '2026-10-05')[0].start, 780);
});

test('a break is left between two blocks in the same slot', () => {
  const blocks = planDays(
    input({
      preferences: prefs(),
      tasks: [
        task({ id: 'a', title: 'A', weeklyMinutes: 700, priority: 1 }),
        task({ id: 'b', title: 'B', weeklyMinutes: 700, priority: 5 }),
      ],
    }),
  );
  const monday = on(blocks, '2026-10-05');
  assert.equal(monday[0].taskId, 'a');
  assert.equal(monday[1].taskId, 'b');
  assert.equal(monday[1].start - monday[0].end, 10);
});

test('when time is scarce the higher priority task gets it', () => {
  const blocks = planDays(
    input({
      preferences: prefs({ weekdayWindow: { start: 480, end: 540 }, daysOff: [] }),
      tasks: [
        task({ id: 'low', title: 'Low', weeklyMinutes: 600, priority: 5 }),
        task({ id: 'high', title: 'High', weeklyMinutes: 600, priority: 1 }),
      ],
    }),
  );
  assert.ok(on(blocks, '2026-10-05').every((b) => b.taskId === 'high'));
});

test('gym sessions are spread across the week, not stacked', () => {
  const gym = task({ id: 'gym', title: 'Gym', category: 'gym', weeklyMinutes: 180, maxBlock: 60, onePerDay: true });
  const blocks = planDays(input({ preferences: prefs(), tasks: [gym] }));
  assert.deepEqual(blocks.map((b) => b.date), ['2026-10-05', '2026-10-07', '2026-10-09']);
});

test('a day fully covered by commitments gets no blocks and does not throw', () => {
  const busy = commitment({
    start: 480,
    end: 540,
    pattern: { kind: 'weekly', weekdays: [0, 1, 2, 3, 4, 5, 6], from: '2026-01-01', to: '2026-12-31' },
  });
  const blocks = planDays(
    input({
      preferences: prefs({ weekdayWindow: { start: 480, end: 540 }, daysOff: [] }),
      commitments: [busy],
      tasks: [task({ weeklyMinutes: 600 })],
    }),
  );
  assert.deepEqual(blocks, []);
});

test('a task with maxBlock 0 neither hangs the planner nor starves others', () => {
  const blocks = planDays(
    input({
      preferences: prefs(),
      tasks: [task({ id: 'bad', weeklyMinutes: 100, maxBlock: 0, priority: 1 }), task({ id: 'ok', weeklyMinutes: 100 })],
    }),
  );
  assert.equal(minutes(blocks.filter((b) => b.taskId === 'bad')), 0);
  assert.equal(minutes(blocks.filter((b) => b.taskId === 'ok')), 100);
});

test('planning across a year boundary keeps the weekly target', () => {
  const blocks = planDays(
    input({
      today: '2026-12-30',
      horizonDays: 5,
      preferences: prefs(),
      tasks: [task({ weeklyMinutes: 100 })],
    }),
  );
  assert.equal(minutes(blocks), 100);
  assert.ok(on(blocks, '2027-01-02').length > 0);
  assert.deepEqual(blocks.map((b) => b.date), [...blocks.map((b) => b.date)].sort());
});

test('blocks already done earlier this week count toward the weekly target', () => {
  const done: Block = { taskId: 't1', title: 'Study', category: 'study', date: '2026-10-05', start: 480, end: 780 };
  const blocks = planDays(
    input({
      today: '2026-10-07',
      horizonDays: 5,
      preferences: prefs(),
      pastBlocks: [done],
      tasks: [task({ weeklyMinutes: 600 })],
    }),
  );
  assert.equal(minutes(blocks), 300);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/planner.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/planner.ts`.

- [ ] **Step 3: Write the implementation**

Create `src/planner.ts`:

```ts
import { addDays, weekdayOf } from './dates.ts';
import { busyOn } from './busy.ts';
import { demandsFor } from './demand.ts';
import { freeSlots } from './slots.ts';
import type { Block, DateStr, PlanInput, Window } from './types.ts';

export interface Slot extends Window {
  soft: boolean;
}

export function daySlots(input: PlanInput, date: DateStr): Slot[] {
  const pref = input.preferences;
  const window = pref.daysOff.includes(weekdayOf(date)) ? pref.dayOffWindow : pref.weekdayWindow;
  return freeSlots(window, busyOn(date, input.commitments)).map((s) => ({ ...s, soft: false }));
}

export function planDays(input: PlanInput): Block[] {
  const pref = input.preferences;
  const all: Block[] = [...input.pastBlocks];
  const placed: Block[] = [];

  const usable = new Map<DateStr, boolean>();
  const isUsable = (date: DateStr): boolean => {
    let v = usable.get(date);
    if (v === undefined) {
      v = daySlots(input, date).some((s) => s.end - s.start >= pref.minBlock);
      usable.set(date, v);
    }
    return v;
  };
  const usableDays = (date: DateStr, end: DateStr): number => {
    const limit = end < addDays(date, 400) ? end : addDays(date, 400);
    let n = 0;
    for (let d = addDays(date, 1); d <= limit; d = addDays(d, 1)) if (isUsable(d)) n++;
    return n;
  };

  for (let i = 0; i < input.horizonDays; i++) {
    const date = addDays(input.today, i);
    let slots = daySlots(input, date);
    if (i === 0 && input.nowMinutes !== undefined) {
      const now = input.nowMinutes;
      slots = slots
        .map((s) => ({ ...s, start: Math.max(s.start, now) }))
        .filter((s) => s.end > s.start);
    }

    for (const slot of slots) {
      let cursor = slot.start;
      for (;;) {
        const room = slot.end - cursor;
        const pick = demandsFor(input, date, all, usableDays).find((d) => {
          if (slot.soft && d.deadline === null && d.task.category !== 'study') return false;
          const wanted = Math.min(d.task.maxBlock, d.allowedLeft);
          return room >= Math.min(pref.minBlock, wanted);
        });
        if (!pick) break;
        const length = Math.min(pick.task.maxBlock, pick.allowedLeft, room);
        if (length <= 0) break;
        const block: Block = {
          taskId: pick.task.id,
          title: pick.task.title,
          category: pick.task.category,
          date,
          start: cursor,
          end: cursor + length,
          ...(pick.deadline ? { deadlineId: pick.deadline.id } : {}),
        };
        all.push(block);
        placed.push(block);
        cursor += length + pref.minBreak;
      }
    }
  }
  return placed;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/planner.test.ts`
Expected: PASS, 13 tests. If a numeric expectation is off, recompute the day-by-day arithmetic (each day takes `ceil5(remaining / usable days left)`, at least `min(minBlock, remaining)`, capped by `maxBlock` and the room in the slot) and fix whichever side is wrong. A wrong expectation in a test is fixed in the test only after confirming the code follows the spec, never to make the code pass.

- [ ] **Step 5: Commit**

```bash
git add src/planner.ts test/planner.test.ts
git commit -m "feat: fill free slots day by day" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Shortfall warnings and the `plan()` entry point

**Files:**
- Modify: `src/planner.ts` (append)
- Test: `test/warnings.test.ts`

**Interfaces:**
- Consumes: `planDays` (Task 4), types.
- Produces: `shortfallWarnings(input: PlanInput, all: Block[]): Warning[]` and `plan(input: PlanInput): PlanResult` (`blocks` are the newly placed ones only). Message formats are exact:
  - `` `${task.title} ${dl.kind} due ${dl.dueDate} is short by ${rem} min` `` (kind `deadline-short`)
  - `` `${task.title} is short by ${rem} min in the week of ${weekStart}` `` (kind `weekly-short`)

- [ ] **Step 1: Write the failing tests**

Create `test/warnings.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plan } from '../src/planner.ts';
import { defaultPreferences } from '../src/defaults.ts';
import type { Preferences } from '../src/types.ts';
import { deadline, input, task } from './helpers.ts';

// One 60-minute window every day, no soft windows.
const tight = (): Preferences => ({
  ...structuredClone(defaultPreferences),
  weekdayWindow: { start: 480, end: 540 },
  dayOffWindow: { start: 480, end: 540 },
  daysOff: [],
  softWindows: [],
});

test('an unmeetable deadline is reported with the exact shortfall', () => {
  const result = plan(
    input({
      preferences: tight(),
      tasks: [task()],
      deadlines: [deadline({ dueDate: '2026-10-07', effortMinutes: 600 })],
    }),
  );
  assert.deepEqual(result.warnings, [
    { kind: 'deadline-short', message: 'Study exam due 2026-10-07 is short by 420 min' },
  ]);
});

test('a meetable deadline produces no warning', () => {
  const result = plan(
    input({
      preferences: tight(),
      tasks: [task()],
      deadlines: [deadline({ dueDate: '2026-10-07', effortMinutes: 60 })],
    }),
  );
  assert.deepEqual(result.warnings, []);
});

test('a weekly target that cannot fit is reported', () => {
  const result = plan(input({ preferences: tight(), tasks: [task({ weeklyMinutes: 600 })] }));
  assert.deepEqual(result.warnings, [
    { kind: 'weekly-short', message: 'Study is short by 180 min in the week of 2026-10-05' },
  ]);
});

test('a deadline beyond the horizon is not reported yet', () => {
  const result = plan(
    input({
      preferences: tight(),
      tasks: [task()],
      deadlines: [deadline({ dueDate: '2026-11-30', effortMinutes: 600 })],
    }),
  );
  assert.deepEqual(result.warnings, []);
});

test('an overdue deadline with work left is reported, not ignored', () => {
  const result = plan(
    input({
      preferences: tight(),
      tasks: [task()],
      deadlines: [deadline({ dueDate: '2026-10-01', effortMinutes: 60 })],
    }),
  );
  assert.deepEqual(result.warnings, [
    { kind: 'deadline-short', message: 'Study exam due 2026-10-01 is short by 60 min' },
  ]);
});

test('work done before today counts toward a deadline', () => {
  const result = plan(
    input({
      preferences: tight(),
      tasks: [task()],
      deadlines: [deadline({ dueDate: '2026-10-07', effortMinutes: 60 })],
      pastBlocks: [
        { taskId: 't1', title: 'Study', category: 'study', date: '2026-10-03', start: 480, end: 540, deadlineId: 'd1' },
      ],
    }),
  );
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.blocks, []);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/warnings.test.ts`
Expected: FAIL: `plan` is not exported from `src/planner.ts`.

- [ ] **Step 3: Append the implementation**

In `src/planner.ts`, change the first two import lines to:

```ts
import { addDays, weekdayOf, weekStart } from './dates.ts';
import { busyOn } from './busy.ts';
```

and the types import to:

```ts
import type { Block, DateStr, PlanInput, PlanResult, Warning, Window } from './types.ts';
```

Then append at the end of the file:

```ts
const minutesOf = (blocks: Block[]): number => blocks.reduce((t, b) => t + (b.end - b.start), 0);

export interface Shortfall {
  warning: Warning;
  category: string;
}

export function shortfalls(input: PlanInput, all: Block[]): Shortfall[] {
  const last = addDays(input.today, input.horizonDays - 1);
  const out: Shortfall[] = [];

  for (const dl of input.deadlines) {
    const task = input.tasks.find((t) => t.id === dl.taskId);
    if (!task || dl.dueDate > last) continue;
    const rem = dl.effortMinutes - minutesOf(all.filter((b) => b.deadlineId === dl.id));
    if (rem > 0) {
      out.push({
        category: task.category,
        warning: {
          kind: 'deadline-short',
          message: `${task.title} ${dl.kind} due ${dl.dueDate} is short by ${rem} min`,
        },
      });
    }
  }

  for (const task of input.tasks) {
    if (!task.weeklyMinutes) continue;
    for (let ws = weekStart(input.today); addDays(ws, 6) <= last; ws = addDays(ws, 7)) {
      const done = minutesOf(
        all.filter((b) => b.taskId === task.id && !b.deadlineId && weekStart(b.date) === ws),
      );
      if (done < task.weeklyMinutes) {
        out.push({
          category: task.category,
          warning: {
            kind: 'weekly-short',
            message: `${task.title} is short by ${task.weeklyMinutes - done} min in the week of ${ws}`,
          },
        });
      }
    }
  }
  return out;
}

export function shortfallWarnings(input: PlanInput, all: Block[]): Warning[] {
  return shortfalls(input, all).map((s) => s.warning);
}

export function plan(input: PlanInput): PlanResult {
  const blocks = planDays(input);
  return { blocks, warnings: shortfallWarnings(input, [...input.pastBlocks, ...blocks]) };
}
```

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS for every test file.

- [ ] **Step 5: Commit**

```bash
git add src/planner.ts test/warnings.test.ts
git commit -m "feat: report unmet deadlines and weekly targets" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Soft windows (Friday and Saturday evenings)

Soft windows are avoided by default. They are opened one date at a time, earliest first, only while a deadline is still short or a study task is short of its weekly target. An opened soft window only accepts deadline work and tasks with category `study`; chores, gym, errands and projects never use it.

**Files:**
- Modify: `src/planner.ts`
- Test: `test/soft.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 4 and 5.
- Produces: `daySlots(input, date, opened)` (soft windows removed from normal slots; if `opened` has the date, soft slots are added with `soft: true`); `planDays(input, opened?)`; `plan` now opens soft dates as needed and adds warnings of kind `soft-time-used` with the exact message `` `Used soft free time on ${date} for ${titles joined by ', '}` ``.

- [ ] **Step 1: Write the failing tests**

Create `test/soft.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plan } from '../src/planner.ts';
import { defaultPreferences } from '../src/defaults.ts';
import type { Preferences } from '../src/types.ts';
import { deadline, input, task } from './helpers.ts';

// Weekdays offer 18:00-20:00 only. Friday evening is a soft window.
const evening = (): Preferences => ({
  ...structuredClone(defaultPreferences),
  weekdayWindow: { start: 1080, end: 1200 },
  dayOffWindow: { start: 1080, end: 1200 },
  daysOff: [],
  softWindows: [{ weekday: 5, start: 1080, end: 1440 }],
});

const FRI = '2026-10-09';

test('soft time is left alone when the deadline fits without it', () => {
  const result = plan(
    input({
      preferences: evening(),
      tasks: [task()],
      deadlines: [deadline({ dueDate: FRI, effortMinutes: 480 })],
    }),
  );
  assert.equal(result.blocks.filter((b) => b.date === FRI).length, 0);
  assert.deepEqual(result.warnings, []);
});

test('soft time is used, and reported, when a deadline would otherwise be missed', () => {
  const result = plan(
    input({
      preferences: evening(),
      tasks: [task()],
      deadlines: [deadline({ dueDate: FRI, effortMinutes: 600 })],
    }),
  );
  const friday = result.blocks.filter((b) => b.date === FRI);
  assert.equal(friday.length, 1);
  assert.equal(friday[0].end - friday[0].start, 120);
  assert.deepEqual(result.warnings, [
    { kind: 'soft-time-used', message: `Used soft free time on ${FRI} for Study` },
  ]);
});

test('an opened soft window takes study work but never chores', () => {
  const result = plan(
    input({
      preferences: evening(),
      tasks: [task(), task({ id: 'chores', title: 'Chores', category: 'chores', weeklyMinutes: 600 })],
      deadlines: [deadline({ dueDate: FRI, effortMinutes: 600 })],
    }),
  );
  const friday = result.blocks.filter((b) => b.date === FRI);
  assert.ok(friday.length > 0);
  assert.ok(friday.every((b) => b.category === 'study'));
});

test('a study task short of its weekly target may use soft time as a last resort', () => {
  const result = plan(input({ preferences: evening(), tasks: [task({ weeklyMinutes: 5000 })] }));
  assert.equal(result.blocks.filter((b) => b.date === FRI).length, 1);
  assert.ok(result.warnings.some((w) => w.kind === 'soft-time-used'));
});

test('a non-study weekly shortfall never opens a soft window', () => {
  const result = plan(
    input({
      preferences: evening(),
      tasks: [task({ id: 'chores', title: 'Chores', category: 'chores', weeklyMinutes: 5000 })],
    }),
  );
  assert.equal(result.blocks.filter((b) => b.date === FRI).length, 0);
  assert.ok(result.warnings.every((w) => w.kind !== 'soft-time-used'));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/soft.test.ts`
Expected: FAIL. Currently Friday evening is treated as normal free time, so the first test already breaks (a Friday block exists).

- [ ] **Step 3: Replace `daySlots` and wire `opened` through**

In `src/planner.ts`, replace the whole `daySlots` function with:

```ts
export function daySlots(input: PlanInput, date: DateStr, opened: ReadonlySet<DateStr>): Slot[] {
  const pref = input.preferences;
  const window = pref.daysOff.includes(weekdayOf(date)) ? pref.dayOffWindow : pref.weekdayWindow;
  const busy = busyOn(date, input.commitments);
  const softs = pref.softWindows.filter((s) => s.weekday === weekdayOf(date));
  const normal = freeSlots(window, [...busy, ...softs]).map((s) => ({ ...s, soft: false }));
  const soft = opened.has(date)
    ? softs
        .flatMap((s) =>
          freeSlots({ start: Math.max(s.start, window.start), end: Math.min(s.end, window.end) }, busy),
        )
        .map((s) => ({ ...s, soft: true }))
    : [];
  return [...normal, ...soft].sort((a, b) => a.start - b.start);
}
```

Change the `planDays` signature line to:

```ts
export function planDays(input: PlanInput, opened: ReadonlySet<DateStr> = new Set()): Block[] {
```

Change the two calls to `daySlots(input, date)` / `daySlots(input, date)` inside `planDays` (one in `isUsable`, one where `slots` is first assigned) to pass `opened` as the third argument:

```ts
      v = daySlots(input, date, opened).some((s) => s.end - s.start >= pref.minBlock);
```

```ts
    let slots = daySlots(input, date, opened);
```

- [ ] **Step 4: Replace `plan` with the soft-opening version**

Replace the whole existing `plan` function with:

```ts
function softUseWarnings(input: PlanInput, blocks: Block[], opened: ReadonlySet<DateStr>): Warning[] {
  const out: Warning[] = [];
  for (const date of opened) {
    const wd = weekdayOf(date);
    const used = blocks.filter(
      (b) =>
        b.date === date &&
        input.preferences.softWindows.some((s) => s.weekday === wd && b.start >= s.start && b.start < s.end),
    );
    if (used.length > 0) {
      const titles = [...new Set(used.map((b) => b.title))].join(', ');
      out.push({ kind: 'soft-time-used', message: `Used soft free time on ${date} for ${titles}` });
    }
  }
  return out;
}

export function plan(input: PlanInput): PlanResult {
  const softDates = Array.from({ length: input.horizonDays }, (_, i) => addDays(input.today, i)).filter(
    (d) => input.preferences.softWindows.some((s) => s.weekday === weekdayOf(d)),
  );
  const opened = new Set<DateStr>();
  const needsSoftTime = (found: Shortfall[]): boolean =>
    found.some((s) => s.warning.kind === 'deadline-short' || s.category === 'study');
  let blocks = planDays(input, opened);
  let found = shortfalls(input, [...input.pastBlocks, ...blocks]);
  while (needsSoftTime(found) && opened.size < softDates.length) {
    opened.add(softDates[opened.size]);
    blocks = planDays(input, opened);
    found = shortfalls(input, [...input.pastBlocks, ...blocks]);
  }
  return {
    blocks,
    warnings: [...softUseWarnings(input, blocks, opened), ...found.map((s) => s.warning)],
  };
}
```

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS for every file. The Task 4 and 5 tests use `softWindows: []`, so they are unaffected.

- [ ] **Step 6: Commit**

```bash
git add src/planner.ts test/soft.test.ts
git commit -m "feat: open soft free time only to save a deadline" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Validation, storage, and replanning

**Files:**
- Create: `src/validate.ts`, `src/store.ts`, `src/replan.ts`
- Test: `test/validate.test.ts`, `test/store.test.ts`, `test/replan.test.ts`

**Interfaces:**
- Consumes: `defaultPreferences`, `plan`, `addDays`, types.
- Produces:
  - `class ValidationError extends Error`.
  - Helpers (exported, reused in Task 8): `num(v, path, min, max?)`, `int(v, path, min, max)`, `dateStr(v, path)`, `isObj(v)`, `fail(msg): never`.
  - `validateState(x: unknown): State` (throws `ValidationError`, returns a sanitized copy with unknown fields dropped).
  - `emptyState(): State`; `loadState(path): State` (missing file gives `emptyState()`; unreadable or invalid file throws a plain `Error` whose message contains the path and never overwrites the file); `saveState(path, state): void` (creates the folder, writes a temp file and renames it).
  - `replan(state: State, today: DateStr, nowMinutes?: Minutes, horizonDays = 14): { state: State; warnings: Warning[] }`. Blocks before `today`, and today's blocks that ended by `nowMinutes`, are kept unchanged. Everything else is replaced. The input state is not mutated.

- [ ] **Step 1: Write the failing validation tests**

Create `test/validate.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState } from '../src/store.ts';
import { ValidationError, validateState } from '../src/validate.ts';
import { commitment, deadline, task } from './helpers.ts';

function sample(): any {
  return structuredClone({
    ...emptyState(),
    tasks: [task()],
    deadlines: [deadline()],
    commitments: [commitment()],
  });
}

function rejects(mutate: (s: any) => void, pattern: RegExp): void {
  const s = sample();
  mutate(s);
  assert.throws(
    () => validateState(s),
    (e: unknown) => e instanceof ValidationError && pattern.test(e.message),
  );
}

test('a valid state round-trips unchanged', () => {
  assert.deepEqual(validateState(sample()), sample());
});

test('unknown fields are dropped', () => {
  const s = sample();
  s.tasks[0].secret = 'x';
  assert.deepEqual(validateState(s), sample());
});

test('non-objects are rejected', () => {
  for (const bad of [null, 'x', 5, []]) {
    assert.throws(() => validateState(bad), ValidationError);
  }
});

test('task fields are checked', () => {
  rejects((s) => (s.tasks[0].maxBlock = 0), /tasks\[0\]\.maxBlock/);
  rejects((s) => (s.tasks[0].priority = 9), /tasks\[0\]\.priority/);
  rejects((s) => (s.tasks[0].weeklyMinutes = -5), /tasks\[0\]\.weeklyMinutes/);
  rejects((s) => (s.tasks[0].title = ''), /tasks\[0\]\.title/);
  rejects((s) => (s.tasks[0].onePerDay = 'yes'), /tasks\[0\]\.onePerDay/);
});

test('duplicate ids are rejected', () => {
  rejects((s) => s.tasks.push(task()), /duplicate/);
});

test('dates must be real calendar dates', () => {
  rejects((s) => (s.deadlines[0].dueDate = '2026-02-31'), /dueDate/);
  rejects((s) => (s.deadlines[0].dueDate = '10/12/2026'), /dueDate/);
});

test('a deadline must point at an existing task', () => {
  rejects((s) => (s.deadlines[0].taskId = 'nope'), /taskId/);
});

test('commitment fields are checked', () => {
  rejects((s) => ((s.commitments[0].start = 700), (s.commitments[0].end = 600)), /commitments\[0\]/);
  rejects((s) => (s.commitments[0].end = 2000), /commitments\[0\]\.end/);
  rejects((s) => (s.commitments[0].pattern = { kind: 'monthly' }), /pattern/);
  rejects(
    (s) => (s.commitments[0].pattern = { kind: 'weekly', weekdays: [7], from: '2026-09-01', to: '2026-12-01' }),
    /weekdays/,
  );
  rejects(
    (s) => (s.commitments[0].pattern = { kind: 'weekly', weekdays: [1], from: '2026-12-01', to: '2026-09-01' }),
    /pattern/,
  );
});

test('preference windows must end after they start', () => {
  rejects((s) => (s.preferences.weekdayWindow = { start: 600, end: 600 }), /weekdayWindow/);
  rejects((s) => (s.preferences.daysOff = [9]), /daysOff/);
});
```

- [ ] **Step 2: Write the failing store and replan tests**

Create `test/store.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyState, loadState, saveState } from '../src/store.ts';
import { task } from './helpers.ts';

const dir = (): string => mkdtempSync(join(tmpdir(), 'doitwithme-'));

test('a missing file loads as an empty state', () => {
  assert.deepEqual(loadState(join(dir(), 'db.json')), emptyState());
});

test('save then load returns the same state and leaves no temp file', () => {
  const path = join(dir(), 'nested', 'db.json');
  const state = { ...emptyState(), tasks: [task()] };
  saveState(path, state);
  assert.deepEqual(loadState(path), state);
  assert.equal(existsSync(`${path}.tmp`), false);
});

test('a corrupt file raises an error naming the file and is not overwritten', () => {
  const path = join(dir(), 'db.json');
  writeFileSync(path, '{ not json');
  assert.throws(() => loadState(path), (e: unknown) => e instanceof Error && e.message.includes(path));
  assert.equal(readFileSync(path, 'utf8'), '{ not json');
});

test('a file with valid JSON but an invalid state is also refused', () => {
  const path = join(dir(), 'db.json');
  writeFileSync(path, JSON.stringify({ tasks: 'nope' }));
  assert.throws(() => loadState(path), (e: unknown) => e instanceof Error && e.message.includes(path));
});
```

Create `test/replan.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replan } from '../src/replan.ts';
import { emptyState } from '../src/store.ts';
import type { Block, State } from '../src/types.ts';
import { task } from './helpers.ts';

const old = (date: string, start: number, end: number): Block => ({
  taskId: 't1', title: 'Study', category: 'study', date, start, end,
});

function stateWith(blocks: Block[]): State {
  return { ...emptyState(), tasks: [task({ weeklyMinutes: 600 })], blocks };
}

test('blocks before today are kept exactly', () => {
  const past = old('2026-10-03', 480, 540);
  const { state } = replan(stateWith([past]), '2026-10-05');
  assert.deepEqual(state.blocks[0], past);
});

test('future blocks are replaced, not duplicated', () => {
  const stale = old('2026-10-08', 100, 160);
  const { state } = replan(stateWith([stale]), '2026-10-05');
  assert.ok(!state.blocks.some((b) => b.start === 100 && b.date === '2026-10-08'));
});

test('today\'s finished blocks are kept and unfinished ones are replanned', () => {
  const done = old('2026-10-05', 480, 540);
  const notYet = old('2026-10-05', 900, 960);
  const { state } = replan(stateWith([done, notYet]), '2026-10-05', 600);
  assert.deepEqual(state.blocks.filter((b) => b.date === '2026-10-05')[0], done);
  assert.ok(!state.blocks.some((b) => b.date === '2026-10-05' && b.start === 900 && b.end === 960));
});

test('replanning twice gives the same result', () => {
  const once = replan(stateWith([]), '2026-10-05').state;
  const twice = replan(once, '2026-10-05').state;
  assert.deepEqual(twice, once);
});

test('the input state is not mutated', () => {
  const input = stateWith([old('2026-10-08', 100, 160)]);
  const copy = structuredClone(input);
  replan(input, '2026-10-05');
  assert.deepEqual(input, copy);
});

test('work done earlier counts, so a finished week plans nothing more', () => {
  const done = [old('2026-10-05', 480, 780), old('2026-10-06', 480, 780)];
  const { state } = replan(stateWith(done), '2026-10-07');
  assert.equal(state.blocks.length, 2);
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npm test`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/store.ts`, `src/validate.ts`, `src/replan.ts`.

- [ ] **Step 4: Write `src/validate.ts`**

```ts
import { defaultPreferences } from './defaults.ts';
import type {
  Block, Commitment, Deadline, Pattern, Preferences, SoftWindow, State, Task, Window,
} from './types.ts';

export class ValidationError extends Error {}

export function fail(message: string): never {
  throw new ValidationError(message);
}

export function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function num(v: unknown, path: string, min: number, max = Number.POSITIVE_INFINITY): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
    fail(`${path} must be a number between ${min} and ${max}`);
  }
  return v as number;
}

export function int(v: unknown, path: string, min: number, max: number): number {
  const n = num(v, path, min, max);
  if (!Number.isInteger(n)) fail(`${path} must be a whole number`);
  return n;
}

export function dateStr(v: unknown, path: string): string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) fail(`${path} must be a date like 2026-10-08`);
  const text = v as string;
  const t = Date.parse(`${text}T00:00:00Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== text) {
    fail(`${path} is not a real calendar date`);
  }
  return text;
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > 200) fail(`${path} must be text of 1 to 200 characters`);
  return v as string;
}

function bool(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') fail(`${path} must be true or false`);
  return v as boolean;
}

function arr(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) fail(`${path} must be a list`);
  return v as unknown[];
}

function obj(v: unknown, path: string): Record<string, unknown> {
  if (!isObj(v)) fail(`${path} must be an object`);
  return v as Record<string, unknown>;
}

function windowOf(v: unknown, path: string): Window {
  const o = obj(v, path);
  const start = int(o.start, `${path}.start`, 0, 1440);
  const end = int(o.end, `${path}.end`, 0, 1440);
  if (end <= start) fail(`${path} must end after it starts`);
  return { start, end };
}

function unique(ids: string[], path: string): void {
  if (new Set(ids).size !== ids.length) fail(`${path} contains a duplicate id`);
}

function pattern(v: unknown, path: string): Pattern {
  const o = obj(v, path);
  if (o.kind === 'once') return { kind: 'once', date: dateStr(o.date, `${path}.date`) };
  if (o.kind === 'weekly') {
    const weekdays = arr(o.weekdays, `${path}.weekdays`).map((d, i) => int(d, `${path}.weekdays[${i}]`, 0, 6));
    if (weekdays.length === 0) fail(`${path}.weekdays must not be empty`);
    const from = dateStr(o.from, `${path}.from`);
    const to = dateStr(o.to, `${path}.to`);
    if (to < from) fail(`${path} must end on or after its start date`);
    return { kind: 'weekly', weekdays, from, to };
  }
  return fail(`${path}.kind must be "once" or "weekly"`);
}

function commitment(v: unknown, path: string): Commitment {
  const o = obj(v, path);
  const w = windowOf({ start: o.start, end: o.end }, path);
  return {
    id: str(o.id, `${path}.id`),
    title: str(o.title, `${path}.title`),
    category: str(o.category, `${path}.category`),
    start: w.start,
    end: w.end,
    pattern: pattern(o.pattern, `${path}.pattern`),
    exceptions: arr(o.exceptions, `${path}.exceptions`).map((d, i) => dateStr(d, `${path}.exceptions[${i}]`)),
    bufferBefore: int(o.bufferBefore, `${path}.bufferBefore`, 0, 240),
  };
}

function task(v: unknown, path: string): Task {
  const o = obj(v, path);
  return {
    id: str(o.id, `${path}.id`),
    title: str(o.title, `${path}.title`),
    category: str(o.category, `${path}.category`),
    weeklyMinutes: o.weeklyMinutes === null ? null : int(o.weeklyMinutes, `${path}.weeklyMinutes`, 0, 10080),
    maxBlock: int(o.maxBlock, `${path}.maxBlock`, 5, 1440),
    onePerDay: bool(o.onePerDay, `${path}.onePerDay`),
    priority: int(o.priority, `${path}.priority`, 1, 5),
  };
}

function deadline(v: unknown, path: string): Deadline {
  const o = obj(v, path);
  return {
    id: str(o.id, `${path}.id`),
    taskId: str(o.taskId, `${path}.taskId`),
    kind: str(o.kind, `${path}.kind`),
    dueDate: dateStr(o.dueDate, `${path}.dueDate`),
    effortMinutes: int(o.effortMinutes, `${path}.effortMinutes`, 0, 100000),
  };
}

function block(v: unknown, path: string): Block {
  const o = obj(v, path);
  const w = windowOf({ start: o.start, end: o.end }, path);
  return {
    taskId: str(o.taskId, `${path}.taskId`),
    title: str(o.title, `${path}.title`),
    category: str(o.category, `${path}.category`),
    date: dateStr(o.date, `${path}.date`),
    start: w.start,
    end: w.end,
    ...(o.deadlineId === undefined ? {} : { deadlineId: str(o.deadlineId, `${path}.deadlineId`) }),
  };
}

function preferences(v: unknown, path: string): Preferences {
  const o = obj(v, path);
  return {
    weekdayWindow: windowOf(o.weekdayWindow, `${path}.weekdayWindow`),
    dayOffWindow: windowOf(o.dayOffWindow, `${path}.dayOffWindow`),
    daysOff: arr(o.daysOff, `${path}.daysOff`).map((d, i) => int(d, `${path}.daysOff[${i}]`, 0, 6)),
    minBlock: int(o.minBlock, `${path}.minBlock`, 5, 240),
    minBreak: int(o.minBreak, `${path}.minBreak`, 0, 120),
    softWindows: arr(o.softWindows, `${path}.softWindows`).map((s, i): SoftWindow => {
      const so = obj(s, `${path}.softWindows[${i}]`);
      const w = windowOf(so, `${path}.softWindows[${i}]`);
      return { weekday: int(so.weekday, `${path}.softWindows[${i}].weekday`, 0, 6), ...w };
    }),
  };
}

export function validateState(x: unknown): State {
  const o = obj(x, 'state');
  const tasks = arr(o.tasks, 'tasks').map((t, i) => task(t, `tasks[${i}]`));
  const deadlines = arr(o.deadlines, 'deadlines').map((d, i) => deadline(d, `deadlines[${i}]`));
  const commitments = arr(o.commitments, 'commitments').map((c, i) => commitment(c, `commitments[${i}]`));
  unique(tasks.map((t) => t.id), 'tasks');
  unique(deadlines.map((d) => d.id), 'deadlines');
  unique(commitments.map((c) => c.id), 'commitments');
  deadlines.forEach((d, i) => {
    if (!tasks.some((t) => t.id === d.taskId)) fail(`deadlines[${i}].taskId does not match any task`);
  });
  return {
    commitments,
    tasks,
    deadlines,
    preferences: preferences(o.preferences ?? defaultPreferences, 'preferences'),
    blocks: arr(o.blocks ?? [], 'blocks').map((b, i) => block(b, `blocks[${i}]`)),
  };
}
```

- [ ] **Step 5: Write `src/store.ts`**

```ts
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { defaultPreferences } from './defaults.ts';
import type { State } from './types.ts';
import { ValidationError, validateState } from './validate.ts';

export function emptyState(): State {
  return {
    commitments: [],
    tasks: [],
    deadlines: [],
    preferences: structuredClone(defaultPreferences),
    blocks: [],
  };
}

export function loadState(path: string): State {
  if (!existsSync(path)) return emptyState();
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`Cannot read ${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    return validateState(raw);
  } catch (err) {
    if (err instanceof ValidationError) throw new Error(`${path} is not a valid state file: ${err.message}`);
    throw err;
  }
}

export function saveState(path: string, state: State): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(tmp, path);
}
```

- [ ] **Step 6: Write `src/replan.ts`**

```ts
import { plan } from './planner.ts';
import type { Block, DateStr, Minutes, State, Warning } from './types.ts';

export function replan(
  state: State,
  today: DateStr,
  nowMinutes?: Minutes,
  horizonDays = 14,
): { state: State; warnings: Warning[] } {
  const kept: Block[] = state.blocks.filter(
    (b) => b.date < today || (b.date === today && nowMinutes !== undefined && b.end <= nowMinutes),
  );
  const result = plan({
    today,
    ...(nowMinutes === undefined ? {} : { nowMinutes }),
    horizonDays,
    commitments: state.commitments,
    tasks: state.tasks,
    deadlines: state.deadlines,
    preferences: state.preferences,
    pastBlocks: kept,
  });
  return { state: { ...state, blocks: [...kept, ...result.blocks] }, warnings: result.warnings };
}
```

- [ ] **Step 7: Run the whole suite**

Run: `npm test`
Expected: PASS for every file. If a `validate` test fails because the message did not match its regular expression, fix the message wording in `validate.ts` so it contains the field path shown in the test (the tests pin the paths, which are what a user needs to find the mistake).

- [ ] **Step 8: Commit**

```bash
git add src test
git commit -m "feat: add validation, JSON storage and replanning" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Local JSON API

**Files:**
- Create: `src/server.ts`
- Modify: `src/validate.ts` (append `validateReplanRequest`)
- Test: `test/server.test.ts`

**Interfaces:**
- Consumes: `loadState`, `saveState`, `validateState`, `ValidationError`, `replan`, helpers `dateStr`, `int`, `isObj`, `fail`.
- Produces:
  - `validateReplanRequest(x: unknown): { today: DateStr; nowMinutes?: Minutes; horizonDays: number }` (`horizonDays` defaults to 14, allowed 1 to 60).
  - `createApp(statePath: string): Server` (from `node:http`; the caller calls `.listen`).
  - Routes: `GET /api/state` returns the state. `PUT /api/state` validates and saves, returns `{ ok: true }`. `POST /api/replan` takes `{ today, nowMinutes?, horizonDays? }`, saves, returns `{ blocks, warnings }`. Errors are `{ error: string }` with 400 (validation), 403 (Host not `localhost` or `127.0.0.1`), 404, 413 (body over 1 MB), 415 (Content-Type not `application/json`), 500 (anything else).

- [ ] **Step 1: Write the failing tests**

Create `test/server.test.ts`:

```ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { createApp } from '../src/server.ts';
import { emptyState } from '../src/store.ts';
import { task } from './helpers.ts';

let server: Server;
let base: string;
let file: string;
let port: number;

before(async () => {
  file = join(mkdtempSync(join(tmpdir(), 'doitwithme-api-')), 'db.json');
  server = createApp(file);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
});

after(() => {
  server.close();
});

const json = { 'content-type': 'application/json' };
const put = (body: unknown) => fetch(`${base}/api/state`, { method: 'PUT', headers: json, body: JSON.stringify(body) });

test('GET /api/state on a fresh install returns an empty state', async () => {
  const res = await fetch(`${base}/api/state`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), emptyState());
});

test('PUT with an invalid body is a 400 and leaves the file untouched', async () => {
  const bad = { ...emptyState(), tasks: [task({ maxBlock: 0 })] };
  const res = await put(bad);
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /tasks\[0\]\.maxBlock/);
  assert.equal(existsSync(file), false);
});

test('PUT with a bad date like 2026-02-31 is rejected', async () => {
  const bad = { ...emptyState(), tasks: [task()], deadlines: [{ id: 'd', taskId: 't1', kind: 'exam', dueDate: '2026-02-31', effortMinutes: 60 }] };
  assert.equal((await put(bad)).status, 400);
});

test('PUT then GET returns what was saved', async () => {
  const good = { ...emptyState(), tasks: [task({ weeklyMinutes: 300 })] };
  assert.equal((await put(good)).status, 200);
  assert.deepEqual(await (await fetch(`${base}/api/state`)).json(), good);
});

test('POST /api/replan returns blocks and warnings and saves them', async () => {
  const res = await fetch(`${base}/api/replan`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ today: '2026-10-05' }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.blocks.length > 0);
  assert.ok(Array.isArray(body.warnings));
  const saved = await (await fetch(`${base}/api/state`)).json();
  assert.deepEqual(saved.blocks, body.blocks);
});

test('POST /api/replan rejects a bad request', async () => {
  const res = await fetch(`${base}/api/replan`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ today: 'tomorrow' }),
  });
  assert.equal(res.status, 400);
});

test('a cross-site style text/plain post is refused with 415', async () => {
  const res = await fetch(`${base}/api/replan`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify({ today: '2026-10-05' }),
  });
  assert.equal(res.status, 415);
});

test('malformed JSON is a 400', async () => {
  const res = await fetch(`${base}/api/state`, { method: 'PUT', headers: json, body: '{nope' });
  assert.equal(res.status, 400);
});

test('an unexpected Host header is refused with 403', async () => {
  const status = await new Promise<number>((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port, path: '/api/state', headers: { host: 'evil.example' } },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      },
    );
    req.on('error', reject);
    req.end();
  });
  assert.equal(status, 403);
});

test('unknown routes are 404', async () => {
  assert.equal((await fetch(`${base}/nope`)).status, 404);
});

test('a corrupt data file is a 500 that names the problem and is not overwritten', async () => {
  const bad = join(mkdtempSync(join(tmpdir(), 'doitwithme-corrupt-')), 'db.json');
  writeFileSync(bad, '{ broken');
  const s = createApp(bad);
  await new Promise<void>((resolve) => s.listen(0, '127.0.0.1', resolve));
  const p = (s.address() as AddressInfo).port;
  const res = await fetch(`http://127.0.0.1:${p}/api/state`);
  assert.equal(res.status, 500);
  assert.match((await res.json()).error, /db\.json/);
  s.close();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/server.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/server.ts`.

- [ ] **Step 3: Append `validateReplanRequest` to `src/validate.ts`**

```ts
export function validateReplanRequest(x: unknown): { today: string; nowMinutes?: number; horizonDays: number } {
  const o = obj(x, 'request');
  return {
    today: dateStr(o.today, 'today'),
    ...(o.nowMinutes === undefined ? {} : { nowMinutes: int(o.nowMinutes, 'nowMinutes', 0, 1440) }),
    horizonDays: o.horizonDays === undefined ? 14 : int(o.horizonDays, 'horizonDays', 1, 60),
  };
}
```

- [ ] **Step 4: Write `src/server.ts`**

```ts
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { replan } from './replan.ts';
import { loadState, saveState } from './store.ts';
import { ValidationError, validateReplanRequest, validateState } from './validate.ts';

const MAX_BODY = 1_000_000;
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
        const result = replan(loadState(statePath), request.today, request.nowMinutes, request.horizonDays);
        saveState(statePath, result.state);
        return send(res, 200, { blocks: result.state.blocks, warnings: result.warnings });
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

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS for every file. Not covered by an automated test: the 413 oversize-body guard (sending a body that large over loopback is racy). It is a few lines above and is checked by reading.

- [ ] **Step 6: Commit**

```bash
git add src test
git commit -m "feat: add local JSON API" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Plain-text week view, CLI and sample data

This is a debugging view so the planner can be used and judged before any UI exists. It is deliberately plain text. It is not the UI.

**Files:**
- Create: `src/format.ts`, `src/cli.ts`, `examples/sample-state.json`
- Test: `test/format.test.ts`, `test/sample.test.ts`

**Interfaces:**
- Consumes: `occurrencesOn`, `replan`, `loadState`, `validateState`, `weekdayOf`, `addDays`, types.
- Produces:
  - `hhmm(m: Minutes): string` (`545` gives `09:05`).
  - `formatPlan(commitments: Commitment[], blocks: Block[], warnings: Warning[], today: DateStr, days: number): string`.
  - `npm run plan [path-to-state-file]` prints the plan from `today` for 14 days. It replans in memory and does not save unless `--save` is passed. Default file is `data/db.json`; with no file it prints a hint to copy `examples/sample-state.json`.

- [ ] **Step 1: Write the failing tests**

Create `test/format.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPlan, hhmm } from '../src/format.ts';
import { commitment } from './helpers.ts';

test('hhmm pads hours and minutes', () => {
  assert.equal(hhmm(545), '09:05');
  assert.equal(hhmm(0), '00:00');
  assert.equal(hhmm(1260), '21:00');
});

test('a day lists commitments and blocks in time order with warnings after', () => {
  const text = formatPlan(
    [commitment({ title: 'Chemistry lecture', start: 600, end: 720, pattern: { kind: 'once', date: '2026-10-05' } })],
    [{ taskId: 't1', title: 'Study', category: 'study', date: '2026-10-05', start: 480, end: 570 }],
    [{ kind: 'deadline-short', message: 'Study exam due 2026-10-07 is short by 60 min' }],
    '2026-10-05',
    2,
  );
  const lines = text.split('\n');
  assert.equal(lines[0], 'Mon 2026-10-05');
  assert.equal(lines[1], '  08:00-09:30  Study (study)');
  assert.equal(lines[2], '  10:00-12:00  Chemistry lecture [fixed]');
  assert.equal(lines[3], 'Tue 2026-10-06');
  assert.equal(lines[4], '  (nothing planned)');
  assert.ok(text.includes('Warnings:\n  - Study exam due 2026-10-07 is short by 60 min'));
});

test('no warnings prints a clear line instead of an empty section', () => {
  assert.ok(formatPlan([], [], [], '2026-10-05', 1).endsWith('No warnings.'));
});
```

Create `test/sample.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { replan } from '../src/replan.ts';
import { validateState } from '../src/validate.ts';

const sample = () => validateState(JSON.parse(readFileSync('examples/sample-state.json', 'utf8')));

test('the sample state file is valid', () => {
  assert.doesNotThrow(sample);
});

test('the sample plans without touching Sunday mass and with no crash', () => {
  const { state } = replan(sample(), '2026-10-05', undefined, 14);
  assert.ok(state.blocks.length > 0);
  const sunday = state.blocks.filter((b) => b.date === '2026-10-11');
  assert.ok(sunday.every((b) => b.end <= 1170));
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL: `src/format.ts` missing and `examples/sample-state.json` missing.

- [ ] **Step 3: Write `src/format.ts`**

```ts
import { occurrencesOn } from './busy.ts';
import { addDays, weekdayOf } from './dates.ts';
import type { Block, Commitment, DateStr, Minutes, Warning } from './types.ts';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function hhmm(m: Minutes): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function formatPlan(
  commitments: Commitment[],
  blocks: Block[],
  warnings: Warning[],
  today: DateStr,
  days: number,
): string {
  const lines: string[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    lines.push(`${DAY_NAMES[weekdayOf(date)]} ${date}`);
    const entries = [
      ...occurrencesOn(date, commitments).map((o) => ({
        start: o.start,
        text: `${hhmm(o.start)}-${hhmm(o.end)}  ${o.title} [fixed]`,
      })),
      ...blocks
        .filter((b) => b.date === date)
        .map((b) => ({ start: b.start, text: `${hhmm(b.start)}-${hhmm(b.end)}  ${b.title} (${b.category})` })),
    ].sort((a, b) => a.start - b.start);
    if (entries.length === 0) lines.push('  (nothing planned)');
    for (const e of entries) lines.push(`  ${e.text}`);
  }
  if (warnings.length === 0) {
    lines.push('No warnings.');
  } else {
    lines.push('Warnings:');
    for (const w of warnings) lines.push(`  - ${w.message}`);
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: Write `src/cli.ts`**

```ts
import { existsSync } from 'node:fs';
import { formatPlan } from './format.ts';
import { replan } from './replan.ts';
import { loadState, saveState } from './store.ts';

const args = process.argv.slice(2);
const save = args.includes('--save');
const file = args.find((a) => !a.startsWith('--')) ?? 'data/db.json';

if (!existsSync(file)) {
  console.log(`No data file at ${file}.`);
  console.log('Start from the example:  mkdir -p data && cp examples/sample-state.json data/db.json');
  process.exit(1);
}

const now = new Date();
const pad = (n: number): string => String(n).padStart(2, '0');
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const nowMinutes = now.getHours() * 60 + now.getMinutes();
const horizonDays = 14;

const result = replan(loadState(file), today, nowMinutes, horizonDays);
console.log(formatPlan(result.state.commitments, result.state.blocks, result.warnings, today, horizonDays));
if (save) {
  saveState(file, result.state);
  console.log(`\nSaved the plan to ${file}.`);
}
```

- [ ] **Step 5: Write `examples/sample-state.json`**

This is made-up example data in the shape of the user's described life. It is not the user's real schedule.

```json
{
  "commitments": [
    {
      "id": "mass",
      "title": "Mass",
      "category": "mass",
      "start": 1200,
      "end": 1260,
      "pattern": { "kind": "weekly", "weekdays": [0], "from": "2026-09-01", "to": "2026-12-31" },
      "exceptions": [],
      "bufferBefore": 30
    },
    {
      "id": "chem-lecture",
      "title": "Chemistry lecture",
      "category": "class",
      "start": 600,
      "end": 720,
      "pattern": { "kind": "weekly", "weekdays": [2, 4], "from": "2026-09-01", "to": "2026-12-18" },
      "exceptions": [],
      "bufferBefore": 30
    },
    {
      "id": "lesson-1",
      "title": "Private lesson",
      "category": "lesson",
      "start": 960,
      "end": 1020,
      "pattern": { "kind": "weekly", "weekdays": [3], "from": "2026-09-01", "to": "2026-12-18" },
      "exceptions": [],
      "bufferBefore": 30
    }
  ],
  "tasks": [
    { "id": "chem", "title": "Chemistry", "category": "study", "weeklyMinutes": 360, "maxBlock": 90, "onePerDay": false, "priority": 2 },
    { "id": "gym", "title": "Gym", "category": "gym", "weeklyMinutes": 180, "maxBlock": 60, "onePerDay": true, "priority": 3 },
    { "id": "laundry", "title": "Laundry", "category": "chores", "weeklyMinutes": 60, "maxBlock": 60, "onePerDay": false, "priority": 4 },
    { "id": "side", "title": "Side project", "category": "personal project", "weeklyMinutes": 240, "maxBlock": 120, "onePerDay": false, "priority": 5 }
  ],
  "deadlines": [
    { "id": "chem-exam", "taskId": "chem", "kind": "exam", "dueDate": "2026-10-23", "effortMinutes": 480 }
  ],
  "preferences": {
    "weekdayWindow": { "start": 480, "end": 1320 },
    "dayOffWindow": { "start": 600, "end": 1200 },
    "daysOff": [0, 6],
    "minBlock": 30,
    "minBreak": 10,
    "softWindows": [
      { "weekday": 5, "start": 1080, "end": 1440 },
      { "weekday": 6, "start": 1080, "end": 1440 }
    ]
  },
  "blocks": []
}
```

- [ ] **Step 6: Run the whole suite and try the CLI**

Run: `npm test`
Expected: PASS for every file.

Run: `node src/cli.ts examples/sample-state.json`
Expected: 14 days printed, each with fixed items marked `[fixed]` and study/gym/chores blocks, then `No warnings.` or a list of warnings. Read the output once for plausibility: nothing scheduled over Sunday mass, nothing on Friday or Saturday evening unless a warning explains it.

- [ ] **Step 7: Commit**

```bash
git add src examples test
git commit -m "feat: add plain-text plan view, CLI and sample data" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: README and final verification

**Files:**
- Modify: `README.md` (currently one line: `# doitwithme`)

- [ ] **Step 1: Replace `README.md`**

````markdown
# doitwithme

A personal everyday planner. It fits flexible tasks (study, gym, chores, errands, projects) around your fixed commitments, ramps up work toward deadlines, and tells you plainly when something cannot fit.

**Status:** Phase 1 (core planner). There is no graphical UI yet; it is waiting on design references. Design: `docs/superpowers/specs/`. Plan: `docs/superpowers/plans/`.

## Requirements

Node 22.18 or newer (developed on Node 25). No npm dependencies.

## Use it

```
npm test                                   # run all tests
mkdir -p data && cp examples/sample-state.json data/db.json
npm run plan                               # print the next 14 days from data/db.json
npm run plan -- --save                     # same, and save the generated blocks
npm run serve                              # local API on http://127.0.0.1:8787
```

Your real data lives in `data/db.json`, which git ignores. Edit it by hand or through the API:

- `GET /api/state` returns everything.
- `PUT /api/state` replaces it (validated; bad input is rejected and nothing is written).
- `POST /api/replan` with `{ "today": "2026-10-05", "nowMinutes": 780, "horizonDays": 14 }` re-plans from today and saves.

## How planning works

- Fixed commitments (with optional buffer before, and cancelled dates) are never moved.
- Each task asks for a weekly amount; each deadline asks for total effort by its date. The daily amount is the remaining work divided by the days that can still hold it, so it rises as the date nears.
- Higher `priority` (1 is highest) wins when time is short.
- Friday and Saturday evenings are "soft": avoided, but study may use them as a last resort (a deadline would be missed, or a weekly study target would fall short), and then the plan says so. Chores, gym and errands never take them.
- Past days are never rewritten when you re-plan.
````

- [ ] **Step 2: Run everything one last time**

Run: `npm test`
Expected: PASS, no skipped tests.

Run: `git status`
Expected: only `README.md` modified and nothing under `data/` tracked.

- [ ] **Step 3: Commit and push**

```bash
git add README.md
git commit -m "docs: describe Phase 1 usage" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push
```

---

## Self-review notes

- **Spec coverage:** own schedule entry with recurring patterns and exceptions (Tasks 2, 7); tasks, deadlines and ramp (3); preferences, days-off cutoff, break and block rules (4); Sunday mass buffer, cancelled lessons, protected fixed lessons (4); weekend soft time (6); never-silent shortfalls (5); replan keeps the past (7); local storage (7); local API (8); text view (9). Deferred items are listed at the top.
- **Types:** `PlanInput`, `Block.deadlineId`, `Slot`, `Demand`, and `UsableDays` are defined once and used with the same names in every later task. `daySlots` gains its third parameter only in Task 6, and Task 6 lists every call site to change.
- **Known limits, stated plainly:** the code in this plan has not been run yet; the first red-to-green cycle in each task is the check. Weekly-shortfall warnings cover only whole weeks inside the horizon. The 413 guard has no automated test. There is no type checker because of the disk constraint; the tests are the safety net.

---

## Execution notes (added after the final review)

Where the shipped code differs from the plan text above, the code and tests are right:

- **Soft time is study-only.** An opened soft window accepts only tasks with category `study` (not "deadline work", which let an errand with a deadline take Friday evening). Soft dates are kept only if opening them reduces the study shortfall, so an unfixable overdue deadline no longer opens every evening.
- **One session per day for `onePerDay` tasks.** The planner requires a slot that fits the whole session instead of splitting it across two slots.
- **Replan keeps the finished part of a running block** (clipped to `nowMinutes`) and hands the planner only this week's history plus deadline-tagged blocks, so replans stay fast as history grows.
- **Soft windows may not overlap** on the same weekday (validation error).
- The replan test "work done earlier counts" uses `horizonDays` 5, because the default horizon correctly plans next week's fresh target.
