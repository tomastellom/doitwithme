import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHash, dateParam, parseHash, resolveRoute, weekParam } from '../../public/js/router.js';

const ids = ['week', 'day'];

test('parseHash reads the section and an optional parameter', () => {
  assert.deepEqual(parseHash('#/week/2026-10-12'), { id: 'week', param: '2026-10-12' });
  assert.deepEqual(parseHash('#/setup/commitments'), { id: 'setup', param: 'commitments' });
  assert.deepEqual(parseHash('#/day'), { id: 'day', param: null });
  assert.deepEqual(parseHash(''), { id: null, param: null });
  assert.deepEqual(parseHash(undefined as any), { id: null, param: null });
});

test('hostile or malformed hashes never throw and fall back to week', () => {
  for (const hash of ['#/__proto__', '#/constructor', '#/toString', '#/Week', '#//', '#/week/%E0%A4%A', '#/week/../../etc', '#/<script>', 'javascript:alert(1)', '#/week/a/b']) {
    const r = resolveRoute(hash, ids);
    assert.ok(ids.includes(r.id) || r.id === 'week', hash);
  }
  assert.deepEqual(resolveRoute('#/__proto__', ids), { id: 'week', param: null });
  assert.deepEqual(resolveRoute('#/constructor', ids), { id: 'week', param: null });
  assert.deepEqual(resolveRoute('#/day/2026-10-09', ids), { id: 'day', param: '2026-10-09' });
});

test('weekParam keeps a real date and falls back to today otherwise', () => {
  assert.equal(weekParam('2026-10-12', '2026-10-05'), '2026-10-12');
  assert.equal(weekParam('2026-02-31', '2026-10-05'), '2026-10-05');
  assert.equal(weekParam(null, '2026-10-05'), '2026-10-05');
  assert.equal(weekParam('<script>', '2026-10-05'), '2026-10-05');
});

test('buildHash encodes the parameter', () => {
  assert.equal(buildHash('week', '2026-10-12'), '#/week/2026-10-12');
  assert.equal(buildHash('week', null), '#/week');
  assert.equal(buildHash('setup', 'a b'), '#/setup/a%20b');
});

test('dateParam falls back to today for anything that is not a real date', () => {
  assert.equal(dateParam('2026-10-14', '2026-10-09'), '2026-10-14');
  for (const bad of [null, '', 'xyz', '2026-02-30', '2026-13-01', '../..']) assert.equal(dateParam(bad as any, '2026-10-09'), '2026-10-09');
});
