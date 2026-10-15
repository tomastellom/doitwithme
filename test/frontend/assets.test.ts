import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../../src/server.ts';

// A border or bar that is 2px or thicker (outline: and box-shadow are not borders, so focus rings pass).
const HEAVY_BORDER = /border(-top|-bottom|-left|-right)?: (2|3|4|6)px/;

const kit = (name: string) => {
  const css = readFileSync('public/css/shell.css', 'utf8');
  const start = css.indexOf(`/* Calm kit: ${name}`);
  assert.ok(start >= 0, `the "${name}" section exists`);
  const next = css.indexOf('/* Calm kit:', start + 10);
  return css.slice(start, next === -1 ? undefined : next);
};

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
  for (const token of ['--paper: #FFFFFF', '--ink: #111111', '--study: #FF4B1F', '--gym: #1746F0', '--admin: #F5B400', '--muted: #55585C']) {
    assert.ok(css.includes(token), token);
  }
  for (const name of ['--line', '--ghost', '--font-sans', '--font-mono']) assert.ok(css.includes(name), name);
  assert.match(css, /font-family: 'Bricolage Grotesque'/);
  assert.match(css, /font-family: 'DM Mono'/);
  assert.doesNotMatch(css, /https?:\/\//);
});

test('app.css never loads anything from another origin and uses no gradients except the grey travel hatch', () => {
  const css = readFileSync('public/css/app.css', 'utf8');
  assert.doesNotMatch(css, /https?:\/\//);
  const hatch = 'repeating-linear-gradient(135deg, var(--paper) 0 6px, #E6E7E8 6px 12px)';
  assert.doesNotMatch(css.split(hatch).join(''), /gradient/i);
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

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const token = (name: string) => readFileSync('public/css/tokens.css', 'utf8').match(new RegExp(`${name}: (#[0-9A-Fa-f]{6})`))![1];

test('text colors meet 4.5:1 on their backgrounds', () => {
  assert.ok(contrast(token('--muted'), token('--paper')) >= 4.5, 'muted on paper');
  assert.ok(contrast(token('--ghost'), token('--ink')) >= 4.5, 'ghost on ink');
  assert.ok(contrast(token('--ink'), token('--paper')) >= 4.5);
  assert.ok(contrast(token('--on-study'), token('--study')) >= 4.5);
  assert.ok(contrast(token('--on-gym'), token('--gym')) >= 4.5);
  assert.ok(contrast(token('--on-admin'), token('--admin')) >= 4.5);
});

test('placeholder and empty-day text use colors that pass, and the screen-reader class exists', () => {
  const css = readFileSync('public/css/app.css', 'utf8');
  const ghost = css.match(/\.ghost \{[^}]*\}/)![0];
  assert.match(ghost, /color: var\(--muted\)/);
  assert.match(css, /\.jump input::placeholder \{ color: var\(--ghost\); \}/);
  assert.match(css, /\.sr-only \{/);
  assert.doesNotMatch(css, /\.nudge:focus \{ outline: none/);
});

test('the title is a little smaller, Nudge rests until hovered, and the calm bubble is solid', () => {
  const css = readFileSync('public/css/app.css', 'utf8');
  const h1 = css.match(/\.hero h1 \{[^}]*\}/)![0];
  const size = h1.match(/font-size: (\d+)px/);
  assert.ok(size, 'the title has a fixed size');
  assert.ok(Number(size![1]) <= 90 && Number(size![1]) >= 60, `title size ${size![1]}px`);
  assert.match(css, /\.nudge\[data-state="resting"\] \.nudge-body \{[^}]*translateY/);
  assert.match(css, /\.nudge\[data-state="resting"\]:hover \.nudge-body/);
  assert.match(css, /\.nudge\[data-state="resting"\]:focus-within \.nudge-body/);
  const quiet = css.match(/^\.quiet \{[^}]*\}/m)![0];
  assert.match(quiet, /background: var\(--ink\)/);
});

test('the stylesheet has hatched travel entries, a travel-off line and dimmed segments', () => {
  const css = readFileSync('public/css/app.css', 'utf8');
  assert.match(css, /^\.travel \{[^}]*repeating-linear-gradient[^}]*#E6E7E8/m);
  assert.match(css, /^\.travel-off \{/m);
  assert.match(css, /^\.seg button:disabled \{/m);
});

test('the dashed outline of a short bar is not clipped by the drawing area', () => {
  const css = readFileSync('public/css/app.css', 'utf8');
  assert.match(css, /^\.dl-bar \{[^}]*overflow: visible/m);
});

test('the corner where Nudge waits is a generous hover area, and the hero buttons stay put', () => {
  const css = readFileSync('public/css/app.css', 'utf8');
  assert.match(css, /^\.nudge\[data-state="resting"\] \{ min-width: 200px; min-height: 180px; display: flex; align-items: flex-end; justify-content: flex-end; \}/m);
  assert.match(css, /^\.hero \.meta \{[^}]*width: 230px/m);
});

test('the mascot blinks with a short eye animation that respects reduced motion', () => {
  const css = readFileSync('public/css/app.css', 'utf8');
  assert.match(css, /^\.mascot\.blinking \.mascot-eye \{[^}]*animation: blink/m);
  assert.match(css, /@keyframes blink/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*animation: none !important/);
});

test('the Week title is smaller than the other screens', () => {
  const css = readFileSync('public/css/app.css', 'utf8');
  assert.match(css, /^\.week \.hero h1 \{[^}]*font-size: 84px/m);
});

test('form rows line up their labels and input boxes even when a label wraps', () => {
  const css = readFileSync('public/css/app.css', 'utf8');
  assert.match(css, /@supports \(grid-template-rows: subgrid\) \{\s*\.fg > \.fld \{[^}]*grid-row: span 2;[^}]*grid-template-rows: subgrid;[^}]*row-gap: 5px;/);
});

test('calendar items drawn as buttons look like the blocks on the boards', () => {
  const css = readFileSync('public/css/app.css', 'utf8');
  const reset = css.indexOf('.blk, .dv-blk { border: 0; font: inherit; color: inherit; text-align: left; cursor: pointer; }');
  assert.ok(reset >= 0, 'one shared reset');
  for (const later of ['.is-outline {', '.travel {']) assert.ok(css.indexOf(later) > reset, `${later} comes after the reset so its look wins`);
  assert.match(css, /^\.blk \{[^}]*width: 100%;/m);
});

test('buttons and tabs use the sans face, and no text is oversized', () => {
  const css = readFileSync('public/css/app.css', 'utf8');
  assert.match(css, /button\.mono, \.tabs\.mono \{[^}]*font-family: var\(--font-sans\)/);
  assert.match(css, /\.tab, \.btn \{[^}]*min-height: 44px/);
  const sizes = [...css.matchAll(/font-size: (\d+)px/g)].map((m) => Number(m[1]));
  assert.ok(Math.max(...sizes) <= 84, `largest text ${Math.max(...sizes)}px`);
  assert.ok(sizes.filter((n) => n > 56).length <= 2, 'only the page titles are bigger than 56px');
});

test('screens slide past each other with no fading, faces cross-fade, and reduced motion still wins', () => {
  const css = readFileSync('public/css/app.css', 'utf8');
  for (const dir of ['fwd', 'back']) {
    assert.match(css, new RegExp(`\\.slide-in-${dir} \\{[^}]*animation: in-${dir} \\.\\d+s`));
    assert.match(css, new RegExp(`\\.slide-out-${dir} \\{[^}]*animation: out-${dir} \\.\\d+s`));
  }
  assert.doesNotMatch(css.match(/@keyframes in-fwd \{[^}]*\}[^}]*\}/)![0], /opacity/);
  assert.match(css, /\.mascot-face\.in \{[^}]*face-in/);
  assert.match(css, /\.mascot-face\.out \{[^}]*face-out/);
  assert.ok(css.indexOf('prefers-reduced-motion') < css.indexOf('.slide-in-fwd'), 'the reduced-motion rule is declared first and uses !important');
});

test('deadline rows are links that keep the board look', () => {
  const css = readFileSync('public/css/app.css', 'utf8');
  assert.match(css, /^\.dl \{[^}]*text-decoration: none;[^}]*color: inherit;[^}]*cursor: pointer;/m);
  assert.match(css, /^\.dl:hover \{/m);
  assert.match(css, /^\.hero-add \{/m);
});

test('while screens slide, the old one is lifted out so it cannot stretch the new one', () => {
  const css = readFileSync('public/css/app.css', 'utf8');
  assert.match(css, /main\[data-sliding\] > \[class\*="-out-"\] \{[^}]*position: absolute/);
  assert.doesNotMatch(css, /main\[data-sliding\] \{[^}]*display: grid/);
});

test('the time grid CSS uses the same hour height as timegrid.js and styles every tile size', () => {
  const css = readFileSync('public/css/app.css', 'utf8');
  const js = readFileSync('public/js/timegrid.js', 'utf8');
  const hour = js.match(/HOUR_PX = (\d+)/)![1];
  assert.match(js, new RegExp(`\\* HOUR_PX`), 'positions are multiples of the hour height');
  assert.equal(hour, '56');
  assert.match(css, /^\.hline \{[^}]*border-top: 1px solid/m);
  for (const size of ['one', 'two', 'full']) assert.match(css, new RegExp(`\\.tile\\.${size}\\b`), size);
  assert.match(css, /^\.tile \{[^}]*position: absolute/m);
  assert.match(css, /^\.tile \.n, \.tile \.t, \.tile \.k \{[^}]*text-overflow: ellipsis/m);
  assert.match(css, /^\.now \{/m);
  assert.match(css, /^\.grid \{[^}]*grid-template-columns: 56px repeat\(7/m);
});

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

test('the bubble is a white card in shell.css and the mascot is left alone', () => {
  const css = readFileSync('public/css/shell.css', 'utf8');
  assert.match(css, /\.say, \.quiet \{[^}]*background: var\(--panel\)/);
  assert.match(css, /\.say :focus-visible, \.quiet :focus-visible \{ outline-color: var\(--ink\)/);
  assert.doesNotMatch(css, /\.mascot/, 'Nudge\'s faces are not styled here');
});

test('final review: small-text and edge colors pass contrast, and the shell rules are in place', async () => {
  const { contrast } = await import('../../public/js/colors.js');
  const tokens = readFileSync('public/css/tokens.css', 'utf8');
  const tok = (n: string) => tokens.match(new RegExp(`--${n}:\\s*(#[0-9A-Fa-f]{6})`))![1];
  for (const bg of ['#FFFFFF', tok('today'), tok('soft')]) assert.ok(contrast(tok('study-text'), bg) >= 4.5, `study-text on ${bg}`);
  assert.ok(contrast(tok('edge'), '#FFFFFF') >= 3);
  const shell = readFileSync('public/css/shell.css', 'utf8');
  assert.ok(!shell.includes('D5D8DE'));
  assert.ok(shell.includes('.week .cbody') && shell.includes('.hero button.needs'));
  const pads = [...shell.matchAll(/\.app \{[^}]*padding:\s*\d+px \d+px (\d+)px/g)].map((m) => Number(m[1]));
  assert.ok(pads.length >= 2 && pads.every((n) => n >= 220), 'bottom padding clears the Nudge corner');
});

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
  assert.match(calm, /\.dv-buf\.tile \{[^}]*border: 1px dashed/);
  assert.doesNotMatch(calm, /\.tile\.one\.travel[^{]*\{[^}]*padding-left: 32px/, 'commutes have no tick, so no tick gutter');
  assert.match(calm, /\.tile\.is-done \.n[^{]*\{[^}]*text-decoration-thickness: 1px/);
  assert.doesNotMatch(calm, /\.t\b[^{]*\{[^}]*opacity: \.7/, 'time lines are not faded below 4.5:1');
  assert.match(calm, /\.dv-col \.cbody \{[^}]*border-top: 1px solid/);
  assert.doesNotMatch(css, /\.tile[^{,]*\{[^}]*border-radius: 10px/, 'one radius for every tile');
  assert.match(calm, /\.tile \.tag \{[^}]*text-transform: none/);
  assert.match(calm, /\.dv-blk\.tile\.one\.travel \.n/);
  assert.match(calm, /\.dv-buf\.tile \{[^}]*display: flex/);
});

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
  assert.match(k, /\.btn\.side-toggle \{[^}]*border: 1px solid var\(--edge\)/, 'the mobile menu toggle keeps its edge');
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

test('the settings section lays each row out as text on the left and the control on the right, with hairlines', () => {
  const k = kit('settings');
  assert.match(k, /\.st \{[^}]*display: grid[^}]*grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(k, /\.st \{[^}]*border-top: 1px solid var\(--hair\)/);
  assert.match(k, /\.st b \{[^}]*font-size: 14px[^}]*font-weight: 600/);
  assert.match(k, /\.st \.seg, \.st \.hrs-row \{[^}]*grid-column: 2/);
  assert.match(k, /\.st-grp \{[^}]*border-top: 0/);
  assert.match(k, /\.st-grp \.st-gh \{[^}]*text-transform: uppercase/);
  assert.doesNotMatch(k, HEAVY_BORDER, 'no heavy 2px+ border or bar in this section (focus outlines are fine)');
});

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
  assert.match(k, /\.it\.on \{[^}]*color: #B5330F/, 'darker than study-text: 5.2:1 on the canvas');
  assert.match(k, /\.it:hover \{[^}]*background: var\(--btn-hover\)[^}]*color: var\(--ink\)/);
  assert.match(k, /\.advice\[data-verdict="skippable"\] \.tag \{[^}]*background: var\(--soft\)[^}]*color: var\(--muted\)/);
  assert.match(k, /\.choice\.y:hover span[^{]*\{[^}]*color: inherit/);
  assert.match(k, /\.menu :focus-visible \{[^}]*outline-color: var\(--ink\)/);
  assert.doesNotMatch(k, HEAVY_BORDER, 'no heavy 2px+ border or bar in this section (focus outlines are fine)');
});
