import { weekdayOf } from './dates.ts';
import type { Commitment, DateStr, Minutes } from './types.ts';

export interface Occurrence {
  title: string;
  category: string;
  start: Minutes;
  end: Minutes;
  bufferBefore: Minutes;
}

export interface Busy {
  title: string;
  start: Minutes;
  end: Minutes;
}

export function occurrencesOn(date: DateStr, commitments: Commitment[]): Occurrence[] {
  const out: Occurrence[] = [];
  for (const c of commitments) {
    if (c.exceptions.includes(date)) continue;
    const p = c.pattern;
    const hit =
      p.kind === 'once'
        ? p.date === date
        : date >= p.from && date <= p.to && p.weekdays.includes(weekdayOf(date));
    if (hit) {
      out.push({
        title: c.title,
        category: c.category,
        start: c.start,
        end: c.end,
        bufferBefore: c.bufferBefore,
      });
    }
  }
  return out;
}

export function busyOn(date: DateStr, commitments: Commitment[]): Busy[] {
  return occurrencesOn(date, commitments).map((o) => ({
    title: o.title,
    start: Math.max(0, o.start - o.bufferBefore),
    end: o.end,
  }));
}
