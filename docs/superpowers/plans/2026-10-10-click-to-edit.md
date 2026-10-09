# Click to Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything on the Week and Day screens can be clicked. A panel slides in from the right and lets you edit it (commitments), see where it comes from and jump to the thing that makes it (planned blocks and trips), or skip just one day of a weekly item. The Deadlines page gets a "+ Add a due date" button and clickable rows.

**Architecture:** Calendar items carry the id of what they come from (`commitmentId`, `taskId`, `deadlineId`, `placeId`, `commuteId`) and become real buttons. One `drawer.js` module owns the panel (like the Menu overlay): it reuses the Setup field definitions and rules for the commitment form, so there is one source of truth for validation. Saves go through `store.saveState(fn)` on the freshest server copy, as in Setup.

**Tech Stack:** Dependency-free TypeScript (Node type stripping) for the one small backend change; browser ES modules in `public/js` (no framework, no build); `node:test` with the fake document.

**Spec:** the approved boards U (Click to edit), V (Click to edit, other items) and G (Deadlines with "+ Add a due date" and "Click a row to edit it") on https://claude.ai/artifact/TNMnuzerDogRwvQxJSNdPP, plus the user's decisions: the Day screen opens the same panel; no extra "+" buttons on Week or Day.

## Global Constraints

- No framework, build step or npm dependency; no `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`eval`/`new Function`; no inline styles or `style` attributes (CSP); no browser requests except same-origin `/api/...`. Modules must not touch `window`, `document` or `localStorage` at import time.
- All user text reaches the page through `createTextNode`, `textContent` or `value`.
- Calendar items are real `button` elements (keyboard: Enter and Space open the panel; Esc closes it; Tab stays inside it while open; focus returns to the item that opened it).
- Saves never send a stale copy: `store.saveState((fresh) => ...)`. Editing one item changes nothing else in the state.
- The panel adds no new colours or shapes beyond boards U and V.
- Every task ends with a green `npm test` and one commit whose message ends with the two trailer lines `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_015g9zWNaWwq6C6AoikFwJmf`. Do not push unless the user asks.
- Run all commands from `/Users/tomastello/doitwithme-phase1`.

## Review Focus

1. Hostile text (markup, RTL override, 200-character titles) in titles shown in the panel header, buttons, aria-labels and the delete confirmation renders as text only (Tasks 3, 4).
2. "Skip this day": only for weekly items, only that date, never twice, never for a date outside the pattern; the item then disappears from that day and the plan replans; editing or deleting a commitment that another tab already removed gives a plain sentence and no crash (Task 4).
3. Keyboard and focus: Enter and Space on an item, Esc to close, Tab cycle inside the panel, focus returns to the same item after close even though the Week redraws; the `/` shortcut while typing in the panel's fields must not open the Menu (Tasks 3, 4, 5).
4. The panel against redraws: a store update while it is open (a Nudge action, a day rollover, a save elsewhere) must not wipe what was typed, close it, or leave it pointing at a deleted item (Tasks 4, 5).
5. Items that are not commitments: planned blocks and trips whose task, place or commute was deleted since the plan was drawn; a trip whose commute is estimated; the links they offer lead to existing, correct routes (Tasks 1, 4).

## File Structure

```
src/
  types.ts          (modify) Leg gets placeId and commuteId
  travel.ts         (modify) legs carry the place and the route they came from
public/js/
  model.js          (modify) day items carry ids and the date; itemKey
  day-model.js      (modify) rows carry ids and the date
  week.js           (modify) items are buttons
  day.js            (modify) rows are buttons
  drawer.js         (new) the panel
  deadlines.js      (modify) add button and clickable rows
  main.js           (modify) drawer wiring
public/css/app.css  (modify) button items, panel, deadline rows
test/               new and extended tests per task
docs/               README, visual checklist, spec status
```

---

### Task 1: Trips know where they come from

**Files:**
- Modify: `src/types.ts`, `src/travel.ts`
- Test: `test/travel.test.ts`

**Interfaces:**
- Consumes: existing `legsOn`, `routeFor`.
- Produces: `Leg` gains `placeId: string` (the non-Home end of the trip: the destination, or the place being left when the trip goes Home) and `commuteId: string | null` (the route that set its time, or null when the allowance was used).

- [ ] **Step 1: Write the failing tests**

In `test/travel.test.ts` update the existing expectations that deep-equal whole legs. Add `placeId` and `commuteId` to each expected leg:
- `'a located event gets an outbound leg ...'`: outbound `placeId: 'campus', commuteId: 'r'`, return `placeId: 'campus', commuteId: 'r'`.
- `'travel is clipped at midnight ...'`: the first leg `placeId: 'campus', commuteId: 'r'`.
Then append:

```ts
test('every trip says which place it concerns and which route set its time', () => {
  const withRoute = legsOn(MON, [lecture()], ctx({ commutes: [route()] })).legs;
  assert.deepEqual(withRoute.map((l) => [l.placeId, l.commuteId]), [['campus', 'r'], ['campus', 'r']]);
  const allowance = legsOn(MON, [lesson()], ctx()).legs;
  assert.deepEqual(allowance.map((l) => [l.placeId, l.commuteId, l.estimated]), [['anna', null, true], ['anna', null, true]]);
  const chain = legsOn(MON, [lecture(), lesson({ start: 740, end: 800 })], ctx({ commutes: [route()] })).legs;
  assert.deepEqual(chain.map((l) => l.placeId), ['campus', 'anna', 'anna']);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/travel.test.ts`
Expected: FAIL (legs lack the fields).

- [ ] **Step 3: Implement**

`src/types.ts`: in `interface Leg` add `placeId: string; commuteId: string | null;`.

`src/travel.ts`: change `cost` to also return the route id:

```ts
  const cost = (from: Place, to: Place): { minutes: Minutes; estimated: boolean; commuteId: string | null } => {
    const route = routeFor(from, to, date, ctx.commutes);
    return route
      ? { minutes: minutesFor(route) + route.marginMinutes, estimated: false, commuteId: route.id }
      : { minutes: ctx.allowance, estimated: true, commuteId: null };
  };
```

In the outbound loop destructure `commuteId` too (`const { minutes, estimated, commuteId } = cost(here, place);`) and add `placeId: place.id, commuteId` to the pushed leg. In the return trip destructure `commuteId` and add `placeId: here.id, commuteId` to the pushed leg.

- [ ] **Step 4: Run, fix fallout, commit**

Run: `npm test`. Other tests that deep-equal whole legs (`test/travel-plan.test.ts`, server tests) need the two new fields in their expectations; add them. Frontend tests that build legs by hand do not need them.

```bash
git add -A src test
git commit -m "feat: trips carry the place and the route they came from

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015g9zWNaWwq6C6AoikFwJmf"
```

---

### Task 2: Calendar items know what they are

**Files:**
- Modify: `public/js/model.js`, `public/js/day-model.js`
- Test: `test/frontend/model.test.ts`, `test/frontend/day-model.test.ts`

**Interfaces:**
- Consumes: existing `occurrencesOn` (unchanged: the server-parity test compares it with `src/busy.ts`), `dayItems`, `dayModel`.
- Produces: day items and Day rows gain `date` and identity fields: commitment items `commitmentId`; block items `taskId` and `deadlineId` (when present); travel items `placeId`, `commuteId`, `fromName`, `toName`, `estimated`; `itemKey(item): string` exported from `model.js`.

- [ ] **Step 1: Write the failing tests**

Append to `test/frontend/model.test.ts` (import `itemKey` with the other imports from `model.js`):

```ts
test('every calendar item knows its date and what it comes from', () => {
  const st = state({
    commitments: [commitment({ id: 'lec' })],
    blocks: [{ taskId: 'chem', title: 'Chemistry', category: 'study', date: '2026-10-13', start: 480, end: 530, deadlineId: 'exam' }],
  });
  const travel = [{ date: '2026-10-13', start: 545, end: 600, fromName: 'Home', toName: 'Campus', estimated: false, placeId: 'campus', commuteId: 'r1' }];
  const items = dayItems(st, '2026-10-13', travel);
  const byKind = (k: string) => items.find((i: any) => i.kind === k);
  assert.deepEqual([byKind('commitment').commitmentId, byKind('commitment').date], ['lec', '2026-10-13']);
  assert.deepEqual([byKind('block').taskId, byKind('block').deadlineId, byKind('block').date], ['chem', 'exam', '2026-10-13']);
  assert.deepEqual([byKind('travel').placeId, byKind('travel').commuteId, byKind('travel').fromName, byKind('travel').toName, byKind('travel').estimated], ['campus', 'r1', 'Home', 'Campus', false]);
});

test('two commitments in one day each keep their own id, in the same order as before', () => {
  const st = state({ commitments: [commitment({ id: 'a', start: 600, end: 660 }), commitment({ id: 'b', start: 600, end: 660 })] });
  assert.deepEqual(dayItems(st, '2026-10-13').map((i: any) => i.commitmentId), ['a', 'b']);
});

test('item keys are unique per item and stable', () => {
  const a = { kind: 'commitment', commitmentId: 'lec', date: '2026-10-13', start: 600 };
  const b = { kind: 'block', taskId: 'lec', date: '2026-10-13', start: 600 };
  const t = { kind: 'travel', placeId: 'campus', date: '2026-10-13', start: 545 };
  assert.equal(itemKey(a), 'commitment:lec:2026-10-13:600');
  assert.equal(new Set([itemKey(a), itemKey(b), itemKey(t)]).size, 3);
  assert.equal(itemKey({ ...a }), itemKey(a));
});
```

Append to `test/frontend/day-model.test.ts`:

```ts
test('Day rows carry the same identities as the Week items', () => {
  const travel = [{ date: '2026-10-14', start: 900, end: 930, fromName: 'Home', toName: 'Anna', estimated: true, placeId: 'anna', commuteId: null }];
  const m = dayModel(wed(), '2026-10-14', travel);
  const lesson = m.rows.find((r: any) => r.title === 'Private lesson, Anna');
  assert.deepEqual([lesson.kind, lesson.commitmentId, lesson.date], ['item', 'lesson-1', '2026-10-14']);
  const study = m.rows.find((r: any) => r.title === 'Chemistry');
  assert.deepEqual([study.taskId, study.date], ['Chemistry', '2026-10-14']);
  const leg = m.rows.find((r: any) => r.kind === 'travel');
  assert.deepEqual([leg.placeId, leg.commuteId, leg.fromName, leg.toName, leg.estimated], ['anna', null, 'Home', 'Anna', true]);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/frontend/model.test.ts test/frontend/day-model.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`public/js/model.js`: add and export

```js
export const itemKey = (i) => `${i.kind}:${i.commitmentId ?? i.taskId ?? i.placeId ?? ''}:${i.date}:${i.start}`;
```

In `dayItems`, replace the commitments loop with a per-commitment loop so each occurrence keeps its id:

```js
  for (const c of state.commitments) {
    for (const o of occurrencesOn(date, [c])) {
      items.push({ kind: 'commitment', commitmentId: c.id, date, group: 'fixed', start: o.start, end: o.end, title: o.title, label: labelOf(o.category) });
    }
  }
```

Block items add `taskId: b.taskId, date, ...(b.deadlineId ? { deadlineId: b.deadlineId } : {})`. Travel items become `{ kind: 'travel', group: 'travel', date, start: leg.start, end: leg.end, title: ..., label: ..., placeId: leg.placeId, commuteId: leg.commuteId ?? null, fromName: leg.fromName, toName: leg.toName, estimated: leg.estimated }`.

`public/js/day-model.js`: in the commitments loop use the same per-commitment pattern for the `item` rows (`commitmentId: c.id, date`), keep the `buffer` rows without ids, add `taskId`, `deadlineId` and `date` to block rows, and the travel fields (`placeId`, `commuteId`, `fromName`, `toName`, `estimated`, `date`) to travel rows.

- [ ] **Step 4: Run, commit**

Run: `npm test` (green; existing tests that deep-equal whole items add the new fields).

```bash
git add -A public test
git commit -m "feat: calendar items carry the date and what they come from

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015g9zWNaWwq6C6AoikFwJmf"
```

---

### Task 3: Items are buttons

**Files:**
- Modify: `public/js/week.js`, `public/js/day.js`, `public/css/app.css`
- Test: `test/frontend/week.test.ts`, `test/frontend/day.test.ts`, `test/frontend/assets.test.ts`

**Interfaces:**
- Consumes: item identities (Task 2), `itemKey`.
- Produces: in `renderWeek(dom, view, actions)` and `renderDay(...)` every commitment, block and travel item is a `button` with `data-fk` `blk-<itemKey>`, an `aria-label` of `<title>, <hh:mm>–<hh:mm>, <label>. Opens the editor.`, and `onclick: () => actions.open(item)`. Buffer rows and gaps stay plain.

- [ ] **Step 1: Write the failing tests**

Append to `test/frontend/week.test.ts` (its `setup(over, actionOver)` passes `actionOver` into the actions; add `open: (item: any) => calls.push(['open', item.kind, item.title])` to the default actions object in that helper, or pass it through `actionOver` in the new test):

```ts
test('every item in the week is a button that opens the editor, with a name for screen readers', () => {
  const calls: any[] = [];
  const st = state({ commitments: [{ id: 'm', title: '<img src=x onerror=alert(1)>', category: 'mass', start: 1200, end: 1260, pattern: { kind: 'once', date: '2026-10-12' }, exceptions: [], bufferBefore: 0 }] });
  const travel = [{ date: '2026-10-12', start: 1100, end: 1130, fromName: 'Home', toName: 'Parish', estimated: true, placeId: 'p', commuteId: null }];
  const model = weekModel(st, '2026-10-12', all, '2026-10-12', travel);
  const el: any = renderWeek(dom, { model, visible: all, needsYou: 0, isEmpty: false, travelOff: false }, { open: (item: any) => calls.push([item.kind, item.title]), canAdd: false } as any);
  const items = findAll(el, (e: any) => e.tag === 'button' && (e.getAttribute('data-fk') ?? '').startsWith('blk-'));
  assert.ok(items.length >= 6);
  for (const b of items) {
    assert.equal(b.getAttribute('type'), 'button');
    assert.match(b.getAttribute('aria-label'), /Opens the editor\.$/);
  }
  const mass = items.find((b: any) => b.getAttribute('aria-label').includes('<img'));
  mass.click();
  assert.deepEqual(calls, [['commitment', '<img src=x onerror=alert(1)>']]);
  assert.equal(findAll(el, (e: any) => e.tag === 'img').length, 0);
  const trip = items.find((b: any) => b.hasClass('travel'));
  trip.click();
  assert.equal(calls[1][0], 'travel');
  assert.equal(new Set(items.map((b: any) => b.getAttribute('data-fk'))).size, items.length, 'keys are unique');
});
```

Append to `test/frontend/day.test.ts` (its `draw(over, actionOver)` passes `actionOver` into the actions):

```ts
test('item rows in the day are buttons that open the editor; buffers and gaps are not', () => {
  const opened: any[] = [];
  const { el } = draw({}, { open: (item: any) => opened.push([item.kind, item.title]) });
  const buttons = findAll(el, (e: any) => e.tag === 'button' && (e.getAttribute('data-fk') ?? '').startsWith('blk-'));
  assert.ok(buttons.length >= 3);
  buttons.find((b: any) => textOf(b).includes('Private lesson'))!.click();
  assert.deepEqual(opened, [['commitment', 'Private lesson, Anna']]);
  assert.equal(byClass(el, 'dv-buf').length, 1);
  assert.equal(byClass(el, 'dv-buf')[0].tag === 'button', false);
  assert.equal(byClass(el, 'dv-gap').every((g: any) => g.tag !== 'button'), true);
});
```

Append to `test/frontend/assets.test.ts`:

```ts
test('calendar items drawn as buttons look like the blocks on the boards', () => {
  const css = readFileSync('public/css/app.css', 'utf8');
  assert.match(css, /^\.blk \{[^}]*border: 0;[^}]*font: inherit;[^}]*text-align: left;[^}]*width: 100%;[^}]*cursor: pointer;/m);
  assert.match(css, /^\.dv-blk \{[^}]*border: 0;[^}]*font: inherit;[^}]*text-align: left;[^}]*cursor: pointer;/m);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/frontend/week.test.ts test/frontend/day.test.ts test/frontend/assets.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`public/js/week.js`: import `itemKey` and `hhmm` (already) and change `block` to render buttons:

```js
  const label = (item) => `${item.kind === 'travel' ? `Commute ${item.end - item.start}` : item.title}, ${hhmm(item.start)}–${hhmm(item.end)}, ${item.label}. Opens the editor.`;
  const open = (item) => ({ type: 'button', 'data-fk': `blk-${itemKey(item)}`, 'aria-label': label(item), onclick: () => actions.open(item) });
  const block = (item) =>
    item.kind === 'travel'
      ? h('button', { ...open(item), class: 'blk travel', title: item.title },
          h('span', { class: 'top' }, h('span', { class: 't' }, `${hhmm(item.start)}–${hhmm(item.end)}`), h('span', { class: 'k' }, item.label)),
          h('span', { class: 'n' }, `Commute ${item.end - item.start}`))
      : h('button', { ...open(item), class: `blk g-${item.group}` },
          h('span', { class: 'top' }, h('span', { class: 't' }, `${hhmm(item.start)}–${hhmm(item.end)}`), h('span', { class: 'k' }, item.label)),
          h('span', { class: 'n' }, item.title));
```

(Inner `div.top` becomes `span.top` because a button may only contain phrasing content; the CSS keeps `.top` as a flex row.)

`public/js/day.js`: in `rowOf`, the `travel` and item rows replace the `div.dv-blk` with `h('button', { type: 'button', class: ..., 'data-fk': `blk-${itemKey(r)}`, 'aria-label': ..., onclick: () => actions.open(r) }, ...)` using the same label rule (travel label `Commute N`); leave the `buffer` and `gap` rows as they are. Import `itemKey` from `./model.js`.

`public/css/app.css`: extend the existing rules (do not add new ones with higher specificity):

- `.blk { ... }` gains `border: 0; font: inherit; color: inherit; text-align: left; width: 100%; cursor: pointer;` and `.blk .top` stays `display: flex`.
- `.dv-blk { ... }` gains `border: 0; font: inherit; color: inherit; text-align: left; cursor: pointer;` (keep `.dv-buf`'s own dashed border rule and make sure `.dv-buf` is declared after it; it is not a button).
- Add `.blk:focus-visible, .dv-blk:focus-visible { outline: 3px solid var(--ink); outline-offset: 2px; }`.
- Check that `.g-outline` and `.travel` borders still win (they are declared after `.blk`).

- [ ] **Step 4: Run, commit**

Run: `npm test` (green; existing tests that look for `div.blk` children by tag need `button`).

```bash
git add -A public test
git commit -m "feat: calendar items are real buttons

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015g9zWNaWwq6C6AoikFwJmf"
```

---

### Task 4: The panel

**Files:**
- Create: `public/js/drawer.js`
- Modify: `public/css/app.css`
- Test: `test/frontend/drawer.test.ts`

**Interfaces:**
- Consumes: `FIELDS` from `setup.js`; `renderField` from `form.js`; `commitmentKind`, `applyItem`, `removeItem` from `setup-model.js`; `store.get()`, `store.saveState(fn)`; `itemKey` from `model.js`.
- Produces: `createDrawer(dom, { store, navigate, focusKey }) -> { el, open(item), close(), isOpen() }` where `item` is a calendar item (Task 2) and `focusKey(key)` focuses the element with that `data-fk` (used to return focus). The panel has `role="dialog"`, `aria-modal="true"`, an `aria-label` of the item title, and `data-fk` keys `drawer-close`, `drawer-skip`, `drawer-save`, `drawer-discard`, `drawer-delete`, `drawer-confirm`, `drawer-keep`, `drawer-link-task`, `drawer-link-due`, `drawer-link-commute`, `drawer-link-place`.

- [ ] **Step 1: Write the failing tests**

Create `test/frontend/drawer.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDom } from '../../public/js/dom.js';
import { createDrawer } from '../../public/js/drawer.js';
import { dayItems } from '../../public/js/model.js';
import { FakeDocument, byClass, byTag, findAll, textOf } from './fakedom.ts';

const example = JSON.parse(readFileSync('examples/sample-state.json', 'utf8'));
const tick = () => new Promise((r) => setTimeout(r, 0));
const key = (root: any, k: string) => findAll(root, (e) => e.getAttribute('data-fk') === k)[0];
const type = (root: any, k: string, v: string) => { const el = key(root, k); el.value = v; el.dispatch('input'); };

function rig(state: any = structuredClone(example), opts: any = {}) {
  const saves: any[] = [];
  const navs: string[] = [];
  const focused: string[] = [];
  let current: any = { state, busy: false, formError: null, status: 'ready' };
  const store: any = {
    get: () => current,
    saveState: async (fn: any) => {
      const next = fn(opts.fresh ?? current.state);
      saves.push(next);
      if (opts.reject) current = { ...current, formError: opts.reject };
      else current = { ...current, state: next, formError: null };
    },
  };
  const dom = createDom(new FakeDocument() as any);
  const drawer: any = createDrawer(dom, { store, navigate: (h: string) => navs.push(h), focusKey: (k: string) => focused.push(k) });
  const itemOf = (kind: string, date: string, match: (i: any) => boolean) => dayItems(current.state, date, opts.travel ?? []).find((i: any) => i.kind === kind && match(i));
  return { drawer, saves, navs, focused, store, itemOf, setState: (s: any) => { current = { ...current, state: s }; } };
}
// 2026-10-13 is a Tuesday: the chemistry lecture (Tue and Thu, 10:00-12:00) is on it.
const TUE = '2026-10-13';

test('closed by default, open on an item, named for screen readers, closes on Esc and the Close button', () => {
  const { drawer, itemOf, focused } = rig();
  assert.equal(drawer.isOpen(), false);
  assert.equal(drawer.el.getAttribute('hidden'), '');
  drawer.open(itemOf('commitment', TUE, (i) => i.commitmentId === 'chem-lecture'));
  assert.equal(drawer.isOpen(), true);
  assert.equal(drawer.el.getAttribute('hidden'), null);
  assert.equal(byClass(drawer.el, 'drawer')[0].getAttribute('role'), 'dialog');
  assert.equal(byClass(drawer.el, 'drawer')[0].getAttribute('aria-label'), 'Chemistry lecture');
  drawer.el.dispatch('keydown', { key: 'Escape' });
  assert.equal(drawer.isOpen(), false);
  assert.deepEqual(focused.at(-1)?.startsWith('blk-commitment:chem-lecture:'), true);
  drawer.open(itemOf('commitment', TUE, (i) => i.commitmentId === 'chem-lecture'));
  key(drawer.el, 'drawer-close').click();
  assert.equal(drawer.isOpen(), false);
  const scrim = byClass(drawer.el, 'scrim')[0];
  drawer.open(itemOf('commitment', TUE, (i) => i.commitmentId === 'chem-lecture'));
  scrim.click();
  assert.equal(drawer.isOpen(), false);
});

test('a commitment panel shows what it is, when, and the board U fields filled in', () => {
  const { drawer, itemOf } = rig();
  drawer.open(itemOf('commitment', TUE, (i) => i.commitmentId === 'chem-lecture'));
  const text = textOf(drawer.el);
  assert.match(text, /Class \/ every Tue, Thu/);
  assert.match(text, /Tue 13 Oct \/ 10:00–12:00/);
  assert.match(text, /Skip this day/);
  assert.match(text, /Changes apply to every week of this class/);
  assert.equal(key(drawer.el, 'f-title').value, 'Chemistry lecture');
  assert.equal(key(drawer.el, 'f-start').value, '10:00');
  assert.equal(key(drawer.el, 'f-end').value, '12:00');
  assert.ok(key(drawer.el, 'f-placeId'));
  assert.ok(key(drawer.el, 'f-weekdays-2'));
  assert.equal(key(drawer.el, 'f-from'), undefined, 'the date range and cancelled dates stay in Setup');
  assert.equal(findAll(drawer.el, (e: any) => e.tag === 'a' && e.getAttribute('href') === '#/commitments/chem-lecture').length, 1);
});

test('Skip this day adds only that date and closes the panel', async () => {
  const { drawer, itemOf, saves } = rig();
  drawer.open(itemOf('commitment', TUE, (i) => i.commitmentId === 'chem-lecture'));
  key(drawer.el, 'drawer-skip').click();
  await tick();
  const saved = saves[0].commitments.find((c: any) => c.id === 'chem-lecture');
  assert.deepEqual(saved.exceptions, [TUE]);
  assert.deepEqual(saves[0].commitments.find((c: any) => c.id === 'mass').exceptions, []);
  assert.equal(drawer.isOpen(), false);
});

test('a one-off commitment has no Skip this day, and a skipped day cannot be skipped twice', async () => {
  const once = structuredClone(example);
  once.commitments.push({ id: 'dentist', title: 'Dentist', category: 'meeting', start: 840, end: 900, pattern: { kind: 'once', date: TUE }, exceptions: [], bufferBefore: 0 });
  const { drawer, itemOf, saves } = rig(once);
  drawer.open(itemOf('commitment', TUE, (i) => i.commitmentId === 'dentist'));
  assert.equal(key(drawer.el, 'drawer-skip'), undefined);
  assert.ok(key(drawer.el, 'f-date'));
  drawer.close();
  const twice = structuredClone(example);
  twice.commitments.find((c: any) => c.id === 'chem-lecture').exceptions = [TUE];
  const r = rig(twice, { fresh: twice });
  r.drawer.open({ kind: 'commitment', commitmentId: 'chem-lecture', date: TUE, start: 600, end: 720, title: 'Chemistry lecture', label: 'class', group: 'fixed' });
  key(r.drawer.el, 'drawer-skip').click();
  await tick();
  assert.deepEqual(r.saves[0].commitments.find((c: any) => c.id === 'chem-lecture').exceptions, [TUE]);
});

test('editing saves through the freshest copy, changes only that commitment and closes', async () => {
  const { drawer, itemOf, saves } = rig();
  drawer.open(itemOf('commitment', TUE, (i) => i.commitmentId === 'chem-lecture'));
  type(drawer.el, 'f-title', 'Organic chemistry lecture');
  type(drawer.el, 'f-end', '12:30');
  key(drawer.el, 'drawer-save').click();
  await tick();
  const next = saves[0];
  const changed = next.commitments.find((c: any) => c.id === 'chem-lecture');
  assert.deepEqual([changed.title, changed.end, changed.start], ['Organic chemistry lecture', 750, 600]);
  assert.deepEqual({ ...next, commitments: null }, { ...example, commitments: null });
  assert.deepEqual(next.commitments.filter((c: any) => c.id !== 'chem-lecture'), example.commitments.filter((c: any) => c.id !== 'chem-lecture'));
  assert.equal(drawer.isOpen(), false);
});

test('a mistake stays in the panel in plain words, and a server rejection too, with the typing kept', async () => {
  const a = rig();
  a.drawer.open(a.itemOf('commitment', TUE, (i) => i.commitmentId === 'chem-lecture'));
  type(a.drawer.el, 'f-end', '09:00');
  key(a.drawer.el, 'drawer-save').click();
  await tick();
  assert.equal(a.saves.length, 0);
  assert.match(textOf(byClass(a.drawer.el, 'err')[0]), /End time must be after the start time/);
  assert.equal(key(a.drawer.el, 'f-end').value, '09:00');
  const b = rig(structuredClone(example), { reject: 'commitments[1].title must be text of 1 to 200 characters' });
  b.drawer.open(b.itemOf('commitment', TUE, (i) => i.commitmentId === 'chem-lecture'));
  type(b.drawer.el, 'f-title', 'New name');
  key(b.drawer.el, 'drawer-save').click();
  await tick();
  assert.equal(b.drawer.isOpen(), true);
  assert.match(textOf(byClass(b.drawer.el, 'err')[0]), /commitments\[1\]\.title/);
  assert.equal(key(b.drawer.el, 'f-title').value, 'New name');
});

test('Discard puts the saved values back; Delete asks first and removes only that commitment', async () => {
  const { drawer, itemOf, saves } = rig();
  drawer.open(itemOf('commitment', TUE, (i) => i.commitmentId === 'chem-lecture'));
  type(drawer.el, 'f-title', 'Changed');
  key(drawer.el, 'drawer-discard').click();
  assert.equal(key(drawer.el, 'f-title').value, 'Chemistry lecture');
  key(drawer.el, 'drawer-delete').click();
  assert.match(textOf(drawer.el), /Delete "Chemistry lecture"\?/);
  assert.equal(saves.length, 0);
  key(drawer.el, 'drawer-keep').click();
  assert.equal(key(drawer.el, 'drawer-confirm'), undefined);
  key(drawer.el, 'drawer-delete').click();
  key(drawer.el, 'drawer-confirm').click();
  await tick();
  assert.equal(saves[0].commitments.some((c: any) => c.id === 'chem-lecture'), false);
  assert.equal(saves[0].commitments.length, example.commitments.length - 1);
  assert.equal(drawer.isOpen(), false);
});

test('a commitment that is already gone says so instead of crashing', async () => {
  const { drawer, saves } = rig();
  drawer.open({ kind: 'commitment', commitmentId: 'ghost', date: TUE, start: 600, end: 660, title: 'Ghost', label: 'class', group: 'fixed' });
  assert.match(textOf(drawer.el), /no longer there/);
  assert.equal(key(drawer.el, 'drawer-save'), undefined);
  assert.ok(key(drawer.el, 'drawer-close'));
  assert.equal(saves.length, 0);
});

test('a planned block explains itself and leads to its task and due date', () => {
  const state = structuredClone(example);
  state.blocks = [{ taskId: 'chem', title: 'Chemistry', category: 'study', date: TUE, start: 480, end: 535, deadlineId: 'chem-exam' }];
  const { drawer, itemOf, navs } = rig(state);
  drawer.open(itemOf('block', TUE, () => true));
  const text = textOf(drawer.el);
  assert.match(text, /Study \/ planned for you/);
  assert.match(text, /Tue 13 Oct \/ 08:00–08:55/);
  assert.match(text, /I put this here for the task Chemistry/);
  assert.match(text, /6h a week/);
  assert.match(text, /Change the task and I replan/);
  key(drawer.el, 'drawer-link-due').click();
  assert.deepEqual(navs, ['#/due-dates/chem-exam']);
  assert.equal(drawer.isOpen(), false);
  drawer.open(itemOf('block', TUE, () => true));
  key(drawer.el, 'drawer-link-task').click();
  assert.equal(navs[1], '#/tasks/chem');
});

test('a planned block whose task was deleted since says so and offers no dead link', () => {
  const state = structuredClone(example);
  state.tasks = state.tasks.filter((t: any) => t.id !== 'chem');
  state.deadlines = [];
  state.blocks = [{ taskId: 'chem', title: 'Chemistry', category: 'study', date: TUE, start: 480, end: 535 }];
  const { drawer, itemOf } = rig(state);
  drawer.open(itemOf('block', TUE, () => true));
  assert.match(textOf(drawer.el), /no longer there/);
  assert.equal(key(drawer.el, 'drawer-link-task'), undefined);
});

test('a trip explains where its time came from and links to the commute or the place', () => {
  const travel = [
    { date: TUE, start: 515, end: 570, fromName: 'Home', toName: 'Campus', estimated: false, placeId: 'campus', commuteId: 'home-campus' },
    { date: TUE, start: 900, end: 930, fromName: 'Home', toName: 'Anna', estimated: true, placeId: 'anna', commuteId: null },
  ];
  const { drawer, itemOf, navs } = rig(structuredClone(example), { travel });
  drawer.open(itemOf('travel', TUE, (i) => i.placeId === 'campus'));
  assert.match(textOf(drawer.el), /Travel \/ commute/);
  assert.match(textOf(drawer.el), /Commute 55/);
  assert.match(textOf(drawer.el), /Worked out from your commute Home to Campus/);
  key(drawer.el, 'drawer-link-commute').click();
  assert.equal(navs.at(-1), '#/commutes/home-campus');
  drawer.open(itemOf('travel', TUE, (i) => i.placeId === 'anna'));
  assert.match(textOf(drawer.el), /Travel \/ estimated/);
  assert.match(textOf(drawer.el), /No commute is set for Home to Anna, so I used your 30 minute allowance/);
  assert.match(textOf(drawer.el), /Anna has no address yet/);
  assert.match(textOf(key(drawer.el, 'drawer-link-commute')), /Add a commute/);
  key(drawer.el, 'drawer-link-commute').click();
  assert.equal(navs.at(-1), '#/commutes/new');
  drawer.open(itemOf('travel', TUE, (i) => i.placeId === 'anna'));
  key(drawer.el, 'drawer-link-place').click();
  assert.equal(navs.at(-1), '#/places/anna');
});

test('hostile titles stay text in the heading, the label and the confirmation', () => {
  const state = structuredClone(example);
  state.commitments[1].title = '<img src=x onerror=alert(1)> ‮';
  const { drawer, itemOf } = rig(state);
  drawer.open(itemOf('commitment', TUE, (i) => i.commitmentId === 'chem-lecture'));
  assert.equal(findAll(drawer.el, (e: any) => e.tag === 'img').length, 0);
  assert.match(textOf(byTag(drawer.el, 'h2')[0]), /<img src=x onerror=alert\(1\)>/);
  key(drawer.el, 'drawer-delete').click();
  assert.match(textOf(byClass(drawer.el, 'confirm')[0]), /<img src=x onerror=alert\(1\)>/);
});

test('Tab stays inside the panel, and typing "/" in a field is not swallowed', () => {
  const { drawer, itemOf } = rig();
  drawer.open(itemOf('commitment', TUE, (i) => i.commitmentId === 'chem-lecture'));
  const focusable = findAll(drawer.el, (e: any) => ['button', 'input', 'select', 'a'].includes(e.tag) && e.getAttribute('disabled') === null);
  const last = focusable[focusable.length - 1];
  const first = focusable[0];
  let moved: any = null;
  first.focus = () => { moved = first; };
  const ev = last.dispatch('keydown', { key: 'Tab' });
  drawer.el.dispatch('keydown', { key: 'Tab', target: last, shiftKey: false, preventDefault() {} });
  assert.equal(moved, first);
  const slash = key(drawer.el, 'f-title').dispatch('keydown', { key: '/' });
  assert.equal(slash.defaultPrevented, false);
  assert.ok(ev);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `node --test test/frontend/drawer.test.ts`
Expected: FAIL, cannot find module `drawer.js`.

- [ ] **Step 3: Implement `public/js/drawer.js`**

```js
import { renderField } from './form.js';
import { FIELDS } from './setup.js';
import { applyItem, commitmentKind, removeItem } from './setup-model.js';
import { itemKey } from './model.js';
import { WEEKDAYS, duration, hhmm, longDate } from './time.js';
import { WEEK_ORDER } from './setup-model.js';

const SHOWN = ['title', 'category', 'placeId', 'start', 'end', 'date', 'weekdays'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function createDrawer(dom, deps) {
  const { h, clear } = dom;
  const { store, navigate, focusKey } = deps;
  let opened = false;
  let item = null;
  let draft = null;
  let error = null;
  let confirm = false;
  let scratch = {};

  const panel = h('div', { class: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Editor' });
  const scrim = h('div', { class: 'scrim', onclick: () => close() });
  const el = h('div', { class: 'drawer-root', hidden: true, onkeydown: onKey }, scrim, panel);

  function focusables() {
    const out = [];
    const walk = (node) => {
      if (!node || !node.children) return;
      for (const c of node.children) {
        if (typeof c !== 'object' || !c.tag) continue;
        if (['button', 'input', 'select', 'textarea', 'a'].includes(c.tag) && c.getAttribute('disabled') === null) out.push(c);
        walk(c);
      }
    };
    walk(panel);
    return out;
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      close();
    } else if (e.key === 'Tab') {
      const list = focusables();
      if (list.length === 0) return;
      const at = list.indexOf(e.target);
      const edge = e.shiftKey ? at <= 0 : at === list.length - 1;
      if (edge) {
        e.preventDefault();
        list[e.shiftKey ? list.length - 1 : 0].focus();
      }
    }
  }

  const go = (hash) => {
    close(false);
    navigate(hash);
  };

  function close(returnFocus = true) {
    if (!opened) return;
    opened = false;
    el.setAttribute('hidden', '');
    const key = item ? `blk-${itemKey(item)}` : null;
    item = null;
    if (returnFocus && key) focusKey(key);
  }

  const head = (kicker, title, line) =>
    h('div', { class: 'row1' },
      h('div', {}, h('span', { class: 'mono sub2' }, kicker), h('h2', {}, title), h('span', { class: 'mono sub2' }, line)),
      h('button', { type: 'button', class: 'x mono', 'data-fk': 'drawer-close', onclick: () => close() }, 'Close'));

  const when = (i) => `${longDate(i.date)} / ${hhmm(i.start)}–${hhmm(i.end)}`;
  const gone = (i, what) => [
    head(cap(i.label ?? what), i.title, when(i)),
    h('p', { class: 'skip' }, h('span', {}, `This ${what} is no longer there. It may have been changed or removed since this screen was drawn.`)),
  ];

  function patternText(c) {
    if (c.pattern.kind === 'once') return longDate(c.pattern.date);
    return `every ${WEEK_ORDER.filter((w) => c.pattern.weekdays.includes(w)).map((w) => WEEKDAYS[w]).join(', ')}`;
  }

  async function save(c) {
    const state = store.get().state;
    const result = commitmentKind.fromDraft(draft, c.id, state);
    if (result.error) {
      error = result.error;
      draw();
      return;
    }
    error = null;
    await store.saveState((fresh) => applyItem(fresh, 'commitments', result.item));
    const after = store.get();
    if (after.formError) {
      error = after.formError;
      draw();
      return;
    }
    close(false);
    focusKey(`blk-${itemKey({ ...item ?? {}, kind: 'commitment' })}`);
  }

  async function remove(c) {
    await store.saveState((fresh) => removeItem(fresh, 'commitments', c.id));
    const after = store.get();
    if (after.formError) {
      error = after.formError;
      confirm = false;
      draw();
      return;
    }
    close(false);
  }

  async function skip(c) {
    const date = item.date;
    await store.saveState((fresh) => ({
      ...fresh,
      commitments: fresh.commitments.map((x) =>
        x.id === c.id && x.pattern.kind === 'weekly' && !x.exceptions.includes(date) ? { ...x, exceptions: [...x.exceptions, date].sort() } : x),
    }));
    const after = store.get();
    if (after.formError) {
      error = after.formError;
      draw();
      return;
    }
    close(false);
  }

  function commitmentPanel() {
    const state = store.get().state;
    const c = state.commitments.find((x) => x.id === item.commitmentId);
    if (!c) return gone(item, 'commitment');
    const busy = store.get().busy;
    const weekly = c.pattern.kind === 'weekly';
    const ctx = { state, scratch, rerender: draw };
    const fields = FIELDS.commitments
      .filter((f) => SHOWN.includes(f.name) && (!f.show || f.show(draft)))
      .map((f) => renderField(dom, f, draft, ctx))
      .filter(Boolean);
    const confirmRow = confirm
      ? h('div', { class: 'confirm' },
          h('span', {}, `Delete "${c.title}"? Every week of it goes.`),
          h('button', { type: 'button', class: 'mono', 'data-fk': 'drawer-confirm', disabled: busy, onclick: () => remove(c) }, 'Yes, delete'),
          h('button', { type: 'button', class: 'mono', 'data-fk': 'drawer-keep', onclick: () => { confirm = false; draw(); } }, 'Keep it'))
      : h('button', { type: 'button', class: 'del mono', 'data-fk': 'drawer-delete', onclick: () => { confirm = true; draw(); } }, 'Delete');
    return [
      head(`${cap(c.category)} / ${patternText(c)}`, c.title, when(item)),
      weekly && !c.exceptions.includes(item.date) && h('div', { class: 'skip' },
        h('span', {}, `Not going this week? Skip only ${longDate(item.date)}. The other weeks stay.`),
        h('button', { type: 'button', class: 'mono', 'data-fk': 'drawer-skip', disabled: busy, onclick: () => skip(c) }, 'Skip this day')),
      error && h('div', { class: 'err', role: 'alert' }, h('b', {}, 'Nothing was saved.'), h('span', { class: 'mono msg' }, error)),
      h('form', { class: 'dfg', novalidate: true, onsubmit: (e) => { e.preventDefault(); save(c); } }, ...fields),
      h('span', { class: 'note2' }, 'Changes apply to every week of this class. ',
        h('a', { href: `#/commitments/${encodeURIComponent(c.id)}`, onclick: () => close(false) }, 'More options are in Setup.')),
      h('div', { class: 'dbtns' },
        h('button', { type: 'button', class: 'y mono', 'data-fk': 'drawer-save', disabled: busy, onclick: () => save(c) }, 'Save'),
        h('button', { type: 'button', class: 'mono', 'data-fk': 'drawer-discard', onclick: () => { draft = commitmentKind.toDraft(c); error = null; confirm = false; scratch = {}; draw(); } }, 'Discard changes'),
        confirmRow),
    ];
  }

  function blockPanel() {
    const state = store.get().state;
    const task = state.tasks.find((t) => t.id === item.taskId);
    if (!task) return gone(item, 'task');
    const facts = [
      task.weeklyMinutes ? `${duration(task.weeklyMinutes)} a week` : 'no weekly target',
      `blocks up to ${task.maxBlock} min`,
    ].join(', ');
    const due = state.deadlines.filter((d) => d.taskId === task.id);
    const dueText = due.length > 0 ? ` Due: ${due.map((d) => `${d.kind} on ${longDate(d.dueDate)}`).join(', ')}.` : '';
    return [
      head(`${cap(item.label)} / planned for you`, item.title, when(item)),
      h('p', { class: 'skip' }, h('span', {}, `I put this here for the task ${task.title} (${facts}).${dueText} Change the task and I replan.`)),
      h('div', { class: 'dbtns' },
        h('button', { type: 'button', class: 'y mono', 'data-fk': 'drawer-link-task', onclick: () => go(`#/tasks/${encodeURIComponent(task.id)}`) }, 'Edit the task'),
        h('button', { type: 'button', class: 'mono', 'data-fk': 'drawer-link-due', onclick: () => go(item.deadlineId ? `#/due-dates/${encodeURIComponent(item.deadlineId)}` : '#/due-dates') }, 'See its due dates')),
    ];
  }

  function travelPanel() {
    const state = store.get().state;
    const place = (state.places ?? []).find((p) => p.id === item.placeId);
    const trip = `${item.fromName} to ${item.toName}`;
    const allowance = state.preferences.travelAllowanceMinutes ?? 30;
    const why = item.estimated
      ? `No commute is set for ${trip}, so I used your ${allowance} minute allowance.${place && !place.address.trim() ? ` ${place.name} has no address yet.` : ''}`
      : `Worked out from your commute ${trip}.`;
    return [
      head(`Travel / ${item.estimated ? 'estimated' : 'commute'}`, `Commute ${item.end - item.start}`, `${when(item)} / ${trip}`),
      h('p', { class: 'skip' }, h('span', {}, why)),
      h('div', { class: 'dbtns' },
        h('button', { type: 'button', class: 'y mono', 'data-fk': 'drawer-link-commute', onclick: () => go(item.commuteId ? `#/commutes/${encodeURIComponent(item.commuteId)}` : '#/commutes/new') }, item.commuteId ? 'Edit the commute' : 'Add a commute'),
        place && h('button', { type: 'button', class: 'mono', 'data-fk': 'drawer-link-place', onclick: () => go(`#/places/${encodeURIComponent(place.id)}`) }, `Edit ${place.name}`)),
    ];
  }

  function draw() {
    if (!item) return;
    panel.setAttribute('aria-label', item.kind === 'travel' ? `Commute ${item.end - item.start}` : item.title);
    const body = item.kind === 'commitment' ? commitmentPanel() : item.kind === 'block' ? blockPanel() : travelPanel();
    clear(panel, body);
  }

  return {
    el,
    isOpen: () => opened,
    open(next) {
      item = next;
      opened = true;
      error = null;
      confirm = false;
      scratch = {};
      draft = null;
      if (item.kind === 'commitment') {
        const c = store.get().state.commitments.find((x) => x.id === item.commitmentId);
        if (c) draft = commitmentKind.toDraft(c);
      }
      draw();
      el.removeAttribute('hidden');
      const first = focusables()[0];
      if (first) first.focus();
    },
    close,
  };
}
```

(In `open`, the `commitmentPanel` handles a missing commitment through `gone`. `WEEK_ORDER` is imported once; merge the two imports from `setup-model.js` into one line when you paste.)

- [ ] **Step 4: Styles**

Append to `public/css/app.css` (values from boards U and V, using tokens):

```css
/* Click to edit */
.drawer-root[hidden] { display: none; }
.drawer-root .scrim { position: fixed; left: 0; top: 0; bottom: 0; right: 540px; background: rgba(17, 17, 17, .42); z-index: 30; }
.drawer { position: fixed; top: 0; right: 0; bottom: 0; width: 540px; max-width: 100vw; overflow-y: auto; background: var(--paper); border-left: 4px solid var(--ink); padding: 22px 28px; z-index: 31; display: flex; flex-direction: column; gap: 12px; }
.drawer .row1 { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.drawer .x { padding: 6px 12px; border: 2px solid var(--ink); background: transparent; }
.drawer h2 { margin: 4px 0 0; font-size: 54px; font-weight: 800; letter-spacing: -.05em; line-height: .9; overflow-wrap: anywhere; }
.drawer .sub2 { color: var(--muted); }
.drawer .skip { border: 2px dashed var(--ink); padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; gap: 12px; background: #FAF8F2; margin: 0; }
.drawer .skip span { font-size: 14px; color: #3b3a35; }
.drawer .skip button { padding: 8px 12px; border: 2px solid var(--ink); background: transparent; font-weight: 600; white-space: nowrap; }
.drawer .dfg { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 12px; }
.drawer .dfg .fld { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.drawer .dfg .span2, .drawer .dfg .span3 { grid-column: span 2; }
.drawer .note2 { color: var(--muted); font-size: 13px; }
.drawer .dbtns { display: flex; flex-wrap: wrap; gap: 8px; margin-top: auto; align-items: center; }
.drawer .dbtns button { padding: 11px 18px; border: 2px solid var(--ink); background: transparent; font-weight: 600; }
.drawer .dbtns button.y { background: var(--study); color: var(--on-study); }
.drawer .dbtns .del, .drawer .dbtns .confirm { margin-left: auto; }
.drawer button:disabled { opacity: .5; cursor: not-allowed; }
@media (max-width: 700px) { .drawer { width: 100vw; } .drawer-root .scrim { right: 0; } }
```

The `.fg > .fld` subgrid rule applies only to `.fg`; the panel uses `.dfg`, so rows there are plain flex columns. If a label wraps and a neighbouring box sits lower, add the same `@supports (grid-template-rows: subgrid)` rule for `.dfg > .fld` (grid-row: span 2, subgrid, row-gap 5px) in the same style as the Setup one.

- [ ] **Step 5: Run, commit**

Run: `node --test test/frontend/drawer.test.ts` then `npm test` (green). Fix the tests, not the spec, only where the fake DOM cannot express something (for the Tab test, adjust how the keydown is dispatched), and ledger a `Ruling:` for each such adjustment.

```bash
git add -A public test
git commit -m "feat: the click-to-edit panel

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015g9zWNaWwq6C6AoikFwJmf"
```

---

### Task 5: Wire it in, and the Deadlines page

**Files:**
- Modify: `public/js/main.js`, `public/js/deadlines.js`, `public/css/app.css`
- Test: `test/frontend/deadlines.test.ts`, `test/frontend/click-e2e.test.ts`, `test/frontend/assets.test.ts`

**Interfaces:**
- Consumes: `createDrawer` (Task 4), the item buttons (Task 3), `findByKey` from `focus.js`.
- Produces: the panel opens from the Week and the Day; Deadlines has an add link and clickable rows; the `/` Menu shortcut is ignored while the panel is open.

- [ ] **Step 1: Write the failing tests**

Append to `test/frontend/deadlines.test.ts`:

```ts
test('there is an add button, and each row is a link to its own edit form', () => {
  const el = draw();
  const add = findAll(el, (e: any) => e.tag === 'a' && e.getAttribute('href') === '#/due-dates/new');
  assert.equal(add.length, 1);
  assert.match(textOf(add[0]), /\+ Add a due date/);
  const rows = byClass(el, 'dl');
  assert.deepEqual(rows.map((r: any) => [r.tag, r.getAttribute('href')]), [['a', '#/due-dates/tax'], ['a', '#/due-dates/exam']]);
  assert.match(textOf(byClass(el, 'meta')[0]), /Click a row to edit it/);
  const evil = draw(state({ deadlines: [{ id: 'a/b c', taskId: 'chem', kind: 'exam', dueDate: '2026-10-12', effortMinutes: 60 }] }));
  assert.equal(byClass(evil, 'dl')[0].getAttribute('href'), '#/due-dates/a%2Fb%20c');
});

test('the add button is there even when there are no due dates', () => {
  const empty = draw(state({ deadlines: [] }));
  assert.equal(findAll(empty, (e: any) => e.tag === 'a' && e.getAttribute('href') === '#/due-dates/new').length >= 1, true);
});
```

Append to `test/frontend/assets.test.ts`:

```ts
test('deadline rows are links that keep the board look', () => {
  const css = readFileSync('public/css/app.css', 'utf8');
  assert.match(css, /^\.dl \{[^}]*text-decoration: none;[^}]*color: inherit;[^}]*cursor: pointer;/m);
  assert.match(css, /^\.dl:hover \{/m);
  assert.match(css, /^\.hero-add \{/m);
});
```

Create `test/frontend/click-e2e.test.ts` modelled on `test/frontend/setup-e2e.test.ts` (copy its imports, server `before`/`after`, `boot`, `settled`, `key`, `type`, `put`, `serverState`, `tick`, `now`; load the example with `const exampleState = async () => (await fetch(`${base}/api/example`)).json();`). Tests (the example's chemistry lecture is on Tuesday 6 Oct 2026, the week shown for "now" = Monday 5 Oct 2026, 09:00):

```ts
const blk = (root: any, part: string) => findAll(root, (e: any) => e.tag === 'button' && (e.getAttribute('data-fk') ?? '').startsWith('blk-') && e.getAttribute('data-fk').includes(part))[0];

test('click a lecture in the week, change its time in the panel, and the server and the week agree', async () => {
  assert.equal((await put(await exampleState())).status, 200);
  const { app, root } = boot();
  await settled(app);
  blk(root, 'commitment:chem-lecture:2026-10-06').click();
  assert.equal(key(root, 'f-title').value, 'Chemistry lecture');
  type(root, 'f-end', '12:30');
  key(root, 'drawer-save').click();
  await app.store.idle();
  await tick(60);
  const saved = (await serverState()).commitments.find((c: any) => c.id === 'chem-lecture');
  assert.equal(saved.end, 750);
  assert.match(textOf(blk(root, 'commitment:chem-lecture:2026-10-06')), /10:00–12:30/);
  assert.equal(byClass(root, 'drawer-root')[0].getAttribute('hidden'), '');
});

test('Skip this day removes only that Tuesday and keeps Thursday', async () => {
  assert.equal((await put(await exampleState())).status, 200);
  const { app, root } = boot();
  await settled(app);
  blk(root, 'commitment:chem-lecture:2026-10-06').click();
  key(root, 'drawer-skip').click();
  await app.store.idle();
  await tick(60);
  assert.deepEqual((await serverState()).commitments.find((c: any) => c.id === 'chem-lecture').exceptions, ['2026-10-06']);
  assert.equal(blk(root, 'commitment:chem-lecture:2026-10-06'), undefined);
  assert.ok(blk(root, 'commitment:chem-lecture:2026-10-08'));
});

test('a planned block leads to its task form, and a trip leads to the commute', async () => {
  assert.equal((await put(await exampleState())).status, 200);
  const { app, root, win } = boot();
  await settled(app);
  blk(root, 'block:').click();
  key(root, 'drawer-link-task').click();
  assert.match(win.location.hash, /^#\/tasks\//);
  assert.equal(textOf(byTag(root, 'h1')[0]), 'Setup');
  app.navigate('#/week');
  blk(root, 'travel:').click();
  assert.match(textOf(byClass(root, 'drawer')[0]), /Travel \//);
  key(root, 'drawer-link-commute').click();
  assert.match(win.location.hash, /^#\/commutes\//);
});

test('the Day screen opens the same panel, and Esc closes it', async () => {
  assert.equal((await put(await exampleState())).status, 200);
  const { app, root } = boot();
  await settled(app);
  app.navigate('#/day/2026-10-06');
  blk(root, 'commitment:chem-lecture').click();
  assert.equal(key(root, 'f-title').value, 'Chemistry lecture');
  byClass(root, 'drawer-root')[0].dispatch('keydown', { key: 'Escape' });
  assert.equal(byClass(root, 'drawer-root')[0].getAttribute('hidden'), '');
});

test('typing a slash in the panel does not open the Menu', async () => {
  assert.equal((await put(await exampleState())).status, 200);
  const { app, root, document } = boot();
  await settled(app);
  blk(root, 'commitment:chem-lecture:2026-10-06').click();
  const field = key(root, 'f-title');
  document.dispatch('keydown', { key: '/', target: field });
  assert.equal(app.menu.isOpen(), false);
});

test('the Deadlines page adds and edits through the existing form', async () => {
  assert.equal((await put(await exampleState())).status, 200);
  const { app, root, win } = boot();
  await settled(app);
  app.navigate('#/deadlines');
  const add = findAll(root, (e: any) => e.tag === 'a' && e.getAttribute('href') === '#/due-dates/new')[0];
  assert.ok(add);
  app.navigate(add.getAttribute('href'));
  assert.equal(textOf(byTag(root, 'h1')[0]), 'Setup');
  app.navigate('#/deadlines');
  const row = byClass(root, 'dl')[0];
  app.navigate(row.getAttribute('href'));
  assert.match(win.location.hash, /^#\/due-dates\/.+/);
});
```

(Adapt helper names to what the copied file defines; the assertions are the contract. The week shown for "now" is 5 to 11 Oct 2026, so Tuesday is 2026-10-06 and Thursday 2026-10-08.)

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/frontend/deadlines.test.ts test/frontend/assets.test.ts test/frontend/click-e2e.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`public/js/deadlines.js`: the hero becomes

```js
  const hero = h('div', { class: 'hero' },
    h('h1', {}, 'Deadlines'),
    h('div', { class: 'hero-right' },
      h('a', { class: 'hero-add mono', href: '#/due-dates/new', 'data-fk': 'add-due' }, '+ Add a due date'),
      h('div', { class: 'meta mono' },
        h('span', {}, `${model.open} open`),
        model.shorts > 0 && h('span', { class: 'dl-bad' }, `${model.shorts} short`),
        model.rows.length > 0 && h('span', {}, 'Click a row to edit it'))));
```

and each row becomes `h('a', { class: 'dl', href: `#/due-dates/${encodeURIComponent(r.id)}`, 'data-fk': `dl-${r.id}` }, ...)` (same children as before). The empty-state `Add a due date` button stays.

`public/css/app.css` appends: `.hero-right { display: flex; align-items: flex-end; gap: 24px; }`, `.hero-add { padding: 14px 20px; border: 2px solid var(--ink); background: var(--study); color: var(--on-study); font-weight: 600; text-decoration: none; margin-bottom: 4px; }`, and extends `.dl` with `text-decoration: none; color: inherit; cursor: pointer;` plus `.dl:hover { background: #E9E5DA; }` and `.dl:focus-visible { outline: 3px solid var(--ink); outline-offset: -3px; }`.

`public/js/main.js`:

- import `createDrawer` from `./drawer.js` and `findByKey` from `./focus.js` (already imported there for the focus keeper if present; do not import twice).
- after `const menu = createMenu(...)` create the drawer:

```js
  const drawer = createDrawer(dom, {
    store,
    navigate: (hash) => navigate(hash),
    focusKey: (key) => { const target = findByKey(root, key); if (target) target.focus(); },
  });
```

  (`navigate` is defined later with `function navigate`, which is hoisted; the arrow wraps it so the order does not matter.)
- append `drawer.el` to `root` next to `menu.el`.
- add `open: (item) => drawer.open(item)` to both `weekActions` and `dayActions`.
- in the `keydown` shortcut handler add `&& !drawer.isOpen()` to the condition that opens the Menu (typing `/` inside the panel's fields is already protected by the input/select/textarea check, this also covers a `/` pressed on a panel button).
- return `drawer` from `startApp`: `return { store, render, navigate, menu, nudge, drawer };`.

- [ ] **Step 4: Run, commit**

Run: `npm test` (green; update only expectations that look for Deadlines rows as `div` and for the hero meta lines).

```bash
git add -A public test
git commit -m "feat: open the panel from the Week and the Day, and make Deadlines editable

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015g9zWNaWwq6C6AoikFwJmf"
```

---

### Task 6: Docs and the visual checklist

**Files:**
- Modify: `README.md`, `docs/ui-visual-check.md`, `docs/superpowers/specs/2026-10-09-ui-design.md`

- [ ] **Step 1: Update the docs**

- `README.md`: in the Status paragraph say that everything on the Week and Day is clickable and opens an editing panel, and Deadlines has an add button and clickable rows.
- `docs/ui-visual-check.md`: append "Click to edit (boards U, V, G)": click a lecture on the Week: the page dims on the left and a panel slides in from the right with the class, its days, the time, a dashed "Skip this day" box, the fields (Title, Category, Place, Starts, Ends, Weekdays), Save, Discard changes and Delete; Esc and Close and clicking the dimmed area close it. Skip a Tuesday and only that Tuesday disappears. Click a planned study block: the panel says it was planned for you and offers Edit the task and See its due dates. Click a hatched trip: it says where its time came from, with Add a commute or Edit the commute and Edit the place. The Day screen does the same. Tab stays inside the panel. Deadlines: a vermilion "+ Add a due date" top right and the caption "Click a row to edit it"; rows highlight on hover and open the due date's form.
- UI spec: add a build-status bullet pointing at this plan.

- [ ] **Step 2: Verify and commit**

Run: `npm test` (green).

```bash
git add README.md docs
git commit -m "docs: click to edit status and visual checks

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015g9zWNaWwq6C6AoikFwJmf"
```

---

## Self-review notes

- **Spec coverage:** boards U (commitment panel with Skip this day and the Setup fields), V (block and trip panels), G (add button, clickable rows, caption); Day opens the same panel; keyboard and focus; no extra plus buttons.
- **Rulings to ledger when they happen:** the Tab-trap test may need a different way of dispatching in the fake DOM; item inner `div.top` becomes `span.top` because buttons hold phrasing content; the panel shows a subset of the commitment fields (title, category, place, times, date or weekdays), the rest stay in Setup behind the "More options" link.
- **Names used across tasks:** `placeId`, `commuteId` on `Leg` and travel items; `commitmentId`, `taskId`, `deadlineId`, `date` on items; `itemKey`; `createDrawer`; data-fk keys `blk-<itemKey>`, `drawer-*`, `add-due`, `dl-<id>`.
