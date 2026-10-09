import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GROUPS, createRegistry, searchSections } from '../../public/js/sections.js';

const make = () => {
  const r = createRegistry();
  r.register({ id: 'week', title: 'Week', group: 'views', description: 'Your plan for the week.', primary: true });
  r.register({ id: 'day', title: 'Day', group: 'views', description: 'One day, larger.', primary: true });
  r.register({ id: 'commitments', title: 'Commitments', group: 'setup', description: 'What is fixed.' });
  r.register({ id: 'notifications', title: 'Notifications', group: 'settings', description: 'When I tell you things.' });
  return r;
};

test('groups are Views, Setup, Settings, Connections with descriptions', () => {
  assert.deepEqual(GROUPS.map((g) => g.id), ['views', 'setup', 'settings', 'connections']);
  assert.ok(GROUPS.every((g) => g.description.length > 10));
});

test('register validates id, title, group and uniqueness', () => {
  const r = createRegistry();
  assert.throws(() => r.register({ title: 'x', group: 'views' } as any), /id/);
  assert.throws(() => r.register({ id: 'x', group: 'views' } as any), /title/);
  assert.throws(() => r.register({ id: 'x', title: 'X', group: 'nope' }), /group/);
  assert.throws(() => r.register({ id: 'Bad Id', title: 'X', group: 'views' }), /id/);
  r.register({ id: 'x', title: 'X', group: 'views' });
  assert.throws(() => r.register({ id: 'x', title: 'Again', group: 'views' }), /duplicate/);
});

test('find, ids and primary work, and defaults are filled in', () => {
  const r = make();
  assert.deepEqual(r.ids(), ['week', 'day', 'commitments', 'notifications']);
  assert.equal(r.find('week')?.title, 'Week');
  assert.equal(r.find('nope'), null);
  assert.deepEqual(r.primary().map((s) => s.id), ['week', 'day']);
  assert.equal(r.find('commitments')?.primary, false);
});

test('byGroup lists only groups that have sections, in order', () => {
  const r = make();
  assert.deepEqual(r.byGroup().map((g) => [g.id, g.items.map((s) => s.id)]), [
    ['views', ['week', 'day']], ['setup', ['commitments']], ['settings', ['notifications']],
  ]);
  assert.equal(r.byGroup().some((g) => g.id === 'connections'), false);
});

test('search ranks title prefix, then title contains, then description, and drops non-matches', () => {
  const r = make();
  assert.deepEqual(r.search('wee').map((s) => s.id), ['week']);
  assert.deepEqual(r.search('NOTIF').map((s) => s.id), ['notifications']);
  assert.deepEqual(r.search('fixed').map((s) => s.id), ['commitments']);
  assert.deepEqual(r.search('zzz'), []);
  assert.equal(r.search('').length, 4);
  assert.deepEqual(r.byGroup('day').map((g) => g.id), ['views']);
  assert.deepEqual(searchSections([{ title: 'Alpha', description: 'x' }, { title: 'Beta', description: 'alpha' }] as any, 'alpha').map((s: any) => s.title), ['Alpha', 'Beta']);
});
