import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDom } from '../../public/js/dom.js';
import { renderField } from '../../public/js/form.js';
import { FakeDocument, byClass, byTag, findAll, textOf } from './fakedom.ts';

const dom = createDom(new FakeDocument() as any);
function setup(over: any = {}) {
  let rerenders = 0;
  const ctx = { state: { tasks: [{ id: 't1', title: 'Chemistry' }] }, scratch: {}, rerender: () => { rerenders++; }, ...over };
  return { ctx, rerenders: () => rerenders };
}
const byKey = (root: any, key: string) => findAll(root, (e) => e.getAttribute('data-fk') === key)[0];

test('a text field has a label tied to its input, shows the draft and writes typing back', () => {
  const { ctx } = setup();
  const draft: any = { title: 'Private lesson' };
  const el: any = renderField(dom, { name: 'title', label: 'Title', type: 'text', span: 2 }, draft, ctx);
  assert.ok(el.hasClass('span2'));
  const label = byTag(el, 'label')[0];
  const input = byTag(el, 'input')[0];
  assert.equal(label.getAttribute('for'), input.getAttribute('id'));
  assert.equal(textOf(label), 'Title');
  assert.equal(input.value, 'Private lesson');
  assert.equal(input.getAttribute('data-fk'), 'f-title');
  input.value = 'Piano lesson';
  input.dispatch('input');
  assert.equal(draft.title, 'Piano lesson');
});

test('a date field uses a date input', () => {
  const { ctx } = setup();
  const el: any = renderField(dom, { name: 'from', label: 'From', type: 'date' }, { from: '2026-09-01' }, ctx);
  assert.equal(byTag(el, 'input')[0].getAttribute('type'), 'date');
  assert.equal(byTag(el, 'input')[0].value, '2026-09-01');
});

test('hostile text in a draft is only ever an input value', () => {
  const { ctx } = setup();
  const evil = '<img src=x onerror=alert(1)>';
  const el: any = renderField(dom, { name: 'title', label: 'Title', type: 'text' }, { title: evil }, ctx);
  assert.equal(byTag(el, 'input')[0].value, evil);
  assert.equal(findAll(el, (e) => e.tag === 'img').length, 0);
  assert.equal(textOf(el).includes('img'), false);
});

test('a select lists the options, marks the current one, keeps an unknown current value, and writes changes back', () => {
  const { ctx } = setup();
  const draft: any = { category: 'lesson' };
  const def = { name: 'category', label: 'Category', type: 'select', options: () => [{ value: 'class', label: 'Class' }, { value: 'lesson', label: 'Lesson' }] };
  const el: any = renderField(dom, def, draft, ctx);
  const options = byTag(el, 'option');
  assert.deepEqual(options.map(textOf), ['Class', 'Lesson']);
  assert.equal(options[1].hasAttribute('selected'), true);
  assert.equal(options[0].hasAttribute('selected'), false);
  const select = byTag(el, 'select')[0];
  select.value = 'class';
  select.dispatch('change');
  assert.equal(draft.category, 'class');
  const custom: any = renderField(dom, def, { category: 'tutoring' }, ctx);
  assert.deepEqual(byTag(custom, 'option').map(textOf), ['tutoring', 'Class', 'Lesson']);
});

test('select options can depend on the state', () => {
  const { ctx } = setup();
  const def = { name: 'taskId', label: 'Task', type: 'select', options: (state: any) => state.tasks.map((t: any) => ({ value: t.id, label: t.title })) };
  const el: any = renderField(dom, def, { taskId: 't1' }, ctx);
  assert.deepEqual(byTag(el, 'option').map(textOf), ['Chemistry']);
});

test('a choice shows which option is on, and clicking one writes the draft and redraws', () => {
  const { ctx, rerenders } = setup();
  const draft: any = { repeats: 'weekly' };
  const def = { name: 'repeats', label: 'Repeats', type: 'choice', options: [{ value: 'once', label: 'Once' }, { value: 'weekly', label: 'Weekly' }] };
  const el: any = renderField(dom, def, draft, ctx);
  assert.equal(byKey(el, 'f-repeats-weekly').getAttribute('aria-pressed'), 'true');
  assert.ok(byKey(el, 'f-repeats-weekly').hasClass('on'));
  assert.equal(byKey(el, 'f-repeats-once').getAttribute('aria-pressed'), 'false');
  byKey(el, 'f-repeats-once').click();
  assert.equal(draft.repeats, 'once');
  assert.equal(rerenders(), 1);
});

test('a choice can hold booleans', () => {
  const { ctx } = setup();
  const draft: any = { onePerDay: false };
  const def = { name: 'onePerDay', label: 'One session a day', type: 'choice', options: [{ value: false, label: 'No' }, { value: true, label: 'Yes' }] };
  const el: any = renderField(dom, def, draft, ctx);
  assert.equal(byKey(el, 'f-onePerDay-false').getAttribute('aria-pressed'), 'true');
  byKey(el, 'f-onePerDay-true').click();
  assert.equal(draft.onePerDay, true);
});

test('weekday toggles run Monday to Sunday, are named in full, and toggle the draft', () => {
  const { ctx, rerenders } = setup();
  const draft: any = { weekdays: [2, 4] };
  const el: any = renderField(dom, { name: 'weekdays', label: 'Weekdays', type: 'weekdays', span: 2 }, draft, ctx);
  const buttons = byTag(el, 'button');
  assert.deepEqual(buttons.map(textOf), ['M', 'T', 'W', 'T', 'F', 'S', 'S']);
  assert.deepEqual(buttons.map((b) => b.getAttribute('aria-label')), ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
  assert.deepEqual(buttons.map((b) => b.getAttribute('aria-pressed')), ['false', 'true', 'false', 'true', 'false', 'false', 'false']);
  byKey(el, 'f-weekdays-3').click();
  assert.deepEqual(draft.weekdays, [2, 4, 3]);
  byKey(el, 'f-weekdays-2').click();
  assert.deepEqual(draft.weekdays, [4, 3]);
  byKey(el, 'f-weekdays-0').click();
  assert.deepEqual(draft.weekdays, [4, 3, 0]);
  assert.equal(rerenders(), 3);
});

test('cancelled dates show as chips, can be removed, and a real new date can be added once', () => {
  const { ctx, rerenders } = setup();
  const draft: any = { exceptions: ['2026-10-21', '2026-11-04'] };
  const def = { name: 'exceptions', label: 'Cancelled dates', type: 'dates', span: 2 };
  let el: any = renderField(dom, def, draft, ctx);
  assert.deepEqual(byClass(el, 'chp').map((c) => textOf(c).replace('x', '').trim()), ['Wed 21 Oct', 'Wed 4 Nov']);
  byKey(el, 'f-exceptions-rm-0').click();
  assert.deepEqual(draft.exceptions, ['2026-11-04']);
  assert.equal(byKey(el, 'f-exceptions-rm-0').getAttribute('aria-label'), 'Remove 2026-10-21');

  const input = byKey(el, 'f-exceptions');
  input.value = '2026-10-28';
  input.dispatch('input');
  byKey(el, 'f-exceptions-add').click();
  assert.deepEqual(draft.exceptions, ['2026-10-28', '2026-11-04']);
  assert.equal(ctx.scratch.exceptions, '');

  el = renderField(dom, def, draft, ctx);
  const again = byKey(el, 'f-exceptions');
  again.value = '2026-10-28';
  again.dispatch('input');
  byKey(el, 'f-exceptions-add').click();
  assert.deepEqual(draft.exceptions, ['2026-10-28', '2026-11-04']);
  again.value = '2026-02-31';
  again.dispatch('input');
  byKey(el, 'f-exceptions-add').click();
  assert.deepEqual(draft.exceptions, ['2026-10-28', '2026-11-04']);
  assert.equal(rerenders(), 2);
});

test('the pending date typed into the chips field survives a redraw', () => {
  const { ctx } = setup();
  const def = { name: 'exceptions', label: 'Cancelled dates', type: 'dates' };
  const first: any = renderField(dom, def, { exceptions: [] }, ctx);
  const input = byKey(first, 'f-exceptions');
  input.value = '2026-10-28';
  input.dispatch('input');
  const second: any = renderField(dom, def, { exceptions: [] }, ctx);
  assert.equal(byKey(second, 'f-exceptions').value, '2026-10-28');
});

test('soft windows can be edited, added and removed', () => {
  const { ctx, rerenders } = setup();
  const draft: any = { softWindows: [{ weekday: 5, start: '18:00', end: '24:00' }] };
  const def = { name: 'softWindows', label: 'Soft evenings', type: 'softWindows', span: 3 };
  const el: any = renderField(dom, def, draft, ctx);
  assert.equal(byTag(el, 'select')[0].getAttribute('aria-label'), 'Soft window 1 day');
  assert.equal(byTag(byTag(el, 'select')[0], 'option').find((o) => o.hasAttribute('selected'))!.value, '5');
  const [start, end] = byTag(el, 'input');
  assert.equal(start.value, '18:00');
  start.value = '19:00';
  start.dispatch('input');
  end.value = '23:00';
  end.dispatch('input');
  const day = byTag(el, 'select')[0];
  day.value = '6';
  day.dispatch('change');
  assert.deepEqual(draft.softWindows, [{ weekday: 6, start: '19:00', end: '23:00' }]);
  byKey(el, 'f-softWindows-add').click();
  assert.deepEqual(draft.softWindows[1], { weekday: 5, start: '18:00', end: '24:00' });
  byTag(el, 'button').find((b) => b.getAttribute('aria-label') === 'Remove soft window 1')!.click();
  assert.equal(draft.softWindows.length, 1);
  assert.equal(rerenders(), 2);
});

test('a custom field draws what its render function returns, and nothing when it returns null', () => {
  const { ctx } = setup();
  const def = { name: 'note', type: 'custom', span: 3, render: (d: any) => d.h('p', { class: 'hint' }, 'Hello') };
  const el: any = renderField(dom, { ...def, render: (_d: any) => dom.h('p', { class: 'hint' }, 'Hello') }, {}, ctx);
  assert.ok(el.hasClass('span3'));
  assert.equal(textOf(byClass(el, 'hint')[0]), 'Hello');
  assert.equal(renderField(dom, { name: 'note', type: 'custom', render: () => null }, {}, ctx), null);
});

test('a choice can dim some of its options, and a dimmed option cannot be picked', () => {
  const { ctx } = setup();
  const draft: any = { method: 'typed' };
  const def = { name: 'method', label: 'How long', type: 'choice', options: [{ value: 'typed', label: 'I type it' }, { value: 'maps', label: 'Maps' }], disabledValues: () => ['maps'] };
  const el: any = renderField(dom, def, draft, ctx);
  assert.notEqual(byKey(el, 'f-method-maps').getAttribute('disabled'), null);
  assert.equal(byKey(el, 'f-method-typed').getAttribute('disabled'), null);
  byKey(el, 'f-method-maps').click();
  assert.equal(draft.method, 'typed');
});

test('a select flagged redraw asks the screen to redraw when it changes', () => {
  const { ctx, rerenders } = setup();
  const draft: any = { repeats: 'weekly' };
  const def = { name: 'repeats', label: 'Repeats', type: 'select', redraw: true, options: () => [{ value: 'weekly', label: 'Every week' }, { value: 'monthly', label: 'Every month' }] };
  const el: any = renderField(dom, def, draft, ctx);
  const select = byKey(el, 'f-repeats');
  select.value = 'monthly';
  select.dispatch('change');
  assert.equal(draft.repeats, 'monthly');
  assert.equal(rerenders(), 1);
});

test('a textarea field has a label tied to it, shows the draft and writes typing back', () => {
  const { ctx } = setup();
  const draft: any = { syllabus: 'Weekly sets' };
  const el: any = renderField(dom, { name: 'syllabus', label: 'Syllabus', type: 'textarea', span: 3 }, draft, ctx);
  assert.ok(el.hasClass('span3'));
  const area = byTag(el, 'textarea')[0];
  assert.equal(byTag(el, 'label')[0].getAttribute('for'), area.getAttribute('id'));
  assert.equal(area.value, 'Weekly sets');
  area.value = '<b>Not markup</b>';
  area.dispatch('input');
  assert.equal(draft.syllabus, '<b>Not markup</b>');
});
