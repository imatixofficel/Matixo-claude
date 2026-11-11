// فهرست ارائه‌دهندگان و مدل‌های پیشنهادی؛ مدل‌ها ممکن است با گذر زمان تغییر کنند.
// برای فهرست زنده از دکمه «دریافت فهرست زنده» در پنل (endpoint ‏/models) استفاده کن.
export const PROVIDERS = {
  openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3-mini'] },
  deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-chat', 'deepseek-reasoner'] },
  openrouter: { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', models: ['anthropic/claude-sonnet-4', 'openai/gpt-4o', 'google/gemini-2.5-flash', 'deepseek/deepseek-chat'] },
  groq: { name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-120b'] },
  gemini: { name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', models: ['gemini-2.5-pro', 'gemini-2.5-flash'] },
  custom: { name: 'Custom', baseUrl: '', models: [] }
};

export const PROVIDER_ID_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/i;

export function publicProviders() {
  return Object.entries(PROVIDERS).map(([id, p]) => ({ id, ...p }));
}
