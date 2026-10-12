# Commute with Google Maps (plan 2 of the commute build)

Date: 2026-10-12. Builds on `2026-10-10-commute-design.md` (commute core, built). The interface `TravelTimeProvider` and the "unavailable" provider already exist; this adds the real provider, the cache, a spending cap and the messages.

## Goal

A commute can use Google Maps for its travel time. The user picks the mode (car, bike, bus, walk). The time is looked up once, kept with its date, refreshed now and then, and used by the planner exactly like a typed time. Everything fails soft: with no key, no network, no route or no quota, the planner uses the typed fallback time and says why.

## Decisions (from the user, 2026-10-12)

- The user has no key yet. Everything is built and tested without a real call, and a short setup guide tells the user how to get a key. Until a key is set, Maps stays dimmed as it is now.
- Traffic is covered by the commute's safety margin, not by a traffic-aware request.
- The server counts lookups and stops at a monthly cap of its own, well under Google's free allowance.

## What Google's API gives us (checked 2026-10-12)

- `POST https://routes.googleapis.com/directions/v2:computeRoutes` with headers `Content-Type: application/json`, `X-Goog-Api-Key` and `X-Goog-FieldMask`. The older Distance Matrix API is legacy and is not used.
- `origin` and `destination` may each be `{ "address": "..." }`. Google geocodes the string itself. An incomplete address can resolve to the wrong country; an optional `regionCode` (two letters) biases it.
- `travelMode` values used: `DRIVE`, `BICYCLE`, `WALK`, `TRANSIT`. `routingPreference` applies only to `DRIVE` and `TWO_WHEELER` and makes other modes fail, so it is never sent. `TRANSIT` works only where Google has transit data.
- Field mask `routes.duration`. The answer is `{ "routes": [ { "duration": "1400s" } ] }`: a string of seconds with an `s`. No `routes` (or an empty list) means no route.
- Google requires a visible warning for walking and bicycling routes (paths may be missing).
- Cost (from Google's pricing page and third-party tables, to be confirmed by the user when creating the key): the basic Compute Routes tier has a 10,000 request free cap a month, then about $5 per 1,000. A traffic-aware tier costs more, which is why it is not used.

## Data

- `TravelSource` for `maps` gains an optional `found`: `{ minutes: number; at: DateStr; fromAddress: string; toAddress: string }`. It is the last Google result, with the date and the two addresses it was found for.
- `State` gains `mapsUsage?: { month: string; count: number }` (month is `YYYY-MM`).
- Validation: `found.minutes` whole 0 to 600, `at` a real date, addresses text up to 500 characters; `mapsUsage.month` matches `YYYY-MM` and `count` is a whole number 0 to 1,000,000. Old state loads unchanged.
- `minutesFor(commute, places)`: for a typed source, its minutes. For a Maps source, `found.minutes` when `found` exists and both place addresses still equal `found.fromAddress` and `found.toAddress`; otherwise `fallbackMinutes`. `travel.ts` passes its places.

## Provider

`googleProvider({ key, fetchFn?, regionCode?, timeoutMs? })` in `src/maps.ts`, implementing `TravelTimeProvider` (`status: 'ready'`):

- Posts to the one fixed Google URL (no user-controlled host, `redirect: 'error'`), the key only in the `X-Goog-Api-Key` header, addresses only in the JSON body, `timeoutMs` default 10000.
- Mode map: car to `DRIVE`, bike to `BICYCLE`, transit to `TRANSIT`, walk to `WALK`.
- Minutes: the first route's `duration` seconds divided by 60 and rounded up, never above 600.
- Failures throw `MapsError` with a `code` and a plain `message` that never contains the key: `key` (HTTP 401 or 403: "Google rejected the key. Check that the Routes API is enabled for it and that billing is on."), `quota` (429), `address` (400 or 404: "Google could not find one of the addresses."), `no-route` (an empty answer: "Google found no route for that mode."), `offline` (network failure or timeout), `bad-response` (anything else, including malformed JSON).
- The server reads `GOOGLE_MAPS_API_KEY` (and optional `GOOGLE_MAPS_REGION`, `MAPS_MONTHLY_LIMIT`) from its environment at startup and builds the provider only when the key is a non-empty string. The key is never stored in state, never sent to the browser and never logged.

## Server

- `GET /api/commute/status` keeps `{ maps }` and adds `usage: { month, count, limit }`.
- `POST /api/commute/lookup` with `{ today, commuteId }`:
  - 400 for a missing, unknown or typed (non-Maps) commute; 503 `{ error }` when there is no provider.
  - Resolves the two places. A place with no address gives `{ ok: false, code: 'address-missing', message: 'Add an address to NAME first.' }`.
  - If this month's count is at the limit it gives `{ ok: false, code: 'limit', message }` without calling Google. The month rolls over by `today`.
  - Otherwise it calls the provider. The attempt counts toward the month even if Google fails.
  - It re-reads the state after the network call, sets `found` on that commute only, adds the count, and saves, so a save made by the browser during the call is not overwritten. If the commute is gone by then, nothing is saved.
  - It answers `{ ok: true, minutes, at }` or `{ ok: false, code, message }`. A failed lookup keeps the previous `found`.
- `POST /api/commute/refresh` with `{ today }`: looks up, one at a time and at most 10 per call, every Maps commute whose `found` is missing, older than 14 days, or for different addresses. It answers `{ updated, failed, skipped }` and stops at the first `key`, `quota` or `limit` failure.
- Nothing here changes how the planner plans: it only reads `minutesFor`.

## Browser

- The Maps choice and its hint use `maps` from the status as now. The hint says "Google Maps is not connected yet" until the key exists (also telling the user where the setup guide is).
- The commute form, when Maps is chosen, shows one line: "Google found 55 min on 12 Oct." or "Not looked up yet. Using your typed 40 min.", a **Refresh now** button, the last failure message in plain words, and "Used 12 of 5000 lookups this month."
- For walk and bike, the form also shows: "Walking and bicycling routes may be missing sidewalks or bike paths. Check the time before you rely on it."
- Saving a Maps commute triggers one lookup, then a replan. The store gains `lookupCommute(id)` and `refreshCommutes()`; on load, after the plan, the browser calls refresh once, best effort (any failure is ignored), and replans if anything was updated.
- Each lookup result is shown only in that form; Nudge and warnings are not involved. UI rules still apply (no emojis, no gradients, no inline styles, text through `h()`, real buttons).

## Setup guide

`docs/google-maps-setup.md`: create a Google Cloud project, turn on billing, enable the Routes API, create an API key and restrict it to the Routes API, set a Google budget alert, start the server with `GOOGLE_MAPS_API_KEY=... npm run serve`, check the Commutes screen, and what each message means. It says never to paste the key into the app or commit it.

## Error handling

- No key, network, route or quota: the typed fallback is used and the form says why.
- A hostile address or place name is sent as data in a JSON body and shown as text only.
- A mode or provider failure never fails a replan: `minutesFor` is pure and reads only saved data.
- Two lookups at once for one commute: the later save wins and both counts are kept.

## Testing

- **Provider** (fake `fetchFn`, recorded answers): each mode's request body and headers (key only in the header, field mask, no `routingPreference`), a normal answer, rounding up, the 600 clamp, empty routes, malformed JSON, 400, 401, 403, 404, 429, 500, a thrown network error and a timeout; the key never appears in any message; the region code is added only when set.
- **minutesFor and legs:** typed unchanged, `found` used, fallback when `found` is missing or either address changed.
- **Validation:** `found` and `mapsUsage` rules and old files.
- **Endpoints** (fake provider): success stores `found` and counts; no provider is 503; unknown and typed commutes are 400; a missing address; the monthly limit and its rollover; a failure keeps the previous `found`; a save during the call survives; refresh picks only stale ones, caps at 10 and stops at the first key or quota failure.
- **Browser:** the form lines for found, not yet looked up and failure; the walk and bike warning; Refresh now; saving triggers a lookup; the load refresh is best effort.
- **End to end:** the real server with a fake provider: add Home and Campus with addresses and a Maps commute, see the lookup, and see the planner's travel leg use the found time plus margin.

## Out of scope

Autocomplete or place lookup, traffic-aware or departure-time routing, a map picture, storing the key anywhere but the environment, Distance Matrix, a real call in the test suite, and refreshing on a timer while the app stays open.
