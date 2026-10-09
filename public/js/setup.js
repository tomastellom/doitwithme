import { renderField } from './form.js';
import { isValidDate } from './time.js';
import { CATEGORIES, DEADLINE_KINDS, KINDS, KIND_IDS, PLACE_KINDS, TRAVEL_MODES, applyItem, itemsOf, newId, parseDecimal, parseWhole, removeItem } from './setup-model.js';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fixed = (list) => () => list.map((v) => ({ value: v, label: cap(v) }));
const weekly = (d) => d.repeats === 'weekly';
const once = (d) => d.repeats === 'once';
const placeOptions = (state) => (state.places ?? []).map((p) => ({ value: p.id, label: p.name }));
const hint = (text) => ({ type: 'custom', name: 'hint', span: 3, render: (dom) => dom.h('p', { class: 'hint' }, text) });

const study = (d) => d.category === 'study';
const difficultyOptions = () => [
  { value: '1', label: '1 (very easy)' }, { value: '2', label: '2' }, { value: '3', label: '3' },
  { value: '4', label: '4' }, { value: '5', label: '5 (very hard)' },
];
const yesNo = [{ value: false, label: 'No' }, { value: true, label: 'Yes' }];
const hoursText = (m) => (m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60}h` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`);

function estimateBlock(dom, est) {
  const { h } = dom;
  const run = h('button', { type: 'button', class: 'go2 mono', 'data-fk': 'estimate-run', disabled: est.status === 'busy', onclick: () => est.run() },
    est.status === 'busy' ? 'Estimating' : 'Estimate hours');
  const parts = [run];
  if (est.status === 'error') parts.push(h('p', { class: 'hint', role: 'alert' }, est.message));
  if (est.status === 'ready') {
    const { rule, ai, aiStatus, aiMessage } = est.result;
    const lead = ai ?? rule;
    parts.push(h('div', { class: 'est' },
      h('i', { class: 'bar2' }),
      h('div', { class: 'in' },
        h('span', { class: 'mono cap' }, 'Suggested'),
        h('span', { class: 'big' }, `${hoursText(lead.minutes)} a week`),
        h('p', {}, lead.reason),
        ai && h('p', { class: 'ai' }, `Rule of thumb: ${hoursText(rule.minutes)} a week`),
        h('span', { class: 'tg' }, ai ? 'AI' : 'Rule of thumb'),
        h('div', { class: 'estbtns' },
          h('button', { type: 'button', class: 'y mono', 'data-fk': 'estimate-use', onclick: () => est.use(lead.minutes) }, 'Use this'),
          h('button', { type: 'button', class: 'mono', 'data-fk': 'estimate-keep', onclick: () => est.keep() }, 'Keep mine')),
        aiStatus === 'unavailable' && h('span', { class: 'mono ai' }, 'AI is not connected yet. The rule of thumb is used until it is.'),
        aiStatus === 'failed' && h('span', { class: 'mono ai' }, aiMessage))));
  }
  return h('div', { class: 'estwrap' }, ...parts);
}

export const FIELDS = {
  commitments: [
    { name: 'title', label: 'Title', type: 'text', span: 2 },
    { name: 'category', label: 'Category', type: 'select', options: fixed(CATEGORIES.commitments) },
    { name: 'start', label: 'Starts', type: 'text', placeholder: '16:00' },
    { name: 'end', label: 'Ends', type: 'text', placeholder: '17:00' },
    { name: 'buffer', label: 'Buffer before, min', type: 'text', inputmode: 'numeric' },
    { name: 'placeId', label: 'Place', type: 'select', options: (state) => [{ value: '', label: 'No place' }, ...placeOptions(state)] },
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
    { name: 'courseTitle', type: 'custom', span: 3, show: study, render: (dom) => dom.h('div', { class: 'sec' }, dom.h('b', {}, 'Course details'), dom.h('span', { class: 'mono ai' }, 'Study tasks only')) },
    { name: 'credits', label: 'Credits', type: 'text', inputmode: 'decimal', show: study },
    { name: 'difficulty', label: 'Difficulty', type: 'select', options: difficultyOptions, show: study },
    { name: 'examOnly', label: 'Graded by exams only', type: 'choice', options: yesNo, show: study },
    { name: 'weeklyGraded', label: 'Weekly graded work', type: 'choice', options: yesNo, show: study },
    { name: 'lab', label: 'Has a lab', type: 'choice', options: yesNo, show: study },
    { name: 'syllabus', label: 'Syllabus, optional (paste the text)', type: 'textarea', span: 3, show: study },
    { name: 'estimate', type: 'custom', span: 3, show: study, render: (dom, d, ctx) => estimateBlock(dom, ctx.estimate) },
  ],
  'due-dates': [
    { name: 'taskId', label: 'Task', type: 'select', span: 2, options: (state) => state.tasks.map((t) => ({ value: t.id, label: t.title })) },
    { name: 'kind', label: 'Kind', type: 'select', options: fixed(DEADLINE_KINDS) },
    { name: 'dueDate', label: 'Due date', type: 'date' },
    { name: 'effort', label: 'Effort, min', type: 'text', inputmode: 'numeric' },
  ],
  places: [
    { name: 'name', label: 'Name', type: 'text', span: 2 },
    { name: 'kind', label: 'Kind', type: 'select', options: () => PLACE_KINDS.map((k) => ({ value: k, label: cap(k) })) },
    { name: 'address', label: 'Address', type: 'text', span: 3 },
    hint('A place with no address gets a default travel allowance and a note on the week: address missing.'),
  ],
  commutes: [
    { name: 'fromPlaceId', label: 'From', type: 'select', options: placeOptions },
    { name: 'toPlaceId', label: 'To', type: 'select', options: placeOptions },
    { name: 'repeats', label: 'Repeats', type: 'select', redraw: true, options: () => [{ value: 'weekly', label: 'Every week' }, { value: 'monthly', label: 'Every month' }, { value: 'per-lesson', label: 'Per lesson' }] },
    { name: 'weekdays', label: 'Days', type: 'weekdays', span: 3, show: (d) => d.repeats === 'weekly' },
    { name: 'monthDays', label: 'Days of the month, like 1, 15', type: 'text', span: 3, show: (d) => d.repeats === 'monthly' },
    { name: 'method', label: 'How long it takes', type: 'choice', span: 3, options: [{ value: 'typed', label: 'I type it' }, { value: 'maps', label: 'Google Maps finds it' }], disabledValues: (ctx) => (ctx.maps === 'ready' ? [] : ['maps']) },
    { name: 'minutes', label: 'Minutes, one way', type: 'text', inputmode: 'numeric' },
    { name: 'margin', label: 'Safety margin, min', type: 'text', inputmode: 'numeric' },
    { name: 'mode', label: 'If Google Maps finds it: how you travel', type: 'choice', span: 3, options: TRAVEL_MODES.map((m) => ({ value: m, label: m === 'transit' ? 'Bus' : cap(m) })) },
    {
      name: 'note', type: 'custom', span: 3,
      render: (dom, d, ctx) => (ctx.maps === 'ready' ? null : dom.h('p', { class: 'hint' }, 'Google Maps is not connected yet. Until it is, the time you type is used, and the Maps choice stays dimmed.')),
    },
    {
      name: 'preview', type: 'custom', span: 3,
      render: (dom, d) => {
        const total = (parseWhole(d.minutes, 0, 600) ?? 0) + (parseWhole(d.margin, 0, 120) ?? 0);
        return dom.h('div', { class: 'prev' },
          dom.h('span', { class: 'mono cap' }, 'How a day looks'),
          dom.h('div', { class: 'strip' },
            dom.h('div', { class: 'b com' }, `Commute ${total}`),
            dom.h('div', { class: 'b cls' }, 'Your event'),
            dom.h('div', { class: 'b com' }, `Commute ${total}`)));
      },
    },
  ],
  preferences: [
    { name: 'weekdayStart', label: 'Weekday window starts', type: 'text', placeholder: '08:00' },
    { name: 'weekdayEnd', label: 'Weekday window ends', type: 'text', placeholder: '22:00' },
    { name: 'minBlock', label: 'Shortest block, min', type: 'text', inputmode: 'numeric' },
    { name: 'dayOffStart', label: 'Days-off window starts', type: 'text', placeholder: '10:00' },
    { name: 'dayOffEnd', label: 'Days-off window ends', type: 'text', placeholder: '20:00' },
    { name: 'minBreak', label: 'Break between blocks, min', type: 'text', inputmode: 'numeric' },
    { name: 'travelAllowance', label: 'Travel allowance, min', type: 'text', inputmode: 'numeric' },
    { name: 'hoursPerCredit', label: 'Hours a week per credit, optional', type: 'text', inputmode: 'decimal' },
    { name: 'normalCredits', label: 'Credits in a normal semester', type: 'text', inputmode: 'decimal' },
    { name: 'fullLoadHours', label: 'Study hours a week at a full load', type: 'text', inputmode: 'decimal' },
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
    return { error: null, confirm: false, scratch: {}, submittedKey: null, estimate: { status: 'idle', result: null, message: '' } };
  }

  function rerender() {
    keepFocus(() => clear(container, build()));
  }

  async function runEstimate() {
    const est = local.estimate;
    if (est.status === 'busy') return;
    const credits = parseDecimal(draft.credits, 0.5, 100);
    const difficulty = parseWhole(draft.difficulty, 1, 5);
    if (credits === null || difficulty === null) {
      est.status = 'error';
      est.message = String(draft.credits).trim() === '' ? 'Add the credits first, then ask for an estimate.' : 'Credits must be a number from 0.5 to 100, and difficulty 1 to 5.';
      rerender();
      return;
    }
    if (draft.syllabus.length > 20000) {
      est.status = 'error';
      est.message = 'The syllabus can be at most 20000 characters.';
      rerender();
      return;
    }
    est.status = 'busy';
    rerender();
    const mine = local;
    try {
      const body = { title: draft.title.trim() || 'Study task', credits, difficulty, examOnly: Boolean(draft.examOnly), weeklyGraded: Boolean(draft.weeklyGraded), lab: Boolean(draft.lab), syllabus: draft.syllabus };
      const result = await store.estimate(body);
      if (mine !== local) return;
      if (result === null) { est.status = 'idle'; } else { est.status = 'ready'; est.result = result; }
    } catch (e) {
      if (mine !== local) return;
      est.status = 'error';
      est.message = e && e.message ? e.message : 'The estimate did not work. Try again.';
    }
    rerender();
  }

  const estimateApi = () => ({
    status: local.estimate.status,
    result: local.estimate.result,
    message: local.estimate.message,
    run: runEstimate,
    use: (minutes) => { draft.weekly = String(minutes); local.estimate = { status: 'idle', result: null, message: '' }; rerender(); },
    keep: () => { local.estimate = { status: 'idle', result: null, message: '' }; rerender(); },
  });

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
    const title = sel.spec.itemTitle(sel.item, s.state);
    const extra = sel.spec.confirmNote ? sel.spec.confirmNote(s.state, sel.id) : '';
    return h('div', { class: 'confirm' },
      h('span', {}, `Delete "${title}"?${extra}`),
      h('button', { type: 'button', class: 'mono', 'data-fk': 'setup-confirm', disabled: current.s.busy, onclick: () => remove(sel) }, 'Yes, delete'),
      h('button', { type: 'button', class: 'mono', 'data-fk': 'setup-keep', onclick: () => { local.confirm = false; rerender(); } }, 'Keep it'));
  }

  function formColumn(sel) {
    const { kindId, s } = current;
    if (!sel.editing) return h('div', { class: 'form' }, h('p', { class: 'hint' }, 'Pick one from the list, or add a new one.'));
    const error = local.error ?? (local.submittedKey === key ? s.formError : null);
    const ctx = { state: s.state, maps: s.maps, scratch: local.scratch, rerender, estimate: estimateApi() };
    const fields = FIELDS[kindId].filter((f) => !f.show || f.show(draft)).map((f) => renderField(dom, f, draft, ctx)).filter(Boolean);
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
      kindId === 'commutes' && (s.state.places ?? []).length < 2 && h('p', { class: 'hint' }, 'Add at least two places first, like Home and Campus.'),
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
