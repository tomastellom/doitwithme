import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDom } from '../../public/js/dom.js';
import { createFocusKeeper, findByKey } from '../../public/js/focus.js';
import { FakeDocument } from './fakedom.ts';

function setup() {
  const doc: any = new FakeDocument();
  const { h } = createDom(doc);
  const root: any = h('div', {},
    h('header', {}, h('button', { 'data-fk': 'replan' }, 'Replan')),
    h('main', {}, h('div', {}, h('button', { 'data-fk': 'next' }, 'Next'))));
  let fallbackCalls = 0;
  const keeper = createFocusKeeper({ document: doc, getRoot: () => root, fallback: () => { fallbackCalls++; } });
  return { doc, root, keeper, h, fallbacks: () => fallbackCalls };
}

test('findByKey finds a keyed element at any depth and ignores text nodes', () => {
  const { root } = setup();
  assert.equal(findByKey(root, 'next').getAttribute('data-fk'), 'next');
  assert.equal(findByKey(root, 'nope'), null);
  assert.equal(findByKey(null, 'x'), null);
});

test('capture returns the key of the focused control, restore focuses the new element with that key', () => {
  const { doc, root, keeper } = setup();
  const old = findByKey(root, 'next');
  old.focus();
  assert.equal(keeper.capture(), 'next');
  const fresh = doc.createElement('button');
  fresh.setAttribute('data-fk', 'next');
  root.children[1].replaceChildren(fresh);
  keeper.restore('next');
  assert.equal(doc.activeElement, fresh);
});

test('a control without a key gives no key, and unknown keys do nothing', () => {
  const { doc, keeper, h } = setup();
  const other: any = h('button', {}, 'x');
  other.focus();
  assert.equal(keeper.capture(), null);
  keeper.restore('nope');
  keeper.restore(null);
  assert.equal(doc.activeElement, other);
});

test('a Nudge control that disappeared hands focus to the fallback', () => {
  const { keeper, fallbacks } = setup();
  keeper.restore('nudge-use');
  assert.equal(fallbacks(), 1);
  keeper.restore('prev');
  assert.equal(fallbacks(), 1);
});

test('a key whose control could not take focus stays pending and is used when focus is on the body', () => {
  const { doc, root, keeper, h } = setup();
  const stubborn = findByKey(root, 'replan');
  stubborn.focus = () => {};
  keeper.restore('replan');
  const body: any = h('body', {});
  doc.activeElement = body;
  assert.equal(keeper.capture(), 'replan');
  doc.activeElement = null;
  assert.equal(keeper.capture(), 'replan');
});

test('the pending key is never used while another keyed control has focus', () => {
  const { doc, root, keeper } = setup();
  findByKey(root, 'replan').focus = () => {};
  keeper.restore('replan');
  findByKey(root, 'next').focus();
  assert.equal(keeper.capture(), 'next');
  assert.equal(doc.activeElement, findByKey(root, 'next'));
});
