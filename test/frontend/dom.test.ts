import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDom } from '../../public/js/dom.js';
import { FakeDocument, byClass, findAll, textOf } from './fakedom.ts';

const dom = () => createDom(new FakeDocument() as any);

test('h builds elements with classes, attributes, text and flattened children', () => {
  const { h } = dom();
  const el: any = h('p', { class: 'a b', 'aria-label': 'x', hidden: true, skipped: false, gone: null }, 'one ', ['two ', [3]], null, false);
  assert.equal(el.tag, 'p');
  assert.equal(el.className, 'a b');
  assert.equal(el.getAttribute('aria-label'), 'x');
  assert.equal(el.hasAttribute('hidden'), true);
  assert.equal(el.hasAttribute('skipped'), false);
  assert.equal(el.hasAttribute('gone'), false);
  assert.equal(textOf(el), 'one two 3');
});

test('h wires on-handlers and sets value as a property', () => {
  const { h } = dom();
  let clicks = 0;
  const b: any = h('button', { onclick: () => clicks++ }, 'Go');
  b.click();
  assert.equal(clicks, 1);
  const input: any = h('input', { value: 'hello' });
  assert.equal(input.value, 'hello');
});

test('hostile text becomes a text node, never an element', () => {
  const { h } = dom();
  const evil = '<img src=x onerror=alert(1)>';
  const el: any = h('div', {}, evil);
  assert.equal(textOf(el), evil);
  assert.equal(findAll(el, (e) => e.tag === 'img').length, 0);
  assert.equal(el.children.length, 1);
});

test('svg builds elements in the SVG namespace and clear replaces children', () => {
  const { h, svg, clear } = dom();
  const s: any = svg('svg', { viewBox: '0 0 10 10' }, svg('rect', { width: 5 }));
  assert.equal(s.ns, 'http://www.w3.org/2000/svg');
  assert.equal(s.children[0].ns, 'http://www.w3.org/2000/svg');
  const box: any = h('div', {}, h('span', { class: 'old' }));
  clear(box, h('span', { class: 'new' }));
  assert.equal(byClass(box, 'old').length, 0);
  assert.equal(byClass(box, 'new').length, 1);
});

test('events bubble from a child to its parents and can be stopped', () => {
  const { h } = dom();
  const seen: string[] = [];
  const child: any = h('button', { onclick: () => seen.push('child') });
  const parent: any = h('div', { onclick: () => seen.push('parent') }, child);
  child.click();
  assert.deepEqual(seen, ['child', 'parent']);
  const stopper: any = h('button', { onclick: (e: any) => { e.stopPropagation(); seen.push('stop'); } });
  const outer: any = h('div', { onclick: () => seen.push('outer') }, stopper);
  stopper.click();
  assert.deepEqual(seen.slice(2), ['stop']);
});
