import { addDays, weekStart } from './dates.ts';
import { attendanceFor } from './attendance.ts';
import { plan } from './planner.ts';
import type { Block, DateStr, Leg, Minutes, State, Warning } from './types.ts';

// A warning's identity is what it is about, not its wording: the minutes in the
// message change as the day goes on, and a dismissal must survive that.
export function warningKey(w: Warning): string {
  const d = w.detail;
  if (!d) return `${w.kind}|${w.message}`;
  // The same trip failing every week is one problem, so it is named by place and event, not by date.
  if (w.kind === 'travel-tight') return [w.kind, d.placeName, d.titles?.[0]].join('|');
  const about = [d.taskTitle, d.placeName, d.kind, d.dueDate, d.weekStart, d.commitmentId, d.date].filter((x) => x !== undefined);
  return [w.kind, ...about].join('|');
}

export interface DescribedWarning extends Warning {
  key: string;
  dismissed: boolean;
}

export function describeWarnings(warnings: Warning[], dismissed: string[]): DescribedWarning[] {
  return warnings.map((w) => ({ ...w, key: warningKey(w), dismissed: dismissed.includes(warningKey(w)) }));
}

export function replanCore(
  state: State,
  today: DateStr,
  nowMinutes?: Minutes,
  horizonDays = 14,
): { state: State; warnings: Warning[]; travel: Leg[] } {
  const kept: Block[] = [];
  for (const b of state.blocks) {
    if (b.date < today) kept.push(b);
    else if (b.date === today && nowMinutes !== undefined && b.start < nowMinutes) {
      kept.push(b.end <= nowMinutes ? b : { ...b, end: nowMinutes });
    } else if (b.status !== undefined) {
      // Something the person ticked off, skipped or took off stays exactly where they left it.
      kept.push(b);
    }
  }
  // The planner only needs this week and the day before it (weekly targets,
  // rest days) plus blocks tagged to a deadline. Older history only slows it down.
  const cutoff = addDays(weekStart(today), -1);
  // A block marked not done no longer counts as work done, so its minutes come back as a shortfall to plan again.
  const relevant = kept.filter((b) => (b.date >= cutoff || b.deadlineId !== undefined) && b.status !== 'missed');
  const approvedSoft = state.approvedSoft.filter((d) => d >= today);
  const lowDays = (state.checkIns ?? []).filter((c) => c.mood === 'low' && c.date >= today).map((c) => c.date);
  const result = plan({
    today,
    ...(nowMinutes === undefined ? {} : { nowMinutes }),
    horizonDays,
    commitments: state.commitments,
    places: state.places,
    commutes: state.commutes,
    tasks: state.tasks,
    deadlines: state.deadlines,
    preferences: state.preferences,
    pastBlocks: relevant,
    approvedSoft,
    lowDays,
  });
  const open = new Set(result.warnings.map(warningKey));
  const dismissed = state.dismissed.filter((k) => open.has(k));
  return {
    state: {
      ...state,
      approvedSoft,
      dismissed,
      blocks: [...kept, ...result.blocks],
      ...(state.checkIns === undefined ? {} : { checkIns: state.checkIns.filter((c) => c.date >= addDays(today, -60)) }),
    },
    warnings: result.warnings,
    travel: result.travel,
  };
}

const OFFER_DAYS = 3;

// Total minutes the linked task is short, from the plan's own warnings.
const shortBy = (warnings: Warning[], taskId: string): number =>
  warnings
    .filter((w) => (w.kind === 'weekly-short' || w.kind === 'deadline-short') && w.detail?.taskId === taskId)
    .reduce((t, w) => t + (w.detail?.minutes ?? 0), 0);

// A class is only offered for skipping when a trial plan without it really shrinks the shortfall.
function skipOffers(state: State, base: { state: State; warnings: Warning[] }, today: DateStr, nowMinutes: Minutes | undefined, horizonDays: number): Warning[] {
  const out: Warning[] = [];
  const advice = attendanceFor(base.state, base.warnings, today, OFFER_DAYS).filter((a) => a.verdict === 'skippable');
  for (const a of advice) {
    const c = state.commitments.find((x) => x.id === a.commitmentId);
    const task = c && state.tasks.find((t) => t.id === c.courseId);
    if (!c || !task || c.pattern.kind !== 'weekly') continue;
    try {
      const trial: State = {
        ...state,
        commitments: state.commitments.map((x) => (x.id === c.id ? { ...x, exceptions: [...x.exceptions, a.date].sort() } : x)),
      };
      const gain = shortBy(base.warnings, task.id) - shortBy(replanCore(trial, today, nowMinutes, horizonDays).warnings, task.id);
      if (gain < state.preferences.minBlock) continue;
      out.push({
        kind: 'skip-offer',
        message: `${c.title} on ${a.date} could be skipped to catch up ${gain} min of ${task.title}`,
        detail: { commitmentId: c.id, commitmentTitle: c.title, taskId: task.id, taskTitle: task.title, category: task.category, date: a.date, start: c.start, minutes: gain },
      });
    } catch {
      // An offer that cannot be worked out is simply not made.
    }
  }
  return out;
}

export function replan(
  state: State,
  today: DateStr,
  nowMinutes?: Minutes,
  horizonDays = 14,
): { state: State; warnings: Warning[]; travel: Leg[] } {
  const base = replanCore(state, today, nowMinutes, horizonDays);
  const offers = skipOffers(state, base, today, nowMinutes, horizonDays);
  if (offers.length === 0) return base;
  const warnings = [...base.warnings, ...offers];
  // The pruning must see the offers too, or a dismissed offer would be forgotten at the next replan.
  const open = new Set(warnings.map(warningKey));
  return { ...base, warnings, state: { ...base.state, dismissed: state.dismissed.filter((k) => open.has(k)) } };
}
