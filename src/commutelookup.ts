import { daysBetween } from './dates.ts';
import { MapsError } from './maps.ts';
import type { TravelTimeProvider } from './maps.ts';
import type { Commute, DateStr, Place, State, TravelMode } from './types.ts';

export type LookupResult = { ok: true; minutes: number; at: DateStr } | { ok: false; code: string; message: string };

export class BadLookup extends Error {}

export interface LookupDeps {
  maps: TravelTimeProvider;
  load(): State;
  save(state: State): void;
  limit: number;
  // The server's own date. The monthly count follows it, never the date a browser sends.
  clock?: () => DateStr;
}

const STALE_DAYS = 14;
const MAX_REFRESH = 10;
// After a failure the same lookup is left alone for a while: a day for a hiccup, two weeks when Google has no route or no such address.
const PAUSE_DAYS = (code: string): number => (code === 'no-route' || code === 'address' ? 14 : 1);

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

interface ForRoute {
  fromAddress: string;
  toAddress: string;
  mode: TravelMode;
}
const fits = (r: ForRoute | undefined, from: Place, to: Place, mode: TravelMode): boolean =>
  r !== undefined && r.fromAddress === from.address && r.toAddress === to.address && r.mode === mode;

// Worth looking up again: never found, older than two weeks, or found for other addresses or another mode,
// and not just tried and failed.
export function isStale(c: Commute, places: Place[], today: DateStr): boolean {
  if (c.source.method !== 'maps') return false;
  const from = placeOf(places, c.fromPlaceId);
  const to = placeOf(places, c.toPlaceId);
  if (!from || !to || from.address.trim() === '' || to.address.trim() === '') return false;
  const { found, failed, mode } = c.source;
  if (found && fits(found, from, to, mode) && daysBetween(found.at, today) <= STALE_DAYS) return false;
  if (failed && fits(failed, from, to, mode) && daysBetween(failed.at, today) < PAUSE_DAYS(failed.code)) return false;
  return true;
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
  const when = deps.clock ? deps.clock() : today;
  const { count, limit } = usageFor(before, when, deps.limit);
  if (count >= limit) {
    return { ok: false, code: 'limit', message: `This month's ${limit} lookups are used up, so your typed time is used until next month.` };
  }
  // The attempt is counted before the wait, so lookups started together cannot all get past the limit.
  deps.save(counted(before, when));
  let minutes = 0;
  let failure: { code: string; message: string } | null = null;
  try {
    minutes = (await deps.maps.lookup({ fromAddress: from.address, toAddress: to.address, mode })).minutes;
  } catch (e) {
    failure = e instanceof MapsError ? { code: e.code, message: e.message } : { code: 'bad-response', message: 'Google answered in a way I could not read.' };
  }
  // Read again after the wait: the browser may have saved something in the meantime.
  const now = deps.load();
  const target = now.commutes.find((x) => x.id === commuteId);
  if (!target || target.source.method !== 'maps' || target.source.mode !== mode) {
    return { ok: false, code: 'gone', message: 'That commute changed while I was looking, so I kept it as it was.' };
  }
  const route = { fromAddress: from.address, toAddress: to.address, mode };
  const { failed: _old, ...rest } = target.source;
  const source = failure ? { ...target.source, failed: { at: today, code: failure.code, ...route } } : { ...rest, found: { minutes, at: today, ...route } };
  deps.save({ ...now, commutes: now.commutes.map((x) => (x.id === commuteId ? { ...x, source } : x)) });
  return failure ? { ok: false, ...failure } : { ok: true, minutes, at: today };
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
      if (r.code === 'key' || r.code === 'quota' || r.code === 'limit' || r.code === 'offline') break;
    }
  }
  return { updated, failed, skipped: due.length - done };
}

// The server owns the lookup count and what it found. A state saved from a browser cannot lower the count,
// and a result found while that browser was busy is kept when it still matches the commute.
export function keepMapsData(prev: State, next: State): State {
  const commutes = next.commutes.map((c) => {
    if (c.source.method !== 'maps') return c;
    const old = prev.commutes.find((x) => x.id === c.id);
    if (!old || old.source.method !== 'maps' || old.source.mode !== c.source.mode) return c;
    const from = placeOf(next.places, c.fromPlaceId);
    const to = placeOf(next.places, c.toPlaceId);
    if (!from || !to) return c;
    const source = { ...c.source };
    if (!source.found && old.source.found && fits(old.source.found, from, to, c.source.mode)) source.found = old.source.found;
    if (!source.failed && old.source.failed && fits(old.source.failed, from, to, c.source.mode)) source.failed = old.source.failed;
    return { ...c, source };
  });
  const { mapsUsage: _client, ...rest } = next;
  return { ...rest, commutes, ...(prev.mapsUsage ? { mapsUsage: prev.mapsUsage } : {}) };
}
