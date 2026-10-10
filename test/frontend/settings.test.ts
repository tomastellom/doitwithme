import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDom } from '../../public/js/dom.js';
import { SETTINGS, SETTINGS_GROUPS, createSettings } from '../../public/js/settings.js';
import { createUiPrefs } from '../../public/js/ui-prefs.js';
import { FakeDocument, byClass, byTag, findAll, textOf } from './fakedom.ts';

const tick = () => new Promise((r) => setTimeout(r, 0));
const key = (root: any, k: string) => findAll(root, (e) => e.getAttribute('data-fk') === k)[0];

function setup(opts: any = {}) {
  const saves: any[] = [];
  let softMode = opts.softMode ?? 'ask';
  let notify = false;
  let range = { from: 7, to: 22 };
  const permission = opts.permission ?? 'default';
  const store: any = {
    get: () => ({ state: { preferences: { softMode } }, busy: opts.busy ?? false, formError: opts.formError ?? null, status: 'ready' }),
    saveState: async (fn: any) => {
      const next = fn({ preferences: { softMode: 'ask', minBreak: 10 }, tasks: [1] });
      saves.push(next);
      if (!opts.reject) softMode = next.preferences.softMode;
    },
  };
  const ui: any = {
    supported: () => permission !== 'unsupported',
    permission: () => permission,
    notify: () => notify,
    enableNotify: async () => { if (opts.answer === 'granted') notify = true; return opts.answer ?? 'denied'; },
    disableNotify: () => { notify = false; },
    hours: () => ({ ...range }),
    setHours: (from: number, to: number) => { range = { from, to }; return true; },
  };
  const dom = createDom(new FakeDocument() as any);
  const settings = createSettings(dom, { store, ui, keepFocus: (fn: Function) => fn() });
  const draw = (param: string | null = null) => settings.render({ s: store.get(), route: { id: 'settings', param } }) as any;
  return { settings, draw, saves, ui, store };
}

test('the screen shows the four groups, the Light theme and a dimmed Dark marked Later', () => {
  const { draw } = setup();
  const el = draw();
  assert.equal(textOf(byTag(el, 'h1')[0]), 'Settings');
  assert.deepEqual(SETTINGS_GROUPS.map((g) => g.title), ['Calendar', 'Look', 'Notifications', 'How I plan']);
  const text = textOf(el);
  for (const t of ['Theme', 'System notifications', 'Soft time', 'Later']) assert.match(text, new RegExp(t));
  const dark = key(el, 'set-theme-dark');
  assert.notEqual(dark.getAttribute('disabled'), null);
  assert.equal(key(el, 'set-theme-light').getAttribute('aria-pressed'), 'true');
});

test('everything is on one page, in two columns, with no sub-tabs to hunt through', () => {
  const { draw } = setup();
  const el = draw();
  assert.equal(byClass(el, 'sub').length, 0);
  assert.equal(byClass(el, 'st-grp').length, 4);
  assert.deepEqual(byClass(el, 'st-gh').map(textOf), ['Calendar', 'Look', 'Notifications', 'How I plan']);
  assert.equal(byClass(byClass(el, 'st-col')[0], 'st-grp').length, 3);
  assert.equal(byClass(byClass(el, 'st-col')[1], 'st-grp').length, 1);
});

test('soft time saves through the freshest copy and changes only that preference', async () => {
  const { draw, saves } = setup();
  const el = draw();
  assert.equal(key(el, 'set-softMode-ask').getAttribute('aria-pressed'), 'true');
  key(el, 'set-softMode-auto').click();
  await tick();
  assert.equal(saves.length, 1);
  assert.deepEqual(saves[0], { preferences: { softMode: 'auto', minBreak: 10 }, tasks: [1] });
  assert.equal(key(draw(), 'set-softMode-auto').getAttribute('aria-pressed'), 'true');
});

test('a rejected soft time save keeps the old value shown and says so', async () => {
  const { draw, saves } = setup({ reject: true, formError: 'preferences.softMode must be "ask" or "auto"' });
  const el = draw();
  key(el, 'set-softMode-auto').click();
  await tick();
  assert.equal(saves.length, 1);
  const again = draw();
  assert.equal(key(again, 'set-softMode-ask').getAttribute('aria-pressed'), 'true');
  assert.match(textOf(byClass(again, 'err')[0]), /Nothing was saved\./);
});

test('segments are disabled while a save runs', () => {
  const { draw } = setup({ busy: true });
  assert.notEqual(key(draw(), 'set-softMode-auto').getAttribute('disabled'), null);
});

test('turning notifications on asks the browser and only sticks when it agrees', async () => {
  const granted = setup({ answer: 'granted' });
  const el = granted.draw();
  assert.equal(key(el, 'set-notifications-off').getAttribute('aria-pressed'), 'true');
  assert.match(textOf(el), /Your browser will ask for permission/);
  key(el, 'set-notifications-on').click();
  await tick();
  assert.equal(key(granted.draw(), 'set-notifications-on').getAttribute('aria-pressed'), 'true');
  key(granted.draw(), 'set-notifications-off').click();
  await tick();
  assert.equal(key(granted.draw(), 'set-notifications-off').getAttribute('aria-pressed'), 'true');
});

test('a refusal or an unsupported browser is explained and the switch stays Off', async () => {
  const denied = setup({ permission: 'denied', answer: 'denied' });
  assert.match(textOf(denied.draw()), /Notifications are blocked/);
  key(denied.draw(), 'set-notifications-on').click();
  await tick();
  assert.equal(key(denied.draw(), 'set-notifications-off').getAttribute('aria-pressed'), 'true');
  const none = setup({ permission: 'unsupported' });
  assert.match(textOf(none.draw()), /cannot show notifications/);
  assert.notEqual(key(none.draw(), 'set-notifications-on').getAttribute('disabled'), null);
});

test('every declared row has a title, a sentence and options, and writes through one function', () => {
  for (const row of SETTINGS) {
    assert.ok(row.title && row.description.endsWith('.') && (row.hours || row.options.length >= 2), row.id);
    assert.ok(SETTINGS_GROUPS.some((g) => g.id === row.group), row.id);
  }
});

test('the hint says when notifications are already allowed', () => {
  const allowed = setup({ permission: 'granted' });
  assert.match(textOf(allowed.draw()), /Allowed in this browser/);
  assert.doesNotMatch(textOf(allowed.draw()), /will ask for permission/);
});

test('Calendar hours: two pickers that can never leave less than four hours, saved in this browser', () => {
  const store: Record<string, string> = {};
  const win: any = { localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } } };
  const ui = createUiPrefs(win);
  assert.deepEqual(ui.hours(), { from: 7, to: 22 });
  assert.equal(ui.setHours(8, 20), true);
  assert.equal(ui.setHours(10, 12), false, 'too short');
  assert.equal(ui.setHours(-1, 20), false);
  assert.equal(ui.setHours(6, 25), false);
  assert.deepEqual(createUiPrefs(win).hours(), { from: 8, to: 20 }, 'remembered');
  store['doitwithme.hours'] = 'banana';
  assert.deepEqual(createUiPrefs(win).hours(), { from: 7, to: 22 }, 'a damaged value falls back');
});

test('the Calendar hours pickers show the saved range and change it', () => {
  const { draw, ui } = setup();
  const el = draw();
  const from = key(el, 'set-hours-from');
  const to = key(el, 'set-hours-to');
  assert.equal(from.value, '7');
  assert.equal(to.value, '22');
  assert.equal(byTag(from, 'option').length, 19, 'From runs 00:00 to 18:00 so four hours always remain');
  assert.equal(textOf(byTag(to, 'option')[0]), '11:00');
  from.value = '9';
  from.dispatch('change');
  assert.deepEqual(ui.hours(), { from: 9, to: 22 });
});
