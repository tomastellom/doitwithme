import { createApi } from './api.js';
import { createDom } from './dom.js';
import { startFavicon } from './favicon.js';
import { createFocusKeeper } from './focus.js';
import { createMenu } from './menu.js';
import { GROUP_IDS, weekModel } from './model.js';
import { createNudge } from './nudge.js';
import { buildNudge } from './nudge-model.js';
import { buildHash, resolveRoute, weekParam } from './router.js';
import { createRegistry } from './sections.js';
import { createStore } from './store.js';
import { addDays, currentClock, weekStart } from './time.js';
import { createSetup } from './setup.js';
import { renderWeek } from './week.js';

const STORE_KEY = 'doitwithme.visible';
const RENDER_FAILED = 'Something unexpected happened. Reload the page.';

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
  let lastDay = getClock().today;

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
  const menuButton = h('button', { type: 'button', class: 'btn dark mono', 'data-fk': 'menu', onclick: () => menu.open(menuButton) }, 'Menu');
  root.append(h('div', { class: 'app' }, bar, main), nudge.el, menu.el);

  const focus = createFocusKeeper({ document, getRoot: () => root, fallback: () => nudge.focus() });
  const keepFocus = (fn) => {
    const key = focus.capture();
    fn();
    focus.restore(key);
  };

  const currentWeek = () => weekStart(weekParam(route.param, getClock().today));

  const weekActions = {
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

  registry.register({
    id: 'week', title: 'Week', group: 'views', description: 'Your plan for the week.', primary: true,
    render: (ctx) => {
      const model = weekModel(ctx.s.state, currentWeek(), visible, getClock().today);
      const { needsYou } = buildNudge(ctx.s.warnings);
      return renderWeek(dom, { model, visible, needsYou, isEmpty: ctx.s.isEmpty }, weekActions);
    },
  });

  const setup = createSetup(dom, { store, getClock, navigate, keepFocus });
  const setupPage = (kindId) => (ctx) => setup.render(kindId, ctx);
  registry.register({
    id: 'setup', title: 'Setup', group: 'setup', primary: true, inMenu: false,
    activeFor: ['commitments', 'tasks', 'due-dates', 'preferences'], render: setupPage('commitments'),
  });
  registry.register({ id: 'commitments', title: 'Commitments', group: 'setup', description: 'What is fixed.', render: setupPage('commitments') });
  registry.register({ id: 'tasks', title: 'Tasks', group: 'setup', description: 'What needs time but no fixed slot.', render: setupPage('tasks') });
  registry.register({ id: 'due-dates', title: 'Due dates', group: 'setup', description: 'When things are due and how much effort they need.', render: setupPage('due-dates') });
  registry.register({ id: 'preferences', title: 'Preferences', group: 'setup', description: 'Windows, breaks and days off.', render: setupPage('preferences') });

  function renderBar() {
    const s = store.get();
    clear(bar,
      h('a', { class: 'brand mono', href: '#/week', 'data-fk': 'brand' }, 'doitwithme'),
      h('nav', { class: 'tabs mono', 'aria-label': 'Main' },
        registry.primary().map((section) => {
          const current = section.id === route.id || section.activeFor.includes(route.id);
          return h('a', { class: 'tab', href: `#/${section.id}`, 'data-fk': `tab-${section.id}`, 'aria-current': current ? 'page' : null }, section.title);
        })),
      h('div', { class: 'actions' },
        menuButton,
        h('button', { type: 'button', class: 'btn go mono', 'data-fk': 'replan', disabled: s.busy || s.status !== 'ready', onclick: () => store.replan() }, 'Replan')));
  }

  function renderMain(s) {
    if (s.status === 'loading' && !s.state) return h('p', { class: 'boot mono' }, 'Loading');
    if (!s.state) {
      const offline = s.status === 'offline';
      return h('div', { class: 'state' },
        h('h2', {}, offline ? "I can't reach the planner." : 'Something went wrong.'),
        h('p', {}, offline ? 'The local server is not running. Start it with npm run serve, then press Retry.' : s.error));
    }
    const section = registry.find(route.id);
    return section.render({ dom, store, s, route, getClock, navigate, keepFocus, registry });
  }

  function draw() {
    route = resolveRoute(win.location.hash, registry.ids());
    const s = store.get();
    renderBar();
    clear(main, renderMain(s));
    nudge.update({
      status: s.status,
      items: s.isEmpty || !s.state ? [] : buildNudge(s.warnings).items,
      confirm: s.confirm,
      error: s.error,
      busy: s.busy,
      notice: s.notice,
    });
  }

  function render() {
    const key = focus.capture();
    try {
      draw();
    } catch {
      // A bug while drawing must never leave a blank page.
      clear(main, h('div', { class: 'state' }, h('h2', {}, 'Something went wrong.'), h('p', {}, RENDER_FAILED)));
    }
    focus.restore(key);
  }

  function navigate(hash) {
    win.location.hash = hash;
    render();
  }

  document.addEventListener('keydown', (e) => {
    const tag = ((e.target && (e.target.tagName || e.target.tag)) || '').toLowerCase();
    if (e.key === '/' && !['input', 'textarea', 'select'].includes(tag) && !menu.isOpen()) {
      e.preventDefault();
      menu.open(menuButton);
    }
  });
  win.addEventListener('hashchange', render);
  // A page left open overnight must not keep planning for yesterday.
  const refreshIfNewDay = () => {
    if (document.visibilityState === 'hidden') return;
    const day = getClock().today;
    if (day !== lastDay) {
      lastDay = day;
      store.load();
    }
  };
  document.addEventListener('visibilitychange', refreshIfNewDay);
  win.addEventListener('focus', refreshIfNewDay);
  store.subscribe(render);
  render();
  store.load();

  return { store, render, navigate, menu, nudge };
}

if (typeof document !== 'undefined' && document.getElementById('app')) {
  const root = document.getElementById('app');
  root.replaceChildren(); // drop the "Loading" placeholder from index.html
  startApp({ root, document, fetch: window.fetch.bind(window), win: window });
  const link = document.querySelector('link[rel="icon"]');
  if (link) {
    startFavicon({
      link,
      random: Math.random,
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (id) => window.clearTimeout(id),
      reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    });
  }
}
