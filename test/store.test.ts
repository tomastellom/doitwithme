import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyState, loadState, saveState } from '../src/store.ts';
import { task } from './helpers.ts';

const dir = (): string => mkdtempSync(join(tmpdir(), 'doitwithme-'));

test('a missing file loads as an empty state', () => {
  assert.deepEqual(loadState(join(dir(), 'db.json')), emptyState());
});

test('save then load returns the same state and leaves no temp file', () => {
  const path = join(dir(), 'nested', 'db.json');
  const state = { ...emptyState(), tasks: [task()] };
  saveState(path, state);
  assert.deepEqual(loadState(path), state);
  assert.equal(existsSync(`${path}.tmp`), false);
});

test('a corrupt file raises an error naming the file and is not overwritten', () => {
  const path = join(dir(), 'db.json');
  writeFileSync(path, '{ not json');
  assert.throws(() => loadState(path), (e: unknown) => e instanceof Error && e.message.includes(path));
  assert.equal(readFileSync(path, 'utf8'), '{ not json');
});

test('a file with valid JSON but an invalid state is also refused', () => {
  const path = join(dir(), 'db.json');
  writeFileSync(path, JSON.stringify({ tasks: 'nope' }));
  assert.throws(() => loadState(path), (e: unknown) => e instanceof Error && e.message.includes(path));
});
