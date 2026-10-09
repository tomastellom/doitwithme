import { plan } from './planner.ts';
import type { Block, DateStr, Minutes, State, Warning } from './types.ts';

export function replan(
  state: State,
  today: DateStr,
  nowMinutes?: Minutes,
  horizonDays = 14,
): { state: State; warnings: Warning[] } {
  const kept: Block[] = state.blocks.filter(
    (b) => b.date < today || (b.date === today && nowMinutes !== undefined && b.end <= nowMinutes),
  );
  const result = plan({
    today,
    ...(nowMinutes === undefined ? {} : { nowMinutes }),
    horizonDays,
    commitments: state.commitments,
    tasks: state.tasks,
    deadlines: state.deadlines,
    preferences: state.preferences,
    pastBlocks: kept,
  });
  return { state: { ...state, blocks: [...kept, ...result.blocks] }, warnings: result.warnings };
}
