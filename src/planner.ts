import { addDays, daysBetween, weekdayOf, weekStart } from './dates.ts';
import { busyOn } from './busy.ts';
import { demandsFor } from './demand.ts';
import { freeSlots } from './slots.ts';
import { legsOn } from './travel.ts';
import type { DayTravel, TravelContext } from './travel.ts';
import type { Block, DateStr, Leg, PlanInput, PlanResult, Warning, Window } from './types.ts';

export interface Slot extends Window {
  soft: boolean;
}

const travelContext = (input: PlanInput): TravelContext => ({
  places: input.places ?? [],
  commutes: input.commutes ?? [],
  allowance: input.preferences.travelAllowanceMinutes,
});

// The planner asks about the same day many times while it tries options, so each day is worked out once per input.
const travelCache = new WeakMap<PlanInput, Map<DateStr, DayTravel>>();
export function travelOn(input: PlanInput, date: DateStr): DayTravel {
  let days = travelCache.get(input);
  if (!days) {
    days = new Map();
    travelCache.set(input, days);
  }
  let day = days.get(date);
  if (!day) {
    day = legsOn(date, input.commitments, travelContext(input));
    days.set(date, day);
  }
  return day;
}

export function daySlots(input: PlanInput, date: DateStr, opened: ReadonlySet<DateStr>): Slot[] {
  const pref = input.preferences;
  const window = pref.daysOff.includes(weekdayOf(date)) ? pref.dayOffWindow : pref.weekdayWindow;
  const busy = [
    ...busyOn(date, input.commitments),
    ...travelOn(input, date).legs.map((l) => ({ title: 'Travel', start: l.start, end: l.end })),
  ];
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
          detail: { taskTitle: task.title, category: task.category, kind: dl.kind, dueDate: dl.dueDate, minutes: rem },
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
            detail: { taskTitle: task.title, category: task.category, weekStart: ws, minutes: task.weeklyMinutes - done },
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
      const titles = [...new Set(used.map((b) => b.title))];
      out.push({
        kind: 'soft-time-used',
        message: `Used soft free time on ${date} for ${titles.join(', ')}`,
        detail: { date, titles, minutes: minutesOf(used) },
      });
    }
  }
  return out;
}

const studyDeficit = (found: Shortfall[]): number =>
  found.filter((f) => f.category === 'study').reduce((t, f) => t + f.minutes, 0);

const otherDeficit = (found: Shortfall[]): number =>
  found.filter((f) => f.category !== 'study').reduce((t, f) => t + f.minutes, 0);

export function plan(input: PlanInput): PlanResult {
  const softDates = Array.from({ length: input.horizonDays }, (_, i) => addDays(input.today, i)).filter(
    (d) => input.preferences.softWindows.some((s) => s.weekday === weekdayOf(d)),
  );
  const opened = new Set<DateStr>(input.approvedSoft ?? []);
  const candidates = softDates.filter((d) => !opened.has(d));
  const run = (open: ReadonlySet<DateStr>) => {
    const blocks = planDays(input, open);
    return { blocks, found: shortfalls(input, [...input.pastBlocks, ...blocks]) };
  };

  let { blocks, found } = run(opened);
  let deficit = studyDeficit(found);
  let offer: { date: DateStr; minutes: number; cost: number } | null = null;

  if (input.preferences.softMode === 'auto') {
    for (const date of candidates) {
      if (deficit === 0) break;
      const trial = run(new Set(opened).add(date));
      const trialDeficit = studyDeficit(trial.found);
      if (trialDeficit < deficit) {
        opened.add(date);
        blocks = trial.blocks;
        found = trial.found;
        deficit = trialDeficit;
      }
    }
  } else if (deficit > 0) {
    const baseOther = otherDeficit(found);
    for (const date of candidates) {
      const trial = run(new Set(opened).add(date));
      const gain = deficit - studyDeficit(trial.found);
      const cost = Math.max(0, otherDeficit(trial.found) - baseOther);
      if (gain > 0 && (offer === null || gain > offer.minutes || (gain === offer.minutes && cost < offer.cost))) {
        offer = { date, minutes: gain, cost };
      }
    }
  }

  const warnings: Warning[] = [...softUseWarnings(input, blocks, opened), ...found.map((s) => s.warning)];
  if (offer) {
    warnings.push({
      kind: 'soft-offer',
      message:
        `Soft time on ${offer.date} could cover ${offer.minutes} min of study` +
        (offer.cost > 0 ? `, but other tasks lose ${offer.cost} min` : ''),
      detail: { date: offer.date, minutes: offer.minutes, costMinutes: offer.cost },
    });
  }
  const travel: Leg[] = [];
  const travelWarnings: Warning[] = [];
  const missing = new Set<string>();
  for (let i = 0; i < input.horizonDays; i++) {
    const day = travelOn(input, addDays(input.today, i));
    travel.push(...day.legs);
    for (const w of day.warnings) {
      if (w.kind === 'address-missing' || w.kind === 'travel-tight') {
        const same = `${w.kind}|${w.detail?.placeName ?? ''}|${w.kind === 'travel-tight' ? (w.detail?.titles?.[0] ?? '') : ''}`;
        if (missing.has(same)) continue;
        missing.add(same);
      }
      travelWarnings.push(w);
    }
  }
  return { blocks, warnings: [...warnings, ...travelWarnings], travel };
}
