# Nudge chat, step 1: ask Nudge about your plan (read-only)

Date: 2026-10-12. Builds on the Nudge bubble and its existing "Ask me to move something" box, and on the AI connection from `2026-10-10-workload-estimate-design.md` (`src/anthropic.ts`).

## Goal

The user writes to Nudge in plain words and Nudge answers from the planner: what is on, when something is, and where there is free time. In this step Nudge **never changes the plan**. The chat is the existing Nudge text box made real; it does not move, and no new panel or screen is added.

## The whole feature, in order (from the user, 2026-10-12)

1. **Chat core (this spec):** answers questions, finds an item, finds free time. Read-only.
2. **Proposed changes:** move or skip an event, add a task or event, replan the week. Each is a card with Yes and Undo.
3. **Settings and labels** by asking, with the same Yes and Undo.
4. **Outside info:** web lookups and Google Calendar (needs a search source and Google sign-in).

Steps 2 to 4 each get their own spec. This spec covers step 1 only.

## Decisions (from the user, 2026-10-12)

- Nudge answers, and later proposes changes that wait for a yes (this step: answers only).
- The user chose to share **everything in the planner** with the AI. The design reaches all of it, but sends a compact summary every message and lets the AI look the rest up (see Approach).
- **History is kept between visits.**
- In the bubble the user sees **the latest exchange only**; an "Earlier" button inside the bubble opens saved history.
- Approach C: compact summary every message plus lookup functions.

## Approach

Each message sends:

1. A fixed system prompt (rules, voice: short, plain, friendly, no emojis).
2. A **compact summary**: today's date, the planner's day windows, and for the next 4 weeks the titles, dates and times of events, tasks, blocks and deadlines. No addresses, notes or syllabus text in the summary.
3. The last 10 exchanges of history.
4. The user's new text.

The AI may call two read-only functions (the server runs them locally):

- `find`: search events, planned work, tasks, deadlines and courses by words and/or a date range of up to 366 days per call (the AI can call it again for another range). This is how "everything in the planner" is reachable. Results include addresses, notes and syllabus text only when the question needs them, and are size-capped.
- `free_time`: free gaps of at least a given length between two dates, up to 60 days ahead. Computed from the planner's own plan (`replanCore`: commitments with their buffers, commute legs, planned and ticked-off work) and `freeSlots`, so a slot can never overlap any of them. It respects the day windows and leaves out the evenings the user keeps free (soft windows), as the planner does.

The server loops (AI answer, run requested function, send result back) until the AI gives its final text, with a **limit of 5 function calls** per message.

## Pieces

- `public/js/nudge.js`: the existing ask box sends text to `POST /api/chat`, shows "Thinking" while waiting, then the answer. Failed message: the text stays in the box. "Earlier" button opens saved history inside the same bubble (scrolls inside it). No new section, panel or menu entry.
- `src/server.ts`: `POST /api/chat` validates the request, loads state, calls `chat`, appends the exchange to history and saves state. It writes nothing else.
- `src/chat.ts`: builds the summary, runs the loop, enforces the call limit and the history window.
- `src/chattools.ts`: `find` and `free_time`.
- `src/anthropic.ts`: a chat call next to the estimate call, sharing the key, model (`claude-haiku-5-5`), timeout and error messages.
- `src/chathistory.ts`: the saved chats and the daily counter, in their own file next to the data file (`db.chat.json` beside `db.json`), not inside the planner state. The browser saves the whole planner state back to the server, so history kept inside it could be overwritten by a stale page.
- `src/validate.ts`: request validation for `/api/chat`.
- The "Earlier" view in the bubble also holds the plain line about what Nudge chat sends and a "Clear history" button with a confirm. There is no new Settings row.

## Safety

- Titles, notes, course names and syllabus text are **data, not instructions**. They go in the prompt inside labeled blocks, with a closing tag in any spelling defused, the same way the estimate call treats the syllabus. A title written as one line cannot fake another line of the request.
- Read-only is enforced by the code: the AI can call only `find` and `free_time`, neither writes, and `/api/chat` only appends to history. A suggestion such as "move gym to Thursday" is plain text in this step.
- The key is read from `DOITWITHME_ANTHROPIC_KEY` only and never printed, as today.
- The Earlier view states plainly: "Nudge chat sends your plan and recent chat to Anthropic." The bubble shows how many items were sent in the last message.

## History and limits

- Stored in `db.chat.json` next to the planner data file: `{ at, question, answer }`, newest last, capped at the latest **200** exchanges.
- Only the last **10** exchanges go to the AI in each message.
- A cap of **30 chat messages per day** (counted by the server) protects against a stuck loop or a leaked key. The bubble says when it is reached. The Anthropic spend limit remains the final safety net.
- A failed exchange (error, timeout) saves nothing to history, but it still counts toward the daily limit, because the AI may have billed for it.
- A single message is limited to 1,000 characters.

## Errors

The existing messages are reused (key rejected, no credit, busy, slow, declined, unreadable answer, offline). No key: the box says the AI is not connected and points to `docs/anthropic-setup.md`. Daily limit reached: the bubble says so and when it resets.

## Cost

About a tenth of a cent for a simple question and a few tenths with lookups, on Haiku 5.5 (see current prices in `docs/anthropic-setup.md`).

## Testing

The AI is replaced by a fake provider in every automated test, so no test touches the network or costs money.

- `chat`: plain answer; lookup run and fed back; stops at 5 calls; error mapping; history cap of 200; only the last 10 exchanges sent; summary covers 4 weeks and leaves out addresses, notes and syllabus.
- `chattools`: `find` by words and by date range; `free_time` never overlaps a commitment, commute or recorded class, honours day windows, and handles midnight and daylight-saving edges.
- Injection: a title such as "ignore all rules" or one containing a fake closing tag cannot leave its block.
- Server: bad input rejected; no-key and daily-limit messages; only history is written; a failed exchange saves nothing.
- Frontend: Enter sends; Thinking shows; answer shows; text kept on failure; "Earlier" lists saved exchanges.
- One manual check with a real key, by the user in a separate terminal (steps listed in `docs/ui-visual-check.md` once built).

## Out of scope for step 1

- Any change to the plan (steps 2 and 3).
- Web lookups and Google Calendar (step 4).
- Voice, images, phone chat.
- Making history searchable or exporting it.

## Open items for the plan

- The exact wording of the system prompt.
- The summary's size cap when the next 4 weeks are unusually full, and what the bubble says when something is left out.
