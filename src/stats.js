// آمار درخواست‌های پروکسی؛ فقط در حافظه نگه داشته می‌شود و با بستن برنامه پاک می‌شود.
// In-memory proxy request stats (ring buffer). Nothing is written to disk.
const MAX_EVENTS = 1000;
let events = [];
let totals = { total: 0, errors: 0, tokensIn: 0, tokensOut: 0 };
let since = Date.now();

export const RANGES = { '15m': 15 * 60e3, '1h': 60 * 60e3, '6h': 6 * 60 * 60e3 };
const BUCKETS = 30;

export function record(ev) {
  const e = {
    ts: Date.now(), model: String(ev.model || ''), provider: String(ev.provider || ''),
    status: Number(ev.status) || 0, ms: Math.round(ev.ms || 0), inTok: ev.inTok || 0, outTok: ev.outTok || 0,
    stream: Boolean(ev.stream), error: ev.error ? String(ev.error).slice(0, 200) : ''
  };
  events.push(e);
  if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS);
  totals.total += 1;
  if (e.status >= 400 || e.status === 0) totals.errors += 1;
  totals.tokensIn += e.inTok; totals.tokensOut += e.outTok;
  return e;
}

export function snapshot(range = '1h', now = Date.now()) {
  const span = RANGES[range] || RANGES['1h'];
  const step = span / BUCKETS;
  const start = now - span;
  const series = Array.from({ length: BUCKETS }, (_, i) => ({ t: Math.round(start + step * (i + 1)), count: 0, errors: 0 }));
  let inRange = 0;
  for (const e of events) {
    if (e.ts < start || e.ts > now) continue;
    const i = Math.min(BUCKETS - 1, Math.max(0, Math.floor((e.ts - start) / step)));
    series[i].count += 1;
    if (e.status >= 400 || e.status === 0) series[i].errors += 1;
    inRange += 1;
  }
  const lat = events.filter(e => e.status > 0 && e.status < 400).map(e => e.ms);
  const avgMs = lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : 0;
  return { since, range: RANGES[range] ? range : '1h', inRange, ...totals, avgMs, series, recent: events.slice(-20).reverse() };
}

export function resetStats() {
  events = []; totals = { total: 0, errors: 0, tokensIn: 0, tokensOut: 0 }; since = Date.now();
}
