/* Matixo | Claude — dashboard logic
   - همه‌ی متن‌ها از i18n.js می‌آیند (فارسی / انگلیسی)
   - DOM با h() ساخته می‌شود؛ هیچ داده‌ای با innerHTML وارد صفحه نمی‌شود. */
(function () {
  'use strict';
  var I = window.MatixoI18n;
  var t = I.t;
  var $ = function (s, root) { return (root || document).querySelector(s); };
  var $$ = function (s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); };

  var CATALOG_FALLBACK = ['openai', 'deepseek', 'openrouter', 'groq', 'gemini', 'custom'];
  var DEFAULT_URLS = {
    openai: 'https://api.openai.com/v1', deepseek: 'https://api.deepseek.com/v1', openrouter: 'https://openrouter.ai/api/v1',
    groq: 'https://api.groq.com/openai/v1', gemini: 'https://generativelanguage.googleapis.com/v1beta/openai', custom: ''
  };
  var TITLE_KEYS = { overview: 'nav.overview', providers: 'prov.title', models: 'models.title', settings: 'set.title' };

  var state = { cfg: null, stats: null, range: '1h', filter: 'all', view: 'overview', q: '' };
  var testStates = {};      // id → { k, v, raw, kind }
  var testTimers = {};
  var drafts = {};          // مقادیر تایپ‌شده در فرم ارائه‌دهنده‌ها (برای حفظ هنگام تغییر زبان)
  var liveModels = {};      // id → [models]
  var pollTimer = null;

  /* ───────── ابزارها ───────── */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    var a = attrs || {};
    Object.keys(a).forEach(function (k) {
      var v = a[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.keys(v).forEach(function (d) { el.dataset[d] = v[d]; });
      else if (k.indexOf('on') === 0 && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(el, x); }); return; }
    el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  }
  var SVGNS = 'http://www.w3.org/2000/svg';
  function icon(name, cls) {
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'i' + (cls ? ' ' + cls : ''));
    var use = document.createElementNS(SVGNS, 'use');
    use.setAttribute('href', '#i-' + name);
    svg.appendChild(use);
    return svg;
  }
  function svgEl(tag, attrs) {
    var el = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  var nf = function (n) { return I.number(n); };

  function toast(message) {
    var el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { el.classList.remove('show'); }, 3400);
  }

  function ApiError(message, code, status) { var e = new Error(message); e.code = code; e.status = status; return e; }
  function api(url, options) {
    options = options || {};
    var init = { method: options.method || 'GET', headers: { 'content-type': 'application/json' } };
    if (options.body !== undefined) init.body = JSON.stringify(options.body);
    return fetch(url, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) {
          var msg = (data && data.error && data.error.message) || (data && data.error) || ('HTTP ' + r.status);
          throw ApiError(typeof msg === 'string' ? msg : JSON.stringify(msg), data && data.code, r.status);
        }
        return data;
      });
    }, function () { throw ApiError(t('err.network'), 'NETWORK', 0); });
  }
  // متن خطا به زبان فعلی؛ برای کدهای ناشناخته پیام خام سرور نمایش داده می‌شود.
  function errText(e) {
    if (e && e.code === 'NETWORK') return e.message;
    if (e && e.code && I.has('err.' + e.code)) return t('err.' + e.code);
    return t('err.generic', { msg: (e && e.message) || '' });
  }
  function rawErr(e) { return e && e.code && I.has('err.' + e.code) ? t('err.' + e.code) : (e && e.message) || ''; }
  function fail(e) { toast(errText(e)); }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve) {
      var ta = h('textarea', { style: 'position:fixed;opacity:0' }); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e) { /* ignore */ }
      ta.remove(); resolve();
    });
  }

  function askConfirm(message) {
    return new Promise(function (resolve) {
      var box = $('#confirm');
      $('#confirm-text').textContent = message;
      box.classList.remove('hidden');
      $('#confirm-yes').focus();
      function done(v) { box.classList.add('hidden'); $('#confirm-yes').onclick = $('#confirm-no').onclick = null; resolve(v); }
      $('#confirm-yes').onclick = function () { done(true); };
      $('#confirm-no').onclick = function () { done(false); };
    });
  }

  /* ───────── نام‌ها و فهرست ارائه‌دهنده‌ها ───────── */
  function catalogIds() {
    var c = state.cfg && state.cfg.providerCatalog;
    return c && c.length ? c.map(function (p) { return p.id; }) : CATALOG_FALLBACK;
  }
  function allIds() {
    var ids = catalogIds().slice();
    Object.keys((state.cfg && state.cfg.providers) || {}).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
    return ids;
  }
  function providerName(id) {
    var saved = state.cfg && state.cfg.providers[id];
    if (saved && saved.name) return saved.name;
    if (id === 'custom') return t('prov.custom');
    var cat = state.cfg && state.cfg.providerCatalog.filter(function (p) { return p.id === id; })[0];
    return (cat && cat.name) || id;
  }
  function defaultUrl(id) {
    var cat = state.cfg && state.cfg.providerCatalog.filter(function (p) { return p.id === id; })[0];
    return (cat && cat.baseUrl) || DEFAULT_URLS[id] || '';
  }
  function initial(id) { var n = providerName(id); return (n.charAt(0) || 'M').toUpperCase(); }
  function hostOf(url) { try { return new URL(url).host; } catch (e) { return url || ''; } }
  function isConfigured(id) { var p = state.cfg.providers[id]; return Boolean(p && p.configured); }
  function modelsFor(id) {
    var cat = state.cfg.providerCatalog.filter(function (p) { return p.id === id; })[0];
    var saved = state.cfg.providers[id];
    var list = [].concat((cat && cat.models) || [], (saved && saved.models) || [], liveModels[id] || []);
    return list.filter(function (m, i) { return m && list.indexOf(m) === i; });
  }

  /* ───────── نمای کلی ───────── */
  function renderOverview() {
    var c = state.cfg, s = state.stats;
    var id = c.activeProvider;
    var p = c.providers[id] || {};
    $('#a-provider').textContent = providerName(id);
    $('#a-provider-sub').textContent = hostOf(p.baseUrl || defaultUrl(id)) || '—';
    $('#a-provider-tile').textContent = initial(id);
    var chip = $('#a-provider-chip');
    chip.textContent = isConfigured(id) ? t('ov.keySaved') : t('ov.notSet');
    chip.className = 'delta ' + (isConfigured(id) ? 'ok' : 'warn');
    $('#a-main').textContent = c.mainModel; $('#a-main').title = c.mainModel;
    $('#a-fast').textContent = c.fastModel; $('#a-fast').title = c.fastModel;
    $('#version').textContent = 'v' + c.version;
    var head = $('#headline');
    if (!isConfigured(id)) head.textContent = t('ov.headlineNoKey');
    else if (s && s.errors > 0) head.textContent = t('ov.headlineErr', { e: nf(s.errors), n: nf(s.total) });
    else head.textContent = t('ov.headlineOk', { n: nf(s ? s.total : 0) });
    renderChart();
    renderTable();
  }

  var chartInfo = { points: [], series: [], def: 0 };
  function smoothPath(pts) {
    if (pts.length < 2) return '';
    var d = 'M' + pts[0][0].toFixed(2) + ',' + pts[0][1].toFixed(2);
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1], cx = (a[0] + b[0]) / 2;
      d += ' C' + cx.toFixed(2) + ',' + a[1].toFixed(2) + ' ' + cx.toFixed(2) + ',' + b[1].toFixed(2) + ' ' + b[0].toFixed(2) + ',' + b[1].toFixed(2);
    }
    return d;
  }
  function timeLabel(ts) { return new Date(ts).toLocaleTimeString(I.locale(), { hour: '2-digit', minute: '2-digit', hour12: false }); }

  function renderChart() {
    var s = state.stats;
    var svg = $('#chart');
    clear(svg);
    var series = (s && s.series) || [];
    $('#ch-total').textContent = nf(s ? s.inRange : 0);
    $('#ch-avg').textContent = s && s.avgMs ? '· ' + t('ov.avg', { ms: nf(s.avgMs) }) : '';
    $$('#range button').forEach(function (b) { b.classList.toggle('on', b.dataset.range === state.range); });
    var W = 300, H = 110, top = 38, bottom = 6;
    var counts = series.map(function (b) { return b.count; });
    var max = Math.max(1, Math.max.apply(null, counts.concat([0])));
    var pts = counts.map(function (c, i) { return [counts.length > 1 ? (i / (counts.length - 1)) * W : 0, top + (H - top - bottom) * (1 - c / max)]; });
    var empty = !counts.some(function (c) { return c > 0; });
    $('#chart-empty').classList.toggle('hidden', !empty);
    if (pts.length < 2) { $('#chart-tip').classList.add('hidden'); return; }

    var defs = svgEl('defs');
    var grad = svgEl('linearGradient', { id: 'g-fill', x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.appendChild(svgEl('stop', { offset: '0', 'stop-color': '#4a8cf2', 'stop-opacity': '.35' }));
    grad.appendChild(svgEl('stop', { offset: '1', 'stop-color': '#4a8cf2', 'stop-opacity': '0' }));
    defs.appendChild(grad); svg.appendChild(defs);
    var line = smoothPath(pts);
    svg.appendChild(svgEl('path', { d: line + ' L' + W + ',' + H + ' L0,' + H + ' Z', fill: 'url(#g-fill)' }));
    svg.appendChild(svgEl('path', { d: line, fill: 'none', stroke: '#4a8cf2', 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    var vline = svgEl('line', { id: 'ch-vline', y1: 6, y2: H, stroke: '#4a8cf2', 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: '.6' });
    var dot = svgEl('circle', { id: 'ch-dot', r: 5, fill: '#4a8cf2', stroke: '#fff', 'stroke-width': 2.5 });
    svg.appendChild(vline); svg.appendChild(dot);
    var def = pts.length - 1;
    for (var i = counts.length - 1; i >= 0; i--) { if (counts[i] > 0) { def = i; break; } }
    chartInfo = { points: pts, series: series, def: def, W: W, H: H };
    marker(def, empty);
  }
  function marker(i, empty) {
    var p = chartInfo.points[i]; if (!p) return;
    var vline = $('#ch-vline'), dot = $('#ch-dot'), tip = $('#chart-tip');
    vline.setAttribute('x1', p[0]); vline.setAttribute('x2', p[0]);
    dot.setAttribute('cx', p[0]); dot.setAttribute('cy', p[1]);
    if (empty) { tip.classList.add('hidden'); vline.setAttribute('opacity', '0'); dot.setAttribute('opacity', '0'); return; }
    vline.setAttribute('opacity', '.6'); dot.setAttribute('opacity', '1');
    var b = chartInfo.series[i];
    tip.textContent = t('ov.tip', { n: nf(b.count) }) + ' · ' + timeLabel(b.t);
    var frac = p[0] / chartInfo.W;
    tip.style.left = (frac * 100) + '%';
    tip.style.top = (p[1] / chartInfo.H * 100) + '%';
    // کنار لبه‌ها، tooltip به داخل کارت هل داده می‌شود تا بیرون نزند
    tip.classList.toggle('edge-end', frac > 0.62);
    tip.classList.toggle('edge-start', frac < 0.38);
    tip.classList.remove('hidden');
  }
  function initChartHover() {
    var wrap = $('#chart-wrap');
    wrap.addEventListener('pointermove', function (ev) {
      if (!chartInfo.points.length) return;
      var r = $('#chart').getBoundingClientRect();
      var frac = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
      marker(Math.round(frac * (chartInfo.points.length - 1)), $('#chart-empty').classList.contains('hidden') === false);
    });
    wrap.addEventListener('pointerleave', function () { if (chartInfo.points.length) marker(chartInfo.def, $('#chart-empty').classList.contains('hidden') === false); });
  }

  function renderTable() {
    var s = state.stats;
    var body = $('#req-body'); clear(body);
    var rows = ((s && s.recent) || []).filter(function (e) { return state.filter === 'all' || e.status >= 400 || e.status === 0; }).slice(0, 7);
    var emptyEl = $('#req-empty');
    emptyEl.classList.toggle('hidden', rows.length > 0);
    emptyEl.textContent = state.filter === 'errors' && s && s.total > 0 ? t('tbl.emptyErrors') : t('tbl.empty');
    rows.forEach(function (e) {
      var ok = e.status > 0 && e.status < 400;
      var model = e.model || '—';
      body.appendChild(h('tr', null,
        h('td', null, h('div', { class: 'model-cell' },
          h('span', { class: 'model-tile' }, (model.charAt(0) || '?').toUpperCase()),
          h('div', { style: 'min-width:0' }, h('span', { class: 'model-name', title: model }, model), h('span', { class: 'model-sub' }, (e.provider || '') + (e.stream ? ' · stream' : ''))))),
        h('td', null, h('span', { class: 'chip ' + (ok ? 'ok' : 'err'), title: e.error || '' }, ok ? t('status.ok') : String(e.status || 'ERR'))),
        h('td', { class: 'hide-sm' }, h('span', { class: 'num' }, nf(e.ms) + ' ms')),
        h('td', { class: 'hide-sm' }, e.inTok || e.outTok ? h('span', { class: 'num' }, nf(e.inTok) + ' / ' + nf(e.outTok)) : h('span', { class: 'dimtxt' }, '—')),
        h('td', null, h('span', { class: 'dimtxt' }, new Date(e.ts).toLocaleTimeString(I.locale(), { hour12: false })))
      ));
    });
  }

  function loadStats() {
    return api('/api/stats?range=' + state.range).then(function (s) { state.stats = s; if (state.cfg) renderOverview(); });
  }
  function startPolling() {
    clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      if (document.hidden || state.view !== 'overview' || !state.cfg) return;
      loadStats().catch(function () { /* سرور موقتاً در دسترس نیست */ });
    }, 5000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && state.view === 'overview') loadStats().catch(function () {}); });
  }

  /* ───────── ارائه‌دهنده‌ها ───────── */
  function captureDrafts() {
    $$('#provider-list [data-id]').forEach(function (card) {
      var id = card.dataset.id;
      drafts[id] = { key: $('[data-key]', card).value, url: $('[data-url]', card).value, models: $('[data-models]', card).value };
    });
  }
  function testLine(id) {
    var s = testStates[id];
    if (!s) return { text: t('prov.testIdle'), kind: 'idle' };
    if (s.raw !== undefined) return { text: t('prov.testFail', { msg: s.raw }), kind: s.kind };
    return { text: t(s.k, s.v), kind: s.kind };
  }
  function setTest(id, state_) {
    testStates[id] = state_;
    var line = testLine(id);
    $$('[data-test-status="' + id + '"]').forEach(function (el) { el.textContent = line.text; el.dataset.state = line.kind; });
  }

  function providerCard(id, index) {
    var p = state.cfg.providers[id] || {};
    var d = drafts[id] || {};
    var saved = isConfigured(id);
    var active = id === state.cfg.activeProvider;
    var line = testLine(id);
    var keyInput = h('input', { type: 'password', class: p.maskedKey ? '' : 'ph-t', 'data-key': id, autocomplete: 'off', spellcheck: 'false', placeholder: p.maskedKey || t('prov.keyPh'), value: d.key || '' });
    var eye = h('button', { class: 'eye', type: 'button', 'aria-label': t('prov.showKey'), title: t('prov.showKey') }, icon('eye'));
    eye.addEventListener('click', function () {
      var show = keyInput.type === 'password';
      keyInput.type = show ? 'text' : 'password';
      var label = show ? t('prov.hideKey') : t('prov.showKey');
      eye.setAttribute('aria-label', label); eye.title = label;
      clear(eye); eye.appendChild(icon(show ? 'eye-off' : 'eye'));
    });
    keyInput.addEventListener('input', function () { scheduleKeyTest(id); });
    keyInput.addEventListener('blur', function () { clearTimeout(testTimers[id]); if (keyInput.value.trim()) testProvider(id); });

    var card = h('article', { class: 'prov-card' + (active ? ' is-active' : ''), dataset: { id: id, name: providerName(id).toLowerCase() + ' ' + id } },
      h('div', { class: 'prov-head' },
        h('span', { class: 'tile tone-' + (index % 4) }, initial(id)),
        h('div', null, h('b', null, providerName(id)), h('small', null, active ? t('prov.active') : t('prov.compat'))),
        saved ? h('span', { class: 'badge' }, h('i'), t('prov.savedBadge')) : h('span', { class: 'badge off' }, t('prov.notSetBadge'))),
      h('label', { class: 'field' }, h('span', null, t('prov.apiKey')), h('div', { class: 'key-row' }, keyInput, eye)),
      h('label', { class: 'field' }, h('span', null, t('prov.baseUrl')),
        h('input', { 'data-url': id, spellcheck: 'false', autocomplete: 'off', placeholder: 'https://api.example.com/v1', value: d.url !== undefined ? d.url : (p.baseUrl || defaultUrl(id)) })),
      h('label', { class: 'field' }, h('span', null, t('prov.extraModels')),
        h('input', { 'data-models': id, spellcheck: 'false', autocomplete: 'off', placeholder: 'model-a, model-b', value: d.models !== undefined ? d.models : (p.models || []).join(', ') })),
      h('div', { class: 'prov-actions' },
        h('span', { class: 'status', 'data-test-status': id, 'data-state': line.kind, 'aria-live': 'polite' }, line.text),
        h('button', { class: 'btn btn-soft', type: 'button', onclick: function () { testProvider(id); } }, t('prov.test')),
        saved && !active ? h('button', { class: 'btn btn-soft', type: 'button', onclick: function () { makeActive(id); } }, t('prov.makeActive')) : null,
        saved ? h('button', { class: 'btn btn-danger', type: 'button', onclick: function () { removeProvider(id); } }, t('prov.remove')) : null));
    return card;
  }
  function renderProviders() {
    var wrap = $('#provider-list');
    clear(wrap);
    allIds().forEach(function (id, i) { wrap.appendChild(providerCard(id, i)); });
    wrap.appendChild(h('button', { class: 'add-card', type: 'button', onclick: openModal }, t('prov.add')));
    applySearch();
  }
  function applySearch() {
    var q = state.q.trim().toLowerCase();
    var shown = 0;
    $$('#provider-list [data-id]').forEach(function (card) {
      var hit = !q || card.dataset.name.indexOf(q) >= 0;
      card.classList.toggle('hidden', !hit);
      if (hit) shown++;
    });
    var empty = $('#prov-empty');
    empty.classList.toggle('hidden', !(q && shown === 0));
    if (q && shown === 0) empty.textContent = t('prov.noMatch', { q: state.q.trim() });
  }

  function collectProviders() {
    var next = {};
    $$('#provider-list [data-id]').forEach(function (card) {
      var id = card.dataset.id;
      var key = $('[data-key]', card).value.trim();
      var url = $('[data-url]', card).value.trim();
      var models = $('[data-models]', card).value.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      var existing = state.cfg.providers[id];
      if (key || existing || url !== defaultUrl(id) || models.length) next[id] = { apiKey: key || undefined, baseUrl: url, models: models };
    });
    return next;
  }
  function saveProviders() {
    return api('/api/config', { method: 'PUT', body: { providers: collectProviders() } }).then(function () {
      drafts = {}; toast(t('prov.saved')); return refresh();
    }).catch(fail);
  }
  function makeActive(id) {
    api('/api/config', { method: 'PUT', body: { activeProvider: id } }).then(function () {
      toast(t('prov.nowActive', { name: providerName(id) })); return refresh();
    }).catch(fail);
  }
  function removeProvider(id) {
    askConfirm(t('prov.confirmRemove', { name: providerName(id) })).then(function (yes) {
      if (!yes) return;
      captureDrafts();
      api('/api/providers/' + encodeURIComponent(id), { method: 'DELETE' }).then(function () {
        delete drafts[id]; delete testStates[id]; toast(t('prov.removed')); return refresh();
      }).catch(fail);
    });
  }

  function scheduleKeyTest(id) {
    clearTimeout(testTimers[id]);
    var input = $('[data-key="' + id + '"]');
    if (!input || !input.value.trim()) { setTest(id, null); return; }
    setTest(id, { k: 'prov.testWait', kind: 'pending' });
    testTimers[id] = setTimeout(function () { testProvider(id, { silent: true }); }, 1100);
  }
  function testProvider(id, extra) {
    extra = extra || {};
    var key = extra.apiKey !== undefined ? extra.apiKey : (($('[data-key="' + id + '"]') || {}).value || '').trim();
    var urlEl = $('[data-url="' + id + '"]');
    var baseUrl = extra.baseUrl !== undefined ? extra.baseUrl : (urlEl ? urlEl.value.trim() : defaultUrl(id));
    var statusId = extra.statusId || id;
    var saved = isConfigured(id) && !extra.apiKey && !key; // اگر فیلد خالی است از کلید ذخیره‌شده استفاده می‌شود
    if (!key && !saved) { setTest(statusId, { raw: t('prov.noKey'), kind: 'error' }); if (!extra.silent) toast(t('prov.noKey')); return Promise.resolve(); }
    setTest(statusId, { k: 'prov.testing', kind: 'pending' });
    return api('/api/test', { method: 'POST', body: { providerId: id, apiKey: key, baseUrl: baseUrl, model: state.cfg.mainModel } }).then(function (r) {
      setTest(statusId, r.testMethod === 'models' && r.modelsFound !== null ? { k: 'prov.testOkModels', v: { n: nf(r.modelsFound) }, kind: 'success' } : { k: 'prov.testOkChat', kind: 'success' });
      if (!extra.silent) toast('✓ ' + t('prov.testOkToast'));
      return r;
    }).catch(function (e) {
      setTest(statusId, { raw: rawErr(e), kind: 'error' });
      if (!extra.silent) toast(t('prov.testFail', { msg: rawErr(e) }));
    });
  }

  /* ───────── افزودن ارائه‌دهنده (Modal) ───────── */
  function openModal() {
    var sel = $('#new-provider'); clear(sel);
    allIds().filter(function (id) { return catalogIds().indexOf(id) >= 0; }).forEach(function (id) { sel.appendChild(h('option', { value: id }, providerName(id))); });
    sel.value = 'custom';
    $('#new-name').value = ''; $('#new-key').value = ''; $('#new-url').value = '';
    setTest('modal', null);
    $('#modal [data-test-status="modal"]').textContent = t('modal.hint');
    syncNameField();
    $('#modal').classList.remove('hidden');
    $('#new-key').focus();
  }
  function closeModal() { $('#modal').classList.add('hidden'); }
  function syncNameField() { $('#new-name-wrap').classList.toggle('hidden', $('#new-provider').value !== 'custom'); }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30); }
  function saveNew() {
    var service = $('#new-provider').value, key = $('#new-key').value.trim();
    var baseUrl = $('#new-url').value.trim() || defaultUrl(service);
    if (!key || !baseUrl) { toast(t('modal.needFields')); return Promise.resolve(); }
    var id = service, name = $('#new-name').value.trim();
    if (service === 'custom' && name) {
      // هر ارائه‌دهنده سفارشی شناسه‌ی جداگانه می‌گیرد؛ نام فارسی/غیرلاتین با زمان یکتا می‌شود
      id = 'custom-' + (slug(name) || 'x') + (state.cfg.providers['custom-' + slug(name)] ? '-' + Date.now().toString(36).slice(-4) : '');
    }
    var entry = { apiKey: key, baseUrl: baseUrl };
    if (service === 'custom' && name) entry.name = name;
    var body = { providers: {}, activeProvider: id }; body.providers[id] = entry;
    return api('/api/config', { method: 'PUT', body: body }).then(function () { closeModal(); toast(t('modal.added')); return refresh(); }).catch(fail);
  }

  /* ───────── مدل‌ها ───────── */
  function renderModels() {
    var sel = $('#model-provider'); clear(sel);
    allIds().forEach(function (id) { sel.appendChild(h('option', { value: id }, providerName(id))); });
    sel.value = state.cfg.activeProvider;
    $('#main-model').value = state.cfg.mainModel;
    $('#fast-model').value = state.cfg.fastModel;
    fillModelOptions();
  }
  function fillModelOptions() {
    var dl = $('#model-options'); clear(dl);
    modelsFor($('#model-provider').value).forEach(function (m) { dl.appendChild(h('option', { value: m })); });
  }
  function fetchLive() {
    var id = $('#model-provider').value;
    var btn = $('#fetch-models'); btn.disabled = true;
    api('/api/models?provider=' + encodeURIComponent(id) + '&live=1').then(function (r) {
      liveModels[id] = r.models; fillModelOptions(); toast(t('models.fetched', { n: nf(r.live) }));
    }).catch(fail).then(function () { btn.disabled = false; });
  }
  function saveModels() {
    api('/api/config', { method: 'PUT', body: { activeProvider: $('#model-provider').value, mainModel: $('#main-model').value, fastModel: $('#fast-model').value } })
      .then(function () { toast(t('models.saved')); return refresh(); }).catch(fail);
  }

  /* ───────── ناوبری و زبان ───────── */
  function showView(view) {
    if (!TITLE_KEYS[view]) view = 'overview';
    state.view = view;
    $$('.view').forEach(function (v) { v.classList.add('hidden'); });
    $('#view-' + view).classList.remove('hidden');
    $$('.rail-btn[data-view], .rail-logo').forEach(function (b) {
      var on = b.dataset.view === view;
      if (b.classList.contains('rail-btn')) { b.classList.toggle('active', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }
    });
    $('#page-title').textContent = t(TITLE_KEYS[view]);
    try { history.replaceState(null, '', '#' + view); } catch (e) { /* ignore */ }
    if (view === 'overview') loadStats().catch(function () {});
  }
  function renderAll() {
    I.apply();
    if (!state.cfg) return;
    captureDrafts();
    renderOverview(); renderProviders(); renderModels();
    $('#port-input').value = state.cfg.port;
    $('#page-title').textContent = t(TITLE_KEYS[state.view]);
    $$('[data-i18n="promo.pre"]').forEach(function (el) { el.classList.toggle('hidden', !t('promo.pre')); });
  }
  function refresh() {
    return api('/api/config').then(function (cfg) { state.cfg = cfg; renderAll(); return loadStats().catch(function () {}); });
  }

  /* ───────── اتصال رویدادها ───────── */
  function bind() {
    $$('[data-view]').forEach(function (b) { b.addEventListener('click', function () { showView(b.dataset.view); }); });
    $$('[data-goto]').forEach(function (b) { b.addEventListener('click', function () { showView(b.dataset.goto); }); });
    $$('[data-lang]').forEach(function (b) { b.addEventListener('click', function () { I.setLang(b.dataset.lang); renderAll(); }); });
    $$('#range button').forEach(function (b) { b.addEventListener('click', function () { state.range = b.dataset.range; loadStats().catch(fail); }); });
    $$('#filters button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.filter = b.dataset.filter;
        $$('#filters button').forEach(function (x) { x.classList.toggle('on', x === b); });
        renderTable();
      });
    });
    $$('[data-copy]').forEach(function (b) {
      b.addEventListener('click', function () {
        copyText(b.dataset.copy).then(function () { b.classList.add('done'); toast(t('set.copied')); setTimeout(function () { b.classList.remove('done'); }, 1500); });
      });
    });
    $('#search').addEventListener('input', function (e) {
      state.q = e.target.value;
      if (state.q.trim() && state.view !== 'providers') showView('providers');
      applySearch();
    });
    $('#search').addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.target.value = ''; state.q = ''; applySearch(); } });
    $('#save-providers').addEventListener('click', saveProviders);
    $('#save-models').addEventListener('click', saveModels);
    $('#fetch-models').addEventListener('click', fetchLive);
    $('#model-provider').addEventListener('change', fillModelOptions);
    $('#save-settings').addEventListener('click', function () {
      api('/api/config', { method: 'PUT', body: { port: Number($('#port-input').value) } }).then(function () { toast(t('set.saved')); return refresh(); }).catch(fail);
    });
    $('#reset-btn').addEventListener('click', function () {
      askConfirm(t('set.resetConfirm')).then(function (yes) {
        if (!yes) return;
        drafts = {}; testStates = {}; liveModels = {};
        api('/api/reset', { method: 'POST', body: {} }).then(function () { toast(t('set.resetDone')); return refresh(); }).catch(fail);
      });
    });
    $('#launch-btn').addEventListener('click', function () {
      api('/api/launch', { method: 'POST', body: {} }).then(function () { toast(t('launch.sent')); }).catch(fail);
    });
    $('#modal-close').addEventListener('click', closeModal);
    $('#modal').addEventListener('click', function (e) { if (e.target === $('#modal')) closeModal(); });
    $('#confirm').addEventListener('click', function (e) { if (e.target === $('#confirm')) $('#confirm-no').click(); });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!$('#confirm').classList.contains('hidden')) $('#confirm-no').click();
      else if (!$('#modal').classList.contains('hidden')) closeModal();
    });
    $('#add-new').addEventListener('click', saveNew);
    $('#test-new').addEventListener('click', function () {
      var id = $('#new-provider').value;
      testProvider(id, { apiKey: $('#new-key').value.trim(), baseUrl: $('#new-url').value.trim() || defaultUrl(id), statusId: 'modal' });
    });
    $('#new-key').addEventListener('input', function () {
      clearTimeout(testTimers.modal);
      if (!$('#new-key').value.trim()) return;
      setTest('modal', { k: 'prov.testWait', kind: 'pending' });
      testTimers.modal = setTimeout(function () {
        var id = $('#new-provider').value;
        testProvider(id, { apiKey: $('#new-key').value.trim(), baseUrl: $('#new-url').value.trim() || defaultUrl(id), statusId: 'modal', silent: true });
      }, 1100);
    });
    $('#new-provider').addEventListener('change', function () { $('#new-url').value = defaultUrl($('#new-provider').value); syncNameField(); });
    initChartHover();
  }

  function boot() {
    I.apply();
    bind();
    var started = Date.now();
    var hash = (location.hash || '').replace('#', '');
    var reveal = function () {
      var wait = Math.max(0, 900 - (Date.now() - started));
      setTimeout(function () {
        $('#splash').classList.add('hide');
        $('#app').classList.remove('hidden');
        showView(hash);
      }, wait);
    };
    refresh().then(function () { startPolling(); reveal(); }, function (e) {
      toast(t('err.load', { msg: rawErr(e) })); reveal();
    });
  }

  window.__matixo = { state: state, showView: showView, refresh: refresh };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
