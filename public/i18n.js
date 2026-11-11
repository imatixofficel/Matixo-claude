/* Matixo | Claude — i18n (fa / en)
   زبان پیش‌فرض فارسی است؛ انتخاب کاربر در localStorage ذخیره می‌شود. */
(function () {
  'use strict';

  var dict = {
    en: {
      'app.title': 'Matixo | Claude',
      'splash.bismillah': 'In the name of God',
      'nav.overview': 'Overview',
      'nav.providers': 'Providers',
      'nav.models': 'Models',
      'nav.settings': 'Settings',
      'nav.github': 'GitHub',
      'top.search': 'Search providers…',
      'top.lang': 'Language',
      'top.status': 'Local gateway',
      'top.running': 'Running on your computer',

      'ov.traffic': 'Traffic',
      'ov.requests': 'Requests',
      'ov.avg': 'Avg latency {ms} ms',
      'ov.noTraffic': 'No requests yet',
      'ov.tip': '{n} requests',
      'ov.setup': 'Your setup',
      'ov.provider': 'Provider',
      'ov.mainModel': 'Main model',
      'ov.fastModel': 'Fast model',
      'ov.mainSub': 'Sonnet / Opus',
      'ov.fastSub': 'Haiku / background',
      'ov.keySaved': 'Key saved',
      'ov.notSet': 'Not set',
      'ov.main': 'Main',
      'ov.fast': 'Fast',
      'ov.manage': 'Manage',
      'ov.headlineNoKey': 'Add an API key to get started',
      'ov.headlineOk': 'Gateway is up · {n} requests handled',
      'ov.headlineErr': 'Gateway is up · {e} of {n} requests failed',
      'range.15m': '15m',
      'range.1h': '1h',
      'range.6h': '6h',
      'tbl.model': 'Model',
      'tbl.status': 'Status',
      'tbl.latency': 'Latency',
      'tbl.tokens': 'Tokens (in / out)',
      'tbl.time': 'Time',
      'tbl.empty': 'Requests from Claude Code will appear here.',
      'tbl.emptyErrors': 'No failed requests. Nice.',
      'filter.all': 'All',
      'filter.errors': 'Errors',
      'status.ok': 'OK',
      'promo.pre': 'Run',
      'promo.chip': 'any',
      'promo.post': 'model in Claude Code!',
      'promo.text': 'Connect OpenAI-compatible APIs to Claude Code through one local gateway.',
      'promo.btn': 'Run Claude Code',
      'promo.hint': 'Works when the panel was started with `matixo launch`.',

      'prov.title': 'Providers',
      'prov.sub': 'Connect any OpenAI-compatible API from one place.',
      'prov.save': 'Save changes',
      'prov.saved': 'Provider settings saved.',
      'prov.apiKey': 'API Key',
      'prov.keyPh': 'Enter API key',
      'prov.baseUrl': 'Base URL',
      'prov.extraModels': 'Extra models (comma separated)',
      'prov.test': 'Test connection',
      'prov.remove': 'Remove key',
      'prov.active': 'Active provider',
      'prov.compat': 'OpenAI-compatible',
      'prov.savedBadge': 'Saved',
      'prov.notSetBadge': 'Not set',
      'prov.makeActive': 'Use this provider',
      'prov.nowActive': '{name} is now the active provider.',
      'prov.add': '+ Add custom provider',
      'prov.custom': 'Custom',
      'prov.testIdle': 'Ready to test',
      'prov.testWait': 'Waiting for the key to be completed…',
      'prov.testing': 'Checking connection…',
      'prov.testOkModels': '✓ Connected · {n} models',
      'prov.testOkChat': '✓ Connected · test request succeeded',
      'prov.testFail': '✕ Failed: {msg}',
      'prov.testOkToast': 'Key is valid and the API responds.',
      'prov.noKey': 'Enter the API key first.',
      'prov.confirmRemove': 'Remove the saved key for {name}?',
      'prov.removed': 'Removed.',
      'prov.showKey': 'Show key',
      'prov.hideKey': 'Hide key',
      'prov.noMatch': 'No provider matches “{q}”.',

      'modal.overline': 'New connection',
      'modal.title': 'Add provider',
      'modal.service': 'Service',
      'modal.name': 'Display name',
      'modal.namePh': 'My provider',
      'modal.save': 'Save provider',
      'modal.hint': 'The connection is tested automatically after you enter the key.',
      'modal.added': 'Provider added.',
      'modal.needFields': 'Enter the API key and Base URL.',
      'close': 'Close',
      'cancel': 'Cancel',
      'confirm': 'Confirm',

      'models.title': 'Models',
      'models.sub': 'The models Claude Code uses through Matixo.',
      'models.provider': 'Active provider',
      'models.main': 'Main model (Main / Sonnet / Opus)',
      'models.fast': 'Fast model (Haiku / background)',
      'models.fetch': 'Fetch live list',
      'models.fetched': '{n} models loaded from the provider.',
      'models.save': 'Save models',
      'models.saved': 'Models saved.',
      'models.note': 'Note: the chosen model must be enabled on your provider account. Model names differ between providers — you can type any model name.',

      'set.title': 'Settings',
      'set.sub': 'Local configuration and security of the Matixo gateway.',
      'set.save': 'Save settings',
      'set.saved': 'Settings saved. Restart the server to apply a new port.',
      'set.port': 'Panel & proxy port',
      'set.host': 'Host',
      'set.token': 'Local proxy token',
      'set.tokenNote': 'The local token is used on this machine only and does not need to be changed.',
      'set.language': 'Language',
      'set.connect': 'Connect Claude Code manually',
      'set.connectText': 'Run one of these in your terminal, then start claude:',
      'set.copy': 'Copy',
      'set.copied': 'Copied',
      'set.secTitle': 'Privacy & security',
      'set.secText': 'Keys are stored in data/config.json, which is excluded from Git and has restricted permissions. The panel and proxy only listen on localhost and reject requests from other websites.',
      'set.reset': 'Reset settings',
      'set.resetConfirm': 'Delete all saved settings and keys?',
      'set.resetDone': 'Settings reset to defaults.',

      'launch.sent': 'Request sent to the CLI; Claude Code is starting in your terminal.',
      'foot.made': 'Built with care for Matixo · Local-first AI gateway',

      'err.PORT_RANGE': 'Port must be a number between 1024 and 65535.',
      'err.PROVIDER_INVALID': 'The selected provider is not valid.',
      'err.BAD_PROVIDER_ID': 'Invalid provider id.',
      'err.BAD_URL': 'Base URL must start with http:// or https://.',
      'err.NO_KEY': 'No API key is saved for this provider.',
      'err.NO_BASE_URL': 'The provider Base URL is not set.',
      'err.TEST_FIELDS': 'Provider, API key and Base URL are required.',
      'err.NO_LAUNCH_LISTENER': 'Launch only works when the panel was opened with `matixo launch`. Otherwise run: eval "$(matixo env)" and then claude.',
      'err.FORBIDDEN': 'Request blocked: the panel only accepts requests from this computer.',
      'err.MODELS_FAILED': 'Could not fetch the model list from the provider.',
      'err.CONFIG_UNREADABLE': 'The settings file cannot be read.',
      'err.TIMEOUT': 'The connection timed out.',
      'err.network': 'Cannot reach the Matixo server. Is it still running?',
      'err.generic': 'Something went wrong: {msg}',
      'err.load': 'Failed to load: {msg}'
    },

    fa: {
      'app.title': 'Matixo | Claude',
      'splash.bismillah': 'به نام پروردگار',
      'nav.overview': 'نمای کلی',
      'nav.providers': 'ارائه‌دهنده‌ها',
      'nav.models': 'مدل‌ها',
      'nav.settings': 'تنظیمات',
      'nav.github': 'گیت‌هاب',
      'top.search': 'جستجوی ارائه‌دهنده…',
      'top.lang': 'زبان',
      'top.status': 'درگاه محلی',
      'top.running': 'در حال اجرا روی سیستم شما',

      'ov.traffic': 'ترافیک',
      'ov.requests': 'درخواست‌ها',
      'ov.avg': 'میانگین تأخیر {ms} میلی‌ثانیه',
      'ov.noTraffic': 'هنوز درخواستی ثبت نشده',
      'ov.tip': '{n} درخواست',
      'ov.setup': 'پیکربندی شما',
      'ov.provider': 'ارائه‌دهنده',
      'ov.mainModel': 'مدل اصلی',
      'ov.fastModel': 'مدل سریع',
      'ov.mainSub': 'Sonnet / Opus',
      'ov.fastSub': 'Haiku / پس‌زمینه',
      'ov.keySaved': 'کلید ثبت شد',
      'ov.notSet': 'تنظیم‌نشده',
      'ov.main': 'اصلی',
      'ov.fast': 'سریع',
      'ov.manage': 'مدیریت',
      'ov.headlineNoKey': 'برای شروع یک API Key اضافه کن',
      'ov.headlineOk': 'درگاه فعال است · {n} درخواست پردازش شد',
      'ov.headlineErr': 'درگاه فعال است · {e} از {n} درخواست ناموفق بود',
      'range.15m': '۱۵ دقیقه',
      'range.1h': '۱ ساعت',
      'range.6h': '۶ ساعت',
      'tbl.model': 'مدل',
      'tbl.status': 'وضعیت',
      'tbl.latency': 'تأخیر',
      'tbl.tokens': 'توکن (ورودی / خروجی)',
      'tbl.time': 'زمان',
      'tbl.empty': 'درخواست‌های Claude Code اینجا نمایش داده می‌شود.',
      'tbl.emptyErrors': 'درخواست ناموفقی نیست. عالی!',
      'filter.all': 'همه',
      'filter.errors': 'خطاها',
      'status.ok': 'موفق',
      'promo.pre': '',
      'promo.chip': 'هر',
      'promo.post': 'مدلی را در Claude Code اجرا کن!',
      'promo.text': 'APIهای سازگار با OpenAI را از یک درگاه محلی به Claude Code وصل کن.',
      'promo.btn': 'اجرای Claude Code',
      'promo.hint': 'فقط وقتی کار می‌کند که پنل با `matixo launch` اجرا شده باشد.',

      'prov.title': 'ارائه‌دهنده‌ها',
      'prov.sub': 'APIهای سازگار با OpenAI را از یک‌جا وصل کن.',
      'prov.save': 'ذخیره تغییرات',
      'prov.saved': 'تنظیمات ارائه‌دهنده‌ها ذخیره شد.',
      'prov.apiKey': 'API Key',
      'prov.keyPh': 'کلید API را وارد کن',
      'prov.baseUrl': 'Base URL',
      'prov.extraModels': 'مدل‌های اضافه (با کاما جدا کن)',
      'prov.test': 'تست اتصال',
      'prov.remove': 'حذف کلید',
      'prov.active': 'ارائه‌دهنده فعال',
      'prov.compat': 'سازگار با OpenAI',
      'prov.savedBadge': 'ثبت‌شده',
      'prov.notSetBadge': 'تنظیم‌نشده',
      'prov.makeActive': 'استفاده از این ارائه‌دهنده',
      'prov.nowActive': '{name} اکنون ارائه‌دهنده فعال است.',
      'prov.add': '+ افزودن ارائه‌دهنده سفارشی',
      'prov.custom': 'سفارشی',
      'prov.testIdle': 'آماده تست',
      'prov.testWait': 'در انتظار تکمیل کلید…',
      'prov.testing': 'در حال بررسی اتصال…',
      'prov.testOkModels': '✓ متصل · {n} مدل',
      'prov.testOkChat': '✓ متصل · درخواست آزمایشی موفق بود',
      'prov.testFail': '✕ ناموفق: {msg}',
      'prov.testOkToast': 'کلید معتبر است و API پاسخ می‌دهد.',
      'prov.noKey': 'ابتدا API Key را وارد کن.',
      'prov.confirmRemove': 'کلید ذخیره‌شده {name} حذف شود؟',
      'prov.removed': 'حذف شد.',
      'prov.showKey': 'نمایش کلید',
      'prov.hideKey': 'پنهان کردن کلید',
      'prov.noMatch': 'ارائه‌دهنده‌ای با «{q}» پیدا نشد.',

      'modal.overline': 'اتصال جدید',
      'modal.title': 'افزودن ارائه‌دهنده',
      'modal.service': 'سرویس',
      'modal.name': 'نام نمایشی',
      'modal.namePh': 'ارائه‌دهنده من',
      'modal.save': 'ذخیره ارائه‌دهنده',
      'modal.hint': 'پس از واردکردن کلید، تست خودکار انجام می‌شود.',
      'modal.added': 'ارائه‌دهنده اضافه شد.',
      'modal.needFields': 'API Key و Base URL را وارد کن.',
      'close': 'بستن',
      'cancel': 'انصراف',
      'confirm': 'تأیید',

      'models.title': 'مدیریت مدل‌ها',
      'models.sub': 'مدل‌هایی که Claude Code از طریق Matixo استفاده می‌کند.',
      'models.provider': 'ارائه‌دهنده فعال',
      'models.main': 'مدل اصلی (Main / Sonnet / Opus)',
      'models.fast': 'مدل سریع (Haiku / پس‌زمینه)',
      'models.fetch': 'دریافت فهرست زنده',
      'models.fetched': '{n} مدل از ارائه‌دهنده دریافت شد.',
      'models.save': 'ذخیره مدل‌ها',
      'models.saved': 'مدل‌ها ذخیره شدند.',
      'models.note': 'نکته: مدل انتخابی باید در حساب سرویس‌دهنده شما فعال باشد. نام مدل‌ها بین ارائه‌دهندگان متفاوت است؛ می‌توانی هر نام مدلی را تایپ کنی.',

      'set.title': 'تنظیمات',
      'set.sub': 'پیکربندی محلی و امنیت درگاه Matixo.',
      'set.save': 'ذخیره تنظیمات',
      'set.saved': 'تنظیمات ذخیره شد. برای اعمال پورت جدید، سرور را دوباره اجرا کن.',
      'set.port': 'پورت پنل و پروکسی',
      'set.host': 'آدرس میزبان',
      'set.token': 'توکن داخلی پروکسی',
      'set.tokenNote': 'توکن داخلی فقط روی همین دستگاه استفاده می‌شود و نیازی به تغییر آن نیست.',
      'set.language': 'زبان',
      'set.connect': 'اتصال دستی Claude Code',
      'set.connectText': 'یکی از این دستورها را در ترمینال اجرا کن و بعد claude را بزن:',
      'set.copy': 'کپی',
      'set.copied': 'کپی شد',
      'set.secTitle': 'امنیت اطلاعات',
      'set.secText': 'کلیدها در فایل data/config.json ذخیره می‌شوند؛ این فایل از Git مستثناست و مجوز دسترسی محدود دارد. پنل و پروکسی فقط روی localhost گوش می‌دهند و درخواست سایت‌های دیگر را رد می‌کنند.',
      'set.reset': 'بازنشانی تنظیمات',
      'set.resetConfirm': 'تمام تنظیمات و کلیدهای ذخیره‌شده پاک شوند؟',
      'set.resetDone': 'تنظیمات پایه بازنشانی شد.',

      'launch.sent': 'درخواست به CLI ارسال شد؛ Claude Code در ترمینال اجرا می‌شود.',
      'foot.made': 'ساخته‌شده با دقت برای Matixo · درگاه هوش مصنوعی محلی',

      'err.PORT_RANGE': 'پورت باید عددی بین 1024 تا 65535 باشد.',
      'err.PROVIDER_INVALID': 'ارائه‌دهنده انتخاب‌شده معتبر نیست.',
      'err.BAD_PROVIDER_ID': 'شناسه ارائه‌دهنده معتبر نیست.',
      'err.BAD_URL': 'Base URL باید با http:// یا https:// شروع شود.',
      'err.NO_KEY': 'برای این ارائه‌دهنده API Key ثبت نشده است.',
      'err.NO_BASE_URL': 'Base URL ارائه‌دهنده تنظیم نشده است.',
      'err.TEST_FIELDS': 'Provider، API Key و Base URL الزامی هستند.',
      'err.NO_LAUNCH_LISTENER': 'اجرا فقط وقتی کار می‌کند که پنل با `matixo launch` باز شده باشد. در غیر این صورت دستور eval "$(matixo env)" و بعد claude را بزن.',
      'err.FORBIDDEN': 'درخواست مسدود شد: پنل فقط از همین دستگاه درخواست می‌پذیرد.',
      'err.MODELS_FAILED': 'دریافت فهرست مدل‌ها از ارائه‌دهنده ممکن نشد.',
      'err.CONFIG_UNREADABLE': 'فایل تنظیمات قابل خواندن نیست.',
      'err.TIMEOUT': 'زمان اتصال تمام شد.',
      'err.network': 'ارتباط با سرور Matixo برقرار نشد. آیا هنوز اجراست؟',
      'err.generic': 'مشکلی پیش آمد: {msg}',
      'err.load': 'خطا در بارگذاری: {msg}'
    }
  };

  var STORAGE_KEY = 'matixo.lang';
  var lang = 'fa';
  try {
    var saved = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'fa') lang = saved;
  } catch (e) { /* حالت خصوصی مرورگر */ }

  function t(key, vars) {
    var s = (dict[lang] && dict[lang][key]);
    if (s === undefined) s = dict.en[key];
    if (s === undefined) s = key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return k in vars ? vars[k] : m; });
    return s;
  }
  function has(key) { return Object.prototype.hasOwnProperty.call(dict.en, key); }

  function applyDocument() {
    if (typeof document === 'undefined') return;
    var root = document.documentElement;
    root.lang = lang;
    root.dir = lang === 'fa' ? 'rtl' : 'ltr';
  }

  function apply(scope) {
    if (typeof document === 'undefined') return;
    scope = scope || document;
    var q = function (sel, fn) { Array.prototype.forEach.call(scope.querySelectorAll(sel), fn); };
    q('[data-i18n]', function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    q('[data-i18n-placeholder]', function (el) { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder'))); });
    q('[data-i18n-title]', function (el) { el.setAttribute('title', t(el.getAttribute('data-i18n-title'))); });
    q('[data-i18n-aria]', function (el) { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
    document.title = t('app.title');
    Array.prototype.forEach.call(document.querySelectorAll('[data-lang]'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-lang') === lang ? 'true' : 'false');
    });
  }

  function setLang(next) {
    if (next !== 'fa' && next !== 'en') return;
    lang = next;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* ignore */ }
    applyDocument();
    apply();
  }

  applyDocument();

  var api = {
    dict: dict, t: t, has: has, apply: apply, setLang: setLang,
    getLang: function () { return lang; },
    locale: function () { return lang === 'fa' ? 'fa-IR' : 'en-US'; },
    number: function (n) { return new Intl.NumberFormat(lang === 'fa' ? 'fa-IR' : 'en-US').format(n); }
  };
  if (typeof window !== 'undefined') window.MatixoI18n = api;
})();
