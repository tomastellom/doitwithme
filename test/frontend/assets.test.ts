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

test('app.css never loads anything from another origin and uses no gradients except the grey travel hatch', () => {
  const css = readFileSync('public/css/app.css', 'utf8');
  assert.doesNotMatch(css, /https?:\/\//);
  const hatch = 'repeating-linear-gradient(135deg, var(--paper) 0 6px, #DAD5C8 6px 12px)';
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
  const size = h1.match(/font-size: clamp\((\d+)px, [^,]+, (\d+)px\)/);
  assert.ok(size, 'the title size scales with clamp()');
  assert.ok(Number(size![2]) <= 170 && Number(size![2]) >= 120, `max title size ${size![2]}px`);
  assert.match(css, /\.nudge\[data-state="resting"\] \.nudge-body \{[^}]*translateY/);
  assert.match(css, /\.nudge\[data-state="resting"\]:hover \.nudge-body/);
  assert.match(css, /\.nudge\[data-state="resting"\]:focus-within \.nudge-body/);
  const quiet = css.match(/^\.quiet \{[^}]*\}/m)![0];
  assert.match(quiet, /background: var\(--ink\)/);
});

test('the stylesheet has hatched travel entries, a travel-off line and dimmed segments', () => {
  const css = readFileSync('public/css/app.css', 'utf8');
  assert.match(css, /^\.travel \{[^}]*repeating-linear-gradient[^}]*#DAD5C8/m);
  assert.match(css, /^\.travel-off \{/m);
  assert.match(css, /^\.seg button:disabled \{/m);
});
