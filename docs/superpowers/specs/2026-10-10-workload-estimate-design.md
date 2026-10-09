# Workload Estimate: Design

Date: 2026-10-10. Status: approved by the user in conversation (design, board T, and the two scale settings). Builds on `2026-10-08-study-planner-design.md` (Workload estimator) and `2026-10-09-ui-design.md`. Approved boards: **T. Course details** and **O. Preferences screen** (with the three new fields).

## Purpose

Suggest how many hours a week a study task needs, from how heavy the course is, so the user does not have to guess every number. The user always decides: the suggestion fills the task's existing "minutes a week" field only when they press "Use this". The planner still reads only that field. The AI is optional and the feature works without it.

## What the user asked for

- Suggested weekly hours per course from basics, and optionally from the syllabus.
- Basics are credits, a 1 to 5 difficulty rating and three yes/no questions (graded by exams only, weekly graded work, has a lab).
- The site knows what a normal semester is for this user: "Credits in a normal semester" and "Study hours a week at a full load", and uses the proportion. Optionally the user says how many hours one credit is a week (their school: 1 credit = 1 hour a week), which takes precedence.
- No Anthropic API key yet: build the rule of thumb and an "AI not connected" state; the real model call comes later behind the same interface.

## Data

- `Task.course?: Course` where `Course = { credits: number, difficulty: 1..5, examOnly: boolean, weeklyGraded: boolean, lab: boolean, syllabus: string }`. Only study tasks have one (the form hides and drops it for other categories). A task without credits has no course. Suggestions are not stored; only the accepted number lands in `weeklyMinutes`.
- `Preferences` gains `hoursPerCredit: number | null` (default null), `normalCredits: number` (default 30), `fullLoadHours: number` (default 40).
- Limits: credits 0.5 to 100; difficulty whole 1 to 5; syllabus at most 20000 characters; `hoursPerCredit` 0.1 to 20 or null; `normalCredits` 1 to 200; `fullLoadHours` 1 to 100. Old files load unchanged (no course; defaults for the new preferences).

## The rule of thumb (`src/estimate.ts`, pure)

1. Base minutes: when `hoursPerCredit` is set, `credits * hoursPerCredit * 60`; otherwise `fullLoadHours * 60 * credits / normalCredits`.
2. Multiplier: difficulty factor for 1 to 5 is 0.8, 0.9, 1.0, 1.15, 1.3, times `1 + 0.15 * weeklyGraded + 0.10 * lab - 0.10 * examOnly`.
3. Round to the nearest 15 minutes; clamp to 0 to 3000.
4. One plain sentence of reasoning, for example "3 credits at 1h a week each. Hard course (4 of 5) with weekly graded work: about 4h a week." or "3 of your 30 normal credits is 10% of a 40h load. Hard course (4 of 5) with weekly graded work: about 5h15 a week."
5. The constants live in one table at the top of the file so they are easy to tune.

## The AI part (`src/workload.ts`)

- `WorkloadProvider { status: 'unavailable' | 'ready'; estimate(input): Promise<{ minutes, reason }> }` with an `unavailableProvider` and a `fakeWorkloadProvider(minutes, reason)` for tests. The real Anthropic provider is the next plan; its key will come from a server environment variable only.
- The server asks the provider with the course basics, the rule's minutes and the syllabus, then clamps the answer to between half and double the rule's minutes (and 0 to 3000). A failure is reported as `failed` with a plain message and never breaks the estimate.
- The syllabus leaves the machine only through this one call.

## Server

`POST /api/estimate` with `{ title, credits, difficulty, examOnly, weeklyGraded, lab, syllabus }` (validated like state fields). It reads the user's preferences from the saved state and responds `{ rule: { minutes, reason }, ai: { minutes, reason } | null, aiStatus: 'unavailable' | 'ready' | 'failed', aiMessage?: string }`. It changes nothing on disk. `createApp` takes an optional `workload` provider (default unavailable).

## UI (board T)

- Preferences (board O) gets three fields in the existing style: "Hours a week per credit, optional", "Credits in a normal semester", "Study hours a week at a full load".
- The Tasks form gets a **Course details** block when the category is Study: Credits, Difficulty (1 to 5 with words at the ends), three Yes/No segments, an optional Syllabus box, and an **Estimate hours** button.
- Pressing the button shows a suggestion card: big hours, the reason, a tag ("Rule of thumb" or "AI"), **Use this** (fills "Minutes a week" and closes the card) and **Keep mine** (closes it). When both exist the card shows the AI answer with the rule's answer as a second, smaller line. When the AI is unavailable the card adds "AI is not connected yet. The rule of thumb is used until it is." A failure shows a plain sentence in the form's error style.
- While the AI is asked, Nudge shows his thinking face.
- The card is state of the open form, not saved.

## Errors and edge inputs

- Credits blank means no course. Credits outside range, difficulty outside 1 to 5 or a syllabus over 20000 characters are refused with plain sentences, in the form and by the server.
- Estimate with credits blank or invalid: the button explains what is missing and does not call the server.
- A double press is ignored while a request runs.
- Hostile text in the syllabus or title is data only: never rendered as markup, never evaluated.

## Testing

Pure tests for every branch of the rule (both bases, every difficulty, each yes/no, rounding, clamps, sentences); validation tests; provider contract tests with the fake; server tests for the endpoint (unavailable, ready, failing, out-of-range answer clamped, bad input); frontend model and form tests with the fake document; an end-to-end test that fills the form, estimates, uses the number and saves.

## Plans

1. **Workload estimate core (this plan):** data, validation, rule of thumb, provider interface, endpoint, Preferences fields, Course details and the suggestion card, thinking face.
2. **Real AI call (when a key exists):** the Anthropic provider, key handling, a recorded-response test, docs.
