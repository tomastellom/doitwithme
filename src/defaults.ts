import type { Preferences } from './types.ts';

export const defaultPreferences: Preferences = {
  weekdayWindow: { start: 8 * 60, end: 22 * 60 },
  dayOffWindow: { start: 10 * 60, end: 20 * 60 },
  daysOff: [0, 6],
  minBlock: 30,
  minBreak: 10,
  softWindows: [
    { weekday: 5, start: 18 * 60, end: 24 * 60 },
    { weekday: 6, start: 18 * 60, end: 24 * 60 },
  ],
  softMode: 'ask',
  travelAllowanceMinutes: 30,
  hoursPerCredit: null,
  normalCredits: 30,
  fullLoadHours: 40,
};
