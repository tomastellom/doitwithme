import { FULL_WEEKDAYS, isValidDate, longDate, shortDate } from './time.js';

// The words on every setup page. The sidebar uses the same titles, so a screen is called one thing everywhere.
export const COPY = {
  commitments: {
    title: 'Fixed times',
    lead: 'Things that happen at a set time. I plan everything else around them, so add these first.',
    examples: ['Classes', 'Work', 'Private lessons', 'Gym', 'Volunteering'],
    add: 'Add a fixed time',
    next: 'Next: tell me what needs time (To do), then what is due and when (Due dates).',
  },
  tasks: {
    title: 'To do',
    lead: 'Things that need time but have no set time, like study. Say how much a week and I find the time.',
    examples: ['Study for a course', 'An assignment', 'A project', 'Reading'],
    add: 'Add something to do',
    next: 'Next: add what is due and when (Due dates), so I can plan ahead of it.',
  },
  'due-dates': {
    title: 'Due dates',
    lead: 'Things with a date they must be done by, like an exam or an essay. I make sure there is time before it.',
    examples: ['Exams', 'Essays', 'Forms', 'Hand-ins'],
    add: 'Add a due date',
    next: 'Next: press Replan to see the week with everything in it.',
  },
  labels: {
    title: 'Labels',
    lead: 'Your own kinds of things, each with a color. The Week colors its blocks by them, and the sidebar uses them as filters.',
    examples: ['Study', 'Gym', 'Work'],
    add: 'New label',
    next: '',
  },
  places: {
    title: 'Places and travel',
    lead: 'Where things happen. Add home first, so I can plan the time to get there.',
    examples: ['Home', 'Campus', "A student's home"],
    add: 'Add a place',
    next: 'Next: switch to Travel and say how long each trip takes.',
  },
  commutes: {
    title: 'Travel',
    lead: 'How long it takes to get from one place to another. I put it in the week so you are never late.',
    examples: ['Home to campus', 'Campus to the gym'],
    add: 'Add a trip',
    next: '',
  },
};

export const BLANK_READBACK = 'Fill in the details and I will say it back here.';

export function lengthText(m) {
  if (m < 60) return `${m} min`;
  if (m % 60 === 0) return `${m / 60} h`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}

// Monday first, like the rest of the planner.
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const list = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
const clock = (t) => (/^\d{1,2}:\d{2}$/.test(String(t).trim()) ? String(t).trim().padStart(5, '0') : null);
const whole = (t) => (/^\d{1,9}$/.test(String(t).trim()) ? Number(String(t).trim()) : null);

function commitment(d, state) {
  const title = d.title.trim();
  const start = clock(d.start);
  const end = clock(d.end);
  if (!title || !start || !end) return '';
  let when;
  if (d.repeats === 'once') {
    if (!isValidDate(d.date)) return '';
    when = `on ${longDate(d.date)}`;
  } else {
    const days = ORDER.filter((w) => d.weekdays.includes(w));
    if (days.length === 0) return '';
    when = days.length === 7 ? 'every day' : `every ${list(days.map((w) => FULL_WEEKDAYS[w]))}`;
  }
  const place = (state.places ?? []).find((p) => p.id === d.placeId);
  const starting = d.repeats !== 'once' && isValidDate(d.from) ? `, starting ${shortDate(d.from)}` : '';
  return `${title}, ${when}, ${start} to ${end}${place ? `, at ${place.name}` : ''}${starting}.`;
}

function task(d) {
  const title = d.title.trim();
  if (!title) return '';
  const weekly = whole(d.weekly);
  if (weekly === null || weekly === 0) return `${title} has no weekly time set.`;
  const block = whole(d.maxBlock);
  return `${title} needs ${lengthText(weekly)} a week${block ? `, in blocks of up to ${lengthText(block)}` : ''}.`;
}

function dueDate(d, state) {
  const found = (state.tasks ?? []).find((t) => t.id === d.taskId);
  const effort = whole(d.effort);
  if (!found || !isValidDate(d.dueDate) || effort === null) return '';
  return `${found.title} ${d.kind} on ${longDate(d.dueDate)}, needing ${lengthText(effort)}.`;
}

// One plain sentence for what a form is about to create; '' until it is complete enough to say.
export function readBack(kindId, d, state) {
  if (kindId === 'commitments') return commitment(d, state);
  if (kindId === 'tasks') return task(d);
  if (kindId === 'due-dates') return dueDate(d, state);
  return '';
}
