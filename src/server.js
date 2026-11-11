import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { getPort, getAuthToken, loadConfig } from './config.js';
import apiRoutes from './routes/api.js';
import proxyRoutes from './routes/proxy.js';
import { sendAnthropicError } from './proxy.js';
import { MatixoError } from './errors.js';
import { ROOT_DIR } from './meta.js';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const hostnameOf = (hostHeader = '') => { try { return new URL(`http://${hostHeader}`).hostname; } catch { return ''; } };

function safeEqual(a, b) {
  const A = Buffer.from(String(a)); const B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

// جلوگیری از DNS-rebinding و درخواست‌های cross-site به پنل محلی (مثلاً سایتی که «بازنشانی» یا «اجرا» را صدا بزند).
export function localOnly(req, res, next) {
  if (!LOCAL_HOSTS.has(hostnameOf(req.get('host')))) return next(new MatixoError('FORBIDDEN'));
  if (req.path.startsWith('/api')) {
    const origin = req.get('origin');
    if (origin !== undefined) {
      let same = false;
      try { same = new URL(origin).host === req.get('host'); } catch { /* origin نامعتبر یا null */ }
      if (!same) return next(new MatixoError('FORBIDDEN'));
    }
    if (req.get('sec-fetch-site') === 'cross-site') return next(new MatixoError('FORBIDDEN'));
  }
  next();
}

function securityHeaders(_req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
  });
  next();
}

export function createServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(localOnly);
  app.use(express.json({ limit: '20mb' }));
  app.get('/health', (_req, res) => res.json({ ok: true, name: 'Matixo|Claude' }));
  app.use('/api', apiRoutes);
  app.use('/v1', (req, res, next) => {
    const config = loadConfig();
    const supplied = req.get('x-api-key') || req.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    if (!safeEqual(supplied, getAuthToken(config))) {
      return res.status(401).json({ type: 'error', error: { type: 'authentication_error', message: 'Invalid Matixo local token.' } });
    }
    next();
  }, proxyRoutes);
  app.use(express.static(path.join(ROOT_DIR, 'public'), {
    etag: true,
    setHeaders(res, file) {
      if (/[\\/]fonts[\\/]/.test(file)) res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
      else res.setHeader('Cache-Control', 'no-cache');
    }
  }));
  app.use((req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
    if (req.path.startsWith('/v1')) return sendAnthropicError(res, 404, 'Not found');
    res.status(404).type('text/plain').send('Not found');
  });
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (res.headersSent) return res.end();
    let status = err.status || err.statusCode || 500;
    let message = err.message || 'Internal server error';
    if (err.type === 'entity.parse.failed') { status = 400; message = 'Invalid JSON body.'; }
    else if (err.type === 'entity.too.large') { status = 413; message = 'Request body is too large.'; }
    else if (err.name === 'TimeoutError' || err.name === 'AbortError') { status = 504; message = 'The provider did not answer in time.'; }
    else if (err.name === 'TypeError' && /fetch failed/i.test(err.message)) { status = 502; message = `Cannot reach the provider: ${err.cause?.code || err.cause?.message || err.message}`; }
    if (req.path.startsWith('/api')) return res.status(status).json({ error: message, code: typeof err.code === 'string' && /^[A-Z_]+$/.test(err.code) ? err.code : undefined });
    sendAnthropicError(res, status, message);
  });
  return app;
}

export function startServer({ port } = {}) {
  const config = loadConfig();
  const listenPort = Number(port || getPort(config));
  const app = createServer();
  return new Promise((resolve, reject) => {
    const server = app.listen(listenPort, '127.0.0.1', () => resolve({ server, port: server.address().port }));
    server.on('error', reject);
  });
}
