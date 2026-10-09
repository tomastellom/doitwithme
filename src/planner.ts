import { addDays, weekdayOf, weekStart } from './dates.ts';
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

  const usable = new Map<DateStr, boolean>();
  const isUsable = (date: DateStr): boolean => {
    let v = usable.get(date);
    if (v === undefined) {
      v = daySlots(input, date, opened).some((s) => s.end - s.start >= pref.minBlock);
      usable.set(date, v);
    }
    return v;
  };
  const usableDays = (date: DateStr, end: DateStr): number => {
    const limit = end < addDays(date, 400) ? end : addDays(date, 400);
    let n = 0;
    for (let d = addDays(date, 1); d <= limit; d = addDays(d, 1)) if (isUsable(d)) n++;
    return n;
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
          if (slot.soft && d.deadline === null && d.task.category !== 'study') return false;
          const wanted = Math.min(d.task.maxBlock, d.allowedLeft);
          return room >= Math.min(pref.minBlock, wanted);
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
  const needsSoftTime = (found: Shortfall[]): boolean =>
    found.some((s) => s.warning.kind === 'deadline-short' || s.category === 'study');
  let blocks = planDays(input, opened);
  let found = shortfalls(input, [...input.pastBlocks, ...blocks]);
  while (needsSoftTime(found) && opened.size < softDates.length) {
    opened.add(softDates[opened.size]);
    blocks = planDays(input, opened);
    found = shortfalls(input, [...input.pastBlocks, ...blocks]);
  }
  return {
    blocks,
    warnings: [...softUseWarnings(input, blocks, opened), ...found.map((s) => s.warning)],
  };
}
