# UI redesign, slice 1: the shell and the Week

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The planner opens in the new soft-panel look: a left sidebar replaces the top bar, the screen floats on a white rounded panel over a grey canvas, the Week has the new header, tinted blocks and today highlight, labels in the sidebar filter the Week, and Nudge's bubble becomes a white card. Nudge's twelve faces and every behavior stay as they are.

**Architecture:** Front end only (`public/`). A new `sidebar.js` component renders the navigation, the label filters, **+ New** and **Replan**; `main.js` swaps the old top bar for it. All look changes go into a new `public/css/shell.css` loaded after `app.css` and override it at equal or higher specificity, so `app.css` and the tests that read it stay valid; the old rules are deleted in slice 3. Block tints are computed from each label's own color in `colors.js`/`labels.js`.

**Tech Stack:** Vanilla ES modules with the `h()` helper (`public/js/dom.js`), the fake DOM in `test/frontend/fakedom.ts`, `node:test` (`npm test` = `node --test "test/**/*.test.ts"`; NEVER vitest).

**Spec:** `docs/superpowers/specs/2026-10-13-ui-redesign-design.md` (this plan is slice 1 of its three; slices 2 and 3 get their own plans after the user has looked at this one).

## Global Constraints

- No emojis. No gradients (the grey travel hatch in `app.css` is the only existing one). No purple. No inline `style=""` attributes (CSP): positions go through the `style` object of `h()`. Text only through `h()`/text nodes, never `innerHTML`.
- Fonts stay Bricolage Grotesque and DM Mono (self-hosted, already in `tokens.css`). Page titles about 28 px. No special mouse cursors, no blinking or fading transitions.
- **Nudge's twelve faces, `faceFor`, glances, the startle, the peek and all of `createMascot` are not touched.** Only the bubble's colors and shape change (CSS).
- The "Booked 3h25" line under every day on the Week stays.
- Class names and `data-fk` keys that tests and the focus keeper rely on stay where a thing keeps its meaning: `new`, `replan`, `brand`, `fl-<labelId>`, `fl-all`, `prev`, `today`, `next`, `needs`, `week-header`, `dh-<date>`, `blk-<key>`. Top-bar tabs `tab-<id>` become sidebar links `side-<id>`.
- Screens keep their route ids and their current names in this slice (renames and merges are slice 2). Old addresses keep working.
- No change to `src/`, the data, the API, or what the planner does.
- `app.css` is not edited in this slice, and `assets.test.ts`'s checks on it (no external URLs, no gradients except the hatch, the listed selectors) keep passing. New CSS goes in `shell.css`, which gets the same two checks.
- Every commit ends with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Do not push.

## Rulings made while planning (record in the ledger)

- Ruling: **Replan** moves from the top bar into the sidebar's foot (the spec did not name it, and it must not disappear). Cost if wrong: one button to move.
- Ruling: the Week's hero **"+ Add"** button is removed; the sidebar's **+ New** and clicking empty space cover adding. Cost if wrong: re-add one button.
- Ruling: label filters show **only on the Week** in this slice (the Day and Month never filtered). Slice 3 extends them. Cost if wrong: the list is hidden elsewhere.
- Ruling: the Day's tiles use the same tint as the Week's (one shared function), so the two screens do not clash inside the shell. Cost if wrong: swap one function call back.
- Ruling: the Menu overlay stays as the **/** jump-to (restyled in slice 3); its top-bar Menu button goes away. Cost if wrong: none.

## Review Focus

- A label with a pale or dark color still gives readable text on its tint (4.5:1). (Task 1)
- Every screen is still reachable from the sidebar, and the current one is marked. Keyboard focus order is sensible: sidebar, then the panel. (Tasks 2, 3)
- A narrow window can open and close the sidebar and choosing a link closes it. (Task 3)
- Filters hide and show blocks exactly as the old "Show" list did, and the choice is still remembered. (Task 3)
- The hour axis lines up with the day columns (header height) after the header change. (Task 4)
- First run (no data) still offers "Load the example". (Task 4)
- Nudge's chat box, Earlier, check-in and warnings buttons are all still readable on the white bubble (focus rings included). (Task 5)

---

### Task 1: Block tints from a label's color

**Files:**
- Modify: `public/js/colors.js` (add `mixHex`, `tintOf`), `public/js/labels.js` (add `paintTile`), `public/js/week.js` and `public/js/day.js` (use `paintTile` for tiles)
- Test: `test/frontend/colors.test.ts` (append), `test/frontend/labels.test.ts` (append)

**Interfaces:**
- Consumes: `contrast`, `PALETTE` (colors.js); `paint`, `wash` (labels.js).
- Produces: `mixHex(a, b, t) => '#RRGGBB'` (a toward b by t, 0..1); `TINT = 0.16`; `tintOf(hex) => { fill, text }` where `fill` is the color at 16% over white and `text` is the label color darkened toward ink until `contrast(text, fill) >= 4.5`; `paintTile(node, color, style, { done }) => void`.

- [ ] **Step 1: Write the failing tests**

Append to `test/frontend/colors.test.ts` (keep its existing imports; add `PALETTE, contrast, mixHex, tintOf` to the import from `../../public/js/colors.js` if not there):

```ts
test('mixHex blends toward the second color', () => {
  assert.equal(mixHex('#000000', '#FFFFFF', 0), '#000000');
  assert.equal(mixHex('#000000', '#FFFFFF', 1), '#FFFFFF');
  assert.equal(mixHex('#FF0000', '#0000FF', 0.5), '#800080');
});

test('every palette color gives a tint with readable text and a fill lighter than the color', () => {
  for (const c of PALETTE) {
    const { fill, text } = tintOf(c.hex);
    assert.ok(contrast(text, fill) >= 4.5, `${c.name}: ${text} on ${fill} is ${contrast(text, fill).toFixed(2)}`);
    assert.ok(contrast(fill, '#FFFFFF') < contrast(c.hex, '#FFFFFF') || c.hex === '#FFFFFF', `${c.name}: the fill is paler than the color`);
  }
});

test('a pale color (sand) and a dark one (navy) both stay readable', () => {
  for (const hex of ['#D9C7A0', '#14213D', '#F5B400', '#4DB5FF']) {
    const { fill, text } = tintOf(hex);
    assert.ok(contrast(text, fill) >= 4.5, hex);
  }
  assert.equal(tintOf('#111111').text, '#111111');
});
```

Append to `test/frontend/labels.test.ts` (use that file's existing way of making a node; if it has none, import `FakeDocument` from `./fakedom.ts` and use `new FakeDocument().createElement('div')`; add `paintTile` to its import from `labels.js`):

```ts
test('paintTile tints a filled tile, keeps an outline an outline, and washes a done tile', () => {
  const doc: any = new FakeDocument();
  const fill = doc.createElement('div');
  paintTile(fill, '#FF4B1F', 'fill');
  assert.notEqual(fill.style.background, '#FF4B1F');
  assert.match(fill.style.background, /^#[0-9A-F]{6}$/i);
  const outline = doc.createElement('div');
  paintTile(outline, '#1746F0', 'outline');
  assert.equal(outline.style.borderColor, '#1746F0');
  const done = doc.createElement('div');
  paintTile(done, '#FF4B1F', 'fill', { done: true });
  assert.equal(done.style.color, '#2B2E31');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/frontend/colors.test.ts test/frontend/labels.test.ts`
Expected: FAIL (`mixHex`/`tintOf`/`paintTile` are not exported).

- [ ] **Step 3: Implement**

In `public/js/colors.js` append:

```js
const toHex = (n) => `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;

// `a` moved toward `b` by `t` (0 keeps a, 1 gives b).
export function mixHex(a, b, t) {
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const ch = (shift) => Math.round(((x >> shift) & 255) * (1 - t) + ((y >> shift) & 255) * t);
  return toHex((ch(16) << 16) | (ch(8) << 8) | ch(0));
}

// A block is its label's color at this strength over white.
export const TINT = 0.16;

// The fill for a block and a text color from the same hue, darkened until it reads (4.5:1) on that fill.
export function tintOf(hex) {
  const fill = mixHex('#FFFFFF', hex, TINT);
  let text = hex;
  for (let t = 0; t <= 1 && contrast(text, fill) < 4.5; t = Math.round((t + 0.05) * 100) / 100) text = mixHex(hex, '#111111', t);
  return { fill, text };
}
```

If the loop leaves `text` at the last mix when `t` reaches 1 it is `#111111`, which always reads on a light fill. In `public/js/labels.js` change the import to `import { PALETTE, onColor, tintOf } from './colors.js';` and add after `paint`:

```js
// A block on the Week and the Day: filled labels are a soft tint with text from the same hue; outlines and done blocks keep their look.
export function paintTile(node, color, style, { done = false } = {}) {
  if (done || style === 'outline') return paint(node, color, style, { done });
  const { fill, text } = tintOf(color);
  node.style.background = fill;
  node.style.color = text;
}
```

In `public/js/week.js` change the import to `import { lookClass, paint, paintTile } from './labels.js';` and line 26 to `if (!travel && !off) paintTile(node, item.color, item.look, { done: item.status === 'done' });` (the swatch `paint(sw, ...)` stays). In `public/js/day.js` do the same for the tile at line 31 (`paintTile`), leaving the swatch at line 69 on `paint`.

- [ ] **Step 4: Run to verify they pass**

Run: `node --test test/frontend/colors.test.ts test/frontend/labels.test.ts test/frontend/week.test.ts test/frontend/day.test.ts`
Expected: PASS. If a week or day test asserted the old solid background of a tile, change it to assert the tint (`tintOf(color).fill`), not to remove it.

- [ ] **Step 5: Commit**

```bash
git add public/js/colors.js public/js/labels.js public/js/week.js public/js/day.js test/frontend/colors.test.ts test/frontend/labels.test.ts test/frontend/week.test.ts test/frontend/day.test.ts
git commit -m "feat: blocks are a soft tint of their label's color, readable by rule"
```

---

### Task 2: The sidebar component

**Files:**
- Create: `public/js/sidebar.js`
- Test: `test/frontend/sidebar.test.ts`

**Interfaces:**
- Consumes: `createRegistry` shape from `public/js/sections.js` (`registry.find(id)` returns `{id, title, activeFor}` or null); `lookClass`, `paint` from `labels.js`; `createDom`.
- Produces: `SIDE_GROUPS`; `createSidebar(dom, registry, handlers) => { el, update(next), focus() }`.
  - `handlers`: `{ newThing(), replan(), toggleLabel(id), showAll(), picked() }`.
  - `update({ routeId, labels, hiddenCount, busy, ready })` where `labels` is `[{ id, name, color, look, count (number or null), hidden }]`.
  - DOM contract: `aside.side[aria-label="Main"]` containing `a.brand[data-fk=brand]`, `button.newb[data-fk=new]` ("+ New"), one `nav.sg` per group with a `span.mono.sgh` heading (none for the untitled last group) and `a.sl[data-fk=side-<id>]` links (current one has class `sl on` and `aria-current="page"`), a `div.sg.labels` (only when `labels.length > 0`) with `button.fl[data-fk=fl-<id>][aria-pressed]` (each holding `i.sw`, `span.nm`, and `span.ct` only when `count` is a number) and `button.fl-all.mono[data-fk=fl-all]` ("Show all", only when `hiddenCount > 0`), and `button.replan[data-fk=replan]` ("Replan", `disabled` when `busy` or not `ready`).
  - Groups (ids a registry does not have are skipped; a group with none left is omitted): `Plan`: week, day, month, deadlines; `What goes in`: commitments, tasks, due-dates; `Details`: labels, places, commutes; untitled: settings. Link text is `registry.find(id).title`, so renames in slice 2 show up here by themselves.

- [ ] **Step 1: Write the failing tests**

`test/frontend/sidebar.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDom } from '../../public/js/dom.js';
import { createRegistry } from '../../public/js/sections.js';
import { createSidebar } from '../../public/js/sidebar.js';
import { FakeDocument, byClass, findAll, textOf } from './fakedom.ts';

const dom = createDom(new FakeDocument() as any);
const fk = (root: any, key: string) => findAll(root, (e: any) => e.getAttribute('data-fk') === key)[0];

function registry() {
  const r = createRegistry();
  const add = (id: string, title: string, group: string, extra: any = {}) => r.register({ id, title, group, render: () => null, ...extra });
  add('week', 'Week', 'views'); add('day', 'Day', 'views'); add('month', 'Month', 'views'); add('deadlines', 'Deadlines', 'views');
  add('commitments', 'Commitments', 'setup'); add('tasks', 'Tasks', 'setup'); add('due-dates', 'Due dates', 'setup');
  add('labels', 'Labels', 'setup'); add('places', 'Places', 'setup'); add('commutes', 'Commutes', 'setup');
  add('settings', 'Settings', 'settings', { activeFor: ['preferences'] });
  return r;
}

function make(over: any = {}) {
  const calls: any[] = [];
  const handlers = {
    newThing: () => calls.push(['new']), replan: () => calls.push(['replan']), toggleLabel: (id: string) => calls.push(['toggle', id]),
    showAll: () => calls.push(['all']), picked: () => calls.push(['picked']),
  };
  const side: any = createSidebar(dom, over.registry ?? registry(), handlers);
  side.update({ routeId: 'week', labels: [], hiddenCount: 0, busy: false, ready: true, ...over.view });
  return { side, calls };
}

test('the groups come in order with their headings, and the last one has none', () => {
  const { side } = make();
  const heads = byClass(side.el, 'sgh').map((e: any) => textOf(e));
  assert.deepEqual(heads, ['Plan', 'What goes in', 'Details']);
  const links = findAll(side.el, (e: any) => (e.getAttribute('data-fk') ?? '').startsWith('side-')).map((e: any) => textOf(e));
  assert.deepEqual(links, ['Week', 'Day', 'Month', 'Deadlines', 'Commitments', 'Tasks', 'Due dates', 'Labels', 'Places', 'Commutes', 'Settings']);
});

test('the current screen is marked, including a screen that belongs to another (preferences to Settings)', () => {
  const { side } = make({ view: { routeId: 'preferences' } });
  assert.equal(fk(side.el, 'side-settings').getAttribute('aria-current'), 'page');
  assert.equal(fk(side.el, 'side-week').getAttribute('aria-current'), null);
  side.update({ routeId: 'tasks', labels: [], hiddenCount: 0, busy: false, ready: true });
  assert.equal(fk(side.el, 'side-tasks').getAttribute('aria-current'), 'page');
  assert.match(fk(side.el, 'side-tasks').getAttribute('class'), /\bon\b/);
});

test('a screen the registry does not have is skipped, and an empty group disappears', () => {
  const r = createRegistry();
  r.register({ id: 'week', title: 'Week', group: 'views', render: () => null });
  const { side } = make({ registry: r });
  assert.deepEqual(byClass(side.el, 'sgh').map((e: any) => textOf(e)), ['Plan']);
  assert.equal(fk(side.el, 'side-day'), undefined);
});

test('links point at the screen and tell the shell to close a narrow sidebar', () => {
  const { side, calls } = make();
  assert.equal(fk(side.el, 'side-tasks').getAttribute('href'), '#/tasks');
  fk(side.el, 'side-tasks').click();
  assert.deepEqual(calls, [['picked']]);
});

test('+ New and Replan call their handlers, and Replan is off while busy or not ready', () => {
  const { side, calls } = make();
  fk(side.el, 'new').click();
  fk(side.el, 'replan').click();
  assert.deepEqual(calls, [['new'], ['replan']]);
  side.update({ routeId: 'week', labels: [], hiddenCount: 0, busy: true, ready: true });
  assert.ok(fk(side.el, 'replan').disabled || fk(side.el, 'replan').getAttribute('disabled') !== null);
  side.update({ routeId: 'week', labels: [], hiddenCount: 0, busy: false, ready: false });
  assert.ok(fk(side.el, 'replan').disabled || fk(side.el, 'replan').getAttribute('disabled') !== null);
});

test('labels show with counts, toggle by id, and say whether they are on', () => {
  const labels = [
    { id: 'study', name: 'Study', color: '#FF4B1F', look: 'fill', count: 4, hidden: false },
    { id: 'gym', name: 'Gym', color: '#1746F0', look: 'fill', count: null, hidden: true },
  ];
  const { side, calls } = make({ view: { labels, hiddenCount: 1 } });
  assert.equal(fk(side.el, 'fl-study').getAttribute('aria-pressed'), 'true');
  assert.equal(fk(side.el, 'fl-gym').getAttribute('aria-pressed'), 'false');
  assert.match(textOf(fk(side.el, 'fl-study')), /Study.*4/s);
  assert.equal(byClass(fk(side.el, 'fl-gym'), 'ct').length, 0, 'no count when there is none');
  fk(side.el, 'fl-gym').click();
  assert.deepEqual(calls, [['toggle', 'gym']]);
});

test('Show all appears only while something is hidden; no labels, no Labels group', () => {
  const none = make();
  assert.equal(byClass(none.side.el, 'labels').length, 0);
  const some = make({ view: { labels: [{ id: 'gym', name: 'Gym', color: '#1746F0', look: 'fill', count: 1, hidden: true }], hiddenCount: 1 } });
  fk(some.side.el, 'fl-all').click();
  assert.deepEqual(some.calls, [['all']]);
  some.side.update({ routeId: 'week', labels: [{ id: 'gym', name: 'Gym', color: '#1746F0', look: 'fill', count: 1, hidden: false }], hiddenCount: 0, busy: false, ready: true });
  assert.equal(fk(some.side.el, 'fl-all'), undefined);
});

test('a label name that looks like markup is plain text', () => {
  const { side } = make({ view: { labels: [{ id: 'x', name: '<img src=x onerror=alert(1)>', color: '#111111', look: 'fill', count: 1, hidden: false }], hiddenCount: 0 } });
  assert.match(textOf(side.el), /<img src=x onerror=alert\(1\)>/);
  assert.equal(findAll(side.el, (e: any) => e.tag === 'img').length, 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/frontend/sidebar.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Write `public/js/sidebar.js`**

```js
import { lookClass, paint } from './labels.js';

// Where each screen sits in the sidebar. Titles come from the registry, so renaming a screen renames its link.
export const SIDE_GROUPS = [
  { title: 'Plan', ids: ['week', 'day', 'month', 'deadlines'] },
  { title: 'What goes in', ids: ['commitments', 'tasks', 'due-dates'] },
  { title: 'Details', ids: ['labels', 'places', 'commutes'] },
  { title: null, ids: ['settings'] },
];

export function createSidebar(dom, registry, handlers) {
  const { h, clear } = dom;
  const el = h('aside', { class: 'side', 'aria-label': 'Main' });
  let view = { routeId: 'week', labels: [], hiddenCount: 0, busy: false, ready: false };
  let firstLink = null;

  const isCurrent = (section) => section.id === view.routeId || (section.activeFor ?? []).includes(view.routeId);

  function link(section) {
    const on = isCurrent(section);
    const a = h('a', {
      class: on ? 'sl on' : 'sl', href: `#/${section.id}`, 'data-fk': `side-${section.id}`, 'aria-current': on ? 'page' : null,
      onclick: () => handlers.picked(),
    }, section.title);
    if (firstLink === null) firstLink = a;
    return a;
  }

  function group(g) {
    const sections = g.ids.map((id) => registry.find(id)).filter(Boolean);
    if (sections.length === 0) return null;
    return h('nav', { class: 'sg', 'aria-label': g.title ?? 'Settings' }, g.title && h('span', { class: 'mono sgh' }, g.title), sections.map(link));
  }

  function labelButton(l) {
    const sw = h('i', { class: `sw ${lookClass(l.look)}` });
    paint(sw, l.color, l.look);
    return h('button', { type: 'button', class: 'fl', 'data-fk': `fl-${l.id}`, 'aria-pressed': String(!l.hidden), onclick: () => handlers.toggleLabel(l.id) },
      sw, h('span', { class: 'nm' }, l.name), typeof l.count === 'number' && h('span', { class: 'ct' }, l.count));
  }

  function build() {
    firstLink = null;
    const labels = view.labels.length > 0 && h('div', { class: 'sg labels' },
      h('span', { class: 'mono sgh' }, 'Labels'),
      view.labels.map(labelButton),
      view.hiddenCount > 0 && h('button', { type: 'button', class: 'fl-all mono', 'data-fk': 'fl-all', onclick: () => handlers.showAll() }, 'Show all'));
    return [
      h('a', { class: 'brand', href: '#/week', 'data-fk': 'brand', onclick: () => handlers.picked() }, 'doitwithme'),
      h('button', { type: 'button', class: 'newb', 'data-fk': 'new', onclick: () => handlers.newThing() }, '+ New'),
      SIDE_GROUPS.map(group),
      labels,
      h('button', { type: 'button', class: 'replan', 'data-fk': 'replan', disabled: view.busy || !view.ready, onclick: () => handlers.replan() }, 'Replan'),
    ];
  }

  function draw() {
    clear(el, build());
  }
  draw();

  return {
    el,
    update(next) {
      view = { ...view, ...next };
      draw();
    },
    // Where focus goes when something that opened from here closes.
    focus() {
      if (firstLink && typeof firstLink.focus === 'function') firstLink.focus();
    },
  };
}
```

`h()` drops `null`/`false` children and attributes, so the conditional pieces need no extra code. `disabled: false` is dropped by `apply`, `true` becomes the attribute.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/frontend/sidebar.test.ts`
Expected: PASS (8 tests). If the fake DOM lacks `.disabled`, the tests already accept the attribute form.

- [ ] **Step 5: Commit**

```bash
git add public/js/sidebar.js test/frontend/sidebar.test.ts
git commit -m "feat: the sidebar component with the screens, labels as filters, + New and Replan"
```

---

### Task 3: Put the sidebar in the shell, with the panel and canvas

**Files:**
- Modify: `public/js/main.js`, `public/css/tokens.css`, `public/index.html`
- Create: `public/css/shell.css`
- Test: `test/frontend/shell.test.ts` (new), `test/frontend/assets.test.ts` (extend), and update the tests that referenced the old top bar (see Step 6)

**Interfaces:**
- Consumes: `createSidebar` (Task 2); `labelsOf` (labels.js); `weekModel(...).filters` (already returns `[{id, name, color, look, count}]`); `weekActions.toggleGroup/showAll`, `hidden` (already in `main.js`); `drawer.openChooser`; `store.replan()`; `menu.open(opener)`.
- Produces: the app markup `div.app` > `button.side-toggle[data-fk=side-toggle]` + `aside.side` + `main.view`; `data-side="open"` on `div.app` while a narrow window shows the sidebar; new tokens `--canvas`, `--panel`, `--hair`, `--soft`, `--today`, `--shadow`; `public/css/shell.css` linked after `app.css`.

- [ ] **Step 1: Write the failing tests**

`test/frontend/shell.test.ts` boots the real app the way `test/frontend/e2e.test.ts` does (copy its `boot()` helper and its server setup, with a state that has a few commitments and a task so labels exist) and checks:

```ts
test('the app is a sidebar and a panel; the old top bar and tabs are gone', async () => {
  const { root } = await bootWithData();                    // copy the helper pattern from e2e.test.ts
  assert.equal(byClass(root, 'side').length, 1);
  assert.equal(byTag(root, 'main').length, 1);
  assert.equal(byClass(root, 'tabs').length, 0);
  assert.equal(findAll(root, (e: any) => (e.getAttribute('data-fk') ?? '').startsWith('tab-')).length, 0);
});

test('every screen is a sidebar link and the current one is marked', async () => {
  const { root } = await bootWithData();
  const keys = findAll(root, (e: any) => (e.getAttribute('data-fk') ?? '').startsWith('side-')).map((e: any) => e.getAttribute('data-fk'));
  for (const id of ['week', 'day', 'month', 'deadlines', 'commitments', 'tasks', 'due-dates', 'labels', 'places', 'commutes', 'settings']) assert.ok(keys.includes(`side-${id}`), id);
  const week = findAll(root, (e: any) => e.getAttribute('data-fk') === 'side-week')[0];
  assert.equal(week.getAttribute('aria-current'), 'page');
});

test('+ New and Replan are in the sidebar and work', async () => {
  const { root } = await bootWithData();
  findAll(root, (e: any) => e.getAttribute('data-fk') === 'new')[0].click();
  assert.ok(byClass(root, 'drawer').length > 0 || /Something|New/.test(textOf(root)), 'the chooser opened');
  assert.equal(findAll(root, (e: any) => e.getAttribute('data-fk') === 'replan').length, 1);
});

test('the label filters live in the sidebar and hide blocks on the Week, and Show all brings them back', async () => {
  const { root, settle } = await bootWithData();
  const blocksBefore = findAll(root, (e: any) => (e.getAttribute('data-fk') ?? '').startsWith('blk-')).length;
  findAll(root, (e: any) => (e.getAttribute('data-fk') ?? '').startsWith('fl-') && e.getAttribute('data-fk') !== 'fl-all')[0].click();
  await settle();
  const blocksAfter = findAll(root, (e: any) => (e.getAttribute('data-fk') ?? '').startsWith('blk-')).length;
  assert.ok(blocksAfter < blocksBefore, 'a hidden label removes its blocks');
  findAll(root, (e: any) => e.getAttribute('data-fk') === 'fl-all')[0].click();
  await settle();
  assert.equal(findAll(root, (e: any) => (e.getAttribute('data-fk') ?? '').startsWith('blk-')).length, blocksBefore);
});

test('on another screen the label filters are not offered', async () => {
  const { root, go, settle } = await bootWithData();
  go('#/settings'); await settle();
  assert.equal(byClass(root, 'labels').length, 0);
});

test('a narrow window opens the sidebar with its button and a link closes it', async () => {
  const { root } = await bootWithData();
  const app = byClass(root, 'app')[0];
  const toggle = findAll(root, (e: any) => e.getAttribute('data-fk') === 'side-toggle')[0];
  assert.equal(app.getAttribute('data-side'), null);
  toggle.click();
  assert.equal(app.getAttribute('data-side'), 'open');
  findAll(root, (e: any) => e.getAttribute('data-fk') === 'side-tasks')[0].click();
  assert.equal(app.getAttribute('data-side'), null);
});

test('pressing / still opens the jump-to menu', async () => {
  const { root, document } = await bootWithData();
  document.dispatchKey('/');                                // the way e2e.test.ts presses keys
  assert.ok(byClass(root, 'menu').length > 0);
});
```

Fill `bootWithData`, `settle`, `go` and `dispatchKey` from the existing e2e helpers (`test/frontend/e2e.test.ts` has `boot()`, a settle loop and key dispatch); if a helper does not exist there, write it in the new file. Extend `test/frontend/assets.test.ts`:

```ts
test('shell.css is linked after app.css, loads nothing from elsewhere, and has no gradients', () => {
  const html = readFileSync('public/index.html', 'utf8');
  assert.ok(html.indexOf('/css/app.css') < html.indexOf('/css/shell.css'), 'shell.css comes after app.css');
  const css = readFileSync('public/css/shell.css', 'utf8');
  assert.doesNotMatch(css, /https?:\/\//);
  assert.doesNotMatch(css, /gradient/i);
});

test('tokens.css has the canvas and panel colors', () => {
  const css = readFileSync('public/css/tokens.css', 'utf8');
  for (const token of ['--canvas', '--panel', '--hair', '--soft', '--today', '--shadow']) assert.ok(css.includes(token), token);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/frontend/shell.test.ts test/frontend/assets.test.ts`
Expected: FAIL.

- [ ] **Step 3: Tokens, the stylesheet link, and `shell.css`**

Add to the `:root` block in `public/css/tokens.css`:

```css
  --canvas: #ECEEF2;
  --panel: #FFFFFF;
  --hair: #ECEEF1;
  --soft: #F4F5F8;
  --today: #FFF3EE;
  --shadow: 0 2px 14px rgba(20, 22, 26, .08);
```

In `public/index.html` add `<link rel="stylesheet" href="/css/shell.css">` after the `app.css` link. Create `public/css/shell.css` with the shell layout (later tasks append to it; every rule here overrides `app.css` at equal or higher specificity):

```css
/* The soft-panel shell: grey canvas, a sidebar, and the screen on a white panel. Loaded after app.css. */
body { background: var(--canvas); }
.app { display: grid; grid-template-columns: 232px minmax(0, 1fr); gap: 16px; align-items: start; padding: 16px 16px 120px; min-height: 100vh; }
.view { background: var(--panel); border-radius: 16px; box-shadow: var(--shadow); padding: 24px 0 32px; min-height: calc(100vh - 32px); min-width: 0; overflow-x: clip; }
.view .boot, .view .state { margin: 28px; }

/* Titles are a normal size now. */
.hero { padding: 0 28px; align-items: center; }
.hero h1, .week .hero h1 { font-size: 28px; line-height: 1.15; letter-spacing: -.03em; }

/* Sidebar */
.side { position: sticky; top: 16px; max-height: calc(100vh - 32px); overflow-y: auto; display: flex; flex-direction: column; gap: 18px; padding: 8px 4px; }
.side .brand { padding: 0 10px; font-size: 17px; font-weight: 800; letter-spacing: -.03em; text-decoration: none; }
.side .newb { min-height: 40px; padding: 9px 12px; border: 0; border-radius: 8px; background: var(--ink); color: var(--paper); font-weight: 700; text-align: center; }
.side .sg { display: flex; flex-direction: column; gap: 2px; }
.side .sgh { color: var(--muted); padding: 0 10px 4px; font-size: 10px; letter-spacing: .08em; }
.side .sl { padding: 7px 10px; border-radius: 7px; text-decoration: none; color: var(--ink); font-weight: 500; }
.side .sl:hover { background: rgba(255, 255, 255, .6); }
.side .sl.on { background: var(--panel); font-weight: 700; box-shadow: 0 1px 3px rgba(20, 22, 26, .12); }
.side .fl { width: 100%; padding: 4px 10px; border-radius: 7px; border: 0; background: transparent; display: flex; align-items: center; gap: 8px; text-align: left; }
.side .fl:hover { background: rgba(255, 255, 255, .6); color: var(--ink); }
.side .fl .sw { width: 10px; height: 10px; border-radius: 50%; }
.side .fl .sw.is-outline { border: 2px solid var(--ink); }
.side .fl .nm { font-size: 13px; font-weight: 600; }
.side .fl-all { margin: 4px 10px 0; align-self: flex-start; border-radius: 7px; border: 1px solid #D5D8DE; background: transparent; padding: 5px 9px; }
.side .replan { margin-top: auto; border: 1px solid #D5D8DE; border-radius: 8px; background: transparent; padding: 8px 12px; font-weight: 600; }
.side .replan:hover:not(:disabled) { background: var(--ink); color: var(--paper); }
.side-toggle { display: none; }

/* Narrow windows: the sidebar slides in over the screen. */
@media (max-width: 860px) {
  .app { grid-template-columns: minmax(0, 1fr); padding: 8px 8px 120px; }
  .side-toggle { display: inline-flex; margin: 0 0 8px; border-radius: 8px; border: 1px solid #D5D8DE; background: var(--panel); }
  .side { position: fixed; inset: 0 auto 0 0; width: 256px; max-height: none; z-index: 40; background: var(--canvas); padding: 16px 12px; transform: translateX(-110%); transition: transform .26s ease-out; }
  .app[data-side="open"] .side { transform: none; box-shadow: 8px 0 30px rgba(20, 22, 26, .2); }
}
```

The `.fl:hover` line prevents the old global `button:hover` ink fill from hiding the label text; check `app.css` line ~363 for the `.fl` hover rule you must out-rank and keep the specificity at or above it.

- [ ] **Step 4: Replace the top bar with the sidebar in `public/js/main.js`**

1. Imports: add `import { createSidebar } from './sidebar.js';` and ensure `labelsOf` is imported from `./labels.js`.
2. Delete `const bar = h('header', { class: 'bar' });`, the `menuButton` constant, the whole `renderBar()` function, and `renderBar();` inside `draw()`.
3. After `const menu = createMenu(...)` and before `root.append(...)`, build the sidebar and the toggle (all handlers run later, so they may reference things declared further down):

```js
  const sidebar = createSidebar(dom, registry, {
    newThing: () => drawer.openChooser({ date: getClock().today, returnKey: 'new' }),
    replan: () => store.replan(),
    toggleLabel: (id) => weekActions.toggleGroup(id),
    showAll: () => weekActions.showAll(),
    picked: () => closeSide(),
  });
  const appEl = h('div', { class: 'app' });
  const sideToggle = h('button', { type: 'button', class: 'side-toggle btn mono', 'data-fk': 'side-toggle', 'aria-label': 'Menu', onclick: () => (appEl.getAttribute('data-side') === 'open' ? closeSide() : openSide()) }, 'Menu');
  function openSide() { appEl.setAttribute('data-side', 'open'); }
  function closeSide() { appEl.removeAttribute('data-side'); }
  clear(appEl, sideToggle, sidebar.el, main);
  main.addEventListener('click', () => closeSide());
  root.append(appEl, nudge.el, menu.el, drawer.el);
```

Remove the old `root.append(h('div', { class: 'app' }, bar, main), nudge.el, menu.el, drawer.el);` line. Function declarations are hoisted, so `closeSide` is safe to reference from the handlers above it.
4. The `/` key handler: replace `menu.open(menuButton)` with `menu.open({ focus: () => sidebar.focus() })`.
5. Add `renderSide()` and call it where `renderBar()` was called in `draw()`:

```js
  function renderSide() {
    const s = store.get();
    // The filters belong to the Week; elsewhere nothing is offered (the Day and Month never filtered).
    const labels = s.state && route.id === 'week'
      ? weekModel(s.state, currentWeek(), hidden, getClock().today, s.travel).filters
      : [];
    sidebar.update({
      routeId: route.id,
      labels: labels.map((l) => ({ ...l, hidden: hidden.has(l.id) })),
      hiddenCount: hidden.size,
      busy: s.busy,
      ready: s.status === 'ready',
    });
  }
```

6. In `weekActions` nothing changes (`toggleGroup`, `showAll` already call `render()`).
7. Registry `primary()` is still used by the slide-direction logic; leave it. The old `registry.primary().map(...)` tab building is gone with `renderBar`.

- [ ] **Step 5: Run the new tests**

Run: `node --test test/frontend/shell.test.ts test/frontend/assets.test.ts test/frontend/sidebar.test.ts`
Expected: PASS.

- [ ] **Step 6: Fix the existing tests that named the old bar**

Run: `node --test "test/frontend/*.test.ts" 2>&1 | grep -E "^not ok|✖|^ℹ (pass|fail)"`
For each failure caused by the shell (a `tab-<id>` key, the `.bar`/`.tabs` markup, the hero "+ Add" button `data-fk=add`, the Show list at the foot of the Week), update the test to the new name or location: `tab-<id>` becomes `side-<id>`; Replan and + New are found in the sidebar; the Week's filter assertions move to `sidebar.test.ts` (already covered) and the week tests keep only what the Week still owns. **Update, never delete or loosen an assertion without replacing what it protected.** `test/frontend/menu.test.ts` should not need changes (the Menu component is untouched).

Expected: all frontend tests pass.

- [ ] **Step 7: Commit**

```bash
git add public/js/main.js public/css/tokens.css public/css/shell.css public/index.html test/frontend
git commit -m "feat: the sidebar and the soft-panel shell replace the top bar"
```

---

### Task 4: The Week screen in the new style

**Files:**
- Modify: `public/js/week.js`, `public/css/shell.css`
- Test: `test/frontend/week.test.ts` (update and extend)

**Interfaces:**
- Consumes: the Task 1 tint, Task 3 shell; `model.title`, `model.week`, `model.year`, `model.days`, `needsYou`, `isEmpty`, `actions.*` (unchanged).
- Produces: the Week hero (`div.hero` with `div.titles` > `h1[data-fk=week-header]` and `p.sub.mono`; `div.right` with `div.step`, `div.switch[role=group]` of `a[data-fk=view-day|view-week|view-month]`, and the status chip/`button.needs[data-fk=needs]`); no `.meta`, no "7 days", no `hero-add`, no filters at the foot (they live in the sidebar).

- [ ] **Step 1: Write/adjust the failing tests**

In `test/frontend/week.test.ts`:

1. Change the hero test (line ~38): keep the assertions on the ISO week and range text (`Week 42 / 2026` and the title); replace `assert.match(textOf(el), /7 days/)` with `assert.doesNotMatch(textOf(el), /7 days/)`.
2. Add:

```ts
test('the hero has a Day, Week, Month switch with Week current', () => {
  const el = render();                                       // use this file's own render helper
  const keys = findAll(el, (e: any) => (e.getAttribute('data-fk') ?? '').startsWith('view-'));
  assert.deepEqual(keys.map((e: any) => e.getAttribute('data-fk')), ['view-day', 'view-week', 'view-month']);
  assert.equal(findAll(el, (e: any) => e.getAttribute('data-fk') === 'view-week')[0].getAttribute('aria-current'), 'page');
  assert.equal(findAll(el, (e: any) => e.getAttribute('data-fk') === 'view-month')[0].getAttribute('href'), '#/month');
});

test('the Week no longer carries its own Show list or a hero Add button (the sidebar does)', () => {
  const el = render();
  assert.equal(byClass(el, 'filters').length, 0);
  assert.equal(findAll(el, (e: any) => e.getAttribute('data-fk') === 'add').length, 0);
});

test('every day still shows its Booked line under the date', () => {
  const el = render();
  assert.equal(byClass(el, 'booked').length, 7);
  assert.match(textOf(byClass(el, 'booked')[0]), /Booked/);
});

test('first run offers Add a fixed time first and Load the example beside it', () => {
  const el = renderEmpty();                                  // this file's first-run helper
  const buttons = byClass(el, 'cta')[0];
  assert.match(textOf(buttons), /Add a fixed time.*Load the example/s);
  assert.ok(findAll(el, (e: any) => e.getAttribute('data-fk') === 'example').length === 1);
});
```

3. Remove the old tests that asserted the filter list and the hero Add button **only after** confirming `sidebar.test.ts` (Task 2) and `shell.test.ts` (Task 3) cover the same behavior (filters toggling, Show all, counts). Replace the `keys` list at line ~147 with `['prev', 'today', 'next', 'needs', 'view-week']`.

Use the real helper names in that file (`renderWeek(dom, view, actions)` calls); the snippets above call them `render()` and `renderEmpty()` as placeholders.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/frontend/week.test.ts`
Expected: FAIL.

- [ ] **Step 3: Change `public/js/week.js`**

Replace the `hero` and everything after `grid` as follows (the `day`, `block`, `grid` code above stays exactly as it is after Task 1):

```js
  const switcher = h('div', { class: 'switch mono', role: 'group', 'aria-label': 'View' },
    [['day', 'Day'], ['week', 'Week'], ['month', 'Month']].map(([id, name]) =>
      h('a', { class: id === 'week' ? 'on' : '', href: `#/${id}`, 'aria-current': id === 'week' ? 'page' : null, 'data-fk': `view-${id}` }, name)));

  const hero = h('div', { class: 'hero' },
    h('div', { class: 'titles' },
      h('h1', {
        tabindex: '0',
        'data-fk': 'week-header',
        onkeydown: (e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            actions.go(e.key === 'ArrowRight' ? 1 : -1);
          }
        },
      }, model.title),
      h('p', { class: 'sub mono' }, `Week ${model.week} / ${model.year}`)),
    h('div', { class: 'right' },
      h('div', { class: 'step mono' },
        h('button', { type: 'button', 'data-fk': 'prev', 'aria-label': 'Previous week', onclick: () => actions.go(-1) }, 'Prev'),
        h('button', { type: 'button', 'data-fk': 'today', onclick: () => actions.today() }, 'Today'),
        h('button', { type: 'button', 'data-fk': 'next', 'aria-label': 'Next week', onclick: () => actions.go(1) }, 'Next')),
      switcher,
      status));

  const grid = h('div', { class: 'grid' }, axisEl(dom, hours), model.days.map(day));

  if (isEmpty) {
    return h('section', { class: 'week' }, hero,
      h('div', { class: 'lead' },
        h('p', {}, 'Nothing planned yet. Start with what is fixed: classes, work, lessons. I plan everything else around it.'),
        h('div', { class: 'cta' },
          actions.canAdd && h('a', { class: 'btn y', href: '#/commitments/new' }, 'Add a fixed time'),
          h('button', { type: 'button', class: 'btn', 'data-fk': 'example', onclick: () => actions.loadExample() }, 'Load the example'))),
      grid);
  }

  return h('section', { class: 'week' }, hero, travelOff && h('p', { class: 'travel-off mono' }, 'Travel is off. Add a Home place.'), grid);
```

Delete the now-unused `addDate`, `swatch`, `filters` and the `hidden` default in the destructure if nothing else uses them (`hidden` is still passed in `view` by `main.js`; leaving it destructured is harmless). The `paint` import is no longer used in this file: remove it from the import (keep `lookClass` and `paintTile`).

- [ ] **Step 4: Append the Week styling to `public/css/shell.css`**

```css
/* Week header */
.hero .titles .sub { margin: 4px 0 0; color: var(--muted); }
.hero .right { align-items: center; gap: 12px; flex-wrap: wrap; justify-content: flex-end; }
.step { padding-bottom: 0; }
.step button { border: 1px solid #D5D8DE; border-radius: 8px; padding: 7px 12px; font-size: 14px; }
.switch { display: inline-flex; gap: 2px; padding: 2px; border-radius: 10px; background: var(--soft); }
.switch a { padding: 7px 12px; border-radius: 8px; text-decoration: none; color: var(--ink); font-family: var(--font-sans); font-size: 14px; font-weight: 600; letter-spacing: 0; text-transform: none; }
.switch a.on { background: var(--ink); color: var(--paper); }
.needs { font-size: 13px; }

/* Day columns: weekday, a big numeral, then Booked. The axis head must match the two heights below. */
.grid { margin: 20px 28px 0; }
.axis-head { height: 76px; }
.day .dh { height: 54px; padding: 6px 0 0; flex-direction: column; align-items: center; justify-content: center; gap: 2px; border-top: 0; text-decoration: none; }
.day .dh .mono { color: var(--muted); font-size: 11px; }
.day .dh .dd { font-size: 22px; font-weight: 800; letter-spacing: -.03em; line-height: 1; }
.day.today .dh { background: transparent; color: var(--ink); padding: 6px 0 0; border-top: 0; }
.day.today .dh .mono, .day.today .dh .dd { color: var(--study); }
.day .booked { height: 22px; line-height: 22px; text-align: center; font-size: 10px; }
.day.today .cbody { background-color: var(--today); }
.cbody { border-radius: 8px; }

/* Blocks */
.tile { border-radius: 10px; }
.tile.is-missed { border-radius: 10px; }
.tick { border-radius: 7px; }
.now { border-top: 2px solid var(--study); }
.now i { background: var(--study); }

/* First run */
.lead p { font-size: 20px; }
.cta .btn { border-radius: 8px; }
.cta .btn.y { border-color: var(--study); }
```

Check these against the existing `app.css` rules they override (`.day .dh`, `.day.today .dh`, `.day .booked`, `.axis-head`, `.now`, `.grid` at lines ~96, 447-470): each must be matched at the same or higher specificity (the selectors above are written to be). If `.hline` has its own color, leave it.

- [ ] **Step 5: Run to verify they pass**

Run: `node --test test/frontend/week.test.ts test/frontend/shell.test.ts test/frontend/e2e.test.ts test/frontend/screens-e2e.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add public/js/week.js public/css/shell.css test/frontend/week.test.ts
git commit -m "feat: the Week in the new style: switch, big date numerals, today tint, soft blocks"
```

---

### Task 5: Nudge's bubble as a white card

**Files:**
- Modify: `public/css/shell.css`
- Test: `test/frontend/assets.test.ts` (extend with a guard on the bubble colors and that no mascot rule is overridden)

**Interfaces:**
- Consumes: the markup `nudge.js` already builds (`.say`, `.quiet`, `.acts`, `.ask`, `.pg`, `.earlier`, `.k`, `.reply`, `.notice`, `.mascot-*`), unchanged.
- Produces: CSS only.

- [ ] **Step 1: Write the failing guard test**

Append to `test/frontend/assets.test.ts`:

```ts
test('the bubble is a white card in shell.css and the mascot is left alone', () => {
  const css = readFileSync('public/css/shell.css', 'utf8');
  assert.match(css, /\.say, \.quiet \{[^}]*background: var\(--panel\)/);
  assert.match(css, /\.say :focus-visible, \.quiet :focus-visible \{ outline-color: var\(--ink\)/);
  assert.doesNotMatch(css, /\.mascot/, 'Nudge\'s faces are not styled here');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/frontend/assets.test.ts`
Expected: FAIL.

- [ ] **Step 3: Append to `public/css/shell.css`**

```css
/* Nudge's bubble: a white rounded card; one vermilion main button, the rest quiet. His faces are untouched. */
.say, .quiet { background: var(--panel); color: var(--ink); border-radius: 16px; box-shadow: 0 8px 28px rgba(20, 22, 26, .18); }
.say { padding: 16px 18px; }
.say p, .quiet span { color: var(--muted); }
.say .k { color: var(--study); }
.say .reply, .quiet .reply { color: var(--ink); }
.notice { color: var(--muted); }
.say .reply:not(:empty), .quiet .reply:not(:empty) { background: var(--soft); border-radius: 10px; padding: 9px 11px; }
.acts button { border: 1px solid #D5D8DE; border-radius: 8px; color: var(--ink); }
.acts button:hover:not(:disabled) { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.acts button.y { background: var(--study); border-color: var(--study); color: var(--on-study); }
.acts button.y:hover:not(:disabled) { background: var(--ink); border-color: var(--ink); color: var(--paper); }
.pg button { border: 1px solid #D5D8DE; border-radius: 8px; color: var(--ink); }
.ask { border-top-color: var(--hair); }
.ask input { color: var(--ink); }
.ask input:focus-visible { outline-color: var(--ink); }
.earlier { border-top-color: var(--hair); }
.earlier .q, .ask-extra .sent, .ask-extra .asked { color: var(--muted); }
.earlier .a { color: var(--ink); }
.say :focus-visible, .quiet :focus-visible { outline-color: var(--ink); }
.say .pg button:focus-visible { outline-color: var(--ink); }
```

Everything the old rules colored with `var(--paper)` on the dark bubble is flipped here. After writing, search `app.css` for any other rule using `var(--paper)` or `#444` inside `.say`, `.quiet`, `.earlier` or `.ask` (lines ~46-85) and make sure each has an override above; add any missing one.

- [ ] **Step 4: Run the front-end suite**

Run: `node --test "test/frontend/*.test.ts" 2>&1 | grep -E "^ℹ (tests|pass|fail)|^not ok"`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add public/css/shell.css test/frontend/assets.test.ts
git commit -m "feat: Nudge's bubble is a white rounded card; his faces are untouched"
```

---

### Task 6: Guides, the whole suite, and the handover

**Files:**
- Modify: `docs/ui-visual-check.md`

- [ ] **Step 1: Add the visual check**

Append a section "The new shell and Week (slice 1)" to `docs/ui-visual-check.md` in the file's style:

```markdown
## The new shell and Week (slice 1)

Start the planner and load the example if the Week is empty.

1. The page is a grey canvas with a sidebar on the left and the Week on a white rounded panel. There is no top bar, no tabs and no black Menu button.
2. The sidebar lists, in order: Plan (Week, Day, Month, Deadlines), What goes in (Commitments, Tasks, Due dates), Details (Labels, Places, Commutes), and Settings. The current screen is white and bold. A black **+ New** is at the top and **Replan** at the bottom.
3. The Week title is about 28 px (not huge). On the right: Prev, Today, Next, a Day / Week / Month switch with Week dark, and "All clear" or "N need you".
4. Each day shows the weekday in small type, a big date numeral, and "Booked 3h25" under it. Today's numeral is vermilion and its column has a faint warm tint. The current-time line is vermilion. The hour labels line up with the columns.
5. Blocks are soft tints of their label's color with dark text from the same color, rounded. Ticking one fades it; "not done" is dashed. A label with a pale color (try Sand) is still readable.
6. Under the sidebar's pages there is a Labels list with counts. Click one: its blocks disappear from the Week and it greys. "Show all" appears and brings them back. Reload: your choice is remembered. On Settings the Labels list is not shown.
7. Press / : the jump-to search opens. Type "tasks", press Enter: Tasks opens and the sidebar marks it.
8. Make the window narrow (under 860 px): the sidebar hides and a Menu button appears; it slides the sidebar in, and choosing a screen closes it.
9. Nudge: hover the bottom-right corner (he peeks), click him. The bubble is a white card with rounded corners. With a warning, the main button is vermilion and the others are outlined. The chat box and Earlier are readable. His face is the same as before for every situation.
10. With an empty planner (First run): "Nothing planned yet..." with **Add a fixed time** (vermilion) and **Load the example** beside it.
```

- [ ] **Step 2: Run the whole suite**

Run: `npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)|^✖"`
Expected: all pass. The two performance tests and the Maps refresh test can fail occasionally under load; if only those fail, rerun them alone with `node --test test/perf.test.ts test/frontend/maps-e2e.test.ts` and report both runs.

- [ ] **Step 3: Commit**

```bash
git add docs/ui-visual-check.md
git commit -m "docs: how to check the new shell and Week"
```

- [ ] **Step 4: Hand over**

Tell the user: do the "The new shell and Week (slice 1)" steps in `docs/ui-visual-check.md` in a browser and say what looks off. Do not push until they say so. Slices 2 (setup and adding) and 3 (the rest) get their own plans after the user has looked at this slice.
