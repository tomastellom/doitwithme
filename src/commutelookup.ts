import { daysBetween } from './dates.ts';
import { MapsError } from './maps.ts';
import type { TravelTimeProvider } from './maps.ts';
import type { Commute, DateStr, Place, State } from './types.ts';

export type LookupResult = { ok: true; minutes: number; at: DateStr } | { ok: false; code: string; message: string };

export class BadLookup extends Error {}

export interface LookupDeps {
  maps: TravelTimeProvider;
  load(): State;
  save(state: State): void;
  limit: number;
}

const STALE_DAYS = 14;
const MAX_REFRESH = 10;

export function usageFor(state: State, today: DateStr, limit: number): { month: string; count: number; limit: number } {
  const month = today.slice(0, 7);
  return { month, count: state.mapsUsage && state.mapsUsage.month === month ? state.mapsUsage.count : 0, limit };
}

const counted = (state: State, today: DateStr): State => {
  const month = today.slice(0, 7);
  const count = state.mapsUsage && state.mapsUsage.month === month ? state.mapsUsage.count : 0;
  return { ...state, mapsUsage: { month, count: count + 1 } };
};

const placeOf = (places: Place[], id: string): Place | undefined => places.find((p) => p.id === id);

// Worth looking up again: never found, older than two weeks, or found for other addresses.
export function isStale(c: Commute, places: Place[], today: DateStr): boolean {
  if (c.source.method !== 'maps') return false;
  const from = placeOf(places, c.fromPlaceId);
  const to = placeOf(places, c.toPlaceId);
  if (!from || !to || from.address.trim() === '' || to.address.trim() === '') return false;
  const found = c.source.found;
  if (!found) return true;
  return found.fromAddress !== from.address || found.toAddress !== to.address || daysBetween(found.at, today) > STALE_DAYS;
}

export async function lookupCommute(deps: LookupDeps, commuteId: string, today: DateStr): Promise<LookupResult> {
  const before = deps.load();
  const c = before.commutes.find((x) => x.id === commuteId);
  if (!c || c.source.method !== 'maps') throw new BadLookup('That commute does not use Google Maps.');
  const mode = c.source.mode;
  const from = placeOf(before.places, c.fromPlaceId);
  const to = placeOf(before.places, c.toPlaceId);
  if (!from || !to) throw new BadLookup('That commute has a place that is gone.');
  for (const p of [from, to]) {
    if (p.address.trim() === '') return { ok: false, code: 'address-missing', message: `Add an address to ${p.name} first.` };
  }
  const { count, limit } = usageFor(before, today, deps.limit);
  if (count >= limit) {
    return { ok: false, code: 'limit', message: `This month's ${limit} lookups are used up, so your typed time is used until next month.` };
  }
  let minutes = 0;
  let failure: { code: string; message: string } | null = null;
  try {
    minutes = (await deps.maps.lookup({ fromAddress: from.address, toAddress: to.address, mode })).minutes;
  } catch (e) {
    failure = e instanceof MapsError ? { code: e.code, message: e.message } : { code: 'bad-response', message: 'Google answered in a way I could not read.' };
  }
  // Read again after the wait: the browser may have saved something in the meantime.
  const now = counted(deps.load(), today);
  if (failure) {
    deps.save(now);
    return { ok: false, ...failure };
  }
  const target = now.commutes.find((x) => x.id === commuteId);
  if (!target || target.source.method !== 'maps') {
    deps.save(now);
    return { ok: false, code: 'gone', message: 'That commute changed while I was looking, so I kept it as it was.' };
  }
  const found = { minutes, at: today, fromAddress: from.address, toAddress: to.address };
  deps.save({
    ...now,
    commutes: now.commutes.map((x) => (x.id === commuteId && x.source.method === 'maps' ? { ...x, source: { ...x.source, found } } : x)),
  });
  return { ok: true, minutes, at: today };
}

export async function refreshCommutes(deps: LookupDeps, today: DateStr): Promise<{ updated: number; failed: number; skipped: number }> {
  const state = deps.load();
  const due = state.commutes.filter((c) => isStale(c, state.places, today));
  let updated = 0;
  let failed = 0;
  let done = 0;
  for (const c of due.slice(0, MAX_REFRESH)) {
    done++;
    const r = await lookupCommute(deps, c.id, today);
    if (r.ok) updated++;
    else {
      failed++;
      if (r.code === 'key' || r.code === 'quota' || r.code === 'limit') break;
    }
  }
  return { updated, failed, skipped: due.length - done };
}
