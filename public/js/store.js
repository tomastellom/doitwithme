import { buildConfirm } from './nudge-model.js';

const GENERIC_ERROR = 'Something unexpected happened. Reload the page.';
const STALE_NOTICE = 'That warning changed, so I refreshed the plan.';

export function createStore(api, getClock) {
  let current = {
    status: 'loading', state: null, warnings: [], approvedSoft: [], dismissed: [],
    isEmpty: false, error: null, busy: false, confirm: null, notice: null, formError: null,
  };
  const listeners = new Set();

  const set = (patch) => {
    current = { ...current, ...patch };
    for (const listener of [...listeners]) listener(current);
  };
  // Only errors that came from the server carry a numeric status and a message meant for people.
  const fail = (e) => set({
    status: e && e.status === 0 ? 'offline' : 'error',
    error: e && typeof e.status === 'number' && e.message ? e.message : GENERIC_ERROR,
    busy: false,
  });
  const merged = (r, extra = {}) => ({
    status: 'ready',
    error: null,
    notice: null,
    state: { ...current.state, blocks: r.blocks, approvedSoft: r.approvedSoft, dismissed: r.dismissed },
    warnings: r.warnings,
    approvedSoft: r.approvedSoft,
    dismissed: r.dismissed,
    ...extra,
  });

  async function guard(fn) {
    if (current.busy || !current.state) return;
    set({ busy: true });
    try {
      await fn();
    } catch (e) {
      fail(e);
      return;
    }
    set({ busy: false });
  }

  async function load() {
    set({ status: 'loading', error: null, busy: false });
    try {
      const state = await api.getState();
      if (state.tasks.length === 0 && state.commitments.length === 0) {
        set({ status: 'ready', state, warnings: [], approvedSoft: state.approvedSoft, dismissed: state.dismissed, isEmpty: true, confirm: null });
        return;
      }
      const r = await api.replan(getClock());
      current = { ...current, state };
      set(merged(r, { isEmpty: false, confirm: null }));
    } catch (e) {
      fail(e);
    }
  }

  return {
    get: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    idle() {
      if (!current.busy) return Promise.resolve();
      return new Promise((resolve) => {
        const off = this.subscribe((s) => {
          if (!s.busy) {
            off();
            resolve();
          }
        });
      });
    },
    load,
    replan: () => guard(async () => set(merged(await api.replan(getClock()), { confirm: null }))),
    approve: (date) =>
      guard(async () => {
        const r = await api.approve(date, getClock());
        set(merged(r, { confirm: buildConfirm(r.warnings, date) }));
      }),
    undo: (date) => guard(async () => set(merged(await api.undo(date, getClock()), { confirm: null }))),
    dismiss: (keys) =>
      guard(async () => {
        let last = null;
        let stale = false;
        for (const key of keys) {
          try {
            last = await api.dismiss(key, getClock());
          } catch (e) {
            if (!e || e.status !== 409) throw e;
            stale = true;
          }
        }
        if (last) set(merged(last, { confirm: null }));
        else if (stale) set(merged(await api.replan(getClock()), { confirm: null, notice: STALE_NOTICE }));
      }),
    loadExample: () =>
      guard(async () => {
        await api.putState(await api.example());
        const state = await api.getState();
        const r = await api.replan(getClock());
        current = { ...current, state };
        set(merged(r, { isEmpty: false, confirm: null }));
      }),
    clearConfirm: () => set({ confirm: null, notice: null }),
    saveState: (next) =>
      guard(async () => {
        try {
          await api.putState(next);
        } catch (e) {
          if (e && e.status === 400) {
            set({ formError: e.message });
            return;
          }
          throw e;
        }
        const state = await api.getState();
        const r = await api.replan(getClock());
        current = { ...current, state };
        set(merged(r, {
          isEmpty: state.tasks.length === 0 && state.commitments.length === 0,
          confirm: null,
          formError: null,
        }));
      }),
    clearFormError: () => set({ formError: null }),
  };
}
