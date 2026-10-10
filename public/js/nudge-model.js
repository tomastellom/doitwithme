import { FULL_WEEKDAYS, longDate, shortDate, weekdayOf } from './time.js';

const SHORTFALLS = ['deadline-short', 'weekly-short'];
const TRAVEL = ['address-missing', 'travel-tight'];

function travelHeadline(w) {
  const d = w.detail;
  return w.kind === 'address-missing'
    ? `${d.placeName} has no address and no commute, so I used ${d.minutes} minutes of travel.`
    : `Not enough time to get to ${d.titles[0]} on ${longDate(d.date)}.`;
}

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

// Where to go to sort a warning out by hand, never a guess: a missing id falls back to the whole list.
function fixOf(w) {
  const d = w.detail;
  const enc = encodeURIComponent;
  switch (w.kind) {
    case 'deadline-short': return { label: 'Fix it myself', hash: d.deadlineId ? `#/due-dates/${enc(d.deadlineId)}` : '#/due-dates' };
    case 'weekly-short': return { label: 'Fix it myself', hash: d.taskId ? `#/tasks/${enc(d.taskId)}` : '#/tasks' };
    case 'address-missing': return { label: 'Fix it myself', hash: d.placeId ? `#/places/${enc(d.placeId)}` : '#/places' };
    case 'travel-tight': return { label: 'Fix it myself', hash: d.date ? `#/day/${d.date}` : '#/week' };
    default: return { label: 'Fix it myself', hash: d.date ? `#/day/${d.date}` : '#/week' };
  }
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
    fix: fixOf(w),
  }));
  const trips = open.filter((w) => TRAVEL.includes(w.kind));
  items.push(...trips.map((w) => ({ key: w.key, headline: travelHeadline(w), minutes: 0, category: 'travel', offer: null, fix: fixOf(w) })));
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
        fix: fixOf(offerWarning),
      });
    }
  }
  return { items, needsYou: shortfalls.length + trips.length };
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
