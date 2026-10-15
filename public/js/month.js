import { lookClass, paint } from './labels.js';
import { WEEKDAYS } from './time.js';

const HEADS = [...WEEKDAYS.slice(1), WEEKDAYS[0]];

export function renderMonth(dom, view, actions) {
  const { h } = dom;
  const { model, needsYou, isEmpty } = view;

  const cell = (c) =>
    h('div', { class: 'cw' },
      h('a', {
        class: ['cell', c.inMonth ? '' : 'out', c.isPast ? 'past' : '', c.isToday ? 'today' : ''].filter(Boolean).join(' '),
        href: `#/day/${c.date}`,
        'data-fk': `cell-${c.date}`,
        'aria-label': `${c.weekday} ${c.num} ${c.monthName}, ${c.planned} planned${c.due ? ', something is due' : ''}. Opens the day.`,
      },
        h('span', { class: 'cn' }, h('span', { class: 'dn' }, c.num), c.due && h('span', { class: 'due mono' }, 'Due')),
        c.dots.length > 0 && h('span', { class: 'dots', 'aria-hidden': 'true' },
          c.dots.map((g) => {
            const dot = h('i', { class: `dot ${lookClass(g.look)}${g.status === 'done' ? ' is-done' : g.status ? ' is-missed' : ''}`, 'aria-hidden': 'true' });
            paint(dot, g.color, g.look);
            return dot;
          }),
          c.more > 0 && h('span', { class: 'more mono' }, `+${c.more}`))),
      actions.review && c.planned > 0 && h('button', {
        type: 'button', class: 'review', 'data-fk': `review-${c.date}`,
        'aria-label': `Check off things on ${c.weekday} ${c.num} ${c.monthName}`, title: 'Check off', onclick: () => actions.review(c.date),
      }, dom.svg('svg', { viewBox: '0 0 14 14', 'aria-hidden': 'true' }, dom.svg('path', { d: 'M2 7.5 5.5 11 12 3.5', fill: 'none', 'stroke-width': '2.4' }))),
      actions.add && h('button', {
        type: 'button', class: 'plus', 'data-fk': `plus-${c.date}`,
        'aria-label': `Add to ${c.weekday} ${c.num} ${c.monthName}`, onclick: () => actions.add(c.date),
      }, '+'));

  const status = needsYou > 0 ? `${needsYou} need${needsYou === 1 ? 's' : ''} you` : 'All clear';
  const switcher = h('div', { class: 'switch mono', role: 'group', 'aria-label': 'View' },
    [['day', 'Day'], ['week', 'Week'], ['month', 'Month']].map(([id, name]) =>
      h('a', { class: id === 'month' ? 'on' : '', href: `#/${id}`, 'aria-current': id === 'month' ? 'page' : null, 'data-fk': `view-${id}` }, name)));

  const hero = h('div', { class: 'hero' },
    h('div', { class: 'titles' },
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
      h('p', { class: 'sub mono' }, `${model.year} / ${model.due} due this month`)),
    h('div', { class: 'right' },
      h('div', { class: 'step mono' },
        h('button', { type: 'button', 'data-fk': 'prev', 'aria-label': 'Previous month', onclick: () => actions.go(-1) }, 'Prev'),
        h('button', { type: 'button', 'data-fk': 'today', onclick: () => actions.today() }, 'Today'),
        h('button', { type: 'button', 'data-fk': 'next', 'aria-label': 'Next month', onclick: () => actions.go(1) }, 'Next')),
      switcher,
      h('span', { class: 'status' }, isEmpty ? 'Click a day to open it' : status)));

  const heads = h('div', { class: 'heads mono' }, HEADS.map((d) => h('span', {}, d)));
  const grid = h('div', { class: 'mgrid' }, model.cells.map(cell));
  const legend = h('div', { class: 'legend mono' },
    model.legend.map((g) => {
      const dot = h('i', { class: `dot ${lookClass(g.look)}` });
      paint(dot, g.color, g.look);
      return h('span', {}, dot, g.name);
    }),
    h('span', { class: 'hint' }, 'One dot per planned item'));

  if (isEmpty) {
    return h('section', { class: 'month' }, hero,
      h('div', { class: 'lead' },
        h('p', {}, 'Nothing planned yet. Start with what is fixed: classes, work, lessons. I plan everything else around it.'),
        h('div', { class: 'cta' },
          actions.canAdd && h('a', { class: 'btn y', href: '#/commitments/new' }, 'Add a fixed time'),
          h('button', { type: 'button', class: 'btn', 'data-fk': 'example', onclick: () => actions.loadExample() }, 'Load the example'))),
      heads, grid);
  }
  return h('section', { class: 'month' }, hero, heads, grid, h('div', { class: 'foot' }, legend));
}
