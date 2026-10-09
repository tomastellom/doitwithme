import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNotifier } from '../../public/js/notify.js';

const item = (key: string, headline = `Headline ${key}`) => ({ key, headline });
const ready = { status: 'ready', state: {}, isEmpty: false };

function rig(over: any = {}) {
  const shown: any[] = [];
  const win: any = { Notification: function (title: string, opts: any) { shown.push([title, opts]); } };
  const doc: any = { visibilityState: over.visibility ?? 'hidden' };
  const ui: any = { notify: () => over.on ?? true };
  return { n: createNotifier({ ui, win, doc }), shown, doc, ui: over };
}

test('the first look at the plan only learns what is already there', () => {
  const { n, shown } = rig();
  assert.deepEqual(n.observe(ready, [item('a'), item('b')]), []);
  assert.equal(shown.length, 0);
});

test('a new warning while the tab is hidden is announced once, as plain text', () => {
  const { n, shown } = rig();
  n.observe(ready, [item('a')]);
  assert.deepEqual(n.observe(ready, [item('a'), item('b', '<b>Chemistry</b> is short')]), ['b']);
  assert.deepEqual(shown, [['doitwithme', { body: '<b>Chemistry</b> is short', tag: 'b' }]]);
  assert.deepEqual(n.observe(ready, [item('a'), item('b')]), []);
  assert.equal(shown.length, 1);
});

test('nothing is shown while the tab is visible, but the warning is not announced later either', () => {
  const r = rig({ visibility: 'visible' });
  r.n.observe(ready, []);
  assert.deepEqual(r.n.observe(ready, [item('a')]), []);
  r.doc.visibilityState = 'hidden';
  assert.deepEqual(r.n.observe(ready, [item('a')]), []);
});

test('nothing is shown when notifications are off or the plan is not ready', () => {
  const off = rig({ on: false });
  off.n.observe(ready, []);
  assert.deepEqual(off.n.observe(ready, [item('a')]), []);
  const loading = rig();
  assert.deepEqual(loading.n.observe({ status: 'loading', state: null }, [item('a')]), []);
  assert.deepEqual(loading.n.observe({ ...ready, isEmpty: true }, [item('a')]), []);
  loading.n.observe(ready, []);
  assert.deepEqual(loading.n.observe({ status: 'offline', state: {} }, [item('z')]), []);
});

test('several new warnings each get their own notification', () => {
  const { n, shown } = rig();
  n.observe(ready, []);
  assert.deepEqual(n.observe(ready, [item('a'), item('b')]), ['a', 'b']);
  assert.equal(shown.length, 2);
});

test('a browser that throws on Notification never breaks the page', () => {
  const win: any = { Notification: function () { throw new Error('nope'); } };
  const n = createNotifier({ ui: { notify: () => true } as any, win, doc: { visibilityState: 'hidden' } as any });
  n.observe(ready, []);
  assert.doesNotThrow(() => n.observe(ready, [item('a')]));
});
