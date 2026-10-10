import { renderField } from './form.js';
import { FIELDS } from './setup.js';
import { WEEK_ORDER, applyItem, commitmentKind, newId, removeItem } from './setup-model.js';
import { dayItems, itemKey } from './model.js';
import { labelFor, labelsOf } from './labels.js';
import { WEEKDAYS, hhmm, longDate } from './time.js';

const SHOWN = ['title', 'category', 'placeId', 'start', 'end', 'date', 'weekdays'];
const hoursText = (m) => (m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60}h` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function createDrawer(dom, deps) {
  const { h, clear } = dom;
  const { store, navigate, focusKey, marks } = deps;
  let opened = false;
  let item = null;
  let draft = null;
  let error = null;
  let confirm = false;
  let scratch = {};
  // 'ask' is the step after "I did not do this one": what should happen to the time.
  let phase = null;

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
    const key = item ? item.fromKey ?? (item.kind === 'new' || item.kind === 'choose' || item.kind === 'day' ? item.returnKey ?? null : `blk-${itemKey(item)}`) : null;
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
      head(`${labelFor(labelsOf(state), c.category).name} / ${patternText(c)}`, c.title, when(item)),
      ...(marks ? statusRow('commitment') : []),
      weekly && !c.exceptions.includes(item.date) && h('div', { class: 'skip' },
        h('span', {}, `Not going this week? Skip only ${longDate(item.date)}. The other weeks stay.`),
        h('button', { type: 'button', class: 'mono', 'data-fk': 'drawer-skip', disabled: busy, onclick: () => skip(c) }, 'Skip this day')),
      error && h('div', { class: 'err', role: 'alert' }, h('b', {}, 'Nothing was saved.'), h('span', { class: 'mono msg' }, error)),
      h('form', { class: 'dfg', novalidate: true, onsubmit: (e) => { e.preventDefault(); save(c); } }, ...fields),
      h('span', { class: 'note2' }, 'Changes apply to every week of this class. ',
        h('a', { href: `#/commitments/${encodeURIComponent(c.id)}`, onclick: () => close(false) }, 'More options are in Plan.')),
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
        h('a', { href: '#/commitments/new', onclick: () => close(false) }, 'use Plan.')),
      h('div', { class: 'dbtns' },
        h('button', { type: 'button', class: 'y mono', 'data-fk': 'drawer-save', disabled: busy, onclick: () => saveNew() }, 'Add'),
        h('button', { type: 'button', class: 'mono', 'data-fk': 'drawer-discard', onclick: () => close() }, 'Cancel')),
    ];
  }

  // A whole day as a checklist, opened from the Month: tick things off without leaving it.
  function dayPanel() {
    const state = store.get().state;
    const items = dayItems(state, item.date, []).filter((i) => i.kind !== 'travel');
    const busy = store.get().busy;
    return [
      head('Check off', longDate(item.date), `${items.length} planned`),
      items.length === 0 ? h('p', { class: 'skip' }, h('span', {}, 'Nothing is planned on this day.')) : null,
      h('div', { class: 'daylist' }, items.map((i) => {
        const status = marks ? marks.statusOf(i) : null;
        return h('div', { class: `drow${status === 'done' ? ' is-done' : status ? ' is-missed' : ''}` },
          h('button', {
            type: 'button', class: status === 'done' ? 'tick on' : 'tick', 'aria-pressed': String(status === 'done'), disabled: busy, 'data-fk': `daytick-${itemKey(i)}`,
            'aria-label': status === 'done' ? `${i.title} is done. Mark it as not done yet` : `Mark ${i.title} as done`,
            onclick: async () => { await (status === 'done' ? marks.undo(i) : marks.done(i)); draw(); },
          }, status === 'done' && dom.svg('svg', { viewBox: '0 0 14 14', 'aria-hidden': 'true' }, dom.svg('path', { d: 'M2 7.5 5.5 11 12 3.5', fill: 'none', 'stroke-width': '2.4' }))),
          h('button', { type: 'button', class: 'dname', 'data-fk': `dayopen-${itemKey(i)}`, onclick: () => openItem({ ...i, status }, item.returnKey) },
            h('b', {}, i.title), h('span', { class: 'mono' }, `${hhmm(i.start)}–${hhmm(i.end)} / ${i.label}${status === 'missed' ? ' / not done' : status === 'waived' ? ' / taken off' : ''}`)));
      })),
    ];
  }

  // The "+ New" chooser: what kind of thing is being added, in plain words.
  function choosePanel() {
    const options = [
      { fk: 'choose-timed', title: 'Something at a set time', note: 'A lesson, a meeting, an appointment.', run: () => startNew({ date: item.date, start: 9 * 60, returnKey: item.returnKey }) },
      { fk: 'choose-task', title: 'A task', note: 'Something that needs time but no fixed slot. I find the time.', run: () => go('#/tasks/new') },
      { fk: 'choose-due', title: 'A due date', note: 'An exam or an assignment, with how long it needs.', run: () => go('#/due-dates/new') },
      { fk: 'choose-label', title: 'A label', note: 'Your own kind of thing, with a color.', run: () => go('#/labels/new') },
    ];
    return [
      head('New', 'What are you adding?', ''),
      h('div', { class: 'choices' }, options.map((o) =>
        h('button', { type: 'button', class: 'choice', 'data-fk': o.fk, onclick: o.run },
          h('b', {}, o.title), h('span', {}, o.note)))),
    ];
  }

  const statusNow = () => (marks ? marks.statusOf(item) : null);
  const finish = async (run) => {
    await run();
    if (!store.get().formError) close();
    else draw();
  };

  // The done / not done choices every planned thing has.
  function statusRow(kindWord) {
    const status = statusNow();
    const busy = store.get().busy;
    if (status === 'done') {
      return [
        h('p', { class: 'banner done' }, h('b', {}, 'Done.'), h('span', {}, ' It stays on the calendar, faded.')),
        h('div', { class: 'dbtns' }, h('button', { type: 'button', class: 'mono', 'data-fk': 'drawer-undo', disabled: busy, onclick: () => finish(() => marks.undo(item)) }, 'Mark as not done yet')),
      ];
    }
    if (status === 'missed' || status === 'waived') {
      return [
        h('p', { class: 'banner off' }, h('b', {}, status === 'waived' ? 'Taken off this week.' : 'Not done.'), h('span', {}, status === 'waived' ? ' It no longer counts toward the week.' : '')),
        h('div', { class: 'dbtns' },
          h('button', { type: 'button', class: 'y mono', 'data-fk': 'drawer-done', disabled: busy, onclick: () => finish(() => marks.done(item)) }, 'Mark as done'),
          h('button', { type: 'button', class: 'mono', 'data-fk': 'drawer-undo', disabled: busy, onclick: () => finish(() => marks.undo(item)) }, 'Put it back as planned')),
      ];
    }
    return [
      h('div', { class: 'dbtns marks' },
        h('button', { type: 'button', class: 'y mono', 'data-fk': 'drawer-done', disabled: busy, onclick: () => finish(() => marks.done(item)) }, 'Mark as done'),
        h('button', {
          type: 'button', class: 'mono', 'data-fk': 'drawer-notdone', disabled: busy,
          onclick: () => {
            if (kindWord === 'block') { phase = 'ask'; draw(); } else finish(() => marks.skipped(item));
          },
        }, kindWord === 'block' ? 'I did not do this one' : 'I did not go')),
    ];
  }

  // What to do with the time that was not used.
  function askPanel() {
    const minutes = item.end - item.start;
    const busy = store.get().busy;
    const forDue = Boolean(item.deadlineId);
    const option = (fk, title, note, cls, run, off = false) =>
      h('button', { type: 'button', class: `choice ${cls}`.trim(), 'data-fk': fk, disabled: busy || off, 'aria-disabled': off ? 'true' : null, onclick: off ? null : run }, h('b', {}, title), h('span', {}, note));
    return [
      head(`${cap(item.label)} / not done`, item.title, when(item)),
      h('p', { class: 'skip' }, h('span', {}, `That is ${hoursText(minutes)} you still need. What should I do with it?`)),
      h('div', { class: 'choices' },
        option('drawer-later', 'Find another time', 'I move it to the next free space and plan it again.', 'y', () => finish(() => marks.moveLater(item))),
        option('drawer-takeoff', forDue ? `Shorten this by ${hoursText(minutes)}` : 'Take it off this week',
          forDue ? 'I count it as not needed for this due date and plan nothing in its place.' : 'I lower this week by the same time and plan nothing in its place.', '', () => finish(() => marks.takeOff(item))),
        option('drawer-ai', 'Let the AI sort it out', 'Not connected yet. This arrives with the AI phase.', 'off', null, true)),
      h('div', { class: 'dbtns' }, h('button', { type: 'button', class: 'mono', 'data-fk': 'drawer-back', onclick: () => { phase = null; draw(); } }, 'Back')),
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
    if (phase === 'ask') return askPanel();
    return [
      head(`${cap(item.label)} / planned for you`, item.title, when(item)),
      ...(marks ? statusRow('block') : []),
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
    panel.setAttribute('aria-label', item.kind === 'day' ? 'Check off' : item.kind === 'choose' ? 'New' : item.kind === 'new' ? 'New commitment' : item.kind === 'travel' ? `Commute ${item.end - item.start}` : item.title);
    const body = item.kind === 'day' ? dayPanel() : item.kind === 'choose' ? choosePanel() : item.kind === 'new' ? newPanel() : item.kind === 'commitment' ? commitmentPanel() : item.kind === 'block' ? blockPanel() : travelPanel();
    clear(panel, body);
  }

  function openItem(next, fromKey = null) {
    phase = null;
    item = fromKey ? { ...next, fromKey } : next;
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
  }

  function startNew({ date, start, returnKey = null }) {
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
  }

  return {
    el,
    isOpen: () => opened,
    open: (next) => openItem(next),
    openNew: (spec) => startNew(spec),
    openDay({ date, returnKey = null }) {
      phase = null;
      item = { kind: 'day', date, returnKey };
      opened = true;
      error = null;
      confirm = false;
      scratch = {};
      draft = null;
      draw();
      el.removeAttribute('hidden');
      const first = focusables()[0];
      if (first) first.focus();
    },
    openChooser({ date, returnKey = null }) {
      item = { kind: 'choose', date, returnKey };
      opened = true;
      error = null;
      confirm = false;
      scratch = {};
      draft = null;
      draw();
      el.removeAttribute('hidden');
      const first = focusables()[0];
      if (first) first.focus();
    },
    close,
  };
}
