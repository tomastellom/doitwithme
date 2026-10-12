# Daily check-in design

Date: 2026-10-11. Builds on the check-in section of `2026-10-08-study-planner-design.md` (phase 4).

## Goal

Once a day Nudge asks how the user is doing. On a low day the planner keeps only a minimum of generated work today and moves the rest to the next days with room. The user never has to rearrange anything by hand, and can undo it.

## Decisions (from the user, 2026-10-11)

- Three answers: **Good, Okay, Low**, as buttons in Nudge's bubble.
- Nudge asks the **first time the app is opened on a day that has planned work**. Once per day; closing him unanswered is a skip and he does not ask again that day.
- A **Low** day keeps only a **minimum** of generated work (user-set, default 120 minutes). Fixed commitments (classes, lessons, work) never move.
- Nudge wording is **rule-based** for now (no AI key). AI-written wording is later.

## Behavior

- **Good / Okay:** no change to the plan. A short reply, then Nudge rests.
- **Low:** today's generated blocks are capped at the minimum, most urgent first. Blocks already ticked done today count toward the cap and are never removed. The remainder reappears through the planner's normal shortfall logic on the next days with room. Nudge says what moved, e.g. "Kept 2 h today, moved 3 h to Thu and Fri", and offers **"Actually, I'm okay"**.
- **Undo:** answering again with Good or Okay on the same day replaces the Low answer; the next replan restores the day. A low day is derived from the stored answer, so undo needs no special code.
- **Skip:** closing the check-in stores `skipped` for the day. It can be answered later from Nudge's bubble.
- **Not asked** when check-in is switched off, when today has no planned blocks, or when today already has an answer.
- **Day screen:** a Low day shows a small "Light day" tag.
- A Low answer can only be given for today.

## Data

- `State.checkIns?: CheckIn[]` where `CheckIn = { date: DateStr; mood: 'good' | 'okay' | 'low' | 'skipped' }`. One entry per date; a new answer replaces it. Entries older than 60 days are dropped when state is saved.
- `Preferences.lowDayMinutes: Minutes` (default 120, range 0 to 600, whole minutes).
- `Preferences.checkInEnabled: boolean` (default true).
- Existing saved state without these fields loads with the defaults (the same migration path the labels and marks used).

## Planner

- `PlanInput.lowDays?: DateStr[]` and `PlanInput.lowDayMinutes`. `replan` builds `lowDays` from `checkIns` with mood `low`, today and later only.
- On a low day the planner stops placing generated blocks once the day's generated minutes, counting kept done blocks, reach `lowDayMinutes`. Demand it did not place is picked up by the existing logic on later days. No new warning kind is needed; if the moved work cannot fit anywhere before a deadline, the existing "cannot be met" warning appears as usual.
- Soft time (gym, chores, errands) on a low day follows the same cap, since it is generated work.

## Server

- `POST /api/checkin` with `{ mood }` and today's date taken from the server clock. Rejects an unknown mood (400) and never accepts another date. Stores the answer, replans, saves, and returns the new state plus `moved: { minutes, dates }` when the mood is low.
- The state response already carries `checkIns`, so the client knows whether today was answered.

## UI

- **Nudge state `checkin`:** he rises like an alert with the question and three face buttons (real buttons, keyboard reachable, visible focus). Faces: Good happy, Okay resting, Low worried. A small "Not now" closes it as a skip.
- After Low he shows the moved summary and the "Actually, I'm okay" button, then rests on his own after the usual delay. After Good or Okay he cheers briefly.
- **Settings:** a "Daily check-in" on/off row and a "Low-day minimum" row with a number input in hours and minutes style used by the other time rows.
- **Day:** the "Light day" tag.
- UI rules still apply: no emojis, no gradients, no inline styles, all text through createTextNode, and reduced motion respected.

## Wording (rule-based)

A few fixed lines per answer, chosen by date so the same day keeps the same line. Low lines are gentle and never guilt; Good and Okay lines are one short sentence.

## Error handling

- Server unreachable: Nudge shows the existing offline face and the answer is not recorded; he asks again next open.
- Invalid mood or date: 400, state unchanged.
- If replanning fails after a Low answer, the answer is not saved and the previous plan stays.

## Testing

- **Planner:** a low day caps generated minutes; done blocks count toward the cap and stay; commitments are untouched; the shortfall returns on later days; a deadline that no longer fits raises the usual warning; undo (mood changed to okay) restores the plan.
- **Server:** the endpoint rejects bad moods and any date but today; Low returns the moved summary; answers replace each other; old state loads with defaults.
- **UI:** Nudge asks once per day, a skip sticks, nothing is asked when disabled or when the day is empty, the buttons work from the keyboard, undo restores the plan, the Light day tag shows, and the settings rows save.
- **End to end:** open the app, answer Low, see the day shrink and the work move, then undo.

## Out of scope

AI-written wording, mood patterns over the week, asking at a chosen time, and check-ins for days other than today.
