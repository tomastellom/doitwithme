# Friend availability: ask a friend when they are free (and answer)

Date: 2026-10-13. Builds on the Nudge bubble (`public/js/nudge.js`), Settings, and the free-time logic from `2026-10-12-nudge-chat-design.md` (`src/chattools.ts`, `replanCore`, `freeSlots`).

## Goal

Two people who use the planner can ask each other "when are you free for X minutes between these dates?" and get back a list of free times, so they can find a time to study together, hang out, or set up a meeting. The request and the answer arrive inside the app, without either person leaving it. Only free times travel. Titles, places and notes never do.

## Decisions (from the user, 2026-10-13)

- Delivery is **instant, inside the app** (not links or files sent by hand).
- It is for **the user and a few friends** (2 to 10 people), not open sign-up.
- The service is a **ready-made backend: Supabase** (the user chose B over a small relay service and over peer-to-peer). Supabase is chosen over Firebase because privacy is plain database rules and sign-in is built in.
- Nudge is the front door; no new screens.
- **Sign-in is email and password** (chosen by the user, 2026-10-13, over an email link without a password). Supabase Auth stores and checks the password; the planner never stores it.
- **What counts as available depends on the purpose of the request** (confirmed 2026-10-13). The asker picks one of three purposes, and the answering planner works out its slots by that purpose:
  - **Study together:** the answerer's planned study blocks, plus free gaps inside the day windows. Sharing a study block does not move it.
  - **Hang out:** truly free time, including the evenings the answerer keeps free (soft windows), which normal planning leaves out.
  - **Meeting:** free gaps inside the day windows only; protected evenings and day-off windows are left out.
  - Classes (with buffers), commute legs and all other planned work are never available, whatever the purpose.

## Assumptions to confirm on review

- The person asked always decides what to send; nothing is sent automatically.
- First version has no shared-event creation, no group requests, no phone push.

## The whole feature, in order

1. **This spec:** sign-in, connections, one-to-one availability requests and answers, shown through Nudge and a Friends row in Settings.
2. Later, each with its own spec: asking from the Nudge chat box (needs Nudge chat step 2), creating a shared event, group requests, phone push, Google Calendar.

## What lives where

- **The planner stays on the user's computer.** Events, titles, places and notes never leave it.
- **Supabase holds only:**
  - `profiles`: id, display name, email.
  - `connections`: two profile ids, status (`pending`, `accepted`), created at.
  - `invites`: a short single-use code made by one person to connect with another, expires after 7 days.
  - `requests`: id, from, to, purpose (`study`, `hang`, `meeting`), date range, minimum minutes, optional note (200 characters), status (`open`, `answered`, `declined`, `expired`), created at.
  - `answers`: request id, list of free slots `{date, start, end}` (at most 40), sent at.
- **Slots are computed on the answering person's own computer by the request's purpose** (see Decisions), from the same logic as the chat `free_time` lookup (classes with buffers, commute legs, planned and ticked-off work, day windows, evenings kept free), then shown for approval before sending. An answer slot carries its kind (`study block` or `free`) so the asker sees which it is.
- **The overlap** is computed on the asker's computer from the friend's answer and the asker's own free time. It is never stored on Supabase.

## How a request works

1. The asker picks a friend in Settings, a purpose (Study together, Hang out or Meeting), a date range, a minimum length and an optional note, and presses Ask.
2. The friend's planner, while open, checks for new requests every 15 seconds. Nudge comes up with "NAME asks when you are free to study together for 2 h, Mon 20 to Fri 24" (the purpose in plain words).
3. His bubble shows the friend's own free slots as tick-boxes, all ticked, with Send and Decline. Nothing is sent until Send.
4. The asker's planner picks up the answer on its next check. Nudge comes up with the slots and which of them are also free for the asker. Okay dismisses it.

## Pieces

- `src/share.ts`: the sharing logic, with no network: building the free slots for a request, the overlap of two lists, limits and expiry.
- `src/supabase.ts`: a thin client over plain `fetch` (REST), no SDK, with a `fakeShareService` for tests. Same style as `src/anthropic.ts`: one `post` helper, plain error sentences.
- `src/sharestore.ts`: the signed-in session and the last-seen request ids, in their own file beside the data file (`db.share.json`), never inside the planner state (the browser saves the whole planner state back, and a stale tab must not erase a session).
- `src/server.ts`: `/api/friends` (list, invite, join, disconnect), `/api/share/requests` (list, create, answer, decline), `/api/share/session` (sign in, sign out). The browser never sees the Supabase session; the local server holds it.
- `public/js/friends.js` and a Friends row in Settings; `public/js/nudge.js` gains the incoming-request and incoming-answer items using the existing item and badge flow.
- `supabase/schema.sql`: tables and row-level security rules, kept in the repo and applied by the user to their own Supabase project. `docs/supabase-setup.md` explains it in plain steps.
- `src/validate.ts`: validation of the new routes.

## Privacy and safety

- Only free times and the note travel. Row-level rules mean you can read a request or answer only if you sent or received it; you can only ask people you are connected to; disconnecting deletes the requests and answers between the two.
- Names and notes from a friend are shown with `textContent`/`h()` as plain text and are data, never instructions. They are never put into the Nudge chat AI prompt in this version.
- The planner holds only the Supabase URL and the public (anon) key. Real protection is the database rules, which have their own tests. The user's session is kept in `db.share.json` and never printed or logged.
- Sign-in is email and password through Supabase Auth. The planner sends the password only to Supabase over HTTPS, never stores or logs it, and keeps only the session tokens. Supabase's own email verification is turned on, and "forgot password" sends a reset email. The password must be at least 10 characters.
- No emojis, no inline styles (CSP), no gradients, consistent with the rest of the UI.

## Limits

- 20 friends; a request covers at most 30 days; at most 10 open requests to one friend and 50 a day in all; a note is 200 characters; an answer holds at most 40 slots; requests expire after 7 days; answers are deleted 30 days after they are sent.

## Errors

Plain sentences, like the AI ones: "I could not reach the sharing service.", "NAME has not answered yet.", "That code did not work.", "You are not signed in." Signed out or offline, the planner works exactly as it does today and Friends shows "Not connected".

## Cost

Supabase's free tier covers a few friends. No new paid service.

## Testing

Supabase is replaced by a fake service in every automated test, so no test touches the network.

- `share`: slots for each purpose (study offers study blocks and free gaps; hang out includes protected evenings; meeting leaves them out); slots never overlap a class, commute or non-study planned work, respect day windows and evenings kept free, and handle midnight and daylight-saving edges; overlap of two lists; limits and expiry.
- `supabase` client: each failure maps to one plain sentence and never echoes the response text or the key.
- Server: bad input rejected; only the expected files are written; signed-out behavior.
- Frontend: Friends row (invite, join, disconnect); Nudge shows an incoming request; nothing sends before Send; Decline; the answer view; offline.
- Database rules: a test file run against a throwaway Supabase project proves a third person cannot read or write a request between two others.
- One manual check with two real accounts, by the user, steps added to `docs/ui-visual-check.md` once built.

## Out of scope

- Group requests, creating or inviting to a shared event, Google Calendar, asking from the Nudge chat box, phone push, open sign-up, showing a friend's actual events.

## Open items for the plan

- The exact SQL for row-level rules and the cleanup of expired rows.
- How the verification and password-reset links in Supabase's emails return to a planner running on `localhost`.
- Whether the 15-second check should slow down when the tab is hidden.
