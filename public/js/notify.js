// Shows a browser notification for a warning that is new since the last look, but only while the tab is hidden.
export function createNotifier({ ui, win, doc }) {
  let seen = null;
  return {
    observe(s, items) {
      if (s.status !== 'ready' || !s.state || s.isEmpty) return [];
      const keys = items.map((i) => i.key);
      if (seen === null) {
        seen = new Set(keys);
        return [];
      }
      const fresh = items.filter((i) => !seen.has(i.key));
      for (const k of keys) seen.add(k);
      if (fresh.length === 0 || !ui.notify() || doc.visibilityState !== 'hidden') return [];
      const announced = [];
      for (const item of fresh) {
        try {
          new win.Notification('doitwithme', { body: item.headline, tag: item.key });
          announced.push(item.key);
        } catch {
          // A browser that refuses must not break the page.
        }
      }
      return announced;
    },
  };
}

// A hidden tab does not hear from the server, so while notifications are on it asks for a fresh plan now and then.
export function startHiddenRefresh({ ui, doc, refresh, setTimer, clearTimer, everyMs = 300000 }) {
  let timer = null;
  const arm = () => { timer = setTimer(tick, everyMs); };
  function tick() {
    if (doc.visibilityState === 'hidden' && ui.notify()) refresh();
    arm();
  }
  arm();
  return () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
}
