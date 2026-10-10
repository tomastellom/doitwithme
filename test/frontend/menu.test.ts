import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDom } from '../../public/js/dom.js';
import { createMenu } from '../../public/js/menu.js';
import { createRegistry } from '../../public/js/sections.js';
import { FakeDocument, byClass, byTag, textOf } from './fakedom.ts';

function setup() {
  const doc: any = new FakeDocument();
  const dom = createDom(doc);
  const registry = createRegistry();
  registry.register({ id: 'week', title: 'Week', group: 'views', description: 'Your plan for the week.', primary: true });
  registry.register({ id: 'day', title: 'Day', group: 'views', description: 'One day.' });
  registry.register({ id: 'commitments', title: 'Commitments', group: 'setup', description: 'What is fixed.' });
  const calls: string[] = [];
  const menu: any = createMenu(dom, registry, { navigate: (id: string) => calls.push(id), current: () => 'week' });
  const opener: any = doc.createElement('button');
  const links = () => byClass(menu.el, 'it');
  const input = () => byTag(menu.el, 'input')[0];
  const type = (value: string) => { input().value = value; input().dispatch('input'); };
  return { doc, menu, opener, calls, links, input, type };
}

test('closed by default, with the dialog semantics from the board', () => {
  const { menu } = setup();
  assert.equal(menu.isOpen(), false);
  assert.equal(menu.el.hasAttribute('hidden'), true);
  assert.equal(menu.el.getAttribute('role'), 'dialog');
  assert.equal(menu.el.getAttribute('aria-modal'), 'true');
  assert.equal(menu.el.getAttribute('aria-label'), 'Menu');
});

test('open shows the groups that have sections, marks the current one and focuses the input', () => {
  const { menu, opener, links, input, doc } = setup();
  menu.open(opener);
  assert.equal(menu.isOpen(), true);
  assert.equal(menu.el.hasAttribute('hidden'), false);
  assert.equal(doc.activeElement, input());
  assert.deepEqual(byClass(menu.el, 'gh').map(textOf), ['Views', 'Plan']);
  assert.deepEqual(links().map((l: any) => l.getAttribute('href')), ['#/week', '#/day', '#/commitments']);
  assert.equal(links()[0].getAttribute('aria-current'), 'page');
  assert.equal(links()[1].hasAttribute('aria-current'), false);
  assert.match(textOf(menu.el), /Your plan, by day, by week and by due date\./);
  assert.equal(input().getAttribute('placeholder'), 'Type to find anything');
});

test('typing filters the links and hides empty groups', () => {
  const { menu, opener, links, type } = setup();
  menu.open(opener);
  type('comm');
  assert.deepEqual(links().map((l: any) => l.getAttribute('href')), ['#/commitments']);
  assert.deepEqual(byClass(menu.el, 'gh').map(textOf), ['Plan']);
  type('zzz');
  assert.equal(links().length, 0);
  assert.match(textOf(menu.el), /No match/);
  type('');
  assert.equal(links().length, 3);
});

test('Enter opens the best match and closes; with no match it stays open', () => {
  const { menu, opener, calls, type, input } = setup();
  menu.open(opener);
  type('da');
  const e = input().dispatch('keydown', { key: 'Enter' });
  assert.equal(e.defaultPrevented, true);
  assert.deepEqual(calls, ['day']);
  assert.equal(menu.isOpen(), false);
  menu.open(opener);
  type('zzz');
  input().dispatch('keydown', { key: 'Enter' });
  assert.deepEqual(calls, ['day']);
  assert.equal(menu.isOpen(), true);
});

test('Escape and the Close button close and return focus to the opener', () => {
  const { menu, opener, doc } = setup();
  menu.open(opener);
  menu.el.dispatch('keydown', { key: 'Escape' });
  assert.equal(menu.isOpen(), false);
  assert.equal(doc.activeElement, opener);
  menu.open(opener);
  byTag(menu.el, 'button').find((b: any) => textOf(b).includes('Close'))!.click();
  assert.equal(menu.isOpen(), false);
  assert.equal(doc.activeElement, opener);
});

test('clicking a link closes the menu', () => {
  const { menu, opener, links } = setup();
  menu.open(opener);
  links()[1].click();
  assert.equal(menu.isOpen(), false);
});

test('Tab and Shift+Tab stay inside the overlay', () => {
  const { menu, opener, links, doc } = setup();
  menu.open(opener);
  const close = byTag(menu.el, 'button')[0];
  const last = links()[links().length - 1];
  last.focus();
  const forward = menu.el.dispatch('keydown', { key: 'Tab', shiftKey: false, target: last });
  assert.equal(forward.defaultPrevented, true);
  assert.equal(doc.activeElement, close);
  const back = menu.el.dispatch('keydown', { key: 'Tab', shiftKey: true, target: close });
  assert.equal(back.defaultPrevented, true);
  assert.equal(doc.activeElement, last);
});

test('a section registered later appears after refresh', () => {
  const doc: any = new FakeDocument();
  const dom = createDom(doc);
  const registry = createRegistry();
  registry.register({ id: 'week', title: 'Week', group: 'views' });
  const menu: any = createMenu(dom, registry, { navigate() {}, current: () => 'week' });
  menu.open(doc.createElement('button'));
  assert.equal(byClass(menu.el, 'it').length, 1);
  registry.register({ id: 'notifications', title: 'Notifications', group: 'settings' });
  menu.refresh();
  assert.deepEqual(byClass(menu.el, 'it').map((l: any) => l.getAttribute('href')), ['#/week', '#/notifications']);
});

test('with motion the Menu eases away before it is hidden, and opening it again cancels the hiding', () => {
  const doc: any = new FakeDocument();
  const dom = createDom(doc);
  const registry = createRegistry();
  registry.register({ id: 'week', title: 'Week', group: 'views', description: 'Your plan for the week.', primary: true });
  const pending: Function[] = [];
  const menu: any = createMenu(dom, registry, { navigate() {}, current: () => 'week', defer: (fn: Function) => { pending.push(fn); return true; } });
  menu.open(null);
  menu.close();
  assert.equal(menu.el.getAttribute('class'), 'menu closing');
  assert.equal(menu.el.hasAttribute('hidden'), false, 'still on screen while it eases away');
  pending.shift()!();
  assert.equal(menu.el.hasAttribute('hidden'), true);
  menu.open(null);
  menu.close();
  menu.open(null);
  pending.shift()!();
  assert.equal(menu.el.hasAttribute('hidden'), false, 'opened again before the hiding ran');
  assert.equal(menu.el.getAttribute('class'), 'menu');
});
