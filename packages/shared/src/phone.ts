/**
 * نرمال‌سازی شماره‌ی موبایل ایران.
 *
 * شماره شناسه‌ی اصلی ورود است، پس هر شکلی که کاربر تایپ کند باید به یک
 * صورت متعارف تبدیل شود — وگرنه یک نفر با دو شکل نوشتن، دو حساب
 * می‌سازد و جلسه‌ی معارفه‌ی رایگان را دو بار می‌گیرد.
 *
 * در پکیج مشترک است چون فرم ثبت‌نام فرانت هم باید همین اعتبارسنجی را
 * پیش از ارسال انجام دهد.
 */

/** صورت متعارف: E.164، مثل `+989121234567`. */
export type NormalizedPhone = string;

/**
 * ارقام فارسی (۰۱۲۳۴۵۶۷۸۹) و عربی (٠١٢٣٤٥٦٧٨٩) را به لاتین تبدیل می‌کند.
 *
 * کاربر ایرانی با صفحه‌کلید فارسی تایپ می‌کند و شماره‌اش با ارقام فارسی
 * می‌آید. بدون این تبدیل، هیچ الگویی روی آن نمی‌خورد و کاربر پیام
 * «شماره نامعتبر است» می‌گیرد در حالی که شماره‌اش درست است.
 */
export function toLatinDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (char) => {
    const code = char.charCodeAt(0);
    // ۰ فارسی از U+06F0 و ٠ عربی از U+0660 شروع می‌شود
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

/**
 * پیش‌شماره‌های معتبر اپراتورهای موبایل ایران، بدون صفر ابتدایی.
 * همه با ۹ شروع می‌شوند و ۱۰ رقم‌اند.
 */
const IRANIAN_MOBILE_PATTERN = /^9\d{9}$/;

/**
 * شماره را به E.164 تبدیل می‌کند، یا اگر معتبر نبود `null` می‌دهد.
 *
 * شکل‌های پذیرفته‌شده — همه به `+989121234567` تبدیل می‌شوند:
 *   09121234567 · 9121234567 · +989121234567 · 00989121234567
 *   ۰۹۱۲۱۲۳۴۵۶۷ · 0912 123 4567 · 0912-123-4567
 */
export function normalizePhone(input: string): NormalizedPhone | null {
  if (typeof input !== "string") return null;

  // ارقام فارسی و عربی، سپس حذف فاصله و خط تیره و پرانتز
  let digits = toLatinDigits(input).replace(/[\s\-().]/g, "");

  if (digits.startsWith("+98")) {
    digits = digits.slice(3);
  } else if (digits.startsWith("0098")) {
    digits = digits.slice(4);
  } else if (digits.startsWith("98") && digits.length === 12) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  if (!IRANIAN_MOBILE_PATTERN.test(digits)) {
    return null;
  }

  return `+98${digits}`;
}

export function isValidIranianMobile(input: string): boolean {
  return normalizePhone(input) !== null;
}

/**
 * صورت متعارف را به شکل محلی برمی‌گرداند: `+989121234567` → `09121234567`.
 * فقط برای نمایش به کاربر — ذخیره‌سازی همیشه E.164 است.
 */
export function toLocalPhone(phone: NormalizedPhone): string {
  return phone.startsWith("+98") ? `0${phone.slice(3)}` : phone;
}

/**
 * شماره را برای نمایش در پیام‌ها می‌پوشاند: `0912***4567`.
 * در لاگ و در پاسخ‌های خطا استفاده می‌شود تا شماره‌ی کامل نشت نکند.
 */
export function maskPhone(phone: NormalizedPhone): string {
  const local = toLocalPhone(phone);
  if (local.length < 11) return local;
  return `${local.slice(0, 4)}***${local.slice(-4)}`;
}
