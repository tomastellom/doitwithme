export const SETTINGS_GROUPS = [
  { id: 'calendar', title: 'Calendar' },
  { id: 'look', title: 'Look' },
  { id: 'notifications', title: 'Notifications' },
  { id: 'planner', title: 'How I plan' },
];

const permissionHint = (ctx) => {
  const p = ctx.ui.permission();
  if (p === 'unsupported') return 'This browser cannot show notifications';
  if (p === 'denied') return "Notifications are blocked. Allow them in your browser's site settings, then try again.";
  if (p === 'granted') return 'Allowed in this browser';
  return 'Your browser will ask for permission';
};

export const SETTINGS = [
  {
    id: 'theme', group: 'look', title: 'Theme',
    description: 'Light is the only theme for now. Dark is planned and will appear here.',
    options: [{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark', disabled: true, tag: 'Later' }],
    read: () => 'light',
    write: null,
  },
  {
    id: 'hours', group: 'calendar', title: 'Calendar hours', hours: true,
    description: 'The hours the Week and the Day show, from the first line to the last. Something planned outside them still appears, and the range stretches to hold it.',
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

  const clock = (hr) => `${String(hr % 24).padStart(2, '0')}:00`;

  function hoursRow(row) {
    const range = ui.hours();
    const make = (id, label, lo, hi, value, apply) => {
      const options = [];
      for (let hr = lo; hr <= hi; hr++) options.push(h('option', { value: String(hr) }, clock(hr)));
      const select = h('select', { 'aria-label': label, 'data-fk': `set-hours-${id}`, onchange: () => { apply(Number(select.value)); rerender(); } }, options);
      select.value = String(value);
      return h('label', { class: 'hrs' }, h('span', { class: 'mono' }, label), select);
    };
    return h('div', { class: 'st' },
      h('b', {}, row.title),
      h('p', {}, row.description),
      h('div', { class: 'hrs-row' },
        make('from', 'From', 0, range.to - 4, range.from, (v) => ui.setHours(v, range.to)),
        make('to', 'To', range.from + 4, 24, range.to, (v) => ui.setHours(range.from, v))));
  }

  function rowEl(row) {
    if (row.hours) return hoursRow(row);
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

  const column = (ids) =>
    SETTINGS_GROUPS.filter((g) => ids.includes(g.id)).map((g) =>
      h('div', { class: 'st-grp' },
        h('span', { class: 'mono st-gh' }, g.title),
        h('div', { class: 'st-rows' },
          SETTINGS.filter((r) => r.group === g.id).map(rowEl),
          // The planning rules (windows, breaks, days off) live here too, so how I plan is in one place.
          g.id === 'planner' && deps.setup && h('div', { class: 'st-rules' },
            h('b', {}, 'Planning rules'),
            h('p', {}, 'When I may plan, how long breaks are, and which days stay light.'),
            deps.setup.renderEmbedded('preferences', { s: current.s, route: current.route })))));

  function build() {
    const { s } = current;
    return [
      h('div', { class: 'hero' }, h('h1', {}, 'Settings')),
      s.formError && h('div', { class: 'err st-err', role: 'alert' }, h('b', {}, 'Nothing was saved.'), h('span', { class: 'mono msg' }, s.formError)),
      h('div', { class: 'st-two' },
        h('div', { class: 'st-col' }, column(['calendar', 'look', 'notifications'])),
        h('div', { class: 'st-col' }, column(['planner']))),
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
