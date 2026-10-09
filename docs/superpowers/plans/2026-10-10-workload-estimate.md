# Workload Estimate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a study task, suggest the hours a week it needs from credits, difficulty and a few yes/no answers, scaled to the user's own school (hours per credit, or a normal semester), with an optional AI answer later. The user decides; "Use this" fills the task's minutes a week.

**Architecture:** A pure `src/estimate.ts` holds the rule of thumb. `src/workload.ts` holds the AI provider interface (unavailable and fake providers) and the clamping of an AI answer. `POST /api/estimate` combines them using the saved preferences. The Setup Tasks form gets a Course details block and a suggestion card; Preferences gets three scale fields.

**Tech Stack:** Dependency-free TypeScript run by Node type stripping (`import type`, `.ts` extensions, no enums, no parameter properties); browser ES modules in `public/js` (no framework, no build); `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-10-workload-estimate-design.md`. Visual source of truth: boards T (Course details) and O (Preferences with the three new fields) on https://claude.ai/artifact/TNMnuzerDogRwvQxJSNdPP.

## Global Constraints

- No npm dependencies. No `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`eval`/`new Function`, no inline styles or `style` attributes (the server CSP blocks them), no browser requests except same-origin `/api/...`. Modules must not touch `window`, `document` or `localStorage` at import time.
- All user text (titles, syllabus) reaches the page through `createTextNode`, `textContent` or `value`.
- Old data files without `course` and the three new preferences must load unchanged in meaning (defaults: `hoursPerCredit` null, `normalCredits` 30, `fullLoadHours` 40) and save back valid.
- The planner is untouched: it reads only `weeklyMinutes`. Suggestions are never stored.
- The AI key (a later plan) never reaches the browser; the syllabus leaves the machine only through the provider.
- Every task ends with a green `npm test` and one commit whose message ends with the two trailer lines `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_015g9zWNaWwq6C6AoikFwJmf`. Do not push unless the user asks.
- Run all commands from `/Users/tomastello/doitwithme-phase1`.

## Review Focus

1. A syllabus or title containing markup, RTL override characters or 20000 characters is data only: never rendered as markup, never breaks the form, the request or the saved file; one character more than the limit is refused in plain words by both client and server (Tasks 1, 3, 5).
2. Odd numbers: credits 0, 0.5, 100, 100.5, `1e3`, `-1`, `abc`, whitespace, comma decimals; difficulty 0 and 6; `hoursPerCredit` blank vs 0; `normalCredits` 0; huge values never produce NaN, Infinity or a result above 3000 minutes (Tasks 2, 3, 4).
3. An AI answer far outside the rule (0, negative, 99999, NaN, a string) or a provider that throws or hangs is clamped or reported, and the rule's answer is still shown (Tasks 2, 3).
4. Old state files and tasks that are not study tasks: no `course`, no crash; switching a task's category away from Study drops the course on save and hides the block; the same task re-opened shows the saved values (Tasks 1, 4, 5).
5. The suggestion card: a double press, leaving the form or switching items mid-request, a request that fails, and "Use this" overwriting a number the user typed; the card never survives into another item's form (Tasks 4, 5, 6).

## File Structure

```
src/
  types.ts        (modify) Course, Task.course, three Preferences fields
  defaults.ts     (modify) preference defaults
  validate.ts     (modify) course, preferences, estimate request
  estimate.ts     (new) rule of thumb
  workload.ts     (new) AI provider interface, fake and unavailable providers, clamping, buildEstimate
  server.ts       (modify) POST /api/estimate, optional workload provider
public/js/
  api.js          (modify) estimate
  store.js        (modify) estimate, estimating flag
  nudge.js        (modify) thinking face while an estimate runs
  setup-model.js  (modify) course draft, three preference fields, parseDecimal
  form.js         (modify) textarea field
  setup.js        (modify) Course details fields, estimate flow and card
  main.js         (modify) pass estimating to Nudge
public/css/app.css (modify) estimate card styles
test/             new and extended tests per task
docs/             README, visual checklist, spec status
```

---

### Task 1: Data model and validation

**Files:**
- Modify: `src/types.ts`, `src/defaults.ts`, `src/validate.ts`
- Test: `test/validate.test.ts`

**Interfaces:**
- Consumes: existing `validateState`, helpers `num`, `int`, `str`, `bool`, `obj`.
- Produces: type `Course = { credits: number; difficulty: number; examOnly: boolean; weeklyGraded: boolean; lab: boolean; syllabus: string }`; `Task.course?: Course`; `Preferences.hoursPerCredit: number | null`, `Preferences.normalCredits: number`, `Preferences.fullLoadHours: number`; exported `courseOf(v: unknown, path: string): Course` from `src/validate.ts`.

- [ ] **Step 1: Write the failing tests**

Append to `test/validate.test.ts`:

```ts
const course = (over: any = {}) => ({ credits: 3, difficulty: 4, examOnly: false, weeklyGraded: true, lab: false, syllabus: 'Weekly problem sets.', ...over });

test('a task with a course round-trips, and a task without one gains nothing', () => {
  const s = sample();
  s.tasks[0].course = course();
  assert.deepEqual(validateState(s), s);
  assert.equal('course' in validateState(sample()).tasks[0], false);
});

test('a file from before the estimate loads with the scale defaults', () => {
  const old = sample();
  delete old.preferences.hoursPerCredit;
  delete old.preferences.normalCredits;
  delete old.preferences.fullLoadHours;
  const p = validateState(old).preferences;
  assert.deepEqual([p.hoursPerCredit, p.normalCredits, p.fullLoadHours], [null, 30, 40]);
});

test('scale preferences accept their limits and refuse the rest', () => {
  const ok = sample();
  ok.preferences.hoursPerCredit = 0.1;
  ok.preferences.normalCredits = 200;
  ok.preferences.fullLoadHours = 100;
  assert.doesNotThrow(() => validateState(ok));
  ok.preferences.hoursPerCredit = null;
  assert.doesNotThrow(() => validateState(ok));
  rejects((s) => { s.preferences.hoursPerCredit = 0; }, /hoursPerCredit/);
  rejects((s) => { s.preferences.hoursPerCredit = 20.5; }, /hoursPerCredit/);
  rejects((s) => { s.preferences.hoursPerCredit = '1'; }, /hoursPerCredit/);
  rejects((s) => { s.preferences.normalCredits = 0; }, /normalCredits/);
  rejects((s) => { s.preferences.normalCredits = 201; }, /normalCredits/);
  rejects((s) => { s.preferences.fullLoadHours = 0; }, /fullLoadHours/);
  rejects((s) => { s.preferences.fullLoadHours = 101; }, /fullLoadHours/);
});

test('a course is checked field by field in plain words', () => {
  rejects((s) => { s.tasks[0].course = course({ credits: 0.4 }); }, /course\.credits/);
  rejects((s) => { s.tasks[0].course = course({ credits: 100.5 }); }, /course\.credits/);
  rejects((s) => { s.tasks[0].course = course({ credits: '3' }); }, /course\.credits/);
  rejects((s) => { s.tasks[0].course = course({ difficulty: 0 }); }, /course\.difficulty/);
  rejects((s) => { s.tasks[0].course = course({ difficulty: 6 }); }, /course\.difficulty/);
  rejects((s) => { s.tasks[0].course = course({ difficulty: 2.5 }); }, /course\.difficulty/);
  rejects((s) => { s.tasks[0].course = course({ lab: 'yes' }); }, /course\.lab/);
  rejects((s) => { s.tasks[0].course = course({ examOnly: 1 }); }, /course\.examOnly/);
  rejects((s) => { s.tasks[0].course = course({ weeklyGraded: null }); }, /course\.weeklyGraded/);
  rejects((s) => { s.tasks[0].course = course({ syllabus: 5 }); }, /course\.syllabus/);
  rejects((s) => { s.tasks[0].course = course({ syllabus: 'x'.repeat(20001) }); }, /course\.syllabus/);
  const edge = sample();
  edge.tasks[0].course = course({ credits: 100, syllabus: 'x'.repeat(20000) });
  assert.doesNotThrow(() => validateState(edge));
  const hostile = sample();
  hostile.tasks[0].course = course({ syllabus: '<img src=x onerror=alert(1)> ‮' });
  assert.equal(validateState(hostile).tasks[0].course!.syllabus, '<img src=x onerror=alert(1)> ‮');
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/validate.test.ts`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement**

`src/types.ts`: add before `Task`:

```ts
export interface Course {
  credits: number;
  difficulty: number;
  examOnly: boolean;
  weeklyGraded: boolean;
  lab: boolean;
  syllabus: string;
}
```

add `course?: Course;` to `Task` (after `priority`), and to `Preferences` after `travelAllowanceMinutes`: `hoursPerCredit: number | null; normalCredits: number; fullLoadHours: number;`.

`src/defaults.ts`: after `travelAllowanceMinutes: 30,` add `hoursPerCredit: null, normalCredits: 30, fullLoadHours: 40,`.

`src/validate.ts`: add `Course` to the type import; add before `function task`:

```ts
export function courseOf(v: unknown, path: string): Course {
  const o = obj(v, path);
  if (typeof o.syllabus !== 'string' || o.syllabus.length > 20000) fail(`${path}.syllabus must be text of at most 20000 characters`);
  return {
    credits: num(o.credits, `${path}.credits`, 0.5, 100),
    difficulty: int(o.difficulty, `${path}.difficulty`, 1, 5),
    examOnly: bool(o.examOnly, `${path}.examOnly`),
    weeklyGraded: bool(o.weeklyGraded, `${path}.weeklyGraded`),
    lab: bool(o.lab, `${path}.lab`),
    syllabus: o.syllabus as string,
  };
}
```

In `task()` add to the returned object, after `priority`: `...(o.course === undefined ? {} : { course: courseOf(o.course, `${path}.course`) }),`.

In `preferences()` add to `prefs` after `travelAllowanceMinutes`:

```ts
    hoursPerCredit: o.hoursPerCredit === undefined || o.hoursPerCredit === null ? null : num(o.hoursPerCredit, `${path}.hoursPerCredit`, 0.1, 20),
    normalCredits: o.normalCredits === undefined ? defaultPreferences.normalCredits : num(o.normalCredits, `${path}.normalCredits`, 1, 200),
    fullLoadHours: o.fullLoadHours === undefined ? defaultPreferences.fullLoadHours : num(o.fullLoadHours, `${path}.fullLoadHours`, 1, 100),
```

- [ ] **Step 4: Run, fix fallout, commit**

Run: `npm test`. Failures can only come from tests that compare a whole preferences object or a state with literal preferences: update those expectations to include the three new fields (frontend setup-model tests that deep-equal a preferences item will be fixed in Task 4; if they fail now, leave them until then and note it in the ledger, but the task is only complete with a green suite, so fix them here by adding `hoursPerCredit: null, normalCredits: 30, fullLoadHours: 40` to the expectation).

```bash
git add -A src test
git commit -m "feat: course details and scale preferences in the data model

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015g9zWNaWwq6C6AoikFwJmf"
```

---

### Task 2: The rule of thumb and the AI provider interface

**Files:**
- Create: `src/estimate.ts`, `src/workload.ts`
- Test: `test/estimate.test.ts`, `test/workload.test.ts`

**Interfaces:**
- Consumes: `Course`, `Preferences` types.
- Produces: `ruleOfThumb(course: Pick<Course, 'credits' | 'difficulty' | 'examOnly' | 'weeklyGraded' | 'lab'>, scale: { hoursPerCredit: number | null; normalCredits: number; fullLoadHours: number }): { minutes: number; reason: string }`; `FACTORS`; `hoursText(minutes: number): string`; in `workload.ts`: `interface WorkloadProvider { status: 'unavailable' | 'ready'; estimate(input: WorkloadInput): Promise<{ minutes: number; reason: string }> }`, `WorkloadInput = { title: string; course: Course; ruleMinutes: number }`, `unavailableProvider`, `fakeWorkloadProvider(minutes: number, reason?: string)`, `clampAi(answer: unknown, ruleMinutes: number): { minutes: number; reason: string } | null`, `buildEstimate(request, scale, provider): Promise<EstimateResult>` with `EstimateResult = { rule: { minutes; reason }; ai: { minutes; reason } | null; aiStatus: 'unavailable' | 'ready' | 'failed'; aiMessage?: string }`.

- [ ] **Step 1: Write the failing tests**

Create `test/estimate.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FACTORS, hoursText, ruleOfThumb } from '../src/estimate.ts';

const course = (over: any = {}) => ({ credits: 3, difficulty: 3, examOnly: false, weeklyGraded: false, lab: false, ...over });
const perCredit = { hoursPerCredit: 1, normalCredits: 30, fullLoadHours: 40 };
const share = { hoursPerCredit: null, normalCredits: 30, fullLoadHours: 40 };

test('hours read as people say them', () => {
  assert.equal(hoursText(0), '0 min');
  assert.equal(hoursText(45), '45 min');
  assert.equal(hoursText(60), '1h');
  assert.equal(hoursText(240), '4h');
  assert.equal(hoursText(315), '5h15');
});

test('with hours per credit, the base is credits times that, and the sentence says so (board T)', () => {
  const r = ruleOfThumb(course({ difficulty: 4, weeklyGraded: true }), perCredit);
  assert.equal(r.minutes, 240);
  assert.equal(r.reason, '3 credits at 1h a week each. Hard course (4 of 5) with weekly graded work: about 4h a week.');
});

test('without it, the base is the share of a full load', () => {
  const r = ruleOfThumb(course({ difficulty: 4, weeklyGraded: true }), share);
  assert.equal(r.minutes, 315);
  assert.equal(r.reason, '3 of your 30 normal credits is 10% of a 40h load. Hard course (4 of 5) with weekly graded work: about 5h15 a week.');
});

test('hours per credit wins over the share when both could apply', () => {
  assert.equal(ruleOfThumb(course(), { hoursPerCredit: 2, normalCredits: 30, fullLoadHours: 40 }).minutes, 360);
});

test('each difficulty and each yes/no answer moves the number the way the spec says', () => {
  const at = (over: any) => ruleOfThumb(course(over), perCredit).minutes;
  assert.deepEqual([1, 2, 3, 4, 5].map((d) => at({ difficulty: d })), [150, 165, 180, 210, 240]);
  assert.equal(at({ weeklyGraded: true }), 210);
  assert.equal(at({ lab: true }), 195);
  assert.equal(at({ examOnly: true }), 165);
  assert.equal(at({ weeklyGraded: true, lab: true, examOnly: true }), 225);
  assert.equal(FACTORS.difficulty.length, 5);
});

test('numbers are rounded to 15 minutes and clamped, never NaN or huge', () => {
  assert.equal(ruleOfThumb(course({ credits: 0.5 }), perCredit).minutes % 15, 0);
  assert.equal(ruleOfThumb(course({ credits: 100, difficulty: 5 }), { hoursPerCredit: 20, normalCredits: 30, fullLoadHours: 40 }).minutes, 3000);
  for (const bad of [{ credits: 0 }, { credits: NaN }, { credits: Infinity }, { credits: -4 }]) {
    const m = ruleOfThumb(course(bad), share).minutes;
    assert.ok(Number.isFinite(m) && m >= 0 && m <= 3000, JSON.stringify(bad));
  }
  assert.equal(ruleOfThumb(course(), { hoursPerCredit: null, normalCredits: 0, fullLoadHours: 40 }).minutes, 0);
});

test('plurals and extras read naturally', () => {
  assert.match(ruleOfThumb(course({ credits: 1 }), perCredit).reason, /^1 credit at 1h a week each\./);
  assert.match(ruleOfThumb(course({ lab: true, weeklyGraded: true }), perCredit).reason, /with weekly graded work and a lab:/);
  assert.match(ruleOfThumb(course({ examOnly: true }), perCredit).reason, /with exam-only grading:/);
  assert.match(ruleOfThumb(course({ difficulty: 1 }), perCredit).reason, /Very easy course \(1 of 5\)/);
  assert.match(ruleOfThumb(course({ credits: 1 }), share).reason, /^1 of your 30 normal credits is 3% of a 40h load\./);
  assert.match(ruleOfThumb(course({ credits: 2.5 }), perCredit).reason, /^2\.5 credits at 1h a week each\./);
  assert.match(ruleOfThumb(course(), { hoursPerCredit: 0.5, normalCredits: 30, fullLoadHours: 40 }).reason, /at 30 min a week each/);
});
```

Create `test/workload.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEstimate, clampAi, fakeWorkloadProvider, unavailableProvider } from '../src/workload.ts';
import type { WorkloadProvider } from '../src/workload.ts';

const request = { title: 'Chemistry', course: { credits: 3, difficulty: 4, examOnly: false, weeklyGraded: true, lab: false, syllabus: '' } };
const scale = { hoursPerCredit: 1, normalCredits: 30, fullLoadHours: 40 };

test('the unavailable provider says so and refuses', async () => {
  assert.equal(unavailableProvider.status, 'unavailable');
  await assert.rejects(unavailableProvider.estimate({ title: 'x', course: request.course, ruleMinutes: 60 }), /not connected/);
});

test('an AI answer is kept inside half to double the rule, and bad answers are dropped', () => {
  assert.deepEqual(clampAi({ minutes: 300, reason: 'Heavy labs.' }, 240), { minutes: 300, reason: 'Heavy labs.' });
  assert.equal(clampAi({ minutes: 5, reason: 'x' }, 240)!.minutes, 120);
  assert.equal(clampAi({ minutes: 99999, reason: 'x' }, 240)!.minutes, 480);
  assert.equal(clampAi({ minutes: 200.4, reason: 'x' }, 240)!.minutes, 195);
  assert.equal(clampAi({ minutes: 4000, reason: 'x' }, 2500)!.minutes, 3000);
  for (const bad of [null, undefined, 5, 'x', {}, { minutes: NaN, reason: 'x' }, { minutes: '300', reason: 'x' }, { minutes: 300 }, { minutes: 300, reason: 7 }]) {
    assert.equal(clampAi(bad, 240), null, JSON.stringify(bad));
  }
  assert.equal(clampAi({ minutes: 300, reason: 'x'.repeat(1000) }, 240)!.reason.length, 400);
});

test('with no AI the rule answers alone and says why there is no AI answer', async () => {
  const r = await buildEstimate(request, scale, unavailableProvider);
  assert.equal(r.rule.minutes, 240);
  assert.equal(r.ai, null);
  assert.equal(r.aiStatus, 'unavailable');
});

test('with an AI the answer comes back clamped next to the rule', async () => {
  const r = await buildEstimate(request, scale, fakeWorkloadProvider(900, 'Lots of lab reports.'));
  assert.equal(r.aiStatus, 'ready');
  assert.deepEqual(r.ai, { minutes: 480, reason: 'Lots of lab reports.' });
});

test('a provider that throws or answers nonsense is reported without losing the rule', async () => {
  const throwing: WorkloadProvider = { status: 'ready', async estimate() { throw new Error('boom'); } };
  const a = await buildEstimate(request, scale, throwing);
  assert.equal(a.aiStatus, 'failed');
  assert.equal(a.ai, null);
  assert.equal(a.rule.minutes, 240);
  assert.match(a.aiMessage!, /could not answer/);
  const nonsense: WorkloadProvider = { status: 'ready', async estimate() { return { minutes: NaN, reason: '' } as any; } };
  assert.equal((await buildEstimate(request, scale, nonsense)).aiStatus, 'failed');
});

test('a provider that never answers is given up on', async () => {
  const hanging: WorkloadProvider = { status: 'ready', estimate: () => new Promise(() => {}) };
  const r = await buildEstimate(request, scale, hanging, 30);
  assert.equal(r.aiStatus, 'failed');
  assert.equal(r.rule.minutes, 240);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/estimate.test.ts test/workload.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement `src/estimate.ts`**

```ts
import type { Course } from './types.ts';

// Every tunable number lives here.
export const FACTORS = {
  difficulty: [0.8, 0.9, 1.0, 1.15, 1.3],
  weeklyGraded: 0.15,
  lab: 0.1,
  examOnly: -0.1,
  step: 15,
  max: 3000,
};

const WORDS = ['very easy', 'easy', 'medium', 'hard', 'very hard'];

export interface Scale {
  hoursPerCredit: number | null;
  normalCredits: number;
  fullLoadHours: number;
}

export function hoursText(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

export function ruleOfThumb(
  course: Pick<Course, 'credits' | 'difficulty' | 'examOnly' | 'weeklyGraded' | 'lab'>,
  scale: Scale,
): { minutes: number; reason: string } {
  const credits = Number.isFinite(course.credits) && course.credits > 0 ? course.credits : 0;
  const level = Math.min(5, Math.max(1, Math.round(course.difficulty) || 3));
  const hasHours = scale.hoursPerCredit !== null && scale.hoursPerCredit > 0;
  const base = hasHours
    ? credits * (scale.hoursPerCredit as number) * 60
    : scale.normalCredits > 0 ? (scale.fullLoadHours * 60 * credits) / scale.normalCredits : 0;
  const adjust =
    1 + (course.weeklyGraded ? FACTORS.weeklyGraded : 0) + (course.lab ? FACTORS.lab : 0) + (course.examOnly ? FACTORS.examOnly : 0);
  const raw = base * FACTORS.difficulty[level - 1] * adjust;
  const minutes = Number.isFinite(raw) ? Math.min(FACTORS.max, Math.max(0, Math.round(raw / FACTORS.step) * FACTORS.step)) : 0;

  const extras = [course.weeklyGraded && 'weekly graded work', course.lab && 'a lab', course.examOnly && 'exam-only grading'].filter(Boolean);
  const withExtras = extras.length > 0 ? ` with ${extras.join(' and ')}` : '';
  const word = WORDS[level - 1];
  const kind = `${word.charAt(0).toUpperCase()}${word.slice(1)} course (${level} of 5)${withExtras}`;
  const lead = hasHours
    ? `${plural(credits, 'credit')} at ${hoursText(Math.round((scale.hoursPerCredit as number) * 60))} a week each.`
    : `${credits} of your ${scale.normalCredits} normal credits is ${Math.round((credits / scale.normalCredits) * 100)}% of a ${scale.fullLoadHours}h load.`;
  return { minutes, reason: `${lead} ${kind}: about ${hoursText(minutes)} a week.` };
}
```

- [ ] **Step 4: Implement `src/workload.ts`**

```ts
import { ruleOfThumb } from './estimate.ts';
import type { Scale } from './estimate.ts';
import type { Course } from './types.ts';

export interface WorkloadInput {
  title: string;
  course: Course;
  ruleMinutes: number;
}

export interface WorkloadProvider {
  status: 'unavailable' | 'ready';
  estimate(input: WorkloadInput): Promise<{ minutes: number; reason: string }>;
}

export interface EstimateResult {
  rule: { minutes: number; reason: string };
  ai: { minutes: number; reason: string } | null;
  aiStatus: 'unavailable' | 'ready' | 'failed';
  aiMessage?: string;
}

// Used until an Anthropic key exists; the real provider arrives in the next plan.
export const unavailableProvider: WorkloadProvider = {
  status: 'unavailable',
  async estimate() {
    throw new Error('The AI is not connected yet');
  },
};

export function fakeWorkloadProvider(minutes: number, reason = 'A fake answer for tests.'): WorkloadProvider {
  return { status: 'ready', async estimate() { return { minutes, reason }; } };
}

// An AI answer must stay between half and double the rule, and under the global ceiling.
export function clampAi(answer: unknown, ruleMinutes: number): { minutes: number; reason: string } | null {
  if (typeof answer !== 'object' || answer === null) return null;
  const a = answer as Record<string, unknown>;
  if (typeof a.minutes !== 'number' || !Number.isFinite(a.minutes) || typeof a.reason !== 'string') return null;
  const low = Math.round(ruleMinutes / 2);
  const high = Math.min(3000, ruleMinutes * 2);
  const clamped = Math.min(high, Math.max(low, a.minutes));
  return { minutes: Math.min(3000, Math.round(clamped / 15) * 15), reason: a.reason.slice(0, 400) };
}

export async function buildEstimate(
  request: { title: string; course: Course },
  scale: Scale,
  provider: WorkloadProvider,
  timeoutMs = 20000,
): Promise<EstimateResult> {
  const rule = ruleOfThumb(request.course, scale);
  if (provider.status !== 'ready') return { rule, ai: null, aiStatus: 'unavailable' };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const answer = await Promise.race([
      provider.estimate({ title: request.title, course: request.course, ruleMinutes: rule.minutes }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs); }),
    ]);
    const ai = clampAi(answer, rule.minutes);
    if (!ai) return { rule, ai: null, aiStatus: 'failed', aiMessage: 'The AI could not answer this time. The rule of thumb is shown.' };
    return { rule, ai, aiStatus: 'ready' };
  } catch {
    return { rule, ai: null, aiStatus: 'failed', aiMessage: 'The AI could not answer this time. The rule of thumb is shown.' };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
```

- [ ] **Step 5: Run, commit**

Run: `node --test test/estimate.test.ts test/workload.test.ts`, then `npm test` (green). If a number in the tests disagrees with the arithmetic (for example the all-three-answers case: `1 + 0.15 + 0.10 - 0.10 = 1.15`, `180 * 1.15 = 207`, rounded to 225? check: 207 / 15 = 13.8, round gives 14, so 210), recompute by hand and fix the TEST if the code follows the spec; do not bend the code. The expected values in the plan for that case are 210, not 225: correct the test to `assert.equal(at({ weeklyGraded: true, lab: true, examOnly: true }), 210);` and ledger it as a `Ruling:`.

```bash
git add -A src test
git commit -m "feat: the rule of thumb and the AI provider interface for workload estimates

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015g9zWNaWwq6C6AoikFwJmf"
```

---

### Task 3: The estimate endpoint

**Files:**
- Modify: `src/validate.ts`, `src/server.ts`
- Test: `test/validate.test.ts`, `test/server.estimate.test.ts`

**Interfaces:**
- Consumes: `courseOf`, `buildEstimate`, `unavailableProvider`, `WorkloadProvider`.
- Produces: `validateEstimateRequest(x: unknown): { title: string; course: Course }`; `POST /api/estimate`; `createApp(path, { workload? })`.

- [ ] **Step 1: Write the failing tests**

Append to `test/validate.test.ts` (import `validateEstimateRequest` alongside the existing imports):

```ts
test('an estimate request needs a title and a valid course', () => {
  const ok = { title: 'Chemistry', credits: 3, difficulty: 4, examOnly: false, weeklyGraded: true, lab: false, syllabus: '' };
  assert.deepEqual(validateEstimateRequest(ok), { title: 'Chemistry', course: { credits: 3, difficulty: 4, examOnly: false, weeklyGraded: true, lab: false, syllabus: '' } });
  assert.throws(() => validateEstimateRequest({ ...ok, title: '' }), /title/);
  assert.throws(() => validateEstimateRequest({ ...ok, credits: 0 }), /credits/);
  assert.throws(() => validateEstimateRequest({ ...ok, syllabus: 'x'.repeat(20001) }), /syllabus/);
  assert.throws(() => validateEstimateRequest(null), /request/);
});
```

Create `test/server.estimate.test.ts`:

```ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/server.ts';
import { emptyState, saveState } from '../src/store.ts';
import { fakeWorkloadProvider } from '../src/workload.ts';
import type { WorkloadProvider } from '../src/workload.ts';

const body = { title: 'Chemistry', credits: 3, difficulty: 4, examOnly: false, weeklyGraded: true, lab: false, syllabus: 'Weekly sets.' };
const json = { 'content-type': 'application/json' };
const servers: Server[] = [];
const bases: Record<string, string> = {};

async function start(name: string, workload?: WorkloadProvider, hoursPerCredit: number | null = 1) {
  const file = join(mkdtempSync(join(tmpdir(), 'doitwithme-estimate-')), 'db.json');
  const state = emptyState();
  state.preferences.hoursPerCredit = hoursPerCredit;
  saveState(file, state);
  const server = createApp(file, workload ? { workload } : {});
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  bases[name] = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
const post = (name: string, b: unknown) => fetch(`${bases[name]}/api/estimate`, { method: 'POST', headers: json, body: JSON.stringify(b) });

before(async () => {
  await start('none');
  await start('ready', fakeWorkloadProvider(300, 'Labs are heavy.'));
  await start('failing', { status: 'ready', async estimate() { throw new Error('boom'); } });
  await start('share', undefined, null);
});
after(() => servers.forEach((s) => s.close()));

test('the rule answers using the saved scale, and nothing is written', async () => {
  const res = await post('none', body);
  assert.equal(res.status, 200);
  const r = await res.json();
  assert.equal(r.rule.minutes, 240);
  assert.equal(r.ai, null);
  assert.equal(r.aiStatus, 'unavailable');
  const state = await (await fetch(`${bases.none}/api/state`)).json();
  assert.equal(state.tasks.length, 0);
});

test('without hours per credit the share of a normal semester is used', async () => {
  assert.equal((await (await post('share', body)).json()).rule.minutes, 315);
});

test('a ready AI answer arrives beside the rule, and a failing one does not lose the rule', async () => {
  const ready = await (await post('ready', body)).json();
  assert.deepEqual(ready.ai, { minutes: 300, reason: 'Labs are heavy.' });
  assert.equal(ready.aiStatus, 'ready');
  const failing = await (await post('failing', body)).json();
  assert.equal(failing.aiStatus, 'failed');
  assert.equal(failing.rule.minutes, 240);
});

test('bad requests are refused with plain sentences', async () => {
  for (const [patch, pattern] of [[{ credits: 0 }, /credits/], [{ difficulty: 9 }, /difficulty/], [{ title: '' }, /title/], [{ syllabus: 'x'.repeat(20001) }, /syllabus/]] as const) {
    const res = await post('none', { ...body, ...patch });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, pattern);
  }
  const wrongType = await fetch(`${bases.none}/api/estimate`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
  assert.equal(wrongType.status, 415);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/validate.test.ts test/server.estimate.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/validate.ts`: add `Course` handling and

```ts
export function validateEstimateRequest(x: unknown): { title: string; course: Course } {
  const o = obj(x, 'request');
  return { title: str(o.title, 'title'), course: courseOf(o, 'request') };
}
```

(`courseOf(o, 'request')` reads `credits`, `difficulty`, the flags and `syllabus` straight from the request object, so error messages say `request.credits`; a test above matches `credits`.)

`src/server.ts`: import `{ buildEstimate }` and `{ unavailableProvider as unavailableWorkload }` and `type { WorkloadProvider }` from `./workload.ts`, and `validateEstimateRequest` from `./validate.ts`; add `workload?: WorkloadProvider` to the `createApp` options type; add `const workload = options.workload ?? unavailableWorkload;`; and before the `/api/commute/status` route add:

```ts
      if (req.method === 'POST' && pathname === '/api/estimate') {
        const request = validateEstimateRequest(await readJson(req));
        const { hoursPerCredit, normalCredits, fullLoadHours } = loadState(statePath).preferences;
        return send(res, 200, await buildEstimate(request, { hoursPerCredit, normalCredits, fullLoadHours }, workload));
      }
```

- [ ] **Step 4: Run, commit**

Run: `npm test` (green).

```bash
git add -A src test
git commit -m "feat: the workload estimate endpoint

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015g9zWNaWwq6C6AoikFwJmf"
```

---

### Task 4: Browser plumbing and the Setup model

**Files:**
- Modify: `public/js/api.js`, `public/js/store.js`, `public/js/nudge.js`, `public/js/main.js`, `public/js/setup-model.js`
- Test: `test/frontend/api.test.ts`, `test/frontend/store.test.ts`, `test/frontend/nudge.test.ts`, `test/frontend/setup-model.test.ts`

**Interfaces:**
- Consumes: Task 3's endpoint; existing `parseWhole`, `taskKind`, `preferencesKind`.
- Produces: `api.estimate(body)`; `store.estimate(body)` (does not touch `busy`, sets `estimating` while it runs, returns the response, rethrows failures after clearing the flag, ignores a second call while one is running by returning `null`); store field `estimating`; `faceFor` returns `'thinking'` when `view.estimating` and nothing outranks it; `parseDecimal(text, min, max)`; task drafts carry `credits`, `difficulty`, `examOnly`, `weeklyGraded`, `lab`, `syllabus`; preference drafts carry `hoursPerCredit`, `normalCredits`, `fullLoadHours`.

- [ ] **Step 1: Write the failing tests**

`test/frontend/api.test.ts` append:

```ts
test('estimate posts the course to the estimate endpoint', async () => {
  const f = fakeFetch([{ status: 200, body: { rule: { minutes: 240 } } }]);
  const api = createApi(f.fn as any);
  assert.deepEqual(await api.estimate({ title: 'x' }), { rule: { minutes: 240 } });
  assert.deepEqual([f.calls[0].init.method, f.calls[0].path, JSON.parse(f.calls[0].init.body)], ['POST', '/api/estimate', { title: 'x' }]);
});
```

`test/frontend/store.test.ts` append:

```ts
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
```

`test/frontend/nudge.test.ts` append (inside the faceFor table style):

```ts
test('he thinks while an estimate runs, unless trouble or news outranks it', () => {
  const view = (over: any = {}) => ({ ...base, ...over });
  assert.equal(faceFor(view({ estimating: true })), 'thinking');
  assert.equal(faceFor(view({ estimating: true, status: 'offline' })), 'sleepy');
  assert.equal(faceFor(view({ estimating: true, items: [item({ offer: null })] })), 'worried');
  assert.equal(faceFor(view({ estimating: true, celebrate: true })), 'thinking');
});
```

`test/frontend/setup-model.test.ts` append (import `parseDecimal` from `setup-model.js`):

```ts
test('parseDecimal accepts plain decimals inside the limits only', () => {
  assert.equal(parseDecimal('3', 0.5, 100), 3);
  assert.equal(parseDecimal(' 2.5 ', 0.5, 100), 2.5);
  assert.equal(parseDecimal('0.5', 0.5, 100), 0.5);
  for (const bad of ['', 'abc', '1e3', '-1', '0.4', '100.5', '2,5', '1.', '.5x', 'NaN', 'Infinity', '０５']) assert.equal(parseDecimal(bad, 0.5, 100), null, bad);
});

test('a study task keeps its course details through a draft, and other tasks have none', () => {
  const study = { id: 't', title: 'Chemistry', category: 'study', weeklyMinutes: 360, maxBlock: 90, onePerDay: false, priority: 2,
    course: { credits: 3, difficulty: 4, examOnly: false, weeklyGraded: true, lab: true, syllabus: 'Sets.' } };
  const draft = taskKind.toDraft(study);
  assert.deepEqual([draft.credits, draft.difficulty, draft.examOnly, draft.weeklyGraded, draft.lab, draft.syllabus], ['3', '4', false, true, true, 'Sets.']);
  assert.deepEqual(taskKind.fromDraft(draft, 't', example).item, study);
  const plain = taskKind.toDraft({ ...study, course: undefined });
  assert.deepEqual([plain.credits, plain.difficulty, plain.syllabus], ['', '3', '']);
  assert.equal('course' in taskKind.fromDraft(plain, 't', example).item, false);
  assert.equal('course' in taskKind.fromDraft({ ...draft, category: 'gym' }, 't', example).item, false);
  assert.equal(taskKind.fromDraft({ ...draft, credits: '2.5' }, 't', example).item.course.credits, 2.5);
});

test('course details are refused in plain sentences', () => {
  const draft = { ...taskKind.blank(), title: 'Chemistry', category: 'study', credits: '3' };
  const err = (over: any) => taskKind.fromDraft({ ...draft, ...over }, 't', example).error;
  assert.match(err({ credits: '0' }), /Credits/);
  assert.match(err({ credits: 'x' }), /Credits/);
  assert.match(err({ credits: '101' }), /Credits/);
  assert.match(err({ difficulty: '6' }), /Difficulty/);
  assert.match(err({ syllabus: 'x'.repeat(20001) }), /Syllabus/);
  assert.match(err({ credits: '', syllabus: 'Some text' }), /credits/);
  assert.equal(taskKind.fromDraft({ ...draft, credits: '', syllabus: '' }, 't', example).error, undefined);
});

test('the scale preferences round trip, blank hours per credit means none, and limits are enforced', () => {
  const s = structuredClone(example);
  s.preferences.hoursPerCredit = 1;
  const d = preferencesKind.toDraft(s.preferences);
  assert.deepEqual([d.hoursPerCredit, d.normalCredits, d.fullLoadHours], ['1', '30', '40']);
  const item = preferencesKind.fromDraft(d, '-', s).item;
  assert.deepEqual([item.hoursPerCredit, item.normalCredits, item.fullLoadHours], [1, 30, 40]);
  assert.equal(preferencesKind.fromDraft({ ...d, hoursPerCredit: '' }, '-', s).item.hoursPerCredit, null);
  const err = (over: any) => preferencesKind.fromDraft({ ...d, ...over }, '-', s).error;
  assert.match(err({ hoursPerCredit: '0' }), /Hours a week per credit/);
  assert.match(err({ hoursPerCredit: '21' }), /Hours a week per credit/);
  assert.match(err({ normalCredits: '0' }), /normal semester/);
  assert.match(err({ fullLoadHours: '101' }), /full load/);
  assert.equal(preferencesKind.toDraft({ ...s.preferences, hoursPerCredit: undefined, normalCredits: undefined, fullLoadHours: undefined }).normalCredits, '30');
});
```

Update the existing preferences round-trip test (`preferences round-trip, keep softMode, and validate windows`): its expected object `{ ...example.preferences, softMode: 'auto', travelAllowanceMinutes: 30 }` gains `hoursPerCredit: null, normalCredits: 30, fullLoadHours: 40` because the example file has none of them.

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/frontend/`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement**

`public/js/api.js`: add `estimate: (body) => call('POST', '/api/estimate', body),`.

`public/js/store.js`: add `estimating: false,` to the initial `current`, and to the returned object (next to `loadExample`):

```js
    // An estimate runs beside everything else: it never takes the busy flag, so the form stays usable.
    estimate: async (body) => {
      if (current.estimating) return null;
      set({ estimating: true });
      try {
        return await api.estimate(body);
      } finally {
        set({ estimating: false });
      }
    },
```

`public/js/nudge.js` `faceFor`: after the `view.confirm` line and before `view.busy`, add `if (view.estimating) return 'thinking';` — but trouble outranks it and a worry too, so place it after the items block instead: right before `if (view.notice) return 'resting';` add `if (view.estimating) return 'thinking';`, and make the `view.busy` working line stay above it. (Order: sleepy, confirm, working, surprised, items, estimating, notice, celebrate, glance.) Check the new test: estimating with items that have an offer-less shortfall returns worried because the items block returns first.

`public/js/main.js`: in the `nudge.update({...})` call add `estimating: s.estimating,`.

`public/js/setup-model.js`: add after `parseWhole`:

```js
// Plain decimals only ("2.5"), never exponents, signs, commas or full-width digits.
export function parseDecimal(text, min, max) {
  const t = String(text).trim();
  if (!/^\d{1,6}(\.\d{1,4})?$/.test(t)) return null;
  const n = Number(t);
  return n >= min && n <= max ? n : null;
}
```

In `taskKind`: `blank()` returns also `credits: '', difficulty: '3', examOnly: false, weeklyGraded: false, lab: false, syllabus: ''`; `toDraft(t)` returns also

```js
      credits: t.course ? String(t.course.credits) : '', difficulty: t.course ? String(t.course.difficulty) : '3',
      examOnly: t.course ? t.course.examOnly : false, weeklyGraded: t.course ? t.course.weeklyGraded : false,
      lab: t.course ? t.course.lab : false, syllabus: t.course ? t.course.syllabus : '',
```

and `fromDraft` ends with, before the return:

```js
    let course;
    if (d.category === 'study') {
      if (String(d.credits).trim() === '') {
        if (d.syllabus.trim() !== '') return { error: 'Add the credits to keep course details.' };
      } else {
        const credits = parseDecimal(d.credits, 0.5, 100);
        if (credits === null) return { error: 'Credits must be a number from 0.5 to 100, like 3.' };
        const difficulty = parseWhole(d.difficulty, 1, 5);
        if (difficulty === null) return { error: 'Difficulty must be 1 to 5.' };
        if (d.syllabus.length > 20000) return { error: 'The syllabus can be at most 20000 characters.' };
        course = { credits, difficulty, examOnly: Boolean(d.examOnly), weeklyGraded: Boolean(d.weeklyGraded), lab: Boolean(d.lab), syllabus: d.syllabus };
      }
    }
```

and the returned item gains `...(course ? { course } : {})`.

In `preferencesKind`: `toDraft` adds `hoursPerCredit: p.hoursPerCredit == null ? '' : String(p.hoursPerCredit), normalCredits: String(p.normalCredits ?? 30), fullLoadHours: String(p.fullLoadHours ?? 40),`; `fromDraft` parses before the final return:

```js
    const hoursText = String(d.hoursPerCredit).trim();
    const hoursPerCredit = hoursText === '' ? null : parseDecimal(hoursText, 0.1, 20);
    if (hoursText !== '' && hoursPerCredit === null) return { error: 'Hours a week per credit must be a number from 0.1 to 20, or empty.' };
    const normalCredits = parseDecimal(d.normalCredits, 1, 200);
    if (normalCredits === null) return { error: 'Credits in a normal semester must be a number from 1 to 200.' };
    const fullLoadHours = parseDecimal(d.fullLoadHours, 1, 100);
    if (fullLoadHours === null) return { error: 'Study hours at a full load must be a number from 1 to 100.' };
```

and the item gains `hoursPerCredit, normalCredits, fullLoadHours,` after `travelAllowanceMinutes: travelAllowance,`.

- [ ] **Step 4: Run, commit**

Run: `npm test` (green; fix only failures caused by the new draft fields, such as an exact-draft comparison for blank tasks).

```bash
git add -A public test
git commit -m "feat: estimate plumbing, course details and scale preferences in the Setup model

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015g9zWNaWwq6C6AoikFwJmf"
```

---

### Task 5: The Course details block and the suggestion card

**Files:**
- Modify: `public/js/form.js`, `public/js/setup.js`, `public/css/app.css`
- Test: `test/frontend/form.test.ts`, `test/frontend/setup.test.ts`

**Interfaces:**
- Consumes: `store.estimate`, `taskKind` course drafts, `parseDecimal`, `parseWhole`; `hoursText` is re-implemented in the browser as a small local function (the browser does not import `src/`).
- Produces: field type `textarea`; Tasks `FIELDS` gain the Course details block shown only when `category === 'study'`; `createSetup(dom, { store, getClock, navigate, keepFocus })` keeps an estimate state per open item (`local.estimate`) with `status` one of `idle | busy | ready | error`, `result`, `message`; "Estimate hours" runs it, "Use this" copies minutes into the `weekly` field, "Keep mine" closes the card. Preferences `FIELDS` gain the three scale fields.

- [ ] **Step 1: Write the failing tests**

Append to `test/frontend/form.test.ts`:

```ts
test('a textarea field has a label tied to it, shows the draft and writes typing back', () => {
  const { ctx } = setup();
  const draft: any = { syllabus: 'Weekly sets' };
  const el: any = renderField(dom, { name: 'syllabus', label: 'Syllabus', type: 'textarea', span: 3 }, draft, ctx);
  assert.ok(el.hasClass('span3'));
  const area = byTag(el, 'textarea')[0];
  assert.equal(byTag(el, 'label')[0].getAttribute('for'), area.getAttribute('id'));
  assert.equal(area.value, 'Weekly sets');
  area.value = '<b>Not markup</b>';
  area.dispatch('input');
  assert.equal(draft.syllabus, '<b>Not markup</b>');
});
```

Append to `test/frontend/setup.test.ts` (extend its `setup()` helper so the fake store has `estimate`: add to the `store` object in `setup()` the property `estimate: async (body: any) => { estimates.push(body); if (opts.estimateFails) throw new Error(opts.estimateFails); return opts.estimateResult ?? { rule: { minutes: 240, reason: '3 credits at 1h a week each. Hard course (4 of 5): about 4h a week.' }, ai: null, aiStatus: 'unavailable' }; },` and return `estimates` from the helper; declare `const estimates: any[] = [];` next to `calls`):

```ts
const studyWith = (over: any = {}) => stateWith({ tasks: stateWith().tasks.map((t: any) => (t.id === 'chem' ? { ...t, ...over } : t)) });

test('the Course details block is only there for study tasks', () => {
  const { render } = setup();
  const study: any = render('tasks', 'chem');
  assert.ok(byKey(study, 'f-credits'));
  assert.ok(byKey(study, 'f-syllabus'));
  assert.ok(byKey(study, 'estimate-run'));
  assert.match(textOf(study), /Course details/);
  const gym: any = render('tasks', 'gym');
  assert.equal(byKey(gym, 'f-credits'), undefined);
  assert.equal(byKey(gym, 'estimate-run'), undefined);
});

test('course details are saved with the task', async () => {
  const { render, calls } = setup();
  const el: any = render('tasks', 'chem');
  type(el, 'f-credits', '3');
  type(el, 'f-syllabus', 'Weekly problem sets.');
  byKey(el, 'f-weeklyGraded-true').click();
  await submit(render('tasks', 'chem'));
  const saved = calls[0].tasks.find((t: any) => t.id === 'chem');
  assert.deepEqual(saved.course, { credits: 3, difficulty: 3, examOnly: false, weeklyGraded: true, lab: false, syllabus: 'Weekly problem sets.' });
});

test('Estimate hours asks the server with the draft and shows the suggestion card', async () => {
  const { render, estimates } = setup();
  let el: any = render('tasks', 'chem');
  type(el, 'f-title', 'Organic chemistry');
  type(el, 'f-credits', '3');
  byKey(el, 'f-weeklyGraded-true').click();
  el = render('tasks', 'chem');
  byKey(el, 'estimate-run').click();
  await tick();
  assert.deepEqual(estimates[0], { title: 'Organic chemistry', credits: 3, difficulty: 3, examOnly: false, weeklyGraded: true, lab: false, syllabus: '' });
  el = render('tasks', 'chem');
  const card = byClass(el, 'est')[0];
  assert.match(textOf(card), /4h a week/);
  assert.match(textOf(card), /3 credits at 1h a week each/);
  assert.match(textOf(card), /Rule of thumb/);
  assert.match(textOf(card), /AI is not connected yet/);
});

test('Use this fills minutes a week and closes the card, Keep mine just closes it', async () => {
  const { render } = setup();
  let el: any = render('tasks', 'chem');
  type(el, 'f-credits', '3');
  byKey(el, 'estimate-run').click();
  await tick();
  el = render('tasks', 'chem');
  byKey(el, 'estimate-use').click();
  el = render('tasks', 'chem');
  assert.equal(byKey(el, 'f-weekly').value, '240');
  assert.equal(byClass(el, 'est').length, 0);
  byKey(el, 'estimate-run').click();
  await tick();
  el = render('tasks', 'chem');
  type(el, 'f-weekly', '500');
  byKey(el, 'estimate-keep').click();
  el = render('tasks', 'chem');
  assert.equal(byKey(el, 'f-weekly').value, '500');
  assert.equal(byClass(el, 'est').length, 0);
});

test('an AI answer is the headline and the rule becomes the second line', async () => {
  const { render } = setup(stateWith(), { estimateResult: { rule: { minutes: 240, reason: 'Rule words.' }, ai: { minutes: 300, reason: 'AI words.' }, aiStatus: 'ready' } });
  let el: any = render('tasks', 'chem');
  type(el, 'f-credits', '3');
  byKey(el, 'estimate-run').click();
  await tick();
  el = render('tasks', 'chem');
  const card = textOf(byClass(el, 'est')[0]);
  assert.match(card, /5h a week/);
  assert.match(card, /AI words\./);
  assert.match(card, /Rule of thumb: 4h a week/);
  assert.doesNotMatch(card, /not connected/);
  byKey(el, 'estimate-use').click();
  assert.equal(byKey(render('tasks', 'chem'), 'f-weekly').value, '300');
});

test('an AI failure still shows the rule with a plain note', async () => {
  const { render } = setup(stateWith(), { estimateResult: { rule: { minutes: 240, reason: 'Rule words.' }, ai: null, aiStatus: 'failed', aiMessage: 'The AI could not answer this time. The rule of thumb is shown.' } });
  let el: any = render('tasks', 'chem');
  type(el, 'f-credits', '3');
  byKey(el, 'estimate-run').click();
  await tick();
  el = render('tasks', 'chem');
  assert.match(textOf(byClass(el, 'est')[0]), /The AI could not answer this time/);
  assert.match(textOf(byClass(el, 'est')[0]), /4h a week/);
});

test('missing credits explain themselves and send nothing; a failing request shows a plain sentence', async () => {
  const { render, estimates } = setup();
  let el: any = render('tasks', 'chem');
  byKey(el, 'estimate-run').click();
  await tick();
  assert.equal(estimates.length, 0);
  assert.match(textOf(render('tasks', 'chem')), /Add the credits first/);
  const failing = setup(stateWith(), { estimateFails: 'request.credits must be a number between 0.5 and 100' });
  el = failing.render('tasks', 'chem');
  type(el, 'f-credits', '3');
  byKey(el, 'estimate-run').click();
  await tick();
  assert.match(textOf(failing.render('tasks', 'chem')), /request\.credits must be a number/);
});

test('the card belongs to the open item and disappears when another is opened', async () => {
  const { render } = setup();
  let el: any = render('tasks', 'chem');
  type(el, 'f-credits', '3');
  byKey(el, 'estimate-run').click();
  await tick();
  assert.equal(byClass(render('tasks', 'chem'), 'est').length, 1);
  render('tasks', 'gym');
  assert.equal(byClass(render('tasks', 'chem'), 'est').length, 0);
});

test('a hostile syllabus is sent as plain text and the form stays intact', async () => {
  const { render, estimates } = setup();
  let el: any = render('tasks', 'chem');
  type(el, 'f-credits', '3');
  type(el, 'f-syllabus', '<img src=x onerror=alert(1)> ‮');
  byKey(el, 'estimate-run').click();
  await tick();
  assert.equal(estimates[0].syllabus, '<img src=x onerror=alert(1)> ‮');
  assert.equal(findAll(render('tasks', 'chem'), (e: any) => e.tag === 'img').length, 0);
});

test('Preferences has the three scale fields', async () => {
  const { render, calls } = setup();
  const el: any = render('preferences');
  assert.equal(byKey(el, 'f-hoursPerCredit').value, '');
  assert.equal(byKey(el, 'f-normalCredits').value, '30');
  assert.equal(byKey(el, 'f-fullLoadHours').value, '40');
  type(el, 'f-hoursPerCredit', '1');
  await submit(el);
  assert.equal(calls[0].preferences.hoursPerCredit, 1);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/frontend/form.test.ts test/frontend/setup.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`public/js/form.js`: add before `case 'select'`:

```js
    case 'textarea':
      return wrap(label(def.label), h('textarea', {
        id, 'data-fk': id, value: draft[def.name], rows: def.rows ?? 4, class: 'tx',
        oninput: (e) => { draft[def.name] = e.target.value; },
      }));
```

(If `h('textarea', { value })` does not set the visible text in a real browser, setting the `value` property as `dom.js` does for inputs works for textarea too, since `dom.js` assigns `el.value`.)

`public/js/setup.js`:

- Import `parseDecimal` along with the other setup-model imports.
- Add above `FIELDS`:

```js
const study = (d) => d.category === 'study';
const difficultyOptions = () => [
  { value: '1', label: '1 (very easy)' }, { value: '2', label: '2' }, { value: '3', label: '3' },
  { value: '4', label: '4' }, { value: '5', label: '5 (very hard)' },
];
const yesNo = [{ value: false, label: 'No' }, { value: true, label: 'Yes' }];
const hoursText = (m) => (m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60}h` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`);
```

- Append to `FIELDS.tasks` (after `onePerDay`), all with `show: study`:

```js
    { name: 'courseTitle', type: 'custom', span: 3, show: study, render: (dom) => dom.h('div', { class: 'sec' }, dom.h('b', {}, 'Course details'), dom.h('span', { class: 'mono ai' }, 'Study tasks only')) },
    { name: 'credits', label: 'Credits', type: 'text', inputmode: 'decimal', show: study },
    { name: 'difficulty', label: 'Difficulty', type: 'select', options: difficultyOptions, show: study },
    { name: 'examOnly', label: 'Graded by exams only', type: 'choice', options: yesNo, show: study },
    { name: 'weeklyGraded', label: 'Weekly graded work', type: 'choice', options: yesNo, show: study },
    { name: 'lab', label: 'Has a lab', type: 'choice', options: yesNo, show: study },
    { name: 'syllabus', label: 'Syllabus, optional (paste the text)', type: 'textarea', span: 3, show: study },
    { name: 'estimate', type: 'custom', span: 3, show: study, render: (dom, d, ctx) => estimateBlock(dom, ctx.estimate) },
```

- Add `estimateBlock(dom, est)` above `FIELDS`:

```js
function estimateBlock(dom, est) {
  const { h } = dom;
  const run = h('button', { type: 'button', class: 'go2 mono', 'data-fk': 'estimate-run', disabled: est.status === 'busy', onclick: () => est.run() },
    est.status === 'busy' ? 'Estimating' : 'Estimate hours');
  const parts = [run];
  if (est.status === 'error') parts.push(h('p', { class: 'hint', role: 'alert' }, est.message));
  if (est.status === 'ready') {
    const { rule, ai, aiStatus, aiMessage } = est.result;
    const lead = ai ?? rule;
    parts.push(h('div', { class: 'est' },
      h('i', { class: 'bar2' }),
      h('div', { class: 'in' },
        h('span', { class: 'mono cap' }, 'Suggested'),
        h('span', { class: 'big' }, `${hoursText(lead.minutes)} a week`),
        h('p', {}, lead.reason),
        ai && h('p', { class: 'ai' }, `Rule of thumb: ${hoursText(rule.minutes)} a week`),
        h('span', { class: 'tg' }, ai ? 'AI' : 'Rule of thumb'),
        h('div', { class: 'estbtns' },
          h('button', { type: 'button', class: 'y mono', 'data-fk': 'estimate-use', onclick: () => est.use(lead.minutes) }, 'Use this'),
          h('button', { type: 'button', class: 'mono', 'data-fk': 'estimate-keep', onclick: () => est.keep() }, 'Keep mine')),
        aiStatus === 'unavailable' && h('span', { class: 'mono ai' }, 'AI is not connected yet. The rule of thumb is used until it is.'),
        aiStatus === 'failed' && h('span', { class: 'mono ai' }, aiMessage))));
  }
  return h('div', { class: 'estwrap' }, ...parts);
}
```

- Append to `FIELDS.preferences` (after `travelAllowance`): the three text fields:

```js
    { name: 'hoursPerCredit', label: 'Hours a week per credit, optional', type: 'text', inputmode: 'decimal' },
    { name: 'normalCredits', label: 'Credits in a normal semester', type: 'text', inputmode: 'decimal' },
    { name: 'fullLoadHours', label: 'Study hours a week at a full load', type: 'text', inputmode: 'decimal' },
```

- In `createSetup`: `freshLocal()` returns also `estimate: { status: 'idle', result: null, message: '' }`. Add functions:

```js
  async function runEstimate() {
    const est = local.estimate;
    if (est.status === 'busy') return;
    const credits = parseDecimal(draft.credits, 0.5, 100);
    const difficulty = parseWhole(draft.difficulty, 1, 5);
    if (credits === null || difficulty === null) {
      est.status = 'error';
      est.message = String(draft.credits).trim() === '' ? 'Add the credits first, then ask for an estimate.' : 'Credits must be a number from 0.5 to 100, and difficulty 1 to 5.';
      rerender();
      return;
    }
    if (draft.syllabus.length > 20000) {
      est.status = 'error';
      est.message = 'The syllabus can be at most 20000 characters.';
      rerender();
      return;
    }
    est.status = 'busy';
    rerender();
    const mine = local;
    try {
      const body = { title: draft.title.trim() || 'Study task', credits, difficulty, examOnly: Boolean(draft.examOnly), weeklyGraded: Boolean(draft.weeklyGraded), lab: Boolean(draft.lab), syllabus: draft.syllabus };
      const result = await store.estimate(body);
      if (mine !== local) return;
      if (result === null) { est.status = 'idle'; } else { est.status = 'ready'; est.result = result; }
    } catch (e) {
      if (mine !== local) return;
      est.status = 'error';
      est.message = e && e.message ? e.message : 'The estimate did not work. Try again.';
    }
    rerender();
  }

  const estimateApi = () => ({
    status: local.estimate.status,
    result: local.estimate.result,
    message: local.estimate.message,
    run: runEstimate,
    use: (minutes) => { draft.weekly = String(minutes); local.estimate = { status: 'idle', result: null, message: '' }; rerender(); },
    keep: () => { local.estimate = { status: 'idle', result: null, message: '' }; rerender(); },
  });
```

  (`local` is replaced by `freshLocal()` whenever a different item opens, so the identity check `mine !== local` drops late answers for another item.) In `formColumn` the field context gets `estimate: estimateApi()`: `const ctx = { state: s.state, maps: s.maps, scratch: local.scratch, rerender, estimate: estimateApi() };`.

  Because `run`, `use` and `keep` mutate `local.estimate`, `estimateApi()` reads it fresh on each draw; make sure `use`/`keep` assign a new object to `local.estimate` (not to a captured one).

- `public/css/app.css` append (copy from board T, tokens instead of hex):

```css
.sec { grid-column: span 3; border-top: 4px solid var(--ink); margin-top: 10px; padding-top: 12px; display: flex; justify-content: space-between; align-items: baseline; }
.sec b { font-size: 24px; font-weight: 800; letter-spacing: -.03em; }
.tx { height: 96px; width: 100%; border: 2px solid var(--ink); background: #FAF8F2; padding: 8px 10px; font-size: 14px; color: var(--ink); resize: vertical; }
.estwrap { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; width: 100%; }
.go2 { height: 40px; border: 2px solid var(--ink); background: var(--ink); color: var(--paper); padding: 0 14px; }
.go2:disabled { opacity: .5; cursor: not-allowed; }
.est { width: 100%; display: grid; grid-template-columns: auto 1fr; gap: 18px; border: 2px solid var(--ink); background: #FAF8F2; }
.est .bar2 { background: var(--study); width: 10px; display: block; }
.est .in { padding: 14px 16px 16px 6px; display: flex; flex-direction: column; gap: 6px; }
.est .big { font-size: 56px; font-weight: 800; letter-spacing: -.05em; line-height: .9; }
.est p { margin: 0; font-size: 14px; line-height: 1.4; }
.est .tg { font-family: var(--font-mono); font-size: 10px; letter-spacing: .08em; text-transform: uppercase; border: 1px solid #B9B4A6; padding: 2px 5px; color: var(--muted); align-self: flex-start; }
.estbtns { display: flex; gap: 8px; margin-top: 6px; }
.estbtns button { padding: 9px 14px; border: 2px solid var(--ink); background: transparent; font-weight: 600; }
.estbtns button.y { background: var(--study); color: var(--on-study); }
.ai { color: var(--muted); }
```

  Check first with `grep -n "^\.sec\|^\.tx\|^\.go2\|^\.est\|^\.ai\b\|^\.tag" public/css/app.css`; `.tag` already exists for Settings (leave it) and `.tg` is new; do not duplicate any existing rule.

- [ ] **Step 4: Run, commit**

Run: `npm test` (green; the existing Tasks form tests that count fields or compare drafts may need the new keys; fix only those).

```bash
git add -A public test
git commit -m "feat: Course details and the estimate card on the Tasks form, scale fields on Preferences

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015g9zWNaWwq6C6AoikFwJmf"
```

---

### Task 6: End to end, docs and the visual checklist

**Files:**
- Modify: `README.md`, `docs/ui-visual-check.md`, `docs/superpowers/specs/2026-10-09-ui-design.md`
- Test: `test/frontend/estimate-e2e.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: an end-to-end test and accurate docs.

- [ ] **Step 1: Write the end-to-end test**

Create `test/frontend/estimate-e2e.test.ts` modelled on `test/frontend/setup-e2e.test.ts` (copy its imports, server `before`/`after`, `boot`, `settled`, `key`, `type`, `save`, `put`, `serverState`, `tick`, `now`, `baseState`; create the server with `createApp(path, { workload: fakeWorkloadProvider(300, 'Labs are heavy.') })` for the AI test by starting a second server in the same file). Tests:

```ts
test('estimate with the rule, use the number, save: the server keeps the course and the minutes', async () => {
  assert.equal((await put(baseState({ preferences: { ...structuredClone(defaultPreferences), hoursPerCredit: 1 } }))).status, 200);
  const { app, root } = boot();
  await settled(app);
  app.navigate('#/tasks/t1');
  type(root, 'f-credits', '3');
  key(root, 'f-weeklyGraded-true').click();
  key(root, 'estimate-run').click();
  await tick(60);
  assert.match(textOf(byClass(root, 'est')[0]), /Rule of thumb/);
  key(root, 'estimate-use').click();
  assert.equal(key(root, 'f-weekly').value, '210');
  await save(app, root);
  const saved = (await serverState()).tasks.find((t: any) => t.id === 't1');
  assert.equal(saved.weeklyMinutes, 210);
  assert.deepEqual(saved.course, { credits: 3, difficulty: 3, examOnly: false, weeklyGraded: true, lab: false, syllabus: '' });
});

test('Preferences scale fields save, and the estimate follows them', async () => {
  assert.equal((await put(baseState())).status, 200);
  const { app, root } = boot();
  await settled(app);
  app.navigate('#/preferences');
  type(root, 'f-hoursPerCredit', '2');
  await save(app, root);
  assert.equal((await serverState()).preferences.hoursPerCredit, 2);
  app.navigate('#/tasks/t1');
  type(root, 'f-credits', '3');
  key(root, 'estimate-run').click();
  await tick(60);
  assert.match(textOf(byClass(root, 'est')[0]), /6h a week/);
});

test('the same task opened again shows its saved course, and a non-study task has no block', async () => {
  assert.equal((await put(baseState())).status, 200);
  const { app, root } = boot();
  await settled(app);
  app.navigate('#/tasks/t1');
  type(root, 'f-credits', '4');
  type(root, 'f-syllabus', '<b>Syllabus</b>');
  await save(app, root);
  app.navigate('#/tasks/t1');
  assert.equal(key(root, 'f-credits').value, '4');
  assert.equal(key(root, 'f-syllabus').value, '<b>Syllabus</b>');
});

test('while an estimate runs Nudge thinks', async () => {
  assert.equal((await put(baseState())).status, 200);
  const { app, root } = boot();
  await settled(app);
  app.navigate('#/tasks/t1');
  type(root, 'f-credits', '3');
  key(root, 'estimate-run').click();
  assert.equal(app.store.get().estimating, true);
  assert.equal(byClass(app.nudge.el, 'mascot')[0].getAttribute('data-face'), 'thinking');
  await tick(60);
  assert.equal(app.store.get().estimating, false);
});
```

(Adapt the helper names to what the copied file defines; the assertions are the contract. The minutes in the first test come from 3 credits × 1h = 180 min × 1.15 = 207 → 210.)

- [ ] **Step 2: Run to see it fail or pass, then fix wiring**

Run: `node --test test/frontend/estimate-e2e.test.ts`. Expected: it passes once Tasks 1 to 5 are in; if the Nudge test fails because `main.js` does not pass `estimating`, add it (Task 4 says to) and rerun.

- [ ] **Step 3: Docs**

- `README.md`: status paragraph says the workload estimate (rule of thumb, scaled to the user's school) is built and the real AI call waits for a key; add `POST /api/estimate` to the endpoint list ("`POST /api/estimate` suggests weekly minutes for a study task from credits, difficulty and a few answers; it saves nothing").
- `docs/ui-visual-check.md`: append "Course details and the scale fields (boards T, O)": Preferences shows Hours a week per credit (optional), Credits in a normal semester, Study hours a week at a full load; a Study task shows Course details (Credits, Difficulty, three Yes/No, Syllabus, Estimate hours); pressing it shows the suggestion card with a vermilion left bar, big hours, one sentence, a "Rule of thumb" tag, Use this and Keep mine, and the grey "AI is not connected yet" line; Nudge shows his thinking face while it works; a non-study task shows no Course details.
- UI spec: add a build-status bullet pointing at `docs/superpowers/plans/2026-10-10-workload-estimate.md` and the spec `2026-10-10-workload-estimate-design.md`.

- [ ] **Step 4: Verify and commit**

Run: `npm test` (green).

```bash
git add -A test README.md docs
git commit -m "feat: workload estimate end to end, with docs and visual checks

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015g9zWNaWwq6C6AoikFwJmf"
```

---

## Self-review notes

- **Spec coverage:** data and limits (Task 1); rule of thumb with both bases, difficulty, yes/no, rounding, sentences (Task 2); provider interface, clamping, failure handling (Task 2); endpoint (Task 3); Preferences fields and Course details block, suggestion card, thinking face (Tasks 4 to 6); old files (Tasks 1, 4).
- **Rulings to ledger when they happen:** the all-three-answers expected value (210, not 225); suggestions are not stored (spec says so); hours text helper is duplicated in the browser because the browser cannot import `src/`.
- **Names used across tasks:** `ruleOfThumb`, `hoursText`, `FACTORS`, `buildEstimate`, `clampAi`, `fakeWorkloadProvider`, `unavailableProvider` (in `workload.ts`), `validateEstimateRequest`, `courseOf`, `parseDecimal`, `store.estimate`, `estimating`, `estimateBlock`, data-fk keys `estimate-run`, `estimate-use`, `estimate-keep`, draft keys `credits`, `difficulty`, `examOnly`, `weeklyGraded`, `lab`, `syllabus`, `hoursPerCredit`, `normalCredits`, `fullLoadHours`.
