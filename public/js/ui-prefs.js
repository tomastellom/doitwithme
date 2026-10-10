import { COLOR_GROUPS, DEFAULT_COLORS, PALETTE } from './colors.js';

const KEY = 'doitwithme.notify';
const HOURS_KEY = 'doitwithme.hours';
const COLORS_KEY = 'doitwithme.colors';
export const DEFAULT_RANGE = { from: 7, to: 22 };
const MIN_SPAN = 4;

export const validRange = (from, to) =>
  Number.isInteger(from) && Number.isInteger(to) && from >= 0 && to <= 24 && to - from >= MIN_SPAN;

export function createUiPrefs(win) {
  const read = () => {
    try {
      return Boolean(win.localStorage) && win.localStorage.getItem(KEY) === 'on';
    } catch {
      return false;
    }
  };
  const write = (on) => {
    try {
      if (win.localStorage) win.localStorage.setItem(KEY, on ? 'on' : 'off');
    } catch {
      // Storage can be blocked; the choice then lasts until the page closes.
    }
  };
  const readHours = () => {
    try {
      const m = /^(\d{1,2})-(\d{1,2})$/.exec((win.localStorage && win.localStorage.getItem(HOURS_KEY)) || '');
      if (m && validRange(Number(m[1]), Number(m[2]))) return { from: Number(m[1]), to: Number(m[2]) };
    } catch {
      // Storage can be blocked; the default range is used.
    }
    return { ...DEFAULT_RANGE };
  };
  const readColors = () => {
    const out = { ...DEFAULT_COLORS };
    try {
      const saved = JSON.parse((win.localStorage && win.localStorage.getItem(COLORS_KEY)) || '{}');
      for (const g of COLOR_GROUPS) if (PALETTE.some((c) => c.id === saved[g.id])) out[g.id] = saved[g.id];
    } catch {
      // A damaged value falls back to the defaults.
    }
    return out;
  };
  let chosen = readColors();
  let range = readHours();
  let on = read();
  const supported = () => typeof win.Notification === 'function';
  const permission = () => (supported() ? win.Notification.permission : 'unsupported');
  return {
    supported,
    permission,
    notify: () => on && permission() === 'granted',
    async enableNotify() {
      if (!supported()) return 'unsupported';
      let answer = win.Notification.permission;
      if (answer === 'default') answer = await win.Notification.requestPermission();
      if (answer === 'granted') {
        on = true;
        write(true);
      }
      return answer;
    },
    // The hours the Week and the Day show; the user's choice, kept in this browser.
    hours: () => ({ ...range }),
    setHours(from, to) {
      if (!validRange(from, to)) return false;
      range = { from, to };
      try {
        if (win.localStorage) win.localStorage.setItem(HOURS_KEY, `${from}-${to}`);
      } catch {
        // The choice then lasts until the page closes.
      }
      return true;
    },
    // The colour of each kind of thing, kept in this browser.
    colors: () => ({ ...chosen }),
    setColor(group, id) {
      if (!COLOR_GROUPS.some((g) => g.id === group) || !PALETTE.some((c) => c.id === id)) return false;
      chosen = { ...chosen, [group]: id };
      try {
        if (win.localStorage) win.localStorage.setItem(COLORS_KEY, JSON.stringify(chosen));
      } catch {
        // The choice then lasts until the page closes.
      }
      return true;
    },
    resetColor(group) {
      return this.setColor(group, DEFAULT_COLORS[group]);
    },
    disableNotify() {
      on = false;
      write(false);
    },
  };
}
