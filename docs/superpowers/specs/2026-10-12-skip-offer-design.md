# Attendance advice, piece 3: Nudge offers to skip a class

Date: 2026-10-12. Builds on `2026-10-11-attendance-design.md` (piece 1, built) and the soft-evening offer already in Nudge.

## Goal

When skipping an upcoming class would really help the user catch up, Nudge says so and offers to skip it. Skipping is still the user's choice, one press, and can be undone.

## Decisions (from the user, 2026-10-11)

- Nudge looks at classes in the **next 3 days**, today included.
- The offer is made only when skipping helps: the rule says **Skippable** and a trial plan without that class shrinks the study shortfall.
- Skipping reuses the class's `exceptions` (the same as "Skip this day"). Nothing else changes.

## When an offer exists

A class occurrence gets an offer when all of these hold:

1. The class has a `courseId`, a `weekly` pattern, and the date is within today to today plus 2.
2. `attendanceFor` gives it the verdict `skippable` (attendance counts 0%, recorded, and the linked task is behind).
3. A trial plan with that date added to the class's exceptions leaves the linked task's shortfall (the total `detail.minutes` of its `weekly-short` and `deadline-short` warnings) at least `preferences.minBlock` minutes lower than the plan without the skip. `gain` is that difference.

Each qualifying occurrence produces one offer. An occurrence already in the exceptions has no advice and so no offer.

## Server

- `replan` is split: `replanCore` is today's behavior and never makes offers; `replan` calls it, then adds offers. The trial plans call `replanCore`, so there is no recursion.
- The offers are `Warning`s of a new kind `skip-offer`, added before the dismissal pruning so dismissed keys behave like any other warning. `detail`: `{ commitmentId, commitmentTitle, taskId, taskTitle, date, start, minutes }` where `minutes` is the gain. `WarningDetail` gains `commitmentId?`, `commitmentTitle?` and `start?`.
- Message: `${commitmentTitle} on ${date} could be skipped to catch up ${minutes} min of ${taskTitle}`.
- `warningKey` for `skip-offer` names the class and the date (`commitmentId` joins the other identifying fields) and never the minutes, so a dismissal survives the minutes changing.
- Cost: at most the classes in a 3-day window, one trial `replanCore` each. If a trial throws, that class simply gets no offer; offers can never fail a replan.
- Skipping and undoing need no new endpoint: the browser saves the class's exceptions through the state it already reads and writes, then replans.

## Browser

- **nudge-model:** a `skip-offer` warning becomes an item with its own offer: `{ kind: 'skip', commitmentId, date, minutes, button: 'Skip it', line }`. Headline: `${title}, ${when} ${hh:mm}, is recorded and counts 0%.` (`when` is Today, Tomorrow or the weekday). Line: `Skipping it frees ${duration} for ${taskTitle}. I will only do it if you say so.` Skip offers are not counted in "needs you" (nothing is wrong), and are paged like any other item. The existing offers keep `kind: 'soft'`.
- **Nudge handlers:** the single `approve(date)` becomes `accept(offer)`, which main.js routes by `offer.kind`: soft goes to `store.approve(offer.date)`, skip goes to `store.skipClass(offer)`. Buttons for a skip item: Skip it, Fix it myself (opens the class on that day), Leave it.
- **store:** `skipClass(offer)` reads the freshest state, adds `date` to that class's exceptions if it is still there and still weekly, saves, replans, and sets `confirm` to `{ skip: { commitmentId, date, title, minutes } }`. If the class is gone or no longer qualifies it replans and sets the existing "That class changed, so I refreshed the plan." notice. `undoSkip(skip)` removes the date from the exceptions and replans, clearing `confirm`.
- **Confirm bubble:** "Skipped. ${duration} of ${taskTitle} moved in." with Okay and Undo. Nudge's face is happy while it shows, and it rests after the usual delay.
- **Notifications:** a new skip offer is a new item, so the existing opt-in browser notification may fire for it when the tab is hidden, like any new warning. No change to that module.
- UI rules still apply: no emojis, no gradients, no inline styles, all text through `h()`, real buttons, keyboard reachable.

## Error handling

- Offline or failed save: the existing offline and error faces; nothing is skipped.
- A class edited or deleted in another tab between the offer and the press: no skip, refreshed plan, plain notice.
- A skip that does not actually help after replanning (the situation changed): it still applies, because the user asked; the confirm shows the minutes from the offer.

## Testing

- **Planner/replan:** an offer exists only when the trial gain is at least `minBlock`; none for a class outside the 3-day window, a non-weekly class, an advice verdict other than skippable, an already-skipped date, or when skipping gains nothing (nothing else to study). `replanCore` makes no offers. Replanning twice gives the same offers. A throwing trial gives no offer and no failure.
- **warningKey:** the same class and date give the same key as the minutes change; a different class or date gives a different key.
- **nudge-model:** the headline and line for Today, Tomorrow and a weekday, not counted in needsYou, `kind: 'skip'`, and that soft offers are unchanged.
- **Nudge:** Skip it, Fix it myself and Leave it fire the right handlers; the confirm bubble shows Okay and Undo.
- **store:** `skipClass` adds the exception once, `undoSkip` removes it, a vanished class gives the notice, and a failure reports offline.
- **End to end:** behind on a recorded zero-weight course with a class tomorrow: Nudge offers it, "Skip it" frees the slot and the shortfall shrinks, "Undo" brings it back.

## Out of scope

Reading the syllabus (piece 2), offers beyond 3 days, skipping classes that are not weekly, offers for lessons or work, and any automatic skipping.
