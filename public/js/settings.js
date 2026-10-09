export const SETTINGS_GROUPS = [
  { id: 'appearance', title: 'Appearance' },
  { id: 'notifications', title: 'Notifications' },
  { id: 'planner', title: 'Planner' },
];

const permissionHint = (ctx) => {
  const p = ctx.ui.permission();
  if (p === 'unsupported') return 'This browser cannot show notifications';
  if (p === 'denied') return "Notifications are blocked. Allow them in your browser's site settings, then try again.";
  return 'Your browser will ask for permission';
};

export const SETTINGS = [
  {
    id: 'theme', group: 'appearance', title: 'Theme',
    description: 'Light is the only theme for now. Dark is planned and will appear here.',
    options: [{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark', disabled: true, tag: 'Later' }],
    read: () => 'light',
    write: null,
  },
  {
    id: 'notifications', group: 'notifications', title: 'System notifications',
    description: 'A browser notification when a new warning appears while this tab is hidden. Nothing is sent when the app is closed.',
    options: [{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }],
    read: (ctx) => (ctx.ui.notify() ? 'on' : 'off'),
    disabledValues: (ctx) => (ctx.ui.supported() ? [] : ['on']),
    write: async (ctx, value) => {
      if (value === 'on') await ctx.ui.enableNotify();
      else ctx.ui.disableNotify();
    },
    hint: permissionHint,
  },
  {
    id: 'softMode', group: 'planner', title: 'Soft time',
    description: 'Friday and Saturday evenings. Ask first keeps them free until you say yes. Automatic uses them for study as a last resort and tells you.',
    options: [{ value: 'ask', label: 'Ask first' }, { value: 'auto', label: 'Automatic' }],
    read: (ctx) => ctx.s.state.preferences.softMode,
    write: (ctx, value) =>
      ctx.store.saveState((fresh) => ({ ...fresh, preferences: { ...fresh.preferences, softMode: value } })),
  },
];

export function createSettings(dom, deps) {
  const { h, clear } = dom;
  const { store, ui, keepFocus } = deps;
  let container = null;
  let current = null;

  const ctxOf = () => ({ s: store.get(), store, ui });

  function rerender() {
    current = { ...current, s: store.get() };
    keepFocus(() => clear(container, build()));
  }

  async function choose(row, value) {
    if (!row.write || row.read(ctxOf()) === value) return;
    await row.write(ctxOf(), value);
    rerender();
  }

  function rowEl(row) {
    const ctx = ctxOf();
    const value = row.read(ctx);
    const off = row.disabledValues ? row.disabledValues(ctx) : [];
    const busy = ctx.s.busy;
    return h('div', { class: 'st' },
      h('b', {}, row.title),
      h('p', {}, row.description),
      h('div', { class: 'seg mono', role: 'group', 'aria-label': row.title },
        row.options.map((o) =>
          h('button', {
            type: 'button', class: value === o.value ? 'on' : '', 'aria-pressed': String(value === o.value),
            'data-fk': `set-${row.id}-${o.value}`, disabled: Boolean(o.disabled) || off.includes(o.value) || busy,
            onclick: () => choose(row, o.value),
          }, o.label, o.tag && h('span', { class: 'tag' }, o.tag)))),
      row.hint && h('div', { class: 'hint mono' }, row.hint(ctx)));
  }

  function build() {
    const { route, s } = current;
    const active = SETTINGS_GROUPS.some((g) => g.id === route.param) ? route.param : 'appearance';
    return [
      h('div', { class: 'hero' },
        h('h1', {}, 'Settings'),
        h('div', { class: 'sub mono' }, SETTINGS_GROUPS.map((g) =>
          h('a', { href: `#/settings/${g.id}`, 'aria-current': g.id === active ? 'page' : null }, g.title)))),
      s.formError && h('div', { class: 'err st-err', role: 'alert' }, h('b', {}, 'Nothing was saved.'), h('span', { class: 'mono msg' }, s.formError)),
      h('div', { class: 'st-groups' }, SETTINGS_GROUPS.map((g) =>
        h('div', { class: 'st-grp' },
          h('span', { class: 'mono st-gh' }, g.title),
          h('div', { class: 'st-rows' }, SETTINGS.filter((r) => r.group === g.id).map(rowEl))))),
    ];
  }

  return {
    render(ctx) {
      current = ctx;
      container = h('section', { class: 'settings' });
      clear(container, build());
      return container;
    },
  };
}
