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
