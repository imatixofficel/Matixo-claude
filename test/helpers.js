import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// دایرکتوری داده موقت؛ باید پیش از import کردن src/config.js تنظیم شود.
export function useTempData() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'matixo-test-'));
  process.env.MATIXO_DATA_DIR = dir;
  delete process.env.MATIXO_PORT;
  delete process.env.MATIXO_AUTH_TOKEN;
  return dir;
}

// سرور ساختگی سازگار با OpenAI. رفتار آن با mock.handler قابل تغییر است.
export function startMockProvider() {
  const mock = { requests: [], handler: null };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      mock.requests.push({ method: req.method, url: req.url, headers: req.headers, body });
      if (mock.handler) return mock.handler(req, res, body);
      res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":{"message":"no handler"}}');
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
    mock.server = server;
    mock.url = `http://127.0.0.1:${server.address().port}/v1`;
    mock.close = () => new Promise(r => { server.closeAllConnections?.(); server.close(r); });
    resolve(mock);
  }));
}

export const sseChunks = (res, objs) => {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const o of objs) res.write(`data: ${typeof o === 'string' ? o : JSON.stringify(o)}\n\n`);
  res.end();
};

export function parseSSE(text) {
  return text.split('\n\n').filter(Boolean).map(block => {
    const ev = block.match(/^event: (.+)$/m)?.[1];
    const data = block.match(/^data: (.+)$/m)?.[1];
    return { event: ev, data: data ? JSON.parse(data) : null };
  });
}
