import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEstimate, clampAi, fakeWorkloadProvider, unavailableProvider } from '../src/workload.ts';
import type { WorkloadProvider } from '../src/workload.ts';

const request = { title: 'Chemistry', course: { credits: 3, difficulty: 4, examOnly: false, weeklyGraded: true, lab: false, syllabus: '' } };
const scale = { hoursPerCredit: 1, normalCredits: 30, fullLoadHours: 40 };

test('the unavailable provider says so and refuses', async () => {
  assert.equal(unavailableProvider.status, 'unavailable');
  await assert.rejects(unavailableProvider.estimate({ title: 'x', course: request.course, ruleMinutes: 60 }), /not connected/);
});

test('an AI answer is kept inside half to double the rule, and bad answers are dropped', () => {
  assert.deepEqual(clampAi({ minutes: 300, reason: 'Heavy labs.' }, 240), { minutes: 300, reason: 'Heavy labs.' });
  assert.equal(clampAi({ minutes: 5, reason: 'x' }, 240)!.minutes, 120);
  assert.equal(clampAi({ minutes: 99999, reason: 'x' }, 240)!.minutes, 480);
  assert.equal(clampAi({ minutes: 200.4, reason: 'x' }, 240)!.minutes, 195);
  assert.equal(clampAi({ minutes: 4000, reason: 'x' }, 2500)!.minutes, 3000);
  for (const bad of [null, undefined, 5, 'x', {}, { minutes: NaN, reason: 'x' }, { minutes: '300', reason: 'x' }, { minutes: 300 }, { minutes: 300, reason: 7 }]) {
    assert.equal(clampAi(bad, 240), null, JSON.stringify(bad));
  }
  assert.equal(clampAi({ minutes: 300, reason: 'x'.repeat(1000) }, 240)!.reason.length, 400);
});

test('with no AI the rule answers alone and says why there is no AI answer', async () => {
  const r = await buildEstimate(request, scale, unavailableProvider);
  assert.equal(r.rule.minutes, 240);
  assert.equal(r.ai, null);
  assert.equal(r.aiStatus, 'unavailable');
});

test('with an AI the answer comes back clamped next to the rule', async () => {
  const r = await buildEstimate(request, scale, fakeWorkloadProvider(900, 'Lots of lab reports.'));
  assert.equal(r.aiStatus, 'ready');
  assert.deepEqual(r.ai, { minutes: 480, reason: 'Lots of lab reports.' });
});

test('a provider that throws or answers nonsense is reported without losing the rule', async () => {
  const throwing: WorkloadProvider = { status: 'ready', async estimate() { throw new Error('boom'); } };
  const a = await buildEstimate(request, scale, throwing);
  assert.equal(a.aiStatus, 'failed');
  assert.equal(a.ai, null);
  assert.equal(a.rule.minutes, 240);
  assert.match(a.aiMessage!, /could not answer/);
  const nonsense: WorkloadProvider = { status: 'ready', async estimate() { return { minutes: NaN, reason: '' } as any; } };
  assert.equal((await buildEstimate(request, scale, nonsense)).aiStatus, 'failed');
});

test('a provider that never answers is given up on', async () => {
  const hanging: WorkloadProvider = { status: 'ready', estimate: () => new Promise(() => {}) };
  const r = await buildEstimate(request, scale, hanging, 30);
  assert.equal(r.aiStatus, 'failed');
  assert.equal(r.rule.minutes, 240);
});
