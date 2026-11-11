import { Router } from 'express';
import { loadConfig, saveConfig, resetConfig, maskKey, getPort } from '../config.js';
import { PROVIDERS, PROVIDER_ID_RE, publicProviders } from '../providers.js';
import { launchSignal } from '../launchSignal.js';
import { MatixoError } from '../errors.js';
import { snapshot, resetStats } from '../stats.js';
import { VERSION, GITHUB_URL } from '../meta.js';
import { usesCompletionTokens } from '../proxy.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const isHttpUrl = (u) => /^https?:\/\/[^\s]+$/i.test(u);
const cleanUrl = (u) => String(u ?? '').trim().replace(/\/+$/, '');
const cleanModels = (list) => [...new Set(list.map(m => String(m).trim().slice(0, 120)).filter(Boolean))].slice(0, 100);

router.get('/config', wrap((_req, res) => {
  const c = loadConfig();
  const providers = {};
  for (const [id, v] of Object.entries(c.providers || {})) {
    providers[id] = { baseUrl: v.baseUrl || '', name: v.name || '', models: v.models || [], maskedKey: maskKey(v.apiKey), configured: Boolean(v.apiKey) };
  }
  res.json({
    activeProvider: c.activeProvider, mainModel: c.mainModel, fastModel: c.fastModel,
    port: c.port, effectivePort: getPort(c), host: '127.0.0.1',
    version: VERSION, github: GITHUB_URL, providers, providerCatalog: publicProviders()
  });
}));

router.put('/config', wrap((req, res) => {
  const current = loadConfig();
  const input = req.body || {};
  const next = { ...current, providers: { ...current.providers } };
  if (input.port !== undefined) {
    const p = Number(input.port);
    if (!Number.isInteger(p) || p < 1024 || p > 65535) throw new MatixoError('PORT_RANGE');
    next.port = p;
  }
  if (typeof input.activeProvider === 'string') next.activeProvider = input.activeProvider;
  for (const k of ['mainModel', 'fastModel']) {
    if (typeof input[k] === 'string') { const v = input[k].trim().slice(0, 200); if (v) next[k] = v; }
  }
  if (input.providers && typeof input.providers === 'object') {
    for (const [id, value] of Object.entries(input.providers)) {
      if (!value || typeof value !== 'object') continue;
      if (!PROVIDER_ID_RE.test(id)) throw new MatixoError('BAD_PROVIDER_ID');
      const prev = next.providers[id] || {};
      const baseUrl = cleanUrl(value.baseUrl ?? prev.baseUrl ?? PROVIDERS[id]?.baseUrl ?? '');
      if (baseUrl && !isHttpUrl(baseUrl)) throw new MatixoError('BAD_URL');
      const entry = {
        apiKey: typeof value.apiKey === 'string' && value.apiKey.trim() ? value.apiKey.trim() : prev.apiKey || '',
        baseUrl,
        models: Array.isArray(value.models) ? cleanModels(value.models) : prev.models || []
      };
      const name = typeof value.name === 'string' ? value.name.trim().slice(0, 40) : prev.name;
      if (name) entry.name = name;
      next.providers[id] = entry;
    }
  }
  if (!PROVIDERS[next.activeProvider] && !next.providers[next.activeProvider]) throw new MatixoError('PROVIDER_INVALID');
  saveConfig(next);
  res.json({ ok: true });
}));

router.post('/reset', wrap((_req, res) => { resetConfig(); resetStats(); res.json({ ok: true }); }));

router.delete('/providers/:id', wrap((req, res) => {
  const id = req.params.id;
  if (!PROVIDER_ID_RE.test(id)) throw new MatixoError('BAD_PROVIDER_ID');
  const c = loadConfig();
  delete c.providers[id];
  if (c.activeProvider === id) c.activeProvider = 'openai';
  saveConfig(c);
  res.json({ ok: true });
}));

router.get('/models', wrap(async (req, res) => {
  const c = loadConfig();
  const id = String(req.query.provider || c.activeProvider);
  const preset = PROVIDERS[id];
  const saved = c.providers[id];
  const base = [...new Set([...(preset?.models || []), ...(saved?.models || [])])];
  if (req.query.live !== '1') return res.json({ models: base });
  if (!saved?.apiKey) throw new MatixoError('NO_KEY');
  const url = cleanUrl(saved.baseUrl || preset?.baseUrl);
  if (!isHttpUrl(url)) throw new MatixoError('NO_BASE_URL');
  let r;
  try {
    r = await fetch(`${url}/models`, { headers: { authorization: `Bearer ${saved.apiKey}`, accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  } catch (e) { throw new MatixoError('MODELS_FAILED', e.name === 'TimeoutError' ? 'timeout' : e.message); }
  if (!r.ok) throw new MatixoError('MODELS_FAILED', `HTTP ${r.status}`);
  const j = await r.json().catch(() => ({}));
  const list = Array.isArray(j.data) ? j.data : Array.isArray(j.models) ? j.models : [];
  const live = [...new Set(list.map(m => String(m?.id || m?.name || '').replace(/^models\//, '')).filter(Boolean))].sort();
  res.json({ models: [...new Set([...base, ...live])].slice(0, 500), live: live.length });
}));

router.get('/stats', (req, res) => res.json(snapshot(String(req.query.range || '1h'))));

router.post('/launch', wrap((_req, res) => {
  if (!launchSignal.listenerCount('launch')) throw new MatixoError('NO_LAUNCH_LISTENER');
  launchSignal.emit('launch');
  res.json({ ok: true });
}));

router.post('/test', wrap(async (req, res) => {
  const { providerId, apiKey, baseUrl, model } = req.body || {};
  const config = loadConfig();
  const saved = config.providers?.[providerId];
  const preset = PROVIDERS[providerId];
  const key = String(apiKey || saved?.apiKey || '').trim();
  const url = cleanUrl(baseUrl || saved?.baseUrl || preset?.baseUrl);
  if (!providerId || !key || !url) throw new MatixoError('TEST_FIELDS');
  if (!isHttpUrl(url)) throw new MatixoError('BAD_URL');
  const headers = { authorization: `Bearer ${key}`, accept: 'application/json' };
  try {
    // روش اول: endpoint مدل‌ها؛ بدون هزینه تولید پاسخ.
    const mr = await fetch(`${url}/models`, { headers, signal: AbortSignal.timeout(12000) });
    const mt = await mr.text();
    if (mr.ok) {
      let parsed = {}; try { parsed = JSON.parse(mt); } catch { /* پاسخ غیر JSON */ }
      return res.json({ ok: true, testMethod: 'models', modelsFound: Array.isArray(parsed.data) ? parsed.data.length : null });
    }
    if (mr.status === 401 || mr.status === 403) return res.status(mr.status).json({ ok: false, error: mt.slice(0, 500) || `HTTP ${mr.status}` });
    // برخی سرویس‌ها /models ندارند؛ یک درخواست خیلی کوچک chat می‌فرستیم.
    const probeModel = String(model || saved?.models?.[0] || preset?.models?.[0] || '').trim();
    if (!probeModel) return res.status(mr.status).json({ ok: false, error: mt.slice(0, 500) || `HTTP ${mr.status}` });
    const probe = await fetch(`${url}/chat/completions`, {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ model: probeModel, messages: [{ role: 'user', content: 'Reply with OK.' }], [usesCompletionTokens(probeModel) ? 'max_completion_tokens' : 'max_tokens']: 16, stream: false }),
      signal: AbortSignal.timeout(20000)
    });
    const pt = await probe.text();
    if (!probe.ok) return res.status(probe.status).json({ ok: false, error: pt.slice(0, 1200) || `HTTP ${probe.status}` });
    return res.json({ ok: true, testMethod: 'chat-completions', modelsFound: null });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.name === 'TimeoutError' ? 'timeout' : e.message, code: e.name === 'TimeoutError' ? 'TIMEOUT' : undefined });
  }
}));

export default router;
