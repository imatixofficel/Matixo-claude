import { randomUUID } from 'node:crypto';
import { getActiveProvider, loadConfig } from './config.js';
import { record } from './stats.js';

const uid = (prefix) => `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 24)}`;

export const textOf = (content) => Array.isArray(content)
  ? content.filter(x => x?.type === 'text').map(x => x.text || '').join('\n')
  : (typeof content === 'string' ? content : '');

// مدل‌های سری o و gpt-5 به‌جای max_tokens فقط max_completion_tokens را می‌پذیرند و temperature ندارند.
const COMPLETION_TOKENS_RE = /^(o\d|gpt-5)/i;
export const usesCompletionTokens = (model = '') => COMPLETION_TOKENS_RE.test(String(model).split('/').pop());

// سقف خروجی که از پیام خطای ارائه‌دهنده یاد گرفته‌ایم (مثلاً gpt-4o حداکثر 16384).
const learnedCaps = new Map();
export const clearLearnedCaps = () => learnedCaps.clear();

export function parseTokenCap(text = '') {
  if (!/max_tokens|max_completion_tokens|completion tokens|max.?output/i.test(text)) return null;
  const m = text.match(/at most (\d+)/i) || text.match(/\[\s*1\s*,\s*(\d+)\s*\]/) || text.match(/(?:maximum|limit|up to)[^\d]{0,40}(\d{3,7})/i);
  const n = m ? Number(m[1]) : 0;
  return n >= 256 && n <= 2_000_000 ? n : null;
}

// Claude Code برای کارهای پس‌زمینه مدل haiku را می‌فرستد؛ آن را به «مدل سریع» وصل می‌کنیم.
export function resolveModel(requested, config) {
  const main = config.mainModel;
  const fast = config.fastModel || main;
  const r = String(requested || '');
  if (!main) return r;
  if (r && r === fast) return fast;
  if (/haiku/i.test(r)) return fast;
  return main;
}

function userContent(blocks) {
  const parts = [];
  for (const b of blocks) {
    if (b?.type === 'text' && b.text) parts.push({ type: 'text', text: b.text });
    else if (b?.type === 'image' && b.source) {
      const url = b.source.type === 'base64' ? `data:${b.source.media_type || 'image/png'};base64,${b.source.data}` : b.source.url;
      if (url) parts.push({ type: 'image_url', image_url: { url } });
    }
  }
  if (!parts.length) return null;
  return parts.every(p => p.type === 'text') ? parts.map(p => p.text).join('\n') : parts;
}

export function anthropicToOpenAI(body, modelOverride) {
  const model = modelOverride || body.model;
  const messages = [];
  const system = textOf(body.system);
  if (system) messages.push({ role: 'system', content: system });

  for (const msg of body.messages || []) {
    if (typeof msg.content === 'string') { messages.push({ role: msg.role, content: msg.content }); continue; }
    const blocks = Array.isArray(msg.content) ? msg.content : [];
    if (msg.role === 'assistant') {
      // متن و tool_call باید در «یک» پیام assistant بیایند، نه دو پیام پشت‌سرهم.
      const text = textOf(blocks);
      const toolUses = blocks.filter(x => x?.type === 'tool_use');
      if (!text && !toolUses.length) continue;
      const out = { role: 'assistant', content: text || (toolUses.length ? null : '') };
      if (toolUses.length) out.tool_calls = toolUses.map(t => ({ id: t.id, type: 'function', function: { name: t.name, arguments: JSON.stringify(t.input ?? {}) } }));
      messages.push(out);
    } else {
      // نتیجه ابزارها باید بلافاصله بعد از پیام assistant بیایند؛ متن کاربر بعد از آن‌ها.
      for (const r of blocks.filter(x => x?.type === 'tool_result')) {
        messages.push({ role: 'tool', tool_call_id: r.tool_use_id, content: textOf(r.content) || (r.content == null ? '' : JSON.stringify(r.content)) });
      }
      const content = userContent(blocks);
      if (content) messages.push({ role: msg.role, content });
    }
  }

  const out = { model, messages, stream: Boolean(body.stream) };
  let max = Number(body.max_tokens) || 4096;
  const cap = learnedCaps.get(model);
  if (cap) max = Math.min(max, cap);
  const reasoning = usesCompletionTokens(model);
  out[reasoning ? 'max_completion_tokens' : 'max_tokens'] = max;
  if (!reasoning) {
    if (body.temperature !== undefined) out.temperature = body.temperature;
    if (body.top_p !== undefined) out.top_p = body.top_p;
  }
  if (body.stop_sequences?.length) out.stop = body.stop_sequences;
  const tools = (Array.isArray(body.tools) ? body.tools : []).filter(t => t?.name);
  if (tools.length) {
    out.tools = tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description || '', parameters: t.input_schema || { type: 'object', properties: {} } } }));
    const tc = body.tool_choice;
    if (tc?.type === 'auto') out.tool_choice = 'auto';
    else if (tc?.type === 'any') out.tool_choice = 'required';
    else if (tc?.type === 'none') out.tool_choice = 'none';
    else if (tc?.type === 'tool') out.tool_choice = { type: 'function', function: { name: tc.name } };
  }
  return out;
}

const stopReason = (finish, hasTools) => (hasTools ? 'tool_use' : finish === 'length' ? 'max_tokens' : 'end_turn');

export function openAIToAnthropic(data, model) {
  const choice = data.choices?.[0] || {};
  const msg = choice.message || {};
  const content = [];
  if (msg.content) content.push({ type: 'text', text: typeof msg.content === 'string' ? msg.content : textOf(msg.content) });
  for (const call of msg.tool_calls || []) {
    let input = {};
    try { input = JSON.parse(call.function?.arguments || '{}'); } catch { input = { _raw: call.function?.arguments || '' }; }
    content.push({ type: 'tool_use', id: call.id || uid('toolu'), name: call.function?.name || 'unknown', input });
  }
  if (!content.length) content.push({ type: 'text', text: '' });
  return {
    id: data.id || uid('msg'), type: 'message', role: 'assistant', model: model || data.model || 'unknown', content,
    stop_reason: stopReason(choice.finish_reason, Boolean(msg.tool_calls?.length)),
    stop_sequence: null,
    usage: { input_tokens: data.usage?.prompt_tokens ?? 0, output_tokens: data.usage?.completion_tokens ?? 0 }
  };
}

function sse(res, event, payload) {
  if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

// تبدیل جریان SSE فرمت OpenAI به رویدادهای Anthropic با ترتیب معتبر بلوک‌ها.
export async function streamOpenAIToAnthropic(upstream, res, model) {
  sse(res, 'message_start', { type: 'message_start', message: { id: uid('msg'), type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } });
  let nextIndex = 0;
  let current = null; // { kind: 'text' | 'tool', index, tool? }
  const tools = new Map();
  let finish = null, inTok = 0, outTok = 0, estimated = 0;

  const delta = (index, partial) => sse(res, 'content_block_delta', { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: partial } });
  const closeCurrent = () => {
    if (!current) return;
    if (current.kind === 'tool') {
      const t = current.tool;
      if (!t.sent) { delta(t.index, '{}'); t.sent = true; } // آرگومان خالی هم باید JSON معتبر باشد
      t.closed = true;
    }
    sse(res, 'content_block_stop', { type: 'content_block_stop', index: current.index });
    current = null;
  };
  const startTool = (t) => {
    if (t.started || t.closed || !t.name) return;
    closeCurrent();
    t.index = nextIndex++; t.started = true; current = { kind: 'tool', index: t.index, tool: t };
    sse(res, 'content_block_start', { type: 'content_block_start', index: t.index, content_block: { type: 'tool_use', id: t.id, name: t.name, input: {} } });
    if (t.buffer) { delta(t.index, t.buffer); t.sent = true; t.buffer = ''; }
  };

  const handleLine = (line) => {
    line = line.trim();
    if (!line.startsWith('data:')) return;
    const raw = line.slice(5).trim();
    if (!raw || raw === '[DONE]') return;
    let data; try { data = JSON.parse(raw); } catch { return; }
    const choice = data.choices?.[0] || {};
    const d = choice.delta || {};
    if (typeof d.content === 'string' && d.content.length) {
      if (current?.kind !== 'text') {
        closeCurrent();
        current = { kind: 'text', index: nextIndex++ };
        sse(res, 'content_block_start', { type: 'content_block_start', index: current.index, content_block: { type: 'text', text: '' } });
      }
      sse(res, 'content_block_delta', { type: 'content_block_delta', index: current.index, delta: { type: 'text_delta', text: d.content } });
      estimated += Math.max(1, Math.ceil(d.content.length / 4));
    }
    for (const tc of d.tool_calls || []) {
      const key = tc.index ?? 0;
      let t = tools.get(key);
      if (!t) { t = { id: tc.id || uid('toolu'), name: '', buffer: '', started: false, closed: false, sent: false }; tools.set(key, t); }
      if (tc.id) t.id = tc.id;
      if (tc.function?.name) t.name += tc.function.name;
      const args = tc.function?.arguments;
      if (args) {
        if (t.started && !t.closed) { delta(t.index, args); t.sent = true; }
        else if (!t.started && !t.closed) t.buffer += args;
      }
      startTool(t);
    }
    if (choice.finish_reason) finish = choice.finish_reason;
    if (data.usage?.prompt_tokens) inTok = data.usage.prompt_tokens;
    if (data.usage?.completion_tokens) outTok = data.usage.completion_tokens;
  };

  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of upstream.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) handleLine(line);
  }
  if (buffer) handleLine(buffer);

  for (const t of tools.values()) startTool(t); // ابزاری که نامش دیر رسید
  closeCurrent();
  const hasTools = [...tools.values()].some(t => t.started);
  outTok = outTok || estimated;
  sse(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: stopReason(finish, hasTools), stop_sequence: null }, usage: { input_tokens: inTok, output_tokens: outTok } });
  sse(res, 'message_stop', { type: 'message_stop' });
  res.end();
  return { inTok, outTok };
}

const ERROR_TYPES = { 400: 'invalid_request_error', 401: 'authentication_error', 403: 'permission_error', 404: 'not_found_error', 413: 'request_too_large', 429: 'rate_limit_error', 529: 'overloaded_error' };

export function upstreamMessage(text, status) {
  try {
    const j = JSON.parse(text);
    const m = j?.error?.message || j?.message || (Array.isArray(j) ? j[0]?.error?.message : null);
    if (m) return String(m).slice(0, 4000);
  } catch { /* متن ساده */ }
  return (text || '').slice(0, 4000) || `Provider returned ${status}`;
}

export function sendAnthropicError(res, status, message) {
  res.status(status).json({ type: 'error', error: { type: ERROR_TYPES[status] || 'api_error', message } });
}

export async function handleMessages(req, res) {
  const t0 = Date.now();
  const config = loadConfig();
  const body = req.body || {};
  const stat = { model: resolveModel(body.model, config), provider: config.activeProvider, stream: Boolean(body.stream), status: 0, inTok: 0, outTok: 0 };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);
  const onClose = () => { if (!res.writableEnded) controller.abort(); };
  res.on('close', onClose);
  try {
    const provider = getActiveProvider(config);
    stat.provider = provider.id;
    const model = stat.model;
    const url = `${provider.baseUrl}/chat/completions`;
    const call = (payload) => fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${provider.apiKey}` },
      body: JSON.stringify(payload), signal: controller.signal
    });
    let payload = anthropicToOpenAI(body, model);
    let upstream = await call(payload);
    let detail = '';
    if (!upstream.ok) {
      detail = await upstream.text();
      // اگر max_tokens بیش از سقف مدل بود، سقف را از پیام خطا بخوان و یک‌بار دوباره تلاش کن.
      const cap = upstream.status === 400 ? parseTokenCap(detail) : null;
      const current = payload.max_tokens ?? payload.max_completion_tokens;
      if (cap && (!current || cap < current)) {
        learnedCaps.set(model, cap);
        payload = anthropicToOpenAI(body, model);
        upstream = await call(payload);
        if (!upstream.ok) detail = await upstream.text();
      }
    }
    if (!upstream.ok) {
      stat.status = upstream.status;
      stat.error = upstreamMessage(detail, upstream.status);
      sendAnthropicError(res, upstream.status, stat.error);
      return;
    }
    if (body.stream) {
      res.status(200).set({ 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      res.flushHeaders?.();
      stat.status = 200;
      try {
        const usage = await streamOpenAIToAnthropic(upstream, res, model);
        stat.inTok = usage.inTok; stat.outTok = usage.outTok;
      } catch (e) {
        stat.status = 502; stat.error = e.message;
        sse(res, 'error', { type: 'error', error: { type: 'api_error', message: e.message || 'Upstream stream failed' } });
        res.end();
      }
    } else {
      const data = await upstream.json();
      stat.status = 200;
      stat.inTok = data.usage?.prompt_tokens ?? 0; stat.outTok = data.usage?.completion_tokens ?? 0;
      res.json(openAIToAnthropic(data, model));
    }
  } catch (e) {
    stat.status = e.status || (e.name === 'AbortError' ? 499 : 502);
    stat.error = e.message;
    throw e;
  } finally {
    clearTimeout(timer);
    res.off('close', onClose);
    stat.ms = Date.now() - t0;
    record(stat);
  }
}

export async function countTokens(req, res) {
  // شمارش دقیق توکن به tokenizer هر مدل وابسته است؛ این تخمین برای سازگاری API است.
  const body = req.body || {};
  const parts = [textOf(body.system), ...(body.messages || []).map(m => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '')))];
  if (body.tools?.length) parts.push(JSON.stringify(body.tools));
  res.json({ input_tokens: Math.max(1, Math.ceil(parts.join(' ').length / 4)) });
}
