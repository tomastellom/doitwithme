import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/server.ts';
import { fakeChatProvider } from '../src/chat.ts';
import type { ChatProvider, ChatTurn } from '../src/chat.ts';
import { DAILY_LIMIT, chatPathFor } from '../src/chathistory.ts';
import { emptyState, saveState } from '../src/store.ts';
import { AiError } from '../src/workload.ts';

const json = { 'content-type': 'application/json' };
const say = (text: string): ChatTurn => ({ text, toolCalls: [], assistantContent: [{ type: 'text', text }] });
const servers: Server[] = [];
const apps: Record<string, { base: string; file: string }> = {};

async function start(name: string, chat?: ChatProvider) {
  const file = join(mkdtempSync(join(tmpdir(), 'doitwithme-chat-api-')), 'db.json');
  const state = emptyState();
  state.tasks.push({ id: 't', title: 'Chemistry', category: 'study', weeklyMinutes: 120, maxBlock: 120, onePerDay: false, priority: 3 });
  saveState(file, state);
  const server = createApp(file, chat ? { chat } : {});
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  apps[name] = { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, file };
}
const post = (name: string, b: unknown) => fetch(`${apps[name].base}/api/chat`, { method: 'POST', headers: json, body: JSON.stringify(b) });
const ask = (name: string, message = 'What is up?') => post(name, { today: '2026-10-05', message });

before(async () => {
  await start('none');
  await start('ok', fakeChatProvider(() => say('Chemistry is on your list.')));
  await start('failing', { status: 'ready', async turn() { throw new AiError('busy', 'The AI is busy right now. Try again in a moment.'); } });
  await start('limit', fakeChatProvider(() => say('ok')));
  await start('survive', fakeChatProvider(() => say('kept')));
});
after(() => servers.forEach((s) => s.close()));

test('without the AI, chat says so plainly and writes nothing', async () => {
  const res = await ask('none');
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /not connected yet.*anthropic-setup/);
  assert.equal(existsSync(chatPathFor(apps.none.file)), false);
});

test('an answer comes back, is saved to history, and the planner state is not touched', async () => {
  const before = readFileSync(apps.ok.file, 'utf8');
  const res = await ask('ok', 'What do I study?');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.answer, 'Chemistry is on your list.');
  assert.ok(body.sent >= 1);
  assert.equal(body.remaining, DAILY_LIMIT - 1);
  assert.equal(readFileSync(apps.ok.file, 'utf8'), before, 'the planner file is byte for byte the same');
  const history = await (await fetch(`${apps.ok.base}/api/chat/history`)).json();
  assert.deepEqual(history.entries.map((e: any) => [e.question, e.answer]), [['What do I study?', 'Chemistry is on your list.']]);
});

test('bad input is rejected before the AI is asked', async () => {
  for (const b of [{}, { today: '2026-10-05' }, { today: '2026-10-05', message: '' }, { today: '2026-10-05', message: 'x'.repeat(1001) }, { today: 'soon', message: 'hi' }]) {
    assert.equal((await post('ok', b)).status, 400, JSON.stringify(b).slice(0, 40));
  }
  const notJson = await fetch(`${apps.ok.base}/api/chat`, { method: 'POST', body: 'hi' });
  assert.equal(notJson.status, 415);
});

test('a failed AI call gives the plain sentence, saves no history, but still counts toward the day', async () => {
  const res = await ask('failing');
  assert.equal(res.status, 502);
  assert.equal((await res.json()).error, 'The AI is busy right now. Try again in a moment.');
  const history = await (await fetch(`${apps.failing.base}/api/chat/history`)).json();
  assert.deepEqual(history.entries, []);
  assert.equal(JSON.parse(readFileSync(chatPathFor(apps.failing.file), 'utf8')).count, 1);
});

test('the 31st message of a day is refused', async () => {
  for (let i = 0; i < DAILY_LIMIT; i++) assert.equal((await ask('limit')).status, 200, `message ${i + 1}`);
  const res = await ask('limit');
  assert.equal(res.status, 429);
  assert.match((await res.json()).error, /30 messages.*tomorrow/);
});

test('history survives the browser saving the planner state, and Clear history empties it', async () => {
  await ask('survive', 'first');
  const state = await (await fetch(`${apps.survive.base}/api/state`)).json();
  assert.equal((await fetch(`${apps.survive.base}/api/state`, { method: 'PUT', headers: json, body: JSON.stringify(state) })).status, 200);
  let history = await (await fetch(`${apps.survive.base}/api/chat/history`)).json();
  assert.equal(history.entries.length, 1);
  assert.equal((await fetch(`${apps.survive.base}/api/chat/history`, { method: 'DELETE' })).status, 200);
  history = await (await fetch(`${apps.survive.base}/api/chat/history`)).json();
  assert.deepEqual(history.entries, []);
  assert.equal(JSON.parse(readFileSync(chatPathFor(apps.survive.file), 'utf8')).count, 1, 'clearing history does not give the day back');
});
