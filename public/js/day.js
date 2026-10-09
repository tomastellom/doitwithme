import { GROUPS } from './model.js';
import { duration, hhmm } from './time.js';

export function renderDay(dom, view, actions) {
  const { h } = dom;
  const { model, needsYou, isEmpty, isToday, prevLabel, nextLabel } = view;

  const range = (r) => `${hhmm(r.start)}–${hhmm(r.end)}`;

  const rowOf = (r) => {
    if (r.kind === 'gap') {
      return h('div', { class: 'dv-gap mono' }, h('span'), h('span', { class: 'line' }, `Free ${range(r)} / ${duration(r.end - r.start)}`), h('span'));
    }
    const length = `${r.end - r.start} min`;
    if (r.kind === 'buffer') {
      return h('div', { class: 'dv-row' },
        h('span', { class: 'dv-rt dashed' }, range(r)),
        h('div', { class: 'dv-blk dv-buf' }, h('span', { class: 'k' }, r.title), h('span', { class: 'k' }, 'Travel and setup')),
        h('span', { class: 'dv-dur' }, length));
    }
    if (r.kind === 'travel') {
      return h('div', { class: 'dv-row' },
        h('span', { class: 'dv-rt' }, range(r)),
        h('div', { class: 'dv-blk travel' }, h('span', { class: 'k' }, r.label), h('span', { class: 'n' }, r.title)),
        h('span', { class: 'dv-dur' }, length));
    }
    return h('div', { class: 'dv-row' },
      h('span', { class: 'dv-rt' }, range(r)),
      h('div', { class: `dv-blk g-${r.group}` }, h('span', { class: 'k' }, r.label), h('span', { class: 'n' }, r.title)),
      h('span', { class: 'dv-dur' }, length));
  };

  const status = needsYou > 0 ? h('span', {}, `${needsYou} need${needsYou === 1 ? 's' : ''} you`) : h('span', {}, 'All clear');

  const hero = h('div', { class: 'hero' },
    h('h1', {
      tabindex: '0',
      'data-fk': 'day-header',
      onkeydown: (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          actions.go(e.key === 'ArrowRight' ? 1 : -1);
        }
      },
    }, model.label),
    h('div', { class: 'right' },
      h('div', { class: 'step mono' },
        h('button', { type: 'button', 'data-fk': 'prev', 'aria-label': `Previous day, ${prevLabel}`, onclick: () => actions.go(-1) }, prevLabel),
        h('button', { type: 'button', 'data-fk': 'today', onclick: () => actions.today() }, 'Today'),
        h('button', { type: 'button', 'data-fk': 'next', 'aria-label': `Next day, ${nextLabel}`, onclick: () => actions.go(1) }, nextLabel)),
      h('div', { class: 'meta mono' }, h('span', {}, model.weekLine), h('span', {}, `Booked ${duration(model.booked)}`), status)));

  if (isEmpty) {
    return h('section', { class: 'dayv' }, hero,
      h('div', { class: 'lead' },
        h('p', {}, 'Nothing planned yet. Start with what is fixed: classes, work, lessons. I plan everything else around it.'),
        h('div', { class: 'cta' },
          h('button', { type: 'button', class: 'btn y', 'data-fk': 'example', onclick: () => actions.loadExample() }, 'Load the example'),
          actions.canAdd && h('a', { class: 'btn', href: '#/commitments/new' }, 'Add a commitment'))));
  }

  const side = h('div', { class: 'dv-side' },
    h('span', { class: 'mono h' }, isToday ? 'Today by group' : 'Day by group'),
    GROUPS.map((g) =>
      h('div', { class: 'dv-tot' },
        h('i', { class: `sw g-${g.id}` }),
        h('span', { class: 'nm' }, g.label),
        h('span', { class: 'v' }, duration(model.totals[g.id])))),
    h('span', { class: 'mono dv-cap' }, `Free in the ${hhmm(model.window.start)}–${hhmm(model.window.end)} window`),
    h('span', { class: 'dv-free' }, duration(model.free)));

  return h('section', { class: 'dayv' }, hero,
    h('div', { class: 'dv-body' }, h('div', { class: 'dv-list' }, model.rows.map(rowOf)), side));
}
