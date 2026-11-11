// خطاهای دوزبانه با کد ثابت؛ رابط کاربری با «code» متن را به زبان انتخاب‌شده نشان می‌دهد.
// Bilingual errors with a stable code; the dashboard translates by `code`.
const TABLE = {
  PORT_RANGE: [400, 'Port must be a number between 1024 and 65535.', 'پورت باید عددی بین 1024 تا 65535 باشد.'],
  PROVIDER_INVALID: [400, 'The selected provider is not valid.', 'ارائه‌دهنده انتخاب‌شده معتبر نیست.'],
  BAD_PROVIDER_ID: [400, 'Invalid provider id.', 'شناسه ارائه‌دهنده معتبر نیست.'],
  BAD_URL: [400, 'Base URL must start with http:// or https://.', 'Base URL باید با http:// یا https:// شروع شود.'],
  NO_KEY: [400, 'No API key is saved for the active provider.', 'برای ارائه‌دهنده فعال، API Key ثبت نشده است.'],
  NO_BASE_URL: [400, 'The provider Base URL is not set.', 'Base URL ارائه‌دهنده تنظیم نشده است.'],
  TEST_FIELDS: [400, 'Provider, API key and Base URL are required.', 'Provider، API Key و Base URL الزامی هستند.'],
  NO_LAUNCH_LISTENER: [409, 'Launch is only available when the panel was opened with `matixo launch`.', 'اجرا فقط وقتی کار می‌کند که پنل با `matixo launch` باز شده باشد.'],
  FORBIDDEN: [403, 'Request blocked: the panel only accepts requests from this computer.', 'درخواست مسدود شد: پنل فقط از همین دستگاه درخواست می‌پذیرد.'],
  MODELS_FAILED: [502, 'Could not fetch the model list from the provider.', 'دریافت فهرست مدل‌ها از ارائه‌دهنده ممکن نشد.'],
  CONFIG_UNREADABLE: [500, 'The settings file cannot be read.', 'فایل تنظیمات قابل خواندن نیست.']
};

export class MatixoError extends Error {
  constructor(code, detail = '') {
    const [status, en, fa] = TABLE[code] || [500, String(code), String(code)];
    super(`${en} — ${fa}${detail ? ` (${detail})` : ''}`);
    this.name = 'MatixoError';
    this.code = code;
    this.status = status;
    this.en = en;
    this.fa = fa;
  }
}
