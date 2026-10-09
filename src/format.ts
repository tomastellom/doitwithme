import { occurrencesOn } from './busy.ts';
import { addDays, weekdayOf } from './dates.ts';
import type { Block, Commitment, DateStr, Minutes, Warning } from './types.ts';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function hhmm(m: Minutes): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function formatPlan(
  commitments: Commitment[],
  blocks: Block[],
  warnings: Warning[],
  today: DateStr,
  days: number,
): string {
  const lines: string[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    lines.push(`${DAY_NAMES[weekdayOf(date)]} ${date}`);
    const entries = [
      ...occurrencesOn(date, commitments).map((o) => ({
        start: o.start,
        text: `${hhmm(o.start)}-${hhmm(o.end)}  ${o.title} [fixed]`,
      })),
      ...blocks
        .filter((b) => b.date === date)
        .map((b) => ({ start: b.start, text: `${hhmm(b.start)}-${hhmm(b.end)}  ${b.title} (${b.category})` })),
    ].sort((a, b) => a.start - b.start);
    if (entries.length === 0) lines.push('  (nothing planned)');
    for (const e of entries) lines.push(`  ${e.text}`);
  }
  if (warnings.length === 0) {
    lines.push('No warnings.');
  } else {
    lines.push('Warnings:');
    for (const w of warnings) lines.push(`  - ${w.message}`);
  }
  return lines.join('\n');
}
