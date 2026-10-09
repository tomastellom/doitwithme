# Visual check: compare the running app with the boards

Nothing in this project can see a rendered page, so the look is checked by a person. Start the app and compare it with the approved boards on the design canvas.

1. Run `mkdir -p data && cp examples/sample-state.json data/db.json` (skip if you already have data), then `npm run serve`, and open http://127.0.0.1:8787.
2. Compare with the boards: https://claude.ai/artifact/TNMnuzerDogRwvQxJSNdPP

## Week (board D)
- Giant "Week NN" title, range and "7 days" on the right.
- Seven day columns: weekday, big day number, a thin muted "Booked" line, blocks.
- Block colors: black fixed, vermilion study, cobalt gym, mustard chores and errands, outlined projects. Each block shows a small label at its top right.
- "Show" filter list at the bottom left with counts. Clicking a row dims it and hides those blocks.
- Today's column has a vermilion top rule.
- Keyboard: Tab to the big "Week NN" title; the left and right arrow keys change week. Focus should stay on the control you used after every action.

## First run (board I)
- Empty the data file (`echo '{}' > data/db.json`, then reload): "Nothing planned yet" text, a vermilion "Load the example" button, dashed empty days.

## Nudge (board J)
- Bottom right: the arch character. Quiet shows "All clear." and a smaller character. With warnings it shows the black bubble, a count badge and the headline.
- Stop the server and press Retry: sleepy eyes, "!" badge, "I can't reach the planner."

## Menu (board K)
- Press `/` or the Menu button: a black full-screen overlay, big "Jump to" field, columns by group, current section in vermilion. Esc closes. Only sections that exist are listed (just Week for now).

## Things to report back
Anything that differs from the boards: spacing, sizes, colors, wrapping, fonts not loading (text in a plain system font), overlaps at your window width.

## Known differences on purpose
- The Week screen shows a "Booked" line per day (from the spec); board D does not.
- Prev, Today and Next buttons sit in the header (the Day board shows the same pattern).
- The tabs show only sections that exist; Day, Deadlines and Setup arrive in the next plan.
