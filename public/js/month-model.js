import { dayItems } from './model.js';
import { FULL_WEEKDAYS, addDays, weekStart, weekdayOf } from './time.js';

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MAX_DOTS = 8;

export const monthStart = (date) => `${date.slice(0, 7)}-01`;

export function addMonths(date, n) {
  const index = Number(date.slice(0, 4)) * 12 + (Number(date.slice(5, 7)) - 1) + n;
  const year = Math.floor(index / 12);
  return `${String(year).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}-01`;
}

// A month as whole weeks, Monday first, so every row lines up with the Week screen.
export function monthModel(state, anchor, today, travel = []) {
  const first = monthStart(anchor);
  const next = addMonths(first, 1);
  const start = weekStart(first);
  const days = Math.round((Date.parse(`${next}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
  const rows = Math.ceil(days / 7);
  const dueDates = new Set((state.deadlines ?? []).map((d) => d.dueDate));
  const monthIndex = Number(first.slice(5, 7)) - 1;
  const cells = [];
  const used = new Map();
  let due = 0;
  for (let i = 0; i < rows * 7; i++) {
    const date = addDays(start, i);
    const inMonth = date.slice(0, 7) === first.slice(0, 7);
    const groups = inMonth ? dayItems(state, date, travel).filter((x) => x.kind !== 'travel').map((x) => ({ id: x.group, color: x.color, look: x.look, name: x.label, status: x.status })) : [];
    for (const g of groups) if (!used.has(g.id)) used.set(g.id, g);
    const isDue = inMonth && dueDates.has(date);
    if (isDue) due += 1;
    cells.push({
      date,
      num: Number(date.slice(8)),
      weekday: FULL_WEEKDAYS[weekdayOf(date)],
      monthName: MONTH_NAMES[Number(date.slice(5, 7)) - 1],
      inMonth,
      isToday: date === today,
      isPast: inMonth && date < today,
      dots: groups.slice(0, MAX_DOTS),
      more: Math.max(0, groups.length - MAX_DOTS),
      planned: groups.length,
      due: isDue,
    });
  }
  return { first, title: MONTH_NAMES[monthIndex], year: Number(first.slice(0, 4)), cells, due, legend: [...used.values()] };
}
