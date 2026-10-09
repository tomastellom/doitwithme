import type { Window } from './types.ts';

export function freeSlots(window: Window, busy: Window[]): Window[] {
  const sorted = [...busy].sort((a, b) => a.start - b.start);
  const slots: Window[] = [];
  let cursor = window.start;
  for (const b of sorted) {
    if (b.start > cursor) slots.push({ start: cursor, end: Math.min(b.start, window.end) });
    cursor = Math.max(cursor, b.end);
    if (cursor >= window.end) break;
  }
  if (cursor < window.end) slots.push({ start: cursor, end: window.end });
  return slots.filter((s) => s.end > s.start);
}
