import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDom } from '../../public/js/dom.js';
import { createMascot, createNudge } from '../../public/js/nudge.js';
import { FakeDocument, byClass, byTag, findAll, textOf } from './fakedom.ts';

const dom = createDom(new FakeDocument() as any);
const offer = { key: 'soft-offer|2026-10-09', date: '2026-10-09', weekday: 'Friday', minutes: 90, cost: 0, line: 'Friday evening is free. I would only touch it for study, and only if you say so.', button: 'Use Friday evening' };
const item = (over: any = {}) => ({ key: 'deadline-short|Chemistry|exam|2026-10-23', headline: 'Chemistry exam, Fri 23 Oct, is 90 min short.', minutes: 90, category: 'study', offer, ...over });
const base = { status: 'ready', items: [], confirm: null, error: null, busy: false };

function setup() {
  const calls: any[] = [];
  const handlers = {
    approve: (d: string) => calls.push(['approve', d]),
    undo: (d: string) => calls.push(['undo', d]),
    dismiss: (k: string[]) => calls.push(['dismiss', k]),
    okay: () => calls.push(['okay']),
    retry: () => calls.push(['retry']),
  };
  const nudge: any = createNudge(dom, handlers);
  return { nudge, calls };
}
const buttons = (el: any) => byTag(el, 'button');
const labelled = (el: any, text: string) => buttons(el).find((b) => textOf(b).trim() === text);

test('quiet: All clear and no buttons', () => {
  const { nudge } = setup();
  nudge.update({ ...base });
  assert.match(textOf(nudge.el), /All clear\./);
  assert.equal(buttons(nudge.el).length, 0);
  assert.equal(nudge.el.getAttribute('aria-label'), 'Nudge');
  assert.equal(nudge.el.getAttribute('tabindex'), '-1');
});

test('loading says Loading, never All clear', () => {
  const { nudge } = setup();
  nudge.update({ ...base, status: 'loading' });
  assert.match(textOf(nudge.el), /Loading/);
  assert.doesNotMatch(textOf(nudge.el), /All clear/);
});

test('speaking: headline, offer line, both buttons and the badge', () => {
  const { nudge, calls } = setup();
  nudge.update({ ...base, items: [item()] });
  const text = textOf(nudge.el);
  assert.match(text, /Chemistry exam, Fri 23 Oct, is 90 min short\./);
  assert.match(text, /Friday evening is free\. I would only touch it for study, and only if you say so\./);
  labelled(nudge.el, 'Use Friday evening')!.click();
  labelled(nudge.el, 'Leave it')!.click();
  assert.deepEqual(calls, [['approve', '2026-10-09'], ['dismiss', [item().key, offer.key]]]);
  assert.equal(textOf(byClass(nudge.el, 'mascot-badge-text')[0]), '1');
  assert.equal(byClass(nudge.el, 'say')[0].getAttribute('aria-live'), 'polite');
});

test('a warning without an offer only has Leave it', () => {
  const { nudge, calls } = setup();
  nudge.update({ ...base, items: [item({ offer: null })] });
  assert.equal(buttons(nudge.el).filter((b) => ['Leave it'].includes(textOf(b).trim())).length, 1);
  assert.equal(labelled(nudge.el, 'Use Friday evening'), undefined);
  labelled(nudge.el, 'Leave it')!.click();
  assert.deepEqual(calls, [['dismiss', [item().key]]]);
});

test('several warnings page with previous and next', () => {
  const { nudge } = setup();
  nudge.update({ ...base, items: [item(), item({ key: 'b', headline: 'Gym is 60 min short in the week of 12 Oct.', offer: null }), item({ key: 'c', headline: 'Third.', offer: null })] });
  assert.match(textOf(nudge.el), /Nudge \/ 1 of 3/);
  assert.equal(textOf(byClass(nudge.el, 'mascot-badge-text')[0]), '3');
  buttons(nudge.el).find((b) => b.getAttribute('aria-label') === 'Next warning')!.click();
  assert.match(textOf(nudge.el), /2 of 3/);
  assert.match(textOf(nudge.el), /Gym is 60 min short/);
  buttons(nudge.el).find((b) => b.getAttribute('aria-label') === 'Previous warning')!.click();
  assert.match(textOf(nudge.el), /1 of 3/);
});

test('the offer states a cost to other tasks when there is one', () => {
  const { nudge } = setup();
  nudge.update({ ...base, items: [item({ offer: { ...offer, cost: 20, line: `${offer.line} It would cost other tasks 20 min.` } })] });
  assert.match(textOf(nudge.el), /It would cost other tasks 20 min\./);
});

test('the Ask field answers honestly and sends nothing', () => {
  const { nudge, calls } = setup();
  nudge.update({ ...base, items: [item()] });
  const form = byTag(nudge.el, 'form')[0];
  const input = byTag(nudge.el, 'input')[0];
  assert.equal(input.getAttribute('aria-label'), 'Ask Nudge');
  input.value = 'move my gym';
  const e = form.dispatch('submit');
  assert.equal(e.defaultPrevented, true);
  assert.match(textOf(nudge.el), /I can't answer questions yet\. That arrives with the AI phase\./);
  assert.deepEqual(calls, []);
});

test('offline shows the plain message and Retry', () => {
  const { nudge, calls } = setup();
  nudge.update({ ...base, status: 'offline' });
  assert.match(textOf(nudge.el), /I can't reach the planner\./);
  assert.match(textOf(nudge.el), /npm run serve/);
  labelled(nudge.el, 'Retry')!.click();
  assert.deepEqual(calls, [['retry']]);
  assert.equal(textOf(byClass(nudge.el, 'mascot-badge-text')[0]), '!');
});

test('a server error says so and shows the message', () => {
  const { nudge } = setup();
  nudge.update({ ...base, status: 'error', error: 'data/db.json is not a valid state file' });
  assert.match(textOf(nudge.el), /Something went wrong\./);
  assert.match(textOf(nudge.el), /data\/db\.json is not a valid state file/);
});

test('confirmation: Okay and Undo, with the minutes that moved in', () => {
  const { nudge, calls } = setup();
  nudge.update({ ...base, confirm: { date: '2026-10-09', weekday: 'Friday', minutes: 120, titles: ['Chemistry'], used: true } });
  assert.match(textOf(nudge.el), /Done\. Friday evening is in your plan\./);
  assert.match(textOf(nudge.el), /120 min of Chemistry moved in\. You can take it back\./);
  labelled(nudge.el, 'Undo')!.click();
  labelled(nudge.el, 'Okay')!.click();
  assert.deepEqual(calls, [['undo', '2026-10-09'], ['okay']]);
});

test('confirmation when nothing needed the evening says so plainly', () => {
  const { nudge } = setup();
  nudge.update({ ...base, confirm: { date: '2026-10-09', weekday: 'Friday', minutes: 0, titles: [], used: false } });
  assert.match(textOf(nudge.el), /Friday evening is open\./);
  assert.match(textOf(nudge.el), /Nothing needed it, so your plan did not change\./);
});

test('buttons are disabled while a request is running', () => {
  const { nudge } = setup();
  nudge.update({ ...base, items: [item()], busy: true });
  for (const b of buttons(nudge.el)) {
    if (['Use Friday evening', 'Leave it'].includes(textOf(b).trim())) assert.equal(b.hasAttribute('disabled'), true);
  }
});

test('hostile text in a headline is shown as text, never as an element', () => {
  const { nudge } = setup();
  const evil = '<img src=x onerror=alert(1)>';
  nudge.update({ ...base, items: [item({ headline: evil, offer: null })] });
  assert.match(textOf(nudge.el), /<img src=x onerror=alert\(1\)>/);
  assert.equal(findAll(nudge.el, (e) => e.tag === 'img').length, 0);
});

test('the mascot has an accessible name and the three eye styles', () => {
  const side: any = createMascot(dom, { eyes: 'side', badge: '2', width: 124 });
  assert.equal(side.getAttribute('role'), 'img');
  assert.match(side.getAttribute('aria-label'), /Nudge/);
  assert.equal(byClass(side, 'mascot-eye').length, 2);
  const sleepy: any = createMascot(dom, { eyes: 'sleepy', badge: null, width: 96 });
  assert.equal(byClass(sleepy, 'mascot-badge').length, 0);
  assert.equal(byClass(sleepy, 'mascot-eye')[0].getAttribute('height'), '8');
});
