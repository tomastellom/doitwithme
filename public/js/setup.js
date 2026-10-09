import { renderField } from './form.js';
import { isValidDate } from './time.js';
import { CATEGORIES, DEADLINE_KINDS, KINDS, KIND_IDS, applyItem, itemsOf, newId, removeItem } from './setup-model.js';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fixed = (list) => () => list.map((v) => ({ value: v, label: cap(v) }));
const weekly = (d) => d.repeats === 'weekly';
const once = (d) => d.repeats === 'once';

export const FIELDS = {
  commitments: [
    { name: 'title', label: 'Title', type: 'text', span: 2 },
    { name: 'category', label: 'Category', type: 'select', options: fixed(CATEGORIES.commitments) },
    { name: 'start', label: 'Starts', type: 'text', placeholder: '16:00' },
    { name: 'end', label: 'Ends', type: 'text', placeholder: '17:00' },
    { name: 'buffer', label: 'Buffer before, min', type: 'text', inputmode: 'numeric' },
    { name: 'repeats', label: 'Repeats', type: 'choice', options: [{ value: 'once', label: 'Once' }, { value: 'weekly', label: 'Weekly' }] },
    { name: 'weekdays', label: 'Weekdays', type: 'weekdays', span: 2, show: weekly },
    { name: 'date', label: 'Date', type: 'date', show: once },
    { name: 'from', label: 'From', type: 'date', show: weekly },
    { name: 'to', label: 'To', type: 'date', show: weekly },
    { name: 'exceptions', label: 'Cancelled dates', type: 'dates', span: 2, show: weekly },
  ],
  tasks: [
    { name: 'title', label: 'Title', type: 'text', span: 2 },
    { name: 'category', label: 'Category', type: 'select', options: fixed(CATEGORIES.tasks) },
    { name: 'weekly', label: 'Minutes a week, blank for none', type: 'text', inputmode: 'numeric' },
    { name: 'maxBlock', label: 'Longest block, min', type: 'text', inputmode: 'numeric' },
    { name: 'priority', label: 'Priority', type: 'select', options: () => [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: n === 1 ? '1 (highest)' : n === 5 ? '5 (lowest)' : String(n) })) },
    { name: 'onePerDay', label: 'One session a day', type: 'choice', options: [{ value: false, label: 'No' }, { value: true, label: 'Yes' }] },
  ],
  'due-dates': [
    { name: 'taskId', label: 'Task', type: 'select', span: 2, options: (state) => state.tasks.map((t) => ({ value: t.id, label: t.title })) },
    { name: 'kind', label: 'Kind', type: 'select', options: fixed(DEADLINE_KINDS) },
    { name: 'dueDate', label: 'Due date', type: 'date' },
    { name: 'effort', label: 'Effort, min', type: 'text', inputmode: 'numeric' },
  ],
  preferences: [
    { name: 'weekdayStart', label: 'Weekday window starts', type: 'text', placeholder: '08:00' },
    { name: 'weekdayEnd', label: 'Weekday window ends', type: 'text', placeholder: '22:00' },
    { name: 'minBlock', label: 'Shortest block, min', type: 'text', inputmode: 'numeric' },
    { name: 'dayOffStart', label: 'Days-off window starts', type: 'text', placeholder: '10:00' },
    { name: 'dayOffEnd', label: 'Days-off window ends', type: 'text', placeholder: '20:00' },
    { name: 'minBreak', label: 'Break between blocks, min', type: 'text', inputmode: 'numeric' },
    { name: 'daysOff', label: 'Days off', type: 'weekdays', span: 3 },
    { name: 'softWindows', label: 'Soft evenings (kept free unless you say yes)', type: 'softWindows', span: 3 },
  ],
};

export function createSetup(dom, deps) {
  const { h, clear } = dom;
  const { store, getClock, navigate, keepFocus } = deps;
  let key = null;
  let draft = null;
  let local = freshLocal();
  let container = null;
  let current = null;

  function freshLocal() {
    return { error: null, confirm: false, scratch: {}, submittedKey: null };
  }

  function rerender() {
    keepFocus(() => clear(container, build()));
  }

  function selection() {
    const { kindId, s, route } = current;
    const spec = KINDS[kindId];
    if (spec.single) return { spec, id: '-', item: s.state.preferences, editing: true, isNew: false };
    const items = itemsOf(s.state, kindId);
    const item = items.find((i) => i.id === route.param) ?? null;
    const isNew = route.param === 'new';
    return { spec, id: route.param, item, editing: isNew || item !== null, isNew };
  }

  function ensureDraft(sel) {
    const { kindId, s } = current;
    if (!sel.editing) {
      key = null;
      return;
    }
    const k = `${kindId}:${sel.id}`;
    if (k === key) return;
    key = k;
    local = freshLocal();
    draft = sel.isNew ? sel.spec.kind.blank(getClock().today, s.state) : sel.spec.kind.toDraft(sel.item);
  }

  async function finish(next, hash) {
    local.submittedKey = key;
    await store.saveState(next);
    const after = store.get();
    if (after.formError || after.status !== 'ready') return;
    key = null;
    navigate(hash);
  }

  async function save(sel) {
    const { kindId, s } = current;
    const id = sel.spec.single ? '-' : sel.isNew ? newId(sel.spec.prefix) : sel.id;
    // A date that was picked but never added with "Add date" still belongs to the item.
    for (const f of FIELDS[kindId]) {
      const v = f.type === 'dates' ? local.scratch[f.name] : null;
      if (isValidDate(v) && !draft[f.name].includes(v)) draft[f.name] = [...draft[f.name], v].sort();
      if (f.type === 'dates') local.scratch[f.name] = '';
    }
    const result = sel.spec.kind.fromDraft(draft, id, s.state);
    if (result.error) {
      local.error = result.error;
      rerender();
      return;
    }
    local.error = null;
    await finish((fresh) => applyItem(fresh, kindId, result.item), sel.spec.single ? '#/preferences' : `#/${kindId}/${encodeURIComponent(result.item.id)}`);
  }

  async function remove(sel) {
    const { kindId, s } = current;
    await finish((fresh) => removeItem(fresh, kindId, sel.id), `#/${kindId}`);
  }

  function deleteArea(sel) {
    const { kindId, s } = current;
    if (!local.confirm) {
      return h('button', { type: 'button', class: 'del mono', 'data-fk': 'setup-delete', onclick: () => { local.confirm = true; rerender(); } }, 'Delete');
    }
    const linked = kindId === 'tasks' ? s.state.deadlines.filter((d) => d.taskId === sel.id).length : 0;
    const title = sel.spec.itemTitle(sel.item, s.state);
    const extra = linked > 0 ? ` Its ${linked} due date${linked === 1 ? ' goes' : 's go'} too.` : '';
    return h('div', { class: 'confirm' },
      h('span', {}, `Delete "${title}"?${extra}`),
      h('button', { type: 'button', class: 'mono', 'data-fk': 'setup-confirm', disabled: current.s.busy, onclick: () => remove(sel) }, 'Yes, delete'),
      h('button', { type: 'button', class: 'mono', 'data-fk': 'setup-keep', onclick: () => { local.confirm = false; rerender(); } }, 'Keep it'));
  }

  function formColumn(sel) {
    const { kindId, s } = current;
    if (!sel.editing) return h('div', { class: 'form' }, h('p', { class: 'hint' }, 'Pick one from the list, or add a new one.'));
    const error = local.error ?? (local.submittedKey === key ? s.formError : null);
    const ctx = { state: s.state, scratch: local.scratch, rerender };
    const fields = FIELDS[kindId].filter((f) => !f.show || f.show(draft)).map((f) => renderField(dom, f, draft, ctx));
    return h('form', { class: 'form', novalidate: true, onsubmit: (e) => { e.preventDefault(); save(sel); } },
      error && h('div', { class: 'err', role: 'alert' }, h('b', {}, 'Nothing was saved.'), h('span', { class: 'mono msg' }, error)),
      h('div', { class: 'fg' }, fields),
      h('div', { class: 'btns' },
        h('button', { type: 'submit', class: 'y mono', 'data-fk': 'setup-save', disabled: s.busy }, 'Save'),
        h('button', { type: 'button', class: 'mono', 'data-fk': 'setup-discard', onclick: () => { key = null; rerender(); } }, 'Discard changes'),
        !sel.isNew && !sel.spec.single && deleteArea(sel)));
  }

  function listColumn(sel) {
    const { kindId, s } = current;
    if (sel.spec.single) return null;
    const items = itemsOf(s.state, kindId);
    return h('div', { class: 'list' },
      items.length === 0 && h('p', { class: 'hint' }, 'Nothing here yet.'),
      items.map((item) => {
        const on = item.id === current.route.param;
        return h('a', { class: on ? 'item on' : 'item', href: `#/${kindId}/${encodeURIComponent(item.id)}`, 'aria-current': on ? 'true' : null },
          h('span', { class: 'n' }, sel.spec.itemTitle(item, s.state)),
          h('span', { class: 'mono' }, sel.spec.itemLabel(item)),
          h('span', { class: 'd' }, sel.spec.kind.summary(item, s.state)));
      }),
      h('a', { class: 'add mono', href: `#/${kindId}/new` }, sel.spec.add));
  }

  function build() {
    const { kindId } = current;
    const sel = selection();
    ensureDraft(sel);
    return [
      h('div', { class: 'hero' },
        h('h1', {}, 'Setup'),
        h('div', { class: 'sub mono' }, KIND_IDS.map((id) =>
          h('a', { href: `#/${id}`, 'aria-current': id === kindId ? 'page' : null }, KINDS[id].title)))),
      h('div', { class: 'cols' }, listColumn(sel), formColumn(sel)),
    ];
  }

  return {
    render(kindId, ctx) {
      current = { kindId, ...ctx };
      container = h('section', { class: 'setup' });
      clear(container, build());
      return container;
    },
  };
}
