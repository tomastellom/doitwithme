import { GROUPS, itemKey } from './model.js';
import { duration, hhmm } from './time.js';
import { DEFAULT_HOURS, axisEl, bodyEl, hoursFor, topOf } from './timegrid.js';

export function renderDay(dom, view, actions) {
  const { h } = dom;
  const { model, needsYou, isEmpty, isToday, prevLabel, nextLabel } = view;

  const range = (r) => `${hhmm(r.start)}–${hhmm(r.end)}`;

  const timeOf = (r) => `${hhmm(r.start)}–${hhmm(r.end)}`;
  // Day rows call commitments and blocks "item"; the editor wants to know which is which.
  const asItem = (r) => ({ ...r, kind: r.kind === 'travel' ? 'travel' : r.commitmentId ? 'commitment' : 'block' });
  const lines = (r, shown, size) => {
    const when = `${timeOf(r)} · ${r.end - r.start} min`;
    return size === 'one' ? [h('span', { class: 'n' }, shown), h('span', { class: 't' }, when)] : [h('span', { class: 'k' }, r.label), h('span', { class: 'n' }, shown), h('span', { class: 't' }, when)];
  };
  const tileFor = (r, size) => {
    if (r.kind === 'buffer') {
      return h('div', { class: `tile dv-buf ${size}`, title: `${r.title}, ${timeOf(r)}` }, h('span', { class: 'n' }, r.title), h('span', { class: 't' }, `Travel and setup · ${r.end - r.start} min`));
    }
    const item = asItem(r);
    const name = item.kind === 'travel' ? `Commute ${r.end - r.start}` : r.title;
    return h('button', {
      type: 'button', class: `dv-blk tile ${size} ${item.kind === 'travel' ? 'travel' : `g-${r.group}`}`, 'data-fk': `blk-${itemKey(item)}`,
      title: `${name}, ${timeOf(r)}`, 'aria-label': `${name}, ${timeOf(r)}, ${r.label}. Opens the editor.`, onclick: () => actions.open(item),
    }, lines(r, r.title, size));
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

  const entries = model.rows.filter((r) => r.kind !== 'gap');
  const hours = hoursFor(view.hours ?? DEFAULT_HOURS, entries);
  // A long free stretch says so in the middle of it; shorter ones are just space.
  const gapLabels = model.rows
    .filter((r) => r.kind === 'gap' && r.end - r.start >= 90)
    .map((r) => h('div', { class: 'gaplabel mono', style: { top: `${topOf((r.start + r.end) / 2, hours) - 8}px` } }, `Free ${hhmm(r.start)}–${hhmm(r.end)} / ${duration(r.end - r.start)}`));
  const grid = h('div', { class: 'dv-grid' },
    axisEl(dom, hours),
    h('div', { class: 'dv-col' }, bodyEl(dom, { items: entries, hours, nowMinutes: isToday ? view.nowMinutes ?? null : null, tileFor, extras: gapLabels })));

  return h('section', { class: 'dayv' }, hero, h('div', { class: 'dv-body' }, grid, side));
}
