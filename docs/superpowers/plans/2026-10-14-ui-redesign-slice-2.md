# UI redesign, slice 2: plain names and setting things up

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person can find every screen by a plain name and set things up without being told how: Commitments become **Fixed times**, Tasks become **To do**, Deadlines and Due dates become one **Due dates** screen, Places and Commutes share one **Places and travel** entry; every setup page says what it is for; **+ New** asks in three plain sentences (and **n** opens it); the Fixed times and To do forms read back what they will create and keep rare options behind **More options**.

**Architecture:** Front end only (`public/`). New copy and the read-back sentences live in one pure module, `setup-copy.js`, that `setup-model.js` and the setup page both use. Routing gains an alias (`#/deadlines` goes to Due dates) and the registry/sidebar are updated; `setup.js` gets the new page layout (title, purpose sentence, example chips, "Next:" hint) and the read-back and More options fields, which the drawer's quick-edit panel reuses through the shared `FIELDS`. New CSS goes in `public/css/shell.css` (after `app.css`). Route ids stay where a screen keeps its meaning.

**Tech Stack:** Vanilla ES modules with the `h()` helper (`public/js/dom.js`), the fake DOM in `test/frontend/fakedom.ts`, `node:test` (`npm test` = `node --test "test/**/*.test.ts"`; NEVER vitest).

**Spec:** `docs/superpowers/specs/2026-10-13-ui-redesign-design.md` (sections "Names and merges", "Adding things", "Screens"). This is slice 2 of 3; slice 3 (Day, Month, Settings and the rest, plus scoping the loose `shell.css` overrides) gets its own plan after the user has looked at this slice.

## Global Constraints

- No emojis. No gradients (the grey travel hatch in `app.css` is the only existing one). No purple. No inline `style=""` attributes. Text only through `h()`/text nodes, never `innerHTML`. Fonts stay Bricolage Grotesque and DM Mono. No special cursors, no blinking or fading transitions.
- Nudge's twelve faces and `createMascot` are not touched.
- No change to `src/`, the data, the API, or what the planner does. Setup validation (`fromDraft` in `setup-model.js`) is unchanged: the same rules, the same error messages.
- `app.css` is not edited. New CSS goes in `public/css/shell.css`, at equal or higher specificity than the `app.css` rule it overrides. `assets.test.ts` checks on both files (no external URLs, no gradients) keep passing.
- Existing tests are updated to new names and locations only; never delete or loosen an assertion without replacing what it protected, and list every changed test in the report.
- Route ids stay (`commitments`, `tasks`, `due-dates`, `labels`, `places`, `commutes`); only titles and groupings change. `data-fk` keys stay where a thing keeps its meaning.
- Plain-word rule (spec): copy names things by what a person recognizes ("Fixed times", "To do"), and every sentence ends with a full stop where it is a sentence.
- Every commit ends with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Do not push.

## Rulings made while planning (record in the ledger)

- Ruling: **Places and Commutes** share one sidebar entry, "Places and travel" (`#/places`), with a **Places | Travel** switch inside the page; `#/commutes` stays a route and marks that entry current. The spec's "each place listing its commutes underneath it" waits for slice 3. Cost if wrong: one more screen layout later.
- Ruling: the **Due dates** screen is the existing status list (covered / short bars) at `#/due-dates`, and the add/edit form at `#/due-dates/<id|new>`; `#/deadlines` is an alias of `#/due-dates`. Cost if wrong: swap which view shows without a parameter.
- Ruling: the **+ New** chooser drops "A label" (labels have their own **New label** button on the Labels screen), to match the spec's three sentences. Cost if wrong: re-add one choice.
- Ruling: **More options** is built for Fixed times and To do only; Due dates and the rest are already short. Cost if wrong: one more field list to fold.
- Ruling: the read-back sentence updates **as you type** (no redraw), so keyboard focus is never lost. Cost if wrong: none.

## Review Focus

- Every old address still lands somewhere sensible: `#/deadlines`, `#/deadlines/<id>`, `#/commutes`, `#/preferences`, `#/setup`. (Task 2)
- The edit panel (drawer) and the setup page share the same fields: the read-back and More options work in both, and a field with a non-default value is never hidden (an existing item with a buffer, a course or cancelled dates opens with More options already open). (Task 5)
- The read-back never claims something false: empty or invalid fields give an empty sentence, not "undefined" or "NaN". (Tasks 1, 5)
- A name that looks like markup is plain text in the read-back. (Task 5)
- `n` does nothing while typing in a field, with the Menu or the drawer open, or with a modifier key held. (Task 4)
- Every setup page has a purpose sentence, example chips and a title that matches its sidebar link. (Task 3)

---

### Task 1: Copy and read-back sentences (`public/js/setup-copy.js`)

**Files:**
- Create: `public/js/setup-copy.js`
- Modify: `public/js/setup-model.js` (titles and add-button text come from the copy)
- Test: `test/frontend/setup-copy.test.ts` (new), `test/frontend/setup-model.test.ts` (update titles)

**Interfaces:**
- Consumes: `FULL_WEEKDAYS`, `isValidDate`, `longDate`, `shortDate` from `public/js/time.js`.
- Produces: `COPY` (per kind id: `{ title, lead, examples: string[], add, next }`), `lengthText(minutes) => string`, `readBack(kindId, draft, state) => string` (`''` when the draft is not complete enough to say), `BLANK_READBACK` (the placeholder sentence).
  - `COPY` ids: `commitments`, `tasks`, `due-dates`, `labels`, `places`, `commutes`.
  - `setup-model.js` `KINDS[id].title` and `.add` become `COPY[id].title` and `COPY[id].add` for those six (the `preferences` kind is untouched).

- [ ] **Step 1: Write the failing tests**

`test/frontend/setup-copy.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLANK_READBACK, COPY, lengthText, readBack } from '../../public/js/setup-copy.js';

const state = { places: [{ id: 'p1', name: 'North campus' }], tasks: [{ id: 't1', title: 'Chemistry' }] };

test('every kind has a title, a purpose sentence, examples and an add button', () => {
  for (const id of ['commitments', 'tasks', 'due-dates', 'labels', 'places', 'commutes']) {
    const c = (COPY as any)[id];
    assert.ok(c.title && c.lead.endsWith('.') && c.examples.length > 0 && c.add, id);
  }
  assert.deepEqual(['commitments', 'tasks', 'due-dates', 'places', 'commutes'].map((id) => (COPY as any)[id].title), ['Fixed times', 'To do', 'Due dates', 'Places and travel', 'Travel']);
});

test('lengths read as a person says them', () => {
  assert.deepEqual([30, 60, 90, 120, 135].map(lengthText), ['30 min', '1 h', '1h30', '2 h', '2h15']);
});

test('a weekly fixed time reads back with days in week order, the place and the start date', () => {
  const d = { title: 'Chemistry lecture', start: '10:00', end: '12:00', repeats: 'weekly', weekdays: [3, 1], placeId: 'p1', from: '2026-10-12', to: '2026-12-01', date: '' };
  assert.equal(readBack('commitments', d, state), 'Chemistry lecture, every Monday and Wednesday, 10:00 to 12:00, at North campus, starting 12 Oct.');
});

test('three days, every day, and a one-time date read back correctly', () => {
  const base = { title: 'Gym', start: '18:00', end: '19:00', repeats: 'weekly', weekdays: [5, 1, 3], placeId: '', from: '', to: '', date: '' };
  assert.equal(readBack('commitments', base, state), 'Gym, every Monday, Wednesday and Friday, 18:00 to 19:00.');
  assert.equal(readBack('commitments', { ...base, weekdays: [0, 1, 2, 3, 4, 5, 6] }, state), 'Gym, every day, 18:00 to 19:00.');
  assert.equal(readBack('commitments', { ...base, repeats: 'once', date: '2026-10-13', start: '9:00' }, state), 'Gym, on Tue 13 Oct, 09:00 to 19:00.');
});

test('an incomplete or invalid draft reads back as nothing, never undefined or NaN', () => {
  const ok = { title: 'Gym', start: '18:00', end: '19:00', repeats: 'weekly', weekdays: [1], placeId: '', from: '', to: '', date: '' };
  assert.equal(readBack('commitments', { ...ok, title: '  ' }, state), '');
  assert.equal(readBack('commitments', { ...ok, start: 'soon' }, state), '');
  assert.equal(readBack('commitments', { ...ok, weekdays: [] }, state), '');
  assert.equal(readBack('commitments', { ...ok, repeats: 'once', date: 'nope' }, state), '');
  for (const out of [readBack('commitments', ok, state), readBack('tasks', { title: 'x', weekly: 'abc', maxBlock: '' }, state)]) assert.doesNotMatch(out, /undefined|NaN/);
  assert.ok(BLANK_READBACK.endsWith('.'));
});

test('a place that no longer exists is simply left out', () => {
  const d = { title: 'Gym', start: '18:00', end: '19:00', repeats: 'weekly', weekdays: [1], placeId: 'gone', from: '', to: '', date: '' };
  assert.equal(readBack('commitments', d, state), 'Gym, every Monday, 18:00 to 19:00.');
});

test('a to-do reads back its weekly time and longest block; with no weekly time it says so', () => {
  assert.equal(readBack('tasks', { title: 'Chemistry', weekly: '360', maxBlock: '120' }, state), 'Chemistry needs 6 h a week, in blocks of up to 2 h.');
  assert.equal(readBack('tasks', { title: 'Essay', weekly: '', maxBlock: '90' }, state), 'Essay has no weekly time set.');
  assert.equal(readBack('tasks', { title: ' ', weekly: '60', maxBlock: '60' }, state), '');
});

test('a due date reads back the task, the kind, the day and the effort', () => {
  assert.equal(readBack('due-dates', { taskId: 't1', kind: 'exam', dueDate: '2026-10-23', effort: '180' }, state), 'Chemistry exam on Fri 23 Oct, needing 3 h.');
  assert.equal(readBack('due-dates', { taskId: 'nope', kind: 'exam', dueDate: '2026-10-23', effort: '180' }, state), '');
  assert.equal(readBack('due-dates', { taskId: 't1', kind: 'exam', dueDate: '2026-10-23', effort: 'lots' }, state), '');
});

test('kinds without a read-back give nothing', () => {
  assert.equal(readBack('labels', { name: 'x' }, state), '');
});

test('a title that looks like markup comes back as the same plain text', () => {
  const d = { title: '<b>Gym</b>', start: '18:00', end: '19:00', repeats: 'weekly', weekdays: [1], placeId: '', from: '', to: '', date: '' };
  assert.match(readBack('commitments', d, state), /^<b>Gym<\/b>, every Monday/);
});
```

In `test/frontend/setup-model.test.ts` change the assertions about `KINDS[...].title` and `.add` to the new copy (`Fixed times`/`Add a fixed time`, `To do`/`Add something to do`, `Due dates`, `Places and travel`, `Travel`); keep every other assertion.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/frontend/setup-copy.test.ts test/frontend/setup-model.test.ts`
Expected: FAIL (module missing; titles differ).

- [ ] **Step 3: Write `public/js/setup-copy.js`**

```js
import { FULL_WEEKDAYS, isValidDate, longDate, shortDate } from './time.js';

// The words on every setup page. The sidebar uses the same titles, so a screen is called one thing everywhere.
export const COPY = {
  commitments: {
    title: 'Fixed times',
    lead: 'Things that happen at a set time. I plan everything else around them, so add these first.',
    examples: ['Classes', 'Work', 'Private lessons', 'Gym', 'Volunteering'],
    add: 'Add a fixed time',
    next: 'Next: tell me what needs time (To do), then what is due and when (Due dates).',
  },
  tasks: {
    title: 'To do',
    lead: 'Things that need time but have no set time, like study. Say how much a week and I find the time.',
    examples: ['Study for a course', 'An assignment', 'A project', 'Reading'],
    add: 'Add something to do',
    next: 'Next: add what is due and when (Due dates), so I can plan ahead of it.',
  },
  'due-dates': {
    title: 'Due dates',
    lead: 'Things with a date they must be done by, like an exam or an essay. I make sure there is time before it.',
    examples: ['Exams', 'Essays', 'Forms', 'Hand-ins'],
    add: 'Add a due date',
    next: 'Next: press Replan to see the week with everything in it.',
  },
  labels: {
    title: 'Labels',
    lead: 'Your own kinds of things, each with a color. The Week colors its blocks by them, and the sidebar uses them as filters.',
    examples: ['Study', 'Gym', 'Work'],
    add: 'New label',
    next: '',
  },
  places: {
    title: 'Places and travel',
    lead: 'Where things happen. Add home first, so I can plan the time to get there.',
    examples: ['Home', 'Campus', "A student's home"],
    add: 'Add a place',
    next: 'Next: switch to Travel and say how long each trip takes.',
  },
  commutes: {
    title: 'Travel',
    lead: 'How long it takes to get from one place to another. I put it in the week so you are never late.',
    examples: ['Home to campus', 'Campus to the gym'],
    add: 'Add a trip',
    next: '',
  },
};

export const BLANK_READBACK = 'Fill in the details and I will say it back here.';

export function lengthText(m) {
  if (m < 60) return `${m} min`;
  if (m % 60 === 0) return `${m / 60} h`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}

// Monday first, like the rest of the planner.
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const list = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
const clock = (t) => (/^\d{1,2}:\d{2}$/.test(String(t).trim()) ? String(t).trim().padStart(5, '0') : null);
const whole = (t) => (/^\d{1,9}$/.test(String(t).trim()) ? Number(String(t).trim()) : null);

function commitment(d, state) {
  const title = d.title.trim();
  const start = clock(d.start);
  const end = clock(d.end);
  if (!title || !start || !end) return '';
  let when;
  if (d.repeats === 'once') {
    if (!isValidDate(d.date)) return '';
    when = `on ${longDate(d.date)}`;
  } else {
    const days = ORDER.filter((w) => d.weekdays.includes(w));
    if (days.length === 0) return '';
    when = days.length === 7 ? 'every day' : `every ${list(days.map((w) => FULL_WEEKDAYS[w]))}`;
  }
  const place = (state.places ?? []).find((p) => p.id === d.placeId);
  const starting = d.repeats !== 'once' && isValidDate(d.from) ? `, starting ${shortDate(d.from)}` : '';
  return `${title}, ${when}, ${start} to ${end}${place ? `, at ${place.name}` : ''}${starting}.`;
}

function task(d) {
  const title = d.title.trim();
  if (!title) return '';
  const weekly = whole(d.weekly);
  if (weekly === null || weekly === 0) return `${title} has no weekly time set.`;
  const block = whole(d.maxBlock);
  return `${title} needs ${lengthText(weekly)} a week${block ? `, in blocks of up to ${lengthText(block)}` : ''}.`;
}

function dueDate(d, state) {
  const found = (state.tasks ?? []).find((t) => t.id === d.taskId);
  const effort = whole(d.effort);
  if (!found || !isValidDate(d.dueDate) || effort === null) return '';
  return `${found.title} ${d.kind} on ${longDate(d.dueDate)}, needing ${lengthText(effort)}.`;
}

// One plain sentence for what a form is about to create; '' until it is complete enough to say.
export function readBack(kindId, d, state) {
  if (kindId === 'commitments') return commitment(d, state);
  if (kindId === 'tasks') return task(d);
  if (kindId === 'due-dates') return dueDate(d, state);
  return '';
}
```

In `public/js/setup-model.js` add `import { COPY } from './setup-copy.js';` and in `KINDS` replace the `title` and `add` values: `title: COPY.commitments.title, ... add: COPY.commitments.add` and likewise for `tasks`, `labels`, `'due-dates'`, `places`, `commutes` (use `COPY[...]`; the `preferences` entry is untouched). `setup-copy.js` imports only `time.js`, so there is no import cycle.

- [ ] **Step 4: Run to verify they pass**

Run: `node --test test/frontend/setup-copy.test.ts test/frontend/setup-model.test.ts test/frontend/setup.test.ts`
Expected: PASS. If `setup.test.ts` asserted an old title or add text, update it to the new copy (names only).

- [ ] **Step 5: Commit**

```bash
git add public/js/setup-copy.js public/js/setup-model.js test/frontend/setup-copy.test.ts test/frontend/setup-model.test.ts test/frontend/setup.test.ts
git commit -m "feat: plain names and read-back sentences for the setup pages"
```

---

### Task 2: Plain names in the registry and the sidebar, one Due dates and one Places and travel

**Files:**
- Modify: `public/js/main.js`, `public/js/router.js`, `public/js/sidebar.js`, `public/js/deadlines.js` (heading)
- Test: `test/frontend/router.test.ts`, `test/frontend/sidebar.test.ts`, `test/frontend/shell.test.ts`, `test/frontend/deadlines.test.ts`, plus the e2e tests that list screens (`e2e.test.ts`, `setup-e2e.test.ts`, `screens-e2e.test.ts`, `menu.test.ts`, `sections.test.ts`)

**Interfaces:**
- Consumes: `COPY` (Task 1); `registry.register/find/primary/ids`; `renderDeadlines`, `deadlinesModel`; `setup.render(kindId, ctx)`.
- Produces: `resolveRoute(hash, ids, fallback = 'week', aliases = {})` (an alias maps an old id to a current one and keeps the parameter); `ROUTE_ALIASES = { deadlines: 'due-dates' }` in `main.js`; sidebar `SIDE_GROUPS` = Plan: `week, day, month`; What goes in: `commitments, tasks, due-dates`; Details: `places, labels`; untitled: `settings`.

- [ ] **Step 1: Write the failing tests**

In `test/frontend/router.test.ts` add:

```ts
test('an alias sends an old address to the current screen and keeps the parameter', () => {
  const ids = ['week', 'due-dates'];
  assert.deepEqual(resolveRoute('#/deadlines', ids, 'week', { deadlines: 'due-dates' }), { id: 'due-dates', param: null });
  assert.deepEqual(resolveRoute('#/deadlines/d-1', ids, 'week', { deadlines: 'due-dates' }), { id: 'due-dates', param: 'd-1' });
  assert.deepEqual(resolveRoute('#/week', ids, 'week', { deadlines: 'due-dates' }), { id: 'week', param: null });
  assert.deepEqual(resolveRoute('#/nope', ids, 'week', { deadlines: 'due-dates' }), { id: 'week', param: null });
});
```

In `test/frontend/sidebar.test.ts` update the first two tests: the headings are `['Plan', 'What goes in', 'Details']`, and the link texts for the test registry become `['Week', 'Day', 'Month', 'Fixed times', 'To do', 'Due dates', 'Places and travel', 'Labels', 'Settings']` (give the test registry those titles and drop its `deadlines` and `commutes` entries); `activeFor` for `places` is `['commutes']` and a test asserts `routeId: 'commutes'` marks `side-places` current.

In `test/frontend/shell.test.ts` update the link lists: the sidebar links are `week, day, month, commitments, tasks, due-dates, places, labels, settings` (9). Add:

```ts
test('the old Deadlines address opens Due dates, and Due dates shows the status list or the form', async () => {
  const { root, go, settle } = await bootWithData();
  go('#/deadlines'); await settle();
  assert.equal(textOf(byTag(root, 'h1')[0]), 'Due dates');
  assert.equal(findAll(root, (e: any) => e.getAttribute('data-fk') === 'side-due-dates')[0].getAttribute('aria-current'), 'page');
  go('#/due-dates/new'); await settle();
  assert.ok(findAll(root, (e: any) => e.getAttribute('data-fk') === 'setup-save').length === 1, 'the form is shown for a parameter');
});

test('Travel is part of Places and travel in the sidebar', async () => {
  const { root, go, settle } = await bootWithData();
  go('#/commutes'); await settle();
  assert.equal(findAll(root, (e: any) => e.getAttribute('data-fk') === 'side-places')[0].getAttribute('aria-current'), 'page');
});
```

In `test/frontend/deadlines.test.ts` change the heading assertion from `Deadlines` to `Due dates`.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/frontend/router.test.ts test/frontend/sidebar.test.ts test/frontend/shell.test.ts test/frontend/deadlines.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`public/js/router.js`:

```js
export function resolveRoute(hash, ids, fallback = 'week', aliases = {}) {
  const parsed = parseHash(hash);
  const id = parsed.id !== null && Object.hasOwn(aliases, parsed.id) ? aliases[parsed.id] : parsed.id;
  const known = id !== null && ids.includes(id);
  return { id: known ? id : fallback, param: known ? parsed.param : null };
}
```

`public/js/main.js`:
- `import { COPY } from './setup-copy.js';` and near the top `const ROUTE_ALIASES = { deadlines: 'due-dates' };`; the `resolveRoute(...)` call in `draw()` becomes `resolveRoute(win.location.hash, registry.ids(), 'week', ROUTE_ALIASES)`.
- Delete the `deadlines` registration. Re-register the setup entries:

```js
  registry.register({ id: 'commitments', title: COPY.commitments.title, group: 'setup', description: 'Classes, work, lessons, gym: things at a set time.', render: setupPage('commitments') });
  registry.register({ id: 'tasks', title: COPY.tasks.title, group: 'setup', description: 'Things that need time but no set time, like study.', render: setupPage('tasks') });
  // With nothing after it, Due dates is the status list; with an item or "new" it is the form.
  registry.register({
    id: 'due-dates', title: COPY['due-dates'].title, group: 'setup', description: 'What is due, whether it is covered, and add or edit.',
    render: (ctx) => (ctx.route.param ? setup.render('due-dates', ctx) : renderDeadlines(dom, { model: deadlinesModel(ctx.s.state, getClock()), isEmpty: ctx.s.isEmpty })),
  });
  registry.register({ id: 'labels', title: COPY.labels.title, group: 'setup', description: 'Your own kinds of things, each with a color.', render: setupPage('labels') });
  registry.register({ id: 'places', title: COPY.places.title, group: 'setup', description: 'Where things happen, and how long it takes to get there.', activeFor: ['commutes'], render: setupPage('places') });
  registry.register({ id: 'commutes', title: COPY.commutes.title, group: 'setup', inMenu: false, description: 'How long each trip takes.', render: setupPage('commutes') });
```

  Keep the existing `setup` ("Plan") registration with its `activeFor` as it is. Search `main.js` and the other modules for `'deadlines'` and `#/deadlines` and fix each reference (the `registry.primary()` slide order loses `deadlines`; no code should link to `#/deadlines` any more).

`public/js/sidebar.js` `SIDE_GROUPS`:

```js
export const SIDE_GROUPS = [
  { title: 'Plan', ids: ['week', 'day', 'month'] },
  { title: 'What goes in', ids: ['commitments', 'tasks', 'due-dates'] },
  { title: 'Details', ids: ['places', 'labels'] },
  { title: null, ids: ['settings'] },
];
```

`public/js/deadlines.js`: the hero heading `h1` text becomes `Due dates`; the empty-state lead stays. Update every test that expected the sidebar's 11 links, the old titles in the Menu list (`menu.test.ts`, `sections.test.ts`, `e2e.test.ts`, `screens-e2e.test.ts`, `setup-e2e.test.ts`) to the new set, changing names only.

- [ ] **Step 4: Run to verify they pass**

Run: `node --test test/frontend/router.test.ts test/frontend/sidebar.test.ts test/frontend/shell.test.ts test/frontend/deadlines.test.ts test/frontend/e2e.test.ts test/frontend/setup-e2e.test.ts test/frontend/screens-e2e.test.ts test/frontend/menu.test.ts test/frontend/sections.test.ts`
Expected: PASS. Then `node --test "test/frontend/*.test.ts"` for the whole front end (expect the same pass count as before plus the new tests).

- [ ] **Step 5: Commit**

```bash
git add public/js test/frontend
git commit -m "feat: plain screen names, one Due dates, Places and travel, and the old Deadlines address"
```

---

### Task 3: The setup page explains itself

**Files:**
- Modify: `public/js/setup.js` (build, list column add text), `public/css/shell.css`
- Test: `test/frontend/setup.test.ts` (extend), `test/frontend/setup-e2e.test.ts` (update h1 expectations)

**Interfaces:**
- Consumes: `COPY` (Task 1); the `.switch` classes already in `shell.css` (Week header); `KIND_IDS`, `KINDS`.
- Produces: the page markup `section.setup` > `div.hero` (`h1` = the kind's title; for `places` and `commutes` also `div.switch[role=group]` of two links Places | Travel) + `p.purpose` + `div.chips` (`span.chip` each) + `div.cols` + `p.next-hint` (only when the copy has one). The old row of kind links (`div.sub`) is gone.

- [ ] **Step 1: Write/adjust the failing tests**

In `test/frontend/setup-e2e.test.ts` replace the per-route `h1 === 'Plan'` assertions with the new titles: `commitments` → `Fixed times`, `tasks` → `To do`, `due-dates` → `Due dates`, `labels` → `Labels`, `places` → `Places and travel`, `commutes` → `Travel`; the `#/setup` check becomes `Fixed times`.

In `test/frontend/setup.test.ts` (use that file's own render helper) add:

```ts
test('every setup page says what it is for: title, a purpose sentence, example chips', () => {
  for (const [kind, title] of [['commitments', 'Fixed times'], ['tasks', 'To do'], ['due-dates', 'Due dates'], ['labels', 'Labels'], ['places', 'Places and travel'], ['commutes', 'Travel']] as const) {
    const el = renderKind(kind);                           // this file's helper for rendering a setup page
    assert.equal(textOf(byTag(el, 'h1')[0]), title, kind);
    assert.match(textOf(byClass(el, 'purpose')[0]), /\.$/, kind);
    assert.ok(byClass(el, 'chip').length >= 2, `${kind} has example chips`);
  }
});

test('the old row of kind links is gone; Places and Travel have a switch between them', () => {
  const places = renderKind('places');
  assert.equal(byClass(places, 'sub').length, 0);
  const keys = byClass(byClass(places, 'switch')[0], 'on').map((e: any) => textOf(e));
  assert.deepEqual(keys, ['Places']);
  assert.equal(byClass(renderKind('tasks'), 'switch').length, 0);
});

test('the add button and the next hint use the new copy', () => {
  const el = renderKind('commitments');
  assert.match(textOf(byClass(el, 'add')[0]), /Add a fixed time/);
  assert.match(textOf(byClass(el, 'next-hint')[0]), /^Next: tell me what needs time/);
  assert.equal(byClass(renderKind('labels'), 'next-hint').length, 0, 'labels have no next step');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/frontend/setup.test.ts test/frontend/setup-e2e.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement in `public/js/setup.js`**

Add `import { COPY } from './setup-copy.js';`. In `listColumn` the last link becomes `h('a', { class: 'add mono', href: `#/${kindId}/new` }, COPY[kindId].add)`. Replace the non-embedded part of `build()`:

```js
    const copy = COPY[kindId];
    // Places and Travel are one place in the sidebar; inside, a switch moves between them.
    const travelSwitch = (kindId === 'places' || kindId === 'commutes') && h('div', { class: 'switch mono', role: 'group', 'aria-label': 'Places or travel' },
      [['places', 'Places'], ['commutes', 'Travel']].map(([id, name]) =>
        h('a', { class: id === kindId ? 'on' : '', href: `#/${id}`, 'aria-current': id === kindId ? 'page' : null }, name)));
    return [
      h('div', { class: 'hero' }, h('h1', {}, copy.title), travelSwitch),
      h('p', { class: 'purpose' }, copy.lead),
      h('div', { class: 'chips', 'aria-label': 'Examples' }, copy.examples.map((e) => h('span', { class: 'chip' }, e))),
      h('div', { class: 'cols' }, listColumn(sel), formColumn(sel)),
      copy.next && h('p', { class: 'next-hint' }, copy.next),
    ];
```

`KIND_IDS` is no longer used by `build()`; remove it from the import if nothing else in the file uses it.

Append to `public/css/shell.css` (check the `app.css` rules for `.setup`, `.cols`, `.hero .sub`, `.list`, `.form` and keep each override at equal or higher specificity; align the page's side margins to 28px like the Week):

```css
/* Setup pages */
.setup .hero .switch { margin-left: auto; }
.setup .purpose { margin: 10px 28px 0; max-width: 640px; color: var(--muted); font-size: 15px; line-height: 1.4; }
.setup .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 28px 0; }
.setup .chip { padding: 3px 11px; border-radius: 99px; background: var(--soft); color: var(--muted); font-size: 13px; }
.setup .next-hint { margin: 24px 28px 0; padding: 12px 14px; border-radius: 12px; background: var(--soft); color: var(--ink); font-size: 14px; }
.setup .cols { margin-left: 28px; margin-right: 28px; }
```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test test/frontend/setup.test.ts test/frontend/setup-e2e.test.ts test/frontend/assets.test.ts`, then `node --test "test/frontend/*.test.ts"`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/js/setup.js public/css/shell.css test/frontend/setup.test.ts test/frontend/setup-e2e.test.ts
git commit -m "feat: every setup page says what it is for, with example chips and a next step"
```

---

### Task 4: + New in three plain sentences, and the n key

**Files:**
- Modify: `public/js/drawer.js` (`choosePanel`), `public/js/main.js` (the keydown handler)
- Test: `test/frontend/drawer.test.ts`, `test/frontend/shell.test.ts`, and any test that clicks `choose-label`

**Interfaces:**
- Consumes: `drawer.openChooser({ date, returnKey })`, `drawer.isOpen()`, `menu.isOpen()`.
- Produces: chooser choices with `data-fk` `choose-timed`, `choose-task`, `choose-due` (no `choose-label`), each choice's note ending with where it goes; pressing `n` outside a field opens the chooser.

- [ ] **Step 1: Write the failing tests**

In `test/frontend/drawer.test.ts` (use its helper for opening the chooser) change/add:

```ts
test('the chooser asks in three plain sentences and says where each goes', () => {
  const el = openChooser();                                  // this file's helper
  const titles = byClass(el, 'choice').map((c: any) => textOf(byTag(c, 'b')[0]));
  assert.deepEqual(titles, ['Something at a set time', 'Something that needs time', 'Something with a due date']);
  const notes = byClass(el, 'choice').map((c: any) => textOf(byTag(c, 'span')[0]));
  assert.match(notes[0], /Goes to Fixed times\.$/);
  assert.match(notes[1], /Goes to To do\.$/);
  assert.match(notes[2], /Goes to Due dates\.$/);
  assert.equal(findAll(el, (e: any) => e.getAttribute('data-fk') === 'choose-label').length, 0);
});
```

In `test/frontend/shell.test.ts` add:

```ts
test('pressing n opens the chooser, except while typing, with a modifier, or with the Menu or the drawer open', async () => {
  const { root, document, app } = await bootWithData();
  const press = (key: string, target: any = document.body ?? root, mods: any = {}) => document.dispatchKey(key, { target, ...mods });
  const input = findAll(root, (e: any) => e.tag === 'input')[0];
  if (input) { press('n', input); assert.equal(app.drawer.isOpen(), false, 'typing in a field never opens it'); }
  press('n', root, { metaKey: true }); assert.equal(app.drawer.isOpen(), false, 'a modifier key never opens it');
  press('n'); assert.equal(app.drawer.isOpen(), true, 'n opens it');
  press('n'); assert.equal(byClass(root, 'choice').length, 3, 'still just one chooser');
});
```

Adapt `dispatchKey` to the key-press helper that `e2e.test.ts` uses for `/` (check how it passes the target and modifier flags); the intent of each assertion stays as written.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/frontend/drawer.test.ts test/frontend/shell.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`public/js/drawer.js` `choosePanel()` options:

```js
    const options = [
      { fk: 'choose-timed', title: 'Something at a set time', note: 'A class, a shift, a lesson, the gym. It repeats or happens once. Goes to Fixed times.', run: () => startNew({ date: item.date, start: 9 * 60, returnKey: item.returnKey }) },
      { fk: 'choose-task', title: 'Something that needs time', note: 'Study, an assignment, a project. You say how much, I find the time. Goes to To do.', run: () => go('#/tasks/new') },
      { fk: 'choose-due', title: 'Something with a due date', note: 'An exam, an essay, a form. I make sure there is time before it. Goes to Due dates.', run: () => go('#/due-dates/new') },
    ];
```

(The panel heading `head('New', 'What are you adding?', '')` stays.) `public/js/main.js`, inside the existing `document.addEventListener('keydown', ...)` handler next to the `/` branch:

```js
    if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey && !['input', 'textarea', 'select'].includes(tag) && !menu.isOpen() && !drawer.isOpen()) {
      e.preventDefault();
      drawer.openChooser({ date: getClock().today, returnKey: 'new' });
    }
```

Update the other tests that clicked `choose-label` (search `choose-label` in `test/`) to assert it is gone, or to use the Labels screen's New label link instead. Also add `n` to the visual-check doc in Task 6.

- [ ] **Step 4: Run to verify they pass**

Run: `node --test test/frontend/drawer.test.ts test/frontend/shell.test.ts test/frontend/click-e2e.test.ts` then `node --test "test/frontend/*.test.ts"`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/js/drawer.js public/js/main.js test/frontend
git commit -m "feat: + New asks in three plain sentences, and n opens it"
```

---

### Task 5: Read-back and More options in the forms

**Files:**
- Modify: `public/js/setup.js` (`FIELDS`, new helpers, the `show` call sites), `public/js/drawer.js` (`SHOWN`, the two `show` call sites, scratch reset), `public/css/shell.css`
- Test: `test/frontend/setup.test.ts`, `test/frontend/drawer.test.ts`

**Interfaces:**
- Consumes: `readBack`, `BLANK_READBACK` (Task 1); `renderField` custom fields (`def.render(dom, draft, ctx)`); `ctx = { state, scratch, rerender, ... }` (both the setup page and the drawer build one).
- Produces: in `setup.js`: `moreOpen(kindId, draft, ctx) => boolean` (the toggle in `ctx.scratch.more` when set, otherwise open when the draft already differs from a blank one in any extra field), `readBackUpdater(kindId, draft, ctx) => () => void`; fields `readback` and `more` for `commitments`, `tasks` and (read-back only) `due-dates`; `show` predicates now take `(draft, ctx)`.
  - Extras: `commitments`: `buffer`, `courseId`, `exceptions`; `tasks`: `maxBlock`, `priority`, `onePerDay`.
  - DOM: `div.readback` > `span.mono.cap` ("This will be") + `p` (the sentence or `BLANK_READBACK`); `button.more.mono[data-fk=more-options][aria-expanded]` with text `More options` / `Fewer options`.

- [ ] **Step 1: Write the failing tests**

In `test/frontend/setup.test.ts` (use that file's helpers for rendering a form and typing into `f-<name>` inputs):

```ts
test('the Fixed times form reads back what it will create, and updates as you type without a redraw', () => {
  const el = renderForm('commitments', 'new');             // this file's helper for the form of a new item
  assert.match(textOf(byClass(el, 'readback')[0]), /Fill in the details/);
  const title = field(el, 'f-title');
  title.value = 'Chemistry lecture'; title.dispatch('input');
  assert.match(textOf(byClass(el, 'readback')[0]), /^This will be\s*Chemistry lecture, every Monday, 09:00 to 10:00, starting /);
  assert.equal(field(el, 'f-title'), title, 'the field is the same element, so focus is kept');
});

test('rare options sit behind More options and open on their own when an existing item uses them', () => {
  const fresh = renderForm('commitments', 'new');
  for (const name of ['f-buffer', 'f-exceptions']) assert.equal(field(fresh, name), undefined, `${name} is hidden at first`);
  const more = findAll(fresh, (e: any) => e.getAttribute('data-fk') === 'more-options')[0];
  assert.equal(more.getAttribute('aria-expanded'), 'false');
  more.click();
  assert.ok(field(fresh, 'f-buffer'), 'buffer shows after More options');
  assert.equal(findAll(fresh, (e: any) => e.getAttribute('data-fk') === 'more-options')[0].getAttribute('aria-expanded'), 'true');
  const used = renderForm('commitments', 'c1', { buffer: 15 });   // an existing item with a buffer
  assert.ok(field(used, 'f-buffer'), 'an item that uses a rare option never hides it');
});

test('To do keeps the longest block, priority and one-session-a-day behind More options', () => {
  const el = renderForm('tasks', 'new');
  assert.equal(field(el, 'f-maxBlock'), undefined);
  assert.ok(field(el, 'f-weekly'), 'the weekly time stays visible');
  findAll(el, (e: any) => e.getAttribute('data-fk') === 'more-options')[0].click();
  assert.ok(field(el, 'f-maxBlock'));
});

test('a due date reads back too, and has no More options', () => {
  const el = renderForm('due-dates', 'new');
  assert.equal(byClass(el, 'readback').length, 1);
  assert.equal(findAll(el, (e: any) => e.getAttribute('data-fk') === 'more-options').length, 0);
});

test('a title that looks like markup is plain text in the read-back', () => {
  const el = renderForm('commitments', 'new');
  const title = field(el, 'f-title');
  title.value = '<img src=x onerror=alert(1)>'; title.dispatch('input');
  assert.match(textOf(byClass(el, 'readback')[0]), /<img src=x onerror=alert\(1\)>/);
  assert.equal(byTag(el, 'img').length, 0);
});

test('saving still validates exactly as before even with More options closed', async () => {
  const el = renderForm('commitments', 'new');
  field(el, 'f-title').value = ''; field(el, 'f-title').dispatch('input');
  findAll(el, (e: any) => e.getAttribute('data-fk') === 'setup-save')[0].click();
  await flush();
  assert.match(textOf(el), /Give it a title\./);
});
```

In `test/frontend/drawer.test.ts` add: the quick-edit panel and the new-thing panel for a commitment show the read-back and the More options button, hide buffer/course/cancelled dates until More options is pressed, and open with them shown for a commitment that has a buffer.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/frontend/setup.test.ts test/frontend/drawer.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement in `public/js/setup.js`**

Add `import { BLANK_READBACK, readBack } from './setup-copy.js';` and, above `FIELDS`:

```js
// Rare options stay behind "More options", but a value that is not the default is never hidden from the person who set it.
const EXTRAS = { commitments: ['buffer', 'courseId', 'exceptions'], tasks: ['maxBlock', 'priority', 'onePerDay'] };

export function moreOpen(kindId, draft, ctx) {
  if (typeof ctx.scratch.more === 'boolean') return ctx.scratch.more;
  const blank = KINDS[kindId].kind.blank('2000-01-01', ctx.state);
  return EXTRAS[kindId].some((k) => JSON.stringify(draft[k]) !== JSON.stringify(blank[k]));
}

const moreField = (kindId) => ({
  name: 'more', type: 'custom', span: 3,
  render: (dom, d, ctx) => {
    const open = moreOpen(kindId, d, ctx);
    return dom.h('button', { type: 'button', class: 'more mono', 'data-fk': 'more-options', 'aria-expanded': String(open), onclick: () => { ctx.scratch.more = !open; ctx.rerender(); } },
      open ? 'Fewer options' : 'More options');
  },
});

// The sentence is a paragraph kept in ctx.scratch.rb so typing can update it in place, with no redraw and no lost focus.
const readbackField = (kindId) => ({
  name: 'readback', type: 'custom', span: 3,
  render: (dom, d, ctx) => {
    const p = dom.h('p', {}, readBack(kindId, d, ctx.state) || BLANK_READBACK);
    ctx.scratch.rb = p;
    return dom.h('div', { class: 'readback' }, dom.h('span', { class: 'mono cap' }, 'This will be'), p);
  },
});

export const readBackUpdater = (kindId, draft, ctx) => () => {
  if (ctx.scratch.rb) ctx.scratch.rb.textContent = readBack(kindId, draft, ctx.state) || BLANK_READBACK;
};
const extra = (kindId) => (d, ctx) => moreOpen(kindId, d, ctx);
```

Reorder and change the field lists (names, labels and types otherwise exactly as they are now):
- `commitments`: `title, category, start, end, placeId, repeats, weekdays, date, from, to, readback, more, buffer, courseId, exceptions` where `buffer` gets `show: extra('commitments')`, `courseId` gets `show: (d, ctx) => classes(d) && moreOpen('commitments', d, ctx)`, `exceptions` gets `show: (d, ctx) => weekly(d) && moreOpen('commitments', d, ctx)`; `readback: readbackField('commitments')`, `more: moreField('commitments')`.
- `tasks`: `title, category, weekly, readback, more, maxBlock, priority, onePerDay`, then the study-only course fields and `estimate` as they are now; `maxBlock`, `priority`, `onePerDay` get `show: extra('tasks')`.
- `'due-dates'`: append `readbackField('due-dates')` at the end.

Change both field filters in `formColumn` to `.filter((f) => !f.show || f.show(draft, ctx))` and add to the `<form>` element props `oninput: readBackUpdater(kindId, draft, ctx), onchange: readBackUpdater(kindId, draft, ctx)` (the `h()` helper lowercases `onInput` style names itself; use the lowercase `oninput`/`onchange` form like the other handlers in the file). The `ctx.scratch` object is `local.scratch`, which `freshLocal()` already resets for each item, so More options starts from "open only if used" for every item.

In `public/js/drawer.js`: add `'readback'` and `'more'` to the `SHOWN` list (find `const SHOWN`), keep `buffer`, `courseId` and `exceptions` in it, change both `.filter((f) => SHOWN.includes(f.name) && (!f.show || f.show(draft)))` calls to pass `ctx` as the second argument (`f.show(draft, ctx)`), add the same `oninput` and `onchange` read-back updater to the element that wraps the fields (only for `commitments`: `readBackUpdater('commitments', draft, ctx)`, imported from `./setup.js`), and make sure the drawer's `scratch` object is replaced with a fresh `{}` whenever the drawer opens a different item (find where `scratch` is created or cleared; if it is cleared only on close, also clear it in `openItem`/`startNew`) so `scratch.more` and `scratch.rb` never leak between items.

Append to `public/css/shell.css`:

```css
/* Read-back and More options */
.readback { padding: 10px 12px; border-radius: 10px; background: var(--soft); }
.readback p { margin: 4px 0 0; color: var(--ink); font-size: 14px; line-height: 1.35; overflow-wrap: anywhere; }
.more { align-self: flex-start; padding: 4px 0; border: 0; background: transparent; color: var(--muted); font-size: 13px; text-decoration: underline; text-underline-offset: 3px; }
.more:hover { color: var(--ink); background: transparent; }
```

(`.fld span3` placement: the two custom fields use `span: 3` like the existing custom fields, so they take the full row.)

- [ ] **Step 4: Run to verify they pass**

Run: `node --test test/frontend/setup.test.ts test/frontend/drawer.test.ts test/frontend/click-e2e.test.ts test/frontend/form.test.ts test/frontend/assets.test.ts`, then `node --test "test/frontend/*.test.ts"`.
Expected: PASS. Tests that look for `f-buffer`, `f-courseId`, `f-exceptions`, `f-maxBlock`, `f-priority` or `f-onePerDay` on a **new** form must press **More options** first (names only); never remove such an assertion.

- [ ] **Step 5: Commit**

```bash
git add public/js/setup.js public/js/drawer.js public/css/shell.css test/frontend
git commit -m "feat: forms read back what they will create, with rare options behind More options"
```

---

### Task 6: Guides and the handover

**Files:**
- Modify: `docs/ui-visual-check.md`

- [ ] **Step 1: Add the visual check**

Append a section "Plain names and setting things up (slice 2)" to `docs/ui-visual-check.md` in the file's style:

```markdown
## Plain names and setting things up (slice 2)

1. The sidebar now reads: Plan (Week, Day, Month), What goes in (Fixed times, To do, Due dates), Details (Places and travel, Labels), Settings. There is no Deadlines, Commitments, Tasks or Commutes any more.
2. Open Fixed times: the title is "Fixed times", under it one sentence about what it is for, grey example chips (Classes, Work...), your items as rows, **Add a fixed time**, and a "Next:" box at the bottom pointing at To do and Due dates. The old row of links across the top is gone.
3. Do the same for To do, Due dates, Labels, Places and travel (it has a Places | Travel switch), and Travel: each has its own title, sentence and chips.
4. Type the old address `#/deadlines` in the address bar: you land on Due dates. `#/commutes` opens Travel and the sidebar marks Places and travel.
5. Press **+ New** (or the **n** key when no field is focused): it asks three things in plain sentences ("Something at a set time", "Something that needs time", "Something with a due date"), each ending with where it goes.
6. Choose "Something at a set time". Fill the title, pick days, set the times. Under the fields a box says "This will be" and reads back what you typed ("Chemistry lecture, every Monday and Wednesday, 10:00 to 12:00, at North campus, starting 12 Oct."), and changes as you type. Buffer, course and cancelled dates are behind **More options**; open an item that has a buffer and More options is already open.
7. Do the same with To do: the weekly time shows, the longest block, priority and one-session-a-day are behind More options, and the sentence says "Chemistry needs 6 h a week, in blocks of up to 2 h."
8. Click a block on the Week: the quick-edit panel shows the same read-back and More options.
9. Known rough edges until slice 3: the Day, Month and Settings screens still have their old headers; each place does not yet list its trips under it.
```

- [ ] **Step 2: Commit**

```bash
git add docs/ui-visual-check.md
git commit -m "docs: how to check the plain names and setup pages"
```

- [ ] **Step 3: Hand over**

The controller runs the whole suite (`npm test`, in the background; it can take a long time under load). Tell the user: do the "Plain names and setting things up (slice 2)" steps in `docs/ui-visual-check.md` in a browser and say what looks off or still confuses. Do not push until they say so. Slice 3 (Day, Month, Settings and the rest, and scoping the loose `shell.css` overrides) gets its own plan after that.
