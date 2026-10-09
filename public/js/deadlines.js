import { duration } from './time.js';

export function renderDeadlines(dom, view) {
  const { h, svg } = dom;
  const { model } = view;

  const bar = (r) =>
    svg('svg', { class: 'dl-bar', viewBox: '0 0 100 1', preserveAspectRatio: 'none', role: 'img', 'aria-label': `Done ${duration(r.done)}, planned ${duration(r.planned)}, short ${duration(r.short)}` },
      svg('rect', { class: 'dl-done', x: 0, y: 0, width: r.doneW, height: 1 }),
      svg('rect', { class: 'dl-plan', x: r.doneW, y: 0, width: r.plannedW, height: 1 }),
      svg('rect', { class: 'dl-short', x: r.doneW + r.plannedW, y: 0, width: r.shortW, height: 1 }));

  const chip = (r) =>
    r.status === 'short' ? h('span', { class: 'dl-chip bad mono' }, `Short ${r.short} min`)
      : r.status === 'later' ? h('span', { class: 'dl-chip ok mono' }, 'Later')
        : h('span', { class: 'dl-chip ok mono' }, 'Covered');

  const row = (r) =>
    h('div', { class: 'dl' },
      h('div', { class: 'dl-when' }, h('span', { class: 'dl-big' }, r.day), h('span', { class: 'mono' }, `${r.month} / ${r.weekday}`, h('br'), r.daysLabel)),
      h('div', {}, h('div', { class: 'dl-tt' }, r.title), h('div', { class: 'dl-sub mono' }, r.sub)),
      h('div', {},
        bar(r),
        h('div', { class: 'dl-nums mono' },
          h('span', {}, `Done ${duration(r.done)}`),
          h('span', {}, `Planned ${duration(r.planned)}`),
          h('span', { class: r.short > 0 ? 'dl-bad' : '' }, `Short ${duration(r.short)}`))),
      h('div', { class: 'dl-end' }, chip(r)));

  const hero = h('div', { class: 'hero' },
    h('h1', {}, 'Deadlines'),
    h('div', { class: 'meta mono' }, h('span', {}, `${model.open} open`), model.shorts > 0 && h('span', { class: 'dl-bad' }, `${model.shorts} short`)));

  if (model.rows.length === 0) {
    return h('section', { class: 'deadlines' }, hero,
      h('div', { class: 'lead' },
        h('p', {}, 'No due dates yet. Add an exam or an assignment and I plan study time for it.'),
        h('div', { class: 'cta' }, h('a', { class: 'btn y', href: '#/due-dates/new' }, 'Add a due date'))));
  }
  return h('section', { class: 'deadlines' }, hero, h('div', { class: 'dl-list' }, model.rows.map(row)));
}
