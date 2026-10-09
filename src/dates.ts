export type DateStr = string;

const DAY_MS = 86_400_000;

const parse = (d: DateStr): number => Date.parse(`${d}T00:00:00Z`);

export function weekdayOf(d: DateStr): number {
  return new Date(parse(d)).getUTCDay();
}

export function addDays(d: DateStr, n: number): DateStr {
  return new Date(parse(d) + n * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(a: DateStr, b: DateStr): number {
  return Math.round((parse(b) - parse(a)) / DAY_MS);
}

export function weekStart(d: DateStr): DateStr {
  return addDays(d, -((weekdayOf(d) + 6) % 7));
}
