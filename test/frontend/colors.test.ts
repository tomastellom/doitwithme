import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLOR_GROUPS, DEFAULT_COLORS, PALETTE, applyColors, contrast, hexOf, onColor } from '../../public/js/colors.js';
import { createUiPrefs } from '../../public/js/ui-prefs.js';
import { FakeElement } from './fakedom.ts';

test('there are a dozen colors, the defaults are the original ones, and each kind starts on its own', () => {
  assert.equal(PALETTE.length, 12);
  assert.equal(new Set(PALETTE.map((c) => c.hex)).size, 12);
  assert.deepEqual(DEFAULT_COLORS, { fixed: 'ink', study: 'vermilion', gym: 'cobalt', admin: 'amber', outline: 'ink' });
  assert.deepEqual(COLOR_GROUPS.map((g) => g.id), ['fixed', 'study', 'gym', 'admin', 'outline']);
  assert.equal(hexOf('study'.length ? 'vermilion' : ''), '#FF4B1F');
});

test('text on any palette colour is readable: ink or white, whichever has more contrast, at least 4.5 to 1', () => {
  for (const c of PALETTE) {
    const text = onColor(c.hex);
    assert.ok(contrast(c.hex, text) >= 4.5, `${c.name} with ${text}: ${contrast(c.hex, text).toFixed(2)}`);
  }
  assert.equal(onColor('#111111'), '#FFFFFF');
  assert.equal(onColor('#F5B400'), '#111111');
});

test('applyColors sets a colour and its text colour for every kind, and ignores a page it cannot style', () => {
  const root: any = new FakeElement('html', null, null as any);
  applyColors(root, { ...DEFAULT_COLORS, study: 'teal' });
  assert.equal(root.style['--g-study'], '#00A3A3');
  assert.equal(root.style['--on-g-study'], onColor('#00A3A3'));
  assert.equal(root.style['--g-fixed'], '#111111');
  assert.equal(root.style['--on-g-fixed'], '#FFFFFF');
  applyColors(undefined, DEFAULT_COLORS);
  applyColors({}, DEFAULT_COLORS);
});

test('the choices are remembered per browser, reset to the default, and a damaged value falls back', () => {
  const store: Record<string, string> = {};
  const win: any = { localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } } };
  const ui = createUiPrefs(win);
  assert.deepEqual(ui.colors(), DEFAULT_COLORS);
  assert.equal(ui.setColor('gym', 'green'), true);
  assert.equal(ui.setColor('gym', 'neon'), false, 'not in the palette');
  assert.equal(ui.setColor('nothing', 'green'), false, 'not a kind');
  assert.equal(createUiPrefs(win).colors().gym, 'green');
  assert.equal(ui.resetColor('gym'), true);
  assert.equal(ui.colors().gym, 'cobalt');
  store['doitwithme.colors'] = '{not json';
  assert.deepEqual(createUiPrefs(win).colors(), DEFAULT_COLORS);
  store['doitwithme.colors'] = JSON.stringify({ study: 'pink', gym: 'neon' });
  assert.equal(createUiPrefs(win).colors().study, 'pink');
  assert.equal(createUiPrefs(win).colors().gym, 'cobalt');
});
