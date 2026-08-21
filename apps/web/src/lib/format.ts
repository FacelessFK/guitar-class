/**
 * قالب‌بندی برای نمایش.
 *
 * قاعده‌ی پروژه: دیتابیس ریال و UTC نگه می‌دارد، و تبدیل به تومان و به
 * وقت تهران **فقط اینجا** انجام می‌شود. هیچ‌کدام از این توابع نباید در
 * محاسبه استفاده شوند.
 */

import {
  fromTehranWallClock,
  weekdayNameFa,
  weekdayOfDateKey,
  type DateKey,
} from "@music/shared";

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

// ---------------------------------------------------------------------------
// تاریخ و ساعت
// ---------------------------------------------------------------------------

/**
 * تاریخ شمسی با `Intl` ساخته می‌شود، نه با کتابخانه‌ی جداگانه.
 *
 * سند معماری `date-fns-jalali` را پیشنهاد کرده بود، ولی تقویم فارسی از
 * سال‌ها پیش در خود `Intl` هست (`fa-IR-u-ca-persian`) و همان قواعد
 * CLDR را می‌خواند. یک وابستگی کمتر در باندلی که کاربر ایرانی روی
 * اینترنت کند دانلود می‌کند، و یک منبع کمتر برای اختلاف نام ماه‌ها.
 *
 * منطقه‌ی زمانی در همه‌ی این توابع صریح داده می‌شود. بدون آن، مرورگر
 * منطقه‌ی سیستم را می‌گیرد و کاربری که لپ‌تاپش روی UTC مانده، ساعت کلاس
 * را سه‌ونیم ساعت غلط می‌بیند.
 */
const TEHRAN = "Asia/Tehran";
const JALALI_LOCALE = "fa-IR-u-ca-persian";

/** ارقام لاتین داخل یک رشته را فارسی می‌کند: `"17:00"` → `«۱۷:۰۰»` */
export function faDigits(text: string): string {
  return text.replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]!);
}

/**
 * یک کلید تاریخ میلادی (`YYYY-MM-DD` به وقت تهران) را به لحظه‌ای در
 * همان روز تبدیل می‌کند.
 *
 * ظهر انتخاب شده نه نیمه‌شب: هر خطای یک‌ساعته‌ای در آینده — تغییر قانون
 * ساعت تابستانی — نیمه‌شب را به روز قبل می‌برد ولی ظهر را نه.
 */
function instantForDateKey(dateKey: DateKey): Date {
  return fromTehranWallClock(dateKey, 12 * 60);
}

/** «۲۴ مرداد ۱۴۰۵» */
export function formatJalaliDate(dateKey: DateKey): string {
  return new Intl.DateTimeFormat(JALALI_LOCALE, {
    timeZone: TEHRAN,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(instantForDateKey(dateKey));
}

/**
 * «شنبه ۲۴ مرداد» — برای سرستون تقویم که سال در آن تکراری است.
 *
 * نام روز از `WEEKDAY_NAMES_FA` پکیج مشترک می‌آید، نه از `Intl`.
 * دو منبع دو املا دارند: `Intl` «پنجشنبه» و «یکشنبه» می‌نویسد و جدول
 * ما «پنج‌شنبه» و «یک‌شنبه» با نیم‌فاصله. هر دو درست‌اند، ولی وقتی
 * فهرست قوانین هفتگی از یکی بخواند و انتخابگر تاریخ از دیگری، هر دو
 * املا در یک صفحه کنار هم دیده می‌شوند. جدول مشترک برنده است چون
 * جاهایی که فقط شماره‌ی روز هفته دارند (قوانین دسترس‌پذیری) راهی جز
 * آن ندارند.
 */
export function formatJalaliDayMonth(dateKey: DateKey): string {
  return `${weekdayNameFa(weekdayOfDateKey(dateKey))} ${formatJalaliShort(dateKey)}`;
}

/** «۲۴ مرداد» */
export function formatJalaliShort(dateKey: DateKey): string {
  return new Intl.DateTimeFormat(JALALI_LOCALE, {
    timeZone: TEHRAN,
    day: "numeric",
    month: "long",
  }).format(instantForDateKey(dateKey));
}

/** ساعت دیواری تهران از یک لحظه‌ی مطلق: «۱۷:۳۰» */
export function formatTehranTime(instant: Date | string): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;

  return new Intl.DateTimeFormat(JALALI_LOCALE, {
    timeZone: TEHRAN,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * شمارش معکوس: «۱۲:۳۴» یا «۲ ساعت و ۵ دقیقه».
 *
 * زیر یک ساعت به صورت دقیقه و ثانیه نشان داده می‌شود چون کاربر واقعاً
 * ثانیه‌ها را می‌شمارد (مهلت پرداخت، باز شدن اتاق)، و بالای آن ثانیه
 * فقط نویز است.
 */
export function formatCountdown(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));

  if (total >= 3600) {
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    return minutes === 0
      ? `${faNumber(hours)} ساعت`
      : `${faNumber(hours)} ساعت و ${faNumber(minutes)} دقیقه`;
  }

  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return faDigits(`${minutes}:${String(seconds).padStart(2, "0")}`);
}

/**
 * «۳ هفته پیش» — زمانِ نسبیِ گذشته، به فارسی.
 *
 * دانه‌دانگیِ درشت است (روز/هفته/ماه/سال) و عمداً: مصرف‌کننده‌اش صفحه‌ی
 * استاد است که SSG/ISR با بازتولید ساعتی رندر می‌شود، پس دقتِ دقیقه‌ای
 * تا بازتولید بعدی کهنه می‌شد. در این دانه‌دانگی، دریفتِ یک‌ساعته دیده
 * نمی‌شود.
 */
export function formatRelativeFa(instant: Date | string): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));

  const day = 86_400;
  if (seconds < day) return "امروز";
  const days = Math.floor(seconds / day);
  if (days < 7) return `${faNumber(days)} روز پیش`;
  if (days < 30) return `${faNumber(Math.floor(days / 7))} هفته پیش`;
  if (days < 365) return `${faNumber(Math.floor(days / 30))} ماه پیش`;
  return `${faNumber(Math.floor(days / 365))} سال پیش`;
}
