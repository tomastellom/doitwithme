import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConfirm, buildNudge, keysOf } from '../../public/js/nudge-model.js';

const w = (kind: string, detail: any, over: any = {}) => ({
  kind, message: `${kind} message`, detail, key: `${kind}|${JSON.stringify(detail)}`, dismissed: false, ...over,
});
const exam = (over: any = {}) =>
  w('deadline-short', { taskTitle: 'Chemistry', category: 'study', kind: 'exam', dueDate: '2026-10-23', minutes: 90, ...over });
const weekly = (over: any = {}) =>
  w('weekly-short', { taskTitle: 'Gym', category: 'gym', weekStart: '2026-10-12', minutes: 60, ...over });
const offer = (over: any = {}) => w('soft-offer', { date: '2026-10-09', minutes: 90, costMinutes: 0, ...over });

test('a deadline shortfall with a study offer reads like the board', () => {
  const { items, needsYou } = buildNudge([exam(), offer()]);
  assert.equal(needsYou, 1);
  assert.equal(items.length, 1);
  assert.equal(items[0].headline, 'Chemistry exam, Fri 23 Oct, is 90 min short.');
  assert.equal(items[0].offer.button, 'Use Friday evening');
  assert.equal(items[0].offer.line, 'Friday evening is free. I would only touch it for study, and only if you say so.');
  assert.equal(items[0].offer.date, '2026-10-09');
});

test('a weekly shortfall headline names the week', () => {
  assert.equal(buildNudge([weekly()]).items[0].headline, 'Gym is 60 min short in the week of 12 Oct.');
});

test('deadlines come before weekly shortfalls, each sorted by date', () => {
  const { items } = buildNudge([
    weekly({ weekStart: '2026-10-19', taskTitle: 'B' }),
    exam({ dueDate: '2026-11-02', taskTitle: 'Late' }),
    weekly({ weekStart: '2026-10-12', taskTitle: 'A' }),
    exam({ dueDate: '2026-10-23', taskTitle: 'Early' }),
  ]);
  assert.deepEqual(items.map((i) => i.headline.split(' ')[0]), ['Early', 'Late', 'A', 'B']);
});

test('the offer attaches to the first study shortfall, not to a non-study one', () => {
  const { items } = buildNudge([exam({ taskTitle: 'Taxes', category: 'errands', dueDate: '2026-10-12' }), exam(), offer()]);
  assert.equal(items[0].offer, null);
  assert.ok(items[1].offer);
});

test('an offer with no study shortfall to attach to becomes its own item', () => {
  const { items, needsYou } = buildNudge([offer()]);
  assert.equal(items.length, 1);
  assert.equal(needsYou, 0);
  assert.equal(items[0].headline, 'Soft time on Fri 9 Oct could cover 90 min of study.');
  assert.equal(items[0].key, items[0].offer.key);
});

test('a cost to other tasks is stated in the offer line', () => {
  const { items } = buildNudge([exam(), offer({ costMinutes: 20 })]);
  assert.match(items[0].offer.line, /It would cost other tasks 20 min\.$/);
});

test('dismissed warnings and warnings without detail are left out', () => {
  assert.deepEqual(buildNudge([{ ...exam(), dismissed: true }]).items, []);
  assert.deepEqual(buildNudge([{ kind: 'weekly-short', message: 'm', key: 'k', dismissed: false }]).items, []);
});

test('keysOf returns the item key and the offer key once each', () => {
  const [item] = buildNudge([exam(), offer()]).items;
  assert.deepEqual(keysOf(item), [item.key, item.offer.key]);
  const [own] = buildNudge([offer()]).items;
  assert.deepEqual(keysOf(own), [own.key]);
});

test('buildConfirm reports what moved in, or says nothing needed the evening', () => {
  const used = w('soft-time-used', { date: '2026-10-09', titles: ['Chemistry', 'Reading'], minutes: 120 });
  assert.deepEqual(buildConfirm([used], '2026-10-09'), {
    date: '2026-10-09', weekday: 'Friday', minutes: 120, titles: ['Chemistry', 'Reading'], used: true,
  });
  assert.deepEqual(buildConfirm([], '2026-10-09'), { date: '2026-10-09', weekday: 'Friday', minutes: 0, titles: [], used: false });
});

test('a missing address and a trip that does not fit become plain items that need you', () => {
  const missing = { kind: 'address-missing', key: 'address-missing|Anna', dismissed: false, message: '', detail: { placeName: 'Anna', minutes: 30 } };
  const tight = { kind: 'travel-tight', key: 'travel-tight|Anna|Lesson Anna', dismissed: false, message: '', detail: { placeName: 'Anna', date: '2026-10-13', titles: ['Lesson Anna'] } };
  const { items, needsYou } = buildNudge([missing, tight] as any);
  assert.equal(items[0].headline, 'Anna has no address and no commute, so I used 30 minutes of travel.');
  assert.match(items[1].headline, /^Not enough time to get to Lesson Anna on /);
  assert.equal(needsYou, 2);
  assert.deepEqual(items.map((i: any) => i.key), ['address-missing|Anna', 'travel-tight|Anna|Lesson Anna']);
  const gone = buildNudge([{ ...missing, dismissed: true }] as any);
  assert.equal(gone.items.length, 0);
});

test('every warning says where to go to fix it by hand, and a missing id falls back to the whole list', () => {
  const trip = (kind: string, d: any = {}) => w(kind, { placeName: 'Anna', date: '2026-10-14', titles: ['Lesson'], minutes: 30, ...d });
  const fix = (warnings: any[]) => buildNudge(warnings).items.map((i: any) => i.fix);
  assert.deepEqual(fix([exam({ deadlineId: 'exam-1', taskId: 'chem' })]), [{ label: 'Fix it myself', hash: '#/due-dates/exam-1' }]);
  assert.deepEqual(fix([exam()]), [{ label: 'Fix it myself', hash: '#/due-dates' }]);
  assert.deepEqual(fix([weekly({ taskId: 'gym a/b' })]), [{ label: 'Fix it myself', hash: '#/tasks/gym%20a%2Fb' }]);
  assert.deepEqual(fix([weekly()]), [{ label: 'Fix it myself', hash: '#/tasks' }]);
  assert.deepEqual(fix([trip('address-missing', { placeId: 'anna' })]), [{ label: 'Fix it myself', hash: '#/places/anna' }]);
  assert.deepEqual(fix([trip('address-missing')]), [{ label: 'Fix it myself', hash: '#/places' }]);
  assert.deepEqual(fix([trip('travel-tight')]), [{ label: 'Fix it myself', hash: '#/day/2026-10-14' }]);
  assert.deepEqual(fix([offer()]), [{ label: 'Fix it myself', hash: '#/day/2026-10-09' }], 'a lone offer leads to the day it is about');
});
