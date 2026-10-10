import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, contrast, onColor } from '../../public/js/colors.js';

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
