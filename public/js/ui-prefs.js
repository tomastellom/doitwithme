const KEY = 'doitwithme.notify';
const HOURS_KEY = 'doitwithme.hours';
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
    disableNotify() {
      on = false;
      write(false);
    },
  };
}
