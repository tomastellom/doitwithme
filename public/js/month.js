import { WEEKDAYS } from './time.js';

const HEADS = [...WEEKDAYS.slice(1), WEEKDAYS[0]];

export function renderMonth(dom, view, actions) {
  const { h } = dom;
  const { model, needsYou, isEmpty } = view;

  const cell = (c) =>
    h('a', {
      class: ['cell', c.inMonth ? '' : 'out', c.isPast ? 'past' : '', c.isToday ? 'today' : ''].filter(Boolean).join(' '),
      href: `#/day/${c.date}`,
      'data-fk': `cell-${c.date}`,
      'aria-label': `${c.weekday} ${c.num} ${c.monthName}, ${c.planned} planned${c.due ? ', something is due' : ''}. Opens the day.`,
    },
      h('span', { class: 'cn' }, h('span', { class: 'dn' }, c.num), c.due && h('span', { class: 'due mono' }, 'Due')),
      c.dots.length > 0 && h('span', { class: 'dots', 'aria-hidden': 'true' },
        c.dots.map((g) => h('i', { class: `dot g-${g}`, 'aria-hidden': 'true' })),
        c.more > 0 && h('span', { class: 'more mono' }, `+${c.more}`)));

  const status = needsYou > 0 ? `${needsYou} need${needsYou === 1 ? 's' : ''} you` : 'All clear';
  const hero = h('div', { class: 'hero' },
    h('h1', {
      tabindex: '0',
      'data-fk': 'month-header',
      onkeydown: (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          actions.go(e.key === 'ArrowRight' ? 1 : -1);
        }
      },
    }, model.title),
    h('div', { class: 'right' },
      h('div', { class: 'step mono' },
        h('button', { type: 'button', 'data-fk': 'prev', 'aria-label': 'Previous month', onclick: () => actions.go(-1) }, 'Prev'),
        h('button', { type: 'button', 'data-fk': 'today', onclick: () => actions.today() }, 'Today'),
        h('button', { type: 'button', 'data-fk': 'next', 'aria-label': 'Next month', onclick: () => actions.go(1) }, 'Next')),
      h('div', { class: 'meta mono' },
        h('span', {}, String(model.year)),
        h('span', {}, `${model.due} due this month`),
        h('span', {}, isEmpty ? 'Click a day to open it' : status))));

  const heads = h('div', { class: 'heads mono' }, HEADS.map((d) => h('span', {}, d)));
  const grid = h('div', { class: 'mgrid' }, model.cells.map(cell));
  const legend = h('div', { class: 'legend mono' },
    h('span', {}, h('i', { class: 'dot g-fixed' }), 'Fixed'),
    h('span', {}, h('i', { class: 'dot g-study' }), 'Study'),
    h('span', {}, h('i', { class: 'dot g-gym' }), 'Gym'),
    h('span', {}, h('i', { class: 'dot g-admin' }), 'Chores and errands'),
    h('span', {}, h('i', { class: 'dot g-outline' }), 'Projects and social'),
    h('span', { class: 'hint' }, 'One dot per planned item'));

  if (isEmpty) {
    return h('section', { class: 'month' }, hero,
      h('div', { class: 'lead' },
        h('p', {}, 'Nothing planned yet. Start with what is fixed: classes, work, lessons. I plan everything else around it.'),
        h('div', { class: 'cta' },
          h('button', { type: 'button', class: 'btn y', 'data-fk': 'example', onclick: () => actions.loadExample() }, 'Load the example'),
          actions.canAdd && h('a', { class: 'btn', href: '#/commitments/new' }, 'Add a commitment'))),
      heads, grid);
  }
  return h('section', { class: 'month' }, hero, heads, grid, h('div', { class: 'foot' }, legend));
}
