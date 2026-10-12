# Class-attendance advice, piece 1: evidence, rule and the class panel

Date: 2026-10-11. Builds on the attendance section of `2026-10-08-study-planner-design.md` (phase 5).

## Scope and order

The whole feature is split into three pieces, each with its own spec, plan and review:

1. **This spec:** the evidence fields, the advice rule and the advice block in the class panel.
2. **Later:** reading the syllabus with the AI to fill the evidence (provider unavailable until the user has an Anthropic key; built like the workload estimate).
3. **Later:** Nudge offers to skip a class when skipping would fix a shortfall.

Piece 1 is useful alone: the user types the evidence and sees advice. It never decides for the user and never skips anything by itself.

## Decisions (from the user, 2026-10-11)

- Evidence comes from typed fields now, and from the syllabus later through the same fields.
- Advice shows in the class's panel and, later, in Nudge.
- Skipping a class uses the existing "Skip this day" (adds the date to the class's exceptions, which frees the slot for the planner). No new skip mechanism.

## Data

- `Course` gets three optional fields: `attendanceWeight?: number` (0 to 100, percent of the grade that attendance counts for), `recorded?: 'yes' | 'no' | 'unknown'` (default unknown), `examShare?: number` (0 to 100). The existing `lab` flag counts as evidence too.
- `Commitment` gets `courseId?: string`: the id of a study task that has a course. Only commitments in the `class` category may carry it.
- Validation: numbers are whole percentages in range; `recorded` is one of the three words; `courseId` must match a task with a course, else a 400 with "courseId does not match any course" (like `placeId`). Old state loads unchanged (no new fields).

## The rule

A pure function `adviseAttendance(course, task, shortfallMinutes)` in `src/attendance.ts` returns `{ verdict: 'go' | 'skippable' | 'optional' | 'unknown'; reasons: string[] }`. It is plain logic with fixed sentences.

1. **Lab** (`course.lab`): `go`. "Labs need you there."
2. **Attendance weight not typed:** `unknown`. "Add whether attendance counts toward the grade."
3. **Weight above 0:** `go`. "Attendance counts X% of the grade."
4. **Weight 0:**
   - Recorded yes and behind (`shortfallMinutes > 0`): `skippable`. "Recorded, attendance counts 0%, and TITLE is N min short."
   - Recorded yes and not behind: `optional`. "Recorded and attendance counts 0%. Skipping is fine, but you are not behind."
   - Recorded no: `optional`. "Not recorded, so skipping means missing the lecture." plus, when exam share is 50 or more, "Exams are X% of the grade, so what is said here matters."
   - Recorded unknown: `optional`. "Attendance counts 0%. I do not know if it is recorded."

"Behind" means the linked task has an open `weekly-short` or `deadline-short` warning; `shortfallMinutes` is their total. A dismissed warning still counts: dismissing only hides it from Nudge.

## Server

- `src/attendance.ts` also exports `attendanceFor(state, warnings, today, horizonDays)` returning `AttendanceAdvice[]` of `{ commitmentId, date, verdict, reasons }` for every occurrence of a class that has a `courseId`, from today through the horizon, skipping dates already in the class's exceptions.
- The replan response gets `attendance: AttendanceAdvice[]`. A class with a `courseId` whose task or course vanished is skipped silently (validation prevents it on save). Computing advice can never fail a replan.
- Piece 3 will reuse `attendanceFor` on the server, so the rule lives only here and the browser never re-implements it.

## UI

- **Store:** keeps `attendance` from the replan reply.
- **Class panel (drawer):** above the existing "Skip this day" block, an advice block for that occurrence: a tag (Go, Skippable, Optional, No advice yet), the reasons as short lines, and the words "Advice only. You decide." It shows only for a class with a course. It does not repeat when the date is already skipped.
- **Tasks form, Course details:** three new rows. "Attendance counts" is a number in percent (blank means not known), "Lectures recorded" is Yes, No or Not sure, and "Exams share" is a number in percent. Same validation sentences style as the other course fields.
- **Class form:** a "Course" choice (None, then study tasks that have course details), shown for the class category only.
- UI rules still apply: no emojis, no gradients, no inline styles, all text through `h()`, real buttons, keyboard reachable, reduced motion respected.

## Error handling

- Percentages out of range or not whole numbers: refused in the form and by the server with a plain sentence.
- A class linked to a course that was deleted in another tab: the save is refused with the existing "deleted elsewhere" style message and fresh data is shown.
- No evidence: the panel says "No advice yet" and "Add the course details".

## Testing

- **Rule:** one test per branch above, plus exam share 49 and 50, plus behind with zero and with positive shortfall.
- **attendanceFor:** returns occurrences in the horizon only, omits excepted dates, omits classes without a course, counts dismissed warnings as behind, and survives a dangling `courseId`.
- **Validation and migration:** new fields default; bad values and a dangling `courseId` are 400s; old state loads.
- **Server:** the replan body carries `attendance`.
- **UI:** the panel shows each verdict, nothing for a class without a course, the Tasks form saves the three fields, the class form saves the link, and "Skip this day" still works beside the advice.
- **End to end:** a recorded zero-weight course that is behind shows Skippable; pressing "Skip this day" frees the time and the shortfall shrinks on replan.

## Out of scope

Reading the syllabus (piece 2), Nudge offers (piece 3), advice on lessons, work or other categories, attendance history or counting absences, and any automatic skipping.
