import { shortDate } from './time.js';

const PATHS_WARNING = 'Walking and bicycling routes may be missing sidewalks or bike paths. Check the time before you rely on it.';

// The saved Google result of a Maps commute, only while its mode and both addresses are still the ones it was found for.
export function foundFor(item, places) {
  if (!item || item.source.method !== 'maps' || !item.source.found) return null;
  const f = item.source.found;
  const from = places.find((p) => p.id === item.fromPlaceId);
  const to = places.find((p) => p.id === item.toPlaceId);
  return from && to && item.source.mode === f.mode && from.address === f.fromAddress && to.address === f.toAddress ? f : null;
}

// The minutes the planner uses for a commute (before the safety margin).
export function usedMinutes(item, places) {
  if (item.source.method === 'typed') return item.source.minutes;
  const f = foundFor(item, places);
  return f ? f.minutes : item.source.fallbackMinutes;
}

// What the commute form says about Google Maps, as plain sentences. Pure, so it is easy to test.
export function mapsLines(item, draft, ctx) {
  const places = (ctx.state && ctx.state.places) || [];
  let found;
  if (!item || item.source.method !== 'maps') {
    found = 'Save it and I will look the time up.';
  } else {
    const f = foundFor(item, places);
    // The saved typed time is what the planner uses, so that is the one named here, not what is half typed.
    if (f) found = `Google found ${f.minutes} min on ${shortDate(f.at)}.`;
    else if (item.source.found) found = `Not looked up yet for these addresses. Using your typed ${item.source.fallbackMinutes} min.`;
    else found = `Not looked up yet. Using your typed ${item.source.fallbackMinutes} min.`;
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
