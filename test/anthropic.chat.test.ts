import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anthropicChatProvider } from '../src/anthropic.ts';
import { TOOLS } from '../src/chattools.ts';

const KEY = 'sk-ant-secret-key-123';
const input = { system: 'Be Nudge.', messages: [{ role: 'user' as const, content: 'hello' }], tools: TOOLS, toolsAllowed: true };
const reply = (content: unknown[], extra: any = {}) => ({ id: 'msg_1', type: 'message', role: 'assistant', stop_reason: 'end_turn', content, usage: {}, ...extra });
const answer = (status: number, body: unknown) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as any;
function recorder(r: any) {
  const calls: any[] = [];
  return { calls, fetchFn: (async (url: string, init: any) => { calls.push({ url, init }); return r(url, init); }) as any };
}

test('one request carries the system text, the messages and the tools, and a plain answer is read by block type', async () => {
  const { calls, fetchFn } = recorder(answer(200, reply([{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: 'Hi there.' }])));
  const turn = await anthropicChatProvider({ key: KEY, fetchFn }).turn(input);
  assert.deepEqual([turn.text, turn.toolCalls], ['Hi there.', []]);
  const [{ url, init }] = calls;
  assert.equal(url, 'https://api.anthropic.com/v1/messages');
  assert.equal(init.redirect, 'error');
  assert.equal(init.headers['x-api-key'], KEY);
  assert.equal(init.body.includes(KEY), false);
  const body = JSON.parse(init.body);
  assert.equal(body.model, 'claude-haiku-5-5');
  assert.equal(body.system, 'Be Nudge.');
  assert.deepEqual(body.messages, input.messages);
  assert.deepEqual(body.tools.map((t: any) => t.name), ['find', 'free_time']);
  assert.equal('tool_choice' in body, false);
  for (const banned of ['temperature', 'top_p', 'top_k', 'stream']) assert.equal(banned in body, false, banned);
});

test('a tool request comes back as calls, and the whole content is kept to be sent back unchanged', async () => {
  const content = [{ type: 'thinking', thinking: 'hm', signature: 's' }, { type: 'tool_use', id: 'toolu_1', name: 'find', input: { words: 'ana' } }];
  const { fetchFn } = recorder(answer(200, reply(content, { stop_reason: 'tool_use' })));
  const turn = await anthropicChatProvider({ key: KEY, fetchFn }).turn(input);
  assert.deepEqual(turn.toolCalls, [{ id: 'toolu_1', name: 'find', input: { words: 'ana' } }]);
  assert.deepEqual(turn.assistantContent, content);
});

test('when lookups are used up the request forbids tools but still lists them', async () => {
  const { calls, fetchFn } = recorder(answer(200, reply([{ type: 'text', text: 'Done.' }])));
  await anthropicChatProvider({ key: KEY, fetchFn }).turn({ ...input, toolsAllowed: false });
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.tool_choice, { type: 'none' });
  assert.equal(body.tools.length, 2);
});

test('failures use the same plain sentences as the estimate, and never the key', async () => {
  const cases: [number, string][] = [[401, 'key'], [402, 'billing'], [429, 'busy'], [529, 'busy'], [500, 'server']];
  for (const [status, code] of cases) {
    const { fetchFn } = recorder(answer(status, {}));
    await assert.rejects(anthropicChatProvider({ key: KEY, fetchFn }).turn(input), (e: any) => e.code === code && !e.message.includes(KEY));
  }
  const refusal = recorder(answer(200, reply([], { stop_reason: 'refusal' })));
  await assert.rejects(anthropicChatProvider({ key: KEY, fetchFn: refusal.fetchFn }).turn(input), (e: any) => e.code === 'declined');
  const cutoff = recorder(answer(200, reply([{ type: 'text', text: 'Hal' }], { stop_reason: 'max_tokens' })));
  await assert.rejects(anthropicChatProvider({ key: KEY, fetchFn: cutoff.fetchFn }).turn(input), (e: any) => e.code === 'bad-response');
  const offline = (async () => { throw new TypeError('failed'); }) as any;
  await assert.rejects(anthropicChatProvider({ key: KEY, fetchFn: offline }).turn(input), (e: any) => e.code === 'offline');
});

test('a bad key or model name is refused when the provider is made', () => {
  assert.throws(() => anthropicChatProvider({ key: 'sk-ant\nbad' }));
  assert.throws(() => anthropicChatProvider({ key: KEY, model: 'gpt-4' }));
});
