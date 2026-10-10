import { renderField } from './form.js';
import { FIELDS } from './setup.js';
import { WEEK_ORDER, applyItem, commitmentKind, newId, removeItem } from './setup-model.js';
import { itemKey } from './model.js';
import { WEEKDAYS, hhmm, longDate } from './time.js';

const SHOWN = ['title', 'category', 'placeId', 'start', 'end', 'date', 'weekdays'];
const hoursText = (m) => (m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60}h` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function createDrawer(dom, deps) {
  const { h, clear } = dom;
  const { store, navigate, focusKey } = deps;
  let opened = false;
  let item = null;
  let draft = null;
  let error = null;
  let confirm = false;
  let scratch = {};

  const panel = h('div', { class: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Editor' });
  const scrim = h('div', { class: 'scrim', onclick: () => close() });
  const el = h('div', { class: 'drawer-root', hidden: true, onkeydown: onKey }, scrim, panel);

  function focusables() {
    const out = [];
    const walk = (node) => {
      if (!node || !node.children) return;
      for (const c of node.children) {
        if (typeof c !== 'object' || !c.tag) continue;
        if (['button', 'input', 'select', 'textarea', 'a'].includes(c.tag) && c.getAttribute('disabled') === null) out.push(c);
        walk(c);
      }
    };
    walk(panel);
    return out;
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      close();
    } else if (e.key === 'Tab') {
      const list = focusables();
      if (list.length === 0) return;
      const at = list.indexOf(e.target);
      const edge = e.shiftKey ? at <= 0 : at === list.length - 1;
      if (edge) {
        e.preventDefault();
        list[e.shiftKey ? list.length - 1 : 0].focus();
      }
    }
  }

  const go = (hash) => {
    close(false);
    navigate(hash);
  };

  function close(returnFocus = true) {
    if (!opened) return;
    opened = false;
    el.setAttribute('hidden', '');
    const key = item ? (item.kind === 'new' ? item.returnKey ?? null : `blk-${itemKey(item)}`) : null;
    item = null;
    if (returnFocus && key) focusKey(key);
  }

  const head = (kicker, title, line) =>
    h('div', { class: 'row1' },
      h('div', {}, h('span', { class: 'mono sub2' }, kicker), h('h2', {}, title), h('span', { class: 'mono sub2' }, line)),
      h('button', { type: 'button', class: 'x mono', 'data-fk': 'drawer-close', onclick: () => close() }, 'Close'));

  const when = (i) => `${longDate(i.date)} / ${hhmm(i.start)}–${hhmm(i.end)}`;
  const gone = (i, what) => [
    head(cap(i.label ?? what), i.title, when(i)),
    h('p', { class: 'skip' }, h('span', {}, `This ${what} is no longer there. It may have been changed or removed since this screen was drawn.`)),
  ];

  function patternText(c) {
    if (c.pattern.kind === 'once') return longDate(c.pattern.date);
    return `every ${WEEK_ORDER.filter((w) => c.pattern.weekdays.includes(w)).map((w) => WEEKDAYS[w]).join(', ')}`;
  }

  async function save(c) {
    const state = store.get().state;
    const result = commitmentKind.fromDraft(draft, c.id, state);
    if (result.error) {
      error = result.error;
      draw();
      return;
    }
    error = null;
    await store.saveState((fresh) => applyItem(fresh, 'commitments', result.item));
    const after = store.get();
    if (after.formError) {
      error = after.formError;
      draw();
      return;
    }
    close();
  }

  async function remove(c) {
    await store.saveState((fresh) => removeItem(fresh, 'commitments', c.id));
    const after = store.get();
    if (after.formError) {
      error = after.formError;
      confirm = false;
      draw();
      return;
    }
    close();
  }

  async function skip(c) {
    const date = item.date;
    await store.saveState((fresh) => ({
      ...fresh,
      commitments: fresh.commitments.map((x) =>
        x.id === c.id && x.pattern.kind === 'weekly' && !x.exceptions.includes(date) ? { ...x, exceptions: [...x.exceptions, date].sort() } : x),
    }));
    const after = store.get();
    if (after.formError) {
      error = after.formError;
      draw();
      return;
    }
    close();
  }

  function commitmentPanel() {
    const state = store.get().state;
    const c = state.commitments.find((x) => x.id === item.commitmentId);
    if (!c) return gone(item, 'commitment');
    const busy = store.get().busy;
    const weekly = c.pattern.kind === 'weekly';
    const ctx = { state, scratch, rerender: draw };
    const fields = FIELDS.commitments
      .filter((f) => SHOWN.includes(f.name) && (!f.show || f.show(draft)))
      .map((f) => renderField(dom, f, draft, ctx))
      .filter(Boolean);
    const confirmRow = confirm
      ? h('div', { class: 'confirm' },
          h('span', {}, `Delete "${c.title}"? Every week of it goes.`),
          h('button', { type: 'button', class: 'mono', 'data-fk': 'drawer-confirm', disabled: busy, onclick: () => remove(c) }, 'Yes, delete'),
          h('button', { type: 'button', class: 'mono', 'data-fk': 'drawer-keep', onclick: () => { confirm = false; draw(); } }, 'Keep it'))
      : h('button', { type: 'button', class: 'del mono', 'data-fk': 'drawer-delete', onclick: () => { confirm = true; draw(); } }, 'Delete');
    return [
      head(`${cap(c.category)} / ${patternText(c)}`, c.title, when(item)),
      weekly && !c.exceptions.includes(item.date) && h('div', { class: 'skip' },
        h('span', {}, `Not going this week? Skip only ${longDate(item.date)}. The other weeks stay.`),
        h('button', { type: 'button', class: 'mono', 'data-fk': 'drawer-skip', disabled: busy, onclick: () => skip(c) }, 'Skip this day')),
      error && h('div', { class: 'err', role: 'alert' }, h('b', {}, 'Nothing was saved.'), h('span', { class: 'mono msg' }, error)),
      h('form', { class: 'dfg', novalidate: true, onsubmit: (e) => { e.preventDefault(); save(c); } }, ...fields),
      h('span', { class: 'note2' }, 'Changes apply to every week of this class. ',
        h('a', { href: `#/commitments/${encodeURIComponent(c.id)}`, onclick: () => close(false) }, 'More options are in Setup.')),
      h('div', { class: 'dbtns' },
        h('button', { type: 'button', class: 'y mono', 'data-fk': 'drawer-save', disabled: busy, onclick: () => save(c) }, 'Save'),
        h('button', { type: 'button', class: 'mono', 'data-fk': 'drawer-discard', onclick: () => { draft = commitmentKind.toDraft(c); error = null; confirm = false; scratch = {}; draw(); } }, 'Discard changes'),
        confirmRow),
    ];
  }

  // Adding: the same fields as editing a commitment, started on the day and time that was clicked.
  async function saveNew() {
    const state = store.get().state;
    const result = commitmentKind.fromDraft(draft, newId('c'), state);
    if (result.error) {
      error = result.error;
      draw();
      return;
    }
    error = null;
    await store.saveState((fresh) => applyItem(fresh, 'commitments', result.item));
    const after = store.get();
    if (after.formError) {
      error = after.formError;
      draw();
      return;
    }
    close();
  }

  function newPanel() {
    const state = store.get().state;
    const busy = store.get().busy;
    const ctx = { state, scratch, rerender: draw };
    const fields = FIELDS.commitments
      .filter((f) => SHOWN.includes(f.name) && (!f.show || f.show(draft)))
      .map((f) => renderField(dom, f, draft, ctx))
      .filter(Boolean);
    return [
      head('New / one time', 'Add something', longDate(item.date)),
      error && h('div', { class: 'err', role: 'alert' }, h('b', {}, 'Nothing was saved.'), h('span', { class: 'mono msg' }, error)),
      h('form', { class: 'dfg', novalidate: true, onsubmit: (e) => { e.preventDefault(); saveNew(); } }, ...fields),
      h('span', { class: 'note2' }, 'It happens once, on this day. For something that repeats every week, ',
        h('a', { href: '#/commitments/new', onclick: () => close(false) }, 'use Setup.')),
      h('div', { class: 'dbtns' },
        h('button', { type: 'button', class: 'y mono', 'data-fk': 'drawer-save', disabled: busy, onclick: () => saveNew() }, 'Add'),
        h('button', { type: 'button', class: 'mono', 'data-fk': 'drawer-discard', onclick: () => close() }, 'Cancel')),
    ];
  }

  function blockPanel() {
    const state = store.get().state;
    const task = state.tasks.find((t) => t.id === item.taskId);
    if (!task) return gone(item, 'task');
    const facts = [
      task.weeklyMinutes ? `${hoursText(task.weeklyMinutes)} a week` : 'no weekly target',
      `blocks up to ${task.maxBlock} min`,
    ].join(', ');
    const due = state.deadlines.filter((d) => d.taskId === task.id);
    const dueText = due.length > 0 ? ` Due: ${due.map((d) => `${d.kind} on ${longDate(d.dueDate)}`).join(', ')}.` : '';
    return [
      head(`${cap(item.label)} / planned for you`, item.title, when(item)),
      h('p', { class: 'skip' }, h('span', {}, `I put this here for the task ${task.title} (${facts}).${dueText} Change the task and I replan.`)),
      h('div', { class: 'dbtns' },
        h('button', { type: 'button', class: 'y mono', 'data-fk': 'drawer-link-task', onclick: () => go(`#/tasks/${encodeURIComponent(task.id)}`) }, 'Edit the task'),
        h('button', { type: 'button', class: 'mono', 'data-fk': 'drawer-link-due', onclick: () => go(item.deadlineId ? `#/due-dates/${encodeURIComponent(item.deadlineId)}` : '#/due-dates') }, 'See its due dates')),
    ];
  }

  function travelPanel() {
    const state = store.get().state;
    const place = (state.places ?? []).find((p) => p.id === item.placeId);
    const trip = `${item.fromName} to ${item.toName}`;
    const allowance = state.preferences.travelAllowanceMinutes ?? 30;
    const why = item.estimated
      ? `No commute is set for ${trip}, so I used your ${allowance} minute allowance.${place && !place.address.trim() ? ` ${place.name} has no address yet.` : ''}`
      : `Worked out from your commute ${trip}.`;
    return [
      head(`Travel / ${item.estimated ? 'estimated' : 'commute'}`, `Commute ${item.end - item.start}`, `${when(item)} / ${trip}`),
      h('p', { class: 'skip' }, h('span', {}, why)),
      h('div', { class: 'dbtns' },
        h('button', { type: 'button', class: 'y mono', 'data-fk': 'drawer-link-commute', onclick: () => go(item.commuteId ? `#/commutes/${encodeURIComponent(item.commuteId)}` : '#/commutes/new') }, item.commuteId ? 'Edit the commute' : 'Add a commute'),
        place && h('button', { type: 'button', class: 'mono', 'data-fk': 'drawer-link-place', onclick: () => go(`#/places/${encodeURIComponent(place.id)}`) }, `Edit ${place.name}`)),
    ];
  }

  function draw() {
    if (!item) return;
    panel.setAttribute('aria-label', item.kind === 'new' ? 'New commitment' : item.kind === 'travel' ? `Commute ${item.end - item.start}` : item.title);
    const body = item.kind === 'new' ? newPanel() : item.kind === 'commitment' ? commitmentPanel() : item.kind === 'block' ? blockPanel() : travelPanel();
    clear(panel, body);
  }

  return {
    el,
    isOpen: () => opened,
    open(next) {
      item = next;
      opened = true;
      error = null;
      confirm = false;
      scratch = {};
      draft = null;
      if (item.kind === 'commitment') {
        const c = store.get().state.commitments.find((x) => x.id === item.commitmentId);
        if (c) draft = commitmentKind.toDraft(c);
      }
      draw();
      el.removeAttribute('hidden');
      const first = focusables()[0];
      if (first) first.focus();
    },
    openNew({ date, start, returnKey = null }) {
      const end = Math.min(start + 60, 24 * 60 - 1);
      item = { kind: 'new', date, start, end, returnKey };
      opened = true;
      error = null;
      confirm = false;
      scratch = {};
      draft = { ...commitmentKind.blank(date), title: '', category: 'other', repeats: 'once', date, start: hhmm(start), end: hhmm(end) };
      draw();
      el.removeAttribute('hidden');
      const first = focusables()[0];
      if (first) first.focus();
    },
    close,
  };
}
