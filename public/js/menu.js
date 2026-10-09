export function createMenu(dom, registry, handlers) {
  const { h, clear } = dom;
  let query = '';
  let opener = null;
  let open = false;
  let focusList = [];

  const columns = h('div', { class: 'cols' });
  const closeButton = h('button', { type: 'button', class: 'close mono', onclick: () => close() }, 'Close  Esc');
  const input = h('input', {
    id: 'menu-q',
    class: 'q',
    type: 'text',
    placeholder: 'Type to find anything',
    autocomplete: 'off',
    oninput: (e) => {
      query = e.target.value;
      renderColumns();
    },
  });

  const el = h('div', { class: 'menu', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Menu', hidden: true,
    onkeydown: (e) => {
      if (e.key === 'Escape') {
        close();
      } else if (e.key === 'Enter' && e.target === input) {
        e.preventDefault();
        const first = registry.search(query)[0];
        if (first) {
          handlers.navigate(first.id);
          close();
        }
      } else if (e.key === 'Tab' && focusList.length > 0) {
        const at = focusList.indexOf(e.target);
        const edge = e.shiftKey ? at <= 0 : at === focusList.length - 1;
        if (edge) {
          e.preventDefault();
          focusList[e.shiftKey ? focusList.length - 1 : 0].focus();
        }
      }
    } },
    h('div', { class: 'bar' }, h('span', { class: 'mono' }, 'doitwithme'), closeButton),
    h('div', { class: 'jump' },
      h('label', { class: 'mono', for: 'menu-q' }, 'Jump to'), input, h('span', { class: 'key mono' }, '/')),
    columns,
    h('div', { class: 'foot-note mono' }, h('span', {}, 'Enter opens the first match'), h('span', {}, 'Esc closes')));

  function renderColumns() {
    const current = handlers.current();
    const links = [];
    const groups = registry.byGroup(query);
    const content = groups.map((g) =>
      h('div', { class: 'grp' },
        h('span', { class: 'mono gh' }, g.label),
        g.items.map((s) => {
          const link = h('a', {
            class: s.id === current ? 'it on' : 'it',
            href: `#/${s.id}`,
            'aria-current': s.id === current ? 'page' : null,
            onclick: () => close(),
          }, s.title);
          links.push(link);
          return link;
        }),
        h('p', { class: 'desc' }, g.description)));
    clear(columns, groups.length > 0 ? content : h('p', { class: 'none mono' }, 'No match'));
    focusList = [closeButton, input, ...links];
  }

  function close() {
    if (!open) return;
    open = false;
    el.setAttribute('hidden', '');
    if (opener) opener.focus();
  }

  renderColumns();

  return {
    el,
    isOpen: () => open,
    refresh: renderColumns,
    open(from) {
      opener = from ?? null;
      open = true;
      query = '';
      input.value = '';
      renderColumns();
      el.removeAttribute('hidden');
      input.focus();
    },
    close,
  };
}
