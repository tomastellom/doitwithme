# UI Foundation (Week Screen, Nudge, Menu) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the browser app's foundation and its first working screen: design tokens and fonts, the Week screen with filters and first-run state, Nudge (warnings, offers, approve, undo, dismiss), and the Menu with Jump-to search, all served by the existing local server.

**Architecture:** Plain HTML, CSS and ES modules in `public/`, no framework, no build, no npm dependencies. Pure modules (`time`, `model`, `nudge-model`, `sections`, `router`, `api`, `store`) hold all logic and run under `node:test`. Thin DOM modules (`dom`, `nudge`, `week`, `menu`, `main`) build elements through one small helper that takes a document, so tests drive them with a tiny fake document. One end-to-end test boots the whole app against the real server.

**Tech Stack:** Browser ES modules (`.js`), Node 25 `node:test` for tests, the existing `node:http` server. Fonts self-hosted as woff2.

**Spec:** `docs/superpowers/specs/2026-10-09-ui-design.md`. Visual source of truth: the approved boards on https://claude.ai/artifact/TNMnuzerDogRwvQxJSNdPP (D Week, I First run, J Nudge states, K Menu). Branch `ui-v1`, worktree `/Users/tomastello/doitwithme-phase1`.

## Global Constraints

- No framework, no build step, no npm dependencies. Disk is nearly full: never install anything.
- **No `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval` or `new Function` anywhere in `public/`.** All text goes in through `createTextNode` or `textContent` (the `dom.js` helper does this), so user text can never become markup.
- **No inline styles.** The server's Content-Security-Policy blocks `style="..."` and `<style>`. Use classes and `public/css/*.css`. SVG presentation attributes (`x`, `y`, `width`, `viewBox`, `d`) are allowed.
- No network requests except same-origin calls to `/api/...`. No third-party scripts, fonts or images.
- Modules must not touch `window`, `document` or `localStorage` at import time (tests import them under Node). Browser objects are passed in as arguments.
- Visuals follow the design tokens and the approved boards exactly: paper `#F1EEE6`, ink `#111111`, study `#FF4B1F`, gym `#1746F0`, admin `#F5B400`, muted `#6F6B61`; Bricolage Grotesque and DM Mono; square corners; no emojis, no gradients, no purple.
- Category is never conveyed by color alone: every block carries a text label.
- Every task ends with a green `npm test` and one commit whose message ends with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Do not push.
- Run all commands from `/Users/tomastello/doitwithme-phase1`.
- Plan B (not this plan) adds Day, Deadlines, Setup, Settings and notifications. Only registered sections ever appear in tabs and the Menu, so after this plan only Week exists.

## Review Focus

1. Hostile text (a task titled `<img src=x onerror=alert(1)>`) renders as plain text with no element created (Tasks 9, 10).
2. Server offline, a server error, or an empty data file never produces a blank screen, and Retry recovers (Task 12).
3. Double clicks while a request is running must not fire the request twice (Task 7).
4. Week math across ISO week 53, a Sunday date, and a year boundary stays correct (Tasks 3, 4).
5. Hostile or malformed URL hashes (`#/__proto__`, `#/constructor`, `#/week/2026-02-31`, `#/week/%E0%A4%A`) fall back safely and never throw (Task 8).

## File Structure

```
public/
  index.html
  css/tokens.css      design tokens + @font-face
  css/app.css         shell, week, nudge, menu styles
  fonts/              bricolage-grotesque.woff2, dm-mono-400.woff2, dm-mono-500.woff2, README.txt
  js/time.js          dates, ISO week, labels, clock
  js/model.js         groups, commitment occurrences, day items, week model
  js/nudge-model.js   warnings -> Nudge items, offers, confirm
  js/dom.js           element helper bound to a document
  js/api.js           fetch wrapper for the server
  js/store.js         app state, actions, busy guard
  js/sections.js      section registry + search
  js/router.js        hash parsing
  js/nudge.js         mascot + Nudge component
  js/week.js          Week screen + first-run
  js/menu.js          Menu overlay
  js/main.js          boot + shell
src/                   (small change) category in warning detail
test/frontend/         one test file per module + fakedom.ts + e2e
```

---

### Task 1: Put the task category into warning details

Nudge must attach the soft-time offer to a study shortfall, and warnings do not say which category they belong to yet.

**Files:**
- Modify: `src/types.ts`, `src/planner.ts`
- Modify (tests): `test/warnings.test.ts`, `test/soft.test.ts`, `test/ask.test.ts`

**Interfaces:**
- Produces: `WarningDetail.category?: string`; `deadline-short` and `weekly-short` warnings carry `detail.category` equal to the task's category. The warning key (`kind` plus task, deadline kind, due date, week or date) does not include it.

- [ ] **Step 1: Update the tests so they fail**

Run this once from the repo root (each replacement must match exactly the stated number of places):

```bash
python3 -I - <<'EOF'
def sub(p, old, new, count):
    s = open(p).read()
    assert s.count(old) == count, (p, old, s.count(old))
    open(p, 'w').write(s.replace(old, new))
sub('test/warnings.test.ts', "taskTitle: 'Study',", "taskTitle: 'Study', category: 'study',", 3)
sub('test/soft.test.ts', "taskTitle: 'Taxes',", "taskTitle: 'Taxes', category: 'errands',", 1)
sub('test/ask.test.ts', "taskTitle: 'Study',", "taskTitle: 'Study', category: 'study',", 3)
EOF
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL in the tests whose expected warnings now include `category`.

- [ ] **Step 3: Implement**

In `src/types.ts`, add to `WarningDetail` after `taskTitle?: string;`:

```ts
  category?: string;
```

In `src/planner.ts`, in `shortfalls()`, change the two detail lines:

```ts
          detail: { taskTitle: task.title, category: task.category, kind: dl.kind, dueDate: dl.dueDate, minutes: rem },
```

```ts
            detail: { taskTitle: task.title, category: task.category, weekStart: ws, minutes: task.weeklyMinutes - done },
```

- [ ] **Step 4: Run to verify everything passes**

Run: `npm test`
Expected: PASS for every test (132 tests).

- [ ] **Step 5: Commit**

```bash
git add src test
git commit -m "feat: include the task category in shortfall warning details" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Static foundation (HTML, tokens, base styles, fonts)

**Files:**
- Create: `public/index.html`, `public/css/tokens.css`, `public/css/app.css` (base and shell part only), `public/fonts/README.txt`, three woff2 files
- Test: `test/frontend/assets.test.ts`

**Interfaces:**
- Produces: a page that loads `/css/tokens.css`, `/css/app.css` and the module `/js/main.js`, contains `<div id="app">`, and has no inline style or script. CSS custom properties: `--paper --ink --study --gym --admin --muted --line --ghost --font-sans --font-mono`.

- [ ] **Step 1: Write the failing test**

Create `test/frontend/assets.test.ts`:

```ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../../src/server.ts';

let server: Server;
let base: string;

before(async () => {
  server = createApp(join(mkdtempSync(join(tmpdir(), 'doitwithme-assets-')), 'db.json'));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
});

const index = () => readFileSync('public/index.html', 'utf8');

test('index.html is a CSP-friendly shell with the app root and one module script', () => {
  const html = index();
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<title>doitwithme<\/title>/);
  assert.match(html, /<div id="app">/);
  assert.match(html, /<script type="module" src="\/js\/main\.js"><\/script>/);
  assert.doesNotMatch(html, /<style/i);
  assert.doesNotMatch(html, /\sstyle=/i);
  assert.equal((html.match(/<script/gi) ?? []).length, 1);
});

test('the stylesheets the page references are served', async () => {
  const urls = [...index().matchAll(/(?:href|src)="(\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(urls.includes('/css/tokens.css') && urls.includes('/css/app.css') && urls.includes('/js/main.js'));
  // The script itself is created in Task 12, which tests it through the real server.
  for (const url of urls.filter((u) => u.startsWith('/css/'))) {
    const res = await fetch(`${base}${url}`);
    assert.equal(res.status, 200, url);
  }
});

test('tokens.css defines the design tokens and both self-hosted fonts', () => {
  const css = readFileSync('public/css/tokens.css', 'utf8');
  for (const token of ['--paper: #F1EEE6', '--ink: #111111', '--study: #FF4B1F', '--gym: #1746F0', '--admin: #F5B400', '--muted: #6F6B61']) {
    assert.ok(css.includes(token), token);
  }
  for (const name of ['--line', '--ghost', '--font-sans', '--font-mono']) assert.ok(css.includes(name), name);
  assert.match(css, /font-family: 'Bricolage Grotesque'/);
  assert.match(css, /font-family: 'DM Mono'/);
  assert.doesNotMatch(css, /https?:\/\//);
});

test('app.css never loads anything from another origin and uses no gradients', () => {
  const css = readFileSync('public/css/app.css', 'utf8');
  assert.doesNotMatch(css, /https?:\/\//);
  assert.doesNotMatch(css, /gradient/i);
});

test('the three font files are real woff2 files', () => {
  for (const name of ['bricolage-grotesque.woff2', 'dm-mono-400.woff2', 'dm-mono-500.woff2']) {
    const path = join('public/fonts', name);
    assert.ok(existsSync(path), name);
    assert.equal(readFileSync(path).subarray(0, 4).toString('latin1'), 'wOF2', name);
    assert.ok(statSync(path).size > 5000, name);
  }
});

test('every JavaScript file in public/js is syntactically valid and avoids banned APIs', () => {
  const dir = 'public/js';
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.js')) : [];
  for (const f of files) {
    execFileSync(process.execPath, ['--check', join(dir, f)]);
    const src = readFileSync(join(dir, f), 'utf8');
    assert.doesNotMatch(src, /innerHTML|outerHTML|insertAdjacentHTML|\beval\(|new Function/, f);
    assert.doesNotMatch(src, /setAttribute\(\s*['"]style['"]/, f);
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/frontend/assets.test.ts`
Expected: FAIL (`public/index.html` and the fonts do not exist). The last test passes vacuously now and starts guarding once JavaScript files exist.

- [ ] **Step 3: Create the page and styles**

Create `public/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>doitwithme</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="/css/tokens.css">
<link rel="stylesheet" href="/css/app.css">
</head>
<body>
<div id="app"><p class="boot mono">Loading</p></div>
<noscript><p class="boot">doitwithme needs JavaScript to draw your plan.</p></noscript>
<script type="module" src="/js/main.js"></script>
</body>
</html>
```

Create `public/css/tokens.css`:

```css
@font-face {
  font-family: 'Bricolage Grotesque';
  src: url('/fonts/bricolage-grotesque.woff2') format('woff2');
  font-weight: 200 800;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'DM Mono';
  src: url('/fonts/dm-mono-400.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'DM Mono';
  src: url('/fonts/dm-mono-500.woff2') format('woff2');
  font-weight: 500;
  font-style: normal;
  font-display: swap;
}

:root {
  --paper: #F1EEE6;
  --ink: #111111;
  --study: #FF4B1F;
  --gym: #1746F0;
  --admin: #F5B400;
  --muted: #6F6B61;
  --line: #B9B4A6;
  --ghost: #8C887D;
  --on-study: #111111;
  --on-gym: #FFFFFF;
  --on-admin: #111111;
  --font-sans: 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'DM Mono', ui-monospace, Menlo, monospace;
}
```

Create `public/css/app.css` (base and shell; later tasks append their own sections):

```css
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; }
body { background: var(--paper); color: var(--ink); font-family: var(--font-sans); font-size: 15px; line-height: 1.3; }
button, input { font: inherit; color: inherit; border-radius: 0; }
button { cursor: pointer; }
a { color: inherit; }
:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
.mono { font-family: var(--font-mono); font-size: 12px; letter-spacing: .06em; text-transform: uppercase; }
.boot, .state { margin: 40px; }
.state h2 { margin: 0 0 8px; font-size: 40px; letter-spacing: -.04em; }
.state p { margin: 0 0 16px; max-width: 560px; }

.app { min-height: 100vh; padding-bottom: 280px; }
.bar { height: 64px; padding: 0 40px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.brand { text-decoration: none; }
.tabs { display: flex; gap: 8px; }
.tab { padding: 8px 14px; border: 2px solid var(--ink); background: transparent; color: var(--ink); text-decoration: none; }
.tab[aria-current="page"] { background: var(--ink); color: var(--paper); }
.actions { display: flex; gap: 8px; }
.btn { padding: 8px 16px; border: 2px solid var(--ink); background: transparent; }
.btn.dark { background: var(--ink); color: var(--paper); }
.btn.go { background: var(--study); color: var(--on-study); font-weight: 600; }
.btn:disabled { opacity: .5; cursor: not-allowed; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition: none !important; animation: none !important; }
}
```

Create `public/fonts/README.txt`:

```
Self-hosted fonts, both licensed under the SIL Open Font License 1.1:
- Bricolage Grotesque (variable, weights 200 to 800): https://github.com/ateliertriay/bricolage
- DM Mono (regular and medium): https://github.com/googlefonts/dm-fonts
Files are the Latin subsets served by Google Fonts.
```

- [ ] **Step 4: Download the fonts**

Run (the scratch folder is outside the repo; never use `/tmp` directly):

```bash
S=$(mktemp -d "${TMPDIR:-/private/tmp}/fonts.XXXXXX")
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
curl -fsSL -A "$UA" 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@200..800&family=DM+Mono:wght@400;500&display=swap' -o "$S/fonts.css"
python3 -I - "$S" <<'EOF'
import re, sys
css = open(sys.argv[1] + '/fonts.css').read()
blocks = re.findall(r'/\* latin \*/\s*@font-face\s*\{(.*?)\}', css, re.S)
for b in blocks:
    fam = re.search(r"font-family:\s*'([^']+)'", b).group(1)
    wt = re.search(r'font-weight:\s*([^;]+);', b).group(1).strip()
    url = re.search(r'url\((https://[^)]+\.woff2)\)', b).group(1)
    print(fam, '|', wt, '|', url)
EOF
```

Expected: three lines, one for Bricolage Grotesque (weight `200 800`) and two for DM Mono (`400` and `500`). Then download them (replace the three URLs with the ones printed):

```bash
curl -fsSL -A "$UA" '<bricolage url>' -o public/fonts/bricolage-grotesque.woff2
curl -fsSL -A "$UA" '<dm mono 400 url>' -o public/fonts/dm-mono-400.woff2
curl -fsSL -A "$UA" '<dm mono 500 url>' -o public/fonts/dm-mono-500.woff2
ls -l public/fonts
```

Expected: three files, each larger than 5 KB. If any step fails or prints fewer than three lines, stop and report: do not substitute other fonts or fake the files.

- [ ] **Step 5: Run to verify it passes**

Run: `npm test`
Expected: PASS for every test file.

- [ ] **Step 6: Commit**

```bash
git add public test
git commit -m "feat: add the static page shell, design tokens and self-hosted fonts" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Time helpers

**Files:**
- Create: `public/js/time.js`
- Test: `test/frontend/time.test.ts`

**Interfaces:**
- Produces: `WEEKDAYS`, `FULL_WEEKDAYS`, `MONTHS`; `weekdayOf(d)`, `addDays(d, n)`, `daysBetween(a, b)`, `weekStart(d)` (Monday), `isValidDate(d)`, `isoWeek(d) -> { week, year }`, `hhmm(minutes)`, `duration(minutes)` (155 gives `2h35`), `shortDate(d)` (`23 Oct`), `longDate(d)` (`Fri 23 Oct`), `rangeLabel(weekStartDate)`, `currentClock(now?, horizonDays?) -> { today, nowMinutes, horizonDays }`. Dates are `YYYY-MM-DD` strings, UTC math.

- [ ] **Step 1: Write the failing test**

Create `test/frontend/time.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, currentClock, daysBetween, duration, hhmm, isoWeek, isValidDate, longDate, rangeLabel, shortDate,
  weekdayOf, weekStart,
} from '../../public/js/time.js';

test('addDays, daysBetween and weekdayOf cross month and year boundaries', () => {
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1);
  assert.equal(weekdayOf('2026-10-08'), 4);
});

test('weekStart is the Monday on or before the date, Sunday included', () => {
  assert.equal(weekStart('2026-10-08'), '2026-10-05');
  assert.equal(weekStart('2026-10-11'), '2026-10-05');
  assert.equal(weekStart('2027-01-01'), '2026-12-28');
});

test('isoWeek follows ISO 8601, including week 53 and a Sunday', () => {
  assert.deepEqual(isoWeek('2026-10-12'), { week: 42, year: 2026 });
  assert.deepEqual(isoWeek('2026-10-05'), { week: 41, year: 2026 });
  assert.deepEqual(isoWeek('2027-01-01'), { week: 53, year: 2026 });
  assert.deepEqual(isoWeek('2026-10-18'), { week: 42, year: 2026 });
  assert.deepEqual(isoWeek('2026-01-01'), { week: 1, year: 2026 });
});

test('isValidDate rejects impossible and malformed dates', () => {
  assert.equal(isValidDate('2026-10-09'), true);
  for (const bad of ['2026-02-31', '2026-13-01', '10/09/2026', '', null, undefined, 5, '2026-1-9']) {
    assert.equal(isValidDate(bad as any), false, String(bad));
  }
});

test('hhmm and duration format minutes', () => {
  assert.equal(hhmm(545), '09:05');
  assert.equal(hhmm(0), '00:00');
  assert.equal(duration(155), '2h35');
  assert.equal(duration(0), '0h00');
  assert.equal(duration(5), '0h05');
  assert.equal(duration(60), '1h00');
});

test('date labels match the boards', () => {
  assert.equal(shortDate('2026-10-23'), '23 Oct');
  assert.equal(longDate('2026-10-23'), 'Fri 23 Oct');
  assert.equal(rangeLabel('2026-10-12'), '12 – 18 Oct 2026');
  assert.equal(rangeLabel('2026-10-26'), '26 Oct – 1 Nov 2026');
  assert.equal(rangeLabel('2026-12-28'), '28 Dec 2026 – 3 Jan 2027');
});

test('currentClock uses local date and time components', () => {
  assert.deepEqual(currentClock(new Date(2026, 9, 9, 14, 5)), { today: '2026-10-09', nowMinutes: 845, horizonDays: 14 });
  assert.equal(currentClock(new Date(2026, 0, 2, 0, 0), 7).horizonDays, 7);
  assert.equal(currentClock(new Date(2026, 0, 2, 0, 0)).today, '2026-01-02');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/frontend/time.test.ts`
Expected: FAIL (`ERR_MODULE_NOT_FOUND` for `public/js/time.js`).

- [ ] **Step 3: Implement**

Create `public/js/time.js`:

```js
const DAY_MS = 86_400_000;
const parse = (d) => Date.parse(`${d}T00:00:00Z`);

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const FULL_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const weekdayOf = (d) => new Date(parse(d)).getUTCDay();
export const addDays = (d, n) => new Date(parse(d) + n * DAY_MS).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / DAY_MS);
export const weekStart = (d) => addDays(d, -((weekdayOf(d) + 6) % 7));

export function isValidDate(d) {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = parse(d);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d;
}

// ISO 8601: the week belongs to the year that holds its Thursday.
export function isoWeek(d) {
  const thursday = new Date(parse(d));
  thursday.setUTCDate(thursday.getUTCDate() - ((thursday.getUTCDay() + 6) % 7) + 3);
  const year = thursday.getUTCFullYear();
  const first = new Date(Date.UTC(year, 0, 4));
  first.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7) + 3);
  return { week: 1 + Math.round((thursday - first) / (7 * DAY_MS)), year };
}

export const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const duration = (m) => `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;

const dayNumber = (d) => Number(d.slice(8));
const monthIndex = (d) => Number(d.slice(5, 7)) - 1;

export const shortDate = (d) => `${dayNumber(d)} ${MONTHS[monthIndex(d)]}`;
export const longDate = (d) => `${WEEKDAYS[weekdayOf(d)]} ${shortDate(d)}`;

export function rangeLabel(start) {
  const end = addDays(start, 6);
  const y1 = start.slice(0, 4);
  const y2 = end.slice(0, 4);
  if (y1 !== y2) return `${shortDate(start)} ${y1} – ${shortDate(end)} ${y2}`;
  if (monthIndex(start) !== monthIndex(end)) return `${shortDate(start)} – ${shortDate(end)} ${y2}`;
  return `${dayNumber(start)} – ${shortDate(end)} ${y2}`;
}

export function currentClock(now = new Date(), horizonDays = 14) {
  const pad = (n) => String(n).padStart(2, '0');
  return {
    today: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    nowMinutes: now.getHours() * 60 + now.getMinutes(),
    horizonDays,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS for every test file.

- [ ] **Step 5: Commit**

```bash
git add public test
git commit -m "feat: add date and time helpers for the UI" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Calendar model (groups, occurrences, week)

**Files:**
- Create: `public/js/model.js`
- Test: `test/frontend/model.test.ts`

**Interfaces:**
- Consumes: `public/js/time.js`.
- Produces:
  - `GROUPS`: `[{ id, label }]` for `fixed` (Fixed), `study` (Study), `gym` (Gym), `admin` (Chores and errands), `outline` (Projects and social); `GROUP_IDS`.
  - `groupOfBlock(category)`, `labelOf(category)` (`personal project` gives `project`).
  - `occurrencesOn(date, commitments)`: same output as the server's `occurrencesOn` in `src/busy.ts`.
  - `dayItems(state, date)`: `[{ kind: 'commitment' | 'block', group, start, end, title, label }]` sorted by start, then end.
  - `weekModel(state, start, visible, today)`: `{ start, week, year, range, days: [{ date, weekday, num, isToday, booked, items }], counts, total }` where `visible` is a `Set` of group ids, `counts` and `booked` are always unfiltered and `items` are filtered.

- [ ] **Step 1: Write the failing test**

Create `test/frontend/model.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { occurrencesOn as serverOccurrences } from '../../src/busy.ts';
import { addDays } from '../../public/js/time.js';
import { GROUP_IDS, GROUPS, dayItems, groupOfBlock, labelOf, occurrencesOn, weekModel } from '../../public/js/model.js';

const block = (date: string, start: number, end: number, title: string, category: string) => ({
  taskId: title, title, category, date, start, end,
});
const commitment = (over: any = {}) => ({
  id: 'c', title: 'Lecture', category: 'class', start: 600, end: 720,
  pattern: { kind: 'once', date: '2026-10-13' }, exceptions: [], bufferBefore: 30, ...over,
});
const state = (over: any = {}) => ({ commitments: [], tasks: [], deadlines: [], blocks: [], ...over });
const all = new Set(GROUP_IDS);

test('groups are the five on the board, in order', () => {
  assert.deepEqual(GROUPS.map((g) => g.label), ['Fixed', 'Study', 'Gym', 'Chores and errands', 'Projects and social']);
});

test('categories map to groups, unknown ones are outlined', () => {
  assert.equal(groupOfBlock('study'), 'study');
  assert.equal(groupOfBlock('Gym'), 'gym');
  assert.equal(groupOfBlock('chores'), 'admin');
  assert.equal(groupOfBlock('errands'), 'admin');
  for (const c of ['personal project', 'social', 'mystery', '']) assert.equal(groupOfBlock(c), 'outline');
  assert.equal(labelOf('personal project'), 'project');
  assert.equal(labelOf('Class'), 'class');
});

test('the browser occurrence logic matches the server for every day of the example schedule', () => {
  const example = JSON.parse(readFileSync('examples/sample-state.json', 'utf8'));
  let date = '2026-08-25';
  let checked = 0;
  while (date <= '2027-01-10') {
    assert.deepEqual(occurrencesOn(date, example.commitments), serverOccurrences(date, example.commitments), date);
    date = addDays(date, 1);
    checked++;
  }
  assert.ok(checked > 100);
});

test('dayItems merges commitments and blocks in time order with labels and groups', () => {
  const s = state({
    commitments: [commitment()],
    blocks: [block('2026-10-13', 480, 555, 'Chemistry', 'study'), block('2026-10-13', 780, 840, 'Gym', 'gym'), block('2026-10-14', 480, 540, 'Other day', 'study')],
  });
  assert.deepEqual(dayItems(s, '2026-10-13').map((i) => [i.start, i.title, i.group, i.label, i.kind]), [
    [480, 'Chemistry', 'study', 'study', 'block'],
    [600, 'Lecture', 'fixed', 'class', 'commitment'],
    [780, 'Gym', 'gym', 'gym', 'block'],
  ]);
});

test('weekModel counts and totals are unfiltered, items are filtered, today is flagged', () => {
  const s = state({
    commitments: [commitment()],
    blocks: [block('2026-10-12', 480, 540, 'Chemistry', 'study'), block('2026-10-13', 480, 555, 'Chemistry', 'study'), block('2026-10-13', 780, 840, 'Gym', 'gym')],
  });
  const m = weekModel(s, '2026-10-12', new Set(['study']), '2026-10-13');
  assert.equal(m.week, 42);
  assert.equal(m.range, '12 – 18 Oct 2026');
  assert.deepEqual(m.counts, { fixed: 1, study: 2, gym: 1, admin: 0, outline: 0 });
  assert.equal(m.total, 4);
  assert.equal(m.days.length, 7);
  const tue = m.days[1];
  assert.equal(tue.weekday, 'Tue');
  assert.equal(tue.num, 13);
  assert.equal(tue.isToday, true);
  assert.equal(tue.booked, 75 + 120 + 60);
  assert.deepEqual(tue.items.map((i) => i.title), ['Chemistry']);
  assert.equal(m.days[0].isToday, false);
});

test('weekModel works across the ISO week 53 and the year boundary', () => {
  const s = state({ blocks: [block('2026-12-31', 600, 660, 'A', 'study'), block('2027-01-01', 600, 660, 'B', 'study')] });
  const m = weekModel(s, '2026-12-28', all, '2026-12-30');
  assert.equal(m.week, 53);
  assert.equal(m.year, 2026);
  assert.equal(m.range, '28 Dec 2026 – 3 Jan 2027');
  assert.deepEqual(m.days.map((d) => d.num), [28, 29, 30, 31, 1, 2, 3]);
  assert.deepEqual(m.days[3].items.map((i) => i.title), ['A']);
  assert.deepEqual(m.days[4].items.map((i) => i.title), ['B']);
});

test('hostile text passes through the model untouched, escaping is the view\'s job', () => {
  const s = state({ blocks: [block('2026-10-12', 480, 540, '<img src=x onerror=alert(1)>', 'study')] });
  assert.equal(dayItems(s, '2026-10-12')[0].title, '<img src=x onerror=alert(1)>');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/frontend/model.test.ts`
Expected: FAIL (`ERR_MODULE_NOT_FOUND` for `public/js/model.js`).

- [ ] **Step 3: Implement**

Create `public/js/model.js`:

```js
import { WEEKDAYS, addDays, isoWeek, rangeLabel, weekdayOf } from './time.js';

export const GROUPS = [
  { id: 'fixed', label: 'Fixed' },
  { id: 'study', label: 'Study' },
  { id: 'gym', label: 'Gym' },
  { id: 'admin', label: 'Chores and errands' },
  { id: 'outline', label: 'Projects and social' },
];
export const GROUP_IDS = GROUPS.map((g) => g.id);

export function groupOfBlock(category) {
  const c = String(category).toLowerCase().trim();
  if (c === 'study') return 'study';
  if (c === 'gym') return 'gym';
  if (c === 'chores' || c === 'errands') return 'admin';
  return 'outline';
}

export function labelOf(category) {
  const c = String(category).toLowerCase().trim();
  return c.startsWith('personal ') ? c.slice('personal '.length) : c;
}

// Same rule as src/busy.ts; test/frontend/model.test.ts keeps the two in step.
export function occurrencesOn(date, commitments) {
  const out = [];
  for (const c of commitments) {
    if (c.exceptions.includes(date)) continue;
    const p = c.pattern;
    const hit =
      p.kind === 'once'
        ? p.date === date
        : date >= p.from && date <= p.to && p.weekdays.includes(weekdayOf(date));
    if (hit) {
      out.push({ title: c.title, category: c.category, start: c.start, end: c.end, bufferBefore: c.bufferBefore });
    }
  }
  return out;
}

export function dayItems(state, date) {
  const items = [];
  for (const o of occurrencesOn(date, state.commitments)) {
    items.push({ kind: 'commitment', group: 'fixed', start: o.start, end: o.end, title: o.title, label: labelOf(o.category) });
  }
  for (const b of state.blocks) {
    if (b.date === date) {
      items.push({ kind: 'block', group: groupOfBlock(b.category), start: b.start, end: b.end, title: b.title, label: labelOf(b.category) });
    }
  }
  return items.sort((a, b) => a.start - b.start || a.end - b.end);
}

const minutesOf = (items) => items.reduce((t, i) => t + (i.end - i.start), 0);

export function weekModel(state, start, visible, today) {
  const counts = Object.fromEntries(GROUP_IDS.map((id) => [id, 0]));
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(start, i);
    const items = dayItems(state, date);
    for (const item of items) counts[item.group]++;
    days.push({
      date,
      weekday: WEEKDAYS[weekdayOf(date)],
      num: Number(date.slice(8)),
      isToday: date === today,
      booked: minutesOf(items),
      items: items.filter((item) => visible.has(item.group)),
    });
  }
  const { week, year } = isoWeek(start);
  return { start, week, year, range: rangeLabel(start), days, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS for every test file.

- [ ] **Step 5: Commit**

```bash
git add public test
git commit -m "feat: add the calendar model for the Week screen" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Nudge model (warnings to words)

**Files:**
- Create: `public/js/nudge-model.js`
- Test: `test/frontend/nudge-model.test.ts`

**Interfaces:**
- Consumes: `public/js/time.js`; decorated warnings from the server (`{ kind, message, detail, key, dismissed }`).
- Produces:
  - `buildNudge(warnings) -> { items, needsYou }`. Open (not dismissed) shortfall warnings become `items` ordered deadlines first (by due date) then weekly (by week). Each item: `{ key, headline, minutes, category, offer }`. A `soft-offer` warning attaches to the first item whose `category` is `study` as `offer = { key, date, weekday, minutes, cost, line, button }`; with no such item it becomes its own item (`key` equal to the offer key). `needsYou` counts shortfall items only.
  - `keysOf(item)`: the keys to dismiss for "Leave it" (the item's key, plus the offer's key when different).
  - `buildConfirm(warnings, date)`: `{ date, weekday, minutes, titles, used }`.

- [ ] **Step 1: Write the failing test**

Create `test/frontend/nudge-model.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConfirm, buildNudge, keysOf } from '../../public/js/nudge-model.js';

const w = (kind: string, detail: any, over: any = {}) => ({
  kind, message: `${kind} message`, detail, key: `${kind}|${JSON.stringify(detail)}`, dismissed: false, ...over,
});
const exam = (over: any = {}) =>
  w('deadline-short', { taskTitle: 'Chemistry', category: 'study', kind: 'exam', dueDate: '2026-10-23', minutes: 90, ...over });
const weekly = (over: any = {}) =>
  w('weekly-short', { taskTitle: 'Gym', category: 'gym', weekStart: '2026-10-12', minutes: 60, ...over });
const offer = (over: any = {}) => w('soft-offer', { date: '2026-10-09', minutes: 90, costMinutes: 0, ...over });

test('a deadline shortfall with a study offer reads like the board', () => {
  const { items, needsYou } = buildNudge([exam(), offer()]);
  assert.equal(needsYou, 1);
  assert.equal(items.length, 1);
  assert.equal(items[0].headline, 'Chemistry exam, Fri 23 Oct, is 90 min short.');
  assert.equal(items[0].offer.button, 'Use Friday evening');
  assert.equal(items[0].offer.line, 'Friday evening is free. I would only touch it for study, and only if you say so.');
  assert.equal(items[0].offer.date, '2026-10-09');
});

test('a weekly shortfall headline names the week', () => {
  assert.equal(buildNudge([weekly()]).items[0].headline, 'Gym is 60 min short in the week of 12 Oct.');
});

test('deadlines come before weekly shortfalls, each sorted by date', () => {
  const { items } = buildNudge([
    weekly({ weekStart: '2026-10-19', taskTitle: 'B' }),
    exam({ dueDate: '2026-11-02', taskTitle: 'Late' }),
    weekly({ weekStart: '2026-10-12', taskTitle: 'A' }),
    exam({ dueDate: '2026-10-23', taskTitle: 'Early' }),
  ]);
  assert.deepEqual(items.map((i) => i.headline.split(' ')[0]), ['Early', 'Late', 'A', 'B']);
});

test('the offer attaches to the first study shortfall, not to a non-study one', () => {
  const { items } = buildNudge([exam({ taskTitle: 'Taxes', category: 'errands', dueDate: '2026-10-12' }), exam(), offer()]);
  assert.equal(items[0].offer, null);
  assert.ok(items[1].offer);
});

test('an offer with no study shortfall to attach to becomes its own item', () => {
  const { items, needsYou } = buildNudge([offer()]);
  assert.equal(items.length, 1);
  assert.equal(needsYou, 0);
  assert.equal(items[0].headline, 'Soft time on Fri 9 Oct could cover 90 min of study.');
  assert.equal(items[0].key, items[0].offer.key);
});

test('a cost to other tasks is stated in the offer line', () => {
  const { items } = buildNudge([exam(), offer({ costMinutes: 20 })]);
  assert.match(items[0].offer.line, /It would cost other tasks 20 min\.$/);
});

test('dismissed warnings and warnings without detail are left out', () => {
  assert.deepEqual(buildNudge([{ ...exam(), dismissed: true }]).items, []);
  assert.deepEqual(buildNudge([{ kind: 'weekly-short', message: 'm', key: 'k', dismissed: false }]).items, []);
});

test('keysOf returns the item key and the offer key once each', () => {
  const [item] = buildNudge([exam(), offer()]).items;
  assert.deepEqual(keysOf(item), [item.key, item.offer.key]);
  const [own] = buildNudge([offer()]).items;
  assert.deepEqual(keysOf(own), [own.key]);
});

test('buildConfirm reports what moved in, or says nothing needed the evening', () => {
  const used = w('soft-time-used', { date: '2026-10-09', titles: ['Chemistry', 'Reading'], minutes: 120 });
  assert.deepEqual(buildConfirm([used], '2026-10-09'), {
    date: '2026-10-09', weekday: 'Friday', minutes: 120, titles: ['Chemistry', 'Reading'], used: true,
  });
  assert.deepEqual(buildConfirm([], '2026-10-09'), { date: '2026-10-09', weekday: 'Friday', minutes: 0, titles: [], used: false });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/frontend/nudge-model.test.ts`
Expected: FAIL (`ERR_MODULE_NOT_FOUND` for `public/js/nudge-model.js`).

- [ ] **Step 3: Implement**

Create `public/js/nudge-model.js`:

```js
import { FULL_WEEKDAYS, longDate, shortDate, weekdayOf } from './time.js';

const SHORTFALLS = ['deadline-short', 'weekly-short'];

function order(a, b) {
  if (a.kind !== b.kind) return a.kind === 'deadline-short' ? -1 : 1;
  const da = a.detail.dueDate ?? a.detail.weekStart ?? '';
  const db = b.detail.dueDate ?? b.detail.weekStart ?? '';
  return da.localeCompare(db);
}

function headlineOf(w) {
  const d = w.detail;
  return w.kind === 'deadline-short'
    ? `${d.taskTitle} ${d.kind}, ${longDate(d.dueDate)}, is ${d.minutes} min short.`
    : `${d.taskTitle} is ${d.minutes} min short in the week of ${shortDate(d.weekStart)}.`;
}

function offerOf(w) {
  const weekday = FULL_WEEKDAYS[weekdayOf(w.detail.date)];
  const cost = w.detail.costMinutes ?? 0;
  return {
    key: w.key,
    date: w.detail.date,
    weekday,
    minutes: w.detail.minutes,
    cost,
    line:
      `${weekday} evening is free. I would only touch it for study, and only if you say so.` +
      (cost > 0 ? ` It would cost other tasks ${cost} min.` : ''),
    button: `Use ${weekday} evening`,
  };
}

export function buildNudge(warnings) {
  const open = warnings.filter((w) => !w.dismissed && w.detail);
  const shortfalls = open.filter((w) => SHORTFALLS.includes(w.kind)).sort(order);
  const offerWarning = open.find((w) => w.kind === 'soft-offer') ?? null;
  const items = shortfalls.map((w) => ({
    key: w.key,
    headline: headlineOf(w),
    minutes: w.detail.minutes,
    category: w.detail.category,
    offer: null,
  }));
  if (offerWarning) {
    const offer = offerOf(offerWarning);
    const target = items.find((item) => item.category === 'study');
    if (target) {
      target.offer = offer;
    } else {
      items.push({
        key: offer.key,
        headline: `Soft time on ${longDate(offer.date)} could cover ${offer.minutes} min of study.`,
        minutes: 0,
        category: 'study',
        offer,
      });
    }
  }
  return { items, needsYou: shortfalls.length };
}

export function keysOf(item) {
  return item.offer && item.offer.key !== item.key ? [item.key, item.offer.key] : [item.key];
}

export function buildConfirm(warnings, date) {
  const used = warnings.find((w) => w.kind === 'soft-time-used' && w.detail && w.detail.date === date);
  const weekday = FULL_WEEKDAYS[weekdayOf(date)];
  return used
    ? { date, weekday, minutes: used.detail.minutes, titles: used.detail.titles, used: true }
    : { date, weekday, minutes: 0, titles: [], used: false };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS for every test file.

- [ ] **Step 5: Commit**

```bash
git add public test
git commit -m "feat: turn planner warnings into Nudge messages" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: DOM helper, fake document, and API client

**Files:**
- Create: `public/js/dom.js`, `public/js/api.js`, `test/frontend/fakedom.ts`
- Test: `test/frontend/dom.test.ts`, `test/frontend/api.test.ts`

**Interfaces:**
- Produces:
  - `createDom(doc) -> { h, svg, text, clear }`. `h(tag, props, ...children)` builds an element: `class` sets the class attribute, `on<event>` functions become listeners, `value` sets the property, `true` becomes an empty attribute, `false`, `null` and `undefined` props and children are skipped, strings and numbers become text nodes, arrays are flattened. `svg` does the same in the SVG namespace. `clear(el, ...children)` replaces children.
  - `createApi(fetchFn) -> { getState, putState, example, replan, approve, undo, dismiss }`, all returning parsed JSON; throws `ApiError(status, message)`; a network failure is `status` 0.
  - Test helpers in `test/frontend/fakedom.ts`: `FakeDocument`, `FakeElement`, `FakeText`, `findAll(root, predicate)`, `byClass(root, className)`, `byTag(root, tag)`, `textOf(root)`.

- [ ] **Step 1: Write the fake document**

Create `test/frontend/fakedom.ts` (test helper, no tests of its own):

```ts
export class FakeText {
  text: string;
  constructor(text: string) {
    this.text = text;
  }
  get textContent(): string {
    return this.text;
  }
}

export class FakeElement {
  tag: string;
  ns: string | null;
  doc: FakeDocument;
  attrs: Record<string, string> = {};
  children: Array<FakeElement | FakeText> = [];
  listeners: Record<string, Function[]> = {};
  value = '';
  parent: FakeElement | null = null;

  constructor(tag: string, ns: string | null, doc: FakeDocument) {
    this.tag = tag;
    this.ns = ns;
    this.doc = doc;
  }
  setAttribute(k: string, v: unknown): void {
    this.attrs[k] = String(v);
  }
  getAttribute(k: string): string | null {
    return k in this.attrs ? this.attrs[k] : null;
  }
  hasAttribute(k: string): boolean {
    return k in this.attrs;
  }
  removeAttribute(k: string): void {
    delete this.attrs[k];
  }
  get className(): string {
    return this.attrs.class ?? '';
  }
  hasClass(c: string): boolean {
    return this.className.split(/\s+/).includes(c);
  }
  append(...nodes: Array<FakeElement | FakeText>): void {
    for (const n of nodes) {
      if (n instanceof FakeElement) n.parent = this;
      this.children.push(n);
    }
  }
  appendChild(n: FakeElement | FakeText): FakeElement | FakeText {
    this.append(n);
    return n;
  }
  replaceChildren(...nodes: Array<FakeElement | FakeText>): void {
    this.children = [];
    this.append(...nodes);
  }
  addEventListener(type: string, fn: Function): void {
    (this.listeners[type] ??= []).push(fn);
  }
  dispatch(type: string, event: Record<string, unknown> = {}): any {
    const e: any = {
      type,
      target: this,
      defaultPrevented: false,
      cancelBubble: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopPropagation() {
        this.cancelBubble = true;
      },
      ...event,
    };
    // Events bubble from the element up through its parents, like in a browser.
    for (let node: FakeElement | null = this; node; node = e.cancelBubble ? null : node.parent) {
      for (const fn of node.listeners[type] ?? []) fn(e);
    }
    return e;
  }
  click(): any {
    return this.dispatch('click');
  }
  focus(): void {
    this.doc.activeElement = this;
  }
  get textContent(): string {
    return this.children.map((c) => c.textContent).join('');
  }
  set textContent(v: string) {
    this.children = [new FakeText(String(v))];
  }
}

export class FakeDocument {
  activeElement: FakeElement | null = null;
  listeners: Record<string, Function[]> = {};
  createElement(tag: string): FakeElement {
    return new FakeElement(tag, null, this);
  }
  createElementNS(ns: string, tag: string): FakeElement {
    return new FakeElement(tag, ns, this);
  }
  createTextNode(text: string): FakeText {
    return new FakeText(text);
  }
  addEventListener(type: string, fn: Function): void {
    (this.listeners[type] ??= []).push(fn);
  }
  dispatch(type: string, event: Record<string, unknown> = {}): any {
    const e: any = { type, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...event };
    for (const fn of this.listeners[type] ?? []) fn(e);
    return e;
  }
}

export function findAll(root: FakeElement, predicate: (el: FakeElement) => boolean): FakeElement[] {
  const out: FakeElement[] = [];
  const walk = (node: FakeElement | FakeText) => {
    if (!(node instanceof FakeElement)) return;
    if (predicate(node)) out.push(node);
    node.children.forEach(walk);
  };
  walk(root);
  return out;
}
export const byClass = (root: FakeElement, c: string) => findAll(root, (e) => e.hasClass(c));
export const byTag = (root: FakeElement, tag: string) => findAll(root, (e) => e.tag === tag);
export const textOf = (root: FakeElement) => root.textContent;
```

- [ ] **Step 2: Write the failing tests**

Create `test/frontend/dom.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDom } from '../../public/js/dom.js';
import { FakeDocument, byClass, findAll, textOf } from './fakedom.ts';

const dom = () => createDom(new FakeDocument() as any);

test('h builds elements with classes, attributes, text and flattened children', () => {
  const { h } = dom();
  const el: any = h('p', { class: 'a b', 'aria-label': 'x', hidden: true, skipped: false, gone: null }, 'one ', ['two ', [3]], null, false);
  assert.equal(el.tag, 'p');
  assert.equal(el.className, 'a b');
  assert.equal(el.getAttribute('aria-label'), 'x');
  assert.equal(el.hasAttribute('hidden'), true);
  assert.equal(el.hasAttribute('skipped'), false);
  assert.equal(el.hasAttribute('gone'), false);
  assert.equal(textOf(el), 'one two 3');
});

test('h wires on-handlers and sets value as a property', () => {
  const { h } = dom();
  let clicks = 0;
  const b: any = h('button', { onclick: () => clicks++ }, 'Go');
  b.click();
  assert.equal(clicks, 1);
  const input: any = h('input', { value: 'hello' });
  assert.equal(input.value, 'hello');
});

test('hostile text becomes a text node, never an element', () => {
  const { h } = dom();
  const evil = '<img src=x onerror=alert(1)>';
  const el: any = h('div', {}, evil);
  assert.equal(textOf(el), evil);
  assert.equal(findAll(el, (e) => e.tag === 'img').length, 0);
  assert.equal(el.children.length, 1);
});

test('svg builds elements in the SVG namespace and clear replaces children', () => {
  const { h, svg, clear } = dom();
  const s: any = svg('svg', { viewBox: '0 0 10 10' }, svg('rect', { width: 5 }));
  assert.equal(s.ns, 'http://www.w3.org/2000/svg');
  assert.equal(s.children[0].ns, 'http://www.w3.org/2000/svg');
  const box: any = h('div', {}, h('span', { class: 'old' }));
  clear(box, h('span', { class: 'new' }));
  assert.equal(byClass(box, 'old').length, 0);
  assert.equal(byClass(box, 'new').length, 1);
});
```

Create `test/frontend/api.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createApi } from '../../public/js/api.js';

function fakeFetch(responses: any[]) {
  const calls: any[] = [];
  const fn = async (path: string, init: any) => {
    calls.push({ path, init });
    const r = responses.shift();
    if (r instanceof Error) throw r;
    return { ok: r.status < 400, status: r.status, json: async () => { if (r.bad) throw new Error('bad json'); return r.body; } };
  };
  return { fn, calls };
}
const clock = { today: '2026-10-05', nowMinutes: 540, horizonDays: 14 };

test('each call uses the right method, path and JSON body', async () => {
  const f = fakeFetch(Array.from({ length: 7 }, () => ({ status: 200, body: { ok: true } })));
  const api = createApi(f.fn as any);
  await api.getState();
  await api.putState({ a: 1 });
  await api.example();
  await api.replan(clock);
  await api.approve('2026-10-09', clock);
  await api.undo('2026-10-09', clock);
  await api.dismiss('k|x', clock);
  assert.deepEqual(f.calls.map((c) => [c.init.method, c.path]), [
    ['GET', '/api/state'], ['PUT', '/api/state'], ['GET', '/api/example'], ['POST', '/api/replan'],
    ['POST', '/api/soft/approve'], ['POST', '/api/soft/undo'], ['POST', '/api/warnings/dismiss'],
  ]);
  assert.equal(f.calls[0].init.body, undefined);
  assert.equal(f.calls[1].init.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(f.calls[4].init.body), { ...clock, date: '2026-10-09' });
  assert.deepEqual(JSON.parse(f.calls[6].init.body), { ...clock, key: 'k|x' });
});

test('a network failure is an ApiError with status 0', async () => {
  const api = createApi(fakeFetch([new TypeError('failed')]).fn as any);
  await assert.rejects(api.getState(), (e: any) => e instanceof ApiError && e.status === 0);
});

test('an error response carries the server message, or a generic one when the body is not JSON', async () => {
  const api = createApi(fakeFetch([{ status: 400, body: { error: 'date must not be in the past' } }, { status: 500, bad: true }]).fn as any);
  await assert.rejects(api.approve('2026-10-01', clock), (e: any) => e.status === 400 && e.message === 'date must not be in the past');
  await assert.rejects(api.getState(), (e: any) => e.status === 500 && /500/.test(e.message));
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `node --test test/frontend/dom.test.ts test/frontend/api.test.ts`
Expected: FAIL (`ERR_MODULE_NOT_FOUND` for `public/js/dom.js` and `public/js/api.js`).

- [ ] **Step 4: Implement**

Create `public/js/dom.js`:

```js
const SVG_NS = 'http://www.w3.org/2000/svg';

export function createDom(doc) {
  const flatten = (list) => list.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false);

  function apply(el, props) {
    for (const [key, value] of Object.entries(props ?? {})) {
      if (value === undefined || value === null || value === false) continue;
      if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key === 'value') el.value = value;
      else if (value === true) el.setAttribute(key, '');
      else el.setAttribute(key, String(value));
    }
  }

  function build(el, props, children) {
    apply(el, props);
    for (const child of flatten(children)) {
      el.append(typeof child === 'object' ? child : doc.createTextNode(String(child)));
    }
    return el;
  }

  return {
    h: (tag, props, ...children) => build(doc.createElement(tag), props, children),
    svg: (tag, props, ...children) => build(doc.createElementNS(SVG_NS, tag), props, children),
    text: (value) => doc.createTextNode(String(value)),
    clear: (el, ...children) => el.replaceChildren(...flatten(children)),
  };
}
```

Create `public/js/api.js`:

```js
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function createApi(fetchFn) {
  async function call(method, path, body) {
    let res;
    try {
      res = await fetchFn(path, {
        method,
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'The planner is not reachable');
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) throw new ApiError(res.status, (data && data.error) || `Request failed (${res.status})`);
    return data;
  }

  return {
    getState: () => call('GET', '/api/state'),
    putState: (state) => call('PUT', '/api/state', state),
    example: () => call('GET', '/api/example'),
    replan: (clock) => call('POST', '/api/replan', clock),
    approve: (date, clock) => call('POST', '/api/soft/approve', { ...clock, date }),
    undo: (date, clock) => call('POST', '/api/soft/undo', { ...clock, date }),
    dismiss: (key, clock) => call('POST', '/api/warnings/dismiss', { ...clock, key }),
  };
}
```

- [ ] **Step 5: Run to verify everything passes**

Run: `npm test`
Expected: PASS for every test file.

- [ ] **Step 6: Commit**

```bash
git add public test
git commit -m "feat: add the DOM helper, a fake document for tests, and the API client" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The store

**Files:**
- Create: `public/js/store.js`
- Test: `test/frontend/store.test.ts`

**Interfaces:**
- Consumes: `createApi`'s method names, `buildConfirm`.
- Produces: `createStore(api, getClock) -> { get, subscribe, idle, load, replan, approve, undo, dismiss, loadExample, clearConfirm }`.
  - State: `{ status: 'loading' | 'ready' | 'offline' | 'error', state, warnings, approvedSoft, dismissed, isEmpty, error, busy, confirm }`.
  - `load()`: reads the state; an empty schedule (no commitments and no tasks) sets `isEmpty` without replanning; otherwise replans and merges the result (`blocks`, `approvedSoft`, `dismissed`) into `state`. A network failure sets `status: 'offline'`, any other error `status: 'error'`.
  - `replan()`, `approve(date)`, `undo(date)`, `dismiss(keys)`, `loadExample()` are guarded: while one runs, further calls do nothing. `approve` sets `confirm` from the response. `dismiss` sends each key in turn and ignores a 409.
  - `idle()` resolves when `busy` is false.

- [ ] **Step 1: Write the failing test**

Create `test/frontend/store.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../../public/js/api.js';
import { createStore } from '../../public/js/store.js';

const clock = { today: '2026-10-05', nowMinutes: 540, horizonDays: 14 };
const full = (over: any = {}) => ({
  commitments: [], tasks: [{ id: 't' }], deadlines: [], preferences: {}, blocks: [], approvedSoft: [], dismissed: [], ...over,
});
const result = (over: any = {}) => ({ blocks: [{ date: '2026-10-05' }], warnings: [], approvedSoft: [], dismissed: [], ...over });

function fakeApi(over: any = {}) {
  const calls: string[] = [];
  const rec = (name: string, fn: Function) => async (...args: any[]) => { calls.push(name); return fn(...args); };
  const api = {
    getState: rec('getState', () => full()),
    putState: rec('putState', () => ({ ok: true })),
    example: rec('example', () => full()),
    replan: rec('replan', () => result()),
    approve: rec('approve', () => result()),
    undo: rec('undo', () => result()),
    dismiss: rec('dismiss', () => result()),
    ...Object.fromEntries(Object.entries(over).map(([k, v]: any) => [k, rec(k, v)])),
  };
  return { api, calls };
}
const make = (over: any = {}) => { const f = fakeApi(over); return { ...f, store: createStore(f.api as any, () => clock) }; };

test('load replans a populated schedule and merges the plan into the state', async () => {
  const { store, calls } = make();
  await store.load();
  const s = store.get();
  assert.equal(s.status, 'ready');
  assert.equal(s.isEmpty, false);
  assert.deepEqual(calls, ['getState', 'replan']);
  assert.deepEqual(s.state.blocks, [{ date: '2026-10-05' }]);
  assert.deepEqual(s.state.tasks, [{ id: 't' }]);
});

test('an empty schedule is flagged and not replanned', async () => {
  const { store, calls } = make({ getState: () => full({ tasks: [], commitments: [] }) });
  await store.load();
  assert.equal(store.get().isEmpty, true);
  assert.equal(store.get().status, 'ready');
  assert.deepEqual(calls, ['getState']);
});

test('a network failure is offline, any other failure is an error, and retry recovers', async () => {
  let fail: any = new ApiError(0, 'The planner is not reachable');
  const { store } = make({ getState: () => { if (fail) throw fail; return full(); } });
  await store.load();
  assert.equal(store.get().status, 'offline');
  fail = new ApiError(500, 'boom');
  await store.load();
  assert.deepEqual([store.get().status, store.get().error], ['error', 'boom']);
  fail = null;
  await store.load();
  assert.equal(store.get().status, 'ready');
});

test('approve builds the confirmation from the response', async () => {
  const { store } = make({
    approve: () => result({ warnings: [{ kind: 'soft-time-used', detail: { date: '2026-10-09', titles: ['Chemistry'], minutes: 120 } }], approvedSoft: ['2026-10-09'] }),
  });
  await store.load();
  await store.approve('2026-10-09');
  assert.deepEqual(store.get().confirm, { date: '2026-10-09', weekday: 'Friday', minutes: 120, titles: ['Chemistry'], used: true });
  assert.deepEqual(store.get().approvedSoft, ['2026-10-09']);
  store.clearConfirm();
  assert.equal(store.get().confirm, null);
});

test('undo clears the confirmation and updates the approvals', async () => {
  const { store } = make({ undo: () => result({ approvedSoft: [] }) });
  await store.load();
  await store.approve('2026-10-09');
  await store.undo('2026-10-09');
  assert.equal(store.get().confirm, null);
  assert.deepEqual(store.get().approvedSoft, []);
});

test('a second click while a request runs does not send another request', async () => {
  let release: Function = () => {};
  const gate = new Promise<void>((r) => (release = r));
  const { store, calls } = make({ approve: async () => { await gate; return result(); } });
  await store.load();
  const first = store.approve('2026-10-09');
  const second = store.approve('2026-10-09');
  const third = store.replan();
  assert.equal(store.get().busy, true);
  release();
  await Promise.all([first, second, third]);
  assert.equal(calls.filter((c) => c === 'approve').length, 1);
  assert.equal(calls.filter((c) => c === 'replan').length, 1);
  assert.equal(store.get().busy, false);
});

test('dismiss sends every key, ignores a 409, and surfaces other errors', async () => {
  const sent: string[] = [];
  const { store } = make({
    dismiss: (key: string) => { sent.push(key); if (key === 'gone') throw new ApiError(409, 'no longer open'); return result({ dismissed: ['a'] }); },
  });
  await store.load();
  await store.dismiss(['a', 'gone']);
  assert.deepEqual(sent, ['a', 'gone']);
  assert.equal(store.get().status, 'ready');
  assert.deepEqual(store.get().dismissed, ['a']);
  const bad = make({ dismiss: () => { throw new ApiError(500, 'boom'); } });
  await bad.store.load();
  await bad.store.dismiss(['x']);
  assert.equal(bad.store.get().status, 'error');
  assert.equal(bad.store.get().busy, false);
});

test('loadExample saves the example, reloads and replans', async () => {
  const { store, calls } = make({ getState: () => full({ tasks: [], commitments: [] }) });
  await store.load();
  await store.loadExample();
  assert.deepEqual(calls, ['getState', 'example', 'putState', 'getState', 'replan']);
});

test('subscribe notifies on change and idle resolves when not busy', async () => {
  const { store } = make();
  const seen: string[] = [];
  const off = store.subscribe((s: any) => seen.push(s.status));
  await store.load();
  off();
  assert.ok(seen.includes('loading') && seen.includes('ready'));
  await store.idle();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/frontend/store.test.ts`
Expected: FAIL (`ERR_MODULE_NOT_FOUND` for `public/js/store.js`).

- [ ] **Step 3: Implement**

Create `public/js/store.js`:

```js
import { buildConfirm } from './nudge-model.js';

export function createStore(api, getClock) {
  let current = {
    status: 'loading', state: null, warnings: [], approvedSoft: [], dismissed: [],
    isEmpty: false, error: null, busy: false, confirm: null,
  };
  const listeners = new Set();

  const set = (patch) => {
    current = { ...current, ...patch };
    for (const listener of [...listeners]) listener(current);
  };
  const fail = (e) => set({ status: e && e.status === 0 ? 'offline' : 'error', error: e && e.message ? e.message : String(e), busy: false });
  const merged = (r, extra = {}) => ({
    status: 'ready',
    error: null,
    state: { ...current.state, blocks: r.blocks, approvedSoft: r.approvedSoft, dismissed: r.dismissed },
    warnings: r.warnings,
    approvedSoft: r.approvedSoft,
    dismissed: r.dismissed,
    ...extra,
  });

  async function guard(fn) {
    if (current.busy) return;
    set({ busy: true });
    try {
      await fn();
    } catch (e) {
      fail(e);
      return;
    }
    set({ busy: false });
  }

  async function load() {
    set({ status: 'loading', error: null, busy: false });
    try {
      const state = await api.getState();
      if (state.tasks.length === 0 && state.commitments.length === 0) {
        set({ status: 'ready', state, warnings: [], approvedSoft: state.approvedSoft, dismissed: state.dismissed, isEmpty: true, confirm: null });
        return;
      }
      const r = await api.replan(getClock());
      current = { ...current, state };
      set(merged(r, { isEmpty: false, confirm: null }));
    } catch (e) {
      fail(e);
    }
  }

  return {
    get: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    idle() {
      if (!current.busy) return Promise.resolve();
      return new Promise((resolve) => {
        const off = this.subscribe((s) => {
          if (!s.busy) {
            off();
            resolve();
          }
        });
      });
    },
    load,
    replan: () => guard(async () => set(merged(await api.replan(getClock()), { confirm: null }))),
    approve: (date) =>
      guard(async () => {
        const r = await api.approve(date, getClock());
        set(merged(r, { confirm: buildConfirm(r.warnings, date) }));
      }),
    undo: (date) => guard(async () => set(merged(await api.undo(date, getClock()), { confirm: null }))),
    dismiss: (keys) =>
      guard(async () => {
        let last = null;
        for (const key of keys) {
          try {
            last = await api.dismiss(key, getClock());
          } catch (e) {
            if (!e || e.status !== 409) throw e;
          }
        }
        if (last) set(merged(last, { confirm: null }));
      }),
    loadExample: () =>
      guard(async () => {
        await api.putState(await api.example());
        const state = await api.getState();
        const r = await api.replan(getClock());
        current = { ...current, state };
        set(merged(r, { isEmpty: false, confirm: null }));
      }),
    clearConfirm: () => set({ confirm: null }),
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS for every test file.

- [ ] **Step 5: Commit**

```bash
git add public test
git commit -m "feat: add the app store with a busy guard" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Section registry, search and router

**Files:**
- Create: `public/js/sections.js`, `public/js/router.js`
- Test: `test/frontend/sections.test.ts`, `test/frontend/router.test.ts`

**Interfaces:**
- Produces:
  - `GROUPS` (`views`, `setup`, `settings`, `connections` with `label` and `description`), `createRegistry() -> { register, all, ids, find, primary, byGroup(query?), search(query) }`, `searchSections(sections, query)`.
  - A section is `{ id, title, group, description?, primary?, render? }`. `id` must match `^[a-z][a-z0-9-]*$` and be unique; `group` must be known; otherwise `register` throws. `byGroup(query)` returns only groups that have matching sections, in `GROUPS` order. `search` ranks title-prefix, then title-contains, then description-contains.
  - `parseHash(hash) -> { id, param }`, `resolveRoute(hash, ids, fallback = 'week')`, `buildHash(id, param)`.

- [ ] **Step 1: Write the failing tests**

Create `test/frontend/sections.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GROUPS, createRegistry, searchSections } from '../../public/js/sections.js';

const make = () => {
  const r = createRegistry();
  r.register({ id: 'week', title: 'Week', group: 'views', description: 'Your plan for the week.', primary: true });
  r.register({ id: 'day', title: 'Day', group: 'views', description: 'One day, larger.', primary: true });
  r.register({ id: 'commitments', title: 'Commitments', group: 'setup', description: 'What is fixed.' });
  r.register({ id: 'notifications', title: 'Notifications', group: 'settings', description: 'When I tell you things.' });
  return r;
};

test('groups are Views, Setup, Settings, Connections with descriptions', () => {
  assert.deepEqual(GROUPS.map((g) => g.id), ['views', 'setup', 'settings', 'connections']);
  assert.ok(GROUPS.every((g) => g.description.length > 10));
});

test('register validates id, title, group and uniqueness', () => {
  const r = createRegistry();
  assert.throws(() => r.register({ title: 'x', group: 'views' } as any), /id/);
  assert.throws(() => r.register({ id: 'x', group: 'views' } as any), /title/);
  assert.throws(() => r.register({ id: 'x', title: 'X', group: 'nope' }), /group/);
  assert.throws(() => r.register({ id: 'Bad Id', title: 'X', group: 'views' }), /id/);
  r.register({ id: 'x', title: 'X', group: 'views' });
  assert.throws(() => r.register({ id: 'x', title: 'Again', group: 'views' }), /duplicate/);
});

test('find, ids and primary work, and defaults are filled in', () => {
  const r = make();
  assert.deepEqual(r.ids(), ['week', 'day', 'commitments', 'notifications']);
  assert.equal(r.find('week')?.title, 'Week');
  assert.equal(r.find('nope'), null);
  assert.deepEqual(r.primary().map((s) => s.id), ['week', 'day']);
  assert.equal(r.find('commitments')?.primary, false);
});

test('byGroup lists only groups that have sections, in order', () => {
  const r = make();
  assert.deepEqual(r.byGroup().map((g) => [g.id, g.items.map((s) => s.id)]), [
    ['views', ['week', 'day']], ['setup', ['commitments']], ['settings', ['notifications']],
  ]);
  assert.equal(r.byGroup().some((g) => g.id === 'connections'), false);
});

test('search ranks title prefix, then title contains, then description, and drops non-matches', () => {
  const r = make();
  assert.deepEqual(r.search('wee').map((s) => s.id), ['week']);
  assert.deepEqual(r.search('NOTIF').map((s) => s.id), ['notifications']);
  assert.deepEqual(r.search('fixed').map((s) => s.id), ['commitments']);
  assert.deepEqual(r.search('zzz'), []);
  assert.equal(r.search('').length, 4);
  assert.deepEqual(r.byGroup('day').map((g) => g.id), ['views']);
  assert.deepEqual(searchSections([{ title: 'Alpha', description: 'x' }, { title: 'Beta', description: 'alpha' }] as any, 'alpha').map((s: any) => s.title), ['Alpha', 'Beta']);
});
```

Create `test/frontend/router.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHash, parseHash, resolveRoute, weekParam } from '../../public/js/router.js';

const ids = ['week', 'day'];

test('parseHash reads the section and an optional parameter', () => {
  assert.deepEqual(parseHash('#/week/2026-10-12'), { id: 'week', param: '2026-10-12' });
  assert.deepEqual(parseHash('#/setup/commitments'), { id: 'setup', param: 'commitments' });
  assert.deepEqual(parseHash('#/day'), { id: 'day', param: null });
  assert.deepEqual(parseHash(''), { id: null, param: null });
  assert.deepEqual(parseHash(undefined as any), { id: null, param: null });
});

test('hostile or malformed hashes never throw and fall back to week', () => {
  for (const hash of ['#/__proto__', '#/constructor', '#/toString', '#/Week', '#//', '#/week/%E0%A4%A', '#/week/../../etc', '#/<script>', 'javascript:alert(1)', '#/week/a/b']) {
    const r = resolveRoute(hash, ids);
    assert.ok(ids.includes(r.id) || r.id === 'week', hash);
  }
  assert.deepEqual(resolveRoute('#/__proto__', ids), { id: 'week', param: null });
  assert.deepEqual(resolveRoute('#/constructor', ids), { id: 'week', param: null });
  assert.deepEqual(resolveRoute('#/day/2026-10-09', ids), { id: 'day', param: '2026-10-09' });
});

test('weekParam keeps a real date and falls back to today otherwise', () => {
  assert.equal(weekParam('2026-10-12', '2026-10-05'), '2026-10-12');
  assert.equal(weekParam('2026-02-31', '2026-10-05'), '2026-10-05');
  assert.equal(weekParam(null, '2026-10-05'), '2026-10-05');
  assert.equal(weekParam('<script>', '2026-10-05'), '2026-10-05');
});

test('buildHash encodes the parameter', () => {
  assert.equal(buildHash('week', '2026-10-12'), '#/week/2026-10-12');
  assert.equal(buildHash('week', null), '#/week');
  assert.equal(buildHash('setup', 'a b'), '#/setup/a%20b');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/frontend/sections.test.ts test/frontend/router.test.ts`
Expected: FAIL (`ERR_MODULE_NOT_FOUND`).

- [ ] **Step 3: Implement**

Create `public/js/sections.js`:

```js
export const GROUPS = [
  { id: 'views', label: 'Views', description: 'Your plan, by day, by week and by due date.' },
  { id: 'setup', label: 'Setup', description: 'What is fixed, what needs time, and the rules I plan by.' },
  { id: 'settings', label: 'Settings', description: 'How the app looks, tells you things, and treats your evenings.' },
  { id: 'connections', label: 'Connections', description: 'Where outside services will live.' },
];

export function searchSections(sections, query) {
  const q = String(query).trim().toLowerCase();
  if (!q) return [...sections];
  const score = (s) => {
    const title = s.title.toLowerCase();
    if (title.startsWith(q)) return 0;
    if (title.includes(q)) return 1;
    if (String(s.description ?? '').toLowerCase().includes(q)) return 2;
    return 3;
  };
  return sections.filter((s) => score(s) < 3).sort((a, b) => score(a) - score(b));
}

export function createRegistry() {
  const list = [];
  return {
    register(section) {
      if (typeof section.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(section.id)) throw new Error('section.id is required and must be lower-case words');
      if (typeof section.title !== 'string' || !section.title) throw new Error('section.title is required');
      if (!GROUPS.some((g) => g.id === section.group)) throw new Error(`unknown group ${section.group}`);
      if (list.some((s) => s.id === section.id)) throw new Error(`duplicate section ${section.id}`);
      list.push({ description: '', primary: false, ...section });
    },
    all: () => [...list],
    ids: () => list.map((s) => s.id),
    find: (id) => list.find((s) => s.id === id) ?? null,
    primary: () => list.filter((s) => s.primary),
    search: (query) => searchSections(list, query),
    byGroup(query = '') {
      const hits = searchSections(list, query);
      return GROUPS.map((g) => ({ ...g, items: hits.filter((s) => s.group === g.id) })).filter((g) => g.items.length > 0);
    },
  };
}
```

Create `public/js/router.js`:

```js
import { isValidDate } from './time.js';

function decode(part) {
  try {
    return decodeURIComponent(part);
  } catch {
    return null;
  }
}

export function parseHash(hash) {
  const m = /^#\/([a-z][a-z0-9-]*)(?:\/([^/?#]*))?$/.exec(typeof hash === 'string' ? hash : '');
  if (!m) return { id: null, param: null };
  return { id: m[1], param: m[2] ? decode(m[2]) : null };
}

export function resolveRoute(hash, ids, fallback = 'week') {
  const { id, param } = parseHash(hash);
  const known = id !== null && ids.includes(id);
  return { id: known ? id : fallback, param: known ? param : null };
}

export const weekParam = (param, today) => (isValidDate(param) ? param : today);

export const buildHash = (id, param) => (param ? `#/${id}/${encodeURIComponent(param)}` : `#/${id}`);
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test`
Expected: PASS for every test file.

- [ ] **Step 5: Commit**

```bash
git add public test
git commit -m "feat: add the section registry, search and router" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Nudge component and mascot

**Files:**
- Create: `public/js/nudge.js`
- Modify: `public/css/app.css` (append the Nudge section)
- Test: `test/frontend/nudge.test.ts`

**Interfaces:**
- Consumes: `createDom`, `keysOf`.
- Produces: `createMascot(dom, { eyes: 'center' | 'side' | 'sleepy', badge: string | null, width: number })` returns an SVG; `createNudge(dom, handlers) -> { el, update(view), focus() }` where `view = { status, items, confirm, error, busy }` and `handlers = { approve(date), undo(date), dismiss(keys), okay(), retry() }`. The element has the class `nudge`, `aria-label="Nudge"`, `tabindex="-1"`, and its message box has `aria-live="polite"`.
- Behavior (board J): quiet shows "All clear." and a 96 px mascot; speaking shows `Nudge` (or `Nudge / 1 of 3` with previous/next buttons when more than one item), the headline, the offer line and buttons (`Use <weekday> evening` and `Leave it` for an offer; only `Leave it` otherwise), an "Ask me" form whose submit shows "I can't answer questions yet. That arrives with the AI phase." and calls no handler; offline shows "I can't reach the planner." with Retry; a confirmation shows "Done. <Weekday> evening is in your plan." with `Okay` and `Undo` (or "<Weekday> evening is open." when nothing needed it). All buttons are disabled while `busy`.

- [ ] **Step 1: Write the failing test**

Create `test/frontend/nudge.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDom } from '../../public/js/dom.js';
import { createMascot, createNudge } from '../../public/js/nudge.js';
import { FakeDocument, byClass, byTag, findAll, textOf } from './fakedom.ts';

const dom = createDom(new FakeDocument() as any);
const offer = { key: 'soft-offer|2026-10-09', date: '2026-10-09', weekday: 'Friday', minutes: 90, cost: 0, line: 'Friday evening is free. I would only touch it for study, and only if you say so.', button: 'Use Friday evening' };
const item = (over: any = {}) => ({ key: 'deadline-short|Chemistry|exam|2026-10-23', headline: 'Chemistry exam, Fri 23 Oct, is 90 min short.', minutes: 90, category: 'study', offer, ...over });
const base = { status: 'ready', items: [], confirm: null, error: null, busy: false };

function setup() {
  const calls: any[] = [];
  const handlers = {
    approve: (d: string) => calls.push(['approve', d]),
    undo: (d: string) => calls.push(['undo', d]),
    dismiss: (k: string[]) => calls.push(['dismiss', k]),
    okay: () => calls.push(['okay']),
    retry: () => calls.push(['retry']),
  };
  const nudge: any = createNudge(dom, handlers);
  return { nudge, calls };
}
const buttons = (el: any) => byTag(el, 'button');
const labelled = (el: any, text: string) => buttons(el).find((b) => textOf(b).trim() === text);

test('quiet: All clear and no buttons', () => {
  const { nudge } = setup();
  nudge.update({ ...base });
  assert.match(textOf(nudge.el), /All clear\./);
  assert.equal(buttons(nudge.el).length, 0);
  assert.equal(nudge.el.getAttribute('aria-label'), 'Nudge');
  assert.equal(nudge.el.getAttribute('tabindex'), '-1');
});

test('loading says Loading, never All clear', () => {
  const { nudge } = setup();
  nudge.update({ ...base, status: 'loading' });
  assert.match(textOf(nudge.el), /Loading/);
  assert.doesNotMatch(textOf(nudge.el), /All clear/);
});

test('speaking: headline, offer line, both buttons and the badge', () => {
  const { nudge, calls } = setup();
  nudge.update({ ...base, items: [item()] });
  const text = textOf(nudge.el);
  assert.match(text, /Chemistry exam, Fri 23 Oct, is 90 min short\./);
  assert.match(text, /Friday evening is free\. I would only touch it for study, and only if you say so\./);
  labelled(nudge.el, 'Use Friday evening')!.click();
  labelled(nudge.el, 'Leave it')!.click();
  assert.deepEqual(calls, [['approve', '2026-10-09'], ['dismiss', [item().key, offer.key]]]);
  assert.equal(textOf(byClass(nudge.el, 'mascot-badge-text')[0]), '1');
  assert.equal(byClass(nudge.el, 'say')[0].getAttribute('aria-live'), 'polite');
});

test('a warning without an offer only has Leave it', () => {
  const { nudge, calls } = setup();
  nudge.update({ ...base, items: [item({ offer: null })] });
  assert.equal(buttons(nudge.el).filter((b) => ['Leave it'].includes(textOf(b).trim())).length, 1);
  assert.equal(labelled(nudge.el, 'Use Friday evening'), undefined);
  labelled(nudge.el, 'Leave it')!.click();
  assert.deepEqual(calls, [['dismiss', [item().key]]]);
});

test('several warnings page with previous and next', () => {
  const { nudge } = setup();
  nudge.update({ ...base, items: [item(), item({ key: 'b', headline: 'Gym is 60 min short in the week of 12 Oct.', offer: null }), item({ key: 'c', headline: 'Third.', offer: null })] });
  assert.match(textOf(nudge.el), /Nudge \/ 1 of 3/);
  assert.equal(textOf(byClass(nudge.el, 'mascot-badge-text')[0]), '3');
  buttons(nudge.el).find((b) => b.getAttribute('aria-label') === 'Next warning')!.click();
  assert.match(textOf(nudge.el), /2 of 3/);
  assert.match(textOf(nudge.el), /Gym is 60 min short/);
  buttons(nudge.el).find((b) => b.getAttribute('aria-label') === 'Previous warning')!.click();
  assert.match(textOf(nudge.el), /1 of 3/);
});

test('the offer states a cost to other tasks when there is one', () => {
  const { nudge } = setup();
  nudge.update({ ...base, items: [item({ offer: { ...offer, cost: 20, line: `${offer.line} It would cost other tasks 20 min.` } })] });
  assert.match(textOf(nudge.el), /It would cost other tasks 20 min\./);
});

test('the Ask field answers honestly and sends nothing', () => {
  const { nudge, calls } = setup();
  nudge.update({ ...base, items: [item()] });
  const form = byTag(nudge.el, 'form')[0];
  const input = byTag(nudge.el, 'input')[0];
  assert.equal(input.getAttribute('aria-label'), 'Ask Nudge');
  input.value = 'move my gym';
  const e = form.dispatch('submit');
  assert.equal(e.defaultPrevented, true);
  assert.match(textOf(nudge.el), /I can't answer questions yet\. That arrives with the AI phase\./);
  assert.deepEqual(calls, []);
});

test('offline shows the plain message and Retry', () => {
  const { nudge, calls } = setup();
  nudge.update({ ...base, status: 'offline' });
  assert.match(textOf(nudge.el), /I can't reach the planner\./);
  assert.match(textOf(nudge.el), /npm run serve/);
  labelled(nudge.el, 'Retry')!.click();
  assert.deepEqual(calls, [['retry']]);
  assert.equal(textOf(byClass(nudge.el, 'mascot-badge-text')[0]), '!');
});

test('a server error says so and shows the message', () => {
  const { nudge } = setup();
  nudge.update({ ...base, status: 'error', error: 'data/db.json is not a valid state file' });
  assert.match(textOf(nudge.el), /Something went wrong\./);
  assert.match(textOf(nudge.el), /data\/db\.json is not a valid state file/);
});

test('confirmation: Okay and Undo, with the minutes that moved in', () => {
  const { nudge, calls } = setup();
  nudge.update({ ...base, confirm: { date: '2026-10-09', weekday: 'Friday', minutes: 120, titles: ['Chemistry'], used: true } });
  assert.match(textOf(nudge.el), /Done\. Friday evening is in your plan\./);
  assert.match(textOf(nudge.el), /120 min of Chemistry moved in\. You can take it back\./);
  labelled(nudge.el, 'Undo')!.click();
  labelled(nudge.el, 'Okay')!.click();
  assert.deepEqual(calls, [['undo', '2026-10-09'], ['okay']]);
});

test('confirmation when nothing needed the evening says so plainly', () => {
  const { nudge } = setup();
  nudge.update({ ...base, confirm: { date: '2026-10-09', weekday: 'Friday', minutes: 0, titles: [], used: false } });
  assert.match(textOf(nudge.el), /Friday evening is open\./);
  assert.match(textOf(nudge.el), /Nothing needed it, so your plan did not change\./);
});

test('buttons are disabled while a request is running', () => {
  const { nudge } = setup();
  nudge.update({ ...base, items: [item()], busy: true });
  for (const b of buttons(nudge.el)) {
    if (['Use Friday evening', 'Leave it'].includes(textOf(b).trim())) assert.equal(b.hasAttribute('disabled'), true);
  }
});

test('hostile text in a headline is shown as text, never as an element', () => {
  const { nudge } = setup();
  const evil = '<img src=x onerror=alert(1)>';
  nudge.update({ ...base, items: [item({ headline: evil, offer: null })] });
  assert.match(textOf(nudge.el), /<img src=x onerror=alert\(1\)>/);
  assert.equal(findAll(nudge.el, (e) => e.tag === 'img').length, 0);
});

test('the mascot has an accessible name and the three eye styles', () => {
  const side: any = createMascot(dom, { eyes: 'side', badge: '2', width: 124 });
  assert.equal(side.getAttribute('role'), 'img');
  assert.match(side.getAttribute('aria-label'), /Nudge/);
  assert.equal(byClass(side, 'mascot-eye').length, 2);
  const sleepy: any = createMascot(dom, { eyes: 'sleepy', badge: null, width: 96 });
  assert.equal(byClass(sleepy, 'mascot-badge').length, 0);
  assert.equal(byClass(sleepy, 'mascot-eye')[0].getAttribute('height'), '8');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/frontend/nudge.test.ts`
Expected: FAIL (`ERR_MODULE_NOT_FOUND` for `public/js/nudge.js`).

- [ ] **Step 3: Implement the component**

Create `public/js/nudge.js`:

```js
import { keysOf } from './nudge-model.js';

const ASK_REPLY = "I can't answer questions yet. That arrives with the AI phase.";

export function createMascot(dom, { eyes = 'center', badge = null, width = 96 } = {}) {
  const { svg } = dom;
  const eye = (x, y, w, h, r) => svg('rect', { class: 'mascot-eye', x, y, width: w, height: h, rx: r });
  const eyeShapes =
    eyes === 'sleepy'
      ? [eye(29, 84, 17, 8, 4), eye(65, 84, 17, 8, 4)]
      : eyes === 'side'
        ? [eye(30, 66, 11, 32, 5.5), eye(66, 66, 11, 32, 5.5)]
        : [eye(36.5, 66, 11, 32, 5.5), eye(72.5, 66, 11, 32, 5.5)];
  return svg(
    'svg',
    { class: 'mascot', width, height: Math.round((width * 4) / 3), viewBox: '0 0 120 160', role: 'img', 'aria-label': 'Nudge, the planner assistant' },
    svg('path', { class: 'mascot-body', d: 'M6 160V62C6 28 32 4 60 4s54 24 54 58v98Z' }),
    ...eyeShapes,
    badge !== null && svg('circle', { class: 'mascot-badge', cx: 100, cy: 22, r: 15 }),
    badge !== null && svg('text', { class: 'mascot-badge-text', x: 100, y: 28, 'text-anchor': 'middle' }, badge),
  );
}

export function createNudge(dom, handlers) {
  const { h, clear } = dom;
  const el = h('aside', { class: 'nudge', 'aria-label': 'Nudge', tabindex: '-1' });
  let view = { status: 'loading', items: [], confirm: null, error: null, busy: false };
  let index = 0;
  let askMessage = null;
  let signature = '';

  const button = (label, onclick, cls = '', extra = {}) =>
    h('button', { type: 'button', class: cls, onclick, disabled: view.busy, ...extra }, label);

  function say(...children) {
    return h('div', { class: 'say', 'aria-live': 'polite' }, ...children);
  }

  function speaking() {
    const item = view.items[index];
    const many = view.items.length > 1;
    const reply = h('p', { class: 'reply' }, askMessage);
    const input = h('input', { type: 'text', 'aria-label': 'Ask Nudge', placeholder: 'Ask me to move something' });
    const form = h('form', { class: 'ask', onsubmit: (e) => {
      e.preventDefault();
      askMessage = ASK_REPLY;
      reply.textContent = askMessage;
      input.value = '';
    } }, input);
    return say(
      h('div', { class: 'pager' },
        h('span', { class: 'mono k' }, many ? `Nudge / ${index + 1} of ${view.items.length}` : 'Nudge'),
        many && h('div', { class: 'pg' },
          h('button', { type: 'button', 'aria-label': 'Previous warning', onclick: () => { index = (index + view.items.length - 1) % view.items.length; render(); } }, '<'),
          h('button', { type: 'button', 'aria-label': 'Next warning', onclick: () => { index = (index + 1) % view.items.length; render(); } }, '>')),
      ),
      h('b', {}, item.headline),
      item.offer && h('p', {}, item.offer.line),
      h('div', { class: 'acts' },
        item.offer && button(item.offer.button, () => handlers.approve(item.offer.date), 'y'),
        button('Leave it', () => handlers.dismiss(keysOf(item))),
      ),
      form,
      reply,
    );
  }

  function render() {
    let bubble = null;
    let eyes = 'center';
    let badge = null;
    let width = 96;
    if (view.status === 'offline' || view.status === 'error') {
      eyes = 'sleepy';
      badge = '!';
      const offline = view.status === 'offline';
      bubble = say(
        h('span', { class: 'mono k' }, 'Nudge'),
        h('b', {}, offline ? "I can't reach the planner." : 'Something went wrong.'),
        h('p', {}, offline ? 'The local server is not running. Start it with npm run serve, then try again. Nothing was lost.' : view.error),
        h('div', { class: 'acts' }, button('Retry', () => handlers.retry(), 'y')),
      );
    } else if (view.confirm) {
      const c = view.confirm;
      bubble = say(
        h('span', { class: 'mono k' }, 'Nudge'),
        h('b', {}, c.used ? `Done. ${c.weekday} evening is in your plan.` : `${c.weekday} evening is open.`),
        h('p', {}, c.used ? `${c.minutes} min of ${c.titles.join(', ')} moved in. You can take it back.` : 'Nothing needed it, so your plan did not change. You can take it back.'),
        h('div', { class: 'acts' }, button('Okay', () => handlers.okay(), 'y'), button('Undo', () => handlers.undo(c.date))),
      );
    } else if (view.items.length > 0) {
      eyes = 'side';
      badge = String(view.items.length);
      width = 124;
      bubble = speaking();
    } else if (view.status === 'loading') {
      bubble = h('div', { class: 'quiet' }, h('span', { class: 'mono' }, 'Loading'));
    } else {
      bubble = h('div', { class: 'quiet' }, h('b', {}, 'All clear.'), h('span', { class: 'mono' }, 'No open warnings this week'));
    }
    clear(el, bubble, createMascot(dom, { eyes, badge, width }));
  }

  return {
    el,
    update(next) {
      view = next;
      const sig = JSON.stringify([view.status, view.items.map((i) => i.key), view.confirm, view.error]);
      if (sig !== signature) {
        signature = sig;
        askMessage = null;
      }
      if (index >= view.items.length) index = 0;
      render();
    },
    focus: () => el.focus(),
  };
}
```

- [ ] **Step 4: Append the Nudge styles**

Append to `public/css/app.css`:

```css
/* Nudge */
.nudge { position: fixed; right: 40px; bottom: 24px; display: flex; align-items: flex-end; gap: 14px; z-index: 20; }
.nudge:focus { outline: none; }
.say { width: 430px; max-width: calc(100vw - 200px); background: var(--ink); color: var(--paper); padding: 16px 18px; display: flex; flex-direction: column; gap: 10px; }
.say b { font-size: 20px; line-height: 1.1; font-weight: 800; letter-spacing: -.02em; }
.say p { margin: 0; font-size: 14px; line-height: 1.35; color: #CFCBC0; }
.say .k { color: var(--study); }
.say .reply { color: var(--paper); }
.say .reply:empty { display: none; }
.pager { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.pg { display: flex; gap: 6px; }
.pg button { width: 30px; height: 26px; border: 2px solid var(--paper); background: transparent; color: var(--paper); font-family: var(--font-mono); }
.acts { display: flex; gap: 8px; }
.acts button { font-size: 13px; padding: 8px 12px; border: 2px solid var(--paper); background: transparent; color: var(--paper); }
.acts button.y { background: var(--study); border-color: var(--study); color: var(--on-study); font-weight: 600; }
.acts button:disabled { opacity: .5; cursor: not-allowed; }
.ask { display: flex; border-top: 1px solid #444; padding-top: 10px; }
.ask input { flex: 1; min-width: 0; background: transparent; border: 0; outline: none; color: var(--paper); font-size: 14px; }
.ask input::placeholder { color: var(--ghost); }
.ask input:focus-visible { outline: 2px solid var(--paper); outline-offset: 2px; }
.say :focus-visible { outline-color: var(--paper); }
.quiet { display: flex; flex-direction: column; gap: 6px; align-items: flex-end; padding-bottom: 10px; }
.quiet b { font-size: 24px; font-weight: 800; letter-spacing: -.03em; line-height: 1; }
.quiet span { color: var(--muted); }
.mascot-body { fill: var(--study); }
.mascot-eye { fill: var(--ink); }
.mascot-badge { fill: var(--ink); }
.mascot-badge-text { fill: var(--paper); font-family: var(--font-mono); font-size: 17px; }
```

- [ ] **Step 5: Run to verify everything passes**

Run: `npm test`
Expected: PASS for every test file.

- [ ] **Step 6: Commit**

```bash
git add public test
git commit -m "feat: add Nudge and the mascot" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Week screen and first-run state

**Files:**
- Create: `public/js/week.js`
- Modify: `public/css/app.css` (append the Week section)
- Test: `test/frontend/week.test.ts`

**Interfaces:**
- Consumes: `createDom`, `GROUPS`, `hhmm`, `duration`, a `weekModel` result.
- Produces: `renderWeek(dom, view, actions) -> element` with `view = { model, visible: Set, needsYou, isEmpty }` and `actions = { toggleGroup(id), go(deltaWeeks), today(), loadExample(), canAdd, focusNudge() }`.
- Structure (board D and I): a `section.week` containing a hero (`h1` "Week N", range, "7 days", and either an "N needs you" button or "All clear"; Prev, Today and Next buttons), a 7-column grid of days (weekday, day number, `Booked <h>h<mm>`, blocks as `div.blk.g-<group>` with a `.top` row of time and label and a title; a dashed "Nothing planned" placeholder when a day has no visible items), and a "Show" filter list (one `button.fl` per group with a swatch, name, count and `aria-pressed`). In the first-run state (`isEmpty`) the filters and "Booked" lines are replaced by the lead text "Nothing planned yet. Start with what is fixed: classes, work, lessons. I plan everything else around it." with a "Load the example" button, and an "Add a commitment" link only when `actions.canAdd` is true; the day grid shows empty placeholders.

- [ ] **Step 1: Write the failing test**

Create `test/frontend/week.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDom } from '../../public/js/dom.js';
import { GROUP_IDS, weekModel } from '../../public/js/model.js';
import { renderWeek } from '../../public/js/week.js';
import { FakeDocument, byClass, byTag, findAll, textOf } from './fakedom.ts';

const dom = createDom(new FakeDocument() as any);
const block = (date: string, start: number, end: number, title: string, category: string) => ({ taskId: title, title, category, date, start, end });
const state = (over: any = {}) => ({
  commitments: [{ id: 'm', title: 'Mass', category: 'mass', start: 1200, end: 1260, pattern: { kind: 'once', date: '2026-10-18' }, exceptions: [], bufferBefore: 30 }],
  tasks: [], deadlines: [], blocks: [
    block('2026-10-12', 480, 535, 'Chemistry', 'study'),
    block('2026-10-13', 765, 825, 'Gym', 'gym'),
    block('2026-10-14', 585, 620, 'Side project', 'personal project'),
    block('2026-10-12', 635, 665, 'Laundry', 'chores'),
  ], ...over,
});
const all = new Set(GROUP_IDS);

function setup(over: any = {}, actionOver: any = {}) {
  const calls: any[] = [];
  const actions = {
    toggleGroup: (id: string) => calls.push(['toggle', id]),
    go: (n: number) => calls.push(['go', n]),
    today: () => calls.push(['today']),
    loadExample: () => calls.push(['example']),
    focusNudge: () => calls.push(['nudge']),
    canAdd: false,
    ...actionOver,
  };
  const s = over.state ?? state();
  const visible = over.visible ?? all;
  const el: any = renderWeek(dom, { model: weekModel(s, '2026-10-12', visible, '2026-10-13'), visible, needsYou: over.needsYou ?? 0, isEmpty: over.isEmpty ?? false }, actions);
  return { el, calls };
}

test('the hero shows the ISO week, the range and the weekly status', () => {
  const { el } = setup({ needsYou: 2 });
  assert.equal(textOf(byTag(el, 'h1')[0]), 'Week 42');
  assert.match(textOf(el), /12 – 18 Oct 2026/);
  assert.match(textOf(el), /7 days/);
  assert.match(textOf(el), /2 need you/);
  assert.equal(setup({ needsYou: 1 }).el.textContent.includes('1 needs you'), true);
  assert.match(textOf(setup({ needsYou: 0 }).el), /All clear/);
});

test('seven day columns with weekday, number, booked time and blocks in the board format', () => {
  const { el } = setup();
  const days = byClass(el, 'day');
  assert.equal(days.length, 7);
  const mon = days[0];
  assert.match(textOf(mon), /Mon/);
  assert.match(textOf(mon), /12/);
  assert.match(textOf(mon), /Booked 1h25/);
  assert.match(textOf(mon), /08:00–08:55/);
  assert.match(textOf(mon), /Chemistry/);
  const chem = byClass(mon, 'blk').find((b) => textOf(b).includes('Chemistry'))!;
  assert.ok(chem.hasClass('g-study'));
  assert.equal(textOf(byClass(chem, 'k')[0]), 'study');
  assert.ok(byClass(days[2], 'blk')[0].hasClass('g-outline'));
  assert.equal(textOf(byClass(byClass(days[2], 'blk')[0], 'k')[0]), 'project');
  assert.ok(byClass(days[6], 'blk')[0].hasClass('g-fixed'));
  assert.equal(days[1].hasClass('today'), true);
});

test('days with nothing visible show the dashed placeholder', () => {
  const { el } = setup();
  assert.match(textOf(byClass(byClass(el, 'day')[3], 'ghost')[0]), /Nothing planned/);
});

test('the filter list shows counts, toggles groups and reflects pressed state', () => {
  const { el, calls } = setup({ visible: new Set(['study']) });
  const fl = byClass(el, 'fl');
  assert.equal(fl.length, 5);
  const study = fl.find((b) => textOf(b).includes('Study'))!;
  assert.equal(study.getAttribute('aria-pressed'), 'true');
  assert.equal(textOf(byClass(study, 'ct')[0]), '1');
  const gym = fl.find((b) => textOf(b).includes('Gym'))!;
  assert.equal(gym.getAttribute('aria-pressed'), 'false');
  gym.click();
  assert.deepEqual(calls, [['toggle', 'gym']]);
  assert.equal(findAll(el, (e) => e.hasClass('blk') && textOf(e).includes('Gym')).length, 0);
  assert.equal(textOf(byClass(fl.find((b) => textOf(b).includes('Fixed'))!, 'ct')[0]), '1');
});

test('week navigation buttons call the actions and the needs-you button focuses Nudge', () => {
  const { el, calls } = setup({ needsYou: 1 });
  const named = (label: string) => byTag(el, 'button').find((b) => b.getAttribute('aria-label') === label || textOf(b).trim() === label)!;
  named('Previous week').click();
  named('Today').click();
  named('Next week').click();
  byClass(el, 'needs')[0].click();
  assert.deepEqual(calls, [['go', -1], ['today'], ['go', 1], ['nudge']]);
});

test('hostile titles render as text and create no elements', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const { el } = setup({ state: state({ blocks: [block('2026-10-12', 480, 540, evil, evil)] }) });
  assert.match(textOf(el), /<img src=x onerror=alert\(1\)>/);
  assert.equal(findAll(el, (e) => e.tag === 'img').length, 0);
});

test('first run: lead text, Load the example, no filters or booked lines', () => {
  const { el, calls } = setup({ isEmpty: true, state: state({ blocks: [], commitments: [] }) });
  assert.match(textOf(el), /Nothing planned yet\. Start with what is fixed: classes, work, lessons\. I plan everything else around it\./);
  assert.equal(byClass(el, 'fl').length, 0);
  assert.doesNotMatch(textOf(el), /Booked/);
  assert.equal(byClass(el, 'ghost').length, 7);
  byTag(el, 'button').find((b) => textOf(b).trim() === 'Load the example')!.click();
  assert.deepEqual(calls, [['example']]);
  assert.equal(byTag(el, 'a').length, 0);
});

test('first run offers Add a commitment only when the setup section exists', () => {
  const { el } = setup({ isEmpty: true, state: state({ blocks: [], commitments: [] }) }, { canAdd: true });
  const link = byTag(el, 'a')[0];
  assert.equal(textOf(link).trim(), 'Add a commitment');
  assert.equal(link.getAttribute('href'), '#/setup');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/frontend/week.test.ts`
Expected: FAIL (`ERR_MODULE_NOT_FOUND` for `public/js/week.js`).

- [ ] **Step 3: Implement**

Create `public/js/week.js`:

```js
import { GROUPS } from './model.js';
import { duration, hhmm } from './time.js';

export function renderWeek(dom, view, actions) {
  const { h } = dom;
  const { model, visible, needsYou, isEmpty } = view;

  const block = (item) =>
    h('div', { class: `blk g-${item.group}` },
      h('div', { class: 'top' }, h('span', { class: 't' }, `${hhmm(item.start)}–${hhmm(item.end)}`), h('span', { class: 'k' }, item.label)),
      h('span', { class: 'n' }, item.title));

  const day = (d) =>
    h('div', { class: d.isToday ? 'day today' : 'day', role: 'group', 'aria-label': `${d.weekday} ${d.num}` },
      h('div', { class: 'dh' }, h('span', { class: 'mono' }, d.weekday), h('span', { class: 'dd' }, d.num)),
      !isEmpty && h('p', { class: 'booked mono' }, `Booked ${duration(d.booked)}`),
      d.items.length > 0 ? d.items.map(block) : h('div', { class: 'ghost mono' }, 'Nothing planned'));

  const status = needsYou > 0
    ? h('button', { type: 'button', class: 'needs mono', onclick: () => actions.focusNudge() }, `${needsYou} need${needsYou === 1 ? 's' : ''} you`)
    : h('span', {}, 'All clear');

  const hero = h('div', { class: 'hero' },
    h('h1', {}, `Week ${model.week}`),
    h('div', { class: 'right' },
      h('div', { class: 'step mono' },
        h('button', { type: 'button', 'aria-label': 'Previous week', onclick: () => actions.go(-1) }, 'Prev'),
        h('button', { type: 'button', onclick: () => actions.today() }, 'Today'),
        h('button', { type: 'button', 'aria-label': 'Next week', onclick: () => actions.go(1) }, 'Next')),
      h('div', { class: 'meta mono' }, h('span', {}, model.range), h('span', {}, '7 days'), status)));

  const grid = h('div', { class: 'grid' }, model.days.map(day));

  if (isEmpty) {
    return h('section', { class: 'week' }, hero,
      h('div', { class: 'lead' },
        h('p', {}, 'Nothing planned yet. Start with what is fixed: classes, work, lessons. I plan everything else around it.'),
        h('div', { class: 'cta' },
          h('button', { type: 'button', class: 'btn y', onclick: () => actions.loadExample() }, 'Load the example'),
          actions.canAdd && h('a', { class: 'btn', href: '#/setup' }, 'Add a commitment'))),
      grid);
  }

  const filters = h('div', { class: 'filters' },
    h('span', { class: 'mono h' }, 'Show'),
    GROUPS.map((g) =>
      h('button', { type: 'button', class: 'fl', 'aria-pressed': String(visible.has(g.id)), onclick: () => actions.toggleGroup(g.id) },
        h('i', { class: `sw g-${g.id}` }), h('span', { class: 'nm' }, g.label), h('span', { class: 'ct' }, model.counts[g.id]))));

  return h('section', { class: 'week' }, hero, grid, h('div', { class: 'foot' }, filters));
}
```

- [ ] **Step 4: Append the Week styles**

Append to `public/css/app.css`:

```css
/* Week */
.hero { padding: 0 40px; display: flex; align-items: flex-end; justify-content: space-between; gap: 28px; }
.hero h1 { margin: 0; font-size: 236px; line-height: .8; font-weight: 800; letter-spacing: -.06em; }
.hero .right { display: flex; align-items: flex-end; gap: 28px; }
.meta { display: flex; flex-direction: column; gap: 6px; text-align: right; padding-bottom: 6px; }
.needs { border: 0; background: transparent; padding: 0; text-align: right; text-decoration: underline; text-underline-offset: 3px; }
.step { display: flex; gap: 8px; padding-bottom: 4px; }
.step button { padding: 8px 12px; border: 2px solid var(--ink); background: transparent; }
.grid { margin: 30px 40px 0; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; }
.dh { display: flex; align-items: baseline; justify-content: space-between; border-top: 4px solid var(--ink); padding: 8px 0 2px; }
.day.today .dh { border-top-color: var(--study); }
.dd { font-size: 40px; font-weight: 800; letter-spacing: -.04em; line-height: 1; }
.booked { margin: 0 0 10px; color: var(--muted); }
.blk { padding: 8px 10px 9px; margin-bottom: 6px; display: flex; flex-direction: column; gap: 3px; }
.blk .top { display: flex; justify-content: space-between; align-items: baseline; }
.blk .t { font-family: var(--font-mono); font-size: 11px; letter-spacing: .04em; }
.blk .k { font-family: var(--font-mono); font-size: 9px; letter-spacing: .1em; text-transform: uppercase; opacity: .85; }
.blk .n { font-size: 15px; font-weight: 600; line-height: 1.1; overflow-wrap: anywhere; }
.g-fixed { background: var(--ink); color: var(--paper); }
.g-study { background: var(--study); color: var(--on-study); }
.g-gym { background: var(--gym); color: var(--on-gym); }
.g-admin { background: var(--admin); color: var(--on-admin); }
.g-outline { border: 2px solid var(--ink); padding: 6px 8px 7px; }
.ghost { border: 2px dashed var(--line); min-height: 60px; padding: 8px 10px; color: var(--ghost); }
.foot { margin: 40px 40px 0; }
.filters { display: flex; flex-direction: column; gap: 4px; width: 250px; }
.filters .h { margin-bottom: 4px; color: var(--muted); }
.fl { display: flex; align-items: center; gap: 10px; width: 100%; padding: 3px 0; border: 0; background: transparent; text-align: left; }
.fl[aria-pressed="false"] { opacity: .45; }
.fl .sw { width: 16px; height: 16px; flex: none; display: inline-block; padding: 0; }
.fl .nm { flex: 1; font-size: 14px; font-weight: 600; }
.fl .ct { font-family: var(--font-mono); font-size: 12px; color: var(--muted); }
.lead { display: flex; justify-content: space-between; align-items: flex-start; gap: 60px; margin: 34px 40px 0; }
.lead p { margin: 0; font-size: 26px; line-height: 1.25; font-weight: 600; letter-spacing: -.02em; max-width: 620px; }
.cta { display: flex; gap: 10px; flex: none; }
.cta .btn { padding: 16px 22px; font-weight: 600; font-size: 15px; text-decoration: none; }
.cta .btn.y { background: var(--study); color: var(--on-study); }
.week .ghost { color: var(--ghost); }

@media (max-width: 1100px) {
  .hero { flex-direction: column; align-items: flex-start; }
  .hero h1 { font-size: 120px; }
  .hero .right { flex-wrap: wrap; align-items: flex-start; }
  .meta { text-align: left; }
  .grid { grid-template-columns: 1fr; }
  .lead { flex-direction: column; gap: 24px; }
  .say { width: auto; }
}
```

- [ ] **Step 5: Run to verify everything passes**

Run: `npm test`
Expected: PASS for every test file.

- [ ] **Step 6: Commit**

```bash
git add public test
git commit -m "feat: add the Week screen and first-run state" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Menu with Jump-to search

**Files:**
- Create: `public/js/menu.js`
- Modify: `public/css/app.css` (append the Menu section)
- Test: `test/frontend/menu.test.ts`

**Interfaces:**
- Consumes: `createDom`, a registry (`byGroup`, `search`), `GROUPS`.
- Produces: `createMenu(dom, registry, handlers) -> { el, open(opener), close(), isOpen(), refresh() }` with `handlers = { navigate(id), current() }`.
- Behavior (board K): the overlay is `div.menu` with `role="dialog"`, `aria-modal="true"`, `aria-label="Menu"`, hidden until opened. It has a bar (brand and a Close button), a "Jump to" input (label, placeholder "Type to find anything", the `/` hint), one column per group that has matches (heading, links `<a class="it" href="#/<id>">`, group description), and a footer line. The current section link has `aria-current="page"`. Typing filters the links; groups with no matches disappear. `Enter` in the input navigates to the best match and closes; `Escape` closes; clicking a link closes; `Tab` and `Shift+Tab` stay inside the overlay. `open(opener)` shows the overlay, clears the query and focuses the input; `close()` hides it and returns focus to the opener.

- [ ] **Step 1: Write the failing test**

Create `test/frontend/menu.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDom } from '../../public/js/dom.js';
import { createMenu } from '../../public/js/menu.js';
import { createRegistry } from '../../public/js/sections.js';
import { FakeDocument, byClass, byTag, textOf } from './fakedom.ts';

function setup() {
  const doc: any = new FakeDocument();
  const dom = createDom(doc);
  const registry = createRegistry();
  registry.register({ id: 'week', title: 'Week', group: 'views', description: 'Your plan for the week.', primary: true });
  registry.register({ id: 'day', title: 'Day', group: 'views', description: 'One day.' });
  registry.register({ id: 'commitments', title: 'Commitments', group: 'setup', description: 'What is fixed.' });
  const calls: string[] = [];
  const menu: any = createMenu(dom, registry, { navigate: (id: string) => calls.push(id), current: () => 'week' });
  const opener: any = doc.createElement('button');
  const links = () => byClass(menu.el, 'it');
  const input = () => byTag(menu.el, 'input')[0];
  const type = (value: string) => { input().value = value; input().dispatch('input'); };
  return { doc, menu, opener, calls, links, input, type };
}

test('closed by default, with the dialog semantics from the board', () => {
  const { menu } = setup();
  assert.equal(menu.isOpen(), false);
  assert.equal(menu.el.hasAttribute('hidden'), true);
  assert.equal(menu.el.getAttribute('role'), 'dialog');
  assert.equal(menu.el.getAttribute('aria-modal'), 'true');
  assert.equal(menu.el.getAttribute('aria-label'), 'Menu');
});

test('open shows the groups that have sections, marks the current one and focuses the input', () => {
  const { menu, opener, links, input, doc } = setup();
  menu.open(opener);
  assert.equal(menu.isOpen(), true);
  assert.equal(menu.el.hasAttribute('hidden'), false);
  assert.equal(doc.activeElement, input());
  assert.deepEqual(byClass(menu.el, 'gh').map(textOf), ['Views', 'Setup']);
  assert.deepEqual(links().map((l: any) => l.getAttribute('href')), ['#/week', '#/day', '#/commitments']);
  assert.equal(links()[0].getAttribute('aria-current'), 'page');
  assert.equal(links()[1].hasAttribute('aria-current'), false);
  assert.match(textOf(menu.el), /Your plan, by day, by week and by due date\./);
  assert.equal(input().getAttribute('placeholder'), 'Type to find anything');
});

test('typing filters the links and hides empty groups', () => {
  const { menu, opener, links, type } = setup();
  menu.open(opener);
  type('comm');
  assert.deepEqual(links().map((l: any) => l.getAttribute('href')), ['#/commitments']);
  assert.deepEqual(byClass(menu.el, 'gh').map(textOf), ['Setup']);
  type('zzz');
  assert.equal(links().length, 0);
  assert.match(textOf(menu.el), /No match/);
  type('');
  assert.equal(links().length, 3);
});

test('Enter opens the best match and closes; with no match it stays open', () => {
  const { menu, opener, calls, type, input } = setup();
  menu.open(opener);
  type('da');
  const e = input().dispatch('keydown', { key: 'Enter' });
  assert.equal(e.defaultPrevented, true);
  assert.deepEqual(calls, ['day']);
  assert.equal(menu.isOpen(), false);
  menu.open(opener);
  type('zzz');
  input().dispatch('keydown', { key: 'Enter' });
  assert.deepEqual(calls, ['day']);
  assert.equal(menu.isOpen(), true);
});

test('Escape and the Close button close and return focus to the opener', () => {
  const { menu, opener, doc } = setup();
  menu.open(opener);
  menu.el.dispatch('keydown', { key: 'Escape' });
  assert.equal(menu.isOpen(), false);
  assert.equal(doc.activeElement, opener);
  menu.open(opener);
  byTag(menu.el, 'button').find((b: any) => textOf(b).includes('Close'))!.click();
  assert.equal(menu.isOpen(), false);
  assert.equal(doc.activeElement, opener);
});

test('clicking a link closes the menu', () => {
  const { menu, opener, links } = setup();
  menu.open(opener);
  links()[1].click();
  assert.equal(menu.isOpen(), false);
});

test('Tab and Shift+Tab stay inside the overlay', () => {
  const { menu, opener, links, doc } = setup();
  menu.open(opener);
  const close = byTag(menu.el, 'button')[0];
  const last = links()[links().length - 1];
  last.focus();
  const forward = menu.el.dispatch('keydown', { key: 'Tab', shiftKey: false, target: last });
  assert.equal(forward.defaultPrevented, true);
  assert.equal(doc.activeElement, close);
  const back = menu.el.dispatch('keydown', { key: 'Tab', shiftKey: true, target: close });
  assert.equal(back.defaultPrevented, true);
  assert.equal(doc.activeElement, last);
});

test('a section registered later appears after refresh', () => {
  const doc: any = new FakeDocument();
  const dom = createDom(doc);
  const registry = createRegistry();
  registry.register({ id: 'week', title: 'Week', group: 'views' });
  const menu: any = createMenu(dom, registry, { navigate() {}, current: () => 'week' });
  menu.open(doc.createElement('button'));
  assert.equal(byClass(menu.el, 'it').length, 1);
  registry.register({ id: 'notifications', title: 'Notifications', group: 'settings' });
  menu.refresh();
  assert.deepEqual(byClass(menu.el, 'it').map((l: any) => l.getAttribute('href')), ['#/week', '#/notifications']);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/frontend/menu.test.ts`
Expected: FAIL (`ERR_MODULE_NOT_FOUND` for `public/js/menu.js`).

- [ ] **Step 3: Implement**

Create `public/js/menu.js`:

```js
export function createMenu(dom, registry, handlers) {
  const { h, clear } = dom;
  let query = '';
  let opener = null;
  let open = false;
  let focusList = [];

  const columns = h('div', { class: 'cols' });
  const closeButton = h('button', { type: 'button', class: 'close mono', onclick: () => close() }, 'Close  Esc');
  const input = h('input', {
    id: 'menu-q',
    class: 'q',
    type: 'text',
    placeholder: 'Type to find anything',
    autocomplete: 'off',
    oninput: (e) => {
      query = e.target.value;
      renderColumns();
    },
  });

  const el = h('div', { class: 'menu', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Menu', hidden: true,
    onkeydown: (e) => {
      if (e.key === 'Escape') {
        close();
      } else if (e.key === 'Enter' && e.target === input) {
        e.preventDefault();
        const first = registry.search(query)[0];
        if (first) {
          handlers.navigate(first.id);
          close();
        }
      } else if (e.key === 'Tab' && focusList.length > 0) {
        const at = focusList.indexOf(e.target);
        const edge = e.shiftKey ? at <= 0 : at === focusList.length - 1;
        if (edge) {
          e.preventDefault();
          focusList[e.shiftKey ? focusList.length - 1 : 0].focus();
        }
      }
    } },
    h('div', { class: 'bar' }, h('span', { class: 'mono' }, 'doitwithme'), closeButton),
    h('div', { class: 'jump' },
      h('label', { class: 'mono', for: 'menu-q' }, 'Jump to'), input, h('span', { class: 'key mono' }, '/')),
    columns,
    h('div', { class: 'foot-note mono' }, h('span', {}, 'Enter opens the first match'), h('span', {}, 'Esc closes')));

  function renderColumns() {
    const current = handlers.current();
    const links = [];
    const groups = registry.byGroup(query);
    const content = groups.map((g) =>
      h('div', { class: 'grp' },
        h('span', { class: 'mono gh' }, g.label),
        g.items.map((s) => {
          const link = h('a', {
            class: s.id === current ? 'it on' : 'it',
            href: `#/${s.id}`,
            'aria-current': s.id === current ? 'page' : null,
            onclick: () => close(),
          }, s.title);
          links.push(link);
          return link;
        }),
        h('p', { class: 'desc' }, g.description)));
    clear(columns, groups.length > 0 ? content : h('p', { class: 'none mono' }, 'No match'));
    focusList = [closeButton, input, ...links];
  }

  function close() {
    if (!open) return;
    open = false;
    el.setAttribute('hidden', '');
    if (opener) opener.focus();
  }

  renderColumns();

  return {
    el,
    isOpen: () => open,
    refresh: renderColumns,
    open(from) {
      opener = from ?? null;
      open = true;
      query = '';
      input.value = '';
      renderColumns();
      el.removeAttribute('hidden');
      input.focus();
    },
    close,
  };
}
```

- [ ] **Step 4: Append the Menu styles**

Append to `public/css/app.css`:

```css
/* Menu */
.menu { position: fixed; inset: 0; z-index: 50; overflow: auto; background: var(--ink); color: var(--paper); }
.menu[hidden] { display: none; }
.menu .bar { padding: 0 40px; }
.menu :focus-visible { outline-color: var(--paper); }
.menu .close { padding: 8px 16px; border: 2px solid var(--paper); background: transparent; color: var(--paper); }
.jump { margin: 26px 40px 0; display: flex; align-items: baseline; gap: 18px; border-bottom: 2px solid var(--paper); padding-bottom: 12px; }
.jump label { color: var(--study); }
.jump input { flex: 1; min-width: 0; background: transparent; border: 0; outline: none; color: var(--paper); font-size: 64px; font-weight: 800; letter-spacing: -.04em; line-height: 1; }
.jump input::placeholder { color: #4A4740; }
.jump input:focus-visible { outline: 2px solid var(--paper); outline-offset: 6px; }
.jump .key { border: 2px solid #4A4740; padding: 4px 10px; color: var(--ghost); }
.menu .cols { margin: 48px 40px 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 28px; }
.menu .grp { display: flex; flex-direction: column; gap: 2px; }
.menu .gh { color: var(--study); border-top: 4px solid var(--paper); padding-top: 10px; margin-bottom: 10px; }
.it { display: block; padding: 4px 0; text-decoration: none; color: var(--paper); font-size: 44px; font-weight: 800; letter-spacing: -.04em; line-height: 1.06; }
.it.on { color: var(--study); }
.menu .desc { margin: 14px 0 0; font-size: 14px; line-height: 1.4; color: var(--ghost); max-width: 280px; }
.menu .none { grid-column: 1 / -1; color: var(--ghost); }
.foot-note { display: flex; justify-content: space-between; margin: 60px 40px 40px; color: var(--ghost); }

@media (max-width: 1100px) {
  .menu .cols { grid-template-columns: 1fr; }
  .jump input { font-size: 36px; }
}
```

- [ ] **Step 5: Run to verify everything passes**

Run: `npm test`
Expected: PASS for every test file.

- [ ] **Step 6: Commit**

```bash
git add public test
git commit -m "feat: add the Menu with Jump-to search" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Boot, shell and end-to-end test

**Files:**
- Create: `public/js/main.js`
- Modify: `public/css/app.css` (append shell state styles if needed, see Step 4)
- Test: `test/frontend/e2e.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `startApp({ root, document, fetch, win, now }) -> { store, render, navigate(hash), menu, nudge }`. It registers the `week` section (group `views`, primary), builds the shell (a header with the brand link, the primary tabs as `<a class="tab" href="#/<id>">` with `aria-current="page"` on the current one, a Menu button and a Replan button), a `main` area, the Nudge and the Menu, loads the store, and re-renders on every store change and hash change. The visible group filters are kept in `win.localStorage` under `doitwithme.visible` when it exists (wrapped in try/catch). `/` opens the Menu unless the focus is in a text field. When the module loads in a browser (a `#app` element exists) it starts itself.
- Behavior: while loading the main area says "Loading"; offline or error with no data shows a heading and sentence ("I can't reach the planner." or "Something went wrong.") so the screen is never blank, and Nudge shows its offline or error state with Retry; the Replan button is disabled while a request runs.

- [ ] **Step 1: Write the failing end-to-end test**

Create `test/frontend/e2e.test.ts`:

```ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../../src/server.ts';
import { emptyState } from '../../src/store.ts';
import { defaultPreferences } from '../../src/defaults.ts';
import { startApp } from '../../public/js/main.js';
import { FakeDocument, byClass, byTag, findAll, textOf } from './fakedom.ts';

let server: Server;
let base: string;
const json = { 'content-type': 'application/json' };
const now = () => new Date(2026, 9, 5, 9, 0); // Monday 5 Oct 2026, 09:00

const task = (over: any = {}) => ({ id: 't1', title: 'Study', category: 'study', weeklyMinutes: 5000, maxBlock: 120, onePerDay: false, priority: 3, ...over });
const studyState = (over: any = {}) => ({
  ...emptyState(),
  tasks: [task()],
  preferences: {
    ...structuredClone(defaultPreferences),
    weekdayWindow: { start: 1080, end: 1200 }, dayOffWindow: { start: 1080, end: 1200 },
    daysOff: [], softWindows: [{ weekday: 5, start: 1080, end: 1440 }], softMode: 'ask',
  },
  ...over,
});
const put = (state: any) => fetch(`${base}/api/state`, { method: 'PUT', headers: json, body: JSON.stringify(state) });

before(async () => {
  server = createApp(join(mkdtempSync(join(tmpdir(), 'doitwithme-e2e-')), 'db.json'));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
});

function boot(fetchFn?: any) {
  const document: any = new FakeDocument();
  const root = document.createElement('div');
  const win: any = { location: { hash: '' }, localStorage: undefined, listeners: {}, addEventListener(t: string, f: Function) { (this.listeners[t] ??= []).push(f); } };
  const app: any = startApp({ root, document, fetch: fetchFn ?? ((p: string, i: any) => fetch(base + p, i)), win, now });
  return { app, root, document, win };
}
async function settled(app: any) {
  for (let i = 0; i < 300; i++) {
    const s = app.store.get();
    if (s.status !== 'loading' && !s.busy) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('the app did not settle');
}
const click = (root: any, label: string) => byTag(root, 'button').find((b: any) => textOf(b).trim() === label)!.click();
const fridayColumn = (root: any) => byClass(root, 'day')[4];

test('the real server serves the page and its script', async () => {
  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<div id="app">/);
  const script = await fetch(`${base}/js/main.js`);
  assert.equal(script.status, 200);
  assert.match(script.headers.get('content-type') ?? '', /javascript/);
});

test('boots, draws the week, and walks the whole approve, undo and dismiss story', async () => {
  assert.equal((await put(studyState())).status, 200);
  const { app, root } = boot();
  await settled(app);

  // the shell and the week
  assert.equal(textOf(byTag(root, 'h1')[0]), 'Week 41');
  assert.match(textOf(root), /5 – 11 Oct 2026/);
  assert.equal(byClass(root, 'day').length, 7);
  assert.match(textOf(byClass(root, 'day')[0]), /18:00–20:00/);
  assert.match(textOf(fridayColumn(root)), /Nothing planned/);
  assert.equal(byTag(root, 'nav').length, 1);
  assert.equal(findAll(root, (e) => e.tag === 'a' && e.hasClass('tab')).length, 1);

  // Nudge speaks and offers Friday evening
  const nudge = byClass(root, 'nudge')[0];
  assert.match(textOf(nudge), /Study is 4280 min short in the week of 5 Oct\./);
  assert.match(textOf(nudge), /Friday evening is free\./);

  // approve
  click(nudge, 'Use Friday evening');
  await app.store.idle();
  assert.match(textOf(fridayColumn(root)), /18:00–20:00/);
  assert.match(textOf(byClass(root, 'nudge')[0]), /Done\. Friday evening is in your plan\./);
  assert.match(textOf(byClass(root, 'nudge')[0]), /120 min of Study moved in\./);

  // undo
  click(byClass(root, 'nudge')[0], 'Undo');
  await app.store.idle();
  assert.match(textOf(fridayColumn(root)), /Nothing planned/);

  // dismiss ("Leave it") clears the warnings and Nudge goes quiet
  click(byClass(root, 'nudge')[0], 'Leave it');
  await app.store.idle();
  for (let i = 0; i < 4 && /Leave it/.test(textOf(byClass(root, 'nudge')[0])); i++) {
    click(byClass(root, 'nudge')[0], 'Leave it');
    await app.store.idle();
  }
  assert.match(textOf(byClass(root, 'nudge')[0]), /All clear\./);
  assert.match(textOf(root), /All clear/);
});

test('week navigation and the Menu work through the router', async () => {
  assert.equal((await put(studyState())).status, 200);
  const { app, root, document } = boot();
  await settled(app);
  click(root, 'Next');
  assert.equal(textOf(byTag(root, 'h1')[0]), 'Week 42');
  app.navigate('#/__proto__');
  assert.equal(textOf(byTag(root, 'h1')[0]), 'Week 41');
  app.navigate('#/week/2026-02-31');
  assert.equal(textOf(byTag(root, 'h1')[0]), 'Week 41');
  document.dispatch('keydown', { key: '/', target: { tag: 'body' } });
  assert.equal(app.menu.isOpen(), true);
  const typing = document.dispatch('keydown', { key: '/', target: { tag: 'input' } });
  assert.equal(typing.defaultPrevented, false);
});

test('an empty data file shows the first-run screen and Load the example fills it in', async () => {
  assert.equal((await put(emptyState())).status, 200);
  const { app, root } = boot();
  await settled(app);
  assert.match(textOf(root), /Nothing planned yet\./);
  click(root, 'Load the example');
  await app.store.idle();
  assert.doesNotMatch(textOf(root), /Nothing planned yet\./);
  assert.ok(byClass(root, 'blk').length > 0);
});

test('offline never shows a blank screen, and Retry recovers', async () => {
  assert.equal((await put(studyState())).status, 200);
  let down = true;
  const { app, root } = boot(async (p: string, i: any) => {
    if (down) throw new TypeError('failed');
    return fetch(base + p, i);
  });
  await settled(app);
  assert.match(textOf(root), /I can't reach the planner\./);
  assert.match(textOf(byClass(root, 'nudge')[0]), /npm run serve/);
  down = false;
  click(byClass(root, 'nudge')[0], 'Retry');
  await settled(app);
  assert.equal(byClass(root, 'day').length, 7);
});

test('a corrupt data file shows what went wrong instead of a blank screen', async () => {
  const { app, root } = boot(async () => ({ ok: false, status: 500, json: async () => ({ error: 'data/db.json is not a valid state file: tasks must be a list' }) }));
  await settled(app);
  assert.match(textOf(root), /Something went wrong\./);
  assert.match(textOf(root), /data\/db\.json is not a valid state file/);
  assert.equal(app.store.get().status, 'error');
});

test('hostile titles from the server render as text only', async () => {
  const evil = '<img src=x onerror=alert(1)>';
  assert.equal((await put(studyState({ tasks: [task({ title: evil, weeklyMinutes: 100 })] }))).status, 200);
  const { app, root } = boot();
  await settled(app);
  assert.match(textOf(root), /<img src=x onerror=alert\(1\)>/);
  assert.equal(findAll(root, (e) => e.tag === 'img').length, 0);
});

test('the Replan button is disabled while a request runs', async () => {
  assert.equal((await put(studyState())).status, 200);
  let release: Function = () => {};
  const gate = new Promise<void>((r) => (release = r));
  let held = false;
  const { app, root } = boot(async (p: string, i: any) => {
    if (held && p === '/api/replan') await gate;
    return fetch(base + p, i);
  });
  await settled(app);
  held = true;
  const replan = byTag(root, 'button').find((b: any) => textOf(b).includes('Replan'))!;
  replan.click();
  assert.equal(byTag(root, 'button').find((b: any) => textOf(b).includes('Replan'))!.hasAttribute('disabled'), true);
  release();
  await app.store.idle();
  assert.equal(byTag(root, 'button').find((b: any) => textOf(b).includes('Replan'))!.hasAttribute('disabled'), false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/frontend/e2e.test.ts`
Expected: FAIL (`ERR_MODULE_NOT_FOUND` for `public/js/main.js`).

- [ ] **Step 3: Implement**

Create `public/js/main.js`:

```js
import { createApi } from './api.js';
import { createDom } from './dom.js';
import { createMenu } from './menu.js';
import { GROUP_IDS, weekModel } from './model.js';
import { createNudge } from './nudge.js';
import { buildNudge } from './nudge-model.js';
import { buildHash, resolveRoute, weekParam } from './router.js';
import { createRegistry } from './sections.js';
import { createStore } from './store.js';
import { addDays, currentClock, weekStart } from './time.js';
import { renderWeek } from './week.js';

const STORE_KEY = 'doitwithme.visible';

function loadVisible(win) {
  try {
    const raw = win.localStorage && win.localStorage.getItem(STORE_KEY);
    const ids = raw ? JSON.parse(raw).filter((id) => GROUP_IDS.includes(id)) : [];
    return new Set(ids.length > 0 ? ids : GROUP_IDS);
  } catch {
    return new Set(GROUP_IDS);
  }
}

function saveVisible(win, visible) {
  try {
    if (win.localStorage) win.localStorage.setItem(STORE_KEY, JSON.stringify([...visible]));
  } catch {
    // Storage can be blocked; the choice then simply lasts until the page closes.
  }
}

export function startApp({ root, document, fetch, win, now = () => new Date() }) {
  const dom = createDom(document);
  const { h, clear } = dom;
  const getClock = () => currentClock(now());
  const store = createStore(createApi(fetch), getClock);
  const registry = createRegistry();
  let visible = loadVisible(win);
  let route = { id: 'week', param: null };

  registry.register({ id: 'week', title: 'Week', group: 'views', description: 'Your plan for the week.', primary: true });

  const nudge = createNudge(dom, {
    approve: (date) => store.approve(date),
    undo: (date) => store.undo(date),
    dismiss: (keys) => store.dismiss(keys),
    okay: () => store.clearConfirm(),
    retry: () => store.load(),
  });
  const menu = createMenu(dom, registry, {
    navigate: (id) => navigate(buildHash(id, null)),
    current: () => route.id,
  });
  const main = h('main', { class: 'view', id: 'view' });
  const bar = h('header', { class: 'bar' });
  const menuButton = h('button', { type: 'button', class: 'btn dark mono', onclick: () => menu.open(menuButton) }, 'Menu');
  root.append(h('div', { class: 'app' }, bar, main), nudge.el, menu.el);

  const actions = {
    toggleGroup(id) {
      const next = new Set(visible);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (next.size === 0) return;
      visible = next;
      saveVisible(win, visible);
      render();
    },
    go: (delta) => navigate(buildHash('week', addDays(currentWeek(), 7 * delta))),
    today: () => navigate(buildHash('week', null)),
    loadExample: () => store.loadExample(),
    focusNudge: () => nudge.focus(),
    get canAdd() {
      return registry.find('setup') !== null;
    },
  };

  const currentWeek = () => weekStart(weekParam(route.param, getClock().today));

  function renderBar() {
    const s = store.get();
    clear(bar,
      h('a', { class: 'brand mono', href: '#/week' }, 'doitwithme'),
      h('nav', { class: 'tabs mono', 'aria-label': 'Main' },
        registry.primary().map((section) =>
          h('a', { class: 'tab', href: `#/${section.id}`, 'aria-current': section.id === route.id ? 'page' : null }, section.title))),
      h('div', { class: 'actions' },
        menuButton,
        h('button', { type: 'button', class: 'btn go mono', disabled: s.busy, onclick: () => store.replan() }, s.busy ? 'Replanning' : 'Replan')));
  }

  function renderMain(s) {
    if (s.status === 'loading' && !s.state) return h('p', { class: 'boot mono' }, 'Loading');
    if (!s.state) {
      const offline = s.status === 'offline';
      return h('div', { class: 'state' },
        h('h2', {}, offline ? "I can't reach the planner." : 'Something went wrong.'),
        h('p', {}, offline ? 'The local server is not running. Start it with npm run serve, then press Retry.' : s.error));
    }
    const start = currentWeek();
    const model = weekModel(s.state, start, visible, getClock().today);
    const { needsYou } = buildNudge(s.warnings);
    return renderWeek(dom, { model, visible, needsYou, isEmpty: s.isEmpty }, actions);
  }

  function render() {
    route = resolveRoute(win.location.hash, registry.ids());
    const s = store.get();
    renderBar();
    clear(main, renderMain(s));
    nudge.update({
      status: s.status,
      items: s.isEmpty ? [] : buildNudge(s.warnings).items,
      confirm: s.confirm,
      error: s.error,
      busy: s.busy,
    });
  }

  function navigate(hash) {
    win.location.hash = hash;
    render();
  }

  document.addEventListener('keydown', (e) => {
    const tag = e.target && e.target.tag ? e.target.tag : e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
    if (e.key === '/' && !['input', 'textarea', 'select'].includes(tag) && !menu.isOpen()) {
      e.preventDefault();
      menu.open(menuButton);
    }
  });
  win.addEventListener('hashchange', render);
  store.subscribe(render);
  render();
  store.load();

  return { store, render, navigate, menu, nudge };
}

if (typeof document !== 'undefined' && document.getElementById('app')) {
  const root = document.getElementById('app');
  root.replaceChildren(); // drop the "Loading" placeholder from index.html
  startApp({ root, document, fetch: window.fetch.bind(window), win: window });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS for every test file. If the end-to-end story fails at a specific step, read the failing assertion, reproduce it with a short script against the real server, and fix the module that owns the behavior; do not loosen the test.

- [ ] **Step 5: Smoke-test the real server and page**

Run: `PORT=8799 DATA_FILE=$(mktemp -d "${TMPDIR:-/private/tmp}/doitwithme.XXXXXX")/db.json node src/server.ts & sleep 1; curl -s -m 3 -o /dev/null -w "page %{http_code}\n" http://127.0.0.1:8799/; curl -s -m 3 -o /dev/null -w "main.js %{http_code}\n" http://127.0.0.1:8799/js/main.js; curl -s -m 3 -o /dev/null -w "font %{http_code}\n" http://127.0.0.1:8799/fonts/bricolage-grotesque.woff2; kill %1`
Expected: `page 200`, `main.js 200`, `font 200`.

- [ ] **Step 6: Commit**

```bash
git add public test
git commit -m "feat: boot the app with the shell, router, Nudge and Menu" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Docs, status and the visual checklist

**Files:**
- Modify: `README.md`, `docs/superpowers/specs/2026-10-09-ui-design.md`
- Create: `docs/ui-visual-check.md`

- [ ] **Step 1: Write the visual checklist**

Create `docs/ui-visual-check.md`:

```markdown
# Visual check: compare the running app with the boards

Nothing in this project can see a rendered page, so the look is checked by a person. Start the app and compare it with the approved boards on the design canvas.

1. Run `mkdir -p data && cp examples/sample-state.json data/db.json` (skip if you already have data), then `npm run serve`, and open http://127.0.0.1:8787.
2. Compare with the boards: https://claude.ai/artifact/TNMnuzerDogRwvQxJSNdPP

## Week (board D)
- Giant "Week NN" title, range and "7 days" on the right.
- Seven day columns: weekday, big day number, a thin muted "Booked" line, blocks.
- Block colors: black fixed, vermilion study, cobalt gym, mustard chores and errands, outlined projects. Each block shows a small label at its top right.
- "Show" filter list at the bottom left with counts. Clicking a row dims it and hides those blocks.
- Today's column has a vermilion top rule.

## First run (board I)
- Empty the data file (`echo '{}' > data/db.json`, then reload): "Nothing planned yet" text, a vermilion "Load the example" button, dashed empty days.

## Nudge (board J)
- Bottom right: the arch character. Quiet shows "All clear." and a smaller character. With warnings it shows the black bubble, a count badge and the headline.
- Stop the server and press Retry: sleepy eyes, "!" badge, "I can't reach the planner."

## Menu (board K)
- Press `/` or the Menu button: a black full-screen overlay, big "Jump to" field, columns by group, current section in vermilion. Esc closes. Only sections that exist are listed (just Week for now).

## Things to report back
Anything that differs from the boards: spacing, sizes, colors, wrapping, fonts not loading (text in a plain system font), overlaps at your window width.

## Known differences on purpose
- The Week screen shows a "Booked" line per day (from the spec); board D does not.
- Prev, Today and Next buttons sit in the header (the Day board shows the same pattern).
- The tabs show only sections that exist; Day, Deadlines and Setup arrive in the next plan.
```

- [ ] **Step 2: Update the README and the spec status**

In `README.md`, replace the line starting `**Status:**` with:

```markdown
**Status:** Phase 1 (core planner) and the first part of the UI (Week screen, Nudge, Menu) are built. Run `npm run serve` and open http://127.0.0.1:8787. Compare the look with the design boards using `docs/ui-visual-check.md`. Day, Deadlines, Setup and Settings screens come next. Design: `docs/superpowers/specs/`. Plans: `docs/superpowers/plans/`.
```

In `docs/superpowers/specs/2026-10-09-ui-design.md`, in the section `## Out of scope and open items`, append this bullet to the list:

```markdown
- **Build status:** the UI foundation (tokens, fonts, Week, first run, Nudge, Menu with Jump-to) is built per `docs/superpowers/plans/2026-10-10-ui-foundation.md`. Day, Deadlines, Setup, Settings and system notifications are the next plan.
```

- [ ] **Step 3: Final run**

Run: `npm test`
Expected: PASS, no skipped tests.

Run: `git status --short`
Expected: only the three documentation files changed.

- [ ] **Step 4: Commit**

```bash
git add README.md docs
git commit -m "docs: add the visual checklist and update the status" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-review notes

- **Spec coverage (this plan):** tokens and self-hosted fonts (T2); Week screen with filters, booked, navigation, first run (T4, T10); Nudge states, offers, approve, undo, dismiss, ask field (T5, T7, T9); Menu with registry and Jump-to (T8, T11); errors never blank (T7, T12); no innerHTML and CSP-safe (T2, T6, T12). Deferred to Plan B on purpose: Day, Deadlines, Setup, Settings, system notifications.
- **Spec-versus-board decision:** the spec lists a per-day "Booked" total on the Week screen but approved board D does not show one. The plan follows the spec and records the difference in `docs/ui-visual-check.md`.
- **Types and names:** `weekModel`, `buildNudge`, `keysOf`, `buildConfirm`, `createStore` methods, `createNudge` handlers and `renderWeek` actions are each defined once and used with the same names later.
- **Known limits, stated plainly:** none of this code has been run. The DOM is tested through a small fake document, so structure and behavior are verified but how it looks is not; that is the user's check against the boards. The fonts depend on a successful download in Task 2.
