# UI redesign: soft panel, a sidebar, and plain words

Date: 2026-10-13. Replaces the look and navigation chosen in the 2026-10-09 to 2026-10-12 UI work (`2026-10-10-ui-foundation.md` and later screens). Nothing about what the planner does changes.

## Goal

The planner looks finished, and a person can find a screen and set things up without being told how. The user's words (2026-10-13): it "looks rough and isn't intuitive at all"; hard to find things, too much on screen, looks unfinished, too many steps, and "too Claude-y". The confusion is mostly "hard to understand when I try to do things", in **setting things up** and **finding a screen**. The user mostly plans the week.

## Decisions (from the user, 2026-10-13)

- **References they like:** Apple Calendar / Fantastical, Linear / Arc, Notion Calendar / Cron (calm, sharp, little chrome around the time grid).
- **Direction:** the quiet look (white, hairlines, soft tinted blocks), **with a left sidebar**, in the **soft panel** style: light grey canvas, the screen floating on a rounded white panel, rounder blocks, a black New button. Not the cream, serif, terracotta look.
- **Three kinds of things** is how they think (fixed times, things that need time, things due on a date). The model stays; the words and the structure change.
- **Keep "Booked" hours:** the small per-day line on the Week (and Day) stays.
- **Keep all 12 Nudge faces exactly** (resting, glance left and right, blink, happy, sleepy, surprised, thinking, worried, working, celebrating, peeking). Only his bubble changes. He keeps living on his corner and the chat stays in his bubble.
- **Rollout in slices, Week first.**
- Dislikes carried over: a special mouse cursor over blank space, lime, beige, blinky or fading transitions, oversized text, emojis, gradients, purple, inline styles (CSP).

## The look

- **Tokens:** canvas `#eceef2`; panel `#ffffff`; ink `#14161a`; muted text `#5d636d`; hairlines `#eceef1`; accent vermilion `#ff4b1f` (only for the main action in a form, in Nudge's bubble, today's date and the now-line). Final values are set in the CSS variables in `public/css/app.css` while building and checked for contrast.
- **Type:** Bricolage Grotesque (headings 800, body 400/600) and DM Mono (times, small labels), both already self-hosted. Page titles about 28 px (down from 84). Day numerals about 22 px.
- **Blocks:** each block is tinted from its **label's own color** (about 15% of that color as the fill, a darker shade of the same hue for the text, computed), so the colors the user already chose keep working. A computed text color must reach 4.5:1 on its tint; a label color too pale for that gets its text darkened until it does. Radius about 10 px. A ticked block fades; a not-done block is dashed.
- **Panel:** white, 16 px radius, soft shadow, on the grey canvas.
- **Motion:** unchanged where it exists (slide between screens, Nudge's slide); nothing new that blinks or fades.

## The shell

A left sidebar replaces the Menu overlay:

- **Brand** and a black **+ New** button.
- **Plan:** Week (home), Day, Month.
- **What goes in:** Fixed times, To do, Due dates.
- **Details:** Places and travel, Labels.
- **Settings.**
- Under the sections, the **labels** list: each is also an on/off **filter** for the Week, Day and Month (it replaces the "Show" list). Counts show how many items each has in view.
- **Narrow windows:** the sidebar becomes a Menu button that slides it in. Pressing **/** still opens the jump-to search; **n** opens + New.
- The top of the panel holds the screen title, Previous / Today / Next where they apply, and the Day / Week / Month switch.
- Nudge's corner is unchanged in position.

## Screens

- **Week (home):** header with title (for example "12 to 18 October"), the switch, and a "N need you" chip when there are warnings that brings Nudge up. Seven day columns: weekday (mono, small), the date numeral, and the **Booked 3h25** line. Today's column has a faint tint, a vermilion numeral and a vermilion now-line. The time grid keeps 56 px an hour and the hours chosen in Settings. Clicking a block opens its panel; clicking empty space starts adding with that day and time filled in; ticking a block fades it.
- **Day:** the same panel, one column of time with its buffers (dashed), travel (hatched) and free gaps, and a right column with Booked, the free-time total and "Today by label".
- **Month:** the same panel with one tinted dot per planned item; clicking a day opens it.
- **First run:** "Nothing planned yet. Start with what is fixed: classes, work, lessons." with **Add a fixed time** as the main button and **Load the example** beside it.
- **Setup screens (Fixed times, To do, Due dates, Places and travel, Labels):** the same layout each: title, one plain sentence about what it is for, example chips, the items as rows (label color, name, one-line summary such as "Mon, Wed 10:00 to 12:00"), one add button, and a "Next:" hint pointing at the next step. A row opens its edit panel.
- **Settings:** one page: the hours shown, look, notifications, how I plan (planning rules stay on this page), in the same plain words.

## Names and merges

| Today | New |
|---|---|
| Commitments | **Fixed times** (classes, work, lessons, gym) |
| Tasks | **To do** (things that need time but no set time) |
| Deadlines (a view) and Due dates (a setup page) | **Due dates**, one screen: what is due, whether it is covered, and add or edit |
| Places and Commutes | **Places and travel**, each place listing its commutes |
| Labels | Labels |
| Settings and Planning rules | Settings |

Route ids stay where a screen keeps its meaning. Old addresses forward: `#/commitments` to Fixed times, `#/deadlines` to Due dates, `#/commutes` to Places and travel, `#/preferences` to Settings.

## Adding things

**+ New** asks what kind of thing it is in three sentences, each saying where it goes: "Something at a set time" (Fixed times), "Something that needs time" (To do), "Something with a due date" (Due dates). Each opens the existing edit panel as a short form with only the essentials, a **plain-sentence read-back** of what will be created ("Chemistry lecture, every Monday and Wednesday, 10:00 to 12:00, at North campus, starting 12 Oct"), and rare options behind **More options**. The fields and the rules behind them do not change.

## Nudge

The twelve faces and their rules (`faceFor`, glances, startle, peek) are untouched. The bubble becomes a white, rounded card with a soft shadow, plain sentences, **one** main button in vermilion and the other choices quiet. The chat box, "Looked at N items", the question line and Earlier keep their behavior. (A dark bubble was shown as an option; white is the default unless the user asks.)

## Rollout in slices

Each slice ends with something usable and the user's OK before the next.

1. **Shell and Week:** tokens, the soft panel, the sidebar (and its phone-width form), label filters, tinted blocks, the Booked lines, the new Nudge bubble, the first-run screen. Other screens appear inside the new shell without their own restyle yet; the old Menu overlay is removed.
2. **Setup and adding:** renames and merges with forwarding, the setup layout with helper text, + New, short forms with read-back.
3. **The rest:** Day, Month, Settings and the remaining panels restyled to match.

The friend-sharing and Nudge chat steps built later use this look.

## Out of scope

- Any change to what the planner does, to the server, the data, or Nudge's faces.
- Dark mode (still planned, separate), a new mascot, icons or pictures on the calendar.
- Drag-to-move on the grid.

## Risks and how they are handled

- Many existing screen tests count rows and names; they are updated with each slice, never loosened.
- The sidebar and the old Menu cannot both exist; slice 1 removes the Menu in one step.
- Narrow windows need their own layout; slice 1 includes it.
- Label tints from arbitrary user colors: the contrast rule above, with a test.

## Testing

- Unit tests for the tint and contrast rule (including a very pale and a very dark label color).
- Frontend tests (fake DOM): the sidebar sections and the active one; label filters hide and show blocks; the narrow-window button; old addresses forward; the first-run screen; Booked lines; the + New chooser and read-back sentence; the setup layout's helper text.
- Existing e2e tests keep passing with their selectors updated.
- The user looks at each slice in a browser with the steps in `docs/ui-visual-check.md`, which each slice updates (no browser is available to the agent).

## Open items for the plan

- Final token values and the exact tint formula.
- The exact "Next:" text on each setup page.
- Whether "To do" stays as the name (the user was least sure of it).
- The keyboard shortcut for + New (proposed: **n**).
