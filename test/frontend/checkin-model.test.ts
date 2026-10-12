import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askLine, canReopen, movedLine, replyLine, shouldAsk, todayMood } from '../../public/js/checkin-model.js';

const today = '2026-10-05';
const state = (over: any = {}) => ({ preferences: { checkInEnabled: true }, blocks: [{ date: today, start: 600, end: 660 }], checkIns: [], ...over });

test('asks when enabled, unanswered and the day has blocks', () => {
  assert.equal(shouldAsk(state(), today, false), true);
});

test('does not ask when off, answered, skipped, or the day is empty', () => {
  assert.equal(shouldAsk(state({ preferences: { checkInEnabled: false } }), today, false), false);
  assert.equal(shouldAsk(state({ checkIns: [{ date: today, mood: 'okay' }] }), today, false), false);
  assert.equal(shouldAsk(state({ checkIns: [{ date: today, mood: 'skipped' }] }), today, false), false);
  assert.equal(shouldAsk(state({ blocks: [{ date: '2026-10-06', start: 600, end: 660 }] }), today, false), false);
  assert.equal(shouldAsk(null, today, false), false);
});

test('a skipped check-in can be reopened, and then it asks again', () => {
  const skipped = state({ checkIns: [{ date: today, mood: 'skipped' }] });
  assert.equal(canReopen(skipped, today), true);
  assert.equal(shouldAsk(skipped, today, true), true);
  assert.equal(canReopen(state(), today), false);
  assert.equal(todayMood(skipped, today), 'skipped');
});

test('the wording is fixed for a given day and never guilt-trips', () => {
  assert.equal(askLine(today), askLine(today));
  assert.equal(replyLine('low', today), replyLine('low', today));
  for (const mood of ['good', 'okay', 'low']) assert.doesNotMatch(replyLine(mood, today), /should|fail|lazy|behind/i);
});

test('the moved line names the minutes kept and the days', () => {
  assert.equal(movedLine({ mood: 'low', minutes: 180, dates: ['2026-10-08', '2026-10-09'] }, 120), 'Kept 2h00 today, moved 3h00 to Thu and Fri.');
  assert.equal(movedLine({ mood: 'low', minutes: 0, dates: [] }, 120), 'Nothing needed to move.');
});
