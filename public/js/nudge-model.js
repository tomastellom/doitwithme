import { FULL_WEEKDAYS, longDate, shortDate, weekdayOf } from './time.js';

const SHORTFALLS = ['deadline-short', 'weekly-short'];

function order(a, b) {
  if (a.kind !== b.kind) return a.kind === 'deadline-short' ? -1 : 1;
  const da = a.detail.dueDate ?? a.detail.weekStart ?? '';
  const db = b.detail.dueDate ?? b.detail.weekStart ?? '';
  return da.localeCompare(db);
}

function headlineOf(w) {
  const d = w.detail;
  return w.kind === 'deadline-short'
    ? `${d.taskTitle} ${d.kind}, ${longDate(d.dueDate)}, is ${d.minutes} min short.`
    : `${d.taskTitle} is ${d.minutes} min short in the week of ${shortDate(d.weekStart)}.`;
}

function offerOf(w) {
  const weekday = FULL_WEEKDAYS[weekdayOf(w.detail.date)];
  const cost = w.detail.costMinutes ?? 0;
  return {
    key: w.key,
    date: w.detail.date,
    weekday,
    minutes: w.detail.minutes,
    cost,
    line:
      `${weekday} evening is free. I would only touch it for study, and only if you say so.` +
      (cost > 0 ? ` It would cost other tasks ${cost} min.` : ''),
    button: `Use ${weekday} evening`,
  };
}

export function buildNudge(warnings) {
  const open = warnings.filter((w) => !w.dismissed && w.detail);
  const shortfalls = open.filter((w) => SHORTFALLS.includes(w.kind)).sort(order);
  const offerWarning = open.find((w) => w.kind === 'soft-offer') ?? null;
  const items = shortfalls.map((w) => ({
    key: w.key,
    headline: headlineOf(w),
    minutes: w.detail.minutes,
    category: w.detail.category,
    offer: null,
  }));
  if (offerWarning) {
    const offer = offerOf(offerWarning);
    const target = items.find((item) => item.category === 'study');
    if (target) {
      target.offer = offer;
    } else {
      items.push({
        key: offer.key,
        headline: `Soft time on ${longDate(offer.date)} could cover ${offer.minutes} min of study.`,
        minutes: 0,
        category: 'study',
        offer,
      });
    }
  }
  return { items, needsYou: shortfalls.length };
}

export function keysOf(item) {
  return item.offer && item.offer.key !== item.key ? [item.key, item.offer.key] : [item.key];
}

export function buildConfirm(warnings, date) {
  const used = warnings.find((w) => w.kind === 'soft-time-used' && w.detail && w.detail.date === date);
  const weekday = FULL_WEEKDAYS[weekdayOf(date)];
  return used
    ? { date, weekday, minutes: used.detail.minutes, titles: used.detail.titles, used: true }
    : { date, weekday, minutes: 0, titles: [], used: false };
}
