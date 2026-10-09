import { addDays, weekdayOf } from './dates.ts';
import { busyOn } from './busy.ts';
import { demandsFor } from './demand.ts';
import { freeSlots } from './slots.ts';
import type { Block, DateStr, PlanInput, Window } from './types.ts';

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
