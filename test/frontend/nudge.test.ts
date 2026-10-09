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
  assert.equal(byClass(nudge.el, 'say')[0].hasAttribute('aria-live'), false);
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

test('one persistent live region announces changes and stays quiet when nothing changed', () => {
  const { nudge } = setup();
  nudge.update({ ...base, items: [item()] });
  const live = byClass(nudge.el, 'sr-only')[0];
  assert.equal(live.getAttribute('aria-live'), 'polite');
  assert.equal(live.getAttribute('role'), 'status');
  assert.match(textOf(live), /Chemistry exam, Fri 23 Oct, is 90 min short\./);
  const node = live.children[0];
  nudge.update({ ...base, items: [item()], busy: true });
  assert.equal(byClass(nudge.el, 'sr-only')[0], live);
  assert.equal(live.children[0], node);
  nudge.update({ ...base, confirm: { date: '2026-10-09', weekday: 'Friday', minutes: 120, titles: ['Chemistry'], used: true } });
  assert.match(textOf(live), /Done\. Friday evening is in your plan\./);
});

test('typed Ask text survives paging between warnings', () => {
  const { nudge } = setup();
  nudge.update({ ...base, items: [item(), item({ key: 'b', headline: 'Second.', offer: null })] });
  const input = () => byTag(nudge.el, 'input')[0];
  input().value = 'move my gym';
  input().dispatch('input');
  buttons(nudge.el).find((b) => b.getAttribute('aria-label') === 'Next warning')!.click();
  assert.equal(input().value, 'move my gym');
});

test('a notice is shown in both the quiet and the speaking state', () => {
  const { nudge } = setup();
  nudge.update({ ...base, notice: 'That warning changed, so I refreshed the plan.' });
  assert.match(textOf(nudge.el), /That warning changed, so I refreshed the plan\./);
  nudge.update({ ...base, items: [item()], notice: 'That warning changed, so I refreshed the plan.' });
  assert.match(textOf(nudge.el), /That warning changed, so I refreshed the plan\./);
});

test('the controls carry stable focus keys so focus can be restored after a redraw', () => {
  const { nudge } = setup();
  nudge.update({ ...base, items: [item()] });
  const keys = byTag(nudge.el, 'button').map((b) => b.getAttribute('data-fk'));
  assert.ok(keys.includes('nudge-use') && keys.includes('nudge-leave'));
  assert.equal(byTag(nudge.el, 'input')[0].getAttribute('data-fk'), 'nudge-ask');
});

test('Nudge rests out of sight when there is nothing to say, and comes out when there is', () => {
  const { nudge } = setup();
  const state = () => nudge.el.getAttribute('data-state');
  nudge.update({ ...base });
  assert.equal(state(), 'resting');
  assert.equal(byClass(nudge.el, 'nudge-body')[0].getAttribute('aria-hidden'), 'true');
  nudge.update({ ...base, status: 'loading' });
  assert.equal(state(), 'resting');
  nudge.update({ ...base, items: [item()] });
  assert.equal(state(), 'alert');
  assert.equal(byClass(nudge.el, 'nudge-body')[0].hasAttribute('aria-hidden'), false);
  nudge.update({ ...base, status: 'offline' });
  assert.equal(state(), 'alert');
  nudge.update({ ...base, status: 'error', error: 'x' });
  assert.equal(state(), 'alert');
  nudge.update({ ...base, confirm: { date: '2026-10-09', weekday: 'Friday', minutes: 0, titles: [], used: false } });
  assert.equal(state(), 'alert');
  nudge.update({ ...base, notice: 'That warning changed, so I refreshed the plan.' });
  assert.equal(state(), 'alert');
  nudge.update({ ...base });
  assert.equal(state(), 'resting');
});

test('a notice with nothing else to say can be dismissed with Okay', () => {
  const { nudge, calls } = setup();
  nudge.update({ ...base, notice: 'That warning changed, so I refreshed the plan.' });
  labelled(nudge.el, 'Okay')!.click();
  assert.deepEqual(calls, [['okay']]);
});

test('clicking the mascot makes it blink once, and the blink clears itself', () => {
  const { nudge } = setup();
  nudge.update({ ...base, items: [item()] });
  const mascot = byClass(nudge.el, 'mascot')[0];
  assert.equal(mascot.hasClass('blinking'), false);
  mascot.click();
  assert.equal(mascot.hasClass('blinking'), true);
  mascot.dispatch('animationend');
  assert.equal(mascot.hasClass('blinking'), false);
  mascot.click();
  mascot.click();
  assert.equal(mascot.hasClass('blinking'), true);
  mascot.dispatch('animationend');
  assert.equal(mascot.hasClass('blinking'), false);
});

import { FACES, faceFor } from '../../public/js/nudge.js';

test('all twelve faces from board R can be drawn, each tagged with its name and keeping the same body', () => {
  assert.deepEqual(Object.keys(FACES), ['resting', 'glance-left', 'glance-right', 'blink', 'happy', 'sleepy', 'surprised', 'thinking', 'worried', 'working', 'celebrating', 'peeking']);
  for (const name of Object.keys(FACES)) {
    const m: any = createMascot(dom, { face: name, badge: null, width: 96 });
    assert.equal(m.getAttribute('data-face'), name);
    assert.equal(m.getAttribute('role'), 'img');
    assert.match(m.getAttribute('aria-label'), /^Nudge/);
    assert.equal(byClass(m, 'mascot-body').length, 1, name);
  }
});

test('the faces differ where board R says they do', () => {
  const draw = (face: string): any => createMascot(dom, { face });
  assert.equal(byClass(draw('resting'), 'mascot-eye').length, 2);
  assert.equal(byClass(draw('happy'), 'mascot-eye').length, 0);
  assert.equal(byClass(draw('happy'), 'mascot-arc').length, 2);
  assert.equal(byClass(draw('celebrating'), 'mascot-arc').length, 2);
  assert.equal(byClass(draw('celebrating'), 'mascot-confetti').length, 8);
  assert.equal(byClass(draw('thinking'), 'mascot-dot').length, 3);
  assert.equal(byClass(draw('working'), 'mascot-ring').length, 1);
  assert.equal(byClass(draw('worried'), 'mascot-eye')[0].getAttribute('transform'), 'rotate(14 42 82)');
  assert.equal(byClass(draw('worried'), 'mascot-eye')[1].getAttribute('transform'), 'rotate(-14 78 82)');
  assert.equal(byClass(draw('peeking'), 'mascot-mask').length, 1);
  assert.equal(byClass(draw('blink'), 'mascot-eye')[0].getAttribute('height'), '7');
  assert.equal(byClass(draw('sleepy'), 'mascot-eye')[0].getAttribute('height'), '8');
  assert.equal(byClass(draw('surprised'), 'mascot-eye')[0].getAttribute('height'), '44');
  assert.notEqual(byClass(draw('glance-left'), 'mascot-eye')[0].getAttribute('x'), byClass(draw('glance-right'), 'mascot-eye')[0].getAttribute('x'));
});

test('the old eye names still work', () => {
  assert.equal((createMascot(dom, { eyes: 'sleepy' }) as any).getAttribute('data-face'), 'sleepy');
  assert.equal((createMascot(dom, { eyes: 'side' }) as any).getAttribute('data-face'), 'glance-left');
  assert.equal((createMascot(dom, { eyes: 'center' }) as any).getAttribute('data-face'), 'resting');
});

test('which face goes with which situation', () => {
  const view = (over: any = {}) => ({ ...base, ...over });
  assert.equal(faceFor(view({ status: 'offline' })), 'sleepy');
  assert.equal(faceFor(view({ status: 'error' })), 'sleepy');
  assert.equal(faceFor(view({ confirm: { used: true } })), 'happy');
  assert.equal(faceFor(view({ confirm: { used: false } })), 'resting');
  assert.equal(faceFor(view({ busy: true })), 'working');
  assert.equal(faceFor(view({ items: [item()] })), 'glance-left');
  assert.equal(faceFor(view({ items: [item({ offer: null })] })), 'worried');
  assert.equal(faceFor(view({ items: [item()], surprised: true })), 'surprised');
  assert.equal(faceFor(view({ notice: 'hello' })), 'resting');
  assert.equal(faceFor(view()), 'resting');
  assert.equal(faceFor(view({ celebrate: true })), 'celebrating');
  assert.equal(faceFor(view({ celebrate: true, items: [item()] })), 'glance-left');
  assert.equal(faceFor(view({ glance: 'right' })), 'glance-right');
  assert.equal(faceFor(view({ glance: 'left', celebrate: true })), 'celebrating');
});

function timed() {
  const timers: Array<{ fn: Function; ms: number }> = [];
  const env = {
    setTimer: (fn: Function, ms: number) => { timers.push({ fn, ms }); return timers.length; },
    clearTimer: (id: number) => { timers[id - 1] = { fn: () => {}, ms: 0 }; },
    random: () => 0.9,
  };
  const nudge: any = createNudge(dom, { approve() {}, undo() {}, dismiss() {}, okay() {}, retry() {} }, env);
  const face = () => byClass(nudge.el, 'mascot')[0].getAttribute('data-face');
  const fire = () => { const t = timers.shift()!; t.fn(); };
  return { nudge, face, fire, timers };
}

test('while he is just waiting he glances to the side now and then and comes back', () => {
  const { nudge, face, fire, timers } = timed();
  nudge.update({ ...base });
  assert.equal(face(), 'resting');
  assert.ok(timers.length >= 1);
  fire();
  assert.equal(face(), 'glance-right');
  fire();
  assert.equal(face(), 'resting');
});

test('a warning that arrives after the first look surprises him for a moment', () => {
  const { nudge, face, fire } = timed();
  nudge.update({ ...base, items: [item()] });
  assert.equal(face(), 'glance-left', 'warnings that were already there do not startle him');
  nudge.update({ ...base, items: [item(), item({ key: 'another|key' })] });
  assert.equal(face(), 'surprised');
  fire();
  assert.equal(face(), 'glance-left');
});

test('without timers he simply stays still', () => {
  const { nudge } = setup();
  nudge.update({ ...base });
  assert.equal(byClass(nudge.el, 'mascot')[0].getAttribute('data-face'), 'resting');
});
