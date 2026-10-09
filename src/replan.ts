import { addDays, weekStart } from './dates.ts';
import { plan } from './planner.ts';
import type { Block, DateStr, Minutes, State, Warning } from './types.ts';

// A warning's identity is what it is about, not its wording: the minutes in the
// message change as the day goes on, and a dismissal must survive that.
export function warningKey(w: Warning): string {
  const d = w.detail;
  if (!d) return `${w.kind}|${w.message}`;
  const about = [d.taskTitle, d.kind, d.dueDate, d.weekStart, d.date].filter((x) => x !== undefined);
  return [w.kind, ...about].join('|');
}

export interface DescribedWarning extends Warning {
  key: string;
  dismissed: boolean;
}

export function describeWarnings(warnings: Warning[], dismissed: string[]): DescribedWarning[] {
  return warnings.map((w) => ({ ...w, key: warningKey(w), dismissed: dismissed.includes(warningKey(w)) }));
}

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
  const approvedSoft = state.approvedSoft.filter((d) => d >= today);
  const result = plan({
    today,
    ...(nowMinutes === undefined ? {} : { nowMinutes }),
    horizonDays,
    commitments: state.commitments,
    tasks: state.tasks,
    deadlines: state.deadlines,
    preferences: state.preferences,
    pastBlocks: relevant,
    approvedSoft,
  });
  const open = new Set(result.warnings.map(warningKey));
  const dismissed = state.dismissed.filter((k) => open.has(k));
  return {
    state: { ...state, approvedSoft, dismissed, blocks: [...kept, ...result.blocks] },
    warnings: result.warnings,
  };
}
