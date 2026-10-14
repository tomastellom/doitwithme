import { lookClass, paint } from './labels.js';

// Where each screen sits in the sidebar. Titles come from the registry, so renaming a screen renames its link.
export const SIDE_GROUPS = [
  { title: 'Plan', ids: ['week', 'day', 'month', 'deadlines'] },
  { title: 'What goes in', ids: ['commitments', 'tasks', 'due-dates'] },
  { title: 'Details', ids: ['labels', 'places', 'commutes'] },
  { title: null, ids: ['settings'] },
];

export function createSidebar(dom, registry, handlers) {
  const { h, clear } = dom;
  const el = h('aside', { class: 'side', 'aria-label': 'Main' });
  let view = { routeId: 'week', labels: [], hiddenCount: 0, busy: false, ready: false };
  let firstLink = null;

  const isCurrent = (section) => section.id === view.routeId || (section.activeFor ?? []).includes(view.routeId);

  function link(section) {
    const on = isCurrent(section);
    const a = h('a', {
      class: on ? 'sl on' : 'sl', href: `#/${section.id}`, 'data-fk': `side-${section.id}`, 'aria-current': on ? 'page' : null,
      onclick: () => handlers.picked(),
    }, section.title);
    if (firstLink === null) firstLink = a;
    return a;
  }

  function group(g) {
    const sections = g.ids.map((id) => registry.find(id)).filter(Boolean);
    if (sections.length === 0) return null;
    return h('nav', { class: 'sg', 'aria-label': g.title ?? 'Settings' }, g.title && h('span', { class: 'mono sgh' }, g.title), sections.map(link));
  }

  function labelButton(l) {
    const sw = h('i', { class: `sw ${lookClass(l.look)}` });
    paint(sw, l.color, l.look);
    return h('button', { type: 'button', class: 'fl', 'data-fk': `fl-${l.id}`, 'aria-pressed': String(!l.hidden), onclick: () => handlers.toggleLabel(l.id) },
      sw, h('span', { class: 'nm' }, l.name), typeof l.count === 'number' && h('span', { class: 'ct' }, l.count));
  }

  function build() {
    firstLink = null;
    const labels = view.labels.length > 0 && h('div', { class: 'sg labels' },
      h('span', { class: 'mono sgh' }, 'Labels'),
      view.labels.map(labelButton),
      view.hiddenCount > 0 && h('button', { type: 'button', class: 'fl-all mono', 'data-fk': 'fl-all', onclick: () => handlers.showAll() }, 'Show all'));
    return [
      h('a', { class: 'brand', href: '#/week', 'data-fk': 'brand', onclick: () => handlers.picked() }, 'doitwithme'),
      h('button', { type: 'button', class: 'newb', 'data-fk': 'new', onclick: () => handlers.newThing() }, '+ New'),
      SIDE_GROUPS.map(group),
      labels,
      h('button', { type: 'button', class: 'replan', 'data-fk': 'replan', disabled: view.busy || !view.ready, onclick: () => handlers.replan() }, 'Replan'),
    ];
  }

  function draw() {
    clear(el, build());
  }
  draw();

  return {
    el,
    update(next) {
      view = { ...view, ...next };
      draw();
    },
    // Where focus goes when something that opened from here closes.
    focus() {
      if (firstLink && typeof firstLink.focus === 'function') firstLink.focus();
    },
  };
}
