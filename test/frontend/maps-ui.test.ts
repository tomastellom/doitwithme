import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDom } from '../../public/js/dom.js';
import { mapsLines, renderMapsBlock } from '../../public/js/maps-ui.js';
import { FakeDocument, byTag, findAll, textOf } from './fakedom.ts';

const places = [{ id: 'h', name: 'Home', kind: 'home', address: '1 Main St' }, { id: 'c', name: 'Campus', kind: 'campus', address: '9 Uni Rd' }];
const item = (found?: any) => ({ id: 'k', fromPlaceId: 'h', toPlaceId: 'c', repeats: null, marginMinutes: 10, source: { method: 'maps', mode: 'transit', fallbackMinutes: 40, ...(found ? { found } : {}) } });
const found = { minutes: 55, at: '2026-10-12', fromAddress: '1 Main St', toAddress: '9 Uni Rd' };
const ctx = (over: any = {}) => ({ state: { places }, maps: 'ready', mapsUsage: { month: '2026-10', count: 12, limit: 5000 }, mapsNote: null, busy: false, ...over });

test('the lines say what Google found, or that nothing was looked up and the typed time is used', () => {
  assert.equal(mapsLines(item(found), { mode: 'transit', minutes: '40' }, ctx()).found, 'Google found 55 min on 12 Oct.');
  assert.equal(mapsLines(item(), { mode: 'transit', minutes: '40' }, ctx()).found, 'Not looked up yet. Using your typed 40 min.');
  assert.equal(mapsLines(item({ ...found, toAddress: 'old' }), { mode: 'transit', minutes: '35' }, ctx()).found, 'Not looked up yet for these addresses. Using your typed 35 min.');
  assert.equal(mapsLines(null, { mode: 'transit', minutes: '40' }, ctx()).found, 'Save it and I will look the time up.');
});

test('usage, the last failure for this commute, and the walk and bike warning', () => {
  assert.equal(mapsLines(item(), { mode: 'car', minutes: '40' }, ctx()).usage, 'Used 12 of 5000 lookups this month.');
  assert.equal(mapsLines(item(), { mode: 'car', minutes: '40' }, ctx({ mapsUsage: null })).usage, null);
  const note = { commuteId: 'k', ok: false, message: 'Google found no route for that mode.' };
  assert.equal(mapsLines(item(), { mode: 'car', minutes: '40' }, ctx({ mapsNote: note })).failure, 'Google found no route for that mode.');
  assert.equal(mapsLines(item(), { mode: 'car', minutes: '40' }, ctx({ mapsNote: { ...note, commuteId: 'other' } })).failure, null);
  assert.equal(mapsLines(item(), { mode: 'car', minutes: '40' }, ctx({ mapsNote: { ...note, ok: true, message: null } })).failure, null);
  const warn = 'Walking and bicycling routes may be missing sidewalks or bike paths. Check the time before you rely on it.';
  assert.equal(mapsLines(item(), { mode: 'walk', minutes: '40' }, ctx()).warning, warn);
  assert.equal(mapsLines(item(), { mode: 'bike', minutes: '40' }, ctx()).warning, warn);
  assert.equal(mapsLines(item(), { mode: 'transit', minutes: '40' }, ctx()).warning, null);
});

test('the block has a Refresh now button that looks the commute up, and is off when Maps is not ready or busy', () => {
  const dom = createDom(new FakeDocument() as any);
  const calls: string[] = [];
  const draw = (over: any = {}) => renderMapsBlock(dom, { method: 'maps', mode: 'transit', minutes: '40' }, ctx({ item: item(found), lookup: (id: string) => calls.push(id), ...over })) as any;
  const el = draw();
  assert.match(textOf(el), /Google found 55 min on 12 Oct\./);
  const button = byTag(el, 'button')[0];
  assert.equal(textOf(button).trim(), 'Refresh now');
  button.click();
  assert.deepEqual(calls, ['k']);
  assert.notEqual(byTag(draw({ busy: true }), 'button')[0].getAttribute('disabled'), null);
  assert.notEqual(byTag(draw({ maps: 'unavailable' }), 'button')[0].getAttribute('disabled'), null);
  assert.equal(renderMapsBlock(dom, { method: 'typed', mode: 'transit', minutes: '40' }, ctx()), null, 'nothing for a typed commute');
});

test('hostile text from Google or a place name stays text', () => {
  const dom = createDom(new FakeDocument() as any);
  const evil = '<img src=x onerror=alert(1)>';
  const el: any = renderMapsBlock(dom, { method: 'maps', mode: 'car', minutes: '40' }, ctx({ item: item(), mapsNote: { commuteId: 'k', ok: false, message: evil }, lookup() {} }));
  assert.match(textOf(el), /<img src=x onerror=alert\(1\)>/);
  assert.equal(findAll(el, (e: any) => e.tag === 'img').length, 0);
});
