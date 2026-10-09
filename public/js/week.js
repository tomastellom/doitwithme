import { GROUPS } from './model.js';
import { duration, hhmm } from './time.js';

export function renderWeek(dom, view, actions) {
  const { h } = dom;
  const { model, visible, needsYou, isEmpty } = view;

  const block = (item) =>
    h('div', { class: `blk g-${item.group}` },
      h('div', { class: 'top' }, h('span', { class: 't' }, `${hhmm(item.start)}–${hhmm(item.end)}`), h('span', { class: 'k' }, item.label)),
      h('span', { class: 'n' }, item.title));

  const day = (d) =>
    h('div', { class: d.isToday ? 'day today' : 'day', role: 'group', 'aria-label': `${d.weekday} ${d.num}` },
      h('div', { class: 'dh' }, h('span', { class: 'mono' }, d.weekday), h('span', { class: 'dd' }, d.num)),
      !isEmpty && h('p', { class: 'booked mono' }, `Booked ${duration(d.booked)}`),
      d.items.length > 0 ? d.items.map(block) : h('div', { class: 'ghost mono' }, 'Nothing planned'));

  const status = needsYou > 0
    ? h('button', { type: 'button', class: 'needs mono', 'data-fk': 'needs', onclick: () => actions.focusNudge() }, `${needsYou} need${needsYou === 1 ? 's' : ''} you`)
    : h('span', {}, 'All clear');

  const hero = h('div', { class: 'hero' },
    h('h1', {
      tabindex: '0',
      'data-fk': 'week-header',
      onkeydown: (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          actions.go(e.key === 'ArrowRight' ? 1 : -1);
        }
      },
    }, `Week ${model.week}`),
    h('div', { class: 'right' },
      h('div', { class: 'step mono' },
        h('button', { type: 'button', 'data-fk': 'prev', 'aria-label': 'Previous week', onclick: () => actions.go(-1) }, 'Prev'),
        h('button', { type: 'button', 'data-fk': 'today', onclick: () => actions.today() }, 'Today'),
        h('button', { type: 'button', 'data-fk': 'next', 'aria-label': 'Next week', onclick: () => actions.go(1) }, 'Next')),
      h('div', { class: 'meta mono' }, h('span', {}, model.range), h('span', {}, '7 days'), status)));

  const grid = h('div', { class: 'grid' }, model.days.map(day));

  if (isEmpty) {
    return h('section', { class: 'week' }, hero,
      h('div', { class: 'lead' },
        h('p', {}, 'Nothing planned yet. Start with what is fixed: classes, work, lessons. I plan everything else around it.'),
        h('div', { class: 'cta' },
          h('button', { type: 'button', class: 'btn y', 'data-fk': 'example', onclick: () => actions.loadExample() }, 'Load the example'),
          actions.canAdd && h('a', { class: 'btn', href: '#/commitments/new' }, 'Add a commitment'))),
      grid);
  }

  const filters = h('div', { class: 'filters' },
    h('span', { class: 'mono h' }, 'Show'),
    GROUPS.map((g) =>
      h('button', { type: 'button', class: 'fl', 'data-fk': `fl-${g.id}`, 'aria-pressed': String(visible.has(g.id)), onclick: () => actions.toggleGroup(g.id) },
        h('i', { class: `sw g-${g.id}` }), h('span', { class: 'nm' }, g.label), h('span', { class: 'ct' }, model.counts[g.id]))));

  return h('section', { class: 'week' }, hero, grid, h('div', { class: 'foot' }, filters));
}
