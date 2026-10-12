import { FULL_WEEKDAYS, WEEKDAYS, duration, weekdayOf } from './time.js';

export const todayMood = (state, today) => {
  const found = state && (state.checkIns ?? []).find((c) => c.date === today);
  return found ? found.mood : null;
};

const hasBlocks = (state, today) => state.blocks.some((b) => b.date === today);

export const canReopen = (state, today) =>
  Boolean(state) && state.preferences.checkInEnabled && todayMood(state, today) === 'skipped';

export const shouldAsk = (state, today, reopened) =>
  Boolean(state) && state.preferences.checkInEnabled && hasBlocks(state, today)
    && (todayMood(state, today) === null || (reopened && todayMood(state, today) === 'skipped'));

// The wording is rule-based and picked by the date, so one day always reads the same.
const pick = (lines, date) => lines[Number(date.slice(8)) % lines.length];
const dayName = (date) => FULL_WEEKDAYS[weekdayOf(date)];

export const askLine = (date) => pick(['How are you today?', `How is ${dayName(date)} treating you?`, 'How are you feeling today?'], date);

const REPLIES = {
  good: ['Glad to hear it. The plan stays as it is.', 'Good. Nothing changes today.'],
  okay: ['Okay. The plan stays as it is.', 'Fine by me. Nothing changes today.'],
  low: ['That is fine. Today gets lighter.', 'Rest counts too. I made today lighter.'],
};
export const replyLine = (mood, date) => pick(REPLIES[mood], date);

export function movedLine(result, minimum) {
  if (result.minutes <= 0) return 'Nothing needed to move.';
  const days = result.dates.map((d) => WEEKDAYS[weekdayOf(d)]);
  const where = days.length > 1 ? `${days.slice(0, -1).join(', ')} and ${days[days.length - 1]}` : days[0];
  return `Kept ${duration(minimum)} today, moved ${duration(result.minutes)} to ${where}.`;
}
