import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { useTempData, startMockProvider, sseChunks, parseSSE } from './helpers.js';

const dataDir = useTempData();
const { startServer } = await import('../src/server.js');
const { loadConfig, saveConfig, getPort } = await import('../src/config.js');
const { resetStats, snapshot } = await import('../src/stats.js');
const { clearLearnedCaps } = await import('../src/proxy.js');
const { launchSignal } = await import('../src/launchSignal.js');
const { envScript } = await import('../src/launcher.js');

let mock, srv, base;
const TOKEN = 'matixo-local';
const post = (path, body, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': TOKEN, ...headers }, body: JSON.stringify(body) });
const api = (path, opts = {}) => fetch(base + '/api' + path, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });

before(async () => {
  mock = await startMockProvider();
  srv = await startServer({ port: 0 });
  base = `http://127.0.0.1:${srv.port}`;
  const c = loadConfig();
  c.activeProvider = 'custom';
  c.mainModel = 'main-model'; c.fastModel = 'fast-model';
  c.providers.custom = { apiKey: 'sk-test-1234567890', baseUrl: mock.url, models: ['main-model', 'fast-model'] };
  saveConfig(c);
});
after(async () => { srv.server.closeAllConnections?.(); await new Promise(r => srv.server.close(r)); await mock.close(); });

const textStream = (parts, finish = 'stop') => (_req, res) => sseChunks(res, [
  ...parts.map(p => ({ choices: [{ delta: { content: p } }] })),
  { choices: [{ delta: {}, finish_reason: finish }], usage: { prompt_tokens: 7, completion_tokens: 3 } }, '[DONE]'
]);

test('health + security headers + font served with the right MIME type', async () => {
  const h = await fetch(base + '/health');
  assert.deepEqual(await h.json(), { ok: true, name: 'Matixo|Claude' });
  assert.equal(h.headers.get('x-content-type-options'), 'nosniff');
  assert.match(h.headers.get('content-security-policy'), /default-src 'self'/);
  for (const [file, mime] of [['/fonts/Vazirmatn-Black.ttf', /font\/ttf/], ['/fonts/Vazirmatn-Medium.woff2', /font\/woff2/], ['/', /text\/html/], ['/app.js', /javascript/], ['/style.css', /text\/css/]]) {
    const r = await fetch(base + file);
    assert.equal(r.status, 200, file);
    assert.match(r.headers.get('content-type'), mime, file);
  }
});

test('/v1 requires the local token (x-api-key or Bearer) and rejects others', async () => {
  const body = { model: 'x', messages: [{ role: 'user', content: 'hi' }] };
  assert.equal((await fetch(base + '/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).status, 401);
  assert.equal((await post('/v1/messages', body, { 'x-api-key': 'wrong' })).status, 401);
  mock.handler = (_q, res) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }));
  const r = await fetch(base + '/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(body) });
  assert.equal(r.status, 200);
});

test('non-stream message: converts both ways, uses main model and provider key', async () => {
  mock.requests.length = 0;
  mock.handler = (_q, res) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id: 'c1', choices: [{ message: { content: 'سلام!' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 2 } }));
  const r = await post('/v1/messages', { model: 'claude-sonnet-4', max_tokens: 100, system: 'sys', messages: [{ role: 'user', content: 'hi' }] });
  const j = await r.json();
  assert.equal(r.status, 200);
  assert.equal(j.content[0].text, 'سلام!');
  assert.equal(j.stop_reason, 'end_turn');
  assert.equal(j.usage.input_tokens, 5);
  const up = mock.requests.at(-1);
  assert.equal(up.url, '/v1/chat/completions');
  assert.equal(up.headers.authorization, 'Bearer sk-test-1234567890');
  assert.equal(up.body.model, 'main-model');
  assert.equal(up.body.messages[0].role, 'system');
});

test('haiku requests are routed to the fast model', async () => {
  mock.requests.length = 0;
  mock.handler = (_q, res) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { content: 'x' }, finish_reason: 'stop' }] }));
  await post('/v1/messages', { model: 'claude-3-5-haiku-latest', messages: [{ role: 'user', content: 'title?' }] });
  assert.equal(mock.requests.at(-1).body.model, 'fast-model');
});

test('streaming text: valid Anthropic SSE order, usage and stop_reason', async () => {
  mock.handler = textStream(['Hel', 'lo', ' there']);
  const r = await post('/v1/messages', { model: 'm', stream: true, messages: [{ role: 'user', content: 'hi' }] });
  assert.match(r.headers.get('content-type'), /text\/event-stream/);
  const ev = parseSSE(await r.text());
  assert.deepEqual(ev.map(e => e.event), ['message_start', 'content_block_start', 'content_block_delta', 'content_block_delta', 'content_block_delta', 'content_block_stop', 'message_delta', 'message_stop']);
  assert.equal(ev.filter(e => e.event === 'content_block_delta').map(e => e.data.delta.text).join(''), 'Hello there');
  const md = ev.find(e => e.event === 'message_delta').data;
  assert.equal(md.delta.stop_reason, 'end_turn');
  assert.equal(md.usage.output_tokens, 3);
  assert.equal(md.usage.input_tokens, 7);
});

test('streaming stop_reason: finish_reason=length → max_tokens', async () => {
  mock.handler = textStream(['cut'], 'length');
  const ev = parseSSE(await (await post('/v1/messages', { model: 'm', stream: true, messages: [{ role: 'user', content: 'hi' }] })).text());
  assert.equal(ev.find(e => e.event === 'message_delta').data.delta.stop_reason, 'max_tokens');
});

test('streaming text then two tool calls: sequential block indexes, closed in order, JSON args valid', async () => {
  mock.handler = (_q, res) => sseChunks(res, [
    { choices: [{ delta: { content: 'Let me check.' } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_a', function: { name: 'read_file', arguments: '' } }] } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"path":' } }] } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"a.txt"}' } }] } }] },
    { choices: [{ delta: { tool_calls: [{ index: 1, id: 'call_b', function: { name: 'list_dir', arguments: '{}' } }] } }] },
    { choices: [{ delta: {}, finish_reason: 'tool_calls' }] }, '[DONE]'
  ]);
  const ev = parseSSE(await (await post('/v1/messages', { model: 'm', stream: true, messages: [{ role: 'user', content: 'go' }] })).text());
  const starts = ev.filter(e => e.event === 'content_block_start');
  assert.deepEqual(starts.map(e => [e.data.index, e.data.content_block.type]), [[0, 'text'], [1, 'tool_use'], [2, 'tool_use']]);
  assert.equal(starts[1].data.content_block.id, 'call_a');
  // هر بلوک باید قبل از شروع بلوک بعدی بسته شود
  const order = ev.filter(e => /content_block_(start|stop)/.test(e.event)).map(e => `${e.event === 'content_block_start' ? '+' : '-'}${e.data.index}`);
  assert.deepEqual(order, ['+0', '-0', '+1', '-1', '+2', '-2']);
  const args = (i) => ev.filter(e => e.event === 'content_block_delta' && e.data.index === i).map(e => e.data.delta.partial_json).join('');
  assert.deepEqual(JSON.parse(args(1)), { path: 'a.txt' });
  assert.deepEqual(JSON.parse(args(2)), {});
  assert.equal(ev.find(e => e.event === 'message_delta').data.delta.stop_reason, 'tool_use');
});

test('streaming tool call with empty arguments still emits valid JSON ({})', async () => {
  mock.handler = (_q, res) => sseChunks(res, [
    { choices: [{ delta: { tool_calls: [{ index: 0, id: 'c', function: { name: 'noargs' } }] } }] },
    { choices: [{ delta: {}, finish_reason: 'tool_calls' }] }, '[DONE]'
  ]);
  const ev = parseSSE(await (await post('/v1/messages', { model: 'm', stream: true, messages: [{ role: 'user', content: 'go' }] })).text());
  assert.equal(ev.filter(e => e.event === 'content_block_delta').map(e => e.data.delta.partial_json).join(''), '{}');
});

test('non-stream tool call response', async () => {
  mock.handler = (_q, res) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [{ id: 'c1', function: { name: 'lookup', arguments: '{"q":1}' } }] } }] }));
  const j = await (await post('/v1/messages', { model: 'm', tools: [{ name: 'lookup', input_schema: { type: 'object' } }], messages: [{ role: 'user', content: 'x' }] })).json();
  assert.equal(j.stop_reason, 'tool_use');
  assert.deepEqual(j.content[0], { type: 'tool_use', id: 'c1', name: 'lookup', input: { q: 1 } });
});

test('provider errors pass through with Anthropic error types', async () => {
  for (const [status, type] of [[401, 'authentication_error'], [429, 'rate_limit_error'], [404, 'not_found_error'], [500, 'api_error']]) {
    mock.handler = (_q, res) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { message: `boom ${status}` } }));
    const r = await post('/v1/messages', { model: 'm', messages: [{ role: 'user', content: 'x' }] });
    const j = await r.json();
    assert.equal(r.status, status);
    assert.equal(j.type, 'error');
    assert.equal(j.error.type, type);
    assert.equal(j.error.message, `boom ${status}`);
  }
});

test('max_tokens too large → learns the cap from the error and retries once', async () => {
  clearLearnedCaps();
  mock.requests.length = 0;
  mock.handler = (_q, res, body) => {
    if (body.max_tokens > 8000) return res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { message: 'max_tokens is too large: 32000. This model supports at most 8000 completion tokens, whereas you provided 32000.' } }));
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }));
  };
  const r = await post('/v1/messages', { model: 'm', max_tokens: 32000, messages: [{ role: 'user', content: 'x' }] });
  assert.equal(r.status, 200);
  assert.deepEqual(mock.requests.map(q => q.body.max_tokens), [32000, 8000]);
  mock.requests.length = 0;
  await post('/v1/messages', { model: 'm', max_tokens: 32000, messages: [{ role: 'user', content: 'x' }] });
  assert.deepEqual(mock.requests.map(q => q.body.max_tokens), [8000], 'cap is remembered for next requests');
});

test('unreachable provider → 502 Anthropic-style error (server keeps running)', async () => {
  const c = loadConfig(); const old = c.providers.custom.baseUrl;
  c.providers.custom.baseUrl = 'http://127.0.0.1:9/v1'; saveConfig(c);
  const r = await post('/v1/messages', { model: 'm', messages: [{ role: 'user', content: 'x' }] });
  assert.equal(r.status, 502);
  assert.equal((await r.json()).error.type, 'api_error');
  c.providers.custom.baseUrl = old; saveConfig(c);
  assert.equal((await fetch(base + '/health')).status, 200);
});

test('missing API key → clear 400, not a crash', async () => {
  const c = loadConfig(); const key = c.providers.custom.apiKey;
  c.providers.custom.apiKey = ''; saveConfig(c);
  const r = await post('/v1/messages', { model: 'm', messages: [{ role: 'user', content: 'x' }] });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error.message, /API key/i);
  c.providers.custom.apiKey = key; saveConfig(c);
});

test('client disconnect aborts the upstream request', async () => {
  let upstreamClosed = false;
  mock.handler = (req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('data: {"choices":[{"delta":{"content":"a"}}]}\n\n'); req.on('close', () => { upstreamClosed = true; }); };
  const ctrl = new AbortController();
  const r = await fetch(base + '/v1/messages', { method: 'POST', signal: ctrl.signal, headers: { 'content-type': 'application/json', 'x-api-key': TOKEN }, body: JSON.stringify({ model: 'm', stream: true, messages: [{ role: 'user', content: 'x' }] }) });
  await r.body.getReader().read();
  ctrl.abort();
  for (let i = 0; i < 40 && !upstreamClosed; i++) await new Promise(r => setTimeout(r, 50));
  assert.equal(upstreamClosed, true);
});

test('count_tokens and /v1/models respond', async () => {
  const c = await (await post('/v1/messages/count_tokens', { system: 'abcd', messages: [{ role: 'user', content: 'abcdefgh' }] })).json();
  assert.ok(c.input_tokens >= 3);
  const m = await (await fetch(base + '/v1/models', { headers: { 'x-api-key': TOKEN } })).json();
  assert.deepEqual(m.data.map(x => x.id), ['main-model', 'fast-model']);
});

test('stats record requests, errors and tokens', async () => {
  resetStats();
  mock.handler = textStream(['hi']);
  await (await post('/v1/messages', { model: 'm', stream: true, messages: [{ role: 'user', content: 'x' }] })).text();
  mock.handler = (_q, res) => res.writeHead(500).end('{"error":{"message":"x"}}');
  await post('/v1/messages', { model: 'm', messages: [{ role: 'user', content: 'x' }] });
  const s = await (await api('/stats?range=15m')).json();
  assert.equal(s.total, 2); assert.equal(s.errors, 1); assert.equal(s.inRange, 2);
  assert.equal(s.series.length, 30);
  assert.equal(s.series.reduce((a, b) => a + b.count, 0), 2);
  assert.equal(s.recent[0].status, 500);
  assert.equal(s.recent[1].model, 'main-model');
  assert.equal(s.tokensOut, 3);
  assert.equal(snapshot('bogus').range, '1h');
});

test('API: config never exposes keys; PUT validates; custom providers and names work', async () => {
  const cfg = await (await api('/config')).json();
  assert.equal(JSON.stringify(cfg).includes('sk-test-1234567890'), false);
  assert.match(cfg.providers.custom.maskedKey, /^sk-t••••7890$/);
  assert.equal(cfg.providers.custom.configured, true);
  assert.ok(cfg.providerCatalog.find(p => p.id === 'openai'));
  assert.equal(cfg.github, 'https://github.com/imatixofficel');

  let r = await api('/config', { method: 'PUT', body: { port: 80 } });
  assert.equal(r.status, 400); assert.equal((await r.json()).code, 'PORT_RANGE');
  r = await api('/config', { method: 'PUT', body: { activeProvider: 'nope' } });
  assert.equal((await r.json()).code, 'PROVIDER_INVALID');
  // یک کلید «__proto__» واقعی فقط از رشته JSON خام می‌آید (در literal جاوااسکریپت prototype می‌شود)
  r = await fetch(base + '/api/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{"providers":{"__proto__":{"apiKey":"x"}}}' });
  assert.equal((await r.json()).code, 'BAD_PROVIDER_ID');
  r = await api('/config', { method: 'PUT', body: { providers: { bad: { apiKey: 'k', baseUrl: 'ftp://x' } } } });
  assert.equal((await r.json()).code, 'BAD_URL');
  assert.equal(({}).polluted, undefined);

  r = await api('/config', { method: 'PUT', body: { providers: { 'my-llm': { name: 'My LLM', apiKey: 'sk-mine-abcdefghij', baseUrl: 'https://llm.example/v1/', models: ['a', ' b ', 'a', ''] } }, activeProvider: 'my-llm' } });
  assert.equal(r.status, 200);
  const c2 = await (await api('/config')).json();
  assert.equal(c2.providers['my-llm'].name, 'My LLM');
  assert.equal(c2.providers['my-llm'].baseUrl, 'https://llm.example/v1');
  assert.deepEqual(c2.providers['my-llm'].models, ['a', 'b']);
  assert.equal(c2.activeProvider, 'my-llm');

  // کلید خالی = حفظ کلید قبلی
  await api('/config', { method: 'PUT', body: { providers: { 'my-llm': { apiKey: '', baseUrl: 'https://llm.example/v1' } } } });
  assert.equal(loadConfig().providers['my-llm'].apiKey, 'sk-mine-abcdefghij');

  r = await api('/providers/my-llm', { method: 'DELETE' });
  assert.equal(r.status, 200);
  const c3 = await (await api('/config')).json();
  assert.equal(c3.providers['my-llm'], undefined);
  assert.equal(c3.activeProvider, 'openai');
  r = await api('/providers/..%2Fx', { method: 'DELETE' });
  assert.ok([400, 404].includes(r.status));
  const c4 = loadConfig(); c4.activeProvider = 'custom'; saveConfig(c4);
});

test('API: models list (+ live fetch from provider /models, Gemini-style prefixes stripped)', async () => {
  let r = await (await api('/models?provider=openai')).json();
  assert.ok(r.models.includes('gpt-4o'));
  mock.handler = (_q, res) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ data: [{ id: 'models/zeta-1' }, { id: 'alpha-2' }] }));
  r = await (await api('/models?provider=custom&live=1')).json();
  assert.equal(r.live, 2);
  assert.ok(r.models.includes('zeta-1') && r.models.includes('alpha-2') && r.models.includes('main-model'));
  mock.handler = (_q, res) => res.writeHead(401).end('{}');
  const bad = await api('/models?provider=custom&live=1');
  assert.equal(bad.status, 502); assert.equal((await bad.json()).code, 'MODELS_FAILED');
  const none = await api('/models?provider=groq&live=1');
  assert.equal((await none.json()).code, 'NO_KEY');
});

test('API: connection test — models endpoint, chat fallback, bad key, bad input', async () => {
  const body = { providerId: 'custom', apiKey: 'k', baseUrl: mock.url };
  mock.handler = (_q, res) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ data: [{ id: 'a' }, { id: 'b' }] }));
  let j = await (await api('/test', { method: 'POST', body })).json();
  assert.deepEqual([j.ok, j.testMethod, j.modelsFound], [true, 'models', 2]);

  mock.handler = (q, res) => q.url.endsWith('/models') ? res.writeHead(404).end('{}') : res.writeHead(200, { 'content-type': 'application/json' }).end('{"choices":[{"message":{"content":"OK"}}]}');
  j = await (await api('/test', { method: 'POST', body: { ...body, model: 'main-model' } })).json();
  assert.deepEqual([j.ok, j.testMethod], [true, 'chat-completions']);

  mock.handler = (_q, res) => res.writeHead(401).end('{"error":{"message":"bad key"}}');
  const r = await api('/test', { method: 'POST', body });
  assert.equal(r.status, 401); assert.equal((await r.json()).ok, false);

  assert.equal((await (await api('/test', { method: 'POST', body: {} })).json()).code, 'TEST_FIELDS');
  assert.equal((await (await api('/test', { method: 'POST', body: { providerId: 'custom', apiKey: 'k', baseUrl: 'javascript:alert(1)' } })).json()).code, 'BAD_URL');
});

test('security: foreign Host / Origin / cross-site requests are blocked, same-origin works', async () => {
  const blocked = [
    api('/config', { headers: { host: 'evil.example' } }),
    api('/reset', { method: 'POST', headers: { origin: 'https://evil.example' } }),
    api('/launch', { method: 'POST', headers: { origin: 'null' } }),
    api('/config', { headers: { 'sec-fetch-site': 'cross-site' } })
  ];
  // fetch (undici) نمی‌گذارد Host را دستکاری کنیم؛ برای آن از http.request استفاده می‌کنیم
  const results = await Promise.all(blocked.slice(1).map(p => p.then(r => r.status)));
  assert.deepEqual(results, [403, 403, 403]);
  const http = await import('node:http');
  const status = await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: srv.port, path: '/api/config', headers: { host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.end();
  });
  assert.equal(status, 403);
  assert.equal((await api('/config', { headers: { origin: base } })).status, 200);
  assert.equal((await api('/config', { headers: { host: `localhost:${srv.port}` } })).status, 200);
});

test('security: malformed JSON → 400 JSON error, prototype pollution via body is ignored', async () => {
  const r = await fetch(base + '/api/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{bad' });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, 'Invalid JSON body.');
  const r2 = await fetch(base + '/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': TOKEN }, body: '{bad' });
  assert.equal((await r2.json()).type, 'error');
});

test('launch: 409 without CLI listener, ok with listener', async () => {
  assert.equal((await api('/launch', { method: 'POST' })).status, 409);
  let fired = 0; const fn = () => { fired++; };
  launchSignal.on('launch', fn);
  assert.equal((await api('/launch', { method: 'POST' })).status, 200);
  launchSignal.off('launch', fn);
  assert.equal(fired, 1);
});

test('config: reset restores defaults, MATIXO_PORT/MATIXO_AUTH_TOKEN override without being saved', async () => {
  process.env.MATIXO_PORT = '4999'; process.env.MATIXO_AUTH_TOKEN = 'env-token';
  assert.equal(getPort(loadConfig()), 4999);
  assert.equal(loadConfig().port, 3456, 'env is not written into config');
  const env = envScript('bash');
  assert.match(env, /ANTHROPIC_BASE_URL='http:\/\/127\.0\.0\.1:4999'/);
  assert.match(env, /ANTHROPIC_AUTH_TOKEN='env-token'/);
  assert.match(env, /ANTHROPIC_DEFAULT_HAIKU_MODEL='fast-model'/);
  assert.match(envScript('powershell'), /\$env:ANTHROPIC_MODEL='main-model'/);
  assert.match(envScript('cmd'), /^set ANTHROPIC_BASE_URL=http:\/\/127\.0\.0\.1:4999/m);
  delete process.env.MATIXO_PORT; delete process.env.MATIXO_AUTH_TOKEN;
  assert.equal((await api('/reset', { method: 'POST' })).status, 200);
  const c = loadConfig();
  assert.deepEqual([c.activeProvider, c.mainModel, Object.keys(c.providers).length], ['openai', 'gpt-4o', 0]);
});
