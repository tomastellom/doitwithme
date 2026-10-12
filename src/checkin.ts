import { replan } from './replan.ts';
import type { Block, DateStr, Mood, State } from './types.ts';

export interface Moved {
  minutes: number;
  dates: DateStr[];
}

interface Clock {
  today: DateStr;
  nowMinutes?: number;
  horizonDays: number;
}

// Generated work only: ticked, skipped and passed blocks are not what a low day moves.
const generated = (blocks: Block[], date: DateStr): number =>
  blocks.filter((b) => b.date === date && b.status === undefined).reduce((t, b) => t + (b.end - b.start), 0);

export function applyCheckIn(state: State, mood: Mood, clock: Clock): { state: State; moved: Moved | null } {
  const answered: State = {
    ...state,
    checkIns: [...(state.checkIns ?? []).filter((c) => c.date !== clock.today), { date: clock.today, mood }],
  };
  const next = replan(answered, clock.today, clock.nowMinutes, clock.horizonDays).state;
  if (mood !== 'low') return { state: next, moved: null };
  const before = replan(state, clock.today, clock.nowMinutes, clock.horizonDays).state.blocks;
  const minutes = Math.max(0, generated(before, clock.today) - generated(next.blocks, clock.today));
  const dates = [...new Set(next.blocks.map((b) => b.date))]
    .filter((d) => d > clock.today && generated(next.blocks, d) > generated(before, d))
    .sort();
  return { state: next, moved: { minutes, dates: minutes > 0 ? dates : [] } };
}
