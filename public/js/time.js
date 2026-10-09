const DAY_MS = 86_400_000;
const parse = (d) => Date.parse(`${d}T00:00:00Z`);

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const FULL_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const weekdayOf = (d) => new Date(parse(d)).getUTCDay();
export const addDays = (d, n) => new Date(parse(d) + n * DAY_MS).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / DAY_MS);
export const weekStart = (d) => addDays(d, -((weekdayOf(d) + 6) % 7));

export function isValidDate(d) {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = parse(d);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d;
}

// ISO 8601: the week belongs to the year that holds its Thursday.
export function isoWeek(d) {
  const thursday = new Date(parse(d));
  thursday.setUTCDate(thursday.getUTCDate() - ((thursday.getUTCDay() + 6) % 7) + 3);
  const year = thursday.getUTCFullYear();
  const first = new Date(Date.UTC(year, 0, 4));
  first.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7) + 3);
  return { week: 1 + Math.round((thursday - first) / (7 * DAY_MS)), year };
}

export const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const duration = (m) => `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;

const dayNumber = (d) => Number(d.slice(8));
const monthIndex = (d) => Number(d.slice(5, 7)) - 1;

export const shortDate = (d) => `${dayNumber(d)} ${MONTHS[monthIndex(d)]}`;
export const longDate = (d) => `${WEEKDAYS[weekdayOf(d)]} ${shortDate(d)}`;

export function rangeLabel(start) {
  const end = addDays(start, 6);
  const y1 = start.slice(0, 4);
  const y2 = end.slice(0, 4);
  if (y1 !== y2) return `${shortDate(start)} ${y1} – ${shortDate(end)} ${y2}`;
  if (monthIndex(start) !== monthIndex(end)) return `${shortDate(start)} – ${shortDate(end)} ${y2}`;
  return `${dayNumber(start)} – ${shortDate(end)} ${y2}`;
}

export function currentClock(now = new Date(), horizonDays = 14) {
  const pad = (n) => String(n).padStart(2, '0');
  return {
    today: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    nowMinutes: now.getHours() * 60 + now.getMinutes(),
    horizonDays,
  };
}
