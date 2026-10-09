import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { replan } from '../src/replan.ts';
import { validateState } from '../src/validate.ts';

const sample = () => validateState(JSON.parse(readFileSync('examples/sample-state.json', 'utf8')));

test('the sample state file is valid', () => {
  assert.doesNotThrow(sample);
});

test('the sample plans without touching Sunday mass and with no crash', () => {
  const { state } = replan(sample(), '2026-10-05', undefined, 14);
  assert.ok(state.blocks.length > 0);
  const sunday = state.blocks.filter((b) => b.date === '2026-10-11');
  assert.ok(sunday.every((b) => b.end <= 1170));
});
