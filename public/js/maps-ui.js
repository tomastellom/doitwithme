import { shortDate } from './time.js';

const PATHS_WARNING = 'Walking and bicycling routes may be missing sidewalks or bike paths. Check the time before you rely on it.';

// What the commute form says about Google Maps, as plain sentences. Pure, so it is easy to test.
export function mapsLines(item, draft, ctx) {
  const places = (ctx.state && ctx.state.places) || [];
  let found;
  if (!item || item.source.method !== 'maps') {
    found = 'Save it and I will look the time up.';
  } else {
    const f = item.source.found;
    const from = places.find((p) => p.id === item.fromPlaceId);
    const to = places.find((p) => p.id === item.toPlaceId);
    if (!f) found = `Not looked up yet. Using your typed ${draft.minutes} min.`;
    else if (!from || !to || from.address !== f.fromAddress || to.address !== f.toAddress) found = `Not looked up yet for these addresses. Using your typed ${draft.minutes} min.`;
    else found = `Google found ${f.minutes} min on ${shortDate(f.at)}.`;
  }
  const note = ctx.mapsNote;
  return {
    found,
    failure: item && note && note.commuteId === item.id && !note.ok && note.message ? note.message : null,
    usage: ctx.mapsUsage ? `Used ${ctx.mapsUsage.count} of ${ctx.mapsUsage.limit} lookups this month.` : null,
    warning: draft.mode === 'walk' || draft.mode === 'bike' ? PATHS_WARNING : null,
  };
}

export function renderMapsBlock(dom, draft, ctx) {
  if (draft.method !== 'maps') return null;
  const { h } = dom;
  const lines = mapsLines(ctx.item ?? null, draft, ctx);
  const canRefresh = Boolean(ctx.item) && ctx.maps === 'ready' && !ctx.busy;
  return h('div', { class: 'mapsb' },
    h('p', { class: 'hint' }, lines.found),
    lines.failure && h('p', { class: 'hint err-line', role: 'status' }, lines.failure),
    lines.warning && h('p', { class: 'hint' }, lines.warning),
    lines.usage && h('p', { class: 'hint mono' }, lines.usage),
    h('button', { type: 'button', class: 'go2 mono', 'data-fk': 'maps-refresh', disabled: !canRefresh, onclick: () => ctx.lookup(ctx.item.id) }, 'Refresh now'));
}
