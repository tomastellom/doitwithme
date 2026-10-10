export const GROUPS = [
  { id: 'views', label: 'Views', description: 'Your plan, by day, by week and by due date.' },
  { id: 'setup', label: 'Plan', description: 'What is fixed, what needs time, what is due, and the labels and places they use.' },
  { id: 'settings', label: 'Settings', description: 'The hours shown, the look, notifications, and how I plan.' },
  { id: 'connections', label: 'Connections', description: 'Where outside services will live.' },
];

export function searchSections(sections, query) {
  const q = String(query).trim().toLowerCase();
  if (!q) return [...sections];
  const score = (s) => {
    const title = s.title.toLowerCase();
    if (title.startsWith(q)) return 0;
    if (title.includes(q)) return 1;
    if (String(s.description ?? '').toLowerCase().includes(q)) return 2;
    return 3;
  };
  return sections.filter((s) => score(s) < 3).sort((a, b) => score(a) - score(b));
}

const inMenu = (list) => list.filter((s) => s.inMenu !== false);

export function createRegistry() {
  const list = [];
  return {
    register(section) {
      if (typeof section.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(section.id)) throw new Error('section.id is required and must be lower-case words');
      if (typeof section.title !== 'string' || !section.title) throw new Error('section.title is required');
      if (!GROUPS.some((g) => g.id === section.group)) throw new Error(`unknown group ${section.group}`);
      if (list.some((s) => s.id === section.id)) throw new Error(`duplicate section ${section.id}`);
      list.push({ description: '', primary: false, inMenu: true, activeFor: [], ...section });
    },
    all: () => [...list],
    ids: () => list.map((s) => s.id),
    find: (id) => list.find((s) => s.id === id) ?? null,
    primary: () => list.filter((s) => s.primary),
    search: (query) => searchSections(inMenu(list), query),
    byGroup(query = '') {
      const hits = searchSections(inMenu(list), query);
      return GROUPS.map((g) => ({ ...g, items: hits.filter((s) => s.group === g.id) })).filter((g) => g.items.length > 0);
    },
  };
}
