import { WEEK_ORDER } from './setup-model.js';
import { FULL_WEEKDAYS, isValidDate, longDate } from './time.js';

const LETTERS = { 1: 'M', 2: 'T', 3: 'W', 4: 'T', 5: 'F', 6: 'S', 0: 'S' };

export function renderField(dom, def, draft, ctx) {
  const { h } = dom;
  const id = `f-${def.name}`;
  const wrap = (...kids) => h('div', { class: def.span ? `fld span${def.span}` : 'fld' }, ...kids);
  const label = (text) => h('label', { class: 'mono', for: id }, text);
  const caption = (text) => h('span', { class: 'mono cap' }, text);
  const seg = (text, ...buttons) => wrap(caption(text), h('div', { class: 'seg mono', role: 'group', 'aria-label': text }, ...buttons));

  switch (def.type) {
    case 'text':
    case 'date':
      return wrap(label(def.label), h('input', {
        id, type: def.type === 'date' ? 'date' : 'text', 'data-fk': id, value: draft[def.name],
        placeholder: def.placeholder, inputmode: def.inputmode, autocomplete: 'off',
        oninput: (e) => { draft[def.name] = e.target.value; },
      }));

    case 'select': {
      const options = def.options(ctx.state, draft);
      const current = draft[def.name];
      const known = current === '' || options.some((o) => o.value === current);
      const all = known ? options : [{ value: current, label: current }, ...options];
      return wrap(label(def.label), h('select', {
        id, 'data-fk': id,
        onchange: (e) => { draft[def.name] = e.target.value; if (def.redraw) ctx.rerender(); },
      }, all.map((o) => h('option', { value: o.value, selected: o.value === current }, o.label))));
    }

    case 'choice': {
      const off = def.disabledValues ? def.disabledValues(ctx) : [];
      return seg(def.label, def.options.map((o) =>
        h('button', {
          type: 'button', class: draft[def.name] === o.value ? 'on' : '', 'data-fk': `${id}-${String(o.value)}`,
          'aria-pressed': String(draft[def.name] === o.value), disabled: off.includes(o.value),
          onclick: () => { if (off.includes(o.value)) return; draft[def.name] = o.value; ctx.rerender(); },
        }, o.label)));
    }

    case 'weekdays':
      return seg(def.label, WEEK_ORDER.map((w) => {
        const on = draft[def.name].includes(w);
        return h('button', {
          type: 'button', class: on ? 'on' : '', 'aria-pressed': String(on), 'aria-label': FULL_WEEKDAYS[w], 'data-fk': `${id}-${w}`,
          onclick: () => {
            // Read the draft at click time, not the list from when this button was drawn.
            const have = draft[def.name].includes(w);
            draft[def.name] = have ? draft[def.name].filter((x) => x !== w) : [...draft[def.name], w];
            ctx.rerender();
          },
        }, LETTERS[w]);
      }));

    case 'dates': {
      const list = draft[def.name];
      const input = h('input', {
        id, type: 'date', 'data-fk': id, value: ctx.scratch[def.name] ?? '',
        oninput: (e) => { ctx.scratch[def.name] = e.target.value; },
      });
      return wrap(caption(def.label), h('div', { class: 'chips' },
        list.map((d, i) => h('span', { class: 'chp' }, isValidDate(d) ? longDate(d) : d,
          h('button', {
            type: 'button', 'aria-label': `Remove ${d}`, 'data-fk': `${id}-rm-${i}`,
            onclick: () => { draft[def.name] = draft[def.name].filter((_, j) => j !== i); ctx.rerender(); },
          }, 'x'))),
        input,
        h('button', {
          type: 'button', class: 'addbtn mono', 'data-fk': `${id}-add`,
          onclick: () => {
            const value = ctx.scratch[def.name];
            const now = draft[def.name];
            if (isValidDate(value) && !now.includes(value)) {
              draft[def.name] = [...now, value].sort();
              ctx.scratch[def.name] = '';
              ctx.rerender();
            }
          },
        }, 'Add date')));
    }

    case 'softWindows': {
      const rows = draft[def.name];
      return wrap(caption(def.label), h('div', { class: 'rows' },
        rows.map((r, i) => h('div', { class: 'row3' },
          h('select', { 'aria-label': `Soft window ${i + 1} day`, 'data-fk': `${id}-${i}-day`, onchange: (e) => { r.weekday = Number(e.target.value); } },
            WEEK_ORDER.map((w) => h('option', { value: String(w), selected: r.weekday === w }, FULL_WEEKDAYS[w]))),
          h('input', { type: 'text', 'aria-label': `Soft window ${i + 1} starts`, 'data-fk': `${id}-${i}-start`, value: r.start, oninput: (e) => { r.start = e.target.value; } }),
          h('input', { type: 'text', 'aria-label': `Soft window ${i + 1} ends`, 'data-fk': `${id}-${i}-end`, value: r.end, oninput: (e) => { r.end = e.target.value; } }),
          h('button', {
            type: 'button', 'aria-label': `Remove soft window ${i + 1}`, 'data-fk': `${id}-${i}-rm`,
            onclick: () => { draft[def.name] = draft[def.name].filter((_, j) => j !== i); ctx.rerender(); },
          }, 'x'))),
        h('button', {
          type: 'button', class: 'addbtn mono', 'data-fk': `${id}-add`,
          onclick: () => { draft[def.name] = [...draft[def.name], { weekday: 5, start: '18:00', end: '24:00' }]; ctx.rerender(); },
        }, 'Add soft window')));
    }

    case 'custom': {
      const node = def.render(dom, draft, ctx);
      return node === null ? null : wrap(node);
    }

    default:
      throw new Error(`unknown field type ${def.type}`);
  }
}
