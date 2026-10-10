// The shared time grid behind the Week and the Day: an hour axis, one body per day, and tiles placed at their real time.
export const HOUR_PX = 56;
const MIN_TILE = 30;
export const DEFAULT_HOURS = { from: 7, to: 22 };

// The chosen range, stretched when something lies outside it so nothing is ever hidden.
export function hoursFor(pref, items) {
  let from = pref.from;
  let to = pref.to;
  for (const i of items) {
    from = Math.min(from, Math.floor(i.start / 60));
    to = Math.max(to, Math.ceil(i.end / 60));
  }
  return { from: Math.max(0, from), to: Math.min(24, to) };
}

// Side-by-side lanes for items that overlap in time, like any calendar.
export function assignLanes(items) {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  const out = [];
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const ends = [];
    const placed = cluster.map((item) => {
      let lane = ends.findIndex((e) => e <= item.start);
      if (lane < 0) lane = ends.length;
      ends[lane] = item.end;
      return { item, lane };
    });
    for (const p of placed) out.push({ ...p, lanes: ends.length });
    cluster = [];
  };
  for (const item of sorted) {
    if (cluster.length > 0 && item.start >= clusterEnd) flush();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  if (cluster.length > 0) flush();
  return out;
}

export const topOf = (minutes, hours) => ((minutes - hours.from * 60) * HOUR_PX) / 60;
export const heightOf = (item) => Math.max(MIN_TILE, ((item.end - item.start) * HOUR_PX) / 60 - 2);
// How much a tile can say: the shorter it is, the less it shows, but never more than fits.
export const sizeOf = (height) => (height < 46 ? 'one' : height < 76 ? 'two' : 'full');
// The Day is wide, so a short tile fits its name and time on one line; only tall ones stack three lines.
export const dayTileSize = (height) => (height < 84 ? 'one' : 'full');

// The time under a click on empty space, snapped down to a quarter hour.
export function minutesAtClick(e, body, hours) {
  const top = typeof body.getBoundingClientRect === 'function' ? body.getBoundingClientRect().top : 0;
  const y = (typeof e.clientY === 'number' ? e.clientY : 0) - top;
  const minutes = hours.from * 60 + (y * 60) / HOUR_PX;
  return Math.min(23 * 60 + 45, Math.max(hours.from * 60, Math.floor(minutes / 15) * 15));
}

export function axisEl(dom, hours) {
  const { h } = dom;
  const labels = [];
  for (let hr = hours.from; hr <= hours.to; hr++) {
    labels.push(h('span', { class: 'mono', style: { top: `${(hr - hours.from) * HOUR_PX - 8}px` } }, `${String(hr % 24).padStart(2, '0')}:00`));
  }
  return h('div', { class: 'axis', 'aria-hidden': 'true' },
    h('div', { class: 'axis-head' }),
    h('div', { class: 'axis-body', style: { height: `${(hours.to - hours.from) * HOUR_PX}px` } }, labels));
}

// tileFor(item, size) builds the tile's content; this places it.
export function bodyEl(dom, { items, hours, nowMinutes = null, tileFor, extras = [], sizeFor = sizeOf, onBlank = null }) {
  const { h } = dom;
  const tiles = assignLanes(items).map(({ item, lane, lanes }) => {
    const height = heightOf(item);
    const node = tileFor(item, sizeFor(height));
    node.style.top = `${topOf(item.start, hours)}px`;
    node.style.height = `${height}px`;
    if (lanes > 1) {
      node.style.left = `${(lane / lanes) * 100}%`;
      node.style.width = `${100 / lanes}%`;
    }
    return node;
  });
  const showNow = nowMinutes !== null && nowMinutes >= hours.from * 60 && nowMinutes <= hours.to * 60;
  const lines = [];
  for (let hr = hours.from; hr < hours.to; hr++) lines.push(h('div', { class: 'hline', 'aria-hidden': 'true', style: { top: `${(hr - hours.from) * HOUR_PX}px` } }));
  const body = h('div', { class: onBlank ? 'cbody addable' : 'cbody', style: { height: `${(hours.to - hours.from) * HOUR_PX}px` } },
    lines,
    extras,
    tiles,
    showNow && h('div', { class: 'now', 'aria-hidden': 'true', style: { top: `${topOf(nowMinutes, hours)}px` } }, h('i')));
  // Empty space is clickable; a click that lands on a tile belongs to the tile.
  if (onBlank) {
    body.addEventListener('click', (e) => {
      if (e.target && e.target !== body && !(e.target.getAttribute && /\b(hline|gaplabel|now)\b/.test(e.target.getAttribute('class') ?? ''))) return;
      onBlank(minutesAtClick(e, body, hours));
    });
  }
  return body;
}
