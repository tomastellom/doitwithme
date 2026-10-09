import { occurrencesOn } from './busy.ts';
import { weekdayOf } from './dates.ts';
import type { Commitment, Commute, DateStr, Leg, Minutes, Place, Warning } from './types.ts';

export interface TravelContext {
  places: Place[];
  commutes: Commute[];
  allowance: Minutes;
}

export interface DayTravel {
  legs: Leg[];
  warnings: Warning[];
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A place is the event's own place, else a saved place whose name appears in the title as a whole word.
export function placeFor(c: { title: string; placeId?: string }, places: Place[]): Place | null {
  if (c.placeId !== undefined) {
    const own = places.find((p) => p.id === c.placeId);
    if (own) return own;
  }
  let best: Place | null = null;
  for (const p of places) {
    const name = p.name.trim();
    if (name.length === 0) continue;
    const word = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(name)}($|[^\\p{L}\\p{N}])`, 'iu');
    if (word.test(c.title) && (best === null || name.length > best.name.trim().length)) best = p;
  }
  return best;
}

export function appliesOn(c: Commute, date: DateStr): boolean {
  const r = c.repeats;
  if (r === null) return true;
  return r.kind === 'weekly' ? r.weekdays.includes(weekdayOf(date)) : r.monthDays.includes(Number(date.slice(8)));
}

export function minutesFor(c: Commute): Minutes {
  return c.source.method === 'typed' ? c.source.minutes : c.source.fallbackMinutes;
}

function routeFor(a: Place, b: Place, date: DateStr, commutes: Commute[]): Commute | null {
  const match = commutes.filter(
    (c) =>
      ((c.fromPlaceId === a.id && c.toPlaceId === b.id) || (c.fromPlaceId === b.id && c.toPlaceId === a.id)) &&
      appliesOn(c, date),
  );
  return match.find((c) => c.repeats !== null) ?? match[0] ?? null;
}

export function legsOn(date: DateStr, commitments: Commitment[], ctx: TravelContext): DayTravel {
  const home = ctx.places.find((p) => p.kind === 'home');
  if (!home) return { legs: [], warnings: [] };

  const located = commitments
    .flatMap((c) => {
      const today = occurrencesOn(date, [c]);
      if (today.length === 0) return [];
      const place = placeFor(c, ctx.places);
      return place ? today.map((o) => ({ o, place })) : [];
    })
    .sort((a, b) => a.o.start - b.o.start || a.o.end - b.o.end);

  const cost = (from: Place, to: Place): { minutes: Minutes; estimated: boolean; commuteId: string | null } => {
    const route = routeFor(from, to, date, ctx.commutes);
    return route
      ? { minutes: minutesFor(route) + route.marginMinutes, estimated: false, commuteId: route.id }
      : { minutes: ctx.allowance, estimated: true, commuteId: null };
  };

  const legs: Leg[] = [];
  const warnings: Warning[] = [];
  let here = home;
  let lastEnd = -1;

  for (const { o, place } of located) {
    if (place.id !== here.id) {
      const { minutes, estimated, commuteId } = cost(here, place);
      if (estimated && place.address.trim() === '') {
        warnings.push({
          kind: 'address-missing',
          message: `${place.name} has no address and no commute, so I used ${ctx.allowance} minutes of travel`,
          detail: { placeName: place.name, minutes: ctx.allowance },
        });
      }
      const end = o.start - o.bufferBefore;
      const start = end - minutes;
      if (minutes > 0) {
        if (end > 0) {
          legs.push({ date, start: Math.max(0, start), end, fromName: here.name, toName: place.name, estimated, placeId: place.id, commuteId });
        }
        if (start < Math.max(lastEnd, 0)) {
          warnings.push({
            kind: 'travel-tight',
            message: `Not enough time to get to ${o.title} on ${date}`,
            detail: { placeName: place.name, date, titles: [o.title] },
          });
        }
      }
      here = place;
    }
    lastEnd = Math.max(lastEnd, o.end);
  }

  if (here.id !== home.id && lastEnd < 1440) {
    const { minutes, estimated, commuteId } = cost(here, home);
    if (minutes > 0) {
      legs.push({ date, start: lastEnd, end: Math.min(1440, lastEnd + minutes), fromName: here.name, toName: home.name, estimated, placeId: here.id, commuteId });
    }
  }
  return { legs, warnings };
}
