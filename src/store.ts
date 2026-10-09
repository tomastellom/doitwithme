import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { defaultPreferences } from './defaults.ts';
import type { State } from './types.ts';
import { ValidationError, validateState } from './validate.ts';

export function emptyState(): State {
  return {
    commitments: [],
    tasks: [],
    deadlines: [],
    places: [],
    commutes: [],
    preferences: structuredClone(defaultPreferences),
    blocks: [],
    approvedSoft: [],
    dismissed: [],
  };
}

export function loadState(path: string): State {
  if (!existsSync(path)) return emptyState();
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`Cannot read ${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    return validateState(raw);
  } catch (err) {
    if (err instanceof ValidationError) throw new Error(`${path} is not a valid state file: ${err.message}`);
    throw err;
  }
}

export function saveState(path: string, state: State): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(tmp, path);
}
