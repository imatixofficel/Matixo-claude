import fs from 'node:fs';
import path from 'node:path';
import { PROVIDERS } from './providers.js';
import { MatixoError } from './errors.js';
import { ROOT_DIR } from './meta.js';

// مسیر داده با متغیر MATIXO_DATA_DIR قابل تغییر است (برای تست و نصب‌های سفارشی).
export const dataDir = () => path.resolve(process.env.MATIXO_DATA_DIR || path.join(ROOT_DIR, 'data'));
export const configFile = () => path.join(dataDir(), 'config.json');

const defaults = {
  host: '127.0.0.1', port: 3456, activeProvider: 'openai',
  mainModel: 'gpt-4o', fastModel: 'gpt-4o-mini', authToken: 'matixo-local',
  providers: {}
};

const validPort = (n) => Number.isInteger(n) && n >= 1024 && n <= 65535;
// مقدار متغیرهای محیطی روی فایل تنظیمات اولویت دارد ولی هرگز در فایل ذخیره نمی‌شود.
export function getPort(config = loadConfig()) {
  const env = Number(process.env.MATIXO_PORT);
  return validPort(env) ? env : Number(config.port) || 3456;
}
export function getAuthToken(config = loadConfig()) {
  return process.env.MATIXO_AUTH_TOKEN || config.authToken || 'matixo-local';
}

let cache = { key: '', value: null };

export function ensureDataDir() {
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(dir, 0o700); } catch { /* ویندوز */ }
}

export function loadConfig() {
  ensureDataDir();
  const file = configFile();
  if (!fs.existsSync(file)) { saveConfig(defaults); return structuredClone(defaults); }
  const st = fs.statSync(file);
  const key = `${file}:${st.mtimeMs}:${st.size}`;
  if (cache.key === key && cache.value) return structuredClone(cache.value);
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    const value = { ...structuredClone(defaults), ...saved, providers: { ...(saved.providers || {}) } };
    cache = { key, value };
    return structuredClone(value);
  } catch (err) {
    throw new MatixoError('CONFIG_UNREADABLE', err.message);
  }
}

export function saveConfig(config) {
  ensureDataDir();
  const file = configFile();
  const safe = { ...config, host: '127.0.0.1' };
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(safe, null, 2), { mode: 0o600 });
  fs.renameSync(temp, file);
  try { fs.chmodSync(file, 0o600); } catch { /* ویندوز */ }
  cache = { key: '', value: null };
  return safe;
}

export function resetConfig() {
  saveConfig(defaults);
  return structuredClone(defaults);
}

export function getActiveProvider(config = loadConfig()) {
  const id = config.activeProvider;
  const saved = config.providers?.[id];
  const preset = PROVIDERS[id];
  if (!saved || !saved.apiKey) throw new MatixoError('NO_KEY');
  const baseUrl = (saved.baseUrl || preset?.baseUrl || '').replace(/\/+$/, '');
  if (!baseUrl) throw new MatixoError('NO_BASE_URL');
  return { ...saved, id, name: saved.name || preset?.name || id, baseUrl };
}

export function maskKey(key = '') {
  if (!key) return '';
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}
