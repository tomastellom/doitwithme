# doitwithme

A personal everyday planner. It fits flexible tasks (study, gym, chores, errands, projects) around your fixed commitments, ramps up work toward deadlines, and tells you plainly when something cannot fit.

**Status:** Phase 1 (core planner). There is no graphical UI yet; it is waiting on design references. Design: `docs/superpowers/specs/`. Plan: `docs/superpowers/plans/`.

## Requirements

Node 22.18 or newer (developed on Node 25). No npm dependencies.

## Use it

```
npm test                                   # run all tests
mkdir -p data && cp examples/sample-state.json data/db.json
npm run plan                               # print the next 14 days from data/db.json
npm run plan -- --save                     # same, and save the generated blocks
npm run serve                              # local API on http://127.0.0.1:8787
```

Your real data lives in `data/db.json`, which git ignores. Edit it by hand or through the API:

- `GET /api/state` returns everything.
- `PUT /api/state` replaces it (validated; bad input is rejected and nothing is written).
- `POST /api/replan` with `{ "today": "2026-10-05", "nowMinutes": 780, "horizonDays": 14 }` re-plans from today and saves.

## How planning works

- Fixed commitments (with optional buffer before, and cancelled dates) are never moved.
- Each task asks for a weekly amount; each deadline asks for total effort by its date. The daily amount is the remaining work divided by the days that can still hold it, so it rises as the date nears.
- Higher `priority` (1 is highest) wins when time is short.
- Friday and Saturday evenings are "soft": avoided, but study may use them as a last resort (a deadline would be missed, or a weekly study target would fall short), and then the plan says so. Chores, gym and errands never take them.
- Past days are never rewritten when you re-plan.
