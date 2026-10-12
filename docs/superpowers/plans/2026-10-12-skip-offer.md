# Nudge skip offer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nudge offers to skip a recorded, zero-attendance class in the next 3 days when skipping would really help the user catch up, with one press to skip and an undo.

**Architecture:** `replan` is split into `replanCore` (today's behavior, no offers) and `replan` (core plus `skip-offer` warnings found by trial plans). The browser turns those warnings into Nudge items with a "Skip it" offer. Skipping and undoing edit the class's `exceptions` through the state the browser already reads and writes, then replan.

**Tech Stack:** TypeScript run by Node's type stripping (`node --test`), plain ES module browser code, hand-rolled fake DOM in tests. Run all tests with `npm test`.

**Spec:** `docs/superpowers/specs/2026-10-12-skip-offer-design.md`

## Global Constraints

- No emojis, no gradients, no inline styles (CSP), all text through `h()`, real buttons, keyboard reachable, reduced motion respected.
- An offer exists only for a class with a `courseId`, a `weekly` pattern, a date from today to today plus 2, the attendance verdict `skippable`, and a trial plan whose shortfall for the linked task is at least `preferences.minBlock` minutes lower.
- Skipping only adds the date to the class's `exceptions`. Nothing is ever skipped automatically.
- A skip offer never counts toward "needs you".
- Trial plans use `replanCore`; offers can never fail a replan.
- Do not push. The user pushes when they say yes.
- Commit trailer on every commit: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Keys: a dismissal names the class and the date, never the minutes.

## Review Focus

- A dismissed skip offer stays dismissed after the next replan (the pruning must see the new warnings, or the dismissal is lost) (Task 1).
- Skipping when the class was deleted or made one-off in another tab: no crash, a plain notice, no stray exception (Task 3).
- A task that is behind but where skipping gains nothing (one session a day already placed): no offer (Task 1).
- Undo after the class was edited elsewhere: removes only that date, keeps everything else (Task 3).
- Offers appearing for a class on a date already in its exceptions: never (Task 1).
- A second press of "Skip it" (double click) adds the exception once (Task 3).

---

## File structure

- `src/types.ts`, `src/replan.ts`: the new warning kind, `replanCore`, the offers, the key (Task 1).
- `public/js/nudge-model.js`, `public/js/nudge.js`: the skip item, the accept handler, the confirm bubble (Task 2).
- `public/js/store.js`, `public/js/main.js`: `skipClass`, `undoSkip`, wiring (Task 3).
- One end-to-end test and `docs/ui-visual-check.md` (Task 4).

---

### Task 1: The offers on the server

**Files:**
- Modify: `src/types.ts` (`WarningDetail`, `Warning`), `src/replan.ts`
- Test: `test/skipoffer.test.ts` (new), `test/warnings.test.ts`

**Interfaces:**
- Consumes: `attendanceFor` and `Advice` from `src/attendance.ts`.
- Produces: `replanCore(state, today, nowMinutes?, horizonDays?)` (the current `replan` body, unchanged); `replan` with the same signature and return type that also returns `skip-offer` warnings; `Warning.kind` gains `'skip-offer'`; `WarningDetail` gains `commitmentId?: string`, `commitmentTitle?: string`, `start?: number`. A skip-offer's `detail` is `{ commitmentId, commitmentTitle, taskId, taskTitle, category, date, start, minutes }` where `minutes` is the gain.

- [ ] **Step 1: Write the failing tests**

`test/skipoffer.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replan, replanCore, warningKey } from '../src/replan.ts';
import { emptyState } from '../src/store.ts';
import type { Course, State } from '../src/types.ts';
import { commitment, task } from './helpers.ts';

const TODAY = '2026-10-05'; // Monday
const course = (over: Partial<Course> = {}): Course => ({ credits: 3, difficulty: 3, examOnly: false, weeklyGraded: false, lab: false, syllabus: '', attendanceWeight: 0, recorded: 'yes', ...over });
const weekdays = { kind: 'weekly' as const, weekdays: [1, 2, 3, 4, 5], from: TODAY, to: '2026-12-31' };
const build = (courseOver: Partial<Course> = {}, taskOver: any = {}, classOver: any = {}): State => ({
  ...emptyState(),
  tasks: [task({ id: 'chem', title: 'Chemistry', weeklyMinutes: 10000, course: course(courseOver), ...taskOver })],
  commitments: [commitment({ id: 'lec', title: 'Chemistry lecture', category: 'class', courseId: 'chem', start: 600, end: 720, pattern: weekdays, ...classOver })],
});
const offers = (state: State, now?: number) => replan(state, TODAY, now).warnings.filter((w) => w.kind === 'skip-offer');

test('behind on a recorded zero-weight course: one offer for each class day in the next three days', () => {
  const found = offers(build());
  assert.deepEqual(found.map((w) => w.detail?.date), [TODAY, '2026-10-06', '2026-10-07']);
  const first = found[0].detail!;
  assert.equal(first.commitmentId, 'lec');
  assert.equal(first.commitmentTitle, 'Chemistry lecture');
  assert.equal(first.taskTitle, 'Chemistry');
  assert.equal(first.start, 600);
  assert.ok(first.minutes! >= 30);
  assert.match(found[0].message, /Chemistry lecture on 2026-10-05 could be skipped to catch up \d+ min of Chemistry/);
});

test('replanCore never makes offers, and replan only adds them', () => {
  const state = build();
  const core = replanCore(state, TODAY);
  assert.equal(core.warnings.some((w) => w.kind === 'skip-offer'), false);
  const full = replan(state, TODAY);
  assert.deepEqual(full.warnings.filter((w) => w.kind !== 'skip-offer'), core.warnings);
  assert.deepEqual(full.state.blocks, core.state.blocks);
});

test('no offer when the verdict is not skippable', () => {
  assert.deepEqual(offers(build({ attendanceWeight: 10 })), []);
  assert.deepEqual(offers(build({ recorded: 'no' })), []);
  assert.deepEqual(offers(build({ lab: true })), []);
  assert.deepEqual(offers(build({ attendanceWeight: undefined })), []);
});

test('no offer when you are not behind', () => {
  assert.deepEqual(offers(build({}, { weeklyMinutes: 60 })), []);
});

test('no offer for a one-off class, a class without a course, or a skipped date', () => {
  assert.deepEqual(offers(build({}, {}, { pattern: { kind: 'once', date: TODAY } })), []);
  const noLink = build();
  delete (noLink.commitments[0] as any).courseId;
  assert.deepEqual(offers(noLink), []);
  const skipped = build({}, {}, { exceptions: [TODAY] });
  assert.deepEqual(offers(skipped).map((w) => w.detail?.date), ['2026-10-06', '2026-10-07']);
});

test('no offer when skipping gains nothing', () => {
  // One session a day is already placed elsewhere, so a freed slot adds no study.
  assert.deepEqual(offers(build({}, { onePerDay: true, maxBlock: 60 })), []);
});

test('replanning again gives the same offers', () => {
  const state = build();
  const once = replan(state, TODAY);
  const twice = replan(once.state, TODAY);
  assert.deepEqual(twice.warnings.filter((w) => w.kind === 'skip-offer'), once.warnings.filter((w) => w.kind === 'skip-offer'));
});

test('a dismissed offer stays dismissed, and a dismissal of one class day does not hide another', () => {
  const state = build();
  const [first, second] = replan(state, TODAY).warnings.filter((w) => w.kind === 'skip-offer');
  const dismissed = { ...state, dismissed: [warningKey(first)] };
  const after = replan(dismissed, TODAY);
  assert.deepEqual(after.state.dismissed, [warningKey(first)], 'the dismissal survives the pruning');
  assert.notEqual(warningKey(first), warningKey(second));
  const again = replan(after.state, TODAY);
  assert.deepEqual(again.state.dismissed, [warningKey(first)]);
});

test('the key names the class and the date, not the minutes', () => {
  const a = { kind: 'skip-offer' as const, message: 'x', detail: { commitmentId: 'lec', taskTitle: 'Chemistry', date: TODAY, minutes: 60 } };
  assert.equal(warningKey(a), warningKey({ ...a, detail: { ...a.detail, minutes: 90 } }));
  assert.notEqual(warningKey(a), warningKey({ ...a, detail: { ...a.detail, commitmentId: 'other' } }));
  assert.notEqual(warningKey(a), warningKey({ ...a, detail: { ...a.detail, date: '2026-10-06' } }));
});
```

(Add to `test/warnings.test.ts` nothing; the key tests live above.)

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/skipoffer.test.ts`
Expected: FAIL (`replanCore` is not exported).

- [ ] **Step 3: Implement**

`src/types.ts`: in `WarningDetail` add after `placeName?: string;`:

```ts
  commitmentId?: string;
  commitmentTitle?: string;
  start?: Minutes;
```

and change the `Warning.kind` union to add `| 'skip-offer'`.

`src/replan.ts`: add `import { attendanceFor } from './attendance.ts';`. In `warningKey` change the `about` line to:

```ts
  const about = [d.taskTitle, d.placeName, d.kind, d.dueDate, d.weekStart, d.commitmentId, d.date].filter((x) => x !== undefined);
```

Rename the existing `export function replan(` to `export function replanCore(` (body unchanged) and add below it:

```ts
const OFFER_DAYS = 3;

// Total minutes the linked task is short, from the plan's own warnings.
const shortBy = (warnings: Warning[], taskId: string): number =>
  warnings
    .filter((w) => (w.kind === 'weekly-short' || w.kind === 'deadline-short') && w.detail?.taskId === taskId)
    .reduce((t, w) => t + (w.detail?.minutes ?? 0), 0);

// A class is only offered for skipping when a trial plan without it really shrinks the shortfall.
function skipOffers(state: State, base: { state: State; warnings: Warning[] }, today: DateStr, nowMinutes: Minutes | undefined, horizonDays: number): Warning[] {
  const out: Warning[] = [];
  const advice = attendanceFor(base.state, base.warnings, today, OFFER_DAYS).filter((a) => a.verdict === 'skippable');
  for (const a of advice) {
    const c = state.commitments.find((x) => x.id === a.commitmentId);
    const task = c && state.tasks.find((t) => t.id === c.courseId);
    if (!c || !task || c.pattern.kind !== 'weekly') continue;
    try {
      const trial: State = {
        ...state,
        commitments: state.commitments.map((x) => (x.id === c.id ? { ...x, exceptions: [...x.exceptions, a.date].sort() } : x)),
      };
      const gain = shortBy(base.warnings, task.id) - shortBy(replanCore(trial, today, nowMinutes, horizonDays).warnings, task.id);
      if (gain < state.preferences.minBlock) continue;
      out.push({
        kind: 'skip-offer',
        message: `${c.title} on ${a.date} could be skipped to catch up ${gain} min of ${task.title}`,
        detail: { commitmentId: c.id, commitmentTitle: c.title, taskId: task.id, taskTitle: task.title, category: task.category, date: a.date, start: c.start, minutes: gain },
      });
    } catch {
      // An offer that cannot be worked out is simply not made.
    }
  }
  return out;
}

export function replan(
  state: State,
  today: DateStr,
  nowMinutes?: Minutes,
  horizonDays = 14,
): { state: State; warnings: Warning[]; travel: Leg[] } {
  const base = replanCore(state, today, nowMinutes, horizonDays);
  const offers = skipOffers(state, base, today, nowMinutes, horizonDays);
  if (offers.length === 0) return base;
  const warnings = [...base.warnings, ...offers];
  // The pruning must see the offers too, or a dismissed offer would be forgotten at the next replan.
  const open = new Set(warnings.map(warningKey));
  return { ...base, warnings, state: { ...base.state, dismissed: state.dismissed.filter((k) => open.has(k)) } };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test`
Expected: all pass. If an existing test compares a whole warnings list for a state with a linked skippable class, none exists today (no sample class has a `courseId`).

- [ ] **Step 5: Commit**

```bash
git add src test && git commit -m "feat: the planner finds classes worth offering to skip" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Nudge shows the offer and the confirmation

**Files:**
- Modify: `public/js/nudge-model.js` (`buildNudge`, `offerOf`), `public/js/nudge.js` (`speaking`, `render`, `spokenFor`, accept handler)
- Test: `test/frontend/nudge-model.test.ts`, `test/frontend/nudge.test.ts`

**Interfaces:**
- Consumes: `skip-offer` warnings (Task 1, with `key`/`dismissed` added by the server's describe step); `hhmm`, `duration`, `FULL_WEEKDAYS`, `weekdayOf`, `addDays` from `public/js/time.js`.
- Produces: `buildNudge(warnings, today?)` where the optional `today` (a `YYYY-MM-DD` string) lets headlines say Today or Tomorrow. Soft offers gain `kind: 'soft'`. A skip item is `{ key, headline, minutes: 0, category: 'attendance', offer: { kind: 'skip', key, commitmentId, date, minutes, title, taskTitle, button: 'Skip it', line }, fix }`. Nudge handlers gain `accept(offer)` (falls back to `approve(offer.date)` when absent) and `undoSkip(skip)`. A `view.confirm` with a `skip` field `{ commitmentId, date, title, taskTitle, minutes }` draws the skip confirmation.

- [ ] **Step 1: Write the failing tests**

Append to `test/frontend/nudge-model.test.ts` (it has `w`, `exam`, `offer` helpers):

```ts
const skip = (over: any = {}) => w('skip-offer', { commitmentId: 'lec', commitmentTitle: 'Chemistry lecture', taskId: 'chem', taskTitle: 'Chemistry', category: 'study', date: '2026-10-06', start: 600, minutes: 120, ...over });

test('a skip offer reads as a headline and a line, is not counted in needs you, and has its own button', () => {
  const { items, needsYou } = buildNudge([skip()], '2026-10-05');
  assert.equal(needsYou, 0);
  assert.equal(items.length, 1);
  assert.equal(items[0].headline, 'Chemistry lecture, Tomorrow 10:00, is recorded and counts 0%.');
  assert.deepEqual(
    [items[0].offer.kind, items[0].offer.button, items[0].offer.commitmentId, items[0].offer.date, items[0].offer.minutes, items[0].offer.taskTitle],
    ['skip', 'Skip it', 'lec', '2026-10-06', 120, 'Chemistry'],
  );
  assert.equal(items[0].offer.line, 'Skipping it frees 2h00 for Chemistry. I will only do it if you say so.');
  assert.deepEqual(items[0].fix, { label: 'Fix it myself', hash: '#/day/2026-10-06' });
});

test('the headline says Today, Tomorrow or the weekday, and a dismissed offer is not shown', () => {
  assert.match(buildNudge([skip({ date: '2026-10-05' })], '2026-10-05').items[0].headline, /, Today 10:00,/);
  assert.match(buildNudge([skip({ date: '2026-10-07' })], '2026-10-05').items[0].headline, /, Wednesday 10:00,/);
  assert.match(buildNudge([skip({ date: '2026-10-07' })]).items[0].headline, /, Wednesday 10:00,/);
  assert.equal(buildNudge([{ ...skip(), dismissed: true }], '2026-10-05').items.length, 0);
});

test('skip offers come after shortfalls and keep the soft offer as it was', () => {
  const { items } = buildNudge([skip(), exam(), offer()], '2026-10-05');
  assert.deepEqual(items.map((i: any) => i.category), ['study', 'attendance']);
  assert.equal(items[0].offer.kind, 'soft');
  assert.deepEqual(keysOf(items[1]), [items[1].key]);
});
```

Append to `test/frontend/nudge.test.ts`:

```ts
const skipItem = (over: any = {}) => ({
  key: 'skip-offer|Chemistry|lec|2026-10-06', headline: 'Chemistry lecture, Tomorrow 10:00, is recorded and counts 0%.', minutes: 0, category: 'attendance',
  offer: { kind: 'skip', key: 'skip-offer|Chemistry|lec|2026-10-06', commitmentId: 'lec', date: '2026-10-06', minutes: 120, title: 'Chemistry lecture', taskTitle: 'Chemistry', button: 'Skip it', line: 'Skipping it frees 2h00 for Chemistry. I will only do it if you say so.' },
  fix: { label: 'Fix it myself', hash: '#/day/2026-10-06' }, ...over,
});

function setupSkip() {
  const calls: any[] = [];
  const handlers = {
    approve: (d: string) => calls.push(['approve', d]), undo() {}, dismiss: (k: string[]) => calls.push(['dismiss', k]), okay: () => calls.push(['okay']), retry() {},
    accept: (o: any) => calls.push(['accept', o.kind, o.commitmentId ?? o.date]),
    undoSkip: (s: any) => calls.push(['undoSkip', s.commitmentId, s.date]),
    fix: (h: string) => calls.push(['fix', h]),
  };
  return { nudge: createNudge(dom, handlers) as any, calls };
}

test('skip offer: Skip it, Fix it myself and Leave it fire the right handlers', () => {
  const { nudge, calls } = setupSkip();
  nudge.update({ ...base, items: [skipItem()] });
  assert.match(textOf(nudge.el), /Chemistry lecture, Tomorrow 10:00, is recorded and counts 0%\./);
  assert.match(textOf(nudge.el), /Skipping it frees 2h00 for Chemistry\./);
  labelled(nudge.el, 'Skip it')!.click();
  labelled(nudge.el, 'Fix it myself')!.click();
  labelled(nudge.el, 'Leave it')!.click();
  assert.deepEqual(calls, [['accept', 'skip', 'lec'], ['fix', '#/day/2026-10-06'], ['dismiss', [skipItem().key]]]);
});

test('without an accept handler the soft offer still calls approve', () => {
  const { nudge, calls } = setup();
  nudge.update({ ...base, items: [item()] });
  labelled(nudge.el, 'Use Friday evening')!.click();
  assert.deepEqual(calls, [['approve', '2026-10-09']]);
});

test('skip confirmation: happy, says what moved in, and offers Okay and Undo', () => {
  const { nudge, calls } = setupSkip();
  nudge.update({ ...base, confirm: { used: true, skip: { commitmentId: 'lec', date: '2026-10-06', title: 'Chemistry lecture', taskTitle: 'Chemistry', minutes: 120 } } });
  assert.match(textOf(nudge.el), /Skipped\. 2h00 of Chemistry moved in\./);
  assert.equal(byClass(nudge.el, 'mascot')[0].getAttribute('data-face'), 'happy');
  labelled(nudge.el, 'Undo')!.click();
  labelled(nudge.el, 'Okay')!.click();
  assert.deepEqual(calls, [['undoSkip', 'lec', '2026-10-06'], ['okay']]);
});
```


- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/frontend/nudge-model.test.ts test/frontend/nudge.test.ts`
Expected: FAIL (no skip items, no `accept` handler).

- [ ] **Step 3: Implement**

`public/js/nudge-model.js`: change the import to `import { FULL_WEEKDAYS, addDays, duration, hhmm, longDate, shortDate, weekdayOf } from './time.js';`. In `offerOf` add `kind: 'soft',` as the first property of the returned object. Add above `buildNudge`:

```js
function whenLabel(date, today) {
  if (today && date === today) return 'Today';
  if (today && date === addDays(today, 1)) return 'Tomorrow';
  return FULL_WEEKDAYS[weekdayOf(date)];
}

function skipItemOf(w, today) {
  const d = w.detail;
  return {
    key: w.key,
    headline: `${d.commitmentTitle}, ${whenLabel(d.date, today)} ${hhmm(d.start)}, is recorded and counts 0%.`,
    minutes: 0,
    category: 'attendance',
    offer: {
      kind: 'skip', key: w.key, commitmentId: d.commitmentId, date: d.date, minutes: d.minutes, title: d.commitmentTitle, taskTitle: d.taskTitle,
      button: 'Skip it',
      line: `Skipping it frees ${duration(d.minutes)} for ${d.taskTitle}. I will only do it if you say so.`,
    },
    fix: fixOf(w),
  };
}
```

Change `export function buildNudge(warnings) {` to `export function buildNudge(warnings, today) {`. After the `if (offerWarning) {...}` block and before `return { items, needsYou ... }` add:

```js
  items.push(...open.filter((w) => w.kind === 'skip-offer').map((w) => skipItemOf(w, today)));
```

(`needsYou` is computed from `shortfalls` and `trips` only, so skip offers are not counted.)

`public/js/nudge.js`: in `createNudge`, after `const say = ...` add:

```js
  // Offers go through one handler; without it the soft-evening offer keeps working as before.
  const accept = (offer) => (handlers.accept ? handlers.accept(offer) : handlers.approve(offer.date));
```

In `speaking()` replace `item.offer && button(item.offer.button, () => handlers.approve(item.offer.date), 'y', 'nudge-use'),` with `item.offer && button(item.offer.button, () => accept(item.offer), 'y', item.offer.kind === 'skip' ? 'nudge-skip' : 'nudge-use'),`. In `spokenFor`, inside `if (view.confirm) {` add as its first line `if (c.skip) return \`Skipped ${c.skip.title}.\`;` (after `const c = view.confirm;`). In `render()`, insert before `} else if (view.confirm) {`:

```js
    } else if (view.confirm && view.confirm.skip) {
      const s = view.confirm.skip;
      bubble = say(
        h('span', { class: 'mono k' }, 'Nudge'),
        h('b', {}, `Skipped. ${duration(s.minutes)} of ${s.taskTitle} moved in.`),
        h('p', {}, `${s.title} is off your plan that day. You can take it back.`),
        h('div', { class: 'acts' }, button('Okay', () => handlers.okay(), 'y', 'nudge-okay'), button('Undo', () => handlers.undoSkip(s), '', 'nudge-undo')),
      );
```

and add `import { duration } from './time.js';` at the top of `nudge.js` if no time import exists there (the file currently has none).

- [ ] **Step 4: Run to verify they pass**

Run: `npm test`
Expected: all pass. If an existing nudge-model test deep-compares a soft offer object, add `kind: 'soft'` to its expectation.

- [ ] **Step 5: Commit**

```bash
git add public test && git commit -m "feat: Nudge offers to skip a class and confirms it" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Store actions and wiring

**Files:**
- Modify: `public/js/store.js`, `public/js/main.js`
- Test: `test/frontend/store.test.ts`

**Interfaces:**
- Consumes: the Nudge `accept` and `undoSkip` handlers and the skip offer shape (Task 2).
- Produces: `store.skipClass(offer)` and `store.undoSkip(skip)`. `skipClass` sets `confirm` to `{ used: true, skip: { commitmentId, date, title, taskTitle, minutes } }` on success, or the notice `That class changed, so I refreshed the plan.` when the class is gone or no longer weekly. `undoSkip` clears `confirm`.

- [ ] **Step 1: Write the failing tests** (append to `test/frontend/store.test.ts`; it has `make`, `full`, `result`, `clock`)

```ts
const lecture = (over: any = {}) => ({ id: 'lec', title: 'Chemistry lecture', category: 'class', pattern: { kind: 'weekly', weekdays: [1], from: '2026-10-05', to: '2026-12-31' }, exceptions: [], ...over });
const offerFor = (over: any = {}) => ({ kind: 'skip', commitmentId: 'lec', date: '2026-10-06', minutes: 120, title: 'Chemistry lecture', taskTitle: 'Chemistry', ...over });

function skipRig(initial: any) {
  let server = structuredClone(initial);
  const puts: any[] = [];
  const f = make({
    getState: () => structuredClone(server),
    putState: (s: any) => { puts.push(structuredClone(s)); server = structuredClone(s); return { ok: true }; },
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
  const f = make({ getState: () => full({ commitments: [lecture()] }), putState: () => { throw new ApiError(0, 'The planner is not reachable'); } });
  await f.store.load();
  await f.store.skipClass(offerFor());
  assert.equal(f.store.get().status, 'offline');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/frontend/store.test.ts`
Expected: FAIL (`skipClass` is not a function).

- [ ] **Step 3: Implement**

`public/js/store.js`: add near `STALE_NOTICE`: `const CLASS_NOTICE = 'That class changed, so I refreshed the plan.';`. Add to the returned object after `undo:`:

```js
    // Skipping a class only adds that date to its exceptions, the same as "Skip this day" in the class panel.
    skipClass: (offer) =>
      guard(async () => {
        const fresh = await api.getState();
        const c = fresh.commitments.find((x) => x.id === offer.commitmentId);
        if (!c || c.pattern.kind !== 'weekly') {
          set(merged(await api.replan(getClock()), { confirm: null, notice: CLASS_NOTICE }));
          return;
        }
        if (!c.exceptions.includes(offer.date)) {
          await api.putState({ ...fresh, commitments: fresh.commitments.map((x) => (x.id === c.id ? { ...x, exceptions: [...x.exceptions, offer.date].sort() } : x)) });
        }
        const state = await api.getState();
        const r = await api.replan(getClock());
        current = { ...current, state };
        set(merged(r, { confirm: { used: true, skip: { commitmentId: c.id, date: offer.date, title: c.title, taskTitle: offer.taskTitle, minutes: offer.minutes } } }));
      }),
    undoSkip: (skip) =>
      guard(async () => {
        const fresh = await api.getState();
        await api.putState({
          ...fresh,
          commitments: fresh.commitments.map((x) => (x.id === skip.commitmentId ? { ...x, exceptions: x.exceptions.filter((d) => d !== skip.date) } : x)),
        });
        const state = await api.getState();
        const r = await api.replan(getClock());
        current = { ...current, state };
        set(merged(r, { confirm: null }));
      }),
```

`public/js/main.js`: in the `createNudge` handlers add after `approve:`:

```js
    accept: (offer) => (offer.kind === 'skip' ? store.skipClass(offer) : store.approve(offer.date)),
    undoSkip: (skip) => store.undoSkip(skip),
```

and change the Nudge items call in `nudge.update({...})` from `buildNudge(s.warnings).items` to `buildNudge(s.warnings, getClock().today).items`.

- [ ] **Step 4: Run to verify they pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add public test && git commit -m "feat: skipping a class from Nudge, and taking it back" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: End to end and the visual check

**Files:**
- Test: `test/frontend/skip-offer-e2e.test.ts` (new)
- Modify: `docs/ui-visual-check.md`

**Interfaces:**
- Consumes: everything above, through the real server. Copy the scaffolding of `test/frontend/attendance-e2e.test.ts` (its `before`/`after`, `boot`, `settled`, `put`, the `now` of Monday 5 Oct 2026 07:00, and `checkInEnabled: false`), changing the class pattern to weekdays `[1, 2, 3, 4, 5]` so Monday to Wednesday are within the 3-day window.

- [ ] **Step 1: Write the test**

```ts
// Same imports and scaffolding as test/frontend/attendance-e2e.test.ts, with the class on weekdays 1 to 5.
const click = (root: any, label: string) => byTag(root, 'button').find((b: any) => textOf(b).trim() === label)!.click();
const exceptions = (app: any) => app.store.get().state.commitments.find((c: any) => c.id === 'lec').exceptions;
const shortBy = (app: any) => app.store.get().warnings.filter((w: any) => w.detail?.taskId === 'chem').reduce((t: number, w: any) => t + (w.detail.minutes ?? 0), 0);

test('Nudge offers to skip tomorrow\'s lecture, skipping frees the time, and Undo brings it back', async () => {
  assert.equal((await put(state())).status, 200);
  const { app, root } = boot();
  await settled(app);
  const offers = () => app.store.get().warnings.filter((w: any) => w.kind === 'skip-offer');
  assert.deepEqual(offers().map((w: any) => w.detail.date), ['2026-10-05', '2026-10-06', '2026-10-07']);
  const before = shortBy(app);
  // Page to the skip offer for tomorrow.
  for (let i = 0; i < 12 && !/Tomorrow 10:00/.test(textOf(root)); i++) click(root, '>');
  assert.match(textOf(root), /Chemistry lecture, Tomorrow 10:00, is recorded and counts 0%\./);
  click(root, 'Skip it');
  await settled(app);
  assert.deepEqual(exceptions(app), ['2026-10-06']);
  assert.match(textOf(root), /Skipped\. \d+h\d\d of Chemistry moved in\./);
  assert.ok(shortBy(app) < before, 'the shortfall shrank');
  assert.equal(offers().some((w: any) => w.detail.date === '2026-10-06'), false, 'the skipped day is not offered again');
  click(root, 'Undo');
  await settled(app);
  assert.deepEqual(exceptions(app), []);
  assert.equal(shortBy(app), before);
});

test('Leave it hides one class day and keeps the others offered', async () => {
  assert.equal((await put(state())).status, 200);
  const { app, root } = boot();
  await settled(app);
  for (let i = 0; i < 12 && !/Today 10:00/.test(textOf(root)); i++) click(root, '>');
  click(root, 'Leave it');
  await settled(app);
  const shown = app.store.get().warnings.filter((w: any) => w.kind === 'skip-offer' && !w.dismissed).map((w: any) => w.detail.date);
  assert.deepEqual(shown, ['2026-10-06', '2026-10-07']);
});
```

(The `>` button is Nudge's "Next warning" pager. Use whatever label the pager button has in `nudge.js`: it is `'>'` with `aria-label` "Next warning".)

- [ ] **Step 2: Run it**

Run: `node --test test/frontend/skip-offer-e2e.test.ts`
Expected after Tasks 1 to 3: PASS. If a label differs, fix the test helper, not the product.

- [ ] **Step 3: Visual check doc**

Append to `docs/ui-visual-check.md`:

```md
## Nudge skip offer

- Set up: a study course with attendance 0 and lectures recorded Yes, a weekly target you are behind on, and a weekly class linked to that course.
- Within the next 3 days Nudge comes up with "Chemistry lecture, Tomorrow 10:00, is recorded and counts 0%." and the line "Skipping it frees 2h00 for Chemistry. I will only do it if you say so." Buttons: Skip it, Fix it myself, Leave it.
- Skip it: Nudge looks happy, says "Skipped. 2h00 of Chemistry moved in." with Okay and Undo, and the freed hour fills with study. Undo puts the class back.
- Leave it hides that one day. The other days stay offered. A class that is not recorded, or counts for the grade, is never offered.
```

- [ ] **Step 4: Full run**

Run: `npm test`
Expected: all pass (rerun `node --test test/perf.test.ts` alone if it is the only failure).

- [ ] **Step 5: Commit**

```bash
git add test docs && git commit -m "test: the skip offer end to end and the visual check list" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-review

- **Spec coverage:** when an offer exists, with all five conditions and the 3-day window (Task 1); trial plans through `replanCore` with no recursion, failures give no offer (Task 1); the new warning kind and detail, key by class and date (Task 1); dismissal surviving pruning (Task 1); the skip item, headline, line, buttons, not in needs-you, paging after shortfalls, soft offers unchanged with `kind: 'soft'` (Task 2); one accept handler routed by kind, with a fallback (Tasks 2 and 3); `skipClass` and `undoSkip` through the existing read-and-write path, vanished or one-off class notice, double press adds once (Task 3); confirm bubble with Undo and the happy face (Task 2); notifications left to the existing module (no code); offline failure (Task 3); end to end including the shortfall shrinking and Undo (Task 4).
- **Placeholder scan:** none.
- **Types:** `replanCore`, `replan`, `skip-offer`, `commitmentId`, `commitmentTitle`, `start`, `OFFER_DAYS`, `buildNudge(warnings, today)`, offer fields `kind/key/commitmentId/date/minutes/title/taskTitle/button/line`, handlers `accept`/`undoSkip`, store `skipClass`/`undoSkip`, `confirm.skip` and `CLASS_NOTICE` are used with the same spelling throughout.
