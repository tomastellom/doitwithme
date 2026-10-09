import { keysOf } from './nudge-model.js';

const ASK_REPLY = "I can't answer questions yet. That arrives with the AI phase.";

export function createMascot(dom, { eyes = 'center', badge = null, width = 96 } = {}) {
  const { svg } = dom;
  const eye = (x, y, w, h, r) => svg('rect', { class: 'mascot-eye', x, y, width: w, height: h, rx: r });
  const eyeShapes =
    eyes === 'sleepy'
      ? [eye(29, 84, 17, 8, 4), eye(65, 84, 17, 8, 4)]
      : eyes === 'side'
        ? [eye(30, 66, 11, 32, 5.5), eye(66, 66, 11, 32, 5.5)]
        : [eye(36.5, 66, 11, 32, 5.5), eye(72.5, 66, 11, 32, 5.5)];
  return svg(
    'svg',
    { class: 'mascot', width, height: Math.round((width * 4) / 3), viewBox: '0 0 120 160', role: 'img', 'aria-label': 'Nudge, the planner assistant' },
    svg('path', { class: 'mascot-body', d: 'M6 160V62C6 28 32 4 60 4s54 24 54 58v98Z' }),
    ...eyeShapes,
    badge !== null && svg('circle', { class: 'mascot-badge', cx: 100, cy: 22, r: 15 }),
    badge !== null && svg('text', { class: 'mascot-badge-text', x: 100, y: 28, 'text-anchor': 'middle' }, badge),
  );
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

export function createNudge(dom, handlers) {
  const { h, clear } = dom;
  // One live region for the whole life of the component: it is only touched when the
  // spoken message changes, so screen readers announce changes and not every redraw.
  const live = h('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  const body = h('div', { class: 'nudge-body' });
  const el = h('aside', { class: 'nudge', 'aria-label': 'Nudge', tabindex: '-1' }, live, body);
  let view = { status: 'loading', items: [], confirm: null, error: null, busy: false, notice: null };
  let index = 0;
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
    let eyes = 'center';
    let badge = null;
    let width = 96;
    const item = view.items[index];
    if (view.status === 'offline' || view.status === 'error') {
      eyes = 'sleepy';
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
      eyes = 'side';
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
    clear(body, bubble, createMascot(dom, { eyes, badge, width }));
    const spoken = spokenFor(view, item);
    if (spoken !== lastSpoken) {
      lastSpoken = spoken;
      live.textContent = spoken;
    }
  }

  return {
    el,
    update(next) {
      view = { notice: null, ...next };
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
