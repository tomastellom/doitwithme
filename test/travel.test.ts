import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appliesOn, legsOn, minutesFor, placeFor } from '../src/travel.ts';
import type { Commute, Place } from '../src/types.ts';
import { commitment } from './helpers.ts';

const place = (id: string, name: string, kind: Place['kind'] = 'other', address = 'x'): Place => ({ id, name, kind, address });
const home = place('home', 'Home', 'home');
const campus = place('campus', 'Campus', 'campus');
const anna = place('anna', 'Anna', 'student', '');
const route = (over: Partial<Commute> = {}): Commute => ({
  id: 'r', fromPlaceId: 'home', toPlaceId: 'campus', repeats: null,
  source: { method: 'typed', minutes: 45 }, marginMinutes: 10, ...over,
});
const ctx = (over: any = {}) => ({ places: [home, campus, anna], commutes: [] as Commute[], allowance: 30, ...over });
// 2026-10-05 is a Monday, 2026-10-06 a Tuesday.
const MON = '2026-10-05';
const TUE = '2026-10-06';
const lecture = (over: any = {}) => commitment({
  id: 'lec', title: 'Chemistry lecture', placeId: 'campus', start: 600, end: 720, bufferBefore: 0,
  pattern: { kind: 'once', date: MON }, ...over,
});
const lesson = (over: any = {}) => commitment({
  id: 'les', title: 'Lesson Anna', start: 960, end: 1020, bufferBefore: 0, pattern: { kind: 'once', date: MON }, ...over,
});

test('with no Home place there is no travel at all', () => {
  const r = legsOn(MON, [lecture()], ctx({ places: [campus], commutes: [route()] }));
  assert.deepEqual(r, { legs: [], warnings: [] });
});

test('a located event gets an outbound leg before it and a return leg after the last one', () => {
  const r = legsOn(MON, [lecture()], ctx({ commutes: [route()] }));
  assert.deepEqual(r.legs, [
    { date: MON, start: 545, end: 600, fromName: 'Home', toName: 'Campus', estimated: false, placeId: 'campus', commuteId: 'r' },
    { date: MON, start: 720, end: 775, fromName: 'Campus', toName: 'Home', estimated: false, placeId: 'campus', commuteId: 'r' },
  ]);
  assert.deepEqual(r.warnings, []);
});

test('the outbound leg ends where the event buffer begins', () => {
  const r = legsOn(MON, [lecture({ bufferBefore: 30 })], ctx({ commutes: [route()] }));
  assert.deepEqual([r.legs[0].start, r.legs[0].end], [515, 570]);
});

test('no route means the allowance, flagged estimated, and a missing address warns once per trip', () => {
  const r = legsOn(MON, [lesson()], ctx());
  assert.deepEqual(r.legs.map((l) => [l.start, l.end, l.estimated, l.toName]), [[930, 960, true, 'Anna'], [1020, 1050, true, 'Home']]);
  assert.equal(r.warnings.length, 1);
  assert.equal(r.warnings[0].kind, 'address-missing');
  assert.equal(r.warnings[0].detail?.placeName, 'Anna');
  assert.match(r.warnings[0].message, /Anna has no address and no commute, so I used 30 minutes of travel/);
});

test('a place with an address and no route uses the allowance without warning', () => {
  const r = legsOn(MON, [lecture()], ctx());
  assert.equal(r.legs[0].estimated, true);
  assert.deepEqual(r.warnings, []);
});

test('a place is found by its own id first, then by a whole word of the title, longest name winning', () => {
  const places = [home, campus, anna, place('ann', 'Ann')];
  assert.equal(placeFor({ title: 'x', placeId: 'campus' }, places)?.id, 'campus');
  assert.equal(placeFor({ title: 'Campus tour', placeId: 'nowhere' }, places)?.id, 'campus');
  assert.equal(placeFor({ title: 'ANNA lesson' }, places)?.id, 'anna');
  assert.equal(placeFor({ title: 'Lesson with Ann' }, places)?.id, 'ann');
  assert.equal(placeFor({ title: 'Joanna lesson' }, places), null);
  assert.equal(placeFor({ title: 'Nothing here' }, places), null);
});

test('place names full of regular-expression characters neither throw nor match loosely', () => {
  const odd = [place('a', 'C++'), place('b', '(Room [2])'), place('c', 'a\\b'), place('d', '.*'), place('e', '   ')];
  assert.equal(placeFor({ title: 'Study in C++ club' }, odd)?.id, 'a');
  assert.equal(placeFor({ title: 'Meet at (Room [2]) later' }, odd)?.id, 'b');
  assert.equal(placeFor({ title: 'path a\\b here' }, odd)?.id, 'c');
  assert.equal(placeFor({ title: 'anything at all' }, odd), null);
  assert.equal(placeFor({ title: 'the .* wildcard' }, odd)?.id, 'd');
});

test('events with no place are left alone and events at Home need no leg', () => {
  const atHome = commitment({ id: 'h', title: 'Reading', placeId: 'home', pattern: { kind: 'once', date: MON } });
  const nowhere = commitment({ id: 'n', title: 'Call', pattern: { kind: 'once', date: MON } });
  assert.deepEqual(legsOn(MON, [atHome, nowhere], ctx()).legs, []);
});

test('two events at the same place share one trip there and back', () => {
  const second = lecture({ id: 'lec2', start: 780, end: 840 });
  const r = legsOn(MON, [lecture(), second], ctx({ commutes: [route()] }));
  assert.deepEqual(r.legs.map((l) => [l.start, l.end]), [[545, 600], [840, 895]]);
});

test('going from one place to another uses the allowance when no route joins them, and warns when it cannot fit', () => {
  const next = lesson({ start: 740, end: 800 });
  const r = legsOn(MON, [lecture(), next], ctx({ commutes: [route()] }));
  assert.deepEqual(r.legs.map((l) => [l.fromName, l.toName, l.start, l.end]), [
    ['Home', 'Campus', 545, 600],
    ['Campus', 'Anna', 710, 740],
    ['Anna', 'Home', 800, 830],
  ]);
  assert.deepEqual(r.warnings.map((w) => w.kind), ['address-missing', 'travel-tight']);
  const tight = r.warnings[1];
  assert.deepEqual(tight.detail, { placeName: 'Anna', date: MON, titles: ['Lesson Anna'] });
});

test('a route works in both directions', () => {
  const r = legsOn(MON, [lecture()], ctx({ commutes: [route({ fromPlaceId: 'campus', toPlaceId: 'home' })] }));
  assert.equal(r.legs[0].estimated, false);
  assert.equal(r.legs[0].end - r.legs[0].start, 55);
});

test('weekly and monthly routes apply only on their days, otherwise the allowance is used', () => {
  const weekly = route({ repeats: { kind: 'weekly', weekdays: [2] } });
  assert.equal(legsOn(MON, [lecture()], ctx({ commutes: [weekly] })).legs[0].estimated, true);
  const tue = lecture({ pattern: { kind: 'once', date: TUE } });
  const onTue = legsOn(TUE, [tue], ctx({ commutes: [weekly] }));
  assert.equal(onTue.legs[0].estimated, false);
  assert.equal(onTue.legs[0].end - onTue.legs[0].start, 55);
  const monthly = route({ repeats: { kind: 'monthly', monthDays: [6] } });
  assert.equal(legsOn(TUE, [tue], ctx({ commutes: [monthly] })).legs[0].estimated, false);
  assert.equal(legsOn(MON, [lecture()], ctx({ commutes: [monthly] })).legs[0].estimated, true);
  assert.equal(appliesOn(weekly, TUE), true);
  assert.equal(appliesOn(weekly, MON), false);
  assert.equal(appliesOn(route(), MON), true);
});

test('a route limited to certain days beats an every-day route for the same pair', () => {
  const every = route({ id: 'a', source: { method: 'typed', minutes: 20 } });
  const mondays = route({ id: 'b', repeats: { kind: 'weekly', weekdays: [1] }, source: { method: 'typed', minutes: 40 } });
  const r = legsOn(MON, [lecture()], ctx({ commutes: [every, mondays] }));
  assert.equal(r.legs[0].end - r.legs[0].start, 50);
});

test('a Google Maps route uses its typed fallback until Maps is connected', () => {
  const maps = route({ source: { method: 'maps', mode: 'bike', fallbackMinutes: 25 } });
  assert.equal(minutesFor(maps), 25);
  assert.equal(minutesFor(route()), 45);
  const r = legsOn(MON, [lecture()], ctx({ commutes: [maps] }));
  assert.equal(r.legs[0].end - r.legs[0].start, 35);
});

test('a cancelled date has no travel', () => {
  const r = legsOn(MON, [lecture({ exceptions: [MON] })], ctx({ commutes: [route()] }));
  assert.deepEqual(r.legs, []);
});

test('travel is clipped at midnight and warns when the day cannot hold it', () => {
  const early = lecture({ start: 10, end: 60 });
  const r = legsOn(MON, [early], ctx({ commutes: [route()] }));
  assert.deepEqual(r.legs[0], { date: MON, start: 0, end: 10, fromName: 'Home', toName: 'Campus', estimated: false, placeId: 'campus', commuteId: 'r' });
  assert.deepEqual(r.warnings.map((w) => w.kind), ['travel-tight']);
  const atMidnight = legsOn(MON, [lecture({ start: 0, end: 30 })], ctx({ commutes: [route()] }));
  assert.deepEqual(atMidnight.legs.map((l) => [l.start, l.end]), [[30, 85]]);
  assert.deepEqual(atMidnight.warnings.map((w) => w.kind), ['travel-tight']);
  const late = legsOn(MON, [lecture({ start: 1400, end: 1430 })], ctx({ commutes: [route()] }));
  assert.deepEqual(late.legs.map((l) => [l.start, l.end]), [[1345, 1400], [1430, 1440]]);
});

test('a buffer larger than the start time cannot push travel below zero', () => {
  const r = legsOn(MON, [lecture({ start: 20, end: 60, bufferBefore: 60 })], ctx({ commutes: [route()] }));
  assert.ok(r.legs.every((l) => l.start >= 0 && l.end <= 1440 && l.end > l.start));
});

test('overlapping events at different places still produce legs in order and a warning', () => {
  const a = lecture({ start: 600, end: 700 });
  const b = lesson({ start: 650, end: 750 });
  const r = legsOn(MON, [b, a], ctx());
  assert.deepEqual(r.legs.map((l) => l.toName), ['Campus', 'Anna', 'Home']);
  assert.ok(r.warnings.some((w) => w.kind === 'travel-tight'));
});

test('many places and commitments stay fast over two months of days', () => {
  const places = [home, ...Array.from({ length: 200 }, (_, i) => place(`p${i}`, `Place number ${i}`, 'other', 'x'))];
  const events = Array.from({ length: 150 }, (_, i) => commitment({ id: `e${i}`, title: `Event ${i}`, pattern: { kind: 'once', date: `2027-03-${String((i % 28) + 1).padStart(2, '0')}` } }));
  const t0 = performance.now();
  for (let d = 1; d <= 60; d++) legsOn(`2026-10-${String(((d - 1) % 28) + 1).padStart(2, '0')}`, events, ctx({ places }));
  assert.ok(performance.now() - t0 < 600, `took ${Math.round(performance.now() - t0)} ms`);
});

test('every trip says which place it concerns and which route set its time', () => {
  const withRoute = legsOn(MON, [lecture()], ctx({ commutes: [route()] })).legs;
  assert.deepEqual(withRoute.map((l) => [l.placeId, l.commuteId]), [['campus', 'r'], ['campus', 'r']]);
  const allowance = legsOn(MON, [lesson()], ctx()).legs;
  assert.deepEqual(allowance.map((l) => [l.placeId, l.commuteId, l.estimated]), [['anna', null, true], ['anna', null, true]]);
  const chain = legsOn(MON, [lecture(), lesson({ start: 740, end: 800 })], ctx({ commutes: [route()] })).legs;
  assert.deepEqual(chain.map((l) => l.placeId), ['campus', 'anna', 'anna']);
});
