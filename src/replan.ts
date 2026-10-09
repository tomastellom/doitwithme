import { addDays, weekStart } from './dates.ts';
import { plan } from './planner.ts';
import type { Block, DateStr, Minutes, State, Warning } from './types.ts';

export function replan(
  state: State,
  today: DateStr,
  nowMinutes?: Minutes,
  horizonDays = 14,
): { state: State; warnings: Warning[] } {
  const kept: Block[] = [];
  for (const b of state.blocks) {
    if (b.date < today) kept.push(b);
    else if (b.date === today && nowMinutes !== undefined && b.start < nowMinutes) {
      kept.push(b.end <= nowMinutes ? b : { ...b, end: nowMinutes });
    }
  }
  // The planner only needs this week and the day before it (weekly targets,
  // rest days) plus blocks tagged to a deadline. Older history only slows it down.
  const cutoff = addDays(weekStart(today), -1);
  const relevant = kept.filter((b) => b.date >= cutoff || b.deadlineId !== undefined);
  const result = plan({
    today,
    ...(nowMinutes === undefined ? {} : { nowMinutes }),
    horizonDays,
    commitments: state.commitments,
    tasks: state.tasks,
    deadlines: state.deadlines,
    preferences: state.preferences,
    pastBlocks: relevant,
  });
  return { state: { ...state, blocks: [...kept, ...result.blocks] }, warnings: result.warnings };
}
