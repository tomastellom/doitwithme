// How a mark looks on a tile: the tick box, the faded or dashed look, and the words a screen reader hears.
export const STATUS_WORDS = { done: 'done', missed: 'not done', waived: 'taken off this week' };
export const TAG = { missed: 'Not done', waived: 'Taken off' };

export const statusClass = (status) => (status === 'done' ? 'is-done' : status === 'missed' || status === 'waived' ? 'is-missed' : '');

export function tickButton(dom, item, name, onTick) {
  const { h, svg } = dom;
  const done = item.status === 'done';
  return h('button', {
    type: 'button', class: done ? 'tick on' : 'tick', 'aria-pressed': String(done), 'data-fk': `tick-${item.kind}:${item.commitmentId ?? item.taskId}:${item.date}:${item.start}`,
    'aria-label': done ? `${name} is done. Mark it as not done yet` : `Mark ${name} as done`,
    title: done ? 'Done. Press to undo' : 'Mark as done',
    onclick: () => onTick(item),
  }, done && svg('svg', { viewBox: '0 0 14 14', 'aria-hidden': 'true' }, svg('path', { d: 'M2 7.5 5.5 11 12 3.5', fill: 'none', 'stroke-width': '2.4' })));
}
