import { labelFor, labelsOf } from './labels.js';
import { WEEKDAYS, MONTHS, addDays, daysBetween, weekdayOf } from './time.js';

const sum = (blocks) => blocks.reduce((t, b) => t + (b.end - b.start), 0);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function daysLabel(n) {
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  return `in ${n} days`;
}

export function deadlinesModel(state, clock) {
  const { today, nowMinutes, horizonDays } = clock;
  const last = addDays(today, horizonDays - 1);
  const finished = (b) => b.date < today || (b.date === today && b.end <= nowMinutes);

  const rows = state.deadlines
    .filter((d) => d.dueDate >= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id))
    .map((d) => {
      const task = state.tasks.find((t) => t.id === d.taskId);
      const mine = state.blocks.filter((b) => b.deadlineId === d.id);
      const done = sum(mine.filter(finished));
      const planned = sum(mine.filter((b) => !finished(b)));
      const beyond = d.dueDate > last;
      const short = beyond ? 0 : Math.max(0, d.effortMinutes - done - planned);
      const status = beyond ? 'later' : short > 0 ? 'short' : 'covered';
      const total = Math.max(d.effortMinutes, done + planned, 1);
      const pct = (m) => (d.effortMinutes === 0 && done + planned === 0 ? 0 : (m / total) * 100);
      return {
        id: d.id,
        day: Number(d.dueDate.slice(8)),
        month: MONTHS[Number(d.dueDate.slice(5, 7)) - 1],
        weekday: WEEKDAYS[weekdayOf(d.dueDate)],
        days: daysBetween(today, d.dueDate),
        daysLabel: daysLabel(daysBetween(today, d.dueDate)),
        title: `${task ? task.title : 'Unknown task'} ${d.kind}`,
        sub: task ? `${labelFor(labelsOf(state), task.category).name} / ${task.title}` : 'Unknown task',
        effort: d.effortMinutes,
        done,
        planned,
        short,
        status,
        doneW: pct(done),
        plannedW: pct(planned),
        shortW: pct(short),
      };
    });
  return { rows, open: rows.length, shorts: rows.filter((r) => r.status === 'short').length };
}

// True when something is due in the next seven days and every such due date is covered.
export function coveredThisWeek(model) {
  const soon = model.rows.filter((r) => r.days <= 7);
  return soon.length > 0 && soon.every((r) => r.status === 'covered');
}
