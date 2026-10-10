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

## Nudge faces and the Week title (boards R, S)
- **Week title:** a smaller title with the dates, like "12–18 Oct" (or "28 Sep – 4 Oct" when the week crosses a month). The week number is now the first line on the right ("Week 42 / 2026"). Prev, Today and Next stay in the same place whatever the text on the right says.
- **Nudge corner:** hover the bottom-right corner (a 200 by 180 px area) and he rises; move away and he drops fully out of sight. Click him: he blinks once.
- **Faces (board R):** resting while all is well, a glance to one side every few seconds while you hover, surprised for a moment when a new warning arrives, a side glance when he has an offer, worried when a warning has no offer, working while the app saves or replans, happy after you accept a suggestion, sleepy when he cannot reach the planner, celebrating when everything due in the next seven days is covered. Thinking, blink (apart from the click) and peeking are drawn and ready; thinking is for the AI estimate later.

## Course details and the scale fields (boards T, O)
- **Preferences:** three new fields in the same style as the others: Hours a week per credit (optional), Credits in a normal semester, Study hours a week at a full load. Labels that wrap to two lines must not push their box lower than the neighbours in the same row.
- **Tasks, a Study task:** a "Course details" block under a thick rule with Credits, Difficulty (1 very easy to 5 very hard), three Yes/No choices (graded by exams only, weekly graded work, has a lab), a Syllabus box and an Estimate hours button. A task that is not Study shows none of this.
- **Estimate hours:** press it with credits filled in. A card appears with a vermilion bar on its left, the hours in big type, one sentence, a "Rule of thumb" tag, Use this and Keep mine, and a grey line saying the AI is not connected yet. Use this fills "Minutes a week"; Keep mine just closes the card. Nudge shows his thinking face while it works. Without credits the button explains what is missing.

## Click to edit (boards U, V, G)
- Click a lecture on the Week: the page dims on the left and a panel slides in from the right with the class, its days, the time, a dashed "Skip this day" box, the fields (Title, Category, Place, Starts, Ends, Weekdays), Save, Discard changes and Delete. Esc, Close and clicking the dimmed area close it.
- Skip a Tuesday: only that Tuesday disappears; Thursday stays.
- Click a planned study block: the panel says it was planned for you and offers Edit the task and See its due dates.
- Click a hatched trip: it says where its time came from, with Add a commute or Edit the commute and Edit the place.
- The Day screen does the same. Tab stays inside the panel. Pressing `/` in the panel does not open the Menu.
- Deadlines: a vermilion "+ Add a due date" top right and the caption "Click a row to edit it". Rows highlight on hover and open the due date's form.
- When a button sends you to another screen (Edit the task, an Edit link, a Deadlines row), that screen starts at the top, not scrolled down.

## Look and motion
- The background is pure white; buttons and tabs are Bricolage Grotesque, semi-bold, normal case; mono is only for times, counts and small labels. Page titles are 84 px at most.
- Changing tab slides the old screen out and the new one in (about half a second). Stepping a day or week keeps the title row, the Previous, Today and Next buttons and the filters still; only the plan slides.
- The Menu settles in from slightly larger with its columns rising one after another, and eases away when closed.
- Nudge keeps one picture while his face changes: bar eyes glide, other faces cross-fade. Hover the bottom-right corner when nothing is wrong: a short bubble with a text box appears; click him to jump into the box. He answers that real answers arrive with the AI phase.
- Small buttons (the Day stepper, the Nudge pager, Setup and panel buttons) fill on hover and press down a pixel on click.
- With macOS "Reduce motion" on, none of the motion plays.

## Time grid, adding and hours (board Y)
- **Week and Day are time grids.** An hour axis down the left, a thin line per hour, every tile at its real time and as tall as its length, blank time left blank. Today has an ink header and a thick line for the current time. Short tiles show only name and start; long ones add the label and the end. Nothing should be cut off; the full text is in the tooltip.
- **Adding.** Click empty space on a Week or Day column: a panel opens on that day at the clicked time (snapped to a quarter hour). A "+ Add" button in the title row does the same for keyboard users. On the Month every day shows a "+" on hover (always on touch screens). Add needs a title and saves a one-time commitment.
- **Month.** One dot per planned item in the label colors, "+N" past eight, a vermilion "Due" tag, today in ink. Click a day to open it.

## Navigation, Labels and Settings (boards AA, AB)
- **Top bar.** Day, Week, Month, Deadlines, then Plan and Settings set a little apart; on the right a vermilion "+ New" (it asks: something at a set time, a task, a due date, or a label), Menu and Replan.
- **Plan** (it used to be called Setup) has Commitments, Tasks, Due dates, **Labels**, Places and Commutes.
- **Labels.** Every kind of thing is filed under a label. Open Plan > Labels: Class, Study, Gym and so on are listed with their color. Click one to rename it, pick one of twelve colors, choose Filled or Outlined; the preview tile updates. "New label" makes your own. Study and Other cannot be deleted (they say why); deleting any other label moves what used it to Other. The commitment and task forms now say "Label" and list your labels by name. Week, Day and Month tiles, dots, legends and filters all use the label colors.
- **Filters** under the Week list every label in use with its count; "Show all" appears while something is hidden.
- **Settings** is one page in two columns: Calendar (hours shown, From and To, at least four hours apart, remembered in this browser; a tile outside the range stretches it), Look, Notifications, and How I plan (soft time plus the planning rules form that used to be Preferences). `#/preferences` still works and lands here.
- **Nudge** now has a "Fix it myself" button next to his offer and "Leave it": it opens the due date, the task, the place or the day the warning is about.

## Done and not done (board AC)
- **Tick boxes.** Every planned tile on the Week and the Day has a small box at its left edge. Press it: the tile fades, its name gets a line through it, the box fills, and Nudge comes up happy ("Nice. Chemistry done." with the time in the bank). Press the box again to take it back. Trips have no box.
- **Panel.** Click a planned block: "Mark as done" and "I did not do this one". Click a class: "Mark as done" and "I did not go" (that day only). Something already done says "Done." and offers "Mark as not done yet".
- **Not done, for a study or project block.** "I did not do this one" asks what to do with the time: **Find another time** (it stays on the calendar as a dashed "Not done" tile and the minutes are planned again in free time), **Take it off this week** (a dashed "Taken off" tile; the week target drops by that time and nothing replaces it; for a block that belongs to a due date it says "Shorten this by ...") or **Let the AI sort it out** (visible, dashed, "Not connected yet"). Back changes nothing.
- **Month.** Hover a day with things planned: a check mark button beside the "+" opens that day as a checklist; tick things off right there, or press a row to open it. Dots of done items are faded.
- **Nudge** is happy after a tick, and does his confetti face when everything planned for that day is done. The message goes away by itself after six seconds.
