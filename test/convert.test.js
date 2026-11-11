import test from 'node:test';
import assert from 'node:assert/strict';
import { useTempData } from './helpers.js';
useTempData();
const { anthropicToOpenAI, openAIToAnthropic, resolveModel, parseTokenCap, usesCompletionTokens, upstreamMessage } = await import('../src/proxy.js');

test('Anthropic messages and tools convert to OpenAI chat format', () => {
  const r = anthropicToOpenAI({
    model: 'claude-placeholder', max_tokens: 500, system: [{ type: 'text', text: 'Be useful' }],
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    tools: [{ name: 'lookup', description: 'Lookup data', input_schema: { type: 'object', properties: { q: { type: 'string' } } } }],
    tool_choice: { type: 'any' }, temperature: 0.2, stop_sequences: ['END'], stream: true
  }, 'gpt-4o-mini');
  assert.equal(r.model, 'gpt-4o-mini');
  assert.deepEqual(r.messages[0], { role: 'system', content: 'Be useful' });
  assert.equal(r.messages[1].content, 'Hello');
  assert.equal(r.tools[0].function.name, 'lookup');
  assert.equal(r.tool_choice, 'required');
  assert.equal(r.max_tokens, 500);
  assert.equal(r.temperature, 0.2);
  assert.deepEqual(r.stop, ['END']);
  assert.equal(r.stream, true);
});

test('assistant text + tool_use become ONE assistant message with tool_calls', () => {
  const r = anthropicToOpenAI({ messages: [
    { role: 'assistant', content: [{ type: 'text', text: 'Checking' }, { type: 'tool_use', id: 't1', name: 'lookup', input: { q: 'x' } }] }
  ] }, 'm');
  assert.equal(r.messages.length, 1);
  assert.equal(r.messages[0].content, 'Checking');
  assert.equal(r.messages[0].tool_calls[0].id, 't1');
  assert.equal(r.messages[0].tool_calls[0].function.arguments, '{"q":"x"}');
});

test('tool results come BEFORE the follow-up user text, right after the assistant tool call', () => {
  const r = anthropicToOpenAI({ messages: [
    { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'a', input: {} }, { type: 'tool_use', id: 't2', name: 'b', input: {} }] },
    { role: 'user', content: [{ type: 'text', text: 'continue' }, { type: 'tool_result', tool_use_id: 't1', content: '42' }, { type: 'tool_result', tool_use_id: 't2', content: [{ type: 'text', text: 'ok' }] }] }
  ] }, 'm');
  assert.deepEqual(r.messages.map(m => m.role), ['assistant', 'tool', 'tool', 'user']);
  assert.equal(r.messages[0].content, null);
  assert.deepEqual(r.messages[1], { role: 'tool', tool_call_id: 't1', content: '42' });
  assert.equal(r.messages[2].content, 'ok');
  assert.equal(r.messages[3].content, 'continue');
});

test('images become image_url parts (base64 and url)', () => {
  const r = anthropicToOpenAI({ messages: [{ role: 'user', content: [
    { type: 'text', text: 'what is this?' },
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
    { type: 'image', source: { type: 'url', url: 'https://x.test/a.jpg' } }
  ] }] }, 'm');
  const c = r.messages[0].content;
  assert.equal(c[0].type, 'text');
  assert.equal(c[1].image_url.url, 'data:image/png;base64,AAAA');
  assert.equal(c[2].image_url.url, 'https://x.test/a.jpg');
});

test('reasoning models use max_completion_tokens and drop temperature', () => {
  assert.equal(usesCompletionTokens('o3-mini'), true);
  assert.equal(usesCompletionTokens('openai/o1'), true);
  assert.equal(usesCompletionTokens('gpt-5'), true);
  assert.equal(usesCompletionTokens('gpt-4o'), false);
  const r = anthropicToOpenAI({ max_tokens: 900, temperature: 1, messages: [] }, 'o3-mini');
  assert.equal(r.max_completion_tokens, 900);
  assert.equal(r.max_tokens, undefined);
  assert.equal(r.temperature, undefined);
});

test('server-side tools without a name are skipped; tool_choice none maps', () => {
  const r = anthropicToOpenAI({ messages: [], tools: [{ type: 'web_search_20250305' }, { name: 'ok', input_schema: { type: 'object' } }], tool_choice: { type: 'none' } }, 'm');
  assert.equal(r.tools.length, 1);
  assert.equal(r.tool_choice, 'none');
});

test('OpenAI response maps to Anthropic (text, tool_use, stop reasons, usage)', () => {
  const r = openAIToAnthropic({ id: 'c1', choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: 'Checking', tool_calls: [{ id: 'call_1', function: { name: 'lookup', arguments: '{"q":"test"}' } }] } }], usage: { prompt_tokens: 12, completion_tokens: 4 } }, 'm');
  assert.equal(r.type, 'message');
  assert.equal(r.content[0].text, 'Checking');
  assert.deepEqual(r.content[1].input, { q: 'test' });
  assert.equal(r.stop_reason, 'tool_use');
  assert.equal(r.usage.input_tokens, 12);
  assert.equal(openAIToAnthropic({ choices: [{ finish_reason: 'length', message: { content: 'x' } }] }, 'm').stop_reason, 'max_tokens');
  assert.deepEqual(openAIToAnthropic({ choices: [{ message: {} }] }, 'm').content, [{ type: 'text', text: '' }]);
  assert.deepEqual(openAIToAnthropic({ choices: [{ message: { tool_calls: [{ id: 'x', function: { name: 'n', arguments: '{bad' } }] } }] }, 'm').content[0].input, { _raw: '{bad' });
});

test('resolveModel routes haiku/fast requests to the fast model, everything else to main', () => {
  const cfg = { mainModel: 'gpt-4o', fastModel: 'gpt-4o-mini' };
  assert.equal(resolveModel('gpt-4o-mini', cfg), 'gpt-4o-mini');
  assert.equal(resolveModel('claude-3-5-haiku-20241022', cfg), 'gpt-4o-mini');
  assert.equal(resolveModel('claude-sonnet-4', cfg), 'gpt-4o');
  assert.equal(resolveModel('gpt-4o', cfg), 'gpt-4o');
  assert.equal(resolveModel(undefined, cfg), 'gpt-4o');
});

test('token cap is parsed from common provider error messages', () => {
  assert.equal(parseTokenCap('max_tokens is too large: 32000. This model supports at most 16384 completion tokens, whereas you provided 32000.'), 16384);
  assert.equal(parseTokenCap('Invalid max_tokens value, the valid range of max_tokens is [1, 8192]'), 8192);
  assert.equal(parseTokenCap('Invalid API key'), null);
  assert.equal(parseTokenCap(''), null);
});

test('upstream error text is extracted from JSON error shapes', () => {
  assert.equal(upstreamMessage('{"error":{"message":"bad key"}}', 401), 'bad key');
  assert.equal(upstreamMessage('[{"error":{"message":"gemini says no"}}]', 400), 'gemini says no');
  assert.equal(upstreamMessage('plain text', 500), 'plain text');
  assert.match(upstreamMessage('', 502), /502/);
});
