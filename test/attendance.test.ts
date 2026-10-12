import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adviseAttendance, attendanceFor } from '../src/attendance.ts';
import { emptyState } from '../src/store.ts';
import type { Course, Warning } from '../src/types.ts';
import { commitment, task } from './helpers.ts';

const course = (over: Partial<Course> = {}): Course => ({ credits: 3, difficulty: 3, examOnly: false, weeklyGraded: false, lab: false, syllabus: '', ...over });
const advise = (c: Partial<Course>, behind = 0) => adviseAttendance(course(c), 'Chemistry', behind);

test('a lab is always go', () => {
  assert.deepEqual(advise({ lab: true, attendanceWeight: 0, recorded: 'yes' }, 90), { verdict: 'go', reasons: ['Labs need you there.'] });
});

test('without a typed weight there is no advice, even with recordings known', () => {
  assert.deepEqual(advise({ recorded: 'yes' }), { verdict: 'unknown', reasons: ['Add whether attendance counts toward the grade.'] });
});

test('attendance that counts is go and names the percentage', () => {
  assert.deepEqual(advise({ attendanceWeight: 15, recorded: 'yes' }, 90), { verdict: 'go', reasons: ['Attendance counts 15% of the grade.'] });
});

test('zero weight, recorded and behind is skippable with the shortfall in the reason', () => {
  assert.deepEqual(advise({ attendanceWeight: 0, recorded: 'yes' }, 90), {
    verdict: 'skippable', reasons: ['Recorded, attendance counts 0%, and Chemistry is 90 min short.'],
  });
});

test('zero weight, recorded and not behind is optional', () => {
  assert.deepEqual(advise({ attendanceWeight: 0, recorded: 'yes' }, 0), {
    verdict: 'optional', reasons: ['Recorded and attendance counts 0%. Skipping is fine, but you are not behind.'],
  });
});

test('zero weight and not recorded is optional, and a big exam share adds a sentence at 50 but not at 49', () => {
  const base = 'Not recorded, so skipping means missing the lecture.';
  assert.deepEqual(advise({ attendanceWeight: 0, recorded: 'no', examShare: 49 }), { verdict: 'optional', reasons: [base] });
  assert.deepEqual(advise({ attendanceWeight: 0, recorded: 'no', examShare: 50 }), {
    verdict: 'optional', reasons: [base, 'Exams are 50% of the grade, so what is said here matters.'],
  });
});

test('zero weight with unknown recording is optional', () => {
  assert.deepEqual(advise({ attendanceWeight: 0 }), { verdict: 'optional', reasons: ['Attendance counts 0%. I do not know if it is recorded.'] });
  assert.equal(advise({ attendanceWeight: 0, recorded: 'unknown' }).verdict, 'optional');
});

test('a course title is plain text in the reasons', () => {
  const advice = adviseAttendance(course({ attendanceWeight: 0, recorded: 'yes' }), '<img src=x onerror=alert(1)>', 30);
  assert.equal(advice.reasons[0], 'Recorded, attendance counts 0%, and <img src=x onerror=alert(1)> is 30 min short.');
});

// 2026-10-05 is a Monday.
const MON = '2026-10-05';
const stateWith = (courseOver: Partial<Course>, commitmentOver: any = {}) => ({
  ...emptyState(),
  tasks: [task({ id: 'chem', title: 'Chemistry', course: course(courseOver) })],
  commitments: [commitment({ id: 'lec', category: 'class', courseId: 'chem', pattern: { kind: 'weekly', weekdays: [1], from: MON, to: '2026-12-31' }, ...commitmentOver })],
});
const short = (taskId: string, minutes: number, kind: Warning['kind'] = 'weekly-short'): Warning => ({ kind, message: 'x', detail: { taskId, minutes } });

test('one entry per occurrence in the horizon, sorted, for classes with a course only', () => {
  const state = stateWith({ attendanceWeight: 0, recorded: 'yes' });
  state.commitments.push(commitment({ id: 'other', category: 'class', pattern: { kind: 'weekly', weekdays: [1], from: MON, to: '2026-12-31' } }));
  const out = attendanceFor(state, [short('chem', 60)], MON, 15);
  assert.deepEqual(out.map((a) => [a.commitmentId, a.date, a.verdict]), [['lec', MON, 'skippable'], ['lec', '2026-10-12', 'skippable'], ['lec', '2026-10-19', 'skippable']]);
});

test('a skipped date gets no advice and later weeks still do', () => {
  const state = stateWith({ attendanceWeight: 0, recorded: 'yes' }, { exceptions: ['2026-10-12'] });
  assert.deepEqual(attendanceFor(state, [], MON, 15).map((a) => a.date), [MON, '2026-10-19']);
});

test('any shortfall of the linked task counts, dismissed or not, and other tasks do not', () => {
  const state = stateWith({ attendanceWeight: 0, recorded: 'yes' });
  const warnings = [short('chem', 40), short('chem', 50, 'deadline-short'), short('gym', 500)];
  assert.match(attendanceFor(state, warnings, MON, 1)[0].reasons[0], /Chemistry is 90 min short/);
  assert.equal(attendanceFor(state, [short('gym', 500)], MON, 1)[0].verdict, 'optional');
});

test('a link to a task that is gone or has no course is skipped without a crash', () => {
  const gone = { ...stateWith({}), tasks: [] };
  assert.deepEqual(attendanceFor(gone, [], MON, 15), []);
  const plain = { ...stateWith({}), tasks: [task({ id: 'chem', title: 'Chemistry' })] };
  assert.deepEqual(attendanceFor(plain, [], MON, 15), []);
});

test('a warning without a detail or minutes counts as zero', () => {
  const state = stateWith({ attendanceWeight: 0, recorded: 'yes' });
  const odd: Warning[] = [{ kind: 'weekly-short', message: 'x' }, { kind: 'weekly-short', message: 'x', detail: { taskId: 'chem' } }];
  assert.equal(attendanceFor(state, odd, MON, 1)[0].verdict, 'optional');
});
