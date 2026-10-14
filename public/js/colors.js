// The colours a person can give a label. Text on top switches between ink and white by itself.
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

const toHex = (n) => `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;

// `a` moved toward `b` by `t` (0 keeps a, 1 gives b).
export function mixHex(a, b, t) {
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const ch = (shift) => Math.round(((x >> shift) & 255) * (1 - t) + ((y >> shift) & 255) * t);
  return toHex((ch(16) << 16) | (ch(8) << 8) | ch(0));
}

// A block is its label's color at this strength over white.
export const TINT = 0.16;

// The fill for a block and a text color from the same hue, darkened until it reads (4.5:1) on that fill.
export function tintOf(hex) {
  const fill = mixHex('#FFFFFF', hex, TINT);
  let text = hex;
  for (let t = 0; t <= 1 && contrast(text, fill) < 4.5; t = Math.round((t + 0.05) * 100) / 100) text = mixHex(hex, '#111111', t);
  return { fill, text };
}
