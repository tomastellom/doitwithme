import { itemKey } from './model.js';
import { lookClass, paintTile } from './labels.js';
import { duration, hhmm } from './time.js';
import { STATUS_WORDS, TAG, statusClass, tickButton } from './status-ui.js';
import { DEFAULT_HOURS, axisEl, bodyEl, hoursFor } from './timegrid.js';

export function renderWeek(dom, view, actions) {
  const { h } = dom;
  const { model, needsYou, isEmpty, travelOff } = view;

  const label = (item) => `${item.kind === 'travel' ? `Commute ${item.end - item.start}` : item.title}, ${hhmm(item.start)}–${hhmm(item.end)}, ${item.label}${item.status ? `, ${STATUS_WORDS[item.status]}` : ''}. Opens the editor.`;
  const open = (item) => ({ type: 'button', 'data-fk': `blk-${itemKey(item)}`, 'aria-label': label(item), onclick: () => actions.open(item) });
  // A tile says as much as its height allows, and always the full text on hover and to screen readers.
  const block = (item, size) => {
    const travel = item.kind === 'travel';
    const name = travel ? `Commute ${item.end - item.start}` : item.title;
    const time = `${hhmm(item.start)}–${hhmm(item.end)}`;
    const off = item.status === 'missed' || item.status === 'waived';
    // A tile that was not done says so in a tag instead of its time.
    const when = off ? h('span', { class: 'tag' }, TAG[item.status]) : h('span', { class: 't' }, size === 'one' ? hhmm(item.start) : time);
    const lines = size === 'one' || size === 'two'
      ? [h('span', { class: 'n' }, name), when]
      : [h('span', { class: 'k' }, item.label), h('span', { class: 'n' }, name), when];
    const classes = ['blk', 'tile', size, travel ? 'travel' : lookClass(item.look), travel ? '' : 'has-tick', statusClass(item.status)].filter(Boolean).join(' ');
    const node = h('button', { ...open(item), class: classes, title: `${name}, ${time}` }, lines);
    if (!travel && !off) paintTile(node, item.color, item.look, { done: item.status === 'done' });
    return node;
  };

  const hours = hoursFor(view.hours ?? DEFAULT_HOURS, model.days.flatMap((d) => d.items));
  const day = (d) =>
    h('div', { class: d.isToday ? 'day today' : 'day', role: 'group', 'aria-label': `${d.weekday} ${d.num}` },
      h('a', { class: 'dh', href: `#/day/${d.date}`, 'data-fk': `dh-${d.date}`, 'aria-label': `Open ${d.weekday} ${d.num}` }, h('span', { class: 'mono' }, d.weekday), h('span', { class: 'dd' }, d.num)),
      h('p', { class: 'booked mono' }, isEmpty ? '' : `Booked ${duration(d.booked)}`),
      bodyEl(dom, { items: d.items, hours, nowMinutes: d.isToday ? view.nowMinutes ?? null : null, tileFor: block, tickFor: actions.tick ? (item) => (item.kind === 'travel' ? null : tickButton(dom, item, item.title, actions.tick)) : null, onBlank: actions.add ? (minutes) => actions.add(d.date, minutes) : null }));

  const status = needsYou > 0
    ? h('button', { type: 'button', class: 'needs mono', 'data-fk': 'needs', onclick: () => actions.focusNudge() }, `${needsYou} need${needsYou === 1 ? 's' : ''} you`)
    : h('span', {}, 'All clear');

  const switcher = h('div', { class: 'switch mono', role: 'group', 'aria-label': 'View' },
    [['day', 'Day'], ['week', 'Week'], ['month', 'Month']].map(([id, name]) =>
      h('a', { class: id === 'week' ? 'on' : '', href: `#/${id}`, 'aria-current': id === 'week' ? 'page' : null, 'data-fk': `view-${id}` }, name)));

  const hero = h('div', { class: 'hero' },
    h('div', { class: 'titles' },
      h('h1', {
        tabindex: '0',
        'data-fk': 'week-header',
        onkeydown: (e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            actions.go(e.key === 'ArrowRight' ? 1 : -1);
          }
        },
      }, model.title),
      h('p', { class: 'sub mono' }, `Week ${model.week} / ${model.year}`)),
    h('div', { class: 'right' },
      h('div', { class: 'step mono' },
        h('button', { type: 'button', 'data-fk': 'prev', 'aria-label': 'Previous week', onclick: () => actions.go(-1) }, 'Prev'),
        h('button', { type: 'button', 'data-fk': 'today', onclick: () => actions.today() }, 'Today'),
        h('button', { type: 'button', 'data-fk': 'next', 'aria-label': 'Next week', onclick: () => actions.go(1) }, 'Next')),
      switcher,
      status));

  const grid = h('div', { class: 'grid' }, axisEl(dom, hours), model.days.map(day));

  if (isEmpty) {
    return h('section', { class: 'week' }, hero,
      h('div', { class: 'lead' },
        h('p', {}, 'Nothing planned yet. Start with what is fixed: classes, work, lessons. I plan everything else around it.'),
        h('div', { class: 'cta' },
          actions.canAdd && h('a', { class: 'btn y', href: '#/commitments/new' }, 'Add a fixed time'),
          h('button', { type: 'button', class: 'btn', 'data-fk': 'example', onclick: () => actions.loadExample() }, 'Load the example'))),
      grid);
  }

  return h('section', { class: 'week' }, hero, travelOff && h('p', { class: 'travel-off mono' }, 'Travel is off. Add a Home place.'), grid);
}
