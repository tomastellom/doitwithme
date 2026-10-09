# Day, Deadlines, Settings and Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the everyday views: a Day screen (board F), a Deadlines screen (board G), a Settings screen (board L) with working Notifications and Planner rows, opt-in browser notifications, and the four primary tabs Day, Week, Deadlines, Setup.

**Architecture:** Each screen is a pure model module (what to show) plus a small view module (how to draw it), registered as a section in the existing registry. Settings is a list of declared rows. A small `ui-prefs.js` keeps the per-browser notification choice; a `notify.js` notifier watches the store and shows a browser notification for a new warning only when the tab is hidden. No server changes.

**Tech Stack:** Browser ES modules in `public/js` (no framework, no build, no npm dependencies); `node:test` with the fake document in `test/frontend/fakedom.ts`.

**Spec:** `docs/superpowers/specs/2026-10-09-ui-design.md` (Day, Deadlines, Settings, system notifications). Visual source of truth: boards F (Day), G (Deadlines) and L (Settings) on https://claude.ai/artifact/TNMnuzerDogRwvQxJSNdPP.

## Global Constraints

- No framework, no build step, no npm dependencies, no `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`eval`/`new Function`, no inline styles and no `style` attributes (the server CSP blocks them; draw bars with SVG shapes), no network requests except same-origin `/api/...`. Modules must not touch `window`, `document` or `localStorage` at import time.
- All user text reaches the page through `createTextNode`, `textContent` or `value` (the `dom.js` helper does this).
- Visuals reuse the existing tokens: square corners, ink borders, vermilion for primary actions and shortfalls, DM Mono labels, no new colours, no emojis. The hero title keeps the existing `clamp(88px, 11vw, 160px)` size (the user asked for smaller titles than the boards).
- Every `localStorage` access is wrapped in try/catch and the page works without it.
- No change to `src/` (the server and planner are untouched by this plan).
- Every task ends with a green `npm test` and one commit whose message ends with the two trailer lines `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_015g9zWNaWwq6C6AoikFwJmf`. Do not push unless the user asks.
- Run all commands from `/Users/tomastello/doitwithme-phase1`.

## Review Focus

1. Hostile text (titles like `<img src=x onerror=alert(1)>`, quotes, RTL override characters, 200-character titles) in Day rows, Deadlines rows and notification text renders as text only (Tasks 1, 2, 5).
2. Date edges: `#/day/` with an invalid or missing date falls back to today; Prev and Next cross month and year ends; a Day far in the past or future still draws (Tasks 1, 4).
3. Free-time arithmetic on the Day screen: overlapping items, items outside the window, items touching midnight, a window fully booked; free time is never negative and never above the window length (Task 1).
4. Deadlines arithmetic: a deadline due today, past (hidden), beyond the plan window (never reported as short), effort 0, blocks of a deleted deadline, the done/planned split at the current minute; bar segments never exceed 100% (Task 2).
5. Notifications and Settings: unsupported, denied, default and granted permission; blocked storage; no notification on first load or while the tab is visible; a dismissed warning is not announced again; turning the switch Off sticks; a soft-time save that fails keeps the old value shown (Tasks 3, 5).

## File Structure

```
public/js/
  day-model.js        (new) rows, gaps, group totals and free time for one day
  day.js              (new) draws the Day screen
  deadlines-model.js  (new) done, planned and short minutes per due date
  deadlines.js        (new) draws the Deadlines screen
  ui-prefs.js         (new) per-browser notification choice and permission
  settings.js         (new) declared rows and the Settings screen
  notify.js           (new) shows a browser notification for a new warning when the tab is hidden
  router.js           (modify) dateParam alias
  main.js             (modify) sections, tabs, notifier
public/css/app.css    (modify) Day, Deadlines, Settings styles
test/frontend/        new tests per task; e2e tests updated for four tabs
docs/                 README, visual checklist, spec status
```

---

### Task 1: The Day screen

**Files:**
- Create: `public/js/day-model.js`, `public/js/day.js`
- Modify: `public/css/app.css`
- Test: `test/frontend/day-model.test.ts`, `test/frontend/day.test.ts`

**Interfaces:**
- Consumes: `occurrencesOn`, `labelOf`, `groupOfBlock`, `GROUPS` from `public/js/model.js`; `addDays`, `duration`, `hhmm`, `isoWeek`, `shortDate`, `weekdayOf`, `WEEKDAYS` from `public/js/time.js`.
- Produces: `dayModel(state, date, travel = []) -> { date, label, week, year, weekLine, booked, free, window, rows, totals }` where `rows` is an ordered list of `{ kind: 'item' | 'buffer' | 'travel' | 'gap', start, end, ... }` (`item` rows also carry `group`, `title`, `label`; `buffer` rows carry `title`; `travel` rows carry `title`, `label`) and `totals` is `{ fixed, study, gym, admin, outline }` in minutes; `renderDay(dom, view, actions)` with `view = { model, needsYou, isEmpty, prevLabel, nextLabel }` and `actions = { go(delta), today(), loadExample() }`.

- [ ] **Step 1: Write the failing model tests**

Create `test/frontend/day-model.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dayModel } from '../../public/js/day-model.js';

const example = JSON.parse(readFileSync('examples/sample-state.json', 'utf8'));
const block = (start: number, end: number, title: string, category: string, date = '2026-10-14') => ({ taskId: title, title, category, date, start, end });
// 2026-10-14 is a Wednesday: the private lesson is 16:00-17:00 with a 30 minute buffer (board F).
const wed = () => ({
  ...structuredClone(example),
  blocks: [block(480, 530, 'Chemistry', 'study'), block(540, 575, 'Chemistry', 'study'), block(585, 620, 'Side project', 'personal project')],
});

test('a day lists items, buffers and free gaps in time order, as on board F', () => {
  const m = dayModel(wed(), '2026-10-14');
  assert.deepEqual(m.rows.map((r: any) => [r.kind, r.start, r.end]), [
    ['item', 480, 530], ['item', 540, 575], ['item', 585, 620],
    ['gap', 620, 930], ['buffer', 930, 960], ['item', 960, 1020], ['gap', 1020, 1320],
  ]);
  assert.equal(m.rows[4].title, 'Buffer before Private lesson, Anna');
  assert.equal(m.rows[5].group, 'fixed');
  assert.equal(m.rows[0].label, 'study');
});

test('the side totals, booked time and free time add up', () => {
  const m = dayModel(wed(), '2026-10-14');
  assert.deepEqual(m.totals, { fixed: 60, study: 85, gym: 0, admin: 0, outline: 35 });
  assert.equal(m.booked, 180);
  assert.deepEqual(m.window, { start: 480, end: 1320 });
  assert.equal(m.free, 630);
});

test('the heading, week line and neighbours are plain text', () => {
  const m = dayModel(wed(), '2026-10-14');
  assert.equal(m.label, 'Wed 14');
  assert.equal(m.weekLine, 'Week 42 / 14 Oct 2026');
});

test('days off use the days-off window', () => {
  const m = dayModel({ ...structuredClone(example), blocks: [] }, '2026-10-17');
  assert.deepEqual(m.window, { start: 600, end: 1200 });
  assert.deepEqual(m.rows.map((r: any) => [r.kind, r.start, r.end]), [['gap', 600, 1200]]);
  assert.equal(m.free, 600);
});

test('travel legs are rows and count as busy, not as booked', () => {
  const travel = [{ date: '2026-10-14', start: 900, end: 930, fromName: 'Home', toName: 'Anna', estimated: true }];
  const m = dayModel(wed(), '2026-10-14', travel);
  const leg = m.rows.find((r: any) => r.kind === 'travel');
  assert.deepEqual([leg.start, leg.end, leg.title, leg.label], [900, 930, 'Home to Anna', 'estimated']);
  assert.equal(m.booked, 180);
  assert.equal(m.free, 600);
  assert.deepEqual(m.rows.filter((r: any) => r.kind === 'gap').map((r: any) => [r.start, r.end]), [[620, 900], [1020, 1320]]);
  const other = dayModel(wed(), '2026-10-14', [{ ...travel[0], date: '2026-10-15' }]);
  assert.equal(other.rows.some((r: any) => r.kind === 'travel'), false);
});

test('free time is never negative or above the window, even with overlaps and items outside it', () => {
  const crowded = { ...structuredClone(example), blocks: [block(0, 1440, 'All day', 'study'), block(600, 700, 'Inside', 'gym'), block(1300, 1440, 'Late', 'chores')] };
  const m = dayModel(crowded, '2026-10-14');
  assert.equal(m.free, 0);
  assert.deepEqual(m.rows.filter((r: any) => r.kind === 'gap'), []);
  const empty = dayModel({ ...structuredClone(example), blocks: [], commitments: [] }, '2026-10-14');
  assert.equal(empty.free, 840);
  assert.equal(empty.booked, 0);
});

test('tiny gaps under 15 minutes are not announced', () => {
  const s = { ...structuredClone(example), commitments: [], blocks: [block(480, 600, 'A', 'study'), block(610, 700, 'B', 'study')] };
  const m = dayModel(s, '2026-10-14');
  assert.deepEqual(m.rows.map((r: any) => r.kind), ['item', 'item', 'gap']);
});

test('hostile titles stay plain strings', () => {
  const s = { ...structuredClone(example), commitments: [], blocks: [block(480, 540, '<img src=x onerror=alert(1)>', 'study')] };
  assert.equal(dayModel(s, '2026-10-14').rows[0].title, '<img src=x onerror=alert(1)>');
});

test('a state without places or travel still works', () => {
  const s = wed();
  delete s.places;
  assert.doesNotThrow(() => dayModel(s, '2026-10-14'));
});
```

- [ ] **Step 2: Run to see it fail**

Run: `node --test test/frontend/day-model.test.ts`
Expected: FAIL, cannot find module `day-model.js`.

- [ ] **Step 3: Implement `public/js/day-model.js`**

```js
import { GROUP_IDS, groupOfBlock, labelOf, occurrencesOn } from './model.js';
import { WEEKDAYS, isoWeek, shortDate, weekdayOf } from './time.js';

const MIN_GAP = 15;

function busyMinutes(entries, window) {
  let total = 0;
  let cursor = window.start;
  for (const e of [...entries].sort((a, b) => a.start - b.start || a.end - b.end)) {
    const start = Math.max(e.start, cursor, window.start);
    const end = Math.min(e.end, window.end);
    if (end > start) {
      total += end - start;
      cursor = end;
    }
  }
  return total;
}

export function dayModel(state, date, travel = []) {
  const pref = state.preferences;
  const window = pref.daysOff.includes(weekdayOf(date)) ? pref.dayOffWindow : pref.weekdayWindow;
  const entries = [];

  for (const o of occurrencesOn(date, state.commitments)) {
    if (o.bufferBefore > 0) {
      entries.push({ kind: 'buffer', start: Math.max(0, o.start - o.bufferBefore), end: o.start, title: `Buffer before ${o.title}` });
    }
    entries.push({ kind: 'item', group: 'fixed', start: o.start, end: o.end, title: o.title, label: labelOf(o.category) });
  }
  for (const b of state.blocks) {
    if (b.date === date) {
      entries.push({ kind: 'item', group: groupOfBlock(b.category), start: b.start, end: b.end, title: b.title, label: labelOf(b.category) });
    }
  }
  for (const leg of travel) {
    if (leg.date === date) {
      entries.push({ kind: 'travel', start: leg.start, end: leg.end, title: `${leg.fromName} to ${leg.toName}`, label: leg.estimated ? 'estimated' : 'commute' });
    }
  }
  entries.sort((a, b) => a.start - b.start || a.end - b.end);

  const rows = [];
  let cursor = window.start;
  for (const e of entries) {
    if (e.start - cursor >= MIN_GAP && cursor < window.end) rows.push({ kind: 'gap', start: cursor, end: Math.min(e.start, window.end) });
    rows.push(e);
    cursor = Math.max(cursor, e.end);
  }
  if (window.end - cursor >= MIN_GAP) rows.push({ kind: 'gap', start: cursor, end: window.end });

  const totals = Object.fromEntries(GROUP_IDS.map((id) => [id, 0]));
  let booked = 0;
  for (const e of entries) {
    if (e.kind === 'item') {
      totals[e.group] += e.end - e.start;
      booked += e.end - e.start;
    }
  }
  const length = window.end - window.start;
  const free = Math.max(0, Math.min(length, length - busyMinutes(entries, window)));
  const { week, year } = isoWeek(date);
  return {
    date,
    label: `${WEEKDAYS[weekdayOf(date)]} ${Number(date.slice(8))}`,
    week,
    year,
    weekLine: `Week ${week} / ${shortDate(date)} ${date.slice(0, 4)}`,
    booked,
    free,
    window,
    rows,
    totals,
  };
}
```

- [ ] **Step 4: Run model tests**

Run: `node --test test/frontend/day-model.test.ts`
Expected: PASS. If the free-time or gap expectations disagree with the code, work the arithmetic out by hand against board F before changing either side.

- [ ] **Step 5: Write the failing view tests**

Create `test/frontend/day.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDom } from '../../public/js/dom.js';
import { dayModel } from '../../public/js/day-model.js';
import { renderDay } from '../../public/js/day.js';
import { FakeDocument, byClass, byTag, findAll, textOf } from './fakedom.ts';

const dom = createDom(new FakeDocument() as any);
const example = JSON.parse(readFileSync('examples/sample-state.json', 'utf8'));
const block = (start: number, end: number, title: string, category: string) => ({ taskId: title, title, category, date: '2026-10-14', start, end });
const state = () => ({ ...structuredClone(example), blocks: [block(480, 530, 'Chemistry', 'study'), block(585, 620, 'Side project', 'personal project')] });
const key = (root: any, k: string) => findAll(root, (e) => e.getAttribute('data-fk') === k)[0];

function draw(over: any = {}, actionOver: any = {}) {
  const calls: any[] = [];
  const actions = { go: (n: number) => calls.push(['go', n]), today: () => calls.push(['today']), loadExample: () => calls.push(['example']), canAdd: true, ...actionOver };
  const view = { model: dayModel(state(), '2026-10-14'), needsYou: 0, isEmpty: false, prevLabel: 'Tue', nextLabel: 'Thu', ...over };
  return { el: renderDay(dom, view, actions) as any, calls };
}

test('the hero shows the day, stepping buttons name the neighbours, and the meta lines are there', () => {
  const { el, calls } = draw();
  assert.equal(textOf(byTag(el, 'h1')[0]), 'Wed 14');
  assert.deepEqual(byClass(el, 'step')[0].children.map((b: any) => textOf(b)), ['Tue', 'Today', 'Thu']);
  key(el, 'prev').click();
  key(el, 'today').click();
  key(el, 'next').click();
  assert.deepEqual(calls, [['go', -1], ['today'], ['go', 1]]);
  const meta = textOf(byClass(el, 'meta')[0]);
  assert.match(meta, /Week 42 \/ 14 Oct 2026/);
  assert.match(meta, /Booked 1h25/);
  assert.match(meta, /All clear/);
});

test('arrow keys on the title step through days', () => {
  const { el, calls } = draw();
  key(el, 'day-header').dispatch('keydown', { key: 'ArrowRight' });
  key(el, 'day-header').dispatch('keydown', { key: 'ArrowLeft' });
  assert.deepEqual(calls, [['go', 1], ['go', -1]]);
});

test('rows show time, block, duration, gaps and buffers', () => {
  const { el } = draw();
  const text = textOf(el);
  assert.match(text, /08:00–08:50/);
  assert.match(text, /50 min/);
  assert.match(text, /Free 10:20–15:30 \/ 5h10/);
  assert.match(text, /Buffer before Private lesson, Anna/);
  assert.match(text, /Travel and setup/);
  assert.equal(byClass(el, 'dv-buf').length, 1);
  assert.ok(byClass(el, 'g-study').length >= 1);
});

test('the side lists the groups and the free time in the window', () => {
  const { el } = draw();
  const side = textOf(byClass(el, 'dv-side')[0]);
  assert.match(side, /Today by group/);
  assert.match(side, /Fixed.*1h00/);
  assert.match(side, /Study.*0h50/);
  assert.match(side, /Projects and social.*0h35/);
  assert.match(side, /Free in the 08:00–22:00 window/);
  assert.match(textOf(byClass(el, 'dv-free')[0]), /^\d+h\d\d$/);
});

test('needs-you count shows instead of All clear', () => {
  const { el } = draw({ needsYou: 2 });
  assert.match(textOf(byClass(el, 'meta')[0]), /2 need you/);
});

test('travel rows are hatched and named', () => {
  const travel = [{ date: '2026-10-14', start: 900, end: 930, fromName: 'Home', toName: 'Anna', estimated: false }];
  const { el } = draw({ model: dayModel(state(), '2026-10-14', travel) });
  const row = byClass(el, 'travel')[0];
  assert.match(textOf(row), /Home to Anna/);
});

test('a hostile title is text, and an empty schedule offers the example', () => {
  const evil = { ...state(), blocks: [block(480, 530, '<img src=x onerror=alert(1)>', 'study')] };
  const { el } = draw({ model: dayModel(evil, '2026-10-14') });
  assert.match(textOf(el), /<img src=x onerror=alert\(1\)>/);
  assert.equal(findAll(el, (e: any) => e.tag === 'img').length, 0);
  const { el: empty, calls } = draw({ isEmpty: true });
  assert.match(textOf(empty), /Nothing planned yet/);
  key(empty, 'example').click();
  assert.deepEqual(calls, [['example']]);
});
```

- [ ] **Step 6: Run to see them fail**

Run: `node --test test/frontend/day.test.ts`
Expected: FAIL, cannot find module `day.js`.

- [ ] **Step 7: Implement `public/js/day.js`**

```js
import { GROUPS } from './model.js';
import { duration, hhmm } from './time.js';

export function renderDay(dom, view, actions) {
  const { h } = dom;
  const { model, needsYou, isEmpty, prevLabel, nextLabel } = view;

  const range = (r) => `${hhmm(r.start)}–${hhmm(r.end)}`;

  const rowOf = (r) => {
    if (r.kind === 'gap') {
      return h('div', { class: 'dv-gap mono' }, h('span'), h('span', { class: 'line' }, `Free ${range(r)} / ${duration(r.end - r.start)}`), h('span'));
    }
    const length = `${r.end - r.start} min`;
    if (r.kind === 'buffer') {
      return h('div', { class: 'dv-row' },
        h('span', { class: 'dv-rt dashed' }, range(r)),
        h('div', { class: 'dv-blk dv-buf' }, h('span', { class: 'k' }, r.title), h('span', { class: 'k' }, 'Travel and setup')),
        h('span', { class: 'dv-dur' }, length));
    }
    if (r.kind === 'travel') {
      return h('div', { class: 'dv-row' },
        h('span', { class: 'dv-rt' }, range(r)),
        h('div', { class: 'dv-blk travel' }, h('span', { class: 'k' }, r.label), h('span', { class: 'n' }, r.title)),
        h('span', { class: 'dv-dur' }, length));
    }
    return h('div', { class: 'dv-row' },
      h('span', { class: 'dv-rt' }, range(r)),
      h('div', { class: `dv-blk g-${r.group}` }, h('span', { class: 'k' }, r.label), h('span', { class: 'n' }, r.title)),
      h('span', { class: 'dv-dur' }, length));
  };

  const status = needsYou > 0 ? h('span', {}, `${needsYou} need${needsYou === 1 ? 's' : ''} you`) : h('span', {}, 'All clear');

  const hero = h('div', { class: 'hero' },
    h('h1', {
      tabindex: '0',
      'data-fk': 'day-header',
      onkeydown: (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          actions.go(e.key === 'ArrowRight' ? 1 : -1);
        }
      },
    }, model.label),
    h('div', { class: 'right' },
      h('div', { class: 'step mono' },
        h('button', { type: 'button', 'data-fk': 'prev', 'aria-label': 'Previous day', onclick: () => actions.go(-1) }, prevLabel),
        h('button', { type: 'button', 'data-fk': 'today', onclick: () => actions.today() }, 'Today'),
        h('button', { type: 'button', 'data-fk': 'next', 'aria-label': 'Next day', onclick: () => actions.go(1) }, nextLabel)),
      h('div', { class: 'meta mono' }, h('span', {}, model.weekLine), h('span', {}, `Booked ${duration(model.booked)}`), status)));

  if (isEmpty) {
    return h('section', { class: 'dayv' }, hero,
      h('div', { class: 'lead' },
        h('p', {}, 'Nothing planned yet. Start with what is fixed: classes, work, lessons. I plan everything else around it.'),
        h('div', { class: 'cta' },
          h('button', { type: 'button', class: 'btn y', 'data-fk': 'example', onclick: () => actions.loadExample() }, 'Load the example'),
          actions.canAdd && h('a', { class: 'btn', href: '#/commitments/new' }, 'Add a commitment'))));
  }

  const side = h('div', { class: 'dv-side' },
    h('span', { class: 'mono h' }, 'Today by group'),
    GROUPS.map((g) =>
      h('div', { class: 'dv-tot' },
        h('i', { class: `sw g-${g.id}` }),
        h('span', { class: 'nm' }, g.label),
        h('span', { class: 'v' }, duration(model.totals[g.id])))),
    h('span', { class: 'mono dv-cap' }, `Free in the ${hhmm(model.window.start)}–${hhmm(model.window.end)} window`),
    h('span', { class: 'dv-free' }, duration(model.free)));

  return h('section', { class: 'dayv' }, hero,
    h('div', { class: 'dv-body' }, h('div', { class: 'dv-list' }, model.rows.map(rowOf)), side));
}
```

- [ ] **Step 8: Styles**

Append to `public/css/app.css`:

```css
/* Day */
.dv-body { display: flex; gap: 56px; margin: 34px 40px 0; }
.dv-list { width: 900px; max-width: 100%; display: flex; flex-direction: column; gap: 8px; }
.dv-row { display: grid; grid-template-columns: 170px 1fr 90px; align-items: stretch; gap: 14px; }
.dv-rt { font-family: var(--font-mono); font-size: 18px; letter-spacing: .02em; padding-top: 12px; border-top: 4px solid var(--ink); }
.dv-rt.dashed { border-top: 2px dashed var(--ink); }
.dv-blk { padding: 12px 16px 14px; display: flex; flex-direction: column; justify-content: space-between; min-height: 62px; }
.dv-blk .k { font-family: var(--font-mono); font-size: 10px; letter-spacing: .1em; text-transform: uppercase; opacity: .85; }
.dv-blk .n { font-size: 30px; font-weight: 800; letter-spacing: -.03em; line-height: 1; overflow-wrap: anywhere; }
.dv-blk.g-outline { padding: 10px 14px 12px; }
.dv-buf { border: 2px dashed var(--ink); padding: 10px 14px; min-height: 0; flex-direction: row; align-items: center; justify-content: space-between; }
.dv-dur { font-family: var(--font-mono); font-size: 12px; color: var(--muted); padding-top: 14px; text-align: right; }
.dv-gap { display: grid; grid-template-columns: 170px 1fr 90px; gap: 14px; color: var(--muted); }
.dv-gap .line { border-top: 1px solid #B9B4A6; padding-top: 8px; }
.dv-side { flex: 1; min-width: 240px; display: flex; flex-direction: column; gap: 6px; }
.dv-side .h { border-top: 4px solid var(--ink); padding-top: 10px; margin-bottom: 6px; }
.dv-tot { display: flex; align-items: center; gap: 10px; padding: 5px 0; border-bottom: 1px solid #D4CFC1; }
.dv-tot .sw { width: 16px; height: 16px; flex: none; display: inline-block; padding: 0; }
.dv-tot .nm { flex: 1; font-size: 15px; font-weight: 600; }
.dv-tot .v { font-family: var(--font-mono); font-size: 13px; }
.dv-cap { margin-top: 22px; color: var(--muted); }
.dv-free { font-size: 84px; font-weight: 800; letter-spacing: -.05em; line-height: .9; }
@media (max-width: 1100px) {
  .dv-body { flex-direction: column; }
  .dv-row, .dv-gap { grid-template-columns: 120px 1fr 70px; }
}
```

- [ ] **Step 9: Run and commit**

Run: `npm test` (green).

```bash
git add -A public test
git commit -m "feat: the Day screen model and view

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015g9zWNaWwq6C6AoikFwJmf"
```

---

### Task 2: The Deadlines screen

**Files:**
- Create: `public/js/deadlines-model.js`, `public/js/deadlines.js`
- Modify: `public/css/app.css`
- Test: `test/frontend/deadlines-model.test.ts`, `test/frontend/deadlines.test.ts`

**Interfaces:**
- Consumes: `labelOf` from `model.js`; `addDays`, `daysBetween`, `duration`, `longDate`, `weekdayOf`, `WEEKDAYS`, `MONTHS`, `shortDate` from `time.js`.
- Produces: `deadlinesModel(state, clock) -> { rows, open, shorts }` where `clock = { today, nowMinutes, horizonDays }` and each row is `{ id, day, month, weekday, daysLabel, title, sub, effort, done, planned, short, status: 'short' | 'covered' | 'later', doneW, plannedW, shortW }` (widths are percentages of the bar); `renderDeadlines(dom, view)` with `view = { model, isEmpty }`.

- [ ] **Step 1: Write the failing model tests**

Create `test/frontend/deadlines-model.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deadlinesModel } from '../../public/js/deadlines-model.js';

const clock = { today: '2026-10-09', nowMinutes: 600, horizonDays: 14 };
const task = (id: string, title: string, category = 'study') => ({ id, title, category, weeklyMinutes: null, maxBlock: 90, onePerDay: false, priority: 3 });
const dl = (id: string, taskId: string, dueDate: string, effortMinutes: number, kind = 'exam') => ({ id, taskId, kind, dueDate, effortMinutes });
const blk = (deadlineId: string, date: string, start: number, end: number) => ({ taskId: 't', title: 'x', category: 'study', date, start, end, deadlineId });
const base = (over: any = {}) => ({ tasks: [task('chem', 'Chemistry'), task('tax', 'Taxes', 'errands')], deadlines: [], blocks: [], ...over });

test('open due dates are listed soonest first with a plain count', () => {
  const m = deadlinesModel(base({ deadlines: [dl('b', 'chem', '2026-10-23', 480), dl('a', 'tax', '2026-10-19', 120, 'task'), dl('old', 'chem', '2026-10-01', 60)] }), clock);
  assert.deepEqual(m.rows.map((r: any) => r.id), ['a', 'b']);
  assert.equal(m.open, 2);
});

test('a row names the date, the days left, the title and the task', () => {
  const m = deadlinesModel(base({ deadlines: [dl('b', 'chem', '2026-10-23', 480)] }), clock);
  const r = m.rows[0];
  assert.deepEqual([r.day, r.month, r.weekday, r.daysLabel], [23, 'Oct', 'Fri', 'in 14 days']);
  assert.equal(r.title, 'Chemistry exam');
  assert.equal(r.sub, 'Study / Chemistry');
  assert.equal(deadlinesModel(base({ deadlines: [dl('t', 'chem', '2026-10-09', 60)] }), clock).rows[0].daysLabel, 'today');
  assert.equal(deadlinesModel(base({ deadlines: [dl('t', 'chem', '2026-10-10', 60)] }), clock).rows[0].daysLabel, 'tomorrow');
});

test('done, planned and short minutes follow the board, split at the current minute', () => {
  const blocks = [
    blk('b', '2026-10-08', 480, 540),
    blk('b', '2026-10-09', 540, 600),
    blk('b', '2026-10-09', 700, 760),
    blk('b', '2026-10-12', 480, 570),
    blk('other', '2026-10-12', 480, 570),
  ];
  const m = deadlinesModel(base({ deadlines: [dl('b', 'chem', '2026-10-23', 480)], blocks }), clock);
  const r = m.rows[0];
  assert.deepEqual([r.done, r.planned, r.short], [120, 150, 210]);
  assert.equal(r.status, 'short');
  assert.equal(m.shorts, 1);
  assert.ok(Math.abs(r.doneW + r.plannedW + r.shortW - 100) < 0.001);
});

test('a covered due date has no short part', () => {
  const m = deadlinesModel(base({ deadlines: [dl('b', 'tax', '2026-10-19', 120, 'task')], blocks: [blk('b', '2026-10-12', 480, 600)] }), clock);
  assert.equal(m.rows[0].status, 'covered');
  assert.equal(m.rows[0].short, 0);
  assert.equal(m.rows[0].title, 'Taxes task');
  assert.equal(m.shorts, 0);
});

test('more planned than needed still fills the bar to 100 at most', () => {
  const m = deadlinesModel(base({ deadlines: [dl('b', 'chem', '2026-10-12', 60)], blocks: [blk('b', '2026-10-10', 480, 720)] }), clock);
  const r = m.rows[0];
  assert.equal(r.short, 0);
  assert.ok(r.doneW + r.plannedW + r.shortW <= 100.001);
});

test('effort 0 is covered, a due date beyond the plan window is later and never short', () => {
  const zero = deadlinesModel(base({ deadlines: [dl('z', 'chem', '2026-10-12', 0)] }), clock).rows[0];
  assert.equal(zero.status, 'covered');
  assert.deepEqual([zero.doneW, zero.plannedW, zero.shortW], [0, 0, 0]);
  const far = deadlinesModel(base({ deadlines: [dl('f', 'chem', '2026-12-01', 600)] }), clock);
  assert.equal(far.rows[0].status, 'later');
  assert.equal(far.rows[0].short, 0);
  assert.equal(far.shorts, 0);
});

test('a due date whose task was deleted still lists without crashing', () => {
  const m = deadlinesModel(base({ tasks: [], deadlines: [dl('x', 'gone', '2026-10-12', 60)] }), clock);
  assert.equal(m.rows[0].title, 'Unknown task exam');
  assert.equal(m.rows[0].sub, 'Unknown task');
});
```

- [ ] **Step 2: Run to see it fail**

Run: `node --test test/frontend/deadlines-model.test.ts`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement `public/js/deadlines-model.js`**

```js
import { labelOf } from './model.js';
import { WEEKDAYS, MONTHS, addDays, daysBetween, weekdayOf } from './time.js';

const sum = (blocks) => blocks.reduce((t, b) => t + (b.end - b.start), 0);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function daysLabel(n) {
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  return `in ${n} days`;
}

export function deadlinesModel(state, clock) {
  const { today, nowMinutes, horizonDays } = clock;
  const last = addDays(today, horizonDays - 1);
  const finished = (b) => b.date < today || (b.date === today && b.end <= nowMinutes);

  const rows = state.deadlines
    .filter((d) => d.dueDate >= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id))
    .map((d) => {
      const task = state.tasks.find((t) => t.id === d.taskId);
      const mine = state.blocks.filter((b) => b.deadlineId === d.id);
      const done = sum(mine.filter(finished));
      const planned = sum(mine.filter((b) => !finished(b)));
      const beyond = d.dueDate > last;
      const short = beyond ? 0 : Math.max(0, d.effortMinutes - done - planned);
      const status = beyond ? 'later' : short > 0 ? 'short' : 'covered';
      const total = Math.max(d.effortMinutes, done + planned, 1);
      const pct = (m) => (d.effortMinutes === 0 && done + planned === 0 ? 0 : (m / total) * 100);
      return {
        id: d.id,
        day: Number(d.dueDate.slice(8)),
        month: MONTHS[Number(d.dueDate.slice(5, 7)) - 1],
        weekday: WEEKDAYS[weekdayOf(d.dueDate)],
        daysLabel: daysLabel(daysBetween(today, d.dueDate)),
        title: `${task ? task.title : 'Unknown task'} ${d.kind}`,
        sub: task ? `${cap(labelOf(task.category))} / ${task.title}` : 'Unknown task',
        effort: d.effortMinutes,
        done,
        planned,
        short,
        status,
        doneW: pct(done),
        plannedW: pct(planned),
        shortW: pct(short),
      };
    });
  return { rows, open: rows.length, shorts: rows.filter((r) => r.status === 'short').length };
}
```

- [ ] **Step 4: Run model tests, then write the view tests**

Run: `node --test test/frontend/deadlines-model.test.ts` (PASS). Then create `test/frontend/deadlines.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDom } from '../../public/js/dom.js';
import { deadlinesModel } from '../../public/js/deadlines-model.js';
import { renderDeadlines } from '../../public/js/deadlines.js';
import { FakeDocument, byClass, byTag, findAll, textOf } from './fakedom.ts';

const dom = createDom(new FakeDocument() as any);
const clock = { today: '2026-10-09', nowMinutes: 600, horizonDays: 14 };
const blk = (deadlineId: string, date: string, start: number, end: number) => ({ taskId: 't', title: 'x', category: 'study', date, start, end, deadlineId });
const state = (over: any = {}) => ({
  tasks: [{ id: 'chem', title: 'Chemistry', category: 'study' }, { id: 'tax', title: 'Taxes', category: 'errands' }],
  deadlines: [
    { id: 'exam', taskId: 'chem', kind: 'exam', dueDate: '2026-10-23', effortMinutes: 480 },
    { id: 'tax', taskId: 'tax', kind: 'task', dueDate: '2026-10-19', effortMinutes: 120 },
  ],
  blocks: [blk('exam', '2026-10-08', 480, 600), blk('exam', '2026-10-12', 480, 750), blk('tax', '2026-10-12', 480, 600)],
  ...over,
});
const draw = (s = state(), over: any = {}) => renderDeadlines(dom, { model: deadlinesModel(s, clock), isEmpty: false, ...over }) as any;

test('the hero says how many are open and how many are short', () => {
  const el = draw();
  assert.equal(textOf(byTag(el, 'h1')[0]), 'Deadlines');
  const meta = textOf(byClass(el, 'meta')[0]);
  assert.match(meta, /2 open/);
  assert.match(meta, /1 short/);
});

test('each row has the date, title, bar numbers and a chip', () => {
  const el = draw();
  const rows = byClass(el, 'dl');
  assert.equal(rows.length, 2);
  assert.match(textOf(rows[0]), /19.*Oct.*Mon.*in 10 days/);
  assert.match(textOf(rows[0]), /Taxes task/);
  assert.match(textOf(rows[0]), /Covered/);
  assert.match(textOf(rows[1]), /Chemistry exam/);
  assert.match(textOf(rows[1]), /Done 2h00/);
  assert.match(textOf(rows[1]), /Planned 4h30/);
  assert.match(textOf(rows[1]), /Short 1h30/);
  assert.match(textOf(rows[1]), /Short 90 min/);
});

test('the bar is drawn with SVG shapes only, never a style attribute', () => {
  const el = draw();
  const svgs = findAll(el, (e: any) => e.tag === 'svg' && e.hasClass('dl-bar'));
  assert.equal(svgs.length, 2);
  assert.equal(findAll(el, (e: any) => e.getAttribute('style') !== null).length, 0);
  const shapes = findAll(svgs[1], (e: any) => e.tag === 'rect');
  assert.deepEqual(shapes.map((r: any) => r.getAttribute('class')), ['dl-done', 'dl-plan', 'dl-short']);
  const widths = shapes.map((r: any) => Number(r.getAttribute('width')));
  assert.ok(Math.abs(widths.reduce((a: number, b: number) => a + b, 0) - 100) < 0.01);
});

test('a due date beyond the plan window says Later, not Short', () => {
  const far = state({ deadlines: [{ id: 'f', taskId: 'chem', kind: 'exam', dueDate: '2026-12-01', effortMinutes: 600 }], blocks: [] });
  const el = draw(far);
  assert.match(textOf(byClass(el, 'dl')[0]), /Later/);
  assert.doesNotMatch(textOf(byClass(el, 'meta')[0]), /short/);
});

test('with no due dates the screen points at Setup, and hostile titles stay text', () => {
  const empty = draw(state({ deadlines: [] }));
  assert.match(textOf(empty), /No due dates yet/);
  assert.equal(findAll(empty, (e: any) => e.tag === 'a' && e.getAttribute('href') === '#/due-dates/new').length, 1);
  const evil = draw(state({ tasks: [{ id: 'chem', title: '<img src=x onerror=alert(1)>', category: 'study' }] }));
  assert.match(textOf(evil), /<img src=x onerror=alert\(1\)> exam/);
  assert.equal(findAll(evil, (e: any) => e.tag === 'img').length, 0);
});
```

- [ ] **Step 5: Implement `public/js/deadlines.js` and styles**

```js
import { duration } from './time.js';

export function renderDeadlines(dom, view) {
  const { h, svg } = dom;
  const { model } = view;

  const bar = (r) =>
    svg('svg', { class: 'dl-bar', viewBox: '0 0 100 1', preserveAspectRatio: 'none', role: 'img', 'aria-label': `Done ${duration(r.done)}, planned ${duration(r.planned)}, short ${duration(r.short)}` },
      svg('rect', { class: 'dl-done', x: 0, y: 0, width: r.doneW, height: 1 }),
      svg('rect', { class: 'dl-plan', x: r.doneW, y: 0, width: r.plannedW, height: 1 }),
      svg('rect', { class: 'dl-short', x: r.doneW + r.plannedW, y: 0, width: r.shortW, height: 1 }));

  const chip = (r) =>
    r.status === 'short' ? h('span', { class: 'dl-chip bad mono' }, `Short ${r.short} min`)
      : r.status === 'later' ? h('span', { class: 'dl-chip ok mono' }, 'Later')
        : h('span', { class: 'dl-chip ok mono' }, 'Covered');

  const row = (r) =>
    h('div', { class: 'dl' },
      h('div', { class: 'dl-when' }, h('span', { class: 'dl-big' }, r.day), h('span', { class: 'mono' }, `${r.month} / ${r.weekday}`, h('br'), r.daysLabel)),
      h('div', {}, h('div', { class: 'dl-tt' }, r.title), h('div', { class: 'dl-sub mono' }, r.sub)),
      h('div', {},
        bar(r),
        h('div', { class: 'dl-nums mono' },
          h('span', {}, `Done ${duration(r.done)}`),
          h('span', {}, `Planned ${duration(r.planned)}`),
          h('span', { class: r.short > 0 ? 'dl-bad' : '' }, `Short ${duration(r.short)}`))),
      h('div', { class: 'dl-end' }, chip(r)));

  const hero = h('div', { class: 'hero' },
    h('h1', {}, 'Deadlines'),
    h('div', { class: 'meta mono' }, h('span', {}, `${model.open} open`), model.shorts > 0 && h('span', { class: 'dl-bad' }, `${model.shorts} short`)));

  if (model.rows.length === 0) {
    return h('section', { class: 'deadlines' }, hero,
      h('div', { class: 'lead' },
        h('p', {}, 'No due dates yet. Add an exam or an assignment and I plan study time for it.'),
        h('div', { class: 'cta' }, h('a', { class: 'btn y', href: '#/due-dates/new' }, 'Add a due date'))));
  }
  return h('section', { class: 'deadlines' }, hero, h('div', { class: 'dl-list' }, model.rows.map(row)));
}
```

(`isEmpty` is not used here: a schedule with no due dates shows the same pointer whether or not anything else exists.)

Append to `public/css/app.css`:

```css
/* Deadlines */
.dl-list { margin: 36px 40px 0; display: flex; flex-direction: column; }
.dl { display: grid; grid-template-columns: 200px 360px 1fr 210px; gap: 28px; align-items: center; border-top: 4px solid var(--ink); padding: 16px 0 18px; }
.dl:last-child { border-bottom: 4px solid var(--ink); }
.dl-when { display: flex; align-items: baseline; gap: 10px; }
.dl-big { font-size: 84px; font-weight: 800; letter-spacing: -.05em; line-height: .85; }
.dl-tt { font-size: 34px; font-weight: 800; letter-spacing: -.03em; line-height: 1; overflow-wrap: anywhere; }
.dl-sub { margin-top: 8px; color: var(--muted); }
.dl-bar { display: block; width: 100%; height: 28px; }
.dl-done { fill: var(--ink); }
.dl-plan { fill: var(--study); }
.dl-short { fill: none; stroke: var(--study); stroke-width: 2; stroke-dasharray: 4 3; vector-effect: non-scaling-stroke; }
.dl-nums { display: flex; justify-content: space-between; margin-top: 10px; color: var(--muted); }
.dl-bad { color: var(--ink); font-weight: 600; }
.dl-end { text-align: right; }
.dl-chip { display: inline-block; padding: 10px 14px; text-align: center; font-weight: 600; }
.dl-chip.bad { background: var(--study); color: var(--on-study); }
.dl-chip.ok { border: 2px solid var(--ink); padding: 8px 12px; }
@media (max-width: 1100px) {
  .dl { grid-template-columns: 1fr; gap: 12px; }
  .dl-end { text-align: left; }
}
```

Note: the board colours the "Short" numbers vermilion; on the paper background that text fails contrast, so the build uses bold ink and keeps the vermilion in the bar and chip. Ledger this as a `Ruling:`.

- [ ] **Step 6: Run and commit**

Run: `npm test` (green).

```bash
git add -A public test
git commit -m "feat: the Deadlines screen model and view

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015g9zWNaWwq6C6AoikFwJmf"
```

---

### Task 3: Settings

**Files:**
- Create: `public/js/ui-prefs.js`, `public/js/settings.js`
- Modify: `public/css/app.css`
- Test: `test/frontend/ui-prefs.test.ts`, `test/frontend/settings.test.ts`

**Interfaces:**
- Consumes: `store.saveState(fn)`, `store.get()` (fields `state`, `busy`, `formError`); `dom.h`.
- Produces: `createUiPrefs(win) -> { supported(), permission(), notify(), enableNotify(): Promise<'granted'|'denied'|'default'|'unsupported'>, disableNotify() }`; `SETTINGS_GROUPS`, `SETTINGS` (declared rows `{ id, group, title, description, options: [{ value, label, disabled?, tag? }], read(ctx), write(ctx, value), hint?(ctx) }`); `createSettings(dom, { store, ui, keepFocus })` returning `{ render(ctx) }` where `ctx = { s, route }`.

- [ ] **Step 1: Write the failing tests**

Create `test/frontend/ui-prefs.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUiPrefs } from '../../public/js/ui-prefs.js';

function win(permission = 'default', answer = 'granted', store: Record<string, string> | null = {}) {
  const storage = store === null ? undefined : {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = v; },
  };
  const Notification: any = function () {};
  Notification.permission = permission;
  Notification.requestPermission = async () => { Notification.permission = answer; return answer; };
  return { Notification, localStorage: storage, asked: () => Notification.permission };
}

test('notifications are off until the person turns them on and the browser allows it', async () => {
  const w = win();
  const ui = createUiPrefs(w as any);
  assert.equal(ui.supported(), true);
  assert.equal(ui.notify(), false);
  assert.equal(await ui.enableNotify(), 'granted');
  assert.equal(ui.notify(), true);
  assert.equal(createUiPrefs(w as any).notify(), true, 'the choice survives a reload');
  ui.disableNotify();
  assert.equal(ui.notify(), false);
  assert.equal(createUiPrefs(w as any).notify(), false);
});

test('a refusal leaves notifications off and says why', async () => {
  const ui = createUiPrefs(win('default', 'denied') as any);
  assert.equal(await ui.enableNotify(), 'denied');
  assert.equal(ui.notify(), false);
  const blocked = createUiPrefs(win('denied') as any);
  assert.equal(await blocked.enableNotify(), 'denied');
  assert.equal(blocked.notify(), false);
});

test('a browser without notifications is reported, never crashes', async () => {
  const ui = createUiPrefs({} as any);
  assert.equal(ui.supported(), false);
  assert.equal(ui.permission(), 'unsupported');
  assert.equal(await ui.enableNotify(), 'unsupported');
  assert.equal(ui.notify(), false);
});

test('blocked storage still works for the length of the page', async () => {
  const w: any = win('granted', 'granted', null);
  const ui = createUiPrefs(w);
  assert.equal(await ui.enableNotify(), 'granted');
  assert.equal(ui.notify(), true);
  const throwing: any = { ...win('granted'), localStorage: { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } } };
  const ui2 = createUiPrefs(throwing);
  assert.equal(ui2.notify(), false);
  assert.equal(await ui2.enableNotify(), 'granted');
  assert.equal(ui2.notify(), true);
});

test('a choice stored as On does not notify once the browser permission is gone', () => {
  const w = win('denied', 'denied', { 'doitwithme.notify': 'on' });
  assert.equal(createUiPrefs(w as any).notify(), false);
});
```

Create `test/frontend/settings.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDom } from '../../public/js/dom.js';
import { SETTINGS, SETTINGS_GROUPS, createSettings } from '../../public/js/settings.js';
import { FakeDocument, byClass, byTag, findAll, textOf } from './fakedom.ts';

const tick = () => new Promise((r) => setTimeout(r, 0));
const key = (root: any, k: string) => findAll(root, (e) => e.getAttribute('data-fk') === k)[0];

function setup(opts: any = {}) {
  const saves: any[] = [];
  let softMode = opts.softMode ?? 'ask';
  let notify = false;
  const permission = opts.permission ?? 'default';
  const store: any = {
    get: () => ({ state: { preferences: { softMode } }, busy: opts.busy ?? false, formError: opts.formError ?? null, status: 'ready' }),
    saveState: async (fn: any) => {
      const next = fn({ preferences: { softMode: 'ask', minBreak: 10 }, tasks: [1] });
      saves.push(next);
      if (!opts.reject) softMode = next.preferences.softMode;
    },
  };
  const ui: any = {
    supported: () => permission !== 'unsupported',
    permission: () => permission,
    notify: () => notify,
    enableNotify: async () => { if (opts.answer === 'granted') notify = true; return opts.answer ?? 'denied'; },
    disableNotify: () => { notify = false; },
  };
  const dom = createDom(new FakeDocument() as any);
  const settings = createSettings(dom, { store, ui, keepFocus: (fn: Function) => fn() });
  const draw = (param: string | null = null) => settings.render({ s: store.get(), route: { id: 'settings', param } }) as any;
  return { settings, draw, saves, ui, store };
}

test('the screen shows the three groups, the Light theme and a dimmed Dark marked Later', () => {
  const { draw } = setup();
  const el = draw();
  assert.equal(textOf(byTag(el, 'h1')[0]), 'Settings');
  assert.deepEqual(SETTINGS_GROUPS.map((g) => g.title), ['Appearance', 'Notifications', 'Planner']);
  const text = textOf(el);
  for (const t of ['Theme', 'System notifications', 'Soft time', 'Later']) assert.match(text, new RegExp(t));
  const dark = key(el, 'set-theme-dark');
  assert.notEqual(dark.getAttribute('disabled'), null);
  assert.equal(key(el, 'set-theme-light').getAttribute('aria-pressed'), 'true');
});

test('the sub-navigation links to each group and marks the current one', () => {
  const { draw } = setup();
  const links = (el: any) => byClass(el, 'sub')[0].children.filter((c: any) => c.tag === 'a');
  assert.deepEqual(links(draw()).map((l: any) => l.getAttribute('href')), ['#/settings/appearance', '#/settings/notifications', '#/settings/planner']);
  const el = draw('notifications');
  assert.equal(links(el).find((l: any) => textOf(l) === 'Notifications').getAttribute('aria-current'), 'page');
});

test('soft time saves through the freshest copy and changes only that preference', async () => {
  const { draw, saves } = setup();
  const el = draw();
  assert.equal(key(el, 'set-softMode-ask').getAttribute('aria-pressed'), 'true');
  key(el, 'set-softMode-auto').click();
  await tick();
  assert.equal(saves.length, 1);
  assert.deepEqual(saves[0], { preferences: { softMode: 'auto', minBreak: 10 }, tasks: [1] });
  assert.equal(key(draw(), 'set-softMode-auto').getAttribute('aria-pressed'), 'true');
});

test('a rejected soft time save keeps the old value shown and says so', async () => {
  const { draw, saves } = setup({ reject: true, formError: 'preferences.softMode must be "ask" or "auto"' });
  const el = draw();
  key(el, 'set-softMode-auto').click();
  await tick();
  assert.equal(saves.length, 1);
  const again = draw();
  assert.equal(key(again, 'set-softMode-ask').getAttribute('aria-pressed'), 'true');
  assert.match(textOf(byClass(again, 'err')[0]), /Nothing was saved\./);
});

test('segments are disabled while a save runs', () => {
  const { draw } = setup({ busy: true });
  assert.notEqual(key(draw(), 'set-softMode-auto').getAttribute('disabled'), null);
});

test('turning notifications on asks the browser and only sticks when it agrees', async () => {
  const granted = setup({ answer: 'granted' });
  const el = granted.draw();
  assert.equal(key(el, 'set-notifications-off').getAttribute('aria-pressed'), 'true');
  assert.match(textOf(el), /Your browser will ask for permission/);
  key(el, 'set-notifications-on').click();
  await tick();
  assert.equal(key(granted.draw(), 'set-notifications-on').getAttribute('aria-pressed'), 'true');
  key(granted.draw(), 'set-notifications-off').click();
  await tick();
  assert.equal(key(granted.draw(), 'set-notifications-off').getAttribute('aria-pressed'), 'true');
});

test('a refusal or an unsupported browser is explained and the switch stays Off', async () => {
  const denied = setup({ permission: 'denied', answer: 'denied' });
  assert.match(textOf(denied.draw()), /Notifications are blocked/);
  key(denied.draw(), 'set-notifications-on').click();
  await tick();
  assert.equal(key(denied.draw(), 'set-notifications-off').getAttribute('aria-pressed'), 'true');
  const none = setup({ permission: 'unsupported' });
  assert.match(textOf(none.draw()), /cannot show notifications/);
  assert.notEqual(key(none.draw(), 'set-notifications-on').getAttribute('disabled'), null);
});

test('every declared row has a title, a sentence and options, and writes through one function', () => {
  for (const row of SETTINGS) {
    assert.ok(row.title && row.description.endsWith('.') && row.options.length >= 2, row.id);
    assert.ok(SETTINGS_GROUPS.some((g) => g.id === row.group), row.id);
  }
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/frontend/ui-prefs.test.ts test/frontend/settings.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement `public/js/ui-prefs.js`**

```js
const KEY = 'doitwithme.notify';

export function createUiPrefs(win) {
  const read = () => {
    try {
      return Boolean(win.localStorage) && win.localStorage.getItem(KEY) === 'on';
    } catch {
      return false;
    }
  };
  const write = (on) => {
    try {
      if (win.localStorage) win.localStorage.setItem(KEY, on ? 'on' : 'off');
    } catch {
      // Storage can be blocked; the choice then lasts until the page closes.
    }
  };
  let on = read();
  const supported = () => typeof win.Notification === 'function';
  const permission = () => (supported() ? win.Notification.permission : 'unsupported');
  return {
    supported,
    permission,
    notify: () => on && permission() === 'granted',
    async enableNotify() {
      if (!supported()) return 'unsupported';
      let answer = win.Notification.permission;
      if (answer === 'default') answer = await win.Notification.requestPermission();
      if (answer === 'granted') {
        on = true;
        write(true);
      }
      return answer;
    },
    disableNotify() {
      on = false;
      write(false);
    },
  };
}
```

- [ ] **Step 4: Implement `public/js/settings.js`**

```js
export const SETTINGS_GROUPS = [
  { id: 'appearance', title: 'Appearance' },
  { id: 'notifications', title: 'Notifications' },
  { id: 'planner', title: 'Planner' },
];

const permissionHint = (ctx) => {
  const p = ctx.ui.permission();
  if (p === 'unsupported') return 'This browser cannot show notifications';
  if (p === 'denied') return "Notifications are blocked. Allow them in your browser's site settings, then try again.";
  return 'Your browser will ask for permission';
};

export const SETTINGS = [
  {
    id: 'theme', group: 'appearance', title: 'Theme',
    description: 'Light is the only theme for now. Dark is planned and will appear here.',
    options: [{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark', disabled: true, tag: 'Later' }],
    read: () => 'light',
    write: null,
  },
  {
    id: 'notifications', group: 'notifications', title: 'System notifications',
    description: 'A browser notification when a new warning appears while this tab is hidden. Nothing is sent when the app is closed.',
    options: [{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }],
    read: (ctx) => (ctx.ui.notify() ? 'on' : 'off'),
    disabledValues: (ctx) => (ctx.ui.supported() ? [] : ['on']),
    write: async (ctx, value) => {
      if (value === 'on') await ctx.ui.enableNotify();
      else ctx.ui.disableNotify();
    },
    hint: permissionHint,
  },
  {
    id: 'softMode', group: 'planner', title: 'Soft time',
    description: 'Friday and Saturday evenings. Ask first keeps them free until you say yes. Automatic uses them for study as a last resort and tells you.',
    options: [{ value: 'ask', label: 'Ask first' }, { value: 'auto', label: 'Automatic' }],
    read: (ctx) => ctx.s.state.preferences.softMode,
    write: (ctx, value) =>
      ctx.store.saveState((fresh) => ({ ...fresh, preferences: { ...fresh.preferences, softMode: value } })),
  },
];

export function createSettings(dom, deps) {
  const { h, clear } = dom;
  const { store, ui, keepFocus } = deps;
  let container = null;
  let current = null;

  const ctxOf = () => ({ s: store.get(), store, ui });

  function rerender() {
    current = { ...current, s: store.get() };
    keepFocus(() => clear(container, build()));
  }

  async function choose(row, value) {
    if (!row.write || row.read(ctxOf()) === value) return;
    await row.write(ctxOf(), value);
    rerender();
  }

  function rowEl(row) {
    const ctx = ctxOf();
    const value = row.read(ctx);
    const off = row.disabledValues ? row.disabledValues(ctx) : [];
    const busy = ctx.s.busy;
    return h('div', { class: 'st' },
      h('b', {}, row.title),
      h('p', {}, row.description),
      h('div', { class: 'seg mono', role: 'group', 'aria-label': row.title },
        row.options.map((o) =>
          h('button', {
            type: 'button', class: value === o.value ? 'on' : '', 'aria-pressed': String(value === o.value),
            'data-fk': `set-${row.id}-${o.value}`, disabled: Boolean(o.disabled) || off.includes(o.value) || busy,
            onclick: () => choose(row, o.value),
          }, o.label, o.tag && h('span', { class: 'tag' }, o.tag)))),
      row.hint && h('div', { class: 'hint mono' }, row.hint(ctx)));
  }

  function build() {
    const { route, s } = current;
    const active = SETTINGS_GROUPS.some((g) => g.id === route.param) ? route.param : 'appearance';
    return [
      h('div', { class: 'hero' },
        h('h1', {}, 'Settings'),
        h('div', { class: 'sub mono' }, SETTINGS_GROUPS.map((g) =>
          h('a', { href: `#/settings/${g.id}`, 'aria-current': g.id === active ? 'page' : null }, g.title)))),
      s.formError && h('div', { class: 'err st-err', role: 'alert' }, h('b', {}, 'Nothing was saved.'), h('span', { class: 'mono msg' }, s.formError)),
      h('div', { class: 'st-groups' }, SETTINGS_GROUPS.map((g) =>
        h('div', { class: 'st-grp' },
          h('span', { class: 'mono st-gh' }, g.title),
          h('div', { class: 'st-rows' }, SETTINGS.filter((r) => r.group === g.id).map(rowEl))))),
    ];
  }

  return {
    render(ctx) {
      current = ctx;
      container = h('section', { class: 'settings' });
      clear(container, build());
      return container;
    },
  };
}
```

- [ ] **Step 5: Styles**

Append to `public/css/app.css`:

```css
/* Settings */
.st-groups { margin: 30px 40px 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 36px; }
.st-grp { border-top: 4px solid var(--ink); padding-top: 12px; }
.st-gh { display: block; margin-bottom: 14px; }
.st-rows { display: flex; flex-direction: column; gap: 18px; }
.st-err { margin: 24px 40px 0; }
.st b { display: block; font-size: 24px; font-weight: 800; letter-spacing: -.03em; line-height: 1.05; }
.st p { margin: 6px 0 12px; font-size: 14px; line-height: 1.4; color: var(--muted); max-width: 380px; }
.st .seg { width: 300px; max-width: 100%; }
.st .seg button { height: 42px; font-size: 13px; }
.st .seg button:disabled { border-style: solid; border-color: #B9B4A6; color: #8C887D; display: flex; align-items: center; justify-content: center; gap: 8px; }
.st .hint { margin: 8px 0 0; color: var(--muted); }
.tag { font-family: var(--font-mono); font-size: 10px; letter-spacing: .08em; text-transform: uppercase; border: 1px solid #B9B4A6; padding: 2px 5px; }
@media (max-width: 1100px) { .st-groups { grid-template-columns: 1fr; } }
```

If `.err` is not defined outside the Setup scope, check with `grep -n "^\.err\|\.setup \.err" public/css/app.css` and, when it is scoped to `.setup`, change the selector to apply to `.err` generally (do not duplicate the rules).

- [ ] **Step 6: Run and commit**

Run: `npm test` (green).

```bash
git add -A public test
git commit -m "feat: the Settings screen and the notification choice

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015g9zWNaWwq6C6AoikFwJmf"
```

---

### Task 4: Notifier

**Files:**
- Create: `public/js/notify.js`
- Test: `test/frontend/notify.test.ts`

**Interfaces:**
- Consumes: `ui.notify()` (Task 3); nudge items from `buildNudge(warnings).items` (`{ key, headline }`).
- Produces: `createNotifier({ ui, win, doc }) -> { observe(s, items) -> string[] }` returning the keys it announced.

- [ ] **Step 1: Write the failing tests**

Create `test/frontend/notify.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNotifier } from '../../public/js/notify.js';

const item = (key: string, headline = `Headline ${key}`) => ({ key, headline });
const ready = { status: 'ready', state: {}, isEmpty: false };

function rig(over: any = {}) {
  const shown: any[] = [];
  const win: any = { Notification: function (title: string, opts: any) { shown.push([title, opts]); } };
  const doc: any = { visibilityState: over.visibility ?? 'hidden' };
  const ui: any = { notify: () => over.on ?? true };
  return { n: createNotifier({ ui, win, doc }), shown, doc, ui: over };
}

test('the first look at the plan only learns what is already there', () => {
  const { n, shown } = rig();
  assert.deepEqual(n.observe(ready, [item('a'), item('b')]), []);
  assert.equal(shown.length, 0);
});

test('a new warning while the tab is hidden is announced once, as plain text', () => {
  const { n, shown } = rig();
  n.observe(ready, [item('a')]);
  assert.deepEqual(n.observe(ready, [item('a'), item('b', '<b>Chemistry</b> is short')]), ['b']);
  assert.deepEqual(shown, [['doitwithme', { body: '<b>Chemistry</b> is short', tag: 'b' }]]);
  assert.deepEqual(n.observe(ready, [item('a'), item('b')]), []);
  assert.equal(shown.length, 1);
});

test('nothing is shown while the tab is visible, but the warning is not announced later either', () => {
  const r = rig({ visibility: 'visible' });
  r.n.observe(ready, []);
  assert.deepEqual(r.n.observe(ready, [item('a')]), []);
  r.doc.visibilityState = 'hidden';
  assert.deepEqual(r.n.observe(ready, [item('a')]), []);
});

test('nothing is shown when notifications are off or the plan is not ready', () => {
  const off = rig({ on: false });
  off.n.observe(ready, []);
  assert.deepEqual(off.n.observe(ready, [item('a')]), []);
  const loading = rig();
  assert.deepEqual(loading.n.observe({ status: 'loading', state: null }, [item('a')]), []);
  assert.deepEqual(loading.n.observe({ ...ready, isEmpty: true }, [item('a')]), []);
  loading.n.observe(ready, []);
  assert.deepEqual(loading.n.observe({ status: 'offline', state: {} }, [item('z')]), []);
});

test('several new warnings each get their own notification', () => {
  const { n, shown } = rig();
  n.observe(ready, []);
  assert.deepEqual(n.observe(ready, [item('a'), item('b')]), ['a', 'b']);
  assert.equal(shown.length, 2);
});

test('a browser that throws on Notification never breaks the page', () => {
  const win: any = { Notification: function () { throw new Error('nope'); } };
  const n = createNotifier({ ui: { notify: () => true } as any, win, doc: { visibilityState: 'hidden' } as any });
  n.observe(ready, []);
  assert.doesNotThrow(() => n.observe(ready, [item('a')]));
});
```

- [ ] **Step 2: Run to see it fail**

Run: `node --test test/frontend/notify.test.ts`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement `public/js/notify.js`**

```js
// Shows a browser notification for a warning that is new since the last look, but only while the tab is hidden.
export function createNotifier({ ui, win, doc }) {
  let seen = null;
  return {
    observe(s, items) {
      if (s.status !== 'ready' || !s.state || s.isEmpty) return [];
      const keys = items.map((i) => i.key);
      if (seen === null) {
        seen = new Set(keys);
        return [];
      }
      const fresh = items.filter((i) => !seen.has(i.key));
      for (const k of keys) seen.add(k);
      if (fresh.length === 0 || !ui.notify() || doc.visibilityState !== 'hidden') return [];
      const announced = [];
      for (const item of fresh) {
        try {
          new win.Notification('doitwithme', { body: item.headline, tag: item.key });
          announced.push(item.key);
        } catch {
          // A browser that refuses must not break the page.
        }
      }
      return announced;
    },
  };
}
```

- [ ] **Step 4: Run and commit**

Run: `npm test` (green).

```bash
git add -A public test
git commit -m "feat: browser notification for a new warning while the tab is hidden

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015g9zWNaWwq6C6AoikFwJmf"
```

---

### Task 5: Wire everything into the app and test it end to end

**Files:**
- Modify: `public/js/main.js`, `public/js/router.js`, `test/frontend/e2e.test.ts`, `test/frontend/setup-e2e.test.ts`
- Test: `test/frontend/screens-e2e.test.ts`, `test/frontend/router.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: sections `day` (primary, before Week), `deadlines` (primary, after Week), `settings` (group `settings`); tabs Day, Week, Deadlines, Setup; `dateParam(param, today)` in `router.js` (alias of `weekParam`); a notifier fed by the store.

- [ ] **Step 1: Write the failing tests**

Append to `test/frontend/router.test.ts` (read its imports first and add `dateParam`):

```ts
test('dateParam falls back to today for anything that is not a real date', () => {
  assert.equal(dateParam('2026-10-14', '2026-10-09'), '2026-10-14');
  for (const bad of [null, '', 'xyz', '2026-02-30', '2026-13-01', '../..']) assert.equal(dateParam(bad as any, '2026-10-09'), '2026-10-09');
});
```

Update the existing assertions that list tabs: in `test/frontend/e2e.test.ts` line with `['Week', 'Setup']` and in `test/frontend/setup-e2e.test.ts` the tab list and menu link list: tabs become `['Day', 'Week', 'Deadlines', 'Setup']`; the menu links become `['#/day', '#/week', '#/deadlines', '#/commitments', '#/tasks', '#/due-dates', '#/places', '#/commutes', '#/preferences', '#/settings']` (the Menu lists groups in this order: views, setup, settings); the id loop in that test keeps working.

Create `test/frontend/screens-e2e.test.ts`, modelled on `setup-e2e.test.ts` (copy its imports, `before`/`after` server, `boot`, `settled`, `key`, `put`, `serverState`, `now` = Monday 5 Oct 2026 09:00, and the `studyState` style helpers; add `const exampleState = async () => (await fetch(`${base}/api/example`)).json();`):

```ts
test('the Day tab shows today, steps to the next day, and reads a date from the address', async () => {
  assert.equal((await put(await exampleState())).status, 200);
  const { app, root, win } = boot();
  await settled(app);
  app.navigate('#/day');
  assert.equal(textOf(byTag(root, 'h1')[0]), 'Mon 5');
  key(root, 'next').click();
  assert.match(win.location.hash, /^#\/day\/2026-10-06$/);
  assert.equal(textOf(byTag(root, 'h1')[0]), 'Tue 6');
  app.navigate('#/day/2026-10-31');
  key(root, 'next').click();
  assert.match(win.location.hash, /2026-11-01$/);
  app.navigate('#/day/not-a-date');
  assert.equal(textOf(byTag(root, 'h1')[0]), 'Mon 5');
  const tabs = findAll(root, (e: any) => e.tag === 'a' && e.hasClass('tab'));
  assert.equal(tabs.find((t: any) => textOf(t) === 'Day').getAttribute('aria-current'), 'page');
});

test('the Deadlines tab lists the example due dates with a shortfall for the exam', async () => {
  assert.equal((await put(await exampleState())).status, 200);
  const { app, root } = boot();
  await settled(app);
  app.navigate('#/deadlines');
  assert.equal(textOf(byTag(root, 'h1')[0]), 'Deadlines');
  assert.match(textOf(root), /Chemistry exam/);
  assert.ok(byClass(root, 'dl').length >= 1);
});

test('Settings saves soft time to the server and keeps every other preference', async () => {
  const example = await exampleState();
  assert.equal((await put(example)).status, 200);
  const { app, root } = boot();
  await settled(app);
  app.navigate('#/settings');
  assert.equal(key(root, 'set-softMode-ask').getAttribute('aria-pressed'), 'true');
  key(root, 'set-softMode-auto').click();
  await app.store.idle();
  await new Promise((r) => setTimeout(r, 30));
  const saved = await serverState();
  assert.equal(saved.preferences.softMode, 'auto');
  assert.deepEqual({ ...saved.preferences, softMode: 'ask' }, { ...example.preferences, softMode: 'ask', travelAllowanceMinutes: 30 });
  assert.equal(saved.tasks.length, example.tasks.length);
  assert.equal(key(root, 'set-softMode-auto').getAttribute('aria-pressed'), 'true');
});

test('the Menu offers Settings, and the Settings sub-links open each group', async () => {
  assert.equal((await put(await exampleState())).status, 200);
  const { app, root } = boot();
  await settled(app);
  app.menu.open(null);
  assert.ok(byClass(app.menu.el, 'it').some((l: any) => l.getAttribute('href') === '#/settings'));
  app.navigate('#/settings/planner');
  const current = findAll(root, (e: any) => e.tag === 'a' && e.getAttribute('aria-current') === 'page' && e.getAttribute('href')?.startsWith('#/settings/'));
  assert.equal(textOf(current[0]), 'Planner');
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/frontend/router.test.ts test/frontend/screens-e2e.test.ts test/frontend/e2e.test.ts test/frontend/setup-e2e.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`public/js/router.js`: add `export const dateParam = weekParam;` below `weekParam`.

`public/js/main.js`:

- Imports: add `import { dayModel } from './day-model.js'; import { renderDay } from './day.js'; import { deadlinesModel } from './deadlines-model.js'; import { renderDeadlines } from './deadlines.js'; import { createNotifier } from './notify.js'; import { createSettings } from './settings.js'; import { createUiPrefs } from './ui-prefs.js';` and add `dateParam` to the router import.
- After `const currentWeek = ...` add `const currentDay = () => dateParam(route.param, getClock().today);` and

```js
  const dayActions = {
    go: (delta) => navigate(buildHash('day', addDays(currentDay(), delta))),
    today: () => navigate(buildHash('day', null)),
    loadExample: () => store.loadExample(),
    get canAdd() {
      return registry.find('setup') !== null;
    },
  };
```

- Register the Day section **before** the Week section:

```js
  registry.register({
    id: 'day', title: 'Day', group: 'views', description: 'One day, hour by hour.', primary: true,
    render: (ctx) => {
      const date = currentDay();
      const model = dayModel(ctx.s.state, date, ctx.s.travel);
      const { needsYou } = buildNudge(ctx.s.warnings);
      return renderDay(dom, {
        model, needsYou, isEmpty: ctx.s.isEmpty,
        prevLabel: WEEKDAYS[weekdayOf(addDays(date, -1))], nextLabel: WEEKDAYS[weekdayOf(addDays(date, 1))],
      }, dayActions);
    },
  });
```

(add `WEEKDAYS` and `weekdayOf` to the `time.js` import).

- Register Deadlines **after** the Week section and before Setup:

```js
  registry.register({
    id: 'deadlines', title: 'Deadlines', group: 'views', description: 'What is due, and whether it is covered.', primary: true,
    render: (ctx) => renderDeadlines(dom, { model: deadlinesModel(ctx.s.state, getClock()), isEmpty: ctx.s.isEmpty }),
  });
```

- After the Setup sections add:

```js
  const ui = createUiPrefs(win);
  const settings = createSettings(dom, { store, ui, keepFocus });
  registry.register({
    id: 'settings', title: 'Settings', group: 'settings', description: 'Look, notifications and how I treat your evenings.',
    render: (ctx) => settings.render(ctx),
  });
```

- Notifier: after `store.subscribe(render);` add

```js
  const notifier = createNotifier({ ui, win, doc: document });
  store.subscribe((s) => notifier.observe(s, s.state ? buildNudge(s.warnings).items : []));
```

- [ ] **Step 4: Run, fix fallout, commit**

Run: `npm test`. Expected: green. If an existing test fails only because the registry now has more sections or tabs, update that expectation and ledger it as one `Ruling:`.

```bash
git add -A public test
git commit -m "feat: wire Day, Deadlines, Settings and notifications into the app

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015g9zWNaWwq6C6AoikFwJmf"
```

---

### Task 6: Docs and the visual checklist

**Files:**
- Modify: `README.md`, `docs/ui-visual-check.md`, `docs/superpowers/specs/2026-10-09-ui-design.md`

**Interfaces:**
- Consumes: the finished feature.
- Produces: accurate status text and a visual checklist for boards F, G and L.

- [ ] **Step 1: Update the docs**

- `README.md`: read the Status paragraph. Say that Day, Week, Deadlines, Setup and Settings are built, that browser notifications are opt-in in Settings, and that the Google Maps lookup, the AI workload estimate, the daily check-in and class-attendance advice come later. Adjust the screen list wherever the README names the screens.
- `docs/ui-visual-check.md`: append a section "Day, Deadlines and Settings (boards F, G, L)". Day: giant "Wed 14" style title with Tue / Today / Thu buttons, a meta column (week line, Booked, All clear), time column with block and duration, dashed buffer rows, grey "Free ..." lines, the "Today by group" totals and the big free-time number; arrow keys on the title change day; load the example and open a Wednesday to see the lesson and its buffer. Deadlines: big day numbers, title and task, a bar (black done, vermilion planned, dashed vermilion outline for short), numbers under it, a vermilion "Short NN min" chip or an outlined "Covered" or "Later" chip; open count and short count top right. Settings: three groups with a thick top rule; Theme with a dimmed Dark and a "Later" tag; System notifications Off/On with the hint; Soft time Ask first / Automatic; turn On and the browser asks; switch tabs and wait for a new warning to see the notification (it appears only while the tab is hidden).
- `docs/superpowers/specs/2026-10-09-ui-design.md`: add a build-status bullet: Day, Deadlines, Settings and system notifications are built per `docs/superpowers/plans/2026-10-10-day-deadlines-settings.md`; the rulings: Day ignores the Week filters (the board has no filter control), the Deadlines "Short" numbers use bold ink instead of vermilion text for contrast, a due date beyond the plan window shows "Later" instead of a shortfall.

- [ ] **Step 2: Verify and commit**

Run: `npm test` (green).

```bash
git add README.md docs
git commit -m "docs: Day, Deadlines and Settings status and visual checks

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015g9zWNaWwq6C6AoikFwJmf"
```

---

## Self-review notes

- **Spec coverage:** Day (rows, gaps, buffers, travel, side totals, free time, stepping, keyboard); Deadlines (due date, effort, done, planned, short, shortfalls in vermilion, example data note not reproduced because it is a board caption); Settings on the declarative row pattern with Appearance, Notifications and Planner; system notifications off by default, one permission button, only when a new undismissed warning appears while the tab is hidden, no service worker; four primary tabs; hash routes `#/day/<date>`, `#/deadlines`, `#/settings/<group>`.
- **Rulings to ledger when they happen:** Day ignores the Week filters; "Short" numbers in bold ink, not vermilion text; "Later" for due dates beyond the plan window; the `placeholder` caption "Rows 2 and 3 are example data" is not built; the Settings sub-navigation links each group (all groups stay visible) because the board shows all three at once.
- **Names used across tasks:** `dayModel`, `renderDay`, `deadlinesModel`, `renderDeadlines`, `createUiPrefs`, `SETTINGS`, `SETTINGS_GROUPS`, `createSettings`, `createNotifier`, `dateParam`, data-fk keys `prev`, `today`, `next`, `day-header`, `set-<row>-<value>`.
