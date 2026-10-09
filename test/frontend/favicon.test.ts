import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { startFavicon, FRAMES } from '../../public/js/favicon.js';

function rig(randoms: number[]) {
  const link: any = { href: '' };
  const timers: Array<{ fn: Function; ms: number }> = [];
  const stop = startFavicon({
    link,
    random: () => randoms.shift() ?? 0,
    setTimer: (fn: Function, ms: number) => { timers.push({ fn, ms }); return timers.length; },
    clearTimer: () => { timers.length = 0; },
    reduceMotion: false,
  });
  const fire = () => timers.shift()!.fn();
  return { link, timers, fire, stop };
}

test('every frame is a real file the app serves, and the page links the resting one', () => {
  for (const f of Object.values(FRAMES)) assert.ok(existsSync(`public${f}`), f);
  assert.match(readFileSync('public/index.html', 'utf8'), /<link rel="icon" type="image\/svg\+xml" href="\/icons\/nudge\.svg">/);
});

test('the icon rests on the centered face, then looks aside or blinks, then comes back', () => {
  const { link, timers, fire } = rig([0.99, 0.1]);
  assert.equal(link.href, FRAMES.rest);
  assert.equal(timers.length, 1);
  fire();
  assert.notEqual(link.href, FRAMES.rest);
  assert.ok([FRAMES.left, FRAMES.right, FRAMES.blink].includes(link.href));
  fire();
  assert.equal(link.href, FRAMES.rest);
  assert.equal(timers.length, 1, 'keeps going');
});

test('a blink is short and a glance lasts longer', () => {
  const blink = rig([0, 0]); blink.fire();
  assert.equal(blink.link.href, FRAMES.blink);
  const blinkMs = blink.timers[0].ms;
  const look = rig([0, 0.99]); look.fire();
  assert.ok(look.timers[0].ms > blinkMs);
});

test('people who reduce motion get a still icon and no timers', () => {
  const link: any = { href: '' };
  const timers: any[] = [];
  startFavicon({ link, random: Math.random, setTimer: (f: Function) => timers.push(f), clearTimer: () => {}, reduceMotion: true });
  assert.equal(link.href, FRAMES.rest);
  assert.equal(timers.length, 0);
});

test('stop cancels the pending timer', () => {
  const { stop, timers } = rig([]);
  stop();
  assert.equal(timers.length, 0);
});
