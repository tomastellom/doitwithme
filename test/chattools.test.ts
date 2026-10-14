import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIND_LIMIT, runTool } from '../src/chattools.ts';
import type { ToolContext } from '../src/chattools.ts';
import { replanCore } from '../src/replan.ts';
import { emptyState } from '../src/store.ts';
import { commitment, task } from './helpers.ts';

// 2026-10-05 is a Monday.
function ctx(over: Partial<ToolContext['state']> = {}, extra: Partial<ToolContext> = {}): ToolContext {
  const state = { ...emptyState(), ...over };
  state.preferences = { ...state.preferences, weekdayWindow: { start: 480, end: 1320 }, dayOffWindow: { start: 600, end: 1200 }, daysOff: [0, 6], softWindows: [] };
  return { state, today: '2026-10-05', ...extra };
}
const items = (out: any): any[] => {
  assert.ok(!('error' in out), `unexpected error: ${out.error}`);
  return out.items;
};

test('find lists the days a weekly class happens, with its place, inside the range', () => {
  const c = ctx({
    places: [{ id: 'p1', name: 'North campus', kind: 'campus', address: '1 College Road' }],
    commitments: [commitment({ id: 'lec', title: 'Chemistry lecture', placeId: 'p1', start: 600, end: 720, pattern: { kind: 'weekly', weekdays: [1, 3], from: '2026-09-01', to: '2026-12-31' } })],
  });
  const out = items(runTool(c, 'find', { words: 'chemistry', from: '2026-10-05', to: '2026-10-11' }));
  assert.deepEqual(out.map((i) => [i.kind, i.date, i.start, i.end, i.place, i.address]), [
    ['event', '2026-10-05', '10:00', '12:00', 'North campus', '1 College Road'],
    ['event', '2026-10-07', '10:00', '12:00', 'North campus', '1 College Road'],
  ]);
});

test('find matches every word, skips exceptions, and leaves out what does not match', () => {
  const c = ctx({
    commitments: [
      commitment({ id: 'a', title: 'Lesson with Ana', exceptions: ['2026-10-05'], pattern: { kind: 'weekly', weekdays: [1], from: '2026-10-01', to: '2026-10-31' } }),
      commitment({ id: 'b', title: 'Lesson with Ben', pattern: { kind: 'once', date: '2026-10-06' } }),
    ],
  });
  const out = items(runTool(c, 'find', { words: 'lesson ana', from: '2026-10-05', to: '2026-10-20' }));
  assert.deepEqual(out.map((i) => i.date), ['2026-10-12', '2026-10-19']);
});

test('find answers about tasks, deadlines, planned work and courses', () => {
  const course = { credits: 3, difficulty: 3, examOnly: false, weeklyGraded: false, lab: false, syllabus: 'Weekly sets. '.repeat(100), attendanceWeight: 0, recorded: 'yes' as const };
  const c = ctx({
    tasks: [task({ id: 'chem', title: 'Chemistry', course })],
    deadlines: [{ id: 'd1', taskId: 'chem', kind: 'exam', dueDate: '2026-10-20', effortMinutes: 180 }],
    blocks: [{ taskId: 'chem', title: 'Chemistry', category: 'study', date: '2026-10-06', start: 780, end: 840, status: 'done' }],
  });
  const out = items(runTool(c, 'find', { words: 'chemistry', from: '2026-10-05', to: '2026-10-31' }));
  assert.deepEqual(out.map((i) => i.kind).sort(), ['course', 'deadline', 'planned', 'task']);
  const courseItem = out.find((i) => i.kind === 'course');
  assert.ok(courseItem.syllabus.length <= 600, 'the syllabus is cut');
  assert.equal(out.find((i) => i.kind === 'deadline').date, '2026-10-20');
  assert.equal(items(runTool(c, 'find', { words: 'chemistry', kinds: ['task'] })).length, 1);
});

test('find without words leaves out courses so syllabi are not dumped', () => {
  const course = { credits: 3, difficulty: 3, examOnly: false, weeklyGraded: false, lab: false, syllabus: 'x' };
  const out = items(runTool(ctx({ tasks: [task({ course })] }), 'find', {}));
  assert.equal(out.some((i) => i.kind === 'course'), false);
});

test('find caps the answer and says so', () => {
  const c = ctx({ commitments: [commitment({ id: 'gym', title: 'Gym', pattern: { kind: 'weekly', weekdays: [0, 1, 2, 3, 4, 5, 6], from: '2026-01-01', to: '2027-12-31' } })] });
  const out: any = runTool(c, 'find', { from: '2026-10-05', to: '2027-10-05' });
  assert.equal(out.items.length, FIND_LIMIT);
  assert.match(out.note, /first 40/);
});

test('find refuses bad dates, a backwards range and a range over 366 days', () => {
  const c = ctx();
  for (const input of [{ from: 'tomorrow' }, { from: '2026-02-31' }, { from: '2026-10-10', to: '2026-10-01' }, { from: '2026-01-01', to: '2027-06-01' }, { words: 5 }, { kinds: ['nope'] }]) {
    assert.ok('error' in runTool(c, 'find', input), JSON.stringify(input));
  }
});

test('free_time returns gaps around a class with its buffer, and never touches the class', () => {
  const c = ctx({ commitments: [commitment({ title: 'Class', start: 600, end: 720, bufferBefore: 30, pattern: { kind: 'once', date: '2026-10-05' } })] });
  const out = items(runTool(c, 'free_time', { from: '2026-10-05', to: '2026-10-05', minutes: 60 }));
  assert.deepEqual(out.map((s) => [s.date, s.start, s.end, s.minutes]), [['2026-10-05', '08:00', '09:30', 90], ['2026-10-05', '12:00', '22:00', 600]]);
});

test('free_time keeps clear of planned work, ticked-off work and commute legs', () => {
  const c = ctx({
    places: [{ id: 'home', name: 'Home', kind: 'home', address: 'A' }, { id: 'uni', name: 'Uni', kind: 'campus', address: 'B' }],
    tasks: [task({ id: 't1', title: 'Study', weeklyMinutes: 600 })],
    blocks: [{ taskId: 't1', title: 'Study', category: 'study', date: '2026-10-05', start: 1200, end: 1260, status: 'done' }],
  });
  const out = items(runTool(c, 'free_time', { from: '2026-10-05', to: '2026-10-09', minutes: 30 }));
  const plan = replanCore(c.state, '2026-10-05', undefined, 60);
  const taken = (date: string) => [...plan.state.blocks.filter((b) => b.date === date && b.status !== 'missed' && b.status !== 'waived'), ...plan.travel.filter((l) => l.date === date)];
  assert.ok(out.length > 0);
  const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
  for (const s of out) {
    for (const t of taken(s.date)) assert.ok(minutesOf(s.end) <= t.start || minutesOf(s.start) >= t.end, `${s.date} ${s.start}-${s.end} overlaps ${t.start}-${t.end}`);
  }
  assert.equal(out.some((s) => s.date === '2026-10-05' && minutesOf(s.start) < 1260 && minutesOf(s.end) > 1200), false);
});

test('free_time keeps clear of the commute legs to and from a class', () => {
  const c = ctx({
    places: [{ id: 'home', name: 'Home', kind: 'home', address: 'A' }, { id: 'campus', name: 'Campus', kind: 'campus', address: 'B' }],
    commutes: [{ id: 'r', fromPlaceId: 'home', toPlaceId: 'campus', repeats: null, source: { method: 'typed', minutes: 45 }, marginMinutes: 10 }],
    commitments: [commitment({ id: 'lec', title: 'Lecture', placeId: 'campus', start: 600, end: 720, pattern: { kind: 'once', date: '2026-10-05' } })],
  });
  const out = items(runTool(c, 'free_time', { from: '2026-10-05', to: '2026-10-05', minutes: 15 }));
  // The legs are 09:05-10:00 and 12:00-12:55 (45 min plus a 10 min margin each way).
  assert.deepEqual(out.map((s) => [s.start, s.end]), [['08:00', '09:05'], ['12:55', '22:00']]);
});

test('free_time starts today after the current time, uses the days-off window, and drops short gaps', () => {
  const c = ctx({}, { nowMinutes: 900 });
  const today = items(runTool(c, 'free_time', { from: '2026-10-05', to: '2026-10-05', minutes: 60 }));
  assert.deepEqual(today.map((s) => [s.start, s.end]), [['15:00', '22:00']]);
  const saturday = items(runTool(ctx(), 'free_time', { from: '2026-10-10', to: '2026-10-10', minutes: 60 }));
  assert.deepEqual(saturday.map((s) => [s.start, s.end]), [['10:00', '20:00']]);
  const none = items(runTool(ctx({ commitments: [commitment({ start: 481, end: 1320, pattern: { kind: 'once', date: '2026-10-05' } })] }), 'free_time', { from: '2026-10-05', to: '2026-10-05', minutes: 60 }));
  assert.deepEqual(none, []);
});

test('free_time leaves out the evenings kept free, and never starts before today', () => {
  const c = ctx();
  c.state.preferences.softWindows = [{ weekday: 5, start: 1080, end: 1320 }];
  const friday = items(runTool(c, 'free_time', { from: '2026-10-09', to: '2026-10-09', minutes: 30 }));
  assert.deepEqual(friday.map((s) => [s.start, s.end]), [['08:00', '18:00']]);
  const past = items(runTool(ctx(), 'free_time', { from: '2026-10-01', to: '2026-10-05', minutes: 60 }));
  assert.equal(past.every((s) => s.date >= '2026-10-05'), true);
});

test('free_time refuses missing or silly input, and a range over 60 days', () => {
  const c = ctx();
  for (const input of [{}, { from: '2026-10-05', to: '2026-10-06' }, { from: '2026-10-05', to: '2026-10-06', minutes: 5 }, { from: '2026-10-05', to: '2026-10-06', minutes: 'two hours' }, { from: '2026-10-05', to: '2027-01-05', minutes: 60 }]) {
    assert.ok('error' in runTool(c, 'free_time', input), JSON.stringify(input));
  }
});

test('an unknown tool or an input that is not an object is a plain error, never a crash', () => {
  const c = ctx();
  assert.deepEqual(runTool(c, 'delete_everything', {}), { error: 'There is no tool called delete_everything.' });
  assert.ok('error' in runTool(c, 'find', null));
  assert.ok('error' in runTool(c, 'find', [1]));
  assert.ok('error' in runTool(c, 'find', 'text'));
});

test('find keeps the first 40 in date order even when two daily commitments compete', () => {
  const daily = (id: string, title: string) => commitment({ id, title, pattern: { kind: 'weekly', weekdays: [0, 1, 2, 3, 4, 5, 6], from: '2026-01-01', to: '2027-12-31' } });
  const c = ctx({ commitments: [daily('g', 'Gym'), daily('w', 'Walk')] });
  const out: any = runTool(c, 'find', { from: '2026-10-05', to: '2027-10-05' });
  const dates = out.items.map((i: any) => i.date);
  assert.equal(out.items.length, FIND_LIMIT);
  assert.deepEqual(dates, [...dates].sort());
  assert.deepEqual([...new Set(out.items.map((i: any) => i.title))].sort(), ['Gym', 'Walk']);
  assert.equal(dates[dates.length - 1], '2026-10-24');
  assert.match(out.note, /first 40/);
});

test('find with only the course kind and no words returns nothing', () => {
  const course = { credits: 3, difficulty: 3, examOnly: false, weeklyGraded: false, lab: false, syllabus: 'x' };
  assert.deepEqual(items(runTool(ctx({ tasks: [task({ course })] }), 'find', { kinds: ['course'] })), []);
});

test('free_time refuses ranges past the 60 day plan horizon and names the last allowed date', () => {
  const c = ctx();
  assert.ok('error' in runTool(c, 'free_time', { from: '2027-01-13', to: '2027-01-14', minutes: 60 }));
  assert.ok(!('error' in runTool(c, 'free_time', { from: '2026-12-01', to: '2026-12-03', minutes: 60 })));
  assert.ok(!('error' in runTool(c, 'free_time', { from: '2026-12-03', to: '2026-12-03', minutes: 60 })));
  const over: any = runTool(c, 'free_time', { from: '2026-12-04', to: '2026-12-04', minutes: 60 });
  assert.match(over.error, /2026-12-03/);
  assert.ok('error' in runTool(c, 'free_time', { from: '2026-10-05', to: '2026-12-04', minutes: 60 }));
});

test('free_time after the window has closed gives no slots today and does not throw', () => {
  const out = items(runTool(ctx({}, { nowMinutes: 1400 }), 'free_time', { from: '2026-10-05', to: '2026-10-05', minutes: 15 }));
  assert.deepEqual(out, []);
});

test('find leaves the address out of a plain listing and gives it when words ask', () => {
  const c = ctx({
    places: [{ id: 'p1', name: 'North campus', kind: 'campus', address: '1 College Road' }],
    commitments: [commitment({ id: 'lec', title: 'Chemistry lecture', placeId: 'p1', start: 600, end: 720, pattern: { kind: 'weekly', weekdays: [1], from: '2026-09-01', to: '2026-12-31' } })],
  });
  const plain = items(runTool(c, 'find', { from: '2026-10-05', to: '2026-10-05' }));
  assert.equal(plain[0].place, 'North campus');
  assert.equal(plain[0].address, undefined);
  const asked = items(runTool(c, 'find', { words: 'chemistry', from: '2026-10-05', to: '2026-10-05' }));
  assert.equal(asked[0].address, '1 College Road');
});
