# UI redesign, slice 3: the calm kit everywhere

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every screen outside the Week and Day grids gets the same calm look the user approved in the "calm kit" mockup (2026-10-15): soft filled fields instead of black-bordered boxes, quiet buttons with one vermilion main action, thin hairlines instead of thick black bars, rounded corners, plain-case small labels. That covers buttons, form fields, switches, the setup pages, Settings, Month, the Day header and side column, Due dates, the first-run lead, the side panel (drawer), and the Menu overlay.

**Architecture:** Front end only (`public/`). Almost all of it is CSS appended to `public/css/shell.css` (loaded after `app.css`, which is never edited) in named sections, one per area, re-skinning the shared classes (`.btn`, `.fld`, `.seg`, `.item`, `.cell`, `.dl`, `.drawer`, `.menu` ...) so every screen changes at once and stays consistent. Small JS changes only where the markup carries the old look: the Month cells (they flipped colours for an ink "today" cell), and the Day and Month headers (they get the same Day / Week / Month switch as the Week and lose the old "+ Add" button). A guard test at the end checks that every old heavy rule in `app.css` has an override.

**Tech Stack:** Vanilla ES modules with the `h()` helper, the fake DOM in `test/frontend/fakedom.ts`, `node:test` (`npm test` = `node --test "test/**/*.test.ts"`; NEVER vitest).

**Spec:** `docs/superpowers/specs/2026-10-13-ui-redesign-design.md` (slice 3: "Day, Month, Settings and the remaining panels restyled to match") plus the user's approval in chat on 2026-10-15 of the calm kit mockup: soft filled fields, quiet buttons with a single vermilion main action, hairlines, rounded corners; Month with soft cells and small dots and a tinted today; Settings as rows with the control on the right; a soft side panel.

## Global Constraints

- No emojis. NO gradients and not even the word "gradient" anywhere in `shell.css` (a test checks the word, including in comments): where `app.css` has a hatch gradient (`.travel`, `.strip .b.com`) override it with a flat `background:` shorthand, which also clears the image. No purple. No inline `style=""` attributes. Text only through `h()`/text nodes, never `innerHTML`.
- Fonts: Bricolage Grotesque for the interface, Hanken Grotesk (`--font-cal`) only inside the Week and Day grids and where this plan says so, DM Mono only where it already is and is not made loud. Small field labels become plain-case sans (not uppercase mono).
- Accessibility stays: every control keeps a visible focus indicator (a field's focus is a dark 1 px border plus a soft ring; a button's is the global 2 px ink outline); text on every tint reads at 4.5:1; control boundaries that are the only cue (selected segment, today cell) never rely on a faint border alone.
- Nudge's twelve faces and `createMascot` are not touched. No change to `src/`, the data, the API or what the planner does. Setup validation (`fromDraft`) and its messages are unchanged.
- `app.css` is NOT edited. New CSS goes in `public/css/shell.css` at equal or higher specificity than the `app.css` rule it overrides (when a hover or state rule in `app.css` inverts to ink, override it with the same selector text). `assets.test.ts` checks on both files keep passing.
- Existing tests are updated to new names and behavior only where the behavior really changed; never delete or loosen an assertion without replacing what it protected; list every changed test in the report.
- Every commit ends with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Do not push.

## Design tokens added in Task 1 (in `public/css/tokens.css`)

`--btn: #EEF0F3;` (soft button fill), `--btn-hover: #E4E7EC;`, `--study-hover: #E8431C;` (vermilion hover), `--ink-hover: #2B2E33;` (dark button hover), `--tint-red: #FDECE6;` (soft red notice fill; text on it is `#8A2A12`), `--tint-green: #E1F3E7;` (text on it `#14582B`). Existing tokens used: `--soft #F4F5F8`, `--hair #ECEEF1`, `--edge #868C95`, `--today #FFF3EE`, `--canvas #ECEEF2`, `--study #FF4B1F`, `--study-text #C93A12`, `--muted #55585C`, `--ink`, `--paper`.

## Rulings made while planning (record in the ledger)

- Ruling: the Day and Month headers get the same Day / Week / Month switch as the Week, and lose their old "+ Add" button (sidebar **+ New**, blank-time click and the Month cell plus cover adding; same ruling as the Week in slice 1). Cost if wrong: re-add one button each.
- Ruling: the Month **today** cell is a soft warm tint with a vermilion date (not an ink-black cell), so its dots and buttons no longer flip colours (`onInk` and the `on-ink` classes go). Cost if wrong: restyle one cell.
- Ruling: the **Menu** overlay (the `/` jump-to) becomes light (the grey canvas colour) with small plain type instead of a black full screen with 44 px type. Cost if wrong: one block of CSS.
- Ruling: the side panel keeps its width and position; only its black left bar, heavy borders and huge title change. Cost if wrong: one block of CSS.
- Ruling: the global `.mono` utility class is NOT changed (it is used in many places); only the contexts listed in this plan are re-skinned. Cost if wrong: leftover small uppercase labels elsewhere, fixable one selector at a time.

## Review Focus

- No heavy 2 px or 4 px ink border or bar is left on any screen except deliberate focus outlines and a selected colour swatch; the guard test in Task 7 enforces it. (Task 7)
- Every hover or pressed state that used to flip to solid ink now stays soft (no white-on-white, no ink flash). (Task 1)
- A field's focus is clearly visible and a disabled control still looks disabled. (Task 1)
- The Month today cell and its dots are readable and the plus/check buttons still work and are reachable. (Task 4)
- Settings rows read as "text left, control right" and still work at narrow widths. (Task 3)
- The Menu overlay is readable (no light text on a light background) and the current screen is marked. (Task 6)
- Text contrast on every new tint at 4.5:1 or better. (Tasks 1, 5)

---

### Task 1: Controls: buttons, fields, switches, chips, notices

**Files:**
- Modify: `public/css/tokens.css` (the new tokens), `public/css/shell.css` (append the section)
- Test: `test/frontend/assets.test.ts` (extend)

**Interfaces:**
- Consumes: the classes `.btn` (`.dark`, `.go`, `.new`), `.step button`, `.btns button` (`.y`, `.del`), `.estbtns button`, `.go2`, `.addbtn`, `.drawer .dbtns button`, `.drawer .skip button`, `.drawer .x`, `.hero-add`, `.cta .btn`, `.fl-all`, `.row3 button`, `.fld input/select`, `.tx`, `.row3 input/select`, `.chips input`, `.seg button`, `.chp`, `.err`, `.banner`, `.tag`, `.confirm`.
- Produces: only CSS and tokens.

- [ ] **Step 1: Write the failing tests**

Append to `test/frontend/assets.test.ts` (it already reads `public/css/shell.css` in other tests; add a small helper at the top of the new tests if none exists):

```ts
// A border or bar that is 2px or thicker (outline: and box-shadow are not borders, so focus rings pass).
const HEAVY_BORDER = /border(-top|-bottom|-left|-right)?: (2|3|4|6)px/;

const kit = (name: string) => {
  const css = readFileSync('public/css/shell.css', 'utf8');
  const start = css.indexOf(`/* Calm kit: ${name}`);
  assert.ok(start >= 0, `the "${name}" section exists`);
  const next = css.indexOf('/* Calm kit:', start + 10);
  return css.slice(start, next === -1 ? undefined : next);
};

test('tokens.css has the calm kit tokens', () => {
  const css = readFileSync('public/css/tokens.css', 'utf8');
  for (const t of ['--btn', '--btn-hover', '--study-hover', '--ink-hover', '--tint-red', '--tint-green']) assert.ok(css.includes(`${t}:`), t);
});

test('the controls section makes buttons soft, with one vermilion main action and no ink inversion on hover', () => {
  const k = kit('controls');
  assert.match(k, /\.btn, \.step button[^{]*\{[^}]*border: 0[^}]*background: var\(--btn\)/);
  assert.match(k, /\.btn\.go, \.btn\.new, \.hero-add[^{]*\{[^}]*background: var\(--study\)/);
  assert.match(k, /\.btn:hover:not\(:disabled\), \.step button:hover[^{]*\{[^}]*background: var\(--btn-hover\)/);
  assert.match(k, /\.btn\.go:hover:not\(:disabled\)[^{]*\{[^}]*background: var\(--study-hover\)/);
  assert.match(k, /\.btn\.dark[^{]*\{[^}]*background: var\(--ink\)/);
  assert.doesNotMatch(k, /:hover[^{]*\{[^}]*background: var\(--ink\);[^}]*color: var\(--paper\)/, 'no hover flips to solid ink except the dark button');
  assert.doesNotMatch(k, HEAVY_BORDER, 'no heavy 2px+ border or bar in this section (focus outlines are fine)');
});

test('the controls section gives fields a soft fill and a clear focus', () => {
  const k = kit('controls');
  assert.match(k, /\.fld input, \.fld select[^{]*\{[^}]*background: var\(--soft\)[^}]*border: 1px solid transparent/);
  assert.match(k, /\.fld input:focus[^{]*\{[^}]*border-color: var\(--ink\)[^}]*box-shadow/);
  assert.match(k, /\.fld label, \.fld \.cap \{[^}]*text-transform: none/);
});

test('the controls section restyles the switch, chips, notices and tags', () => {
  const k = kit('controls');
  assert.match(k, /\.seg \{[^}]*background: var\(--soft\)/);
  assert.match(k, /\.seg \{[^}]*border-radius: 10px/);
  assert.match(k, /\.seg button\.on \{[^}]*background: var\(--paper\)/);
  assert.match(k, /\.chp \{[^}]*border: 0/);
  assert.match(k, /\.err \{[^}]*background: var\(--tint-red\)/);
  assert.match(k, /\.banner \{[^}]*border: 0/);
  assert.match(k, /\.tag \{[^}]*text-transform: none/);
});

test('shell.css still has no gradient word', () => {
  assert.doesNotMatch(readFileSync('public/css/shell.css', 'utf8'), /gradient/i);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/frontend/assets.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add the tokens**

In `public/css/tokens.css` inside `:root` add: `--btn: #EEF0F3; --btn-hover: #E4E7EC; --study-hover: #E8431C; --ink-hover: #2B2E33; --tint-red: #FDECE6; --tint-green: #E1F3E7;`.

- [ ] **Step 4: Append to `public/css/shell.css`**

```css
/* Calm kit: controls (buttons, fields, switches, chips, notices) */

/* Buttons: soft by default, ink for the dark one, vermilion only for the one main action. */
.btn, .step button, .btns button, .estbtns button, .drawer .dbtns button, .drawer .skip button, .drawer .x, .addbtn, .fl-all, .row3 button, .go2 { border: 0; border-radius: 9px; background: var(--btn); color: var(--ink); font-weight: 600; }
.btn { min-height: 40px; padding: 8px 18px; }
.step button { padding: 7px 12px; }
.btns button, .estbtns button, .drawer .dbtns button { padding: 10px 18px; }
.btn:hover:not(:disabled), .step button:hover, .btns button:hover:not(:disabled), .estbtns button:hover, .drawer .dbtns button:hover:not(:disabled), .drawer .skip button:hover, .addbtn:hover, .fl-all:hover, .row3 button:hover { background: var(--btn-hover); color: var(--ink); }
.btn.go, .btn.new, .hero-add, .cta .btn.y, .btns button.y, .estbtns button.y, .drawer .dbtns button.y, .choice.y { background: var(--study); color: var(--on-study); }
.btn.go:hover:not(:disabled), .btn.new:hover:not(:disabled), .btns button.y:hover:not(:disabled), .estbtns button.y:hover, .drawer .dbtns button.y:hover:not(:disabled), .hero-add:hover, .choice.y:hover:not(:disabled) { background: var(--study-hover); color: var(--on-study); }
.btn.dark { background: var(--ink); color: var(--paper); }
.btn.dark:hover:not(:disabled) { background: var(--ink-hover); }
.hero-add { border: 0; border-radius: 9px; padding: 9px 16px; margin-bottom: 0; }
.cta .btn { padding: 10px 18px; font-size: 14px; }
.btns .del, .drawer .dbtns .del { background: transparent; color: var(--muted); font-weight: 500; }
.btns .del:hover:not(:disabled), .drawer .dbtns .del:hover:not(:disabled) { background: transparent; color: var(--ink); text-decoration: underline; }

/* Fields: a soft fill with no border until focused, then a dark edge and a soft ring. */
.fld input, .fld select, .tx, .row3 input, .row3 select, .chips input, .hrs select { background: var(--soft); border: 1px solid transparent; border-radius: 9px; color: var(--ink); font-family: inherit; }
.fld input, .fld select { height: 40px; padding: 0 12px; font-size: 14px; }
.tx { padding: 9px 12px; font-size: 14px; }
.fld input:focus, .fld select:focus, .tx:focus, .row3 input:focus, .row3 select:focus, .chips input:focus, .hrs select:focus { background: var(--paper); border-color: var(--ink); box-shadow: 0 0 0 3px rgba(20, 22, 26, .12); outline: none; }
.fld label, .fld .cap { font-family: var(--font-sans); font-size: 12px; letter-spacing: 0; text-transform: none; color: var(--muted); }
.fld .seg { display: flex; }

/* The switch: a soft pill with the chosen option raised. */
.seg { display: inline-flex; gap: 2px; padding: 3px; border-radius: 10px; background: var(--soft); }
.seg button { flex: 1; height: auto; min-height: 34px; margin: 0; padding: 6px 14px; border: 0; border-radius: 8px; background: transparent; color: #40454D; font-size: 14px; font-weight: 500; }
.seg button:first-child { margin-left: 0; }
.seg button.on { background: var(--paper); color: var(--ink); font-weight: 600; box-shadow: 0 1px 2px rgba(20, 22, 26, .15); }
.seg button:disabled { border: 0; color: var(--muted); opacity: .6; }

/* Chips (cancelled dates), their add button, and the small remove buttons. */
.chp { height: 32px; padding: 0 6px 0 12px; border: 0; border-radius: 99px; background: var(--soft); font-family: var(--font-sans); font-size: 13px; }
.chp button { width: 22px; height: 22px; border-radius: 50%; color: var(--muted); }
.addbtn { height: 36px; padding: 0 14px; font-family: var(--font-sans); font-size: 13px; text-transform: none; letter-spacing: 0; }
.row3 button { width: 40px; }

/* Notices and tags. */
.err { background: var(--tint-red); color: #8A2A12; border-radius: 10px; padding: 10px 14px; }
.err b { font-weight: 700; }
.err .msg { font-family: var(--font-sans); font-size: 13px; letter-spacing: 0; }
.banner { border: 0; border-radius: 10px; background: var(--soft); padding: 10px 14px; }
.banner.off { border: 0; background: var(--soft); }
.tag { font-family: var(--font-sans); font-size: 11px; letter-spacing: 0; text-transform: none; border: 0; border-radius: 99px; background: var(--soft); color: var(--muted); padding: 2px 8px; }
```

(Keep the existing `.tile .tag` rule from the calm blocks section as it is; it is more specific.)

- [ ] **Step 5: Run to verify they pass**

Run: `node --test test/frontend/assets.test.ts`, then `node --test "test/frontend/*.test.ts"`.
Expected: PASS. In the report, give a short table of each `app.css` rule these override (the `.btn`, `.step button`, hover rules at app.css ~363-370, `.fld input`, `.seg`, `.chp`, `.err`, `.banner`, `.tag` rules) and whether the new rule wins (equal specificity later wins; raise any that loses).

- [ ] **Step 6: Commit**

```bash
git add public/css/tokens.css public/css/shell.css test/frontend/assets.test.ts
git commit -m "feat: calm controls: soft buttons, filled fields, a soft switch and notices"
```

---

### Task 2: Setup pages: lists, forms, estimate card, labels, previews

**Files:**
- Modify: `public/css/shell.css`
- Test: `test/frontend/assets.test.ts` (extend)

**Interfaces:**
- Consumes: `.setup .list`, `.item` (`.on`, `.n`, `.d`, `.mono`), `.add`, `.form`, `.sec`, `.est` (`.bar2`, `.in`, `.big`, `.tg`), `.estwrap`, `.pk`, `.lsw`, `.ptile`, `.prev`, `.strip .b` (`.cls`, `.com`), `.travel`, `.confirm`, `.btns`.
- Produces: only CSS.

- [ ] **Step 1: Write the failing tests**

```ts
test('the setup section makes list rows soft, with no black bars', () => {
  const k = kit('setup');
  assert.match(k, /\.item \{[^}]*border: 0[^}]*border-radius: 10px/);
  assert.match(k, /\.item\.on \{[^}]*background: var\(--soft\)/);
  assert.match(k, /\.item \.n \{[^}]*font-size: 14px/);
  assert.match(k, /\.form \{[^}]*border-top: 0/);
  assert.match(k, /\.sec \{[^}]*border-top: 0/);
  assert.match(k, /\.add \{[^}]*border: 0/);
  assert.doesNotMatch(k, HEAVY_BORDER, 'no heavy 2px+ border or bar in this section (focus outlines are fine)');
});

test('the setup section calms the estimate card, the label swatches and the previews', () => {
  const k = kit('setup');
  assert.match(k, /\.est \{[^}]*border: 0[^}]*background: var\(--soft\)/);
  assert.match(k, /\.est \.bar2 \{[^}]*display: none/);
  assert.match(k, /\.lsw \{[^}]*border-radius: 50%/);
  assert.match(k, /\.strip \.b \{[^}]*border: 0/);
  assert.match(k, /\.strip \.b\.com \{[^}]*border: 1px dashed var\(--edge\)/);
  assert.match(k, /\.travel \{[^}]*border: 1px dashed var\(--edge\)/);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/frontend/assets.test.ts`
Expected: FAIL.

- [ ] **Step 3: Append to `public/css/shell.css`**

```css
/* Calm kit: setup pages (lists, forms, the estimate card, labels, previews) */
.setup .list { width: 320px; gap: 2px; }
.item { grid-template-columns: 1fr auto; gap: 2px 12px; padding: 10px 12px; border: 0; border-radius: 10px; color: var(--ink); }
.item:hover { background: var(--soft); }
.item.on { background: var(--soft); color: var(--ink); }
.item:last-of-type { border: 0; }
.item .n { font-size: 14px; font-weight: 600; letter-spacing: 0; line-height: 1.25; }
.item .mono { font-family: var(--font-sans); font-size: 12px; letter-spacing: 0; text-transform: none; color: var(--muted); }
.item .d { font-family: var(--font-sans); font-size: 12.5px; letter-spacing: 0; opacity: 1; color: var(--muted); }
.add { margin-top: 6px; padding: 8px 12px; border: 0; border-radius: 9px; font-weight: 600; }
.add:hover { background: var(--soft); }
.form { border-top: 0; padding-top: 0; }
.sec { margin-top: 14px; padding: 0 0 6px; border-top: 0; border-bottom: 1px solid var(--hair); }
.sec b { font-size: 15px; font-weight: 700; letter-spacing: 0; }
.btns { margin-top: 18px; }

/* The estimate card. */
.est { grid-template-columns: 1fr; gap: 0; border: 0; border-radius: 12px; background: var(--soft); }
.est .bar2 { display: none; }
.est .in { padding: 14px 16px; gap: 6px; }
.est .big { font-size: 30px; font-weight: 700; letter-spacing: -.02em; line-height: 1; }
.est .tg { border: 0; border-radius: 99px; background: var(--paper); font-family: var(--font-sans); font-size: 11px; letter-spacing: 0; text-transform: none; padding: 2px 8px; }

/* Labels: a round colour dot in lists, soft swatches, a calm preview. */
.pk { border-radius: 10px; }
.pk[aria-pressed="true"] { outline: 2px solid var(--ink); outline-offset: 2px; }
.lsw { width: 14px; height: 14px; border-radius: 50%; margin-right: 8px; }
.lsw.is-outline { border-width: 1.5px; }
.ptile { padding: 6px 12px; border-radius: 8px; font-size: 14px; }
.ptile.is-outline { padding: 5px 11px; border-width: 1px; border-style: solid; }
.prev { border-top: 0; padding-top: 0; }
.fl .sw { border-radius: 50%; }
.fl .sw.is-outline, .dv-tot .sw.is-outline { border-width: 1.5px; }

/* The commute preview strip and any other travel block: flat and light, no hatch. */
.strip .b { border: 0; border-radius: 8px; background: var(--soft); font-size: 13px; }
.strip .b.cls { background: var(--tint-red); color: #A93219; }
.strip .b.com { border: 1px dashed var(--edge); background: var(--soft); color: var(--muted); }
.travel { border: 1px dashed var(--edge); background: var(--soft); color: var(--muted); }
```

Check each override against the `app.css` rule it targets (`.item` at ~164-168, `.add` ~169, `.form` ~171, `.sec` ~300, `.est*` ~306-311, `.pk`/`.lsw`/`.ptile` ~515-523, `.strip .b` ~214-216, `.travel` ~207, `.prev` ~212) and report the pairings; fix any that loses. `.travel` also styles Week/Day commute tiles: `.tile.travel` in the calm blocks section is more specific and already sets the same values, so they stay consistent.

- [ ] **Step 4: Run to verify they pass**

Run: `node --test test/frontend/assets.test.ts`, then `node --test "test/frontend/*.test.ts"`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/css/shell.css test/frontend/assets.test.ts
git commit -m "feat: calm setup pages: soft list rows, a calm form, estimate card and previews"
```

---

### Task 3: Settings

**Files:**
- Modify: `public/css/shell.css`
- Test: `test/frontend/assets.test.ts` (extend)

**Interfaces:**
- Consumes: the Settings markup from `public/js/settings.js`: `.st-two` > `.st-col` > `.st-grp` (`.st-gh` heading, `.st-rows`) > `.st` rows each holding, in order: `b` (title), `p` (description), then the control (`.seg` or `.hrs-row` with two `label.hrs`) and optionally `.hint`; `.st-rules` (the embedded planning rules); `.st-err`.
- Produces: only CSS.

- [ ] **Step 1: Write the failing tests**

```ts
test('the settings section lays each row out as text on the left and the control on the right, with hairlines', () => {
  const k = kit('settings');
  assert.match(k, /\.st \{[^}]*display: grid[^}]*grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(k, /\.st \{[^}]*border-top: 1px solid var\(--hair\)/);
  assert.match(k, /\.st b \{[^}]*font-size: 14px[^}]*font-weight: 600/);
  assert.match(k, /\.st \.seg, \.st \.hrs-row \{[^}]*grid-column: 2/);
  assert.match(k, /\.st-grp \{[^}]*border-top: 0/);
  assert.match(k, /\.st-gh \{[^}]*text-transform: uppercase/);
  assert.doesNotMatch(k, HEAVY_BORDER, 'no heavy 2px+ border or bar in this section (focus outlines are fine)');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/frontend/assets.test.ts`
Expected: FAIL.

- [ ] **Step 3: Append to `public/css/shell.css`**

```css
/* Calm kit: settings (a row is text on the left and its control on the right) */
.st-two { gap: 48px; margin: 24px 28px 0; }
.st-grp { border-top: 0; padding-top: 0; }
.st-gh { margin-bottom: 4px; font-family: var(--font-sans); font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.st-rows { gap: 0; }
.st { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 20px; row-gap: 2px; align-items: center; padding: 14px 0; border-top: 1px solid var(--hair); }
.st-rows > .st:first-child { border-top: 0; }
.st b { grid-column: 1; grid-row: 1; font-size: 14px; font-weight: 600; letter-spacing: 0; line-height: 1.25; }
.st p { grid-column: 1; grid-row: 2; margin: 0; max-width: 380px; font-size: 13px; line-height: 1.4; color: var(--muted); }
.st .seg, .st .hrs-row { grid-column: 2; grid-row: 1 / span 2; width: auto; }
.st .seg button { height: auto; min-height: 34px; font-size: 13px; }
.st .seg button:disabled { border: 0; color: var(--muted); }
.st .hint { grid-column: 1 / -1; margin: 6px 0 0; }
.hrs-row { display: flex; gap: 8px; }
.hrs { display: flex; flex-direction: column; gap: 4px; }
.hrs span { font-family: var(--font-sans); font-size: 11px; letter-spacing: 0; text-transform: none; color: var(--muted); }
.hrs select { height: 38px; padding: 0 10px; font-size: 14px; }
.st-rules { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--hair); }
.st-err { margin: 20px 28px 0; }
@media (max-width: 700px) { .st { grid-template-columns: 1fr; } .st .seg, .st .hrs-row { grid-column: 1; grid-row: auto; margin-top: 8px; } }
```

Read `public/js/settings.js` before writing this and make the selectors match the real markup (the `hrs`, `hrs-row`, `st-*` class names and the order of `b`, `p`, control, `hint` inside a row); adjust any class that differs. Check the overrides against `app.css` ~271-283 and ~537-544.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/frontend/assets.test.ts test/frontend/settings.test.ts`, then `node --test "test/frontend/*.test.ts"`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/css/shell.css test/frontend/assets.test.ts
git commit -m "feat: calm settings: a row is text on the left and its control on the right"
```

---

### Task 4: Month

**Files:**
- Modify: `public/js/month.js`, `public/css/shell.css`
- Test: `test/frontend/month.test.ts` (update and extend), `test/frontend/assets.test.ts` (extend)

**Interfaces:**
- Consumes: `renderMonth(dom, view, actions)`; the Week header switch markup from `public/js/week.js` (`div.switch.mono[role=group][aria-label=View]` of `a[data-fk=view-day|view-week|view-month]`, current one `on` with `aria-current="page"`); `paint`, `lookClass`.
- Produces: Month markup changes: no `{ onInk }` argument on `paint` for the cell dots; the `review` and `plus` buttons no longer get an `on-ink` class; the hero loses the `+ Add` button (`data-fk=add`) and gains the switch with Month current; the hero's `.meta` block becomes `p.sub.mono` under the title (`${year} / ${due} due this month`) plus the status text in `div.right` after the switch.

- [ ] **Step 1: Write/adjust the failing tests**

In `test/frontend/month.test.ts` (use that file's helpers for rendering a month with a `today` cell and dots):

```ts
test('the Month header has the Day, Week, Month switch with Month current, and no Add button', () => {
  const el = renderMonthView();                                  // this file's helper
  const keys = findAll(el, (e: any) => (e.getAttribute('data-fk') ?? '').startsWith('view-')).map((e: any) => e.getAttribute('data-fk'));
  assert.deepEqual(keys, ['view-day', 'view-week', 'view-month']);
  assert.equal(findAll(el, (e: any) => e.getAttribute('data-fk') === 'view-month')[0].getAttribute('aria-current'), 'page');
  assert.equal(findAll(el, (e: any) => e.getAttribute('data-fk') === 'add').length, 0);
  assert.match(textOf(byClass(el, 'sub')[0]), /due this month/);
});

test('the today cell is not an ink cell: its dots and buttons are painted the same as any other day', () => {
  const el = renderMonthView({ withToday: true });
  const today = byClass(el, 'today')[0];
  assert.equal(byClass(el, 'on-ink').length, 0);
  for (const dot of byClass(today, 'dot')) assert.notEqual(dot.style.borderColor, '#FFFFFF', 'an outlined dot on the today cell does not flip to paper');
});
```

Update every existing Month test that asserted the `hero-add`/`add` key, the `.meta` block text, or the `on-ink` class/`onInk` colours, to the new behavior (list each in the report; never delete an assertion without replacing what it protected).

In `assets.test.ts`:

```ts
test('the month section is soft: calm cells, a tinted today, small round dots, soft round buttons', () => {
  const k = kit('month');
  assert.match(k, /\.heads span \{[^}]*border-top: 0/);
  assert.match(k, /\.cell \{[^}]*border-radius: 10px/);
  assert.match(k, /\.cell\.today \{[^}]*background: var\(--today\)/);
  assert.match(k, /\.dn \{[^}]*font-size: 15px/);
  assert.match(k, /\.dot \{[^}]*border-radius: 50%/);
  assert.match(k, /\.plus, \.review \{[^}]*border: 0[^}]*border-radius: 50%/);
  assert.doesNotMatch(k, HEAVY_BORDER, 'no heavy 2px+ border or bar in this section (focus outlines are fine)');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/frontend/month.test.ts test/frontend/assets.test.ts`
Expected: FAIL.

- [ ] **Step 3: Change `public/js/month.js`**

1. In the dots loop: `paint(dot, g.color, g.look);` (drop `{ onInk: c.isToday }`).
2. The `review` button class becomes `'review'`; the `plus` button class becomes `'plus'` (no `on-ink`).
3. Replace the hero with (keep `status`, `actions`, `isEmpty` as they are):

```js
  const switcher = h('div', { class: 'switch mono', role: 'group', 'aria-label': 'View' },
    [['day', 'Day'], ['week', 'Week'], ['month', 'Month']].map(([id, name]) =>
      h('a', { class: id === 'month' ? 'on' : '', href: `#/${id}`, 'aria-current': id === 'month' ? 'page' : null, 'data-fk': `view-${id}` }, name)));

  const hero = h('div', { class: 'hero' },
    h('div', { class: 'titles' },
      h('h1', {
        tabindex: '0',
        'data-fk': 'month-header',
        onkeydown: (e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            actions.go(e.key === 'ArrowRight' ? 1 : -1);
          }
        },
      }, model.title),
      h('p', { class: 'sub mono' }, `${model.year} / ${model.due} due this month`)),
    h('div', { class: 'right' },
      h('div', { class: 'step mono' },
        h('button', { type: 'button', 'data-fk': 'prev', 'aria-label': 'Previous month', onclick: () => actions.go(-1) }, 'Prev'),
        h('button', { type: 'button', 'data-fk': 'today', onclick: () => actions.today() }, 'Today'),
        h('button', { type: 'button', 'data-fk': 'next', 'aria-label': 'Next month', onclick: () => actions.go(1) }, 'Next')),
      switcher,
      h('span', { class: 'status' }, isEmpty ? 'Click a day to open it' : status)));
```

(The `.hero .titles .sub` and `.hero .right` styles from slice 1 apply.) In the first-run block change the example button class from `btn y` to `btn` (vermilion is for the one main action, **Add a fixed time**, which stays `btn y` ... check `actions.canAdd` link: make it `btn y`) so the first-run buttons match the Week's.

- [ ] **Step 4: Append to `public/css/shell.css`**

```css
/* Calm kit: month */
.hero .status { color: var(--muted); font-size: 13px; }
.heads { margin: 20px 28px 0; gap: 6px; }
.heads span { padding-top: 0; border-top: 0; font-family: var(--font-sans); font-size: 12px; letter-spacing: 0; text-align: center; text-transform: none; color: var(--muted); }
.mgrid { margin: 6px 28px 0; grid-auto-rows: 96px; gap: 6px; }
.cell { padding: 8px 10px; border-radius: 10px; background: var(--soft); }
.cell:hover { background: #EBEDF1; }
.cell.out { background: transparent; color: var(--ghost); }
.cell.out:hover { background: var(--soft); }
.cell.today { background: var(--today); color: var(--ink); }
.cell.today:hover { background: #FFE8DF; }
.cell.today .dn { color: var(--study-text); }
.cell.today .dots .more { color: var(--muted); }
.dn { font-size: 15px; font-weight: 600; letter-spacing: 0; }
.cell .due { padding: 1px 8px; border-radius: 99px; background: var(--tint-red); color: #A93219; font-family: var(--font-sans); font-size: 11px; letter-spacing: 0; text-transform: none; }
.dot { width: 9px; height: 9px; border-radius: 50%; }
.dot.is-outline { border-width: 1.5px; border-style: solid; }
.dot.is-missed { border: 1px dashed var(--edge); }
.plus, .review { width: 28px; height: 28px; border: 0; border-radius: 50%; background: var(--paper); color: var(--ink); box-shadow: 0 1px 3px rgba(20, 22, 26, .2); }
.plus:hover, .review:hover { background: var(--btn-hover); color: var(--ink); }
.review:hover svg path { stroke: var(--ink); }
.month .legend { margin: 18px 28px 0; font-family: var(--font-sans); font-size: 13px; letter-spacing: 0; text-transform: none; }
```

Check the overrides against `app.css` ~418-444 and ~496-507, ~575-583 (the `.cell.today` ink colours, `.plus.on-ink`, `.review.on-ink` no longer apply because the classes are gone).

- [ ] **Step 5: Run to verify they pass**

Run: `node --test test/frontend/month.test.ts test/frontend/assets.test.ts test/frontend/e2e.test.ts test/frontend/screens-e2e.test.ts`, then `node --test "test/frontend/*.test.ts"`.
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add public/js/month.js public/css/shell.css test/frontend
git commit -m "feat: a calm Month: soft cells, a tinted today, small dots, and the same header switch"
```

---

### Task 5: Day header and side column, Due dates, first run

**Files:**
- Modify: `public/js/day.js` (hero), `public/js/deadlines.js` (only if its hero needs a class), `public/css/shell.css`
- Test: `test/frontend/day.test.ts` (update and extend), `test/frontend/assets.test.ts` (extend)

**Interfaces:**
- Consumes: the Week header switch markup (as in Task 4); `renderDay(dom, view, actions)` hero (`h1[data-fk=day-header]`, `step` Prev/Today/Next with `prevLabel`/`nextLabel`, `meta` with `model.weekLine`, `Booked ${duration(model.booked)}`, status, `Light day` tag); `renderDeadlines` markup (`.dl-list`, `.dl`, `.dl-when`, `.dl-big`, `.dl-tt`, `.dl-sub`, `.dl-bar` (`.dl-done`, `.dl-plan`, `.dl-short`), `.dl-nums`, `.dl-chip` (`.bad`, `.ok`)); `.dv-side` (`.h`, `.dv-tot` (`.sw`, `.nm`, `.v`), `.dv-cap`, `.dv-free`); first-run `.lead` and `.cta`.
- Produces: Day hero markup: no `hero-add` button (`data-fk=add`), the Day / Week / Month switch with Day current (`a[data-fk=view-day|view-week|view-month]`; the `view-day` link points at `#/day` and the others at `#/week` and `#/month`), the title row's `.meta` replaced by `p.sub.mono` under the title holding `${model.weekLine} / Booked ${duration(model.booked)}` and, in `div.right` after the switch, the status text (`span.status`) and the `Light day` tag when it applies.

- [ ] **Step 1: Write/adjust the failing tests**

In `test/frontend/day.test.ts` (use its helpers):

```ts
test('the Day header has the Day, Week, Month switch with Day current, no Add button, and keeps Booked', () => {
  const el = renderDayView();                                     // this file's helper
  const keys = findAll(el, (e: any) => (e.getAttribute('data-fk') ?? '').startsWith('view-')).map((e: any) => e.getAttribute('data-fk'));
  assert.deepEqual(keys, ['view-day', 'view-week', 'view-month']);
  assert.equal(findAll(el, (e: any) => e.getAttribute('data-fk') === 'view-day')[0].getAttribute('aria-current'), 'page');
  assert.equal(findAll(el, (e: any) => e.getAttribute('data-fk') === 'add').length, 0);
  assert.match(textOf(byClass(el, 'sub')[0]), /Booked/);
});

test('a light day still says so in the header', () => {
  const el = renderDayView({ light: true });
  assert.match(textOf(byClass(el, 'right')[0]), /Light day/);
});
```

Update the old Day tests that asserted the `add` key or the `.meta` text accordingly (list each; keep what they protected: the weekLine, Booked and status text still appear).

In `assets.test.ts`:

```ts
test('the day and due dates section is calm: quiet side column, hairline rows, soft chips', () => {
  const k = kit('day and due dates');
  assert.match(k, /\.dv-side \.h \{[^}]*border-top: 0/);
  assert.match(k, /\.dv-free \{[^}]*font-size: 32px/);
  assert.match(k, /\.dl \{[^}]*border-top: 1px solid var\(--hair\)/);
  assert.match(k, /\.dl-big \{[^}]*font-size: 30px/);
  assert.match(k, /\.dl-tt \{[^}]*font-size: 16px/);
  assert.match(k, /\.dl-chip\.bad \{[^}]*background: var\(--tint-red\)/);
  assert.match(k, /\.dl-chip\.ok \{[^}]*background: var\(--tint-green\)/);
  assert.match(k, /\.lead p \{[^}]*font-size: 18px/);
  assert.doesNotMatch(k, HEAVY_BORDER, 'no heavy 2px+ border or bar in this section (focus outlines are fine)');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/frontend/day.test.ts test/frontend/assets.test.ts`
Expected: FAIL.

- [ ] **Step 3: Change `public/js/day.js`**

Replace the `hero` with (keep the existing `status`, `prevLabel`, `nextLabel`, `view.light` values):

```js
  const switcher = h('div', { class: 'switch mono', role: 'group', 'aria-label': 'View' },
    [['day', 'Day'], ['week', 'Week'], ['month', 'Month']].map(([id, name]) =>
      h('a', { class: id === 'day' ? 'on' : '', href: `#/${id}`, 'aria-current': id === 'day' ? 'page' : null, 'data-fk': `view-${id}` }, name)));

  const hero = h('div', { class: 'hero' },
    h('div', { class: 'titles' },
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
      h('p', { class: 'sub mono' }, `${model.weekLine} / Booked ${duration(model.booked)}`)),
    h('div', { class: 'right' },
      h('div', { class: 'step mono' },
        h('button', { type: 'button', 'data-fk': 'prev', 'aria-label': `Previous day, ${prevLabel}`, onclick: () => actions.go(-1) }, prevLabel),
        h('button', { type: 'button', 'data-fk': 'today', onclick: () => actions.today() }, 'Today'),
        h('button', { type: 'button', 'data-fk': 'next', 'aria-label': `Next day, ${nextLabel}`, onclick: () => actions.go(1) }, nextLabel)),
      switcher,
      h('span', { class: 'status' }, status),
      view.light && h('span', { class: 'tag' }, 'Light day')));
```

(Read the real `hero` code in `day.js` first and keep any other behaviors it has; `status` is currently a `span`: use its text.) The first-run block in `day.js` (if it has one with `btn y` for "Load the example") gets the same treatment as Task 4: the **Add a fixed time** link is `btn y` and "Load the example" is a plain `btn`.

- [ ] **Step 4: Append to `public/css/shell.css`**

```css
/* Calm kit: day and due dates (the header meta, the Day side column, the due dates list, the first-run lead) */
.hero .status { color: var(--muted); font-size: 13px; }
.meta { width: auto; gap: 2px; font-family: var(--font-sans); font-size: 13px; letter-spacing: 0; text-transform: none; color: var(--muted); }
.dv-body { gap: 40px; margin: 24px 28px 0; }
.dv-side .h { border-top: 0; padding-top: 0; font-family: var(--font-sans); font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.dv-free { font-size: 32px; font-weight: 700; letter-spacing: -.02em; line-height: 1; }
.dv-tot { border-bottom: 1px solid var(--hair); }
.dv-tot .nm { font-size: 14px; }
.dv-tot .v { font-family: var(--font-cal); font-size: 13px; }
.dv-tot .sw { width: 10px; height: 10px; border-radius: 50%; }

.dl-list { margin: 24px 28px 0; }
.dl { grid-template-columns: 150px 300px minmax(0, 1fr) 170px; gap: 24px; padding: 14px 0; border-top: 1px solid var(--hair); }
.dl:last-child { border-bottom: 1px solid var(--hair); }
.dl:hover { background: var(--soft); }
.dl:focus-visible { outline: 2px solid var(--ink); outline-offset: -2px; }
.dl-big { font-size: 30px; font-weight: 700; letter-spacing: -.02em; line-height: 1; }
.dl-tt { font-size: 16px; font-weight: 600; letter-spacing: 0; line-height: 1.25; }
.dl-sub { margin-top: 4px; font-family: var(--font-sans); font-size: 13px; letter-spacing: 0; text-transform: none; }
.dl-bar { height: 10px; border-radius: 99px; }
.dl-done { fill: #3B3F46; }
.dl-plan { fill: #F5A890; }
.dl-short { stroke-width: 1.5; }
.dl-nums { font-family: var(--font-cal); font-size: 12px; letter-spacing: 0; text-transform: none; }
.dl-chip { padding: 6px 12px; border-radius: 99px; font-size: 13px; }
.dl-chip.bad { background: var(--tint-red); color: #A93219; }
.dl-chip.ok { padding: 6px 12px; border: 0; background: var(--tint-green); color: #14582B; }

.lead p { font-size: 18px; font-weight: 500; letter-spacing: -.01em; }
```

Read `public/js/day.js` and `public/js/deadlines.js` for the real class names and keep the selectors accurate. The `.hero .status` rule is also appended by Task 4: if it already exists in `shell.css`, do not add it twice.

- [ ] **Step 5: Run to verify they pass**

Run: `node --test test/frontend/day.test.ts test/frontend/deadlines.test.ts test/frontend/assets.test.ts test/frontend/e2e.test.ts test/frontend/screens-e2e.test.ts`, then `node --test "test/frontend/*.test.ts"`.
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add public/js/day.js public/css/shell.css test/frontend
git commit -m "feat: a calm Day header and side column, due dates and first-run lead"
```

---

### Task 6: The side panel and the Menu overlay

**Files:**
- Modify: `public/css/shell.css`
- Test: `test/frontend/assets.test.ts` (extend)

**Interfaces:**
- Consumes: `.drawer` (`.row1`, `.x`, `h2`, `.sub2`, `.skip`, `.dfg`, `.note2`, `.dbtns`), `.drawer-root .scrim`, `.advice`, `.choices` / `.choice` (`.y`, `.off`), `.drow`, `.dname`; `.menu` (`.bar`, `.close`, `.jump` (`label`, `input`, `.key`), `.cols`, `.grp`, `.gh`, `.it` (`.on`), `.desc`, `.none`, `.foot-note`).
- Produces: only CSS.

- [ ] **Step 1: Write the failing tests**

```ts
test('the side panel is a soft card with a shadow and a calm title, not a black bar', () => {
  const k = kit('side panel and menu');
  assert.match(k, /\.drawer \{[^}]*border-left: 0[^}]*box-shadow/);
  assert.match(k, /\.drawer h2 \{[^}]*font-size: 26px/);
  assert.match(k, /\.drawer \.skip \{[^}]*border: 0[^}]*background: var\(--soft\)/);
  assert.match(k, /\.choice \{[^}]*border: 1px solid/);
  assert.match(k, /\.choice:hover \{[^}]*background: var\(--soft\)/);
  assert.match(k, /\.drow \.dname b \{[^}]*font-size: 15px/);
});

test('the menu overlay is light with small plain type and a readable current screen', () => {
  const k = kit('side panel and menu');
  assert.match(k, /\.menu \{[^}]*background: var\(--canvas\)[^}]*color: var\(--ink\)/);
  assert.match(k, /\.jump input \{[^}]*color: var\(--ink\)[^}]*font-size: 26px/);
  assert.match(k, /\.it \{[^}]*color: var\(--ink\)[^}]*font-size: 18px/);
  assert.match(k, /\.it\.on \{[^}]*color: var\(--study-text\)/);
  assert.match(k, /\.menu :focus-visible \{[^}]*outline-color: var\(--ink\)/);
  assert.doesNotMatch(k, HEAVY_BORDER, 'no heavy 2px+ border or bar in this section (focus outlines are fine)');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/frontend/assets.test.ts`
Expected: FAIL.

- [ ] **Step 3: Append to `public/css/shell.css`**

```css
/* Calm kit: side panel and menu */

/* The side panel. */
.drawer { padding: 22px 24px; border-left: 0; border-radius: 16px 0 0 16px; box-shadow: -8px 0 28px rgba(20, 22, 26, .18); }
.drawer-root .scrim { background: rgba(20, 22, 26, .3); }
.drawer h2 { font-size: 26px; font-weight: 700; letter-spacing: -.02em; line-height: 1.1; }
.drawer .skip { padding: 12px 14px; border: 0; border-radius: 12px; background: var(--soft); }
.drawer .skip span { color: #40454D; }
.advice { border-top: 1px solid var(--hair); }
.choices { gap: 8px; }
.choice { padding: 12px 14px; border: 1px solid #DFE2E7; border-radius: 12px; background: var(--paper); }
.choice b { font-size: 15px; font-weight: 600; letter-spacing: 0; }
.choice span { font-size: 13px; }
.choice:hover { background: var(--soft); color: var(--ink); }
.choice:hover span { color: var(--muted); }
.choice.y { border-color: var(--study); }
.choice.off, .choice:disabled { border-style: solid; opacity: .6; }
.choice.off:hover, .choice:disabled:hover { background: var(--paper); color: var(--muted); }
.drow { border-bottom: 1px solid var(--hair); }
.drow .dname b { font-size: 15px; font-weight: 600; letter-spacing: 0; }

/* The Menu overlay (the / jump-to): light, with small plain type. */
.menu { background: var(--canvas); color: var(--ink); }
.menu :focus-visible { outline-color: var(--ink); }
.menu .close { border: 0; border-radius: 9px; background: var(--btn); color: var(--ink); }
.jump { margin: 20px 28px 0; padding-bottom: 10px; border-bottom: 1px solid var(--edge); }
.jump label { color: var(--muted); }
.jump input { color: var(--ink); font-size: 26px; font-weight: 700; letter-spacing: -.02em; }
.jump input::placeholder { color: var(--muted); }
.jump input:focus-visible { outline: 2px solid var(--ink); outline-offset: 6px; }
.jump .key { border: 1px solid var(--edge); border-radius: 6px; color: var(--muted); }
.menu .cols { margin: 32px 28px 0; gap: 24px; }
.menu .gh { padding-top: 0; border-top: 0; color: var(--muted); }
.it { padding: 5px 0; color: var(--ink); font-size: 18px; font-weight: 600; letter-spacing: 0; }
.it.on { color: var(--study-text); }
.menu .desc, .menu .none, .foot-note { color: var(--muted); }
.menu .bar { padding: 0 28px; }
.foot-note { margin: 40px 28px; }
```

Check the `.menu` rules in `app.css` ~133-156 (every one that sets `var(--paper)` or `var(--ghost)` text colours on the old black overlay: `.menu .close`, `.jump label`, `.jump input`, `.jump input::placeholder`, `.jump .key`, `.menu .gh`, `.it`, `.it.on`, `.menu .desc`, `.menu .none`, `.foot-note`) and make sure each has an override above so no light text is left on the light background. Also override the `.menu .bar .mono` brand text if it uses a light colour. Report each pairing.

- [ ] **Step 4: Run to verify they pass**

Run: `node --test test/frontend/assets.test.ts test/frontend/menu.test.ts test/frontend/drawer.test.ts`, then `node --test "test/frontend/*.test.ts"`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/css/shell.css test/frontend/assets.test.ts
git commit -m "feat: a calm side panel and a light Menu overlay"
```

---

### Task 7: The guard test, the guide, and the handover

**Files:**
- Modify: `test/frontend/assets.test.ts`, `docs/ui-visual-check.md`, `public/fonts/README.txt`

**Interfaces:**
- Consumes: all `shell.css` sections.
- Produces: a guard test over the stylesheet pair.

- [ ] **Step 1: The guard test**

Append to `test/frontend/assets.test.ts`:

```ts
test('every heavy ink rule in app.css has an override in shell.css (the calm guard)', () => {
  const app = readFileSync('public/css/app.css', 'utf8');
  const shell = readFileSync('public/css/shell.css', 'utf8');
  // Rules that are deliberately still heavy: focus outlines, the selected colour swatch, and rules that shell.css overrides only through a more specific selector listed here.
  const ALLOWED = new Set<string>([':focus-visible', '.pk[aria-pressed="true"]']);
  const heavy = /(^|\n)([^{}\n@][^{}]*)\{([^}]*(?:2px solid var\(--ink\)|2px dashed var\(--ink\)|4px solid var\(--ink\)|3px solid var\(--ink\)|6px solid var\(--ink\))[^}]*)\}/g;
  const missing: string[] = [];
  for (const m of app.matchAll(heavy)) {
    for (const raw of m[2].split(',')) {
      const selector = raw.trim().replace(/\s+/g, ' ');
      if (!selector || ALLOWED.has(selector) || /focus-visible/.test(selector)) continue;
      if (!shell.includes(selector)) missing.push(selector);
    }
  }
  assert.deepEqual(missing, [], `these heavy app.css selectors have no override in shell.css: ${missing.join(' | ')}`);
});
```

Run it. For every selector it reports: (a) if it styles something that is genuinely still shown and heavy, add an override in the right section of `shell.css` (soft border/background per the kit) with a test line; (b) if the rule is dead (the class is no longer rendered anywhere: search `public/js` for the class name), add the selector to `ALLOWED` with a one-line comment saying why; never add a live, visible selector to `ALLOWED` just to make the test pass. Report the final list of each kind.

- [ ] **Step 2: Fix the README and add the guide**

In `public/fonts/README.txt` change the first line so it no longer says "both licensed" (there are three fonts: Bricolage Grotesque, DM Mono and Hanken Grotesk, all open-source). Append to `docs/ui-visual-check.md` a section "The calm look everywhere (slice 3)":

```markdown
## The calm look everywhere (slice 3)

1. Open each screen in turn: Month, Settings, Fixed times, To do, Due dates, Places and travel, Labels, and the Day. None of them has a thick black border, a thick black bar across the top, or a big black filled block any more.
2. Buttons are soft grey with rounded corners. Only the one main action on a screen (Save, Add a fixed time, Add a due date, Replan's neighbour + New) is vermilion. Hovering a button makes it slightly darker grey; it never flips to solid black.
3. Fields (title, times, selects) are soft grey boxes with no border. Click into one: it gets a dark edge and a soft ring. Small labels above fields are normal lowercase text, not tiny capitals.
4. The switches (Once/Weekly, Ask first/Automatic) are a soft pill with the chosen option raised and white.
5. Settings: each row has its title and a short explanation on the left and its control on the right, with a thin line between rows.
6. Month: soft cells, small round coloured dots, today tinted warm with a vermilion date (not a black cell). Hover a day: a small round plus (and a check) appears. The header has the same Day / Week / Month switch as the Week.
7. The Day: the same header switch, the Booked line under the date, and a quiet column on the right ("Today by label", the free time as a modest number).
8. Due dates: thin lines between rows, a short bar for each, and small soft chips ("Covered" green, "Short" red).
9. Click a block on the Week: the side panel is a soft white card with a shadow and a smaller title; its choices are soft bordered buttons with one vermilion one.
10. Press /: the jump-to is a light panel with small type; type "tasks" and the matching screen is listed; the current screen is in vermilion.
11. Resize the window narrow: the Settings rows stack (title, explanation, then the control).
12. Known rough edges: the Places list does not yet show each place's trips underneath it, and some small old words ("commute", "task") remain in the Places delete note and the drawer's travel and task panels.
```

- [ ] **Step 3: Run and commit**

Run: `node --test "test/frontend/*.test.ts"`
Expected: PASS.

```bash
git add test/frontend/assets.test.ts docs/ui-visual-check.md public/fonts/README.txt public/css/shell.css
git commit -m "test: a guard that every heavy ink rule is overridden; guide for the calm look everywhere"
```

- [ ] **Step 4: Hand over**

The controller runs the whole suite (`npm test`, in the background; it can take a long time under load). Tell the user: do the "The calm look everywhere (slice 3)" steps in `docs/ui-visual-check.md` in a browser and say what looks off. Do not push until they say so.
