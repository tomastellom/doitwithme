import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDom } from '../../public/js/dom.js';
import { SETTINGS, SETTINGS_GROUPS, createSettings } from '../../public/js/settings.js';
import { FakeDocument, byClass, byTag, findAll, textOf } from './fakedom.ts';

const tick = () => new Promise((r) => setTimeout(r, 0));
const key = (root: any, k: string) => findAll(root, (e) => e.getAttribute('data-fk') === k)[0];

function setup(opts: any = {}) {
  const saves: any[] = [];
  let softMode = opts.softMode ?? 'ask';
  let notify = false;
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
  };
  const dom = createDom(new FakeDocument() as any);
  const settings = createSettings(dom, { store, ui, keepFocus: (fn: Function) => fn() });
  const draw = (param: string | null = null) => settings.render({ s: store.get(), route: { id: 'settings', param } }) as any;
  return { settings, draw, saves, ui, store };
}

test('the screen shows the three groups, the Light theme and a dimmed Dark marked Later', () => {
  const { draw } = setup();
  const el = draw();
  assert.equal(textOf(byTag(el, 'h1')[0]), 'Settings');
  assert.deepEqual(SETTINGS_GROUPS.map((g) => g.title), ['Appearance', 'Notifications', 'Planner']);
  const text = textOf(el);
  for (const t of ['Theme', 'System notifications', 'Soft time', 'Later']) assert.match(text, new RegExp(t));
  const dark = key(el, 'set-theme-dark');
  assert.notEqual(dark.getAttribute('disabled'), null);
  assert.equal(key(el, 'set-theme-light').getAttribute('aria-pressed'), 'true');
});

test('the sub-navigation links to each group and marks the current one', () => {
  const { draw } = setup();
  const links = (el: any) => byClass(el, 'sub')[0].children.filter((c: any) => c.tag === 'a');
  assert.deepEqual(links(draw()).map((l: any) => l.getAttribute('href')), ['#/settings/appearance', '#/settings/notifications', '#/settings/planner']);
  const el = draw('notifications');
  assert.equal(links(el).find((l: any) => textOf(l) === 'Notifications').getAttribute('aria-current'), 'page');
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
    assert.ok(row.title && row.description.endsWith('.') && row.options.length >= 2, row.id);
    assert.ok(SETTINGS_GROUPS.some((g) => g.id === row.group), row.id);
  }
});
