import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const MAX_ENTRIES = 200;
export const DAILY_LIMIT = 30;

export interface ChatEntry {
  at: string;
  question: string;
  answer: string;
}

export interface ChatLog {
  entries: ChatEntry[];
  day: string;
  count: number;
}

// Beside the data file, not inside the planner state: the browser saves the whole state back, and a stale page would erase newer chats.
export const chatPathFor = (statePath: string): string => `${statePath.replace(/\.json$/, '')}.chat.json`;

export const emptyLog = (): ChatLog => ({ entries: [], day: '', count: 0 });

const isEntry = (e: unknown): e is ChatEntry => {
  if (typeof e !== 'object' || e === null) return false;
  const o = e as Record<string, unknown>;
  return typeof o.at === 'string' && typeof o.question === 'string' && typeof o.answer === 'string';
};

// History is a convenience: a file that cannot be read is treated as empty rather than breaking the chat.
export function loadChat(path: string): ChatLog {
  if (!existsSync(path)) return emptyLog();
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    return {
      entries: Array.isArray(raw.entries) ? raw.entries.filter(isEntry).slice(-MAX_ENTRIES) : [],
      day: typeof raw.day === 'string' ? raw.day : '',
      count: Number.isInteger(raw.count) && raw.count >= 0 ? raw.count : 0,
    };
  } catch {
    return emptyLog();
  }
}

export function saveChat(path: string, log: ChatLog): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(log, null, 2)}\n`);
  renameSync(tmp, path);
}

export const usedToday = (log: ChatLog, day: string): number => (log.day === day ? log.count : 0);

// Counts a message before the AI is asked, so a failing or stuck call still uses up the day (the AI may have billed for it).
export function countAttempt(log: ChatLog, day: string): ChatLog | null {
  const used = usedToday(log, day);
  if (used >= DAILY_LIMIT) return null;
  return { ...log, day, count: used + 1 };
}

export function addExchange(log: ChatLog, entry: ChatEntry): ChatLog {
  return { ...log, entries: [...log.entries, entry].slice(-MAX_ENTRIES) };
}
