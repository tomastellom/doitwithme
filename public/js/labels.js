import { PALETTE, onColor } from './colors.js';

// Labels are what a commitment or a task is filed under. A label's id is what the item stores,
// so renaming never breaks anything, and the planner still finds the built-in 'study' by its id.
const ink = '#111111';
const label = (id, name, color, style = 'fill', extra = {}) => ({ id, name, color, style, ...extra });
export const DEFAULT_LABELS = [
  label('class', 'Class', ink), label('lesson', 'Lesson', ink), label('mass', 'Mass', ink),
  label('work', 'Work', ink), label('volunteering', 'Volunteering', ink), label('meeting', 'Meeting', ink),
  label('study', 'Study', '#FF4B1F', 'fill', { locked: true }),
  label('gym', 'Gym', '#1746F0'),
  label('chores', 'Chores', '#F5B400'), label('errands', 'Errands', '#F5B400'),
  label('personal project', 'Personal project', ink, 'outline'),
  label('social', 'Social', ink, 'outline'),
  label('other', 'Other', '#8A8D91', 'fill', { locked: true }),
];
// The planner treats these two specially (study gets soft time, other catches everything deleted), so they stay.
export const LOCKED_IDS = DEFAULT_LABELS.filter((l) => l.locked).map((l) => l.id);

export const labelsOf = (state) => (Array.isArray(state.labels) ? state.labels : DEFAULT_LABELS.map(({ locked, ...l }) => l));

const FALLBACK = { id: 'other', name: 'Other', color: '#8A8D91', style: 'fill' };
// Finds the label for what an item stores: its id, then the same text in any case, then a label with that name.
export function labelFor(labels, category) {
  const c = String(category ?? '').toLowerCase().trim();
  return labels.find((l) => l.id === category)
    ?? labels.find((l) => l.id.toLowerCase() === c)
    ?? labels.find((l) => l.name.toLowerCase() === c)
    ?? labels.find((l) => l.id === 'other')
    ?? FALLBACK;
}

export const labelOptions = (state) => labelsOf(state).map((l) => ({ value: l.id, label: l.name }));

const INK = '#111111';
const PAPER = '#FFFFFF';
// Gives an element its label's look: filled with readable text, or an outline on paper.
export function paint(node, color, style, { onInk = false } = {}) {
  if (style === 'outline') {
    node.style.borderColor = onInk ? PAPER : color;
    node.style.background = onInk ? INK : PAPER;
    node.style.color = onInk ? PAPER : INK;
  } else {
    // A dark fill disappears on an ink cell, so it flips to paper there.
    const hex = onInk && onColor(color) === PAPER ? PAPER : color;
    node.style.background = hex;
    node.style.color = onColor(hex);
  }
}
export const lookClass = (style) => (style === 'outline' ? 'is-outline' : 'is-fill');

export { PALETTE };
