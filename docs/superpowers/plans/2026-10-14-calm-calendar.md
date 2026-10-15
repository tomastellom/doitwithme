# Calm calendar blocks and Hanken Grotesk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Week and Day grids look calm: soft-tinted blocks with no black borders, a small light tick, one line of text on short blocks, a plain light commute block, and the calendar text set in Hanken Grotesk (self-hosted) with even-width digits.

**Architecture:** Front end only (`public/`). A self-hosted `hanken-grotesk.woff2` plus a `--font-cal` token; a small JS change so short blocks show only their name and tall blocks drop the kind line; the outlined-label look moves to a thin soft border in `paintTile`; everything else is new CSS appended to `public/css/shell.css` (loaded after `app.css`, so the old rules are overridden, never edited). The tick stays a real, 24 px, keyboard-reachable button; only its drawn circle becomes small and light.

**Tech Stack:** Vanilla ES modules with the `h()` helper, the fake DOM in `test/frontend/fakedom.ts`, `node:test` (`npm test` = `node --test "test/**/*.test.ts"`; NEVER vitest).

**Spec:** `docs/superpowers/specs/2026-10-13-ui-redesign-design.md` (the look: soft tints, plain words, no black borders) plus the user's decisions of 2026-10-14 in chat: the "calm blocks" mockup, and Hanken Grotesk for the calendar content only (block names, times, hour labels, weekday and date numbers, the Booked line), with titles and the sidebar staying Bricolage and small labels elsewhere staying DM Mono.

## Global Constraints

- No emojis. No gradients anywhere in `shell.css` (the grey travel hatch in `app.css` is the only gradient in the app; this plan overrides it with a flat fill). No purple. No inline `style=""` attributes (positions and colors go through the `style` object of `h()` or CSS). Text only through `h()`/text nodes, never `innerHTML`.
- Fonts: Hanken Grotesk is self-hosted (`public/fonts/hanken-grotesk.woff2`), declared in `public/css/tokens.css`, never loaded from another origin (`tokens.css` and `app.css` checks in `assets.test.ts`: no `http(s)://`). Bricolage Grotesque and DM Mono stay for everything outside the calendar grids.
- Accessibility stays: every block still has `title` and `aria-label` with its full time and label; the tick stays a `<button>` with its `aria-pressed`, `aria-label`, keyboard focus and a visible focus ring; the hit target stays 24 px even though the drawn circle is 14 px; text on every tint still reads at 4.5:1 (the tint rule from slice 1 is untouched).
- Nudge's twelve faces and `createMascot` are not touched. No change to `src/`, the data, the API or what the planner does.
- `app.css` is not edited. New CSS goes in `public/css/shell.css` at equal or higher specificity than the `app.css` rule it overrides. `assets.test.ts` checks on both files (no external URLs, no gradients) keep passing.
- Existing tests are updated to new names and behavior only where the behavior really changed (a short block no longer shows its time; a tall block no longer shows its kind line); never delete or loosen an assertion without replacing what it protected, and list every changed test in the report.
- Every commit ends with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Do not push.

## Rulings made while planning (record in the ledger)

- Ruling: the commute block becomes a **flat light-grey tile with a thin dashed border** (no hatch), because the grey hatch is an `app.css` gradient and `shell.css` may contain none. Cost if wrong: one rule to change.
- Ruling: the time format stays `08:00–08:55` (en dash) instead of the mockup's "08:00 to 08:55", to avoid rewriting every test and label for no calm gain. Cost if wrong: one string.
- Ruling: the **Day** keeps the duration in its time line (`10:00–12:00 · 120 min`), since a wide Day block has room for it; it only loses the kind line and the time on short blocks. Cost if wrong: one string.
- Ruling: the done/not-done states keep their meaning (faded plus strikethrough; dashed) but with thinner lines (1 px). Cost if wrong: one rule.

## Review Focus

- A short block (under about 46 px) shows only its name, and never clips: the time is still in its `title` and `aria-label`. (Task 2)
- A done block is still recognizable (faded, struck, filled tick) and a not-done block is still dashed. (Task 3)
- The tick is still operable by keyboard and has a visible focus ring, and its hit area is still 24 px. (Task 3)
- The font really loads: the `.woff2` exists, is a real woff2, and is referenced only from `tokens.css`. (Task 1)
- The calendar text, hour labels and weekday labels use the new font; titles and the sidebar do not. (Task 3)
- A label color that is pale or dark still reads on its tint, and an outlined label still looks outlined. (Task 2)

---

### Task 1: Self-host Hanken Grotesk

**Files:**
- Create: `public/fonts/hanken-grotesk.woff2`
- Modify: `public/css/tokens.css`, `public/fonts/README.txt`
- Test: `test/frontend/assets.test.ts` (extend)

**Interfaces:**
- Produces: the CSS custom property `--font-cal: 'Hanken Grotesk', var(--font-sans);` in `tokens.css` and a `@font-face` for family `Hanken Grotesk` (weights 400 to 700, `font-display: swap`) pointing at `/fonts/hanken-grotesk.woff2`.

- [ ] **Step 1: Write the failing tests**

Append to `test/frontend/assets.test.ts` (it already imports `readFileSync`, `existsSync`/`statSync` and `join`; add what is missing):

```ts
test('Hanken Grotesk is self-hosted as a real woff2 and declared in tokens.css only', () => {
  const path = join('public/fonts', 'hanken-grotesk.woff2');
  const bytes = readFileSync(path);
  assert.equal(bytes.subarray(0, 4).toString('latin1'), 'wOF2', 'it is a woff2 file');
  assert.ok(bytes.length > 10_000 && bytes.length < 400_000, `a plausible size (${bytes.length})`);
  const tokens = readFileSync('public/css/tokens.css', 'utf8');
  assert.match(tokens, /font-family: 'Hanken Grotesk'/);
  assert.match(tokens, /url\('\/fonts\/hanken-grotesk\.woff2'\)/);
  assert.match(tokens, /font-weight: 400 700/);
  assert.match(tokens, /--font-cal: 'Hanken Grotesk'/);
  assert.doesNotMatch(tokens, /https?:\/\//);
});

test('the font is served by the local server with the right type', () => {
  const server = readFileSync('src/server.ts', 'utf8');
  assert.match(server, /'\.woff2': 'font\/woff2'/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/frontend/assets.test.ts`
Expected: FAIL (file missing).

- [ ] **Step 3: Get the font file**

Hanken Grotesk is an open-source font (SIL Open Font License). Download the Latin variable woff2 from Google Fonts:

```bash
CSS=$(curl -sS -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15" "https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400..700&display=swap")
printf '%s\n' "$CSS" | head -40
```

In the CSS that comes back, find the `@font-face` block whose comment says `/* latin */` (not `latin-ext`, `vietnamese`…) and take its `src: url(https://fonts.gstatic.com/....woff2)`. Download it:

```bash
curl -sS -o public/fonts/hanken-grotesk.woff2 "<that url>"
node -e "const b=require('fs').readFileSync('public/fonts/hanken-grotesk.woff2');console.log(b.subarray(0,4).toString('latin1'), b.length)"
```

Expected: `wOF2` and a size between 10 KB and 400 KB. If the network is unavailable or the file is not a woff2, STOP and report BLOCKED (do not invent a font file).

Add to `public/css/tokens.css`, after the existing `@font-face` blocks:

```css
@font-face {
  font-family: 'Hanken Grotesk';
  src: url('/fonts/hanken-grotesk.woff2') format('woff2');
  font-weight: 400 700;
  font-style: normal;
  font-display: swap;
}
```

and in `:root` add `--font-cal: 'Hanken Grotesk', var(--font-sans);` (after `--font-mono`). Append to `public/fonts/README.txt` a line saying Hanken Grotesk (Hanken Design Co., SIL Open Font License 1.1, from Google Fonts, Latin subset, variable weight 400 to 700) is used for the calendar grids.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/frontend/assets.test.ts test/server.static.test.ts`
Expected: PASS. If `server.static.test.ts` lists the fonts it serves, add the new file there too (names only).

- [ ] **Step 5: Commit**

```bash
git add public/fonts/hanken-grotesk.woff2 public/fonts/README.txt public/css/tokens.css test/frontend/assets.test.ts
git commit -m "feat: Hanken Grotesk, self-hosted, for the calendar grids"
```

---

### Task 2: Short blocks say only their name; outlined blocks get a soft border

**Files:**
- Modify: `public/js/week.js` (`block`), `public/js/day.js` (`lines`), `public/js/labels.js` (`paintTile` outline branch)
- Test: `test/frontend/week.test.ts`, `test/frontend/day.test.ts`, `test/frontend/labels.test.ts`

**Interfaces:**
- Consumes: `mixHex` from `public/js/colors.js`; `paintTile` (slice 1); the tile `size` values `'one'`, `'two'`, `'full'` from `timegrid.js` (`sizeOf`, `dayTileSize`).
- Produces: Week block contents: size `one` → `[span.n]` only; sizes `two` and `full` → `[span.n, span.t]` (no `span.k` kind line any more); a missed/waived block still shows its `span.tag` instead of the time (also on size `one`, so a not-done state is never lost). Day block contents: size `one` → `[span.n]`; `full` → `[span.n, span.t]` where `span.t` stays `${timeOf(r)} · ${r.end - r.start} min`; a missed/waived block still shows its tag. `paintTile` outline branch: `borderColor = mixHex(color, '#FFFFFF', 0.55)`, `background = '#FFFFFF'`, `color = '#40454D'`; filled and done branches unchanged.
- Every block keeps its `title` (`name, time`) and `aria-label` (name, time, label, status) exactly as now.

- [ ] **Step 1: Write/adjust the failing tests**

In `test/frontend/labels.test.ts` change the outline assertion of the `paintTile` test to the soft border and add a second case:

```ts
test('paintTile gives an outlined label a thin soft border in its own hue, on paper', () => {
  const doc: any = new FakeDocument();
  const outline = doc.createElement('div');
  paintTile(outline, '#1746F0', 'outline');
  assert.equal(outline.style.borderColor, mixHex('#1746F0', '#FFFFFF', 0.55));
  assert.notEqual(outline.style.borderColor, '#111111', 'never a black frame');
  assert.equal(outline.style.background, '#FFFFFF');
  assert.equal(outline.style.color, '#40454D');
});
```

(Import `mixHex` from `../../public/js/colors.js` in that file.) In `test/frontend/week.test.ts` (use that file's helpers for rendering a Week with items of different heights) add:

```ts
test('a short block shows only its name; its time stays in the tooltip and the screen-reader label', () => {
  const el = renderWeekWith([{ title: 'Quick call', start: 600, end: 630 }]);   // 30 minutes: a "one" tile
  const tile = findAll(el, (e: any) => (e.getAttribute('data-fk') ?? '').startsWith('blk-'))[0];
  assert.equal(byClass(tile, 'n').length, 1);
  assert.equal(byClass(tile, 't').length, 0, 'no time line on a short block');
  assert.match(tile.getAttribute('title'), /10:00–10:30/);
  assert.match(tile.getAttribute('aria-label'), /10:00–10:30/);
});

test('a tall block shows its name and time and no kind line', () => {
  const el = renderWeekWith([{ title: 'Chemistry lecture', start: 600, end: 720 }]);   // 2 hours: a "full" tile
  const tile = findAll(el, (e: any) => (e.getAttribute('data-fk') ?? '').startsWith('blk-'))[0];
  assert.equal(byClass(tile, 'k').length, 0);
  assert.match(textOf(byClass(tile, 't')[0]), /10:00–12:00/);
});

test('a block that was not done still says so on a short tile', () => {
  const el = renderWeekWith([{ title: 'Quick call', start: 600, end: 630, status: 'missed' }]);
  const tile = findAll(el, (e: any) => (e.getAttribute('data-fk') ?? '').startsWith('blk-'))[0];
  assert.equal(byClass(tile, 'tag').length, 1);
});
```

(`renderWeekWith` stands for whatever helper `week.test.ts` already uses to render a week containing given items; use it, and make the items carry the fields that helper expects.) Update every existing Week test that asserted the kind line (`.k`) on tall blocks or a time on a short block to the new contents (only these two behaviors changed). In `test/frontend/day.test.ts` add the same three cases for the Day (a short block: name only; a tall block: `10:00–12:00 · 120 min`, no `.k`; a missed short block keeps its tag) and update old assertions the same way.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/frontend/labels.test.ts test/frontend/week.test.ts test/frontend/day.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`public/js/labels.js`: import `mixHex` (`import { PALETTE, mixHex, onColor, tintOf } from './colors.js';`) and change the outline branch of `paintTile` only:

```js
export function paintTile(node, color, style, { done = false } = {}) {
  if (done) return paint(node, color, style, { done });
  if (style === 'outline') {
    // A thin soft border in the label's own hue, on paper: outlined, never a black frame.
    node.style.borderColor = mixHex(color, '#FFFFFF', 0.55);
    node.style.background = '#FFFFFF';
    node.style.color = '#40454D';
    return;
  }
  const { fill, text } = tintOf(color);
  node.style.background = fill;
  node.style.color = text;
}
```

`public/js/week.js` `block()`: replace the `lines` computation:

```js
    // A short block says only its name (its time is in the tooltip and the screen-reader label); a block that was not done keeps its tag.
    const lines = size === 'one'
      ? [h('span', { class: 'n' }, name), off && when]
      : [h('span', { class: 'n' }, name), when];
```

(`when` is already `span.tag` for off states and `span.t` otherwise; for size `one` the `span.t` is no longer shown.) `public/js/day.js` `lines`:

```js
  const lines = (r, shown, size) => {
    const off = r.status === 'missed' || r.status === 'waived';
    const when = off ? h('span', { class: 'tag' }, TAG[r.status]) : h('span', { class: 't' }, `${timeOf(r)} · ${r.end - r.start} min`);
    return size === 'one' ? [h('span', { class: 'n' }, shown), off && when] : [h('span', { class: 'n' }, shown), when];
  };
```

Check the callers of `lines` and `h()`'s handling of `false` children (it drops them) and keep the `title` and `aria-label` of both builders unchanged.

- [ ] **Step 4: Run to verify they pass**

Run: `node --test test/frontend/labels.test.ts test/frontend/week.test.ts test/frontend/day.test.ts test/frontend/colors.test.ts`, then `node --test "test/frontend/*.test.ts"`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/js/week.js public/js/day.js public/js/labels.js test/frontend/week.test.ts test/frontend/day.test.ts test/frontend/labels.test.ts
git commit -m "feat: short blocks say only their name, tall ones drop the kind line, outlines get a soft border"
```

---

### Task 3: The calm look in CSS, and the font inside the grids

**Files:**
- Modify: `public/css/shell.css`
- Test: `test/frontend/assets.test.ts` (extend)

**Interfaces:**
- Consumes: the markup of Tasks 1 and 2 and the existing classes: `.tile` (`.one`, `.two`, `.full`, `.has-tick`, `.is-outline`, `.is-done`, `.is-missed`, `.travel`), `.dv-blk`, `.n`, `.t`, `.tag`, `.tick` (`.on`), `.axis-body span`, `.dh .mono`, `.dd`, `.booked`, `.now`; `--font-cal` (Task 1), `--ink`, `--paper`, `--muted`, `--soft`, `--edge`.
- Produces: only CSS.

- [ ] **Step 1: Write the failing tests**

Append to `test/frontend/assets.test.ts`:

```ts
test('shell.css sets the calendar grids in the calendar font and keeps gradients out', () => {
  const css = readFileSync('public/css/shell.css', 'utf8');
  assert.match(css, /\.week \.grid, \.dv-grid \{[^}]*font-family: var\(--font-cal\)/);
  assert.match(css, /font-variant-numeric: tabular-nums/);
  assert.doesNotMatch(css, /gradient/i);
  assert.doesNotMatch(css, /var\(--font-cal\)[^;]*;[^}]*\.side/, 'the sidebar is not set in the calendar font');
});

test('the tick is a 24px button with a small drawn circle and a visible focus ring', () => {
  const css = readFileSync('public/css/shell.css', 'utf8');
  assert.match(css, /\.tick \{[^}]*width: 24px[^}]*height: 24px/);
  assert.match(css, /\.tick::before \{[^}]*width: 14px[^}]*height: 14px/);
  assert.match(css, /\.tick:focus-visible \{[^}]*outline: 2px solid var\(--ink\)/);
});

test('blocks are soft: no thick black borders on tiles, ticks, commutes or not-done blocks', () => {
  const css = readFileSync('public/css/shell.css', 'utf8');
  const calm = css.slice(css.indexOf('/* Calm blocks'));
  assert.ok(calm.length > 200, 'the calm block section exists');
  assert.doesNotMatch(calm, /border: 2px solid var\(--ink\)/);
  assert.match(calm, /\.tile\.travel \{[^}]*border: 1px dashed/);
  assert.match(calm, /\.tile\.is-missed \{[^}]*border: 1px dashed/);
  assert.match(calm, /\.tile\.is-done \.n[^{]*\{[^}]*text-decoration-thickness: 1px/);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/frontend/assets.test.ts`
Expected: FAIL.

- [ ] **Step 3: Append to `public/css/shell.css`**

```css
/* Calm blocks (Week and Day grids): soft tints, no black borders, a small light tick, one font with even-width digits. */
.week .grid, .dv-grid { font-family: var(--font-cal); font-variant-numeric: tabular-nums; }
.week .grid .mono, .dv-grid .mono, .axis-body span, .booked.mono { font-family: var(--font-cal); }
.day .dh .dd { font-weight: 700; }

.tile { border-radius: 8px; }
.tile.one, .tile.two, .tile.full { padding: 5px 8px; }
.tile.one { padding-top: 0; padding-bottom: 0; }
.tile.has-tick, .dv-blk.tile.has-tick, .dv-blk.tile.one.has-tick, .tile.one.has-tick { padding-left: 32px; }
.tile .n, .tile.one .n, .tile.two .n, .tile.full .n, .dv-blk.tile .n { font-size: 13px; font-weight: 600; line-height: 1.2; letter-spacing: 0; }
.tile .t, .tile.one .t, .tile.two .t, .tile.full .t { font-family: var(--font-cal); font-size: 11px; font-weight: 400; letter-spacing: 0; opacity: .7; }
.tile.is-outline { border: 1px solid; }
.tile.is-outline, .tile.travel { padding-top: 5px; padding-bottom: 5px; }
.tile.one.is-outline, .tile.one.travel { padding-top: 0; padding-bottom: 0; padding-left: 32px; }

/* Commutes: a flat light tile with a thin dashed edge (the hatch and its black frame are gone). */
.tile.travel { border: 1px dashed var(--edge); background: var(--soft); color: var(--muted); }
.tile.travel .n { font-size: 12px; font-weight: 500; }

/* Done is faded and struck with a thin line; not done is dashed and thin. */
.tile.is-done .n, .drow.is-done .dname b { text-decoration-thickness: 1px; }
.tile.is-missed { border: 1px dashed var(--edge); background: var(--paper); color: var(--muted); }
.tile .tag { padding: 1px 6px; border-radius: 99px; background: var(--soft); color: var(--muted); font-family: var(--font-cal); font-size: 10px; letter-spacing: .04em; }

/* The tick: still a 24px button (easy to hit and to reach by keyboard), but it draws a small light circle. */
.tick { width: 24px; height: 24px; border: 0; border-radius: 50%; background: transparent; color: var(--ink); }
.tick::before { content: ''; width: 14px; height: 14px; box-sizing: border-box; border: 1.5px solid var(--ink); border-radius: 50%; opacity: .4; transition: opacity .15s ease-out; }
.tick:hover { background: transparent; }
.tick:hover::before { opacity: .8; }
.tick.on { background: transparent; }
.tick.on::before { background: var(--ink); opacity: .75; }
.tick svg { position: absolute; width: 10px; height: 10px; }
.tick:focus-visible { outline: 2px solid var(--ink); outline-offset: 1px; }
```

Notes for the implementer: (1) the tick sits absolutely over the tile and `timegrid.js` places it by a 24 px box (left 6 px, top 6 px or centered), which still holds, so do not change `timegrid.js`; the 14 px circle is centered inside that box by the button's existing `display: inline-flex; align-items: center; justify-content: center` from `app.css`; confirm that rule exists (`.tick` in `app.css`) and add it to the shell rule if it does not. (2) `.drow .tick` (the check-off list in the drawer) uses the same class and gets the same look, which is intended. (3) `--edge` is defined in `tokens.css` (slice 1 final fix). (4) Every selector above must be at equal or higher specificity than the `app.css` rule it overrides: read the `app.css` rules for `.tile`, `.tile.one`, `.tile.two`, `.tile.full`, `.tile.is-outline`, `.tile.travel`, `.travel`, `.tile.is-missed`, `.tile .tag`, `.tick`, `.tick:hover`, `.tick.on`, `.tick svg`, `.dv-blk .n` (lines ~207, ~224-227, ~459-470, ~547-557) and report each pairing in your report; fix any that loses. (5) The old `.tile.has-tick` padding of 40 px (for the 24 px square) becomes 32 px here.

- [ ] **Step 4: Run to verify they pass**

Run: `node --test test/frontend/assets.test.ts`, then `node --test "test/frontend/*.test.ts"`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/css/shell.css test/frontend/assets.test.ts
git commit -m "feat: the calendar blocks go calm: soft tints, a light tick, one font"
```

---

### Task 4: Guides and the handover

**Files:**
- Modify: `docs/ui-visual-check.md`

- [ ] **Step 1: Add the visual check**

Append a section "Calm blocks and the calendar font" to `docs/ui-visual-check.md` in the file's style:

```markdown
## Calm blocks and the calendar font

1. Open the Week with the example loaded. Blocks are soft tinted shapes with no black borders. Names are small and semibold; times are smaller and softer.
2. Each block has a small light circle on its left (not a big black square). Hover it: it darkens. Press it: it fills with a check and the block fades and strikes through. Press Tab to reach a tick: it shows a clear focus ring.
3. A short block (under about three-quarters of an hour) shows only its name, on one line, with nothing cut off. Hover it, or click it: the time is in the tooltip and the side panel.
4. A tall block shows its name and, under it, the time. There is no small "CLASS" line above the name any more.
5. Outlined labels (like Social or Personal project) show a thin soft grey border, not a thick black one.
6. A commute is a flat light-grey block with a thin dashed edge and small grey text, with no stripes and no black frame.
7. Mark something "I did not do this one": it becomes a thin dashed block with a small grey "Not done" tag.
8. The hour labels, weekday names, date numbers and the "Booked" line are in the new font (Hanken Grotesk: a calm, friendly sans-serif). The titles and the sidebar are still Bricolage. Digits line up evenly down the hour column.
9. Open a Day: its blocks look the same way, and a tall block shows its time and its length ("10:00–12:00 · 120 min").
10. Known rough edges until slice 3: Month, Settings and the forms are not part of this pass.
```

- [ ] **Step 2: Commit**

```bash
git add docs/ui-visual-check.md
git commit -m "docs: how to check the calm blocks and the calendar font"
```

- [ ] **Step 3: Hand over**

The controller runs the whole suite (`npm test`, in the background; it can take a long time under load). Tell the user: do the "Calm blocks and the calendar font" steps in `docs/ui-visual-check.md` in a browser and say what looks off. Do not push until they say so. Month, Settings and the rest are slice 3.
