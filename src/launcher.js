import { spawn } from 'node:child_process';
import { loadConfig, getActiveProvider, getPort, getAuthToken } from './config.js';

const ENV_KEYS = [
  'ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_SMALL_FAST_MODEL', 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC'
];

export function claudeEnvironment() {
  const config = loadConfig();
  getActiveProvider(config); // اعتبارسنجی کلید و ارائه‌دهنده پیش از اجرا
  const model = config.mainModel;
  const fast = config.fastModel || model;
  const token = getAuthToken(config);
  return {
    ...process.env,
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${getPort(config)}`,
    ANTHROPIC_AUTH_TOKEN: token,
    ANTHROPIC_API_KEY: token,
    ANTHROPIC_MODEL: model,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: fast,
    ANTHROPIC_DEFAULT_SONNET_MODEL: model,
    ANTHROPIC_DEFAULT_OPUS_MODEL: model,
    ANTHROPIC_SMALL_FAST_MODEL: fast,
    // از ارسال ترافیک غیرضروری (تلمتری/به‌روزرسانی) به سرورهای Anthropic جلوگیری می‌کند.
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1'
  };
}

export function launchClaude(args = []) {
  const env = claudeEnvironment();
  const child = spawn('claude', args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
  child.on('error', err => { console.error(`Claude Code failed to start / اجرای Claude Code ناموفق بود: ${err.message}`); });
  return child;
}

// shell: bash (پیش‌فرض) | powershell | cmd
export function envScript(shell = 'bash') {
  const e = claudeEnvironment();
  const quote = {
    bash: (v) => `'${String(v).replaceAll("'", "'\\''")}'`,
    powershell: (v) => `'${String(v).replaceAll("'", "''")}'`,
    cmd: (v) => String(v)
  };
  const line = {
    bash: (k, v) => `export ${k}=${v}`,
    powershell: (k, v) => `$env:${k}=${v}`,
    cmd: (k, v) => `set ${k}=${v}`
  };
  const s = quote[shell] ? shell : 'bash';
  return ENV_KEYS.map(k => line[s](k, quote[s](e[k]))).join('\n');
}
