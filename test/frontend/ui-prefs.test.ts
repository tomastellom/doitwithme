import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUiPrefs } from '../../public/js/ui-prefs.js';

function win(permission = 'default', answer = 'granted', store: Record<string, string> | null = {}) {
  const storage = store === null ? undefined : {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = v; },
  };
  const Notification: any = function () {};
  Notification.permission = permission;
  Notification.requestPermission = async () => { Notification.permission = answer; return answer; };
  return { Notification, localStorage: storage, asked: () => Notification.permission };
}

test('notifications are off until the person turns them on and the browser allows it', async () => {
  const w = win();
  const ui = createUiPrefs(w as any);
  assert.equal(ui.supported(), true);
  assert.equal(ui.notify(), false);
  assert.equal(await ui.enableNotify(), 'granted');
  assert.equal(ui.notify(), true);
  assert.equal(createUiPrefs(w as any).notify(), true, 'the choice survives a reload');
  ui.disableNotify();
  assert.equal(ui.notify(), false);
  assert.equal(createUiPrefs(w as any).notify(), false);
});

test('a refusal leaves notifications off and says why', async () => {
  const ui = createUiPrefs(win('default', 'denied') as any);
  assert.equal(await ui.enableNotify(), 'denied');
  assert.equal(ui.notify(), false);
  const blocked = createUiPrefs(win('denied') as any);
  assert.equal(await blocked.enableNotify(), 'denied');
  assert.equal(blocked.notify(), false);
});

test('a browser without notifications is reported, never crashes', async () => {
  const ui = createUiPrefs({} as any);
  assert.equal(ui.supported(), false);
  assert.equal(ui.permission(), 'unsupported');
  assert.equal(await ui.enableNotify(), 'unsupported');
  assert.equal(ui.notify(), false);
});

test('blocked storage still works for the length of the page', async () => {
  const w: any = win('granted', 'granted', null);
  const ui = createUiPrefs(w);
  assert.equal(await ui.enableNotify(), 'granted');
  assert.equal(ui.notify(), true);
  const throwing: any = { ...win('granted'), localStorage: { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } } };
  const ui2 = createUiPrefs(throwing);
  assert.equal(ui2.notify(), false);
  assert.equal(await ui2.enableNotify(), 'granted');
  assert.equal(ui2.notify(), true);
});

test('a choice stored as On does not notify once the browser permission is gone', () => {
  const w = win('denied', 'denied', { 'doitwithme.notify': 'on' });
  assert.equal(createUiPrefs(w as any).notify(), false);
});
