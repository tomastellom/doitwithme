import { keysOf } from './nudge-model.js';

const ASK_REPLY = "I can't answer questions yet. That arrives with the AI phase.";

const bar = (svg, x, y, w, h, extra = {}) =>
  svg('rect', { class: 'mascot-eye', x, y, width: w, height: h, rx: Math.min(w, h) / 2, ...extra });
const eyePair = (left, right, rotate = 0) => (svg) =>
  [left, right].map((e, i) => {
    const [x, y, w, h] = e;
    return bar(svg, x, y, w, h, rotate ? { transform: `rotate(${i === 0 ? rotate : -rotate} ${x + w / 2} ${y + h / 2})` } : {});
  });
const arc = (svg, x1, x2) => svg('path', { class: 'mascot-arc', d: `M${x1} 92 Q${(x1 + x2) / 2} 68 ${x2} 92` });
const happyEyes = (svg) => [arc(svg, 31, 53), arc(svg, 67, 89)];
const RESTING = [[36.5, 66, 11, 32], [72.5, 66, 11, 32]];
const CONFETTI = [[-14, 20, 'c1', 20], [2, -6, 'c2', -15], [104, -4, 'c3', 30], [128, 28, 'c1', -25], [-20, 70, 'c2', 40], [128, 78, 'c2', 10], [100, -18, 'c1', 55], [14, -22, 'c3', 5]];

// The twelve faces on board R. Every face keeps the same arch; only the eyes and a few plain shapes change.
export const FACES = {
  resting: eyePair(...RESTING),
  'glance-left': eyePair([26, 66, 11, 32], [62, 66, 11, 32]),
  'glance-right': eyePair([47, 66, 11, 32], [83, 66, 11, 32]),
  blink: eyePair([33, 88, 17, 7], [69, 88, 17, 7]),
  happy: happyEyes,
  sleepy: eyePair([29, 84, 17, 8], [65, 84, 17, 8]),
  surprised: eyePair([32, 56, 11, 44], [77, 56, 11, 44]),
  thinking: (svg) => [
    ...eyePair([36.5, 66, 11, 32], [72.5, 80, 11, 14])(svg),
    ...[[124, 50, 4], [135, 37, 5.5], [147, 22, 6.5]].map(([cx, cy, r]) => svg('circle', { class: 'mascot-dot', cx, cy, r })),
  ],
  worried: eyePair(...RESTING, 14),
  working: (svg) => [
    ...eyePair([36.5, 78, 11, 32], [72.5, 78, 11, 32])(svg),
    svg('circle', { class: 'mascot-ring', cx: 140, cy: 40, r: 11 }),
  ],
  celebrating: (svg) => [
    ...happyEyes(svg),
    ...CONFETTI.map(([x, y, tone, r]) => svg('rect', { class: `mascot-confetti ${tone}`, x, y, width: 9, height: 9, transform: `rotate(${r} ${x + 4} ${y + 4})` })),
  ],
  peeking: (svg) => [
    ...eyePair(...RESTING)(svg),
    svg('rect', { class: 'mascot-mask', x: 0, y: 84, width: 120, height: 80 }),
    svg('rect', { class: 'mascot-edge', x: 0, y: 84, width: 120, height: 4 }),
  ],
};

const LEGACY_EYES = { center: 'resting', side: 'glance-left', sleepy: 'sleepy' };

const MORPH_MS = 170;
const FADE_MS = 200;
const ease = (t) => 1 - (1 - t) ** 3;
const isEye = (n) => n.getAttribute('class') === 'mascot-eye';
// Two plain bars can glide into each other; anything else (arcs, dots, confetti) cross-fades.
const barsOnly = (nodes) => nodes.length === 2 && nodes.every(isEye);
const poseOf = (n) => {
  const turn = /rotate\((-?[\d.]+)/.exec(n.getAttribute('transform') ?? '');
  return { x: +n.getAttribute('x'), y: +n.getAttribute('y'), w: +n.getAttribute('width'), h: +n.getAttribute('height'), a: turn ? +turn[1] : 0 };
};

export function createMascot(dom, { face, eyes = 'center', badge = null, width = 96 } = {}) {
  const { svg } = dom;
  let name = face && FACES[face] ? face : LEGACY_EYES[eyes] ?? 'resting';
  const body = svg('path', { class: 'mascot-body', d: 'M6 160V62C6 28 32 4 60 4s54 24 54 58v98Z' });
  const badgeParts = badge === null ? [] : [
    svg('circle', { class: 'mascot-badge', cx: 100, cy: 22, r: 15 }),
    svg('text', { class: 'mascot-badge-text', x: 100, y: 28, 'text-anchor': 'middle' }, badge),
  ];
  const nodes0 = FACES[name](svg);
  let shown = { group: svg('g', { class: 'mascot-face' }, ...nodes0), nodes: nodes0 };
  let stopMotion = null;
  const root = svg(
    'svg',
    { class: 'mascot', 'data-face': name, width, height: Math.round((width * 4) / 3), viewBox: '0 0 120 160', role: 'img', 'aria-label': 'Nudge, the planner assistant' },
    body, shown.group, ...badgeParts,
  );
  const redraw = (...groups) => root.replaceChildren(body, ...groups, ...badgeParts);
  const settle = () => { if (stopMotion) stopMotion(); stopMotion = null; };

  // Changing face never rebuilds the picture: the same bar eyes glide, anything else cross-fades.
  root.setFace = (next, motion = null) => {
    if (!FACES[next] || (next === name && !stopMotion)) return;
    settle();
    name = next;
    root.setAttribute('data-face', next);
    const nodes = FACES[next](svg);
    const group = svg('g', { class: 'mascot-face' }, ...nodes);
    const old = shown;
    if (motion && motion.raf && barsOnly(old.nodes) && barsOnly(nodes)) {
      const from = old.nodes.map(poseOf);
      const to = nodes.map(poseOf);
      let t0 = null;
      let id = null;
      const frame = (ts) => {
        if (t0 === null) t0 = ts;
        const t = Math.min(1, (ts - t0) / MORPH_MS);
        if (t >= 1) {
          stopMotion = null;
          shown = { group, nodes };
          redraw(group);
          return;
        }
        const k = ease(t);
        old.nodes.forEach((n, i) => {
          const f = from[i];
          const g = to[i];
          const at = (a, b) => a + (b - a) * k;
          const [x, y, w, h, a] = [at(f.x, g.x), at(f.y, g.y), at(f.w, g.w), at(f.h, g.h), at(f.a, g.a)];
          n.setAttribute('x', x);
          n.setAttribute('y', y);
          n.setAttribute('width', w);
          n.setAttribute('height', h);
          n.setAttribute('rx', Math.min(w, h) / 2);
          if (a) n.setAttribute('transform', `rotate(${a} ${x + w / 2} ${y + h / 2})`);
          else n.removeAttribute('transform');
        });
        id = motion.raf(frame);
      };
      stopMotion = () => { if (motion.cancel && id !== null) motion.cancel(id); };
      id = motion.raf(frame);
      return;
    }
    shown = { group, nodes };
    if (motion && motion.setTimer) {
      old.group.setAttribute('class', 'mascot-face out');
      group.setAttribute('class', 'mascot-face in');
      redraw(old.group, group);
      const done = () => { stopMotion = null; group.setAttribute('class', 'mascot-face'); redraw(group); };
      const timer = motion.setTimer(done, FADE_MS);
      stopMotion = () => { if (motion.clearTimer) motion.clearTimer(timer); done(); };
      return;
    }
    redraw(group);
  };
  root.setBadge = (text) => {
    const label = badgeParts[1];
    if (label && text !== null) label.textContent = String(text);
  };
  // A click makes it blink once; the animation clears the class when it ends.
  root.addEventListener('click', () => root.setAttribute('class', 'mascot blinking'));
  root.addEventListener('animationend', () => root.setAttribute('class', 'mascot'));
  return root;
}

// Which face fits the moment. The order matters: trouble first, then busy, then news, then calm.
export function faceFor(view) {
  if (view.status === 'offline' || view.status === 'error') return 'sleepy';
  if (view.confirm) return view.confirm.used ? 'happy' : 'resting';
  if (view.busy) return 'working';
  if (view.estimating) return 'thinking';
  if (view.surprised) return 'surprised';
  if (view.items.length > 0) {
    // A deadline that nothing can cover is a worry; a missing address or a tight trip is something to think over.
    const shortfalls = view.items.filter((i) => i.category !== 'travel');
    if (shortfalls.some((i) => !i.offer)) return 'worried';
    return shortfalls.length > 0 ? 'glance-left' : 'thinking';
  }
  if (view.notice) return 'resting';
  if (view.celebrate) return 'celebrating';
  if (view.glance) return `glance-${view.glance}`;
  return 'resting';
}

function spokenFor(view, item) {
  if (view.status === 'offline') return "I can't reach the planner.";
  if (view.status === 'error') return 'Something went wrong.';
  if (view.confirm) {
    const c = view.confirm;
    return c.used ? `Done. ${c.weekday} evening is in your plan.` : `${c.weekday} evening is open.`;
  }
  if (view.notice) return view.notice;
  if (item) return item.headline;
  return view.status === 'loading' ? '' : 'All clear.';
}

export function createNudge(dom, handlers, env = {}) {
  const { h, clear } = dom;
  // One live region for the whole life of the component: it is only touched when the
  // spoken message changes, so screen readers announce changes and not every redraw.
  const live = h('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  const body = h('div', { class: 'nudge-body' });
  const el = h('aside', { class: 'nudge', 'aria-label': 'Nudge', tabindex: '-1' }, live, body);
  let view = { status: 'loading', items: [], confirm: null, error: null, busy: false, notice: null };
  let index = 0;
  let glance = null;
  let surprised = false;
  let prevKeys = null;
  let glanceTimer = null;
  let surpriseTimer = null;
  let wasAttention = false;
  let holding = false;
  let mascot = null;
  let mascotKey = '';
  // Timers are optional: without them Nudge simply keeps one face for each situation.
  const animated = typeof env.setTimer === 'function' && !env.reduceMotion;
  let askMessage = null;
  let draft = '';
  let signature = '';
  let lastSpoken = null;

  const button = (label, onclick, cls, fk) =>
    h('button', { type: 'button', class: cls, 'data-fk': fk, onclick, disabled: view.busy }, label);

  const say = (...children) => h('div', { class: 'say' }, ...children);

  function speaking() {
    const item = view.items[index];
    const many = view.items.length > 1;
    const reply = h('p', { class: 'reply' }, askMessage);
    const input = h('input', {
      type: 'text', 'aria-label': 'Ask Nudge', placeholder: 'Ask me to move something', 'data-fk': 'nudge-ask', value: draft,
      oninput: (e) => { draft = e.target.value; },
    });
    const form = h('form', { class: 'ask', onsubmit: (e) => {
      e.preventDefault();
      askMessage = ASK_REPLY;
      reply.textContent = askMessage;
      draft = '';
      input.value = '';
    } }, input);
    return say(
      h('div', { class: 'pager' },
        h('span', { class: 'mono k' }, many ? `Nudge / ${index + 1} of ${view.items.length}` : 'Nudge'),
        many && h('div', { class: 'pg' },
          h('button', { type: 'button', 'data-fk': 'nudge-prev', 'aria-label': 'Previous warning', onclick: () => { index = (index + view.items.length - 1) % view.items.length; render(); } }, '<'),
          h('button', { type: 'button', 'data-fk': 'nudge-next', 'aria-label': 'Next warning', onclick: () => { index = (index + 1) % view.items.length; render(); } }, '>')),
      ),
      h('b', {}, item.headline),
      item.offer && h('p', {}, item.offer.line),
      view.notice && h('p', { class: 'notice' }, view.notice),
      h('div', { class: 'acts' },
        item.offer && button(item.offer.button, () => handlers.approve(item.offer.date), 'y', 'nudge-use'),
        button('Leave it', () => handlers.dismiss(keysOf(item)), '', 'nudge-leave'),
      ),
      form,
      reply,
    );
  }

  function render() {
    let bubble = null;
    let badge = null;
    let width = 96;
    const item = view.items[index];
    if (view.status === 'offline' || view.status === 'error') {
      badge = '!';
      const offline = view.status === 'offline';
      bubble = say(
        h('span', { class: 'mono k' }, 'Nudge'),
        h('b', {}, offline ? "I can't reach the planner." : 'Something went wrong.'),
        h('p', {}, offline ? 'The local server is not running. Start it with npm run serve, then try again. Nothing was lost.' : view.error),
        h('div', { class: 'acts' }, button('Retry', () => handlers.retry(), 'y', 'nudge-retry')),
      );
    } else if (view.confirm) {
      const c = view.confirm;
      bubble = say(
        h('span', { class: 'mono k' }, 'Nudge'),
        h('b', {}, c.used ? `Done. ${c.weekday} evening is in your plan.` : `${c.weekday} evening is open.`),
        h('p', {}, c.used ? `${c.minutes} min of ${c.titles.join(', ')} moved in. You can take it back.` : 'Nothing needed it, so your plan did not change. You can take it back.'),
        h('div', { class: 'acts' }, button('Okay', () => handlers.okay(), 'y', 'nudge-okay'), button('Undo', () => handlers.undo(c.date), '', 'nudge-undo')),
      );
    } else if (view.items.length > 0) {
      badge = String(view.items.length);
      width = 124;
      bubble = speaking();
    } else if (view.notice) {
      bubble = say(
        h('span', { class: 'mono k' }, 'Nudge'),
        h('p', {}, view.notice),
        h('div', { class: 'acts' }, button('Okay', () => handlers.okay(), 'y', 'nudge-okay')),
      );
    } else if (view.status === 'loading') {
      bubble = h('div', { class: 'quiet' }, h('span', { class: 'mono' }, 'Loading'));
    } else {
      bubble = h('div', { class: 'quiet' }, h('b', {}, 'All clear.'), h('span', { class: 'mono' }, 'No open warnings'));
    }
    // With nothing to say Nudge rests out of sight; it comes out on its own for anything that needs you.
    const attention = view.status === 'offline' || view.status === 'error' || Boolean(view.confirm) || view.items.length > 0 || Boolean(view.notice);
    el.setAttribute('data-state', attention ? 'alert' : 'resting');
    if (attention) body.removeAttribute('aria-hidden');
    else body.setAttribute('aria-hidden', 'true');
    const spoken = spokenFor(view, item);
    if (spoken !== lastSpoken) {
      lastSpoken = spoken;
      live.textContent = spoken;
    }
    // While he slides out of sight he keeps the face and words he had; the calm ones come after.
    if (holding && !attention) return;
    holding = false;
    const face = faceFor({ ...view, glance, surprised });
    const key = `${width}|${badge !== null}`;
    if (mascot === null || key !== mascotKey) {
      mascot = createMascot(dom, { face, badge, width });
      mascotKey = key;
    } else {
      mascot.setFace(face, animated && env.raf ? { raf: env.raf, cancel: env.cancelRaf, setTimer: env.setTimer, clearTimer: env.clearTimer } : null);
      if (badge !== null) mascot.setBadge(badge);
    }
    clear(body, bubble, mascot);
  }

  function release() {
    if (!holding) return;
    holding = false;
    render();
  }
  body.addEventListener('transitionend', release);
  // Pressing on him while he rests must not give the corner keyboard focus, or he would stay up until you click elsewhere.
  el.addEventListener('mousedown', (e) => {
    if (el.getAttribute('data-state') === 'resting') e.preventDefault();
  });

  function stopGlance() {
    if (glanceTimer !== null) env.clearTimer(glanceTimer);
    glanceTimer = null;
    glance = null;
  }

  // While he only waits, he looks to one side now and then, then back.
  function armGlance() {
    if (!animated || glanceTimer !== null) return;
    glanceTimer = env.setTimer(() => {
      glance = env.random() < 0.5 ? 'left' : 'right';
      render();
      glanceTimer = env.setTimer(() => {
        glanceTimer = null;
        glance = null;
        render();
        armGlance();
      }, 1200);
    }, 4000 + env.random() * 5000);
  }

  function startle(keys) {
    if (prevKeys !== null && keys.some((k) => !prevKeys.includes(k))) {
      surprised = true;
      if (surpriseTimer !== null) env.clearTimer(surpriseTimer);
      surpriseTimer = env.setTimer(() => {
        surprised = false;
        surpriseTimer = null;
        render();
      }, 2500);
    }
    prevKeys = keys;
  }

  return {
    el,
    update(next) {
      view = { notice: null, ...next };
      const attentionNow = view.status === 'offline' || view.status === 'error' || Boolean(view.confirm) || view.items.length > 0 || Boolean(view.notice);
      if (animated && wasAttention && !attentionNow) {
        holding = true;
        env.setTimer(release, 400);
      }
      wasAttention = attentionNow;
      if (animated) {
        if (view.status === 'ready') startle(view.items.map((i) => i.key));
        else prevKeys = null;
        const attention = view.status === 'offline' || view.status === 'error' || Boolean(view.confirm) || view.items.length > 0 || Boolean(view.notice);
        if (attention) stopGlance();
        else armGlance();
      }
      const sig = JSON.stringify([view.status, view.items.map((i) => i.key), view.confirm, view.error]);
      if (sig !== signature) {
        signature = sig;
        askMessage = null;
      }
      if (index >= view.items.length) index = 0;
      render();
    },
    focus: () => el.focus(),
  };
}
