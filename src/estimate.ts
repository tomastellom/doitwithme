import type { Course } from './types.ts';

// Every tunable number lives here.
export const FACTORS = {
  difficulty: [0.8, 0.9, 1.0, 1.15, 1.3],
  weeklyGraded: 0.15,
  lab: 0.1,
  examOnly: -0.1,
  step: 15,
  max: 3000,
};

const WORDS = ['very easy', 'easy', 'medium', 'hard', 'very hard'];

export interface Scale {
  hoursPerCredit: number | null;
  normalCredits: number;
  fullLoadHours: number;
}

export function hoursText(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

export function ruleOfThumb(
  course: Pick<Course, 'credits' | 'difficulty' | 'examOnly' | 'weeklyGraded' | 'lab'>,
  scale: Scale,
): { minutes: number; reason: string } {
  const credits = Number.isFinite(course.credits) && course.credits > 0 ? course.credits : 0;
  const level = Math.min(5, Math.max(1, Math.round(course.difficulty) || 3));
  const hasHours = scale.hoursPerCredit !== null && scale.hoursPerCredit > 0;
  const base = hasHours
    ? credits * (scale.hoursPerCredit as number) * 60
    : scale.normalCredits > 0 ? (scale.fullLoadHours * 60 * credits) / scale.normalCredits : 0;
  const adjust =
    1 + (course.weeklyGraded ? FACTORS.weeklyGraded : 0) + (course.lab ? FACTORS.lab : 0) + (course.examOnly ? FACTORS.examOnly : 0);
  const raw = base * FACTORS.difficulty[level - 1] * adjust;
  const minutes = Number.isFinite(raw) ? Math.min(FACTORS.max, Math.max(0, Math.round(raw / FACTORS.step) * FACTORS.step)) : 0;

  const extras = [course.weeklyGraded && 'weekly graded work', course.lab && 'a lab', course.examOnly && 'exam-only grading'].filter(Boolean);
  const withExtras = extras.length > 0 ? ` with ${extras.join(' and ')}` : '';
  const word = WORDS[level - 1];
  const kind = `${word.charAt(0).toUpperCase()}${word.slice(1)} course (${level} of 5)${withExtras}`;
  const lead = hasHours
    ? `${plural(credits, 'credit')} at ${hoursText(Math.round((scale.hoursPerCredit as number) * 60))} a week each.`
    : `${credits} of your ${scale.normalCredits} normal credits is ${Math.round((credits / scale.normalCredits) * 100)}% of a ${scale.fullLoadHours}h load.`;
  return { minutes, reason: `${lead} ${kind}: about ${hoursText(minutes)} a week.` };
}
