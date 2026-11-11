# Matixo|Claude

[English](README.en.md) · **فارسی**

درگاه محلی چندارائه‌دهنده‌ای برای استفاده از APIهای سازگار با OpenAI در Claude Code؛ همراه با داشبورد **دوزبانه (فارسی / English)**، ذخیره‌سازی محلی کلیدها و تبدیل Anthropic Messages API به OpenAI Chat Completions.

GitHub: [github.com/imatixofficel](https://github.com/imatixofficel)

> این پروژه یک لایه سازگاری است، نه پیاده‌سازی کامل تمام قابلیت‌های Anthropic. متن، تصویر، tool calling و streaming پشتیبانی می‌شوند؛ PDF، prompt caching، computer use و جزئیات اختصاصی Claude هنوز پشتیبانی کامل ندارند.

## امکانات

- داشبورد RTL/LTR با زبان فارسی و انگلیسی (انتخاب زبان ذخیره می‌شود) و فونت Vazirmatn که همراه پروژه است؛ بدون وابستگی به CDN و Google Fonts
- نمودار و جدول زنده‌ی درخواست‌ها (تعداد، خطا، تأخیر، توکن) — فقط در حافظه، چیزی روی دیسک نوشته نمی‌شود
- دریافت فهرست زنده‌ی مدل‌ها از ارائه‌دهنده و امکان تایپ هر نام مدل
- افزودن چند ارائه‌دهنده‌ی سفارشی با نام دلخواه
- مسیریابی هوشمند: درخواست‌های Haiku به «مدل سریع» و بقیه به «مدل اصلی» می‌روند
- اصلاح خودکار `max_tokens` وقتی بیشتر از سقف مدل باشد، و پشتیبانی از مدل‌های `o`-series / `gpt-5` (`max_completion_tokens`)
- محافظت در برابر درخواست سایت‌های دیگر (CSRF / DNS-rebinding) برای پنل محلی
- تست خودکار (۵۰+ تست) و GitHub Actions

## پیش‌نیازها

- Node.js نسخه 18.17 یا بالاتر (نسخه 20 یا 22 پیشنهاد می‌شود)
- Claude Code نصب و قابل اجرا با دستور `claude`
- API Key معتبر از یک ارائه‌دهنده سازگار

## نصب

مستقیم از GitHub:

```bash
npm install -g git+https://github.com/imatixofficel/matixo-claude.git
matixo
```

یا از سورس:

```bash
git clone https://github.com/imatixofficel/matixo-claude.git
cd matixo-claude
npm install
npm link
```

## شروع سریع

```bash
matixo
```

پنل در مرورگر باز می‌شود (`http://127.0.0.1:3456`). در بخش «ارائه‌دهنده‌ها» کلید و Base URL را ثبت کن؛ در بخش «مدل‌ها» مدل اصلی و سریع را انتخاب کن. برای اجرای Claude Code از دکمه‌ی پنل:

```bash
matixo launch
```

### فرمان‌ها

| فرمان | کاربرد |
|---|---|
| `matixo` | اجرای سرور و بازکردن پنل |
| `matixo start [-p پورت]` | اجرای فقط سرور (پورت فقط برای همین اجرا) |
| `matixo launch [-p پورت]` | بازکردن پنل و انتظار برای فرمان اجرای Claude Code |
| `matixo config` | نمایش تنظیمات (کلیدها ماسک می‌شوند) |
| `matixo reset` | بازنشانی تنظیمات و کلیدها |
| `matixo env [-s bash\|powershell\|cmd]` | چاپ متغیرهای محیطی Claude Code |

بدون `launch`، متغیرها را خودت بارگذاری کن:

```bash
# Bash / Zsh
eval "$(matixo env)" && claude

# PowerShell (ویندوز)
matixo env --shell powershell | Invoke-Expression; claude
```

## ارائه‌دهنده‌ها

| ارائه‌دهنده | Base URL پیش‌فرض |
|---|---|
| OpenAI | `https://api.openai.com/v1` |
| DeepSeek | `https://api.deepseek.com/v1` |
| OpenRouter | `https://openrouter.ai/api/v1` |
| Groq | `https://api.groq.com/openai/v1` |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` |
| سفارشی | هر API سازگار با OpenAI |

فهرست مدل‌های پیشنهادی ممکن است قدیمی شود؛ از دکمه‌ی «دریافت فهرست زنده» در صفحه‌ی مدل‌ها استفاده کن یا نام دقیق مدل را تایپ کن.

## متغیرهای محیطی (اختیاری)

`MATIXO_PORT` · `MATIXO_AUTH_TOKEN` · `MATIXO_DATA_DIR` — نمونه در `.env.example`.

## API پروکسی

- `POST /v1/messages` — تبدیل Anthropic Messages به Chat Completions (stream و غیر stream)
- `GET /v1/models` — مدل‌های اصلی و سریع
- `POST /v1/messages/count_tokens` — تخمین تعداد توکن
- `GET /health` — وضعیت سرور

پروکسی از `x-api-key` یا `Authorization: Bearer ...` برای توکن محلی استفاده می‌کند (پیش‌فرض `matixo-local`).

## ذخیره‌سازی و امنیت

- تنظیمات در `data/config.json` (در `.gitignore`)؛ پوشه با مجوز `700` و فایل با `600`.
- سرور فقط روی `127.0.0.1` گوش می‌دهد و درخواست با `Host` یا `Origin` غیرمحلی را رد می‌کند. با این حال آن را روی شبکه‌ی عمومی expose نکن.
- کلیدها هرگز به مرورگر برگردانده نمی‌شوند (فقط نسخه‌ی ماسک‌شده).
- JSON محلی رمزنگاری نشده است؛ از رمزگذاری دیسک/حساب کاربری امن استفاده کن.

## عیب‌یابی

- `401 Invalid Matixo local token`: `ANTHROPIC_AUTH_TOKEN` باید با توکن محلی یکی باشد (`matixo env` همه را درست تنظیم می‌کند).
- `Connection refused`: سرور Matixo اجرا نیست یا پورت اشغال است (`matixo start --port 4000`).
- `401/403` از ارائه‌دهنده: کلید، دسترسی مدل و Base URL را بررسی کن.
- `404` از ارائه‌دهنده: مسیر `/chat/completions` یا سازگاری OpenAI را بررسی کن.
- دکمه‌ی اجرا در پنل فقط با `matixo launch` کار می‌کند؛ در غیر این صورت `eval "$(matixo env)"` و سپس `claude`.

## محدودیت‌های شناخته‌شده

- فقط APIهای سازگار با OpenAI؛ APIهای بومی Gemini و… مستقیم پشتیبانی نمی‌شوند.
- PDF، extended thinking، prompt caching و batch تبدیل نمی‌شوند؛ تصویر داخل نتیجه‌ی ابزارها نادیده گرفته می‌شود.
- شمارش توکن تقریبی است.

## توسعه و تست

```bash
npm install
npm test        # ۵۰+ تست: تبدیل پروتکل، streaming، امنیت، دوزبانه‌بودن، رابط کاربری
npm run dev
```

## لایسنس

MIT. فونت‌های Vazirmatn تحت لایسنس OFL منتشر شده‌اند.
