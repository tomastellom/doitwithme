const KEY = 'doitwithme.notify';

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
    disableNotify() {
      on = false;
      write(false);
    },
  };
}
