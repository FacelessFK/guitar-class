/**
 * قالب‌بندی برای نمایش.
 *
 * قاعده‌ی پروژه: دیتابیس ریال و UTC نگه می‌دارد، و تبدیل به تومان و به
 * وقت تهران **فقط اینجا** انجام می‌شود. هیچ‌کدام از این توابع نباید در
 * محاسبه استفاده شوند.
 */

/**
 * ریال به تومان.
 *
 * قیمت‌ها در دیتابیس ریال‌اند ولی هیچ ایرانی‌ای قیمت را به ریال
 * نمی‌خواند. تقسیم روی `bigint` انجام می‌شود نه `number`: مبالغ بزرگ‌تر
 * از حد امن `number` هستند و ممیز شناور در مسیر پول ممنوع است.
 */
export function rialToToman(rial: string | bigint): bigint {
  return BigInt(rial) / 10n;
}

/** جداکننده‌ی هزارگان با ارقام فارسی. */
export function formatToman(rial: string | bigint): string {
  return new Intl.NumberFormat("fa-IR").format(rialToToman(rial));
}

/** «۴۵ دقیقه» */
export function formatDuration(minutes: number): string {
  return `${new Intl.NumberFormat("fa-IR").format(minutes)} دقیقه`;
}

/** ارقام فارسی برای عددهای ساده مثل سال سابقه. */
export function faNumber(value: number): string {
  return new Intl.NumberFormat("fa-IR").format(value);
}

/**
 * ارزان‌ترین قیمت میان سرویس‌های یک استاد — برای «شروع از ...».
 *
 * `null` یعنی استاد سرویس فعالی ندارد و اصلاً نباید قیمتی نشان داده شود.
 */
export function lowestPrice(prices: readonly string[]): string | null {
  if (prices.length === 0) return null;

  return prices
    .map((price) => BigInt(price))
    .reduce((min, price) => (price < min ? price : min))
    .toString();
}
