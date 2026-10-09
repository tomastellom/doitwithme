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

export function createNudge(dom, handlers) {
  const { h, clear } = dom;
  const el = h('aside', { class: 'nudge', 'aria-label': 'Nudge', tabindex: '-1' });
  let view = { status: 'loading', items: [], confirm: null, error: null, busy: false };
  let index = 0;
  let askMessage = null;
  let signature = '';

  const button = (label, onclick, cls = '', extra = {}) =>
    h('button', { type: 'button', class: cls, onclick, disabled: view.busy, ...extra }, label);

  function say(...children) {
    return h('div', { class: 'say', 'aria-live': 'polite' }, ...children);
  }

  function speaking() {
    const item = view.items[index];
    const many = view.items.length > 1;
    const reply = h('p', { class: 'reply' }, askMessage);
    const input = h('input', { type: 'text', 'aria-label': 'Ask Nudge', placeholder: 'Ask me to move something' });
    const form = h('form', { class: 'ask', onsubmit: (e) => {
      e.preventDefault();
      askMessage = ASK_REPLY;
      reply.textContent = askMessage;
      input.value = '';
    } }, input);
    return say(
      h('div', { class: 'pager' },
        h('span', { class: 'mono k' }, many ? `Nudge / ${index + 1} of ${view.items.length}` : 'Nudge'),
        many && h('div', { class: 'pg' },
          h('button', { type: 'button', 'aria-label': 'Previous warning', onclick: () => { index = (index + view.items.length - 1) % view.items.length; render(); } }, '<'),
          h('button', { type: 'button', 'aria-label': 'Next warning', onclick: () => { index = (index + 1) % view.items.length; render(); } }, '>')),
      ),
      h('b', {}, item.headline),
      item.offer && h('p', {}, item.offer.line),
      h('div', { class: 'acts' },
        item.offer && button(item.offer.button, () => handlers.approve(item.offer.date), 'y'),
        button('Leave it', () => handlers.dismiss(keysOf(item))),
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
    if (view.status === 'offline' || view.status === 'error') {
      eyes = 'sleepy';
      badge = '!';
      const offline = view.status === 'offline';
      bubble = say(
        h('span', { class: 'mono k' }, 'Nudge'),
        h('b', {}, offline ? "I can't reach the planner." : 'Something went wrong.'),
        h('p', {}, offline ? 'The local server is not running. Start it with npm run serve, then try again. Nothing was lost.' : view.error),
        h('div', { class: 'acts' }, button('Retry', () => handlers.retry(), 'y')),
      );
    } else if (view.confirm) {
      const c = view.confirm;
      bubble = say(
        h('span', { class: 'mono k' }, 'Nudge'),
        h('b', {}, c.used ? `Done. ${c.weekday} evening is in your plan.` : `${c.weekday} evening is open.`),
        h('p', {}, c.used ? `${c.minutes} min of ${c.titles.join(', ')} moved in. You can take it back.` : 'Nothing needed it, so your plan did not change. You can take it back.'),
        h('div', { class: 'acts' }, button('Okay', () => handlers.okay(), 'y'), button('Undo', () => handlers.undo(c.date))),
      );
    } else if (view.items.length > 0) {
      eyes = 'side';
      badge = String(view.items.length);
      width = 124;
      bubble = speaking();
    } else if (view.status === 'loading') {
      bubble = h('div', { class: 'quiet' }, h('span', { class: 'mono' }, 'Loading'));
    } else {
      bubble = h('div', { class: 'quiet' }, h('b', {}, 'All clear.'), h('span', { class: 'mono' }, 'No open warnings this week'));
    }
    clear(el, bubble, createMascot(dom, { eyes, badge, width }));
  }

  return {
    el,
    update(next) {
      view = next;
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
