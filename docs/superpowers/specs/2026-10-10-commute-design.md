# Commute: Design

Date: 2026-10-10. Status: core built (typed times); the Google Maps lookup is the next plan. Builds on `2026-10-08-study-planner-design.md` (Commute section) and `2026-10-09-ui-design.md`. Approved boards: **P. Places screen** and **Q. Commutes screen** on the design canvas.

## Purpose

The planner must leave room to get places. Travel between home, campus, church and each private-lesson student's address becomes busy time the planner cannot schedule over. The user decides, per route, whether to type the travel time or let Google Maps find it, and chooses the travel mode when Maps is used.

## What the user asked for (2026-10-10)

- Per place or route: type your own travel time, or let Google Maps find it.
- A default commute is added to the calendar as a recurring weekly or monthly entry, and the planner can adjust it.
- With Google Maps the user picks the mode: car, bike, bus (transit), walk.
- Address resolution order stays: the event's own place, then a saved place matched by name in the title, then a default allowance flagged "address missing". A traffic safety margin is added. The Maps key and billing are checked before relying on it.
- Addresses are needed for home, campus and each private-lesson student.
- The user chose to build with typed times first. Maps plugs in behind the same interface when a key exists; the screens do not change.

## Scope

**In (this build):** places, commutes, travel legs in the planner, `address-missing` and `travel-tight` warnings, travel shown in the Week, the Places and Commutes Setup screens, a provider interface for Maps with an "unavailable" provider that dims the Maps choice.

**Out (the Maps build, after a key exists):** the real Google Distance Matrix call, a lookup cache refresh, key and billing checks. Also out: errand grouping by place, a Day-screen travel view beyond what Week shows, Google Calendar import.

## Data model

Added to `State` (`src/types.ts`). Old files without these fields load as empty and keep working.

- `places: Place[]`, `Place = { id, name, kind: 'home' | 'campus' | 'student' | 'other', address: string }`. `address` may be empty ("address missing"). At most one `home`.
- `commutes: Commute[]`, `Commute = { id, fromPlaceId, toPlaceId, repeats: Repeats | null, source: Source, marginMinutes }`.
  - `Repeats = { kind: 'weekly', weekdays: number[] } | { kind: 'monthly', monthDays: number[] }` (month days 1 to 28). `null` means "per lesson": the route applies on any day an event needs it.
  - `Source = { method: 'typed', minutes } | { method: 'maps', mode: 'car' | 'bike' | 'transit' | 'walk', fallbackMinutes }`. With Maps, `fallbackMinutes` is the typed time used until a Maps result exists or when Maps is unavailable.
- `Commitment` gains optional `placeId`.
- `Preferences` gains `travelAllowanceMinutes` (default 30): the time used when no route covers a trip.
- A route is one-way in the data and used both ways (outbound and return take the same time).

## Resolution and travel legs (pure logic, `src/travel.ts`)

For a date, take that day's occurrences. Resolve each occurrence's place: its `placeId`, else the first saved place whose name appears in the title (case-insensitive, whole words), else none.

Walk the located occurrences by start time, beginning at Home:

1. If the next place differs from the current one, a leg is needed. Duration is the matching route's minutes plus its margin. A route matches when its endpoints are the two places (either direction) and its `repeats` allow that date (or are null).
2. No matching route: use `travelAllowanceMinutes`. If the destination place has no address, also raise `address-missing`.
3. The leg ends at the occurrence's start minus its `bufferBefore` and begins duration earlier. After the last located occurrence a return leg to Home starts at its end.
4. If a leg would begin before the previous occurrence ends, still reserve it and raise `travel-tight` (the user can reach it only by leaving the earlier event early).
5. Occurrences with no resolved place are left alone, and nothing is invented for them.

If no Home place exists, travel is off: no legs, and the Week shows one quiet line ("Travel is off. Add a Home place."). Legs are busy time for the planner (`busyOn` includes them) and are never stored; they are recomputed on every plan. They are returned in the plan result as `travel: Leg[]` (`{ date, start, end, fromName, toName, estimated: boolean }`). `estimated` is true when the allowance was used.

Maps (later) only changes where a route's minutes come from: a cached Maps result when present, else `fallbackMinutes`. The planner reads minutes through one function, `minutesFor(commute, cache)`.

## Maps provider (interface now, service later)

`TravelTimeProvider.lookup({ fromAddress, toAddress, mode }) -> { minutes } | throws`. This build ships a fake (tests) and an `unavailable` provider. `GET /api/commute/status` reports `{ maps: 'unavailable' | 'ready' }`; the UI dims "Google Maps finds it" and shows "Google Maps is not connected yet" while unavailable. The key is read from a server environment variable, never stored in state, never sent to the browser, and addresses leave the machine only through the provider.

## Warnings

- `address-missing`: a trip's destination place has no address. Detail: place name, date. Key about the place (so dismissal survives day changes).
- `travel-tight`: a leg cannot fit between two events. Detail: titles, date.
- Both use the existing warning, dismissal and Nudge paths. Nudge wording is plain and short, for example "Anna has no address, so I used 30 minutes of travel."

## UI

Follows boards P and Q exactly.

- Setup sub-navigation gains **Places** and **Commutes**: Commitments, Tasks, Due dates, Places, Commutes, Preferences.
- **Places:** list plus form (Name, Kind, Address). List rows show name, kind and address or "Address missing". Delete asks for confirmation and states how many commitments and commutes it affects. Deleting a place clears `placeId` on commitments and removes commutes that use it.
- **Commutes:** list plus form (From, To, Repeats, Days or month days, "I type it" or "Google Maps finds it", minutes, safety margin, and the travel mode shown only for Maps). The "How Monday looks" strip previews the first matching day. Hatched grey marks travel everywhere (Week included); travel has no category colour.
- **Week:** each day shows its legs as hatched grey entries labelled "Commute 55" (minutes including margin).
- **Additions to approved boards (small, same styles; please confirm):** a **Place** select on the Commitments form, and a **Travel allowance, min** field on Preferences. Board P's example names read "Anna" and "Pedro" (the kind is shown separately), so name matching works on a student's first name.
- **Mode buttons:** the travel-mode segments stay visible as on the board, and the mode is saved only when "Google Maps finds it" is chosen.
- **Preview strip:** it is illustrative. It shows the typed minutes plus margin around a placeholder event, and updates when the screen is redrawn, not while typing.
- **Past days:** travel is computed from today forward, so past days in the Week show none.
- **Dropped from board Q:** "Leave for class by". Travel is anchored to the events, so a fixed leave time would contradict it. Say if you want it back and what it should mean.

## Errors and edge inputs

- Server validation rejects: duplicate or missing place ids, a commute whose place ids do not exist, two Home places, empty names, names over 200 characters, month days outside 1 to 28, weekdays outside 0 to 6, minutes outside 0 to 600, margin outside 0 to 120, an unknown mode or method. Messages are plain sentences, shown in the form as with other Setup screens.
- Saves keep the existing rule: built on the freshest server copy.
- A place name that is empty after trimming, or a title that matches two places, uses the longest matching name.
- Hostile text in names and addresses renders as text only.

## Testing

- `travel.ts` is pure: tests for resolution order, same-place no-leg, chains, return leg, allowance, `address-missing`, `travel-tight`, weekly and monthly filters, Home missing, midnight edges, and old files without the new fields.
- Validation tests for every rule above.
- Frontend: fake-DOM tests for both screens, delete cascades, and the Week legs. An end-to-end test boots the real server, adds Home, Campus and a lesson, and checks the plan avoids the legs.
- Maps: contract tests run against the fake provider; the real provider is tested later with recorded responses.

## Plans

1. **Commute core (next):** data, validation, `travel.ts`, planner integration, warnings, Places and Commutes screens, Week legs, status endpoint with the `unavailable` provider.
2. **Commute with Maps (when a key exists):** the Google provider, cache and refresh, "adjust" behaviour, key and billing check.

## Open items

- Confirm the two additions to the boards and the dropped field above.
- Verify Google Maps billing and the free monthly credit before plan 2.
