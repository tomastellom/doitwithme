# doitwithme

A personal everyday planner. It fits flexible tasks (study, gym, chores, errands, projects) around your fixed commitments, ramps up work toward deadlines, and tells you plainly when something cannot fit.

**Status:** Phase 1 (core planner) and the everyday UI are built: Day, Week and Deadlines screens, Nudge, Menu, Settings (soft time, opt-in browser notifications), and the Setup screens (commitments, tasks, due dates, places, commutes, preferences). Travel between places is planned around your events and shown in the Week; you type the travel times for now. Run `npm run serve` and open http://127.0.0.1:8787; you no longer need to edit JSON to enter your schedule. Compare the look with the design boards using `docs/ui-visual-check.md`. A study task can now suggest its weekly hours from credits, difficulty and a few answers, scaled to your school (the real AI answer plugs in once a key exists). Still to come: the Google Maps lookup for commute times, the real AI call, the daily check-in and class-attendance advice. Design: `docs/superpowers/specs/`. Plans: `docs/superpowers/plans/`.

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
- `POST /api/soft/approve` and `POST /api/soft/undo` (with a `date`) allow or take back Friday and Saturday evenings; `POST /api/warnings/dismiss` (with a `key`) dismisses a warning.
- `GET /api/example` returns the example schedule without saving it.
- `POST /api/estimate` suggests weekly minutes for a study task from credits, difficulty and a few answers (rule of thumb, plus an AI answer when one is connected); it saves nothing.
- `GET /api/commute/status` says whether Google Maps can be used (`unavailable` until a key is connected). Plan responses also carry `travel`, the trip blocks for the plan.

## How planning works

- Fixed commitments (with optional buffer before, and cancelled dates) are never moved.
- Each task asks for a weekly amount; each deadline asks for total effort by its date. The daily amount is the remaining work divided by the days that can still hold it, so it rises as the date nears.
- Higher `priority` (1 is highest) wins when time is short.
- Friday and Saturday evenings are "soft". By default (`softMode: "ask"`) the planner never uses them by itself: when study would fall short it offers a date and waits for your yes. With `softMode: "auto"` it uses them for study as a last resort and tells you. Chores, gym and errands never take them.
- Past days are never rewritten when you re-plan.
