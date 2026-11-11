import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const sandbox = { window: {}, Intl };
vm.runInNewContext(read('public/i18n.js'), sandbox);
const I = sandbox.window.MatixoI18n;
const { en, fa } = I.dict;
const html = read('public/index.html');
const app = read('public/app.js');

test('English and Persian dictionaries have exactly the same keys', () => {
  assert.deepEqual(Object.keys(fa).sort(), Object.keys(en).sort());
});

test('no empty translations (except the intentionally empty Persian promo prefix)', () => {
  for (const lang of [en, fa]) for (const [k, v] of Object.entries(lang)) {
    if (k === 'promo.pre' && lang === fa) continue;
    assert.ok(typeof v === 'string' && v.trim().length > 0, `empty: ${k}`);
  }
});

test('{placeholders} match between languages', () => {
  const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
  for (const k of Object.keys(en)) assert.equal(vars(fa[k]), vars(en[k]), `placeholder mismatch in ${k}`);
});

test('Persian text really is Persian and English text has no Persian letters', () => {
  const persian = /[\u0600-\u06FF]/;
  const latinOnly = ['app.title', 'prov.apiKey', 'prov.baseUrl', 'ov.mainSub'];
  for (const [k, v] of Object.entries(en)) assert.ok(!persian.test(v), `Persian letters in EN: ${k}`);
  for (const [k, v] of Object.entries(fa)) if (!latinOnly.includes(k) && !/^(range\.|promo\.pre|err\.NO_LAUNCH)/.test(k)) assert.ok(persian.test(v), `no Persian letters in FA: ${k}`);
});

test('every data-i18n* key used in index.html exists in both languages', () => {
  const keys = [...html.matchAll(/data-i18n(?:-placeholder|-title|-aria)?="([^"]+)"/g)].map(m => m[1]);
  assert.ok(keys.length > 40);
  for (const k of new Set(keys)) { assert.ok(k in en, `missing EN: ${k}`); assert.ok(k in fa, `missing FA: ${k}`); }
});

test('every t(\'key\') used in app.js exists in both languages', () => {
  const keys = [...app.matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)].map(m => m[1]).filter(k => !k.endsWith('.')); // کلیدهای پویا مثل 'err.' + code جداگانه تست می‌شوند
  const titleKeys = [...app.matchAll(/TITLE_KEYS = \{([^}]+)\}/g)][0][1].match(/'([a-z.]+)'/g).map(s => s.slice(1, -1));
  const allKeys = new Set([...keys, ...titleKeys]);
  assert.ok(allKeys.size > 40);
  for (const k of allKeys) { assert.ok(k in en, `missing EN: ${k}`); assert.ok(k in fa, `missing FA: ${k}`); }
});

test('every server error code has a translation in both languages', () => {
  const codes = [...read('src/errors.js').matchAll(/^\s+([A-Z_]+): \[/gm)].map(m => m[1]);
  assert.ok(codes.length >= 10);
  for (const c of [...codes, 'TIMEOUT']) { assert.ok(`err.${c}` in en, `EN err.${c}`); assert.ok(`err.${c}` in fa, `FA err.${c}`); }
  const t = I.t;
  assert.equal(t('nonexistent.key'), 'nonexistent.key');
  I.setLang('en');
  assert.equal(t('ov.tip', { n: 5 }), '5 requests');
  I.setLang('fa');
  assert.equal(t('ov.tip', { n: 5 }), '5 درخواست');
  assert.equal(I.getLang(), 'fa');
  I.setLang('xx'); // زبان نامعتبر نادیده گرفته می‌شود
  assert.equal(I.getLang(), 'fa');
});

test('GitHub icon links go to github.com/imatixofficel and open safely', () => {
  const anchors = [...html.matchAll(/<a\b[^>]*github\.com[^>]*>/g)].map(m => m[0]);
  assert.ok(anchors.length >= 3, 'rail + topbar + footer');
  for (const a of anchors) {
    assert.match(a, /href="https:\/\/github\.com\/imatixofficel"/);
    assert.match(a, /target="_blank"/);
    assert.match(a, /rel="noopener noreferrer"/);
  }
  assert.ok(html.includes('id="i-github"'), 'GitHub icon symbol exists');
  assert.ok(html.includes('id="gh-top"') && html.includes('id="gh-rail"'));
});

test('assets: user font + body font are wired and present, no external hosts', () => {
  const css = read('public/style.css');
  assert.match(css, /Vazirmatn-Black\.ttf/);
  assert.match(css, /Vazirmatn-Medium\.woff2/);
  assert.ok(fs.statSync(path.join(root, 'public/fonts/Vazirmatn-Black.ttf')).size > 50_000);
  assert.ok(fs.statSync(path.join(root, 'public/fonts/Vazirmatn-Medium.woff2')).size > 20_000);
  for (const f of ['public/index.html', 'public/style.css', 'public/app.js', 'public/i18n.js']) {
    const text = read(f).replace(/https:\/\/github\.com\/imatixofficel/g, '').replace(/http:\/\/www\.w3\.org\/2000\/svg/g, '');
    assert.doesNotMatch(text, /(?:src|href)=["']https?:\/\/(?!127\.0\.0\.1)/, `external resource in ${f}`);
    assert.doesNotMatch(text, /fonts\.googleapis|cdn\.|unpkg|jsdelivr/, `CDN reference in ${f}`);
  }
  assert.doesNotMatch(app, /\.innerHTML\s*=|insertAdjacentHTML/, 'app.js must not inject HTML strings');
});
