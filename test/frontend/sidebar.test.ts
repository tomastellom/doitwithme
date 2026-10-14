import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDom } from '../../public/js/dom.js';
import { createRegistry } from '../../public/js/sections.js';
import { createSidebar } from '../../public/js/sidebar.js';
import { FakeDocument, byClass, findAll, textOf } from './fakedom.ts';

const dom = createDom(new FakeDocument() as any);
const fk = (root: any, key: string) => findAll(root, (e: any) => e.getAttribute('data-fk') === key)[0];

function registry() {
  const r = createRegistry();
  const add = (id: string, title: string, group: string, extra: any = {}) => r.register({ id, title, group, render: () => null, ...extra });
  add('week', 'Week', 'views'); add('day', 'Day', 'views'); add('month', 'Month', 'views'); add('deadlines', 'Deadlines', 'views');
  add('commitments', 'Commitments', 'setup'); add('tasks', 'Tasks', 'setup'); add('due-dates', 'Due dates', 'setup');
  add('labels', 'Labels', 'setup'); add('places', 'Places', 'setup'); add('commutes', 'Commutes', 'setup');
  add('settings', 'Settings', 'settings', { activeFor: ['preferences'] });
  return r;
}

function make(over: any = {}) {
  const calls: any[] = [];
  const handlers = {
    newThing: () => calls.push(['new']), replan: () => calls.push(['replan']), toggleLabel: (id: string) => calls.push(['toggle', id]),
    showAll: () => calls.push(['all']), picked: () => calls.push(['picked']),
  };
  const side: any = createSidebar(dom, over.registry ?? registry(), handlers);
  side.update({ routeId: 'week', labels: [], hiddenCount: 0, busy: false, ready: true, ...over.view });
  return { side, calls };
}

test('the groups come in order with their headings, and the last one has none', () => {
  const { side } = make();
  const heads = byClass(side.el, 'sgh').map((e: any) => textOf(e));
  assert.deepEqual(heads, ['Plan', 'What goes in', 'Details']);
  const links = findAll(side.el, (e: any) => (e.getAttribute('data-fk') ?? '').startsWith('side-')).map((e: any) => textOf(e));
  assert.deepEqual(links, ['Week', 'Day', 'Month', 'Deadlines', 'Commitments', 'Tasks', 'Due dates', 'Labels', 'Places', 'Commutes', 'Settings']);
});

test('the current screen is marked, including a screen that belongs to another (preferences to Settings)', () => {
  const { side } = make({ view: { routeId: 'preferences' } });
  assert.equal(fk(side.el, 'side-settings').getAttribute('aria-current'), 'page');
  assert.equal(fk(side.el, 'side-week').getAttribute('aria-current'), null);
  side.update({ routeId: 'tasks', labels: [], hiddenCount: 0, busy: false, ready: true });
  assert.equal(fk(side.el, 'side-tasks').getAttribute('aria-current'), 'page');
  assert.match(fk(side.el, 'side-tasks').getAttribute('class'), /\bon\b/);
});

test('a screen the registry does not have is skipped, and an empty group disappears', () => {
  const r = createRegistry();
  r.register({ id: 'week', title: 'Week', group: 'views', render: () => null });
  const { side } = make({ registry: r });
  assert.deepEqual(byClass(side.el, 'sgh').map((e: any) => textOf(e)), ['Plan']);
  assert.equal(fk(side.el, 'side-day'), undefined);
});

test('links point at the screen and tell the shell to close a narrow sidebar', () => {
  const { side, calls } = make();
  assert.equal(fk(side.el, 'side-tasks').getAttribute('href'), '#/tasks');
  fk(side.el, 'side-tasks').click();
  assert.deepEqual(calls, [['picked']]);
});

test('+ New and Replan call their handlers, and Replan is off while busy or not ready', () => {
  const { side, calls } = make();
  fk(side.el, 'new').click();
  fk(side.el, 'replan').click();
  assert.deepEqual(calls, [['new'], ['replan']]);
  side.update({ routeId: 'week', labels: [], hiddenCount: 0, busy: true, ready: true });
  assert.ok(fk(side.el, 'replan').disabled || fk(side.el, 'replan').getAttribute('disabled') !== null);
  side.update({ routeId: 'week', labels: [], hiddenCount: 0, busy: false, ready: false });
  assert.ok(fk(side.el, 'replan').disabled || fk(side.el, 'replan').getAttribute('disabled') !== null);
});

test('labels show with counts, toggle by id, and say whether they are on', () => {
  const labels = [
    { id: 'study', name: 'Study', color: '#FF4B1F', look: 'fill', count: 4, hidden: false },
    { id: 'gym', name: 'Gym', color: '#1746F0', look: 'fill', count: null, hidden: true },
  ];
  const { side, calls } = make({ view: { labels, hiddenCount: 1 } });
  assert.equal(fk(side.el, 'fl-study').getAttribute('aria-pressed'), 'true');
  assert.equal(fk(side.el, 'fl-gym').getAttribute('aria-pressed'), 'false');
  assert.match(textOf(fk(side.el, 'fl-study')), /Study.*4/s);
  assert.equal(byClass(fk(side.el, 'fl-gym'), 'ct').length, 0, 'no count when there is none');
  fk(side.el, 'fl-gym').click();
  assert.deepEqual(calls, [['toggle', 'gym']]);
});

test('Show all appears only while something is hidden; no labels, no Labels group', () => {
  const none = make();
  assert.equal(byClass(none.side.el, 'labels').length, 0);
  const some = make({ view: { labels: [{ id: 'gym', name: 'Gym', color: '#1746F0', look: 'fill', count: 1, hidden: true }], hiddenCount: 1 } });
  fk(some.side.el, 'fl-all').click();
  assert.deepEqual(some.calls, [['all']]);
  some.side.update({ routeId: 'week', labels: [{ id: 'gym', name: 'Gym', color: '#1746F0', look: 'fill', count: 1, hidden: false }], hiddenCount: 0, busy: false, ready: true });
  assert.equal(fk(some.side.el, 'fl-all'), undefined);
});

test('a label name that looks like markup is plain text', () => {
  const { side } = make({ view: { labels: [{ id: 'x', name: '<img src=x onerror=alert(1)>', color: '#111111', look: 'fill', count: 1, hidden: false }], hiddenCount: 0 } });
  assert.match(textOf(side.el), /<img src=x onerror=alert\(1\)>/);
  assert.equal(findAll(side.el, (e: any) => e.tag === 'img').length, 0);
});

test('focus() can prefer the link of the current screen, and falls back to the first', () => {
  const { side } = make({ view: { routeId: 'month' } });
  side.focus({ current: true });
  const month = fk(side.el, 'side-month');
  assert.equal(month.doc.activeElement, month);
  side.focus();
  const week = fk(side.el, 'side-week');
  assert.equal(week.doc.activeElement, week);
});
