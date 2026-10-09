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

## Setup (boards H, M, N, O)
- Click **Setup** in the top bar. A "Setup" title with a mono sub-navigation (Commitments, Tasks, Due dates, Preferences), the current one underlined in vermilion.
- Left: the list. The selected item is a black block. Right: the form with labeled fields, Starts / Ends / Buffer in a row, the Once and Weekly choice, seven weekday toggles (M T W T F S S), cancelled-date chips with Add date.
- Make a mistake on purpose (an end time before the start): a vermilion "Nothing was saved." block with the reason, and what you typed is still there.
- Try Add a commitment, Save, then look at the Week screen. Try Delete on a task: it asks first and tells you how many due dates go with it.
- Tasks, Due dates and Preferences were drawn as boards M, N and O: they should match those.

## Things to report back
Anything that differs from the boards: spacing, sizes, colors, wrapping, fonts not loading (text in a plain system font), overlaps at your window width.

## Known differences on purpose
- The Week screen shows a "Booked" line per day (from the spec); board D does not.
- Prev, Today and Next buttons sit in the header (the Day board shows the same pattern).
- The tabs show only sections that exist; Day, Deadlines and Setup arrive in the next plan.

## Places and Commutes (boards P, Q)
- The Setup sub-navigation now has six tabs: Commitments, Tasks, Due dates, Places, Commutes, Preferences.
- **Places:** list rows show the name, the kind and the address, or "Address missing". The form has Name, Kind, Address, and a hint about the travel allowance.
- **Commutes:** the form has From, To, Repeats (Every week, Every month, Per lesson), the day toggles, then "I type it" selected and "Google Maps finds it" dashed and dimmed, minutes, safety margin, the travel-mode segments (Car, Bike, Bus, Walk), a grey note that Maps is not connected, and "How a day looks": hatched grey commute blocks around a vermilion event.
- **Commitments** now have a Place select, and **Preferences** a Travel allowance field.
- **Week:** load the example. Tuesday and Thursday show hatched grey "Commute 55" entries around the chemistry lecture; Sunday shows the parish trip marked "estimated"; Wednesday shows the trip to Anna marked "estimated". The Nudge shows "Anna has no address and no commute, so I used 30 minutes of travel."
- Delete the Home place: the Week shows "Travel is off. Add a Home place." and the hatched entries disappear.
- Delete the Campus place: the confirmation says its commute goes too and how many commitments lose their place.

## Day, Deadlines and Settings (boards F, G, L)
- The top bar now has four tabs: Day, Week, Deadlines, Setup. Settings lives in the Menu.
- **Day (board F):** a big title like "Wed 14"; Tue / Today / Thu buttons (arrow keys on the title also step days); on the right a small column with the week line, "Booked", and "All clear" or "N need you". The left list has the time, then the block with its label and name, then the length. Dashed rows are buffers before an event, hatched grey rows are travel, and grey "Free 10:20–15:30 / 5h10" lines mark the gaps. On the right, "Today by group" with a swatch per group and the big free-time number for the day's window. Load the example and open a Wednesday to see the lesson with its buffer and the trip to Anna.
- **Deadlines (board G):** big day numbers with the month, weekday and "in N days"; the title and "Category / Task"; a bar with black for done, vermilion for planned and a dashed vermilion outline for short; "Done / Planned / Short" under the bar; a vermilion "Short NN min" chip, or an outlined "Covered" or "Later" chip. Top right: how many are open and how many are short. Due dates 14 or more days away say "Later" because nothing is planned that far yet.
- **Settings (board L):** three groups with a thick top rule: Theme (Light, with a dimmed Dark tagged "Later"), System notifications (Off / On, with a hint), Soft time (Ask first / Automatic). Choosing Automatic saves straight away; check the Week afterwards. Turn notifications On: the browser asks permission. Then switch to another tab. About every five minutes the hidden page asks the server for a fresh plan, and a browser notification appears if a new warning has shown up. It never appears while this tab is in front. (To test sooner, change something in Setup in a second window and wait.)
