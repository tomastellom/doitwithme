import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, contrast, mixHex, onColor, tintOf } from '../../public/js/colors.js';

test('there are a dozen distinct colors to give a label', () => {
  assert.equal(PALETTE.length, 12);
  assert.equal(new Set(PALETTE.map((c) => c.hex)).size, 12);
  assert.equal(new Set(PALETTE.map((c) => c.id)).size, 12);
});

test('text on any palette color is readable: ink or white, whichever has more contrast, at least 4.5 to 1', () => {
  for (const c of PALETTE) {
    const text = onColor(c.hex);
    assert.ok(contrast(c.hex, text) >= 4.5, `${c.name} with ${text}: ${contrast(c.hex, text).toFixed(2)}`);
  }
  assert.equal(onColor('#111111'), '#FFFFFF');
  assert.equal(onColor('#F5B400'), '#111111');
});

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
