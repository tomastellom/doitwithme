import { createApi } from './api.js';
import { createDom } from './dom.js';
import { createMenu } from './menu.js';
import { GROUP_IDS, weekModel } from './model.js';
import { createNudge } from './nudge.js';
import { buildNudge } from './nudge-model.js';
import { buildHash, resolveRoute, weekParam } from './router.js';
import { createRegistry } from './sections.js';
import { createStore } from './store.js';
import { addDays, currentClock, weekStart } from './time.js';
import { renderWeek } from './week.js';

const STORE_KEY = 'doitwithme.visible';

function loadVisible(win) {
  try {
    const raw = win.localStorage && win.localStorage.getItem(STORE_KEY);
    const ids = raw ? JSON.parse(raw).filter((id) => GROUP_IDS.includes(id)) : [];
    return new Set(ids.length > 0 ? ids : GROUP_IDS);
  } catch {
    return new Set(GROUP_IDS);
  }
}

function saveVisible(win, visible) {
  try {
    if (win.localStorage) win.localStorage.setItem(STORE_KEY, JSON.stringify([...visible]));
  } catch {
    // Storage can be blocked; the choice then simply lasts until the page closes.
  }
}

export function startApp({ root, document, fetch, win, now = () => new Date() }) {
  const dom = createDom(document);
  const { h, clear } = dom;
  const getClock = () => currentClock(now());
  const store = createStore(createApi(fetch), getClock);
  const registry = createRegistry();
  let visible = loadVisible(win);
  let route = { id: 'week', param: null };

  registry.register({ id: 'week', title: 'Week', group: 'views', description: 'Your plan for the week.', primary: true });

  const nudge = createNudge(dom, {
    approve: (date) => store.approve(date),
    undo: (date) => store.undo(date),
    dismiss: (keys) => store.dismiss(keys),
    okay: () => store.clearConfirm(),
    retry: () => store.load(),
  });
  const menu = createMenu(dom, registry, {
    navigate: (id) => navigate(buildHash(id, null)),
    current: () => route.id,
  });
  const main = h('main', { class: 'view', id: 'view' });
  const bar = h('header', { class: 'bar' });
  const menuButton = h('button', { type: 'button', class: 'btn dark mono', onclick: () => menu.open(menuButton) }, 'Menu');
  root.append(h('div', { class: 'app' }, bar, main), nudge.el, menu.el);

  const currentWeek = () => weekStart(weekParam(route.param, getClock().today));

  const actions = {
    toggleGroup(id) {
      const next = new Set(visible);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (next.size === 0) return;
      visible = next;
      saveVisible(win, visible);
      render();
    },
    go: (delta) => navigate(buildHash('week', addDays(currentWeek(), 7 * delta))),
    today: () => navigate(buildHash('week', null)),
    loadExample: () => store.loadExample(),
    focusNudge: () => nudge.focus(),
    get canAdd() {
      return registry.find('setup') !== null;
    },
  };

  function renderBar() {
    const s = store.get();
    clear(bar,
      h('a', { class: 'brand mono', href: '#/week' }, 'doitwithme'),
      h('nav', { class: 'tabs mono', 'aria-label': 'Main' },
        registry.primary().map((section) =>
          h('a', { class: 'tab', href: `#/${section.id}`, 'aria-current': section.id === route.id ? 'page' : null }, section.title))),
      h('div', { class: 'actions' },
        menuButton,
        h('button', { type: 'button', class: 'btn go mono', disabled: s.busy, onclick: () => store.replan() }, s.busy ? 'Replanning' : 'Replan')));
  }

  function renderMain(s) {
    if (s.status === 'loading' && !s.state) return h('p', { class: 'boot mono' }, 'Loading');
    if (!s.state) {
      const offline = s.status === 'offline';
      return h('div', { class: 'state' },
        h('h2', {}, offline ? "I can't reach the planner." : 'Something went wrong.'),
        h('p', {}, offline ? 'The local server is not running. Start it with npm run serve, then press Retry.' : s.error));
    }
    const model = weekModel(s.state, currentWeek(), visible, getClock().today);
    const { needsYou } = buildNudge(s.warnings);
    return renderWeek(dom, { model, visible, needsYou, isEmpty: s.isEmpty }, actions);
  }

  function render() {
    route = resolveRoute(win.location.hash, registry.ids());
    const s = store.get();
    renderBar();
    clear(main, renderMain(s));
    nudge.update({
      status: s.status,
      items: s.isEmpty ? [] : buildNudge(s.warnings).items,
      confirm: s.confirm,
      error: s.error,
      busy: s.busy,
    });
  }

  function navigate(hash) {
    win.location.hash = hash;
    render();
  }

  document.addEventListener('keydown', (e) => {
    const tag = e.target && e.target.tag ? e.target.tag : e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
    if (e.key === '/' && !['input', 'textarea', 'select'].includes(tag) && !menu.isOpen()) {
      e.preventDefault();
      menu.open(menuButton);
    }
  });
  win.addEventListener('hashchange', render);
  store.subscribe(render);
  render();
  store.load();

  return { store, render, navigate, menu, nudge };
}

if (typeof document !== 'undefined' && document.getElementById('app')) {
  const root = document.getElementById('app');
  root.replaceChildren(); // drop the "Loading" placeholder from index.html
  startApp({ root, document, fetch: window.fetch.bind(window), win: window });
}
