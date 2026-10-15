import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../../src/server.ts';
import { startApp } from '../../public/js/main.js';
import { FakeDocument, byClass, byTag, findAll, textOf } from './fakedom.ts';

let server: Server;
let base: string;
const json = { 'content-type': 'application/json' };
const now = () => new Date(2026, 9, 5, 9, 0); // Monday 5 Oct 2026, 09:00

before(async () => {
  server = createApp(join(mkdtempSync(join(tmpdir(), 'doitwithme-shell-')), 'db.json'));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => { server.close(); });

// The example state has commitments and a task, so labels and blocks exist.
async function bootWithData() {
  const example = await (await fetch(`${base}/api/example`)).json();
  assert.equal((await fetch(`${base}/api/state`, { method: 'PUT', headers: json, body: JSON.stringify(example) })).status, 200);
  const calls: string[] = [];
  const document: any = new FakeDocument();
  const root = document.createElement('div');
  const win: any = { location: { hash: '' }, localStorage: undefined, listeners: {}, addEventListener(t: string, f: Function) { (this.listeners[t] ??= []).push(f); } };
  const app: any = startApp({ root, document, fetch: (p: string, i: any) => { calls.push(`${i?.method ?? 'GET'} ${p}`); return fetch(base + p, i); }, win, now });
  const settle = async () => {
    for (let i = 0; i < 300; i++) {
      const s = app.store.get();
      if (s.status !== 'loading' && !s.busy) return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('the app did not settle');
  };
  await settle();
  const go = (hash: string) => app.navigate(hash);
  const dispatchKey = (k: string) => document.dispatch('keydown', { key: k, target: { tag: 'body' } });
  return { app, root, document, settle, go, dispatchKey, calls };
}
const fk = (root: any, k: string) => findAll(root, (e: any) => e.getAttribute('data-fk') === k);
const fkStarts = (root: any, p: string) => findAll(root, (e: any) => (e.getAttribute('data-fk') ?? '').startsWith(p));

test('the app is a sidebar and a panel; the old top bar and tabs are gone', async () => {
  const { root } = await bootWithData();
  assert.equal(byClass(root, 'side').length, 1);
  assert.equal(byTag(root, 'main').length, 1);
  assert.equal(byClass(root, 'tabs').length, 0);
  assert.equal(byClass(byClass(root, 'app')[0], 'bar').length, 0, 'the Menu keeps its own bar');
  assert.equal(fkStarts(root, 'tab-').length, 0);
  assert.equal(fk(root, 'menu').length, 0);
});

test('every screen is a sidebar link and the current one is marked', async () => {
  const { root } = await bootWithData();
  const keys = fkStarts(root, 'side-').map((e: any) => e.getAttribute('data-fk'));
  for (const id of ['week', 'day', 'month', 'commitments', 'tasks', 'due-dates', 'places', 'labels', 'settings']) assert.ok(keys.includes(`side-${id}`), id);
  assert.equal(keys.filter((k: string) => k !== 'side-toggle').length, 9);
  assert.equal(fk(root, 'side-week')[0].getAttribute('aria-current'), 'page');
});

test('+ New and Replan are in the sidebar and work', async () => {
  const { root, app, settle, calls } = await bootWithData();
  const chooser = () => findAll(root, (e: any) => e.getAttribute('aria-label') === 'New' && e.tag !== 'button');
  assert.equal(app.drawer.isOpen(), false);
  assert.equal(chooser().length, 0, 'no chooser before the click');
  fk(root, 'new')[0].click();
  assert.equal(app.drawer.isOpen(), true);
  assert.equal(chooser().length, 1, 'the chooser panel is drawn');
  assert.ok(byClass(root, 'choices').length > 0, 'it offers choices');
  assert.equal(fk(root, 'replan').length, 1);
  const before = calls.filter((c) => c === 'POST /api/replan').length;
  fk(root, 'replan')[0].click();
  await settle();
  assert.equal(calls.filter((c) => c === 'POST /api/replan').length, before + 1, 'Replan asked the server to replan');
});

test('the label filters live in the sidebar and hide blocks on the Week, and Show all brings them back', async () => {
  const { root, settle } = await bootWithData();
  const blocks = () => fkStarts(root, 'blk-').length;
  const before = blocks();
  assert.ok(before > 0, 'the week has blocks');
  const side = byClass(root, 'side')[0];
  const filter = findAll(side, (e: any) => (e.getAttribute('data-fk') ?? '').startsWith('fl-') && e.getAttribute('data-fk') !== 'fl-all')[0];
  assert.ok(filter, 'the sidebar offers label filters');
  filter.click();
  await settle();
  assert.ok(blocks() < before, 'a hidden label removes its blocks');
  fk(root, 'fl-all')[0].click();
  await settle();
  assert.equal(blocks(), before);
});

test('a label button keeps keyboard focus when it is toggled', async () => {
  const { root, settle } = await bootWithData();
  const key = (findAll(byClass(root, 'side')[0], (e: any) => (e.getAttribute('data-fk') ?? '').startsWith('fl-') && e.getAttribute('data-fk') !== 'fl-all')[0]).getAttribute('data-fk');
  const old = fk(root, key)[0];
  old.focus();
  old.click();
  await settle();
  const now = fk(root, key)[0];
  assert.notEqual(now, old, 'the button was redrawn');
  assert.equal(now.doc.activeElement, now, 'focus came back to the new button');
});

test('on another screen the label filters are not offered', async () => {
  const { root, go, settle } = await bootWithData();
  go('#/settings'); await settle();
  assert.equal(byClass(root, 'labels').length, 0);
});

test('a narrow window opens the sidebar with its button and a link closes it', async () => {
  const { root } = await bootWithData();
  const app = byClass(root, 'app')[0];
  const toggle = fk(root, 'side-toggle')[0];
  assert.equal(app.getAttribute('data-side'), null);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  toggle.click();
  assert.equal(app.getAttribute('data-side'), 'open');
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  fk(root, 'side-tasks')[0].click();
  assert.equal(app.getAttribute('data-side'), null);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
});

test('pressing / still opens the jump-to menu', async () => {
  const { root, dispatchKey } = await bootWithData();
  dispatchKey('/');
  assert.ok(byClass(root, 'menu').length > 0);
});

test('in a narrow window + New closes the sidebar and opens the drawer', async () => {
  const { root, app } = await bootWithData();
  const appEl = byClass(root, 'app')[0];
  fk(root, 'side-toggle')[0].click();
  assert.equal(appEl.getAttribute('data-side'), 'open');
  fk(root, 'new')[0].click();
  assert.equal(appEl.getAttribute('data-side'), null);
  assert.equal(app.drawer.isOpen(), true);
});

test('the old Deadlines address opens Due dates, and Due dates shows the status list or the form', async () => {
  const { root, go, settle } = await bootWithData();
  go('#/deadlines'); await settle();
  assert.equal(textOf(byTag(root, 'h1')[0]), 'Due dates');
  assert.equal(findAll(root, (e: any) => e.getAttribute('data-fk') === 'side-due-dates')[0].getAttribute('aria-current'), 'page');
  go('#/due-dates/new'); await settle();
  assert.ok(findAll(root, (e: any) => e.getAttribute('data-fk') === 'setup-save').length === 1, 'the form is shown for a parameter');
});

test('Travel is part of Places and travel in the sidebar', async () => {
  const { root, go, settle } = await bootWithData();
  go('#/commutes'); await settle();
  assert.equal(findAll(root, (e: any) => e.getAttribute('data-fk') === 'side-places')[0].getAttribute('aria-current'), 'page');
});

test('pressing n opens the chooser, except while typing, with a modifier, or with the Menu or the drawer open', async () => {
  const { root, document, app } = await bootWithData();
  const press = (k: string, ev: any = {}) => document.dispatch('keydown', { key: k, target: { tag: 'body' }, ...ev });
  press('n', { target: { tag: 'input' } });
  assert.equal(app.drawer.isOpen(), false, 'typing in a field never opens it');
  press('n', { metaKey: true });
  press('n', { ctrlKey: true });
  assert.equal(app.drawer.isOpen(), false, 'a modifier key never opens it');
  press('n');
  assert.equal(app.drawer.isOpen(), true, 'n opens it');
  press('n');
  assert.equal(byClass(root, 'choice').length, 3, 'still just one chooser');
});

test('pressing n in a narrow window closes the sidebar first', async () => {
  const { root, document, app } = await bootWithData();
  const appEl = byClass(root, 'app')[0];
  fk(root, 'side-toggle')[0].click();
  assert.equal(appEl.getAttribute('data-side'), 'open');
  document.dispatch('keydown', { key: 'n', target: { tag: 'body' } });
  assert.equal(appEl.getAttribute('data-side'), null);
  assert.equal(app.drawer.isOpen(), true);
});

test('#/setup marks Fixed times in the sidebar', async () => {
  const { root, go, settle } = await bootWithData();
  go('#/setup'); await settle();
  assert.equal(findAll(root, (e: any) => e.getAttribute('data-fk') === 'side-commitments')[0].getAttribute('aria-current'), 'page');
});
