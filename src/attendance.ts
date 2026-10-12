import { occurrencesOn } from './busy.ts';
import { addDays } from './dates.ts';
import type { Course, DateStr, State, Warning } from './types.ts';

export type Verdict = 'go' | 'skippable' | 'optional' | 'unknown';

export interface Advice {
  verdict: Verdict;
  reasons: string[];
}

export interface AttendanceAdvice extends Advice {
  commitmentId: string;
  date: DateStr;
}

// Plain logic with fixed sentences. It only advises; the user decides.
export function adviseAttendance(course: Course, title: string, shortfallMinutes: number): Advice {
  if (course.lab) return { verdict: 'go', reasons: ['Labs need you there.'] };
  if (course.attendanceWeight === undefined) {
    return { verdict: 'unknown', reasons: ['Add whether attendance counts toward the grade.'] };
  }
  if (course.attendanceWeight > 0) {
    return { verdict: 'go', reasons: [`Attendance counts ${course.attendanceWeight}% of the grade.`] };
  }
  if (course.recorded === 'yes') {
    return shortfallMinutes > 0
      ? { verdict: 'skippable', reasons: [`Recorded, attendance counts 0%, and ${title} is ${shortfallMinutes} min short.`] }
      : { verdict: 'optional', reasons: ['Recorded and attendance counts 0%. Skipping is fine, but you are not behind.'] };
  }
  if (course.recorded === 'no') {
    const reasons = ['Not recorded, so skipping means missing the lecture.'];
    if (course.examShare !== undefined && course.examShare >= 50) {
      reasons.push(`Exams are ${course.examShare}% of the grade, so what is said here matters.`);
    }
    return { verdict: 'optional', reasons };
  }
  return { verdict: 'optional', reasons: ['Attendance counts 0%. I do not know if it is recorded.'] };
}

// Behind means the task has an open shortfall; a dismissed one still counts, dismissing only hides it from Nudge.
function shortfallOf(taskId: string, warnings: Warning[]): number {
  return warnings
    .filter((w) => (w.kind === 'weekly-short' || w.kind === 'deadline-short') && w.detail?.taskId === taskId)
    .reduce((t, w) => t + (w.detail?.minutes ?? 0), 0);
}

export function attendanceFor(state: State, warnings: Warning[], today: DateStr, horizonDays: number): AttendanceAdvice[] {
  const out: AttendanceAdvice[] = [];
  for (const c of state.commitments) {
    if (c.courseId === undefined) continue;
    const task = state.tasks.find((t) => t.id === c.courseId);
    if (!task || !task.course) continue;
    const advice = adviseAttendance(task.course, task.title, shortfallOf(task.id, warnings));
    for (let i = 0; i < horizonDays; i++) {
      const date = addDays(today, i);
      if (occurrencesOn(date, [c]).length > 0) out.push({ commitmentId: c.id, date, ...advice, reasons: [...advice.reasons] });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.commitmentId.localeCompare(b.commitmentId));
}
