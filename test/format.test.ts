import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPlan, hhmm } from '../src/format.ts';
import { commitment } from './helpers.ts';

test('hhmm pads hours and minutes', () => {
  assert.equal(hhmm(545), '09:05');
  assert.equal(hhmm(0), '00:00');
  assert.equal(hhmm(1260), '21:00');
});

test('a day lists commitments and blocks in time order with warnings after', () => {
  const text = formatPlan(
    [commitment({ title: 'Chemistry lecture', start: 600, end: 720, pattern: { kind: 'once', date: '2026-10-05' } })],
    [{ taskId: 't1', title: 'Study', category: 'study', date: '2026-10-05', start: 480, end: 570 }],
    [{ kind: 'deadline-short', message: 'Study exam due 2026-10-07 is short by 60 min' }],
    '2026-10-05',
    2,
  );
  const lines = text.split('\n');
  assert.equal(lines[0], 'Mon 2026-10-05');
  assert.equal(lines[1], '  08:00-09:30  Study (study)');
  assert.equal(lines[2], '  10:00-12:00  Chemistry lecture [fixed]');
  assert.equal(lines[3], 'Tue 2026-10-06');
  assert.equal(lines[4], '  (nothing planned)');
  assert.ok(text.includes('Warnings:\n  - Study exam due 2026-10-07 is short by 60 min'));
});

test('no warnings prints a clear line instead of an empty section', () => {
  assert.ok(formatPlan([], [], [], '2026-10-05', 1).endsWith('No warnings.'));
});
