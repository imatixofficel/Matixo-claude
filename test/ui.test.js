import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { useTempData, startMockProvider, sseChunks } from './helpers.js';

useTempData();
let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = await import('jsdom')); } catch { /* jsdom اختیاری است */ }
const { startServer } = await import('../src/server.js');
const { loadConfig, saveConfig } = await import('../src/config.js');

let mock, srv, base, dom, win, doc;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { const v = fn(); if (v) return v; } catch { /* هنوز آماده نیست */ } await sleep(40); }
  throw new Error('waitFor timeout: ' + fn);
}
const click = (el) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
const $ = (s) => doc.querySelector(s);
const $$ = (s) => [...doc.querySelectorAll(s)];

before(async () => {
  if (!JSDOM) return;
  mock = await startMockProvider();
  mock.handler = (req, res) => {
    if (req.url.endsWith('/models')) return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ data: [{ id: 'live-a' }, { id: 'live-b' }] }));
    sseChunks(res, [{ choices: [{ delta: { content: 'hi' } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 2 } }, '[DONE]']);
  };
  srv = await startServer({ port: 0 });
  base = `http://127.0.0.1:${srv.port}`;
  const c = loadConfig();
  c.providers.openai = { apiKey: 'sk-ui-test-123456', baseUrl: mock.url, models: [] };
  saveConfig(c);
  for (let i = 0; i < 3; i++) await (await fetch(base + '/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'matixo-local' }, body: JSON.stringify({ model: 'x', stream: true, messages: [{ role: 'user', content: 'hi' }] }) })).text();

  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => { if (!/Could not parse CSS|Not implemented/.test(String(e.message))) console.error('jsdom:', e.message); });
  dom = await JSDOM.fromURL(base + '/', {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole,
    beforeParse(window) { window.fetch = (u, o) => fetch(new URL(u, base), o); }
  });
  win = dom.window; doc = win.document;
  await waitFor(() => !$('#app').classList.contains('hidden'), 8000);
});
after(async () => {
  if (!JSDOM) return;
  win?.close(); srv.server.closeAllConnections?.(); await new Promise(r => srv.server.close(r)); await mock.close();
});

const opts = { skip: !JSDOM && 'jsdom is not installed (npm install)' };

test('dashboard boots in Persian RTL by default and the splash is dismissed', opts, () => {
  assert.equal(doc.documentElement.dir, 'rtl');
  assert.equal(doc.documentElement.lang, 'fa');
  assert.ok($('#splash').classList.contains('hide'));
  assert.equal($('#page-title').textContent, 'نمای کلی');
});

test('overview shows real config, stats and request rows', opts, async () => {
  assert.equal($('#a-main').textContent, 'gpt-4o');
  assert.equal($('#a-fast').textContent, 'gpt-4o-mini');
  assert.equal($('#a-provider').textContent, 'OpenAI');
  await waitFor(() => $$('#req-body tr').length === 3);
  assert.match($('#headline').textContent, /۳/, 'Persian digits for the count');
  assert.equal($('#ch-total').textContent, '۳');
  assert.ok($$('#chart path').length >= 2, 'chart line + area are drawn');
  assert.equal($('#version').textContent, 'v1.1.0');
});

test('GitHub anchors in the page point to github.com/imatixofficel', opts, () => {
  for (const sel of ['#gh-top', '#gh-rail']) {
    const a = $(sel);
    assert.equal(a.href, 'https://github.com/imatixofficel');
    assert.equal(a.target, '_blank');
    assert.match(a.rel, /noopener/);
    assert.ok(a.querySelector('use').getAttribute('href') === '#i-github');
  }
});

test('language switch: EN → LTR + English texts everywhere, saved; back to FA', opts, () => {
  click($('.tools [data-lang="en"]'));
  assert.equal(doc.documentElement.dir, 'ltr');
  assert.equal($('#page-title').textContent, 'Overview');
  assert.equal($('#search').placeholder, 'Search providers…');
  assert.equal($('#launch-btn').textContent.trim(), 'Run Claude Code');
  assert.match($('#headline').textContent, /Gateway is up · 3 requests handled/);
  assert.equal(win.localStorage.getItem('matixo.lang'), 'en');
  assert.equal($('.tools [data-lang="en"]').getAttribute('aria-pressed'), 'true');
  // هیچ متن فارسی باقی نمانده باشد (به‌جز دکمه‌ی انتخاب زبان فارسی)
  const leftovers = $$('#view-overview, .rail, .topbar').flatMap(root => [...root.querySelectorAll('*')])
    .filter(el => el.children.length === 0 && /[\u0600-\u06FF]/.test(el.textContent) && !el.hasAttribute('data-lang') && !el.closest('[data-lang]'));
  assert.deepEqual(leftovers.map(e => e.textContent), []);
  click($('.tools [data-lang="fa"]'));
  assert.equal(doc.documentElement.dir, 'rtl');
  assert.equal($('#page-title').textContent, 'نمای کلی');
});

test('navigation: providers view lists catalog providers; search filters them', opts, () => {
  click($('.rail-btn[data-view="providers"]'));
  assert.ok(!$('#view-providers').classList.contains('hidden'));
  assert.equal(win.location.hash, '#providers');
  assert.equal($$('#provider-list [data-id]').length, 6);
  assert.equal($('[data-id="openai"] .badge').className, 'badge', 'configured provider shows "saved" badge');
  const search = $('#search'); search.value = 'groq'; search.dispatchEvent(new win.Event('input', { bubbles: true }));
  assert.deepEqual($$('#provider-list [data-id]:not(.hidden)').map(e => e.dataset.id), ['groq']);
  search.value = ''; search.dispatchEvent(new win.Event('input', { bubbles: true }));
});

test('saving a provider key from the UI stores it (masked afterwards) and marks it saved', opts, async () => {
  const key = $('[data-key="deepseek"]');
  key.value = 'sk-deepseek-abcdef999'; key.dispatchEvent(new win.Event('input', { bubbles: true }));
  click($('#save-providers'));
  await waitFor(() => loadConfig().providers.deepseek?.apiKey === 'sk-deepseek-abcdef999');
  await waitFor(() => $('[data-key="deepseek"]').placeholder.includes('••••'));
  assert.ok(!doc.body.innerHTML.includes('sk-deepseek-abcdef999'), 'the full key is never rendered back');
});

test('models view: live list fills the datalist, saving updates the config', opts, async () => {
  click($('.rail-btn[data-view="models"]'));
  click($('#fetch-models'));
  await waitFor(() => [...$$('#model-options option')].some(o => o.value === 'live-a'));
  $('#main-model').value = 'live-b';
  click($('#save-models'));
  await waitFor(() => loadConfig().mainModel === 'live-b');
});

test('settings: invalid port shows a translated error toast, valid port is saved', opts, async () => {
  click($('.rail-btn[data-view="settings"]'));
  $('#port-input').value = '80'; click($('#save-settings'));
  await waitFor(() => $('#toast').textContent.includes('1024'));
  assert.match($('#toast').textContent, /پورت/);
  $('#port-input').value = '4321'; click($('#save-settings'));
  await waitFor(() => loadConfig().port === 4321);
});

test('XSS: provider names and models coming from config are rendered as text, not HTML', opts, async () => {
  const c = loadConfig();
  c.providers['evil'] = { apiKey: 'k', baseUrl: 'http://x.test/v1', name: '<img src=x onerror=window.__pwned=1>', models: ['"><script>window.__pwned=1</script>'] };
  saveConfig(c);
  await win.__matixo.refresh();
  assert.equal(win.__pwned, undefined);
  assert.equal($$('#provider-list img, #provider-list script').length, 0);
  assert.ok($('[data-id="evil"] b').textContent.includes('<img'));
});
