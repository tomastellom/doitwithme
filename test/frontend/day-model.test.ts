import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dayModel } from '../../public/js/day-model.js';

const example = JSON.parse(readFileSync('examples/sample-state.json', 'utf8'));
const block = (start: number, end: number, title: string, category: string, date = '2026-10-14') => ({ taskId: title, title, category, date, start, end });
// 2026-10-14 is a Wednesday: the private lesson is 16:00-17:00 with a 30 minute buffer (board F).
const wed = () => ({
  ...structuredClone(example),
  blocks: [block(480, 530, 'Chemistry', 'study'), block(540, 575, 'Chemistry', 'study'), block(585, 620, 'Side project', 'personal project')],
});

test('a day lists items, buffers and free gaps in time order, as on board F', () => {
  const m = dayModel(wed(), '2026-10-14');
  assert.deepEqual(m.rows.map((r: any) => [r.kind, r.start, r.end]), [
    ['item', 480, 530], ['item', 540, 575], ['item', 585, 620],
    ['gap', 620, 930], ['buffer', 930, 960], ['item', 960, 1020], ['gap', 1020, 1320],
  ]);
  assert.equal(m.rows[4].title, 'Buffer before Private lesson, Anna');
  assert.equal(m.rows[5].group, 'fixed');
  assert.equal(m.rows[0].label, 'study');
});

test('the side totals, booked time and free time add up', () => {
  const m = dayModel(wed(), '2026-10-14');
  assert.deepEqual(m.totals, { fixed: 60, study: 85, gym: 0, admin: 0, outline: 35 });
  assert.equal(m.booked, 180);
  assert.deepEqual(m.window, { start: 480, end: 1320 });
  assert.equal(m.free, 630);
});

test('the heading, week line and neighbours are plain text', () => {
  const m = dayModel(wed(), '2026-10-14');
  assert.equal(m.label, 'Wed 14');
  assert.equal(m.weekLine, 'Week 42 / 14 Oct 2026');
});

test('days off use the days-off window', () => {
  const m = dayModel({ ...structuredClone(example), blocks: [] }, '2026-10-17');
  assert.deepEqual(m.window, { start: 600, end: 1200 });
  assert.deepEqual(m.rows.map((r: any) => [r.kind, r.start, r.end]), [['gap', 600, 1200]]);
  assert.equal(m.free, 600);
});

test('travel legs are rows and count as busy, not as booked', () => {
  const travel = [{ date: '2026-10-14', start: 900, end: 930, fromName: 'Home', toName: 'Anna', estimated: true }];
  const m = dayModel(wed(), '2026-10-14', travel);
  const leg = m.rows.find((r: any) => r.kind === 'travel');
  assert.deepEqual([leg.start, leg.end, leg.title, leg.label], [900, 930, 'Home to Anna', 'estimated']);
  assert.equal(m.booked, 180);
  assert.equal(m.free, 600);
  assert.deepEqual(m.rows.filter((r: any) => r.kind === 'gap').map((r: any) => [r.start, r.end]), [[620, 900], [1020, 1320]]);
  const other = dayModel(wed(), '2026-10-14', [{ ...travel[0], date: '2026-10-15' }]);
  assert.equal(other.rows.some((r: any) => r.kind === 'travel'), false);
});

test('free time is never negative or above the window, even with overlaps and items outside it', () => {
  const crowded = { ...structuredClone(example), blocks: [block(0, 1440, 'All day', 'study'), block(600, 700, 'Inside', 'gym'), block(1300, 1440, 'Late', 'chores')] };
  const m = dayModel(crowded, '2026-10-14');
  assert.equal(m.free, 0);
  assert.deepEqual(m.rows.filter((r: any) => r.kind === 'gap'), []);
  const empty = dayModel({ ...structuredClone(example), blocks: [], commitments: [] }, '2026-10-14');
  assert.equal(empty.free, 840);
  assert.equal(empty.booked, 0);
});

test('tiny gaps under 15 minutes are not announced', () => {
  const s = { ...structuredClone(example), commitments: [], blocks: [block(480, 600, 'A', 'study'), block(610, 700, 'B', 'study')] };
  const m = dayModel(s, '2026-10-14');
  assert.deepEqual(m.rows.map((r: any) => r.kind), ['item', 'item', 'gap']);
});

test('hostile titles stay plain strings', () => {
  const s = { ...structuredClone(example), commitments: [], blocks: [block(480, 540, '<img src=x onerror=alert(1)>', 'study')] };
  assert.equal(dayModel(s, '2026-10-14').rows[0].title, '<img src=x onerror=alert(1)>');
});

test('a state without places or travel still works', () => {
  const s = wed();
  delete s.places;
  assert.doesNotThrow(() => dayModel(s, '2026-10-14'));
});
