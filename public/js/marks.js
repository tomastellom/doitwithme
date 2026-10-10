import { dayItems } from './model.js';
import { duration } from './time.js';

const sameBlock = (b, item) => b.taskId === item.taskId && b.date === item.date && b.start === item.start && b.end === item.end;
const markOf = (state, item) => (state.commitmentMarks ?? []).find((m) => m.id === item.commitmentId && m.date === item.date) ?? null;

// What a calendar item's mark is: null (nothing yet), 'done', 'missed' or 'waived' (taken off the week).
export const statusOf = (state, item) => {
  if (item.kind === 'block') return state.blocks.find((b) => sameBlock(b, item))?.status ?? null;
  if (item.kind === 'commitment') return markOf(state, item)?.status ?? null;
  return null;
};

// A new state with the mark set (or cleared with null). Everything else is left alone.
export function withStatus(state, item, status) {
  if (item.kind === 'block') {
    return {
      ...state,
      blocks: state.blocks.map((b) => {
        if (!sameBlock(b, item)) return b;
        const { status: _old, ...rest } = b;
        return status === null ? rest : { ...rest, status };
      }),
    };
  }
  const others = (state.commitmentMarks ?? []).filter((m) => !(m.id === item.commitmentId && m.date === item.date));
  const next = status === null || status === 'waived' ? others : [...others, { id: item.commitmentId, date: item.date, status }];
  const { commitmentMarks: _drop, ...rest } = state;
  return next.length > 0 ? { ...rest, commitmentMarks: next } : rest;
}

// Everything planned on a day is done: the reason for the big celebration.
export function dayIsAllDone(state, date) {
  const items = dayItems(state, date, []).filter((i) => i.kind !== 'travel');
  return items.length > 0 && items.every((i) => statusOf(state, i) === 'done');
}

const MESSAGES = ['Nice.', 'Well done.', 'One less to think about.', 'That counts.'];

// What Nudge says after something is ticked off.
export function cheerFor(state, item, pick = 0) {
  const lead = MESSAGES[pick % MESSAGES.length];
  const minutes = item.end - item.start;
  const big = dayIsAllDone(state, item.date);
  return {
    big,
    title: big ? 'That is everything for today.' : `${lead} ${item.title} done.`,
    text: item.kind === 'block' ? `${duration(minutes)} of ${item.title} is in the bank.` : `${item.title} is ticked off.`,
  };
}

// The actions the screens share: tick, undo, "not done" and its choices.
export function createMarks(store, { pick = () => Math.floor(Math.random() * MESSAGES.length) } = {}) {
  const apply = (item, status) => store.saveState((fresh) => withStatus(fresh, item, status));
  return {
    statusOf: (item) => statusOf(store.get().state, item),
    async done(item) {
      await apply(item, 'done');
      const s = store.get();
      if (!s.formError && statusOf(s.state, item) === 'done') store.cheer(cheerFor(s.state, item, pick()));
    },
    undo: (item) => apply(item, null),
    // Not done and plan the time again somewhere free.
    moveLater: (item) => apply(item, 'missed'),
    // Not done and take the time off the week.
    takeOff: (item) => apply(item, 'waived'),
    // A class, a lesson: it did not happen, nothing to plan again.
    skipped: (item) => apply(item, 'missed'),
  };
}
