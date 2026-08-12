/**
 * اصول زمان در این پروژه
 * ---------------------------------------------------------------
 * ۱. هر زمانی که ذخیره یا جابه‌جا می‌شود، UTC است (`Date` استاندارد).
 * ۲. «ساعت دیواری» تهران فقط در دو جا معنا دارد: ورودی استاد برای
 *    تعریف دسترس‌پذیری، و خروجی نمایش به کاربر.
 * ۳. ساعت‌های روز به صورت «دقیقه از نیمه‌شب» (۰ تا ۱۴۳۹) نگه‌داری
 *    می‌شوند، نه تایپ `time` دیتابیس. دلیل: محاسبات بازه‌ای روی عدد
 *    صحیح ساده و بدون ابهام منطقه‌ی زمانی است.
 */

/**
 * ایران از سال ۱۴۰۱ ساعت تابستانی را حذف کرده، پس آفست ثابت +۰۳:۳۰ است.
 *
 * این یک ساده‌سازی عمدی است که محاسبات را به حساب صحیح تبدیل می‌کند.
 * اگر روزی ساعت تابستانی برگردد، این ثابت غلط می‌شود — به همین دلیل
 * تستی وجود دارد که آن را با پایگاه‌داده‌ی منطقه‌ی زمانی سیستم
 * مقایسه می‌کند و در صورت تغییر قانون، با شکست هشدار می‌دهد.
 */
export const TEHRAN_OFFSET_MINUTES = 210;

export const APP_TIMEZONE = "Asia/Tehran";

export const MINUTES_PER_DAY = 1440;

/**
 * روزهای هفته با شماره‌گذاری ایرانی: شنبه = ۰ تا جمعه = ۶.
 * عمداً با `Date.getUTCDay()` جاوااسکریپت (یکشنبه = ۰) متفاوت است،
 * چون کل محصول فارسی است و هفته از شنبه شروع می‌شود.
 */
export const Weekday = {
  SATURDAY: 0,
  SUNDAY: 1,
  MONDAY: 2,
  TUESDAY: 3,
  WEDNESDAY: 4,
  THURSDAY: 5,
  FRIDAY: 6,
} as const;

export type Weekday = (typeof Weekday)[keyof typeof Weekday];

export const WEEKDAY_NAMES_FA: readonly string[] = [
  "شنبه",
  "یک‌شنبه",
  "دوشنبه",
  "سه‌شنبه",
  "چهارشنبه",
  "پنج‌شنبه",
  "جمعه",
];

export function weekdayNameFa(weekday: number): string {
  return WEEKDAY_NAMES_FA[weekday] ?? "";
}

/** کلید تاریخ به شکل `YYYY-MM-DD` در تقویم میلادی، به وقت تهران. */
export type DateKey = string;

/**
 * یک `Date` را چنان جابه‌جا می‌کند که فیلدهای UTC آن، ساعت دیواری تهران
 * را نشان دهند. ترفند استاندارد برای کار با یک منطقه‌ی زمانی ثابت.
 * خروجی یک لحظه‌ی معتبر در زمان **نیست** و فقط برای خواندن فیلدها است.
 */
function shiftToTehranFields(utc: Date): Date {
  return new Date(utc.getTime() + TEHRAN_OFFSET_MINUTES * 60_000);
}

/** روز هفته‌ی ایرانی (شنبه = ۰) برای یک لحظه‌ی UTC، بر اساس تقویم تهران. */
export function tehranWeekday(utc: Date): Weekday {
  const shifted = shiftToTehranFields(utc);
  // getUTCDay: یک‌شنبه = ۰ ... شنبه = ۶  →  شنبه = ۰ ... جمعه = ۶
  return ((shifted.getUTCDay() + 1) % 7) as Weekday;
}

/** دقیقه از نیمه‌شب به وقت تهران (۰ تا ۱۴۳۹). */
export function tehranMinutesOfDay(utc: Date): number {
  const shifted = shiftToTehranFields(utc);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

/** کلید تاریخ میلادی به وقت تهران، مثلاً `2026-08-10`. */
export function tehranDateKey(utc: Date): DateKey {
  const shifted = shiftToTehranFields(utc);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * از ساعت دیواری تهران به لحظه‌ی UTC.
 * `minutesOfDay` می‌تواند بیرون از بازه‌ی ۰ تا ۱۴۳۹ باشد و آن‌گاه به روز
 * قبل یا بعد سرریز می‌کند — این رفتار عمدی است و برای محاسبه‌ی پایان
 * جلسه‌ای که از نیمه‌شب رد می‌شود لازم است.
 */
export function fromTehranWallClock(dateKey: DateKey, minutesOfDay: number): Date {
  const parts = dateKey.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error(`کلید تاریخ نامعتبر است: ${dateKey}`);
  }

  const tehranWallClockAsUtc = Date.UTC(year, month - 1, day) + minutesOfDay * 60_000;
  return new Date(tehranWallClockAsUtc - TEHRAN_OFFSET_MINUTES * 60_000);
}

/** `n` روز به یک کلید تاریخ اضافه می‌کند. */
export function addDaysToDateKey(dateKey: DateKey, days: number): DateKey {
  const parts = dateKey.split("-");
  const base = Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const moved = new Date(base + days * 24 * 60 * 60_000);
  const y = moved.getUTCFullYear();
  const m = String(moved.getUTCMonth() + 1).padStart(2, "0");
  const d = String(moved.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** روز هفته‌ی ایرانی برای یک کلید تاریخ. */
export function weekdayOfDateKey(dateKey: DateKey): Weekday {
  const parts = dateKey.split("-");
  const utc = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
  return ((utc.getUTCDay() + 1) % 7) as Weekday;
}

/** فهرست کلیدهای تاریخ از `from` تا `to`، هر دو شامل. */
export function dateKeyRange(from: DateKey, to: DateKey): DateKey[] {
  const out: DateKey[] = [];
  let cursor = from;
  // سقف ایمنی تا حلقه‌ی بی‌پایان روی ورودی بد رخ ندهد
  for (let i = 0; i < 400 && cursor <= to; i++) {
    out.push(cursor);
    cursor = addDaysToDateKey(cursor, 1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// ماه شمسی — برای دوره‌های مالی
// ---------------------------------------------------------------------------

/**
 * تقویم شمسی از خود `Intl` گرفته می‌شود، نه از یک کتابخانه.
 *
 * همان تصمیمی که در `apps/web/src/lib/format.ts` گرفته شد: تقویم فارسی
 * سال‌هاست در `Intl` هست و قواعد کبیسه‌اش را درست پیاده کرده. آوردن
 * `date-fns-jalali` فقط برای گرفتن شماره‌ی ماه، یک وابستگی و یک منبع
 * دوم حقیقت اضافه می‌کرد.
 *
 * ⚠️ برخلاف لایه‌ی نمایش، اینجا `en-US` است نه `fa-IR`: خروجی باید عدد
 * لاتین باشد تا `Number()` بخواندش. با `fa-IR` ارقام فارسی برمی‌گردند و
 * `Number("۱۴۰۵")` مقدار `NaN` می‌دهد.
 */
const PERSIAN_PARTS = new Intl.DateTimeFormat("en-US-u-ca-persian", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  timeZone: APP_TIMEZONE,
});

export interface PersianDate {
  year: number;
  month: number;
  day: number;
}

/** تاریخ شمسی یک کلید تاریخ میلادی. */
export function persianDateOf(dateKey: DateKey): PersianDate {
  // ظهر گرفته می‌شود نه نیمه‌شب: با نیمه‌شب، هر خطای کوچکِ گردکردن یا
  // آفست می‌تواند تاریخ را یک روز جابه‌جا کند
  const parts = PERSIAN_PARTS.formatToParts(fromTehranWallClock(dateKey, 12 * 60));
  const value = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value);

  return { year: value("year"), month: value("month"), day: value("day") };
}

export interface DateRange {
  /** هر دو شامل‌اند */
  start: DateKey;
  end: DateKey;
}

/**
 * بازه‌ی ماه شمسیِ **پیش از** ماهی که این تاریخ در آن است.
 *
 * دوره‌ی تسویه ماه شمسی است نه میلادی، چون عددی است که استاد می‌خواند:
 * «تسویه‌ی مرداد» معنا دارد ولی بازه‌ای که از ۱۰ مرداد تا ۹ شهریور
 * می‌رود، در پنلی که تاریخ‌ها را شمسی نشان می‌دهد شبیه باگ به نظر
 * می‌رسد.
 *
 * حساب کردنش با شمردن روز به عقب انجام می‌شود نه با جدول طول ماه‌ها:
 * ماه‌های شمسی ۲۹، ۳۰ یا ۳۱ روزند و سال کبیسه‌شان قاعده‌ی خودش را دارد.
 * «برو عقب تا روزِ ماه یک شود» هر دو را بدون دانستنشان درست حساب می‌کند.
 */
export function previousPersianMonthRange(dateKey: DateKey): DateRange {
  const firstOfThisMonth = addDaysToDateKey(dateKey, 1 - persianDateOf(dateKey).day);
  const end = addDaysToDateKey(firstOfThisMonth, -1);
  const start = addDaysToDateKey(end, 1 - persianDateOf(end).day);

  return { start, end };
}

/** `۹۹۰` → `"16:30"` */
export function formatMinutes(minutesOfDay: number): string {
  const h = Math.floor(minutesOfDay / 60);
  const m = minutesOfDay % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** `"16:30"` → `۹۹۰` */
export function parseTimeToMinutes(time: string): number {
  const parts = time.split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    throw new Error(`ساعت نامعتبر است: ${time}`);
  }
  return h * 60 + m;
}
