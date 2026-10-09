import { addDays, daysBetween, weekdayOf, weekStart } from './dates.ts';
import { busyOn } from './busy.ts';
import { demandsFor } from './demand.ts';
import { freeSlots } from './slots.ts';
import type { Block, DateStr, PlanInput, PlanResult, Warning, Window } from './types.ts';

export interface Slot extends Window {
  soft: boolean;
}

export function daySlots(input: PlanInput, date: DateStr, opened: ReadonlySet<DateStr>): Slot[] {
  const pref = input.preferences;
  const window = pref.daysOff.includes(weekdayOf(date)) ? pref.dayOffWindow : pref.weekdayWindow;
  const busy = busyOn(date, input.commitments);
  const softs = pref.softWindows.filter((s) => s.weekday === weekdayOf(date));
  const normal = freeSlots(window, [...busy, ...softs]).map((s) => ({ ...s, soft: false }));
  const soft = opened.has(date)
    ? softs
        .flatMap((s) =>
          freeSlots({ start: Math.max(s.start, window.start), end: Math.min(s.end, window.end) }, busy),
        )
        .map((s) => ({ ...s, soft: true }))
    : [];
  return [...normal, ...soft].sort((a, b) => a.start - b.start);
}

export function planDays(input: PlanInput, opened: ReadonlySet<DateStr> = new Set()): Block[] {
  const pref = input.preferences;
  const all: Block[] = [...input.pastBlocks];
  const placed: Block[] = [];

  // usedThrough[i] = number of usable days among today .. today + i.
  const usedThrough: number[] = [];
  const countThrough = (index: number): number => {
    while (usedThrough.length <= index) {
      const date = addDays(input.today, usedThrough.length);
      const usable = daySlots(input, date, opened).some((s) => s.end - s.start >= pref.minBlock);
      usedThrough.push((usedThrough[usedThrough.length - 1] ?? 0) + (usable ? 1 : 0));
    }
    return usedThrough[index];
  };
  const usableDays = (date: DateStr, end: DateStr): number => {
    const from = daysBetween(input.today, date);
    const to = Math.min(daysBetween(input.today, end), from + 400);
    return to <= from ? 0 : countThrough(to) - countThrough(from);
  };

  for (let i = 0; i < input.horizonDays; i++) {
    const date = addDays(input.today, i);
    let slots = daySlots(input, date, opened);
    if (i === 0 && input.nowMinutes !== undefined) {
      const now = input.nowMinutes;
      slots = slots
        .map((s) => ({ ...s, start: Math.max(s.start, now) }))
        .filter((s) => s.end > s.start);
    }

    for (const slot of slots) {
      let cursor = slot.start;
      for (;;) {
        const room = slot.end - cursor;
        const pick = demandsFor(input, date, all, usableDays).find((d) => {
          if (slot.soft && d.task.category !== 'study') return false;
          const wanted = Math.min(d.task.maxBlock, d.allowedLeft);
          const needed = d.task.onePerDay ? wanted : Math.min(pref.minBlock, wanted);
          return room >= needed;
        });
        if (!pick) break;
        const length = Math.min(pick.task.maxBlock, pick.allowedLeft, room);
        if (length <= 0) break;
        const block: Block = {
          taskId: pick.task.id,
          title: pick.task.title,
          category: pick.task.category,
          date,
          start: cursor,
          end: cursor + length,
          ...(pick.deadline ? { deadlineId: pick.deadline.id } : {}),
        };
        all.push(block);
        placed.push(block);
        cursor += length + pref.minBreak;
      }
    }
  }
  return placed;
}

const minutesOf = (blocks: Block[]): number => blocks.reduce((t, b) => t + (b.end - b.start), 0);

export interface Shortfall {
  warning: Warning;
  category: string;
  minutes: number;
}

export function shortfalls(input: PlanInput, all: Block[]): Shortfall[] {
  const last = addDays(input.today, input.horizonDays - 1);
  const out: Shortfall[] = [];

  for (const dl of input.deadlines) {
    const task = input.tasks.find((t) => t.id === dl.taskId);
    if (!task || dl.dueDate > last) continue;
    const rem = dl.effortMinutes - minutesOf(all.filter((b) => b.deadlineId === dl.id));
    if (rem > 0) {
      out.push({
        category: task.category,
        minutes: rem,
        warning: {
          kind: 'deadline-short',
          message: `${task.title} ${dl.kind} due ${dl.dueDate} is short by ${rem} min`,
        },
      });
    }
  }

  for (const task of input.tasks) {
    if (!task.weeklyMinutes) continue;
    for (let ws = weekStart(input.today); addDays(ws, 6) <= last; ws = addDays(ws, 7)) {
      const done = minutesOf(
        all.filter((b) => b.taskId === task.id && !b.deadlineId && weekStart(b.date) === ws),
      );
      if (done < task.weeklyMinutes) {
        out.push({
          category: task.category,
          minutes: task.weeklyMinutes - done,
          warning: {
            kind: 'weekly-short',
            message: `${task.title} is short by ${task.weeklyMinutes - done} min in the week of ${ws}`,
          },
        });
      }
    }
  }
  return out;
}

export function shortfallWarnings(input: PlanInput, all: Block[]): Warning[] {
  return shortfalls(input, all).map((s) => s.warning);
}

function softUseWarnings(input: PlanInput, blocks: Block[], opened: ReadonlySet<DateStr>): Warning[] {
  const out: Warning[] = [];
  for (const date of opened) {
    const wd = weekdayOf(date);
    const used = blocks.filter(
      (b) =>
        b.date === date &&
        input.preferences.softWindows.some((s) => s.weekday === wd && b.start >= s.start && b.start < s.end),
    );
    if (used.length > 0) {
      const titles = [...new Set(used.map((b) => b.title))].join(', ');
      out.push({ kind: 'soft-time-used', message: `Used soft free time on ${date} for ${titles}` });
    }
  }
  return out;
}

export function plan(input: PlanInput): PlanResult {
  const softDates = Array.from({ length: input.horizonDays }, (_, i) => addDays(input.today, i)).filter(
    (d) => input.preferences.softWindows.some((s) => s.weekday === weekdayOf(d)),
  );
  const opened = new Set<DateStr>();
  const studyDeficit = (found: Shortfall[]): number =>
    found.filter((f) => f.category === 'study').reduce((t, f) => t + f.minutes, 0);
  let blocks = planDays(input, opened);
  let found = shortfalls(input, [...input.pastBlocks, ...blocks]);
  let deficit = studyDeficit(found);
  for (const date of softDates) {
    if (deficit === 0) break;
    const trial = new Set(opened).add(date);
    const trialBlocks = planDays(input, trial);
    const trialFound = shortfalls(input, [...input.pastBlocks, ...trialBlocks]);
    const trialDeficit = studyDeficit(trialFound);
    if (trialDeficit < deficit) {
      opened.add(date);
      blocks = trialBlocks;
      found = trialFound;
      deficit = trialDeficit;
    }
  }
  return {
    blocks,
    warnings: [...softUseWarnings(input, blocks, opened), ...found.map((s) => s.warning)],
  };
}
