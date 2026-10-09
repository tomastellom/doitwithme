import { addDays, weekStart } from './dates.ts';
import type { Block, DateStr, Deadline, PlanInput, Task } from './types.ts';

export type UsableDays = (date: DateStr, end: DateStr) => number;

export interface Demand {
  task: Task;
  deadline: Deadline | null;
  allowedLeft: number;
  score: number;
}

const ceil5 = (n: number): number => Math.ceil(n / 5) * 5;
const sum = (blocks: Block[]): number => blocks.reduce((t, b) => t + (b.end - b.start), 0);

export function demandsFor(
  input: PlanInput,
  date: DateStr,
  all: Block[],
  usableDays: UsableDays,
): Demand[] {
  const { minBlock } = input.preferences;
  const out: Demand[] = [];

  for (const task of input.tasks) {
    if (task.maxBlock < 1) continue;
    const mine = all.filter((b) => b.taskId === task.id);
    const weight = 6 - task.priority;

    if (task.weeklyMinutes !== null && task.weeklyMinutes > 0) {
      const ws = weekStart(date);
      const weekly = mine.filter((b) => !b.deadlineId && weekStart(b.date) === ws);
      const doneToday = sum(weekly.filter((b) => b.date === date));
      const remainingStart = task.weeklyMinutes - (sum(weekly) - doneToday);
      if (remainingStart > 0) {
        const daysLeft = 1 + usableDays(date, addDays(ws, 6));
        let allowedTotal: number;
        if (task.onePerDay) {
          const hadYesterday = mine.some((b) => b.date === addDays(date, -1));
          const sessionsLeft = Math.ceil(remainingStart / task.maxBlock);
          allowedTotal =
            hadYesterday && sessionsLeft < daysLeft ? 0 : Math.min(task.maxBlock, remainingStart);
        } else {
          allowedTotal = Math.min(
            remainingStart,
            Math.max(ceil5(remainingStart / daysLeft), Math.min(minBlock, remainingStart)),
          );
        }
        const allowedLeft = allowedTotal - doneToday;
        if (allowedLeft > 0) {
          out.push({ task, deadline: null, allowedLeft, score: (remainingStart / daysLeft) * weight });
        }
      }
    }

    for (const dl of input.deadlines) {
      if (dl.taskId !== task.id || dl.dueDate < date) continue;
      const tagged = mine.filter((b) => b.deadlineId === dl.id);
      const doneToday = sum(tagged.filter((b) => b.date === date));
      const remainingStart = dl.effortMinutes - (sum(tagged) - doneToday);
      if (remainingStart <= 0) continue;
      const daysLeft = 1 + usableDays(date, dl.dueDate);
      const allowedTotal = Math.min(
        remainingStart,
        Math.max(ceil5(remainingStart / daysLeft), Math.min(minBlock, remainingStart)),
      );
      const allowedLeft = allowedTotal - doneToday;
      if (allowedLeft > 0) {
        out.push({ task, deadline: dl, allowedLeft, score: (remainingStart / daysLeft) * weight });
      }
    }
  }

  return out.sort((a, b) => b.score - a.score);
}
