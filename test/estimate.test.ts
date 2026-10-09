import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FACTORS, hoursText, ruleOfThumb } from '../src/estimate.ts';

const course = (over: any = {}) => ({ credits: 3, difficulty: 3, examOnly: false, weeklyGraded: false, lab: false, ...over });
const perCredit = { hoursPerCredit: 1, normalCredits: 30, fullLoadHours: 40 };
const share = { hoursPerCredit: null, normalCredits: 30, fullLoadHours: 40 };

test('hours read as people say them', () => {
  assert.equal(hoursText(0), '0 min');
  assert.equal(hoursText(45), '45 min');
  assert.equal(hoursText(60), '1h');
  assert.equal(hoursText(240), '4h');
  assert.equal(hoursText(315), '5h15');
});

test('with hours per credit, the base is credits times that, and the sentence says so (board T)', () => {
  const r = ruleOfThumb(course({ difficulty: 4, weeklyGraded: true }), perCredit);
  assert.equal(r.minutes, 240);
  assert.equal(r.reason, '3 credits at 1h a week each. Hard course (4 of 5) with weekly graded work: about 4h a week.');
});

test('without it, the base is the share of a full load', () => {
  const r = ruleOfThumb(course({ difficulty: 4, weeklyGraded: true }), share);
  assert.equal(r.minutes, 315);
  assert.equal(r.reason, '3 of your 30 normal credits is 10% of a 40h load. Hard course (4 of 5) with weekly graded work: about 5h15 a week.');
});

test('hours per credit wins over the share when both could apply', () => {
  assert.equal(ruleOfThumb(course(), { hoursPerCredit: 2, normalCredits: 30, fullLoadHours: 40 }).minutes, 360);
});

test('each difficulty and each yes/no answer moves the number the way the spec says', () => {
  const at = (over: any) => ruleOfThumb(course(over), perCredit).minutes;
  assert.deepEqual([1, 2, 3, 4, 5].map((d) => at({ difficulty: d })), [150, 165, 180, 210, 240]);
  assert.equal(at({ weeklyGraded: true }), 210);
  assert.equal(at({ lab: true }), 195);
  assert.equal(at({ examOnly: true }), 165);
  assert.equal(at({ weeklyGraded: true, lab: true, examOnly: true }), 210);
  assert.equal(FACTORS.difficulty.length, 5);
});

test('numbers are rounded to 15 minutes and clamped, never NaN or huge', () => {
  assert.equal(ruleOfThumb(course({ credits: 0.5 }), perCredit).minutes % 15, 0);
  assert.equal(ruleOfThumb(course({ credits: 100, difficulty: 5 }), { hoursPerCredit: 20, normalCredits: 30, fullLoadHours: 40 }).minutes, 3000);
  for (const bad of [{ credits: 0 }, { credits: NaN }, { credits: Infinity }, { credits: -4 }]) {
    const m = ruleOfThumb(course(bad), share).minutes;
    assert.ok(Number.isFinite(m) && m >= 0 && m <= 3000, JSON.stringify(bad));
  }
  assert.equal(ruleOfThumb(course(), { hoursPerCredit: null, normalCredits: 0, fullLoadHours: 40 }).minutes, 0);
});

test('plurals and extras read naturally', () => {
  assert.match(ruleOfThumb(course({ credits: 1 }), perCredit).reason, /^1 credit at 1h a week each\./);
  assert.match(ruleOfThumb(course({ lab: true, weeklyGraded: true }), perCredit).reason, /with weekly graded work and a lab:/);
  assert.match(ruleOfThumb(course({ examOnly: true }), perCredit).reason, /with exam-only grading:/);
  assert.match(ruleOfThumb(course({ difficulty: 1 }), perCredit).reason, /Very easy course \(1 of 5\)/);
  assert.match(ruleOfThumb(course({ credits: 1 }), share).reason, /^1 of your 30 normal credits is 3% of a 40h load\./);
  assert.match(ruleOfThumb(course({ credits: 2.5 }), perCredit).reason, /^2\.5 credits at 1h a week each\./);
  assert.match(ruleOfThumb(course(), { hoursPerCredit: 0.5, normalCredits: 30, fullLoadHours: 40 }).reason, /at 30 min a week each/);
});
