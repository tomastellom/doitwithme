export const FRAMES = {
  rest: '/icons/nudge.svg',
  left: '/icons/nudge-left.svg',
  right: '/icons/nudge-right.svg',
  blink: '/icons/nudge-blink.svg',
};

const BLINK_MS = 160;
const LOOK_MS = 1400;

// Nudge's face in the tab: mostly resting, sometimes a glance to the side or a blink.
export function startFavicon({ link, random, setTimer, clearTimer, reduceMotion }) {
  link.href = FRAMES.rest;
  if (reduceMotion) return () => {};
  let timer = null;
  const wait = (fn, ms) => { timer = setTimer(fn, ms); };
  const idle = () => wait(act, 5000 + random() * 8000);
  const act = () => {
    const blink = random() < 0.35;
    link.href = blink ? FRAMES.blink : random() < 0.5 ? FRAMES.left : FRAMES.right;
    wait(() => { link.href = FRAMES.rest; idle(); }, blink ? BLINK_MS : LOOK_MS);
  };
  idle();
  return () => { if (timer !== null) clearTimer(timer); timer = null; };
}
