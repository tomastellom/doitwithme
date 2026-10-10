import { COLOR_GROUPS, DEFAULT_COLORS, PALETTE, applyColors, onColor } from './colors.js';

export const SETTINGS_GROUPS = [
  { id: 'appearance', title: 'Appearance' },
  { id: 'notifications', title: 'Notifications' },
  { id: 'planner', title: 'Planner' },
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
    id: 'theme', group: 'appearance', title: 'Theme',
    description: 'Light is the only theme for now. Dark is planned and will appear here.',
    options: [{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark', disabled: true, tag: 'Later' }],
    read: () => 'light',
    write: null,
  },
  {
    id: 'hours', group: 'appearance', title: 'Calendar hours', hours: true,
    description: 'The hours the Week and the Day show, from the first line to the last. Something planned outside them still appears, and the range stretches to hold it.',
  },
  {
    id: 'colors', group: 'appearance', title: 'Colors', colors: true,
    description: 'A color for each kind of thing, used on the Week, the Day, the Month and the filters. The text on top switches between ink and white by itself. Reset brings back the original.',
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

  function colorsRow(row) {
    const chosen = ui.colors();
    const tick = (hex) => dom.svg('svg', { viewBox: '0 0 14 14', 'aria-hidden': 'true' },
      dom.svg('path', { d: 'M2 7.5 5.5 11 12 3.5', fill: 'none', stroke: onColor(hex), 'stroke-width': '2.4' }));
    return h('div', { class: 'st' },
      h('b', {}, row.title),
      h('p', {}, row.description),
      COLOR_GROUPS.map((g) =>
        h('div', { class: 'clr' },
          h('div', {}, h('b', {}, g.label), h('p', {}, g.note)),
          h('div', { class: 'sws', role: 'group', 'aria-label': `${g.label} color` },
            PALETTE.map((c) => {
              const on = chosen[g.id] === c.id;
              const button = h('button', {
                type: 'button', class: 'pick', 'aria-pressed': String(on), 'aria-label': c.name, title: c.name, 'data-fk': `color-${g.id}-${c.id}`,
                onclick: () => { ui.setColor(g.id, c.id); recolor(); rerender(); },
              }, on && tick(c.hex));
              button.style.background = c.hex;
              return button;
            })),
          h('button', {
            type: 'button', class: 'reset mono', 'data-fk': `color-${g.id}-reset`, disabled: chosen[g.id] === DEFAULT_COLORS[g.id],
            onclick: () => { ui.resetColor(g.id); recolor(); rerender(); },
          }, 'Reset'))));
  }

  // The new colors show at once, without a reload.
  const recolor = () => applyColors(deps.colorTarget, ui.colors());

  function rowEl(row) {
    if (row.colors) return colorsRow(row);
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

  function build() {
    const { route, s } = current;
    const active = SETTINGS_GROUPS.some((g) => g.id === route.param) ? route.param : 'appearance';
    return [
      h('div', { class: 'hero' },
        h('h1', {}, 'Settings'),
        h('div', { class: 'sub mono' }, SETTINGS_GROUPS.map((g) =>
          h('a', { href: `#/settings/${g.id}`, 'data-fk': `set-link-${g.id}`, 'aria-current': g.id === active ? 'page' : null }, g.title)))),
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
