import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DAILY_LIMIT, MAX_ENTRIES, addExchange, chatPathFor, countAttempt, emptyLog, loadChat, saveChat, usedToday } from '../src/chathistory.ts';

const dir = () => mkdtempSync(join(tmpdir(), 'doitwithme-chat-'));
const entry = (n: number) => ({ at: `2026-10-12T10:00:${String(n % 60).padStart(2, '0')}Z`, question: `q${n}`, answer: `a${n}` });

test('the chat file sits beside the data file', () => {
  assert.equal(chatPathFor('/x/db.json'), '/x/db.chat.json');
  assert.equal(chatPathFor('data/state'), 'data/state.chat.json');
});

test('a missing file is an empty log, and a log survives a save and a load', () => {
  const path = join(dir(), 'db.chat.json');
  assert.deepEqual(loadChat(path), emptyLog());
  const log = addExchange(countAttempt(emptyLog(), '2026-10-12')!, entry(1));
  saveChat(path, log);
  assert.deepEqual(loadChat(path), log);
});

test('a broken or odd file never throws and drops only what is not an entry', () => {
  const path = join(dir(), 'db.chat.json');
  writeFileSync(path, '{not json');
  assert.deepEqual(loadChat(path), emptyLog());
  writeFileSync(path, 'null');
  assert.deepEqual(loadChat(path), emptyLog());
  writeFileSync(path, JSON.stringify({ entries: [entry(1), { at: 1 }, 'x', entry(2)], day: 5, count: -3 }));
  const log = loadChat(path);
  assert.deepEqual(log.entries.map((e) => e.question), ['q1', 'q2']);
  assert.equal(log.day, '');
  assert.equal(log.count, 0);
});

test('only the latest 200 exchanges are kept', () => {
  let log = emptyLog();
  for (let i = 0; i < MAX_ENTRIES + 5; i++) log = addExchange(log, entry(i));
  assert.equal(log.entries.length, MAX_ENTRIES);
  assert.equal(log.entries[0].question, 'q5');
  assert.equal(log.entries[MAX_ENTRIES - 1].question, `q${MAX_ENTRIES + 4}`);
});

test('the day counter counts, resets on a new day, and stops at the limit', () => {
  let log = emptyLog();
  for (let i = 0; i < DAILY_LIMIT; i++) {
    const next = countAttempt(log, '2026-10-12');
    assert.ok(next, `message ${i + 1} is allowed`);
    log = next;
  }
  assert.equal(usedToday(log, '2026-10-12'), DAILY_LIMIT);
  assert.equal(countAttempt(log, '2026-10-12'), null);
  assert.equal(usedToday(log, '2026-10-13'), 0);
  assert.equal(countAttempt(log, '2026-10-13')!.count, 1);
});
