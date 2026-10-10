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
  for (const later of ['.g-outline {', '.travel {', '.g-fixed {']) assert.ok(css.indexOf(later) > reset, `${later} comes after the reset so its look wins`);
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

test('screens slide in from the side of their tab, faces cross-fade, and reduced motion still wins', () => {
  const css = readFileSync('public/css/app.css', 'utf8');
  for (const dir of ['fwd', 'back', 'fade']) assert.match(css, new RegExp(`\\[data-enter="${dir}"\\] \\{[^}]*animation: enter-${dir} \\.?\\d*\\.?\\d+s`));
  assert.match(css, /\.mascot-face\.in \{[^}]*face-in/);
  assert.match(css, /\.mascot-face\.out \{[^}]*face-out/);
  assert.ok(css.indexOf('prefers-reduced-motion') < css.indexOf('[data-enter="fwd"]'), 'the reduced-motion rule is declared first and uses !important');
});

test('deadline rows are links that keep the board look', () => {
  const css = readFileSync('public/css/app.css', 'utf8');
  assert.match(css, /^\.dl \{[^}]*text-decoration: none;[^}]*color: inherit;[^}]*cursor: pointer;/m);
  assert.match(css, /^\.dl:hover \{/m);
  assert.match(css, /^\.hero-add \{/m);
});
