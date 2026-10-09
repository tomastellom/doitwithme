import { addDays, weekdayOf, weekStart } from './dates.ts';
import { busyOn } from './busy.ts';
import { demandsFor } from './demand.ts';
import { freeSlots } from './slots.ts';
import type { Block, DateStr, PlanInput, PlanResult, Warning, Window } from './types.ts';

export interface Slot extends Window {
  soft: boolean;
}

export function daySlots(input: PlanInput, date: DateStr): Slot[] {
  const pref = input.preferences;
  const window = pref.daysOff.includes(weekdayOf(date)) ? pref.dayOffWindow : pref.weekdayWindow;
  return freeSlots(window, busyOn(date, input.commitments)).map((s) => ({ ...s, soft: false }));
}

export function planDays(input: PlanInput): Block[] {
  const pref = input.preferences;
  const all: Block[] = [...input.pastBlocks];
  const placed: Block[] = [];

  const usable = new Map<DateStr, boolean>();
  const isUsable = (date: DateStr): boolean => {
    let v = usable.get(date);
    if (v === undefined) {
      v = daySlots(input, date).some((s) => s.end - s.start >= pref.minBlock);
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
    let slots = daySlots(input, date);
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

export function plan(input: PlanInput): PlanResult {
  const blocks = planDays(input);
  return { blocks, warnings: shortfallWarnings(input, [...input.pastBlocks, ...blocks]) };
}
