import { isValidDate } from './time.js';

function decode(part) {
  try {
    return decodeURIComponent(part);
  } catch {
    return null;
  }
}

export function parseHash(hash) {
  const m = /^#\/([a-z][a-z0-9-]*)(?:\/([^/?#]*))?$/.exec(typeof hash === 'string' ? hash : '');
  if (!m) return { id: null, param: null };
  return { id: m[1], param: m[2] ? decode(m[2]) : null };
}

export function resolveRoute(hash, ids, fallback = 'week', aliases = {}) {
  const parsed = parseHash(hash);
  const id = parsed.id !== null && Object.hasOwn(aliases, parsed.id) ? aliases[parsed.id] : parsed.id;
  const known = id !== null && ids.includes(id);
  return { id: known ? id : fallback, param: known ? parsed.param : null };
}

export const weekParam = (param, today) => (isValidDate(param) ? param : today);

export const dateParam = weekParam;

export const buildHash = (id, param) => (param ? `#/${id}/${encodeURIComponent(param)}` : `#/${id}`);
