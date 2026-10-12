# Attendance advice (piece 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A class linked to a course shows advice (Go, Skippable, Optional or No advice yet, with reasons) in its panel, computed by a plain rule from evidence the user types.

**Architecture:** Course gets three optional evidence fields and a class commitment gets an optional `courseId`. A pure rule in `src/attendance.ts` produces advice per class occurrence, and the replan response carries it as `attendance`. The browser store keeps it and the class panel shows it beside the existing "Skip this day".

**Tech Stack:** TypeScript run by Node's type stripping (`node --test`), plain ES module browser code, hand-rolled fake DOM in tests. Run all tests with `npm test`.

**Spec:** `docs/superpowers/specs/2026-10-11-attendance-design.md`

## Global Constraints

- No emojis, no gradients, no inline styles (CSP), all text through `h()`, real buttons, keyboard reachable, reduced motion respected.
- Advice only: nothing is ever skipped automatically. Skipping is the existing "Skip this day".
- Percentages are whole numbers 0 to 100. `recorded` is `'yes'`, `'no'` or `'unknown'`.
- Only a `class` category commitment may have `courseId`, and it must name a task that has a course.
- Old saved state loads unchanged (no new fields needed).
- Computing advice must never fail a replan.
- Do not push. The user pushes when they say yes.
- Commit trailer on every commit: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Spec detail made precise here: an unlinked or dangling link is silent; "behind" is the total `detail.minutes` of the linked task's `weekly-short` and `deadline-short` warnings from the replan (dismissed or not).

## Review Focus

- A class linked to a course whose details are later removed, or whose task is deleted: no crash, and saving is not blocked by a hidden stale link (Tasks 1 and 4).
- Weight typed as 0 versus left blank: blank is "No advice yet", 0 is a real answer (Tasks 2 and 4).
- A skipped (excepted) date gets no advice and the next week's date still does (Task 2).
- Hostile text in a course title appears in reasons as plain text only (Tasks 2 and 5).
- A class with a course whose task has no weekly target and no deadline: not behind, never `undefined` in a sentence (Task 2).
- Dismissed shortfall still counts as behind (Task 2).

---

## File structure

- `src/types.ts`, `src/validate.ts`: evidence fields and `courseId` (Task 1).
- `src/attendance.ts` (new): the rule and `attendanceFor` (Task 2). `src/server.ts`: `attendance` in the replan body (Task 3).
- `public/js/store.js`: keeps `attendance` (Task 3). `public/js/attendance-ui.js` (new), `public/js/drawer.js`, `public/css/app.css`: the advice block (Task 5).
- `public/js/setup-model.js`, `public/js/setup.js`: Tasks form rows, class form Course choice, unlinking (Task 4).
- `docs/ui-visual-check.md`, one end-to-end test (Task 6).

---

### Task 1: Data and validation

**Files:**
- Modify: `src/types.ts` (Course, Commitment), `src/validate.ts` (courseOf, commitment, validateState)
- Test: `test/validate.test.ts`

**Interfaces:**
- Produces: `type Recorded = 'yes' | 'no' | 'unknown'`; `Course.attendanceWeight?: number`, `Course.recorded?: Recorded`, `Course.examShare?: number`; `Commitment.courseId?: string`.

- [ ] **Step 1: Write the failing tests** (append to `test/validate.test.ts`)

```ts
const withCourse = (course: any, over: any = {}) => ({
  ...emptyState(),
  tasks: [task({ id: 'chem', course: { credits: 3, difficulty: 3, examOnly: false, weeklyGraded: false, lab: false, syllabus: '', ...course } })],
  commitments: [commitment({ id: 'lec', category: 'class', courseId: 'chem' })],
  ...over,
});

test('attendance evidence on a course is optional and validated', () => {
  const ok = validateState(withCourse({ attendanceWeight: 0, recorded: 'yes', examShare: 70 }));
  assert.deepEqual([ok.tasks[0].course?.attendanceWeight, ok.tasks[0].course?.recorded, ok.tasks[0].course?.examShare], [0, 'yes', 70]);
  const bare = validateState(withCourse({}));
  assert.equal('attendanceWeight' in bare.tasks[0].course!, false);
  assert.throws(() => validateState(withCourse({ attendanceWeight: 101 })), /attendanceWeight/);
  assert.throws(() => validateState(withCourse({ attendanceWeight: 2.5 })), /attendanceWeight/);
  assert.throws(() => validateState(withCourse({ examShare: -1 })), /examShare/);
  assert.throws(() => validateState(withCourse({ recorded: 'maybe' })), /recorded/);
});

test('a class may link to a course, and nothing else may', () => {
  assert.equal(validateState(withCourse({})).commitments[0].courseId, 'chem');
  assert.throws(() => validateState(withCourse({}, { commitments: [commitment({ id: 'lec', category: 'class', courseId: 'nope' })] })), /courseId does not match any course/);
  assert.throws(() => validateState(withCourse({}, { tasks: [task({ id: 'chem' })] })), /courseId does not match any course/);
  assert.throws(() => validateState(withCourse({}, { commitments: [commitment({ id: 'les', category: 'lesson', courseId: 'chem' })] })), /only for classes/);
});
```

(Add `commitment` to the import from `./helpers.ts` if it is not there already; `task` is.)

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/validate.test.ts`
Expected: FAIL (the new fields are dropped or accepted, no `courseId` check).

- [ ] **Step 3: Implement**

`src/types.ts`: add before `export interface Course`:

```ts
export type Recorded = 'yes' | 'no' | 'unknown';
```

In `Course` add after `syllabus: string;`:

```ts
  attendanceWeight?: number;
  recorded?: Recorded;
  examShare?: number;
```

In `Commitment` add after `placeId?: string;`:

```ts
  courseId?: string;
```

`src/validate.ts`: add `Recorded` to the type import. In `courseOf`, change the returned object to also include:

```ts
    ...(o.attendanceWeight === undefined ? {} : { attendanceWeight: int(o.attendanceWeight, `${path}.attendanceWeight`, 0, 100) }),
    ...(o.recorded === undefined ? {} : { recorded: recordedOf(o.recorded, `${path}.recorded`) }),
    ...(o.examShare === undefined ? {} : { examShare: int(o.examShare, `${path}.examShare`, 0, 100) }),
```

and add above `courseOf`:

```ts
function recordedOf(v: unknown, path: string): Recorded {
  if (v !== 'yes' && v !== 'no' && v !== 'unknown') fail(`${path} must be "yes", "no" or "unknown"`);
  return v as Recorded;
}
```

In `commitment()` add after the `placeId` line:

```ts
    ...(o.courseId === undefined ? {} : { courseId: str(o.courseId, `${path}.courseId`) }),
```

In `validateState`, after the existing `commitments.forEach` placeId check, add:

```ts
  commitments.forEach((c, i) => {
    if (c.courseId === undefined) return;
    if (c.category !== 'class') fail(`commitments[${i}].courseId is only for classes`);
    if (!tasks.some((t) => t.id === c.courseId && t.course !== undefined)) fail(`commitments[${i}].courseId does not match any course`);
  });
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src test && git commit -m "feat: attendance evidence on courses and a course link on classes" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The rule and attendanceFor

**Files:**
- Create: `src/attendance.ts`
- Test: `test/attendance.test.ts` (new)

**Interfaces:**
- Consumes: Task 1 types; `occurrencesOn` from `src/busy.ts`; `addDays` from `src/dates.ts`; `Warning` from `src/types.ts`.
- Produces: `type Verdict = 'go' | 'skippable' | 'optional' | 'unknown'`; `interface Advice { verdict: Verdict; reasons: string[] }`; `interface AttendanceAdvice extends Advice { commitmentId: string; date: DateStr }`; `adviseAttendance(course: Course, title: string, shortfallMinutes: number): Advice`; `attendanceFor(state: State, warnings: Warning[], today: DateStr, horizonDays: number): AttendanceAdvice[]`.

- [ ] **Step 1: Write the failing tests** (`test/attendance.test.ts`)

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adviseAttendance, attendanceFor } from '../src/attendance.ts';
import { emptyState } from '../src/store.ts';
import type { Course, Warning } from '../src/types.ts';
import { commitment, task } from './helpers.ts';

const course = (over: Partial<Course> = {}): Course => ({ credits: 3, difficulty: 3, examOnly: false, weeklyGraded: false, lab: false, syllabus: '', ...over });
const advise = (c: Partial<Course>, behind = 0) => adviseAttendance(course(c), 'Chemistry', behind);

test('a lab is always go', () => {
  assert.deepEqual(advise({ lab: true, attendanceWeight: 0, recorded: 'yes' }, 90), { verdict: 'go', reasons: ['Labs need you there.'] });
});

test('without a typed weight there is no advice, even with recordings known', () => {
  assert.deepEqual(advise({ recorded: 'yes' }), { verdict: 'unknown', reasons: ['Add whether attendance counts toward the grade.'] });
});

test('attendance that counts is go and names the percentage', () => {
  assert.deepEqual(advise({ attendanceWeight: 15, recorded: 'yes' }, 90), { verdict: 'go', reasons: ['Attendance counts 15% of the grade.'] });
});

test('zero weight, recorded and behind is skippable with the shortfall in the reason', () => {
  assert.deepEqual(advise({ attendanceWeight: 0, recorded: 'yes' }, 90), {
    verdict: 'skippable', reasons: ['Recorded, attendance counts 0%, and Chemistry is 90 min short.'],
  });
});

test('zero weight, recorded and not behind is optional', () => {
  assert.deepEqual(advise({ attendanceWeight: 0, recorded: 'yes' }, 0), {
    verdict: 'optional', reasons: ['Recorded and attendance counts 0%. Skipping is fine, but you are not behind.'],
  });
});

test('zero weight and not recorded is optional, and a big exam share adds a sentence at 50 but not at 49', () => {
  const base = 'Not recorded, so skipping means missing the lecture.';
  assert.deepEqual(advise({ attendanceWeight: 0, recorded: 'no', examShare: 49 }), { verdict: 'optional', reasons: [base] });
  assert.deepEqual(advise({ attendanceWeight: 0, recorded: 'no', examShare: 50 }), {
    verdict: 'optional', reasons: [base, 'Exams are 50% of the grade, so what is said here matters.'],
  });
});

test('zero weight with unknown recording is optional', () => {
  assert.deepEqual(advise({ attendanceWeight: 0 }), { verdict: 'optional', reasons: ['Attendance counts 0%. I do not know if it is recorded.'] });
  assert.equal(advise({ attendanceWeight: 0, recorded: 'unknown' }).verdict, 'optional');
});

test('a course title is plain text in the reasons', () => {
  const advice = adviseAttendance(course({ attendanceWeight: 0, recorded: 'yes' }), '<img src=x onerror=alert(1)>', 30);
  assert.equal(advice.reasons[0], 'Recorded, attendance counts 0%, and <img src=x onerror=alert(1)> is 30 min short.');
});

// 2026-10-05 is a Monday.
const MON = '2026-10-05';
const stateWith = (courseOver: Partial<Course>, commitmentOver: any = {}) => ({
  ...emptyState(),
  tasks: [task({ id: 'chem', title: 'Chemistry', course: course(courseOver) })],
  commitments: [commitment({ id: 'lec', category: 'class', courseId: 'chem', pattern: { kind: 'weekly', weekdays: [1], from: MON, to: '2026-12-31' }, ...commitmentOver })],
});
const short = (taskId: string, minutes: number, kind: Warning['kind'] = 'weekly-short'): Warning => ({ kind, message: 'x', detail: { taskId, minutes } });

test('one entry per occurrence in the horizon, sorted, for classes with a course only', () => {
  const state = stateWith({ attendanceWeight: 0, recorded: 'yes' });
  state.commitments.push(commitment({ id: 'other', category: 'class', pattern: { kind: 'weekly', weekdays: [1], from: MON, to: '2026-12-31' } }));
  const out = attendanceFor(state, [short('chem', 60)], MON, 15);
  assert.deepEqual(out.map((a) => [a.commitmentId, a.date, a.verdict]), [['lec', MON, 'skippable'], ['lec', '2026-10-12', 'skippable'], ['lec', '2026-10-19', 'skippable']]);
});

test('a skipped date gets no advice and later weeks still do', () => {
  const state = stateWith({ attendanceWeight: 0, recorded: 'yes' }, { exceptions: ['2026-10-12'] });
  assert.deepEqual(attendanceFor(state, [], MON, 15).map((a) => a.date), [MON, '2026-10-19']);
});

test('any shortfall of the linked task counts, dismissed or not, and other tasks do not', () => {
  const state = stateWith({ attendanceWeight: 0, recorded: 'yes' });
  const warnings = [short('chem', 40), short('chem', 50, 'deadline-short'), short('gym', 500)];
  assert.match(attendanceFor(state, warnings, MON, 1)[0].reasons[0], /Chemistry is 90 min short/);
  assert.equal(attendanceFor(state, [short('gym', 500)], MON, 1)[0].verdict, 'optional');
});

test('a link to a task that is gone or has no course is skipped without a crash', () => {
  const gone = { ...stateWith({}), tasks: [] };
  assert.deepEqual(attendanceFor(gone, [], MON, 15), []);
  const plain = { ...stateWith({}), tasks: [task({ id: 'chem', title: 'Chemistry' })] };
  assert.deepEqual(attendanceFor(plain, [], MON, 15), []);
});

test('a warning without a detail or minutes counts as zero', () => {
  const state = stateWith({ attendanceWeight: 0, recorded: 'yes' });
  const odd: Warning[] = [{ kind: 'weekly-short', message: 'x' }, { kind: 'weekly-short', message: 'x', detail: { taskId: 'chem' } }];
  assert.equal(attendanceFor(state, odd, MON, 1)[0].verdict, 'optional');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/attendance.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** (`src/attendance.ts`)

```ts
import { occurrencesOn } from './busy.ts';
import { addDays } from './dates.ts';
import type { Course, DateStr, State, Warning } from './types.ts';

export type Verdict = 'go' | 'skippable' | 'optional' | 'unknown';

export interface Advice {
  verdict: Verdict;
  reasons: string[];
}

export interface AttendanceAdvice extends Advice {
  commitmentId: string;
  date: DateStr;
}

// Plain logic with fixed sentences. It only advises; the user decides.
export function adviseAttendance(course: Course, title: string, shortfallMinutes: number): Advice {
  if (course.lab) return { verdict: 'go', reasons: ['Labs need you there.'] };
  if (course.attendanceWeight === undefined) {
    return { verdict: 'unknown', reasons: ['Add whether attendance counts toward the grade.'] };
  }
  if (course.attendanceWeight > 0) {
    return { verdict: 'go', reasons: [`Attendance counts ${course.attendanceWeight}% of the grade.`] };
  }
  if (course.recorded === 'yes') {
    return shortfallMinutes > 0
      ? { verdict: 'skippable', reasons: [`Recorded, attendance counts 0%, and ${title} is ${shortfallMinutes} min short.`] }
      : { verdict: 'optional', reasons: ['Recorded and attendance counts 0%. Skipping is fine, but you are not behind.'] };
  }
  if (course.recorded === 'no') {
    const reasons = ['Not recorded, so skipping means missing the lecture.'];
    if (course.examShare !== undefined && course.examShare >= 50) {
      reasons.push(`Exams are ${course.examShare}% of the grade, so what is said here matters.`);
    }
    return { verdict: 'optional', reasons };
  }
  return { verdict: 'optional', reasons: ['Attendance counts 0%. I do not know if it is recorded.'] };
}

// Behind means the task has an open shortfall; a dismissed one still counts, dismissing only hides it from Nudge.
function shortfallOf(taskId: string, warnings: Warning[]): number {
  return warnings
    .filter((w) => (w.kind === 'weekly-short' || w.kind === 'deadline-short') && w.detail?.taskId === taskId)
    .reduce((t, w) => t + (w.detail?.minutes ?? 0), 0);
}

export function attendanceFor(state: State, warnings: Warning[], today: DateStr, horizonDays: number): AttendanceAdvice[] {
  const out: AttendanceAdvice[] = [];
  for (const c of state.commitments) {
    if (c.courseId === undefined) continue;
    const task = state.tasks.find((t) => t.id === c.courseId);
    if (!task || !task.course) continue;
    const advice = adviseAttendance(task.course, task.title, shortfallOf(task.id, warnings));
    for (let i = 0; i < horizonDays; i++) {
      const date = addDays(today, i);
      if (occurrencesOn(date, [c]).length > 0) out.push({ commitmentId: c.id, date, ...advice, reasons: [...advice.reasons] });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.commitmentId.localeCompare(b.commitmentId));
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src test && git commit -m "feat: the attendance rule and advice for each class occurrence" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Replan carries the advice; the store keeps it

**Files:**
- Modify: `src/server.ts` (`replanned`), `public/js/store.js`
- Test: `test/server.attendance.test.ts` (new), `test/frontend/store.test.ts`

**Interfaces:**
- Consumes: `attendanceFor` (Task 2).
- Produces: the replan body gains `attendance: AttendanceAdvice[]`; store state `attendance` (array, default `[]`), set by `merged()` from `r.attendance ?? []`.

- [ ] **Step 1: Write the failing tests**

`test/server.attendance.test.ts`:

```ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { createApp } from '../src/server.ts';
import { emptyState } from '../src/store.ts';
import { commitment, task } from './helpers.ts';

let server: Server;
let base: string;
const json = { 'content-type': 'application/json' };
const clock = { today: '2026-10-05', horizonDays: 15 };

before(async () => {
  server = createApp(join(mkdtempSync(join(tmpdir(), 'doitwithme-attendance-')), 'db.json'));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => { server.close(); });

test('the replan body carries advice for linked classes, and an empty list otherwise', async () => {
  const course = { credits: 3, difficulty: 3, examOnly: false, weeklyGraded: false, lab: false, syllabus: '', attendanceWeight: 0, recorded: 'yes' };
  const state = {
    ...emptyState(),
    tasks: [task({ id: 'chem', title: 'Chemistry', weeklyMinutes: 2000, course })],
    commitments: [commitment({ id: 'lec', category: 'class', courseId: 'chem', pattern: { kind: 'weekly', weekdays: [1], from: '2026-10-05', to: '2026-12-31' } })],
  };
  assert.equal((await fetch(`${base}/api/state`, { method: 'PUT', headers: json, body: JSON.stringify(state) })).status, 200);
  const body = await (await fetch(`${base}/api/replan`, { method: 'POST', headers: json, body: JSON.stringify(clock) })).json();
  assert.deepEqual(body.attendance.map((a: any) => [a.commitmentId, a.date, a.verdict]), [['lec', '2026-10-05', 'skippable'], ['lec', '2026-10-12', 'skippable'], ['lec', '2026-10-19', 'skippable']]);
  assert.match(body.attendance[0].reasons[0], /Chemistry is \d+ min short/);
  assert.equal((await fetch(`${base}/api/state`, { method: 'PUT', headers: json, body: JSON.stringify(emptyState()) })).status, 200);
  assert.deepEqual((await (await fetch(`${base}/api/replan`, { method: 'POST', headers: json, body: JSON.stringify(clock) })).json()).attendance, []);
});
```

Append to `test/frontend/store.test.ts` (it has `make`, `full`, `result`):

```ts
test('the store keeps the attendance advice from every replan and starts empty', async () => {
  const { store } = make({ replan: () => result({ attendance: [{ commitmentId: 'lec', date: '2026-10-05', verdict: 'go', reasons: ['Labs need you there.'] }] }) });
  assert.deepEqual(store.get().attendance, []);
  await store.load();
  assert.equal(store.get().attendance[0].verdict, 'go');
  const bare = make();
  await bare.store.load();
  assert.deepEqual(bare.store.get().attendance, []);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/server.attendance.test.ts test/frontend/store.test.ts`
Expected: FAIL (`body.attendance` undefined; `store.get().attendance` undefined).

- [ ] **Step 3: Implement**

`src/server.ts`: add `import { attendanceFor } from './attendance.ts';` and `import type { AttendanceAdvice } from './attendance.ts';`. In `replanned()`, before `return`, add:

```ts
  // Advice must never be able to break a replan.
  let attendance: AttendanceAdvice[] = [];
  try {
    attendance = attendanceFor(result.state, result.warnings, clock.today, clock.horizonDays);
  } catch {
    attendance = [];
  }
```

and add `attendance,` to the `body` object after `travel: result.travel,`.

`public/js/store.js`: add `attendance: [],` to the initial `current` (next to `reopened: false, checkInResult: null,`), and add `attendance: r.attendance ?? [],` to `merged()` after `travel: r.travel ?? [],`.

- [ ] **Step 4: Run to verify they pass**

Run: `npm test`
Expected: all pass. If an existing test compares a whole replan body with `deepEqual`, add `attendance: []` to its expectation.

- [ ] **Step 5: Commit**

```bash
git add src public test && git commit -m "feat: replan carries attendance advice and the store keeps it" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Forms: the evidence rows, the Course choice and unlinking

**Files:**
- Modify: `public/js/setup-model.js` (taskKind, commitmentKind, applyItem, removeItem), `public/js/setup.js` (FIELDS)
- Test: `test/frontend/setup-model.test.ts`, `test/frontend/setup.test.ts`

**Interfaces:**
- Consumes: Task 1 fields.
- Produces: task draft fields `attendance` (text, blank means unknown), `recorded` (`'unknown'|'yes'|'no'`), `examShare` (text); commitment draft field `courseId` (`''` for none). `applyItem` and `removeItem` unlink a class whose course is gone.

- [ ] **Step 1: Write the failing tests** (append to `test/frontend/setup-model.test.ts`; it already has `example`, `taskKind`, `commitmentKind`, `applyItem`, `removeItem`, `st`)

```ts
const courseTask = (course: any = {}) => ({ id: 'chem', title: 'Chemistry', category: 'study', weeklyMinutes: 360, maxBlock: 90, onePerDay: false, priority: 2,
  course: { credits: 3, difficulty: 3, examOnly: false, weeklyGraded: false, lab: false, syllabus: '', ...course } });

test('attendance evidence round-trips, and blank means not known', () => {
  const t = courseTask({ attendanceWeight: 0, recorded: 'yes', examShare: 70 });
  const draft = taskKind.toDraft(t);
  assert.deepEqual([draft.attendance, draft.recorded, draft.examShare], ['0', 'yes', '70']);
  assert.deepEqual(taskKind.fromDraft(draft, 'chem', example).item, t);
  const bare = taskKind.toDraft(courseTask());
  assert.deepEqual([bare.attendance, bare.recorded, bare.examShare], ['', 'unknown', '']);
  const course = taskKind.fromDraft(bare, 'chem', example).item.course;
  assert.equal('attendanceWeight' in course || 'examShare' in course, false);
  assert.equal(course.recorded, undefined);
});

test('attendance evidence is refused in plain sentences', () => {
  const draft = { ...taskKind.toDraft(courseTask()), title: 'Chemistry' };
  const err = (over: any) => taskKind.fromDraft({ ...draft, ...over }, 'chem', example).error;
  assert.match(err({ attendance: '101' }), /Attendance/);
  assert.match(err({ attendance: '2.5' }), /Attendance/);
  assert.match(err({ attendance: 'x' }), /Attendance/);
  assert.match(err({ examShare: '-1' }), /Exams/);
  assert.equal(err({ attendance: '0' }), undefined);
});

test('a class names its course, and only a class with a real course may', () => {
  const s = { ...st(), tasks: [...st().tasks, courseTask()] };
  const c = s.commitments.find((x: any) => x.id === 'chem-lecture');
  const draft = { ...commitmentKind.toDraft(c), courseId: 'chem' };
  assert.equal(commitmentKind.fromDraft(draft, c.id, s).item.courseId, 'chem');
  assert.equal('courseId' in commitmentKind.fromDraft({ ...draft, courseId: '' }, c.id, s).item, false);
  assert.match(commitmentKind.fromDraft({ ...draft, courseId: 'gym' }, c.id, s).error, /course/);
  assert.equal('courseId' in commitmentKind.fromDraft({ ...draft, category: 'lesson' }, c.id, s).item, false, 'the link is dropped for other categories');
  assert.equal(commitmentKind.blank('2026-10-05').courseId, '');
  assert.equal(commitmentKind.toDraft({ ...c, courseId: 'chem' }).courseId, 'chem');
});

test('removing a course task, or saving it without course details, unlinks its classes', () => {
  const s: any = { ...st(), tasks: [...st().tasks, courseTask()] };
  s.commitments = s.commitments.map((c: any) => (c.id === 'chem-lecture' ? { ...c, courseId: 'chem' } : c));
  assert.equal('courseId' in removeItem(s, 'tasks', 'chem').commitments.find((c: any) => c.id === 'chem-lecture'), false);
  const noCourse = applyItem(s, 'tasks', { ...courseTask(), course: undefined });
  assert.equal('courseId' in noCourse.commitments.find((c: any) => c.id === 'chem-lecture'), false);
  const kept = applyItem(s, 'tasks', courseTask({ attendanceWeight: 5 }));
  assert.equal(kept.commitments.find((c: any) => c.id === 'chem-lecture').courseId, 'chem');
  assert.equal(s.commitments.find((c: any) => c.id === 'chem-lecture').courseId, 'chem', 'the input is not changed');
});
```

Append to `test/frontend/setup.test.ts` (use the harness already in that file for rendering a Tasks or Commitments form; mirror the neighbouring test that checks the Course details fields and copy its exact setup call) a test that the task form shows `f-attendance`, `f-examShare` and the `f-recorded-yes` choice for a study task and none of them for a gym task, and that the commitment form shows `f-courseId` for a class and not for a lesson.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/frontend/setup-model.test.ts test/frontend/setup.test.ts`
Expected: FAIL (no `attendance` draft field, no unlink).

- [ ] **Step 3: Implement**

`public/js/setup-model.js`, in `taskKind`:

- `blank()`: add `attendance: '', recorded: 'unknown', examShare: ''` to the returned object.
- `toDraft(t)`: add `attendance: t.course && t.course.attendanceWeight !== undefined ? String(t.course.attendanceWeight) : '', recorded: t.course && t.course.recorded ? t.course.recorded : 'unknown', examShare: t.course && t.course.examShare !== undefined ? String(t.course.examShare) : ''`.
- `fromDraft`: after the syllabus-length check and before building `course`, add

```js
        const attendance = String(d.attendance).trim() === '' ? undefined : parseWhole(d.attendance, 0, 100);
        if (attendance === null) return { error: 'Attendance must be a whole percent from 0 to 100, or empty.' };
        const examShare = String(d.examShare).trim() === '' ? undefined : parseWhole(d.examShare, 0, 100);
        if (examShare === null) return { error: 'Exams share must be a whole percent from 0 to 100, or empty.' };
```

  and change the `course = {...}` literal to append
  `...(attendance === undefined ? {} : { attendanceWeight: attendance }), ...(d.recorded === 'yes' || d.recorded === 'no' ? { recorded: d.recorded } : {}), ...(examShare === undefined ? {} : { examShare })`.

In `commitmentKind`:

- `blank()`: add `courseId: ''`. `toDraft(c)`: add `courseId: c.courseId ?? ''`.
- `fromDraft`: after the placeId check add

```js
    if (d.category === 'class' && d.courseId && !(state.tasks ?? []).some((t) => t.id === d.courseId && t.course)) return { error: 'Pick a course from the list.' };
```

  and in the returned item append `...(d.category === 'class' && d.courseId ? { courseId: d.courseId } : {})`.

`applyItem`: after computing the new state, add the unlink for tasks:

```js
  const next = { ...state, [spec.list]: exists ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item] };
  return kindId === 'tasks' && !item.course ? unlinkCourse(next, item.id) : next;
```

(replacing the current `return`), and add helper above `applyItem`:

```js
// A class that pointed at a course which is gone or has no details any more simply loses the link.
function unlinkCourse(state, taskId) {
  return {
    ...state,
    commitments: (state.commitments ?? []).map((c) => {
      if (c.courseId !== taskId) return c;
      const { courseId, ...rest } = c;
      return rest;
    }),
  };
}
```

In `removeItem`, change `if (kindId === 'tasks') next.deadlines = next.deadlines.filter((d) => d.taskId !== id);` to also unlink:

```js
  if (kindId === 'tasks') {
    next.deadlines = next.deadlines.filter((d) => d.taskId !== id);
    next.commitments = unlinkCourse(next, id).commitments;
  }
```

`public/js/setup.js`, add helpers near `study`:

```js
const classes = (d) => d.category === 'class';
const courseOptions = (state) => [{ value: '', label: 'No course' }, ...state.tasks.filter((t) => t.course).map((t) => ({ value: t.id, label: t.title }))];
const recordedOptions = [{ value: 'unknown', label: 'Not sure' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];
```

In `FIELDS.commitments` change the category field to `{ name: 'category', label: 'Label', type: 'select', redraw: true, options: (state) => labelOptions(state) }` and add after the `placeId` field:

```js
    { name: 'courseId', label: 'Course', type: 'select', options: (state) => courseOptions(state), show: classes },
```

In `FIELDS.tasks` add after the `lab` field:

```js
    { name: 'attendance', label: 'Attendance counts, % of grade (blank if unknown)', type: 'text', inputmode: 'numeric', show: study },
    { name: 'recorded', label: 'Lectures recorded', type: 'choice', options: recordedOptions, show: study },
    { name: 'examShare', label: 'Exams share, % of grade (blank if unknown)', type: 'text', inputmode: 'numeric', show: study },
```

Note: the estimate answer signature at `setup.js` line ~174 (`answersOf`) is deliberately left alone: attendance evidence does not change the estimate.

- [ ] **Step 4: Run to verify they pass**

Run: `npm test`
Expected: all pass. The existing "every example commitment survives a trip through a draft unchanged" test must stay green (no `courseId` appears for commitments without one).

- [ ] **Step 5: Commit**

```bash
git add public test && git commit -m "feat: type the attendance evidence and link a class to its course" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The advice block in the class panel

**Files:**
- Create: `public/js/attendance-ui.js`
- Modify: `public/js/drawer.js` (`commitmentPanel`), `public/css/app.css`
- Test: `test/frontend/attendance-ui.test.ts` (new), `test/frontend/drawer.test.ts`

**Interfaces:**
- Consumes: `store.get().attendance` (Task 3).
- Produces: `VERDICT_WORDS` (`{ go: 'Go', skippable: 'Skippable', optional: 'Optional', unknown: 'No advice yet' }`) and `adviceBlock(dom, advice)`: a `div.advice` with `data-verdict`, a `span.tag` with the verdict word, one `p.reason` per reason, and `span.note` "Advice only. You decide."

- [ ] **Step 1: Write the failing tests**

`test/frontend/attendance-ui.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDom } from '../../public/js/dom.js';
import { VERDICT_WORDS, adviceBlock } from '../../public/js/attendance-ui.js';
import { FakeDocument, byClass, textOf } from './fakedom.ts';

const dom = createDom(new FakeDocument() as any);

test('each verdict has its word, its reasons and the reminder that the user decides', () => {
  for (const [verdict, word] of Object.entries(VERDICT_WORDS)) {
    const el: any = adviceBlock(dom, { commitmentId: 'lec', date: '2026-10-05', verdict, reasons: ['First.', 'Second.'] });
    assert.equal(el.getAttribute('data-verdict'), verdict);
    assert.equal(textOf(byClass(el, 'tag')[0]), word);
    assert.equal(byClass(el, 'reason').length, 2);
    assert.match(textOf(el), /Advice only\. You decide\./);
  }
});

test('hostile reason text stays plain text', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const el: any = adviceBlock(dom, { commitmentId: 'lec', date: '2026-10-05', verdict: 'go', reasons: [evil] });
  assert.equal(textOf(byClass(el, 'reason')[0]), evil);
});
```

Append to `test/frontend/drawer.test.ts` (it has `rig`, `itemOf`, `TUE`, `key`; the sample `chem-lecture` runs Tue and Thu):

```ts
test('a class with advice shows it above Skip this day, and a class without shows none', () => {
  const { drawer, itemOf, store, setState } = rig();
  drawer.open(itemOf('commitment', TUE, (i) => i.commitmentId === 'chem-lecture'));
  assert.equal(byClass(drawer.el, 'advice').length, 0);
  drawer.close?.();
  const current: any = store.get();
  const advised = { ...current, attendance: [
    { commitmentId: 'chem-lecture', date: TUE, verdict: 'skippable', reasons: ['Recorded, attendance counts 0%, and Chemistry is 90 min short.'] },
    { commitmentId: 'chem-lecture', date: '2026-10-15', verdict: 'go', reasons: ['Labs need you there.'] },
  ] };
  store.get = () => advised;
  drawer.open(itemOf('commitment', TUE, (i) => i.commitmentId === 'chem-lecture'));
  const text = textOf(drawer.el);
  assert.equal(byClass(drawer.el, 'advice').length, 1, 'only this date');
  assert.match(text, /Skippable/);
  assert.match(text, /Chemistry is 90 min short/);
  assert.ok(text.indexOf('Skippable') < text.indexOf('Skip this day'), 'the advice comes first');
  assert.ok(key(drawer.el, 'drawer-skip'), 'the existing skip button is still there');
});
```

(If `drawer.close` is not exposed, drop that line and open a fresh `rig()` for the second half instead of reusing the first.)

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/frontend/attendance-ui.test.ts test/frontend/drawer.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`public/js/attendance-ui.js`:

```js
export const VERDICT_WORDS = { go: 'Go', skippable: 'Skippable', optional: 'Optional', unknown: 'No advice yet' };

// What the rule thinks about going to this class. Plain words, never a decision.
export function adviceBlock(dom, advice) {
  const { h } = dom;
  return h('div', { class: 'advice', 'data-verdict': advice.verdict },
    h('span', { class: 'tag' }, VERDICT_WORDS[advice.verdict]),
    advice.reasons.map((r) => h('p', { class: 'reason' }, r)),
    h('span', { class: 'note2' }, 'Advice only. You decide.'));
}
```

`public/js/drawer.js`: add `import { adviceBlock } from './attendance-ui.js';`. In `commitmentPanel()`, before `return [` compute

```js
    const advice = (store.get().attendance ?? []).find((a) => a.commitmentId === c.id && a.date === item.date);
```

and insert `advice && adviceBlock(dom, advice),` in the returned list directly before the `weekly && !c.exceptions.includes(item.date) && h('div', { class: 'skip' }, ...` entry.

`public/css/app.css`: add after the `.skip` rules (find with `grep -n "^\.skip" public/css/app.css`):

```css
.advice { display: flex; flex-direction: column; gap: 6px; padding: 12px 0; border-top: 1px solid var(--line); }
.advice .reason { margin: 0; font-size: 14px; }
.advice[data-verdict="skippable"] .tag { background: var(--ink); color: var(--paper); border-color: var(--ink); }
```

(If `--line` is not a defined token, use the border colour the neighbouring `.skip` rule uses.)

- [ ] **Step 4: Run to verify they pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add public test && git commit -m "feat: the class panel shows attendance advice" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: End to end and the visual check

**Files:**
- Test: `test/frontend/attendance-e2e.test.ts` (new)
- Modify: `docs/ui-visual-check.md`

**Interfaces:**
- Consumes: everything above, through the real server like `test/frontend/checkin-e2e.test.ts` does (copy its `before`/`after`, `boot`, `settled`, `click` helpers; set `checkInEnabled: false` in the state so the check-in question does not preempt).

- [ ] **Step 1: Write the test**

```ts
// Same imports, server setup, boot(), settled() and click() as test/frontend/checkin-e2e.test.ts.
const course = { credits: 3, difficulty: 3, examOnly: false, weeklyGraded: false, lab: false, syllabus: '', attendanceWeight: 0, recorded: 'yes' };
const state = () => ({
  ...emptyState(),
  tasks: [{ id: 'chem', title: 'Chemistry', category: 'study', weeklyMinutes: 2000, maxBlock: 120, onePerDay: false, priority: 3, course }],
  commitments: [{ id: 'lec', title: 'Chemistry lecture', category: 'class', start: 600, end: 720, bufferBefore: 0, exceptions: [], courseId: 'chem',
    pattern: { kind: 'weekly', weekdays: [1], from: '2026-10-05', to: '2026-12-31' } }],
  preferences: { ...structuredClone(defaultPreferences), weekdayWindow: { start: 480, end: 1320 }, daysOff: [], checkInEnabled: false },
});

test('a behind, recorded, zero-weight class shows Skippable, and skipping it frees the time', async () => {
  assert.equal((await put(state())).status, 200);
  const { app } = boot();
  await settled(app);
  const adviceFor = (date: string) => app.store.get().attendance.find((a: any) => a.commitmentId === 'lec' && a.date === date);
  assert.equal(adviceFor('2026-10-05').verdict, 'skippable');
  const free = (date: string) => app.store.get().state.blocks.filter((b: any) => b.date === date && b.start >= 600 && b.end <= 720).length;
  assert.equal(free('2026-10-05'), 0, 'the lecture holds its slot');
  await app.store.saveState((fresh: any) => ({
    ...fresh,
    commitments: fresh.commitments.map((c: any) => (c.id === 'lec' ? { ...c, exceptions: ['2026-10-05'] } : c)),
  }));
  await settled(app);
  assert.equal(adviceFor('2026-10-05'), undefined, 'a skipped date gets no advice');
  assert.equal(adviceFor('2026-10-12').verdict, 'skippable', 'the next week still does');
  assert.ok(free('2026-10-05') > 0, 'the planner now uses the freed slot');
});
```

(Use `now = () => new Date(2026, 9, 5, 7, 0)` as in the check-in test so Monday 5 Oct is today and the lecture slot is still ahead.)

- [ ] **Step 2: Run it**

Run: `node --test test/frontend/attendance-e2e.test.ts`
Expected after Tasks 1 to 5: PASS. If it fails, fix the product code, not the test, unless a helper name differs from the check-in e2e file.

- [ ] **Step 3: Visual check doc**

Append to `docs/ui-visual-check.md`:

```md
## Attendance advice

- Plan, Tasks: open a study task with credits. Below Has a lab there are three new rows: Attendance counts (percent), Lectures recorded (Not sure, Yes, No) and Exams share (percent).
- Plan, Commitments: open a class. A Course choice lists your study tasks that have course details. Lessons and work have no Course choice.
- Week or Day: open a linked class. Above "Skip this day" a small block shows Go, Skippable, Optional or No advice yet, the reasons, and "Advice only. You decide."
- Try it: course with attendance 0, recorded Yes, and a weekly target you are behind on shows Skippable. Press "Skip this day" and the freed hour fills with study.
- A class with no course shows no advice block.
```

- [ ] **Step 4: Full run**

Run: `npm test`
Expected: all pass (rerun `node --test test/perf.test.ts` alone if it is the only failure).

- [ ] **Step 5: Commit**

```bash
git add test docs && git commit -m "test: attendance advice end to end and the visual check list" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-review

- **Spec coverage:** evidence fields and `courseId` with validation (Task 1); the four-branch rule with exact sentences, lab, unknown weight, exam share 49 and 50, behind with zero and positive (Task 2); `attendanceFor` honouring horizon, exceptions, missing courses, dismissed warnings, never failing a replan (Tasks 2 and 3); `attendance` in the replan body and the store (Task 3); Tasks form rows, class Course choice for class only, plain-sentence errors (Task 4); the advice block above "Skip this day", none for unlinked classes (Task 5); the end-to-end skip story and the visual list (Task 6). Skipping reuses the existing "Skip this day" as decided. Dangling link on task delete or dropped course is handled by unlinking (Task 4), and by silent skipping on the server (Task 2).
- **Placeholder scan:** Task 4's `setup.test.ts` addition says to mirror the neighbouring test's harness rather than spelling out its setup, because that harness is long; the assertions to make are listed exactly. Task 5's drawer test notes one conditional line (`drawer.close?.()`).
- **Types:** `Recorded`, `attendanceWeight`, `recorded`, `examShare`, `courseId`, `Verdict`, `Advice`, `AttendanceAdvice`, `adviseAttendance`, `attendanceFor`, `attendance` (body and store), `VERDICT_WORDS`, `adviceBlock` and the draft names `attendance`, `recorded`, `examShare`, `courseId` are used with the same spelling throughout.
