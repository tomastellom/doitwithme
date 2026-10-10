import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LABELS, LOCKED_IDS, labelFor, labelOptions, labelsOf, lookClass, paint, wash } from '../../public/js/labels.js';
import { KINDS, applyItem, itemsOf, labelKind, removeItem } from '../../public/js/setup-model.js';
import { FakeElement } from './fakedom.ts';

const st = (over: any = {}) => ({ commitments: [], tasks: [], deadlines: [], blocks: [], places: [], commutes: [], ...over });

test('the built-in labels look exactly like the old groups did, and Study and Other are locked', () => {
  const by = (id: string) => DEFAULT_LABELS.find((l) => l.id === id)!;
  assert.deepEqual([by('study').color, by('gym').color, by('chores').color, by('class').color], ['#FF4B1F', '#1746F0', '#F5B400', '#111111']);
  assert.equal(by('personal project').style, 'outline');
  assert.deepEqual(LOCKED_IDS, ['study', 'other']);
});

test('a state without labels uses the built-in ones, and one with labels uses only its own', () => {
  assert.equal(labelsOf(st()).length, DEFAULT_LABELS.length);
  assert.ok(labelsOf(st()).every((l: any) => !('locked' in l)), 'the stored shape has no extras');
  assert.deepEqual(labelsOf(st({ labels: [{ id: 'a', name: 'A', color: '#111111', style: 'fill' }] })).map((l: any) => l.id), ['a']);
});

test('what an item stores is found by id, then by the same words, then by name, else it is Other', () => {
  const labels = [{ id: 'study', name: 'Learning', color: '#FF4B1F', style: 'fill' }, { id: 'label-1', name: 'Piano', color: '#00A3A3', style: 'fill' }, { id: 'other', name: 'Other', color: '#8A8D91', style: 'fill' }];
  assert.equal(labelFor(labels, 'study').name, 'Learning', 'renaming never loses the label');
  assert.equal(labelFor(labels, 'Study').id, 'study');
  assert.equal(labelFor(labels, 'piano').id, 'label-1');
  assert.equal(labelFor(labels, 'mystery').id, 'other');
  assert.equal(labelFor([], 'mystery').id, 'other', 'even with no labels at all');
  assert.deepEqual(labelOptions(st({ labels })).map((o: any) => o.label), ['Learning', 'Piano', 'Other']);
});

test('paint fills with readable text, outlines on paper, and flips dark fills on an ink cell', () => {
  const el: any = new FakeElement('i', null, null as any);
  paint(el, '#FF4B1F', 'fill');
  assert.deepEqual([el.style.background, el.style.color], ['#FF4B1F', '#111111']);
  paint(el, '#14213D', 'fill');
  assert.deepEqual([el.style.background, el.style.color], ['#14213D', '#FFFFFF']);
  paint(el, '#14213D', 'fill', { onInk: true });
  assert.equal(el.style.background, '#FFFFFF', 'a dark dot on an ink cell would vanish');
  paint(el, '#00A3A3', 'outline');
  assert.deepEqual([el.style.borderColor, el.style.background], ['#00A3A3', '#FFFFFF']);
  assert.equal(lookClass('outline'), 'is-outline');
  assert.equal(lookClass('fill'), 'is-fill');
});

test('the label form checks the name, the color and the look', () => {
  const state = st({ labels: [{ id: 'a', name: 'Piano', color: '#111111', style: 'fill' }] });
  const ok = { name: ' Dance ', color: '#00A3A3', style: 'outline' };
  assert.deepEqual(labelKind.fromDraft(ok, 'label-x', state), { item: { id: 'label-x', name: 'Dance', color: '#00A3A3', style: 'outline' } });
  assert.match(labelKind.fromDraft({ ...ok, name: '  ' }, 'x', state).error, /name/);
  assert.match(labelKind.fromDraft({ ...ok, name: 'x'.repeat(41) }, 'x', state).error, /40/);
  assert.match(labelKind.fromDraft({ ...ok, name: 'piano' }, 'x', state).error, /already/);
  assert.equal(labelKind.fromDraft({ ...ok, name: 'piano' }, 'a', state).item.name, 'piano', 'a label may keep or re-case its own name');
  assert.match(labelKind.fromDraft({ ...ok, color: '#123456' }, 'x', state).error, /color/);
  assert.match(labelKind.fromDraft({ ...ok, style: 'dotted' }, 'x', state).error, /filled or outlined/);
});

test('adding or renaming a label starts from the built-in list, so nothing built in is lost', () => {
  const added = applyItem(st(), 'labels', { id: 'label-p', name: 'Piano', color: '#00A3A3', style: 'fill' });
  assert.equal(added.labels.length, DEFAULT_LABELS.length + 1);
  const renamed = applyItem(st(), 'labels', { id: 'study', name: 'Learning', color: '#FF4B1F', style: 'fill' });
  assert.equal(renamed.labels.length, DEFAULT_LABELS.length);
  assert.equal(renamed.labels.find((l: any) => l.id === 'study').name, 'Learning');
  assert.equal(itemsOf(st(), 'labels').length, DEFAULT_LABELS.length);
});

test('deleting a label moves what used it to Other, planned blocks included, and the locked ones explain themselves', () => {
  const s = st({
    labels: [{ id: 'study', name: 'Study', color: '#FF4B1F', style: 'fill' }, { id: 'label-p', name: 'Piano', color: '#00A3A3', style: 'fill' }, { id: 'other', name: 'Other', color: '#8A8D91', style: 'fill' }],
    commitments: [{ id: 'c', title: 'Lesson', category: 'label-p' }],
    tasks: [{ id: 't', title: 'Practice', category: 'label-p' }, { id: 't2', title: 'Chem', category: 'study' }],
    blocks: [{ taskId: 't', title: 'Practice', category: 'label-p' }],
  });
  const next = removeItem(s, 'labels', 'label-p');
  assert.deepEqual(next.labels.map((l: any) => l.id), ['study', 'other']);
  assert.equal(next.commitments[0].category, 'other');
  assert.deepEqual(next.tasks.map((t: any) => t.category), ['other', 'study']);
  assert.equal(next.blocks[0].category, 'other');
  assert.match(KINDS.labels.confirmNote(s, 'label-p'), /2 items using it move to Other/);
  assert.match(KINDS.labels.keep({ id: 'study', name: 'Study' }), /built in/);
  assert.equal(KINDS.labels.keep({ id: 'label-p', name: 'Piano' }), null);
});

test('a done item is its color washed pale and solid, never see-through', () => {
  const el: any = new FakeElement('i', null, null as any);
  assert.equal(wash('#FF4B1F'), '#FFBBAA');
  assert.equal(wash('#111111'), '#A5A5A5');
  paint(el, '#1746F0', 'fill', { done: true });
  assert.equal(el.style.background, wash('#1746F0'));
  assert.equal(el.style.color, '#2B2E31');
  paint(el, '#00A3A3', 'outline', { done: true });
  assert.deepEqual([el.style.borderColor, el.style.background], [wash('#00A3A3'), '#FFFFFF']);
});
