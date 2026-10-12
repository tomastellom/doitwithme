import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replan, replanCore, warningKey } from '../src/replan.ts';
import { emptyState } from '../src/store.ts';
import type { Course, State } from '../src/types.ts';
import { commitment, task } from './helpers.ts';

const TODAY = '2026-10-05'; // Monday
const course = (over: Partial<Course> = {}): Course => ({ credits: 3, difficulty: 3, examOnly: false, weeklyGraded: false, lab: false, syllabus: '', attendanceWeight: 0, recorded: 'yes', ...over });
const weekdays = { kind: 'weekly' as const, weekdays: [1, 2, 3, 4, 5], from: TODAY, to: '2026-12-31' };
const build = (courseOver: Partial<Course> = {}, taskOver: any = {}, classOver: any = {}): State => ({
  ...emptyState(),
  tasks: [task({ id: 'chem', title: 'Chemistry', weeklyMinutes: 10000, course: course(courseOver), ...taskOver })],
  commitments: [commitment({ id: 'lec', title: 'Chemistry lecture', category: 'class', courseId: 'chem', start: 600, end: 720, pattern: weekdays, ...classOver })],
});
const offers = (state: State, now?: number) => replan(state, TODAY, now).warnings.filter((w) => w.kind === 'skip-offer');

test('behind on a recorded zero-weight course: one offer for each class day in the next three days', () => {
  const found = offers(build());
  assert.deepEqual(found.map((w) => w.detail?.date), [TODAY, '2026-10-06', '2026-10-07']);
  const first = found[0].detail!;
  assert.equal(first.commitmentId, 'lec');
  assert.equal(first.commitmentTitle, 'Chemistry lecture');
  assert.equal(first.taskTitle, 'Chemistry');
  assert.equal(first.start, 600);
  assert.ok(first.minutes! >= 30);
  assert.match(found[0].message, /Chemistry lecture on 2026-10-05 could be skipped to catch up \d+ min of Chemistry/);
});

test('replanCore never makes offers, and replan only adds them', () => {
  const state = build();
  const core = replanCore(state, TODAY);
  assert.equal(core.warnings.some((w) => w.kind === 'skip-offer'), false);
  const full = replan(state, TODAY);
  assert.deepEqual(full.warnings.filter((w) => w.kind !== 'skip-offer'), core.warnings);
  assert.deepEqual(full.state.blocks, core.state.blocks);
});

test('no offer when the verdict is not skippable', () => {
  assert.deepEqual(offers(build({ attendanceWeight: 10 })), []);
  assert.deepEqual(offers(build({ recorded: 'no' })), []);
  assert.deepEqual(offers(build({ lab: true })), []);
  assert.deepEqual(offers(build({ attendanceWeight: undefined })), []);
});

test('no offer when you are not behind', () => {
  assert.deepEqual(offers(build({}, { weeklyMinutes: 60 })), []);
});

test('no offer for a one-off class, a class without a course, or a skipped date', () => {
  assert.deepEqual(offers(build({}, {}, { pattern: { kind: 'once', date: TODAY } })), []);
  const noLink = build();
  delete (noLink.commitments[0] as any).courseId;
  assert.deepEqual(offers(noLink), []);
  const skipped = build({}, {}, { exceptions: [TODAY] });
  assert.deepEqual(offers(skipped).map((w) => w.detail?.date), ['2026-10-06', '2026-10-07']);
});

test('no offer when skipping gains nothing', () => {
  // One session a day is already placed elsewhere, so a freed slot adds no study.
  assert.deepEqual(offers(build({}, { onePerDay: true, maxBlock: 60 })), []);
});

test('replanning again gives the same offers', () => {
  const state = build();
  const once = replan(state, TODAY);
  const twice = replan(once.state, TODAY);
  assert.deepEqual(twice.warnings.filter((w) => w.kind === 'skip-offer'), once.warnings.filter((w) => w.kind === 'skip-offer'));
});

test('a dismissed offer stays dismissed, and a dismissal of one class day does not hide another', () => {
  const state = build();
  const [first, second] = replan(state, TODAY).warnings.filter((w) => w.kind === 'skip-offer');
  const dismissed = { ...state, dismissed: [warningKey(first)] };
  const after = replan(dismissed, TODAY);
  assert.deepEqual(after.state.dismissed, [warningKey(first)], 'the dismissal survives the pruning');
  assert.notEqual(warningKey(first), warningKey(second));
  const again = replan(after.state, TODAY);
  assert.deepEqual(again.state.dismissed, [warningKey(first)]);
});

test('the key names the class and the date, not the minutes', () => {
  const a = { kind: 'skip-offer' as const, message: 'x', detail: { commitmentId: 'lec', taskTitle: 'Chemistry', date: TODAY, minutes: 60 } };
  assert.equal(warningKey(a), warningKey({ ...a, detail: { ...a.detail, minutes: 90 } }));
  assert.notEqual(warningKey(a), warningKey({ ...a, detail: { ...a.detail, commitmentId: 'other' } }));
  assert.notEqual(warningKey(a), warningKey({ ...a, detail: { ...a.detail, date: '2026-10-06' } }));
});

test('a class that has already started today is not offered, one that has not is', () => {
  const state = build();
  const at = (now: number) => offers(state, now).map((w) => w.detail?.date);
  assert.deepEqual(at(9 * 60), [TODAY, '2026-10-06', '2026-10-07']);
  assert.deepEqual(at(11 * 60), ['2026-10-06', '2026-10-07'], 'sitting in it already');
  assert.deepEqual(at(13 * 60), ['2026-10-06', '2026-10-07'], 'already over');
});

test('only a few trial plans are worked out, from the earliest days', () => {
  const second = build().tasks[0];
  const state = build();
  state.tasks.push({ ...second, id: 'phys', title: 'Physics', course: course() });
  state.commitments.push(commitment({ id: 'phys-lec', title: 'Physics lecture', category: 'class', courseId: 'phys', start: 780, end: 840, pattern: weekdays }));
  const found = offers(state);
  assert.ok(found.length > 0 && found.length <= 4);
  // Six class days qualify as candidates; the fifth and sixth (Wednesday) are never tried.
  assert.ok(found.every((w) => w.detail!.date <= '2026-10-06'));
});

test('answering the check-in keeps a dismissed skip offer dismissed', async () => {
  const { applyCheckIn } = await import('../src/checkin.ts');
  const state = build();
  const [first] = replan(state, TODAY).warnings.filter((w) => w.kind === 'skip-offer');
  const dismissed = { ...state, dismissed: [warningKey(first)] };
  const { state: after } = applyCheckIn(dismissed, 'okay', { today: TODAY, horizonDays: 14 });
  assert.deepEqual(after.dismissed, [warningKey(first)]);
});
