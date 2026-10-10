// The colours a person can give each kind of thing. Text on top switches between ink and white by itself.
export const PALETTE = [
  { id: 'ink', name: 'Ink', hex: '#111111' },
  { id: 'vermilion', name: 'Vermilion', hex: '#FF4B1F' },
  { id: 'cobalt', name: 'Cobalt', hex: '#1746F0' },
  { id: 'amber', name: 'Amber', hex: '#F5B400' },
  { id: 'green', name: 'Green', hex: '#0B7A43' },
  { id: 'teal', name: 'Teal', hex: '#00A3A3' },
  { id: 'sky', name: 'Sky', hex: '#4DB5FF' },
  { id: 'pink', name: 'Pink', hex: '#FF5FA2' },
  { id: 'brick', name: 'Brick', hex: '#A8321D' },
  { id: 'navy', name: 'Navy', hex: '#14213D' },
  { id: 'sand', name: 'Sand', hex: '#D9C7A0' },
  { id: 'grey', name: 'Grey', hex: '#8A8D91' },
];

export const COLOR_GROUPS = [
  { id: 'fixed', label: 'Fixed', note: 'Classes, work, lessons, mass', fallback: 'ink' },
  { id: 'study', label: 'Study', note: 'Study blocks the planner makes', fallback: 'vermilion' },
  { id: 'gym', label: 'Gym', note: 'Training', fallback: 'cobalt' },
  { id: 'admin', label: 'Chores and errands', note: 'Laundry, shopping, admin', fallback: 'amber' },
  { id: 'outline', label: 'Projects and social', note: 'Side projects, friends, volunteering (drawn as an outline)', fallback: 'ink' },
];

export const DEFAULT_COLORS = Object.fromEntries(COLOR_GROUPS.map((g) => [g.id, g.fallback]));
export const hexOf = (id) => (PALETTE.find((c) => c.id === id) ?? PALETTE[0]).hex;

const channel = (v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
};
export const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
// Whichever of ink or white reads better on the colour.
export const onColor = (hex) => (contrast(hex, '#111111') >= contrast(hex, '#FFFFFF') ? '#111111' : '#FFFFFF');

// Sets the colours on the page through the style object, which the content policy allows.
export function applyColors(target, choices) {
  if (!target || !target.style || typeof target.style.setProperty !== 'function') return;
  for (const g of COLOR_GROUPS) {
    const hex = hexOf(choices[g.id] ?? g.fallback);
    target.style.setProperty(`--g-${g.id}`, hex);
    target.style.setProperty(`--on-g-${g.id}`, onColor(hex));
  }
}
