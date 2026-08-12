/**
 * متن پیامک‌ها و اعلان‌های درون‌اپ.
 *
 * جدا از سرویس نگه داشته می‌شود چون تنها جایی از بک‌اند است که زمان UTC
 * به ساعت دیواری تهران ترجمه می‌شود. پیامک و اعلان هر دو لایه‌ی نمایش‌اند
 * — متنشان همین‌جا ساخته می‌شود و فرانت فقط نشانش می‌دهد — پس تبدیل
 * اینجا مجاز است، و فقط اینجا.
 */

import {
  APP_TIMEZONE,
  formatMinutes,
  tehranDateKey,
  tehranMinutesOfDay,
  tehranWeekday,
  weekdayNameFa,
} from "@music/shared";

/**
 * «امروز»، «فردا»، یا نام روز هفته.
 *
 * تاریخ کامل عمداً نوشته نمی‌شود. یادآوری حداکثر یک روز جلوتر است، پس
 * «فردا شنبه ساعت ۱۷:۰۰» هم گویاتر است و هم بحث تقویم شمسی را از
 * بک‌اند بیرون نگه می‌دارد. اگر روزی یادآوری هفتگی اضافه شود، اینجا
 * جای درست برای افزودن تاریخ است.
 */
export function relativeDayFa(sessionAt: Date, now: Date): string {
  const today = tehranDateKey(now);
  const day = tehranDateKey(sessionAt);

  if (day === today) return "امروز";

  const tomorrow = tehranDateKey(new Date(now.getTime() + 24 * 60 * 60_000));
  if (day === tomorrow) return `فردا ${weekdayNameFa(tehranWeekday(sessionAt))}`;

  return weekdayNameFa(tehranWeekday(sessionAt));
}

export function tehranClock(instant: Date): string {
  return formatMinutes(tehranMinutesOfDay(instant));
}

/**
 * تاریخ شمسیِ روز و ماه — «۲۴ مرداد».
 *
 * هم‌تای `formatJalaliShort` در `apps/web/src/lib/format.ts` است و
 * عمداً تکرار شده: بردنش به پکیج مشترک یعنی قاعده‌ی «تبدیل شمسی فقط در
 * لایه‌ی نمایش» جایی بنشیند که منطق دامنه هم به آن دسترسی دارد، و
 * اولین محاسبه‌ای که تاریخ شمسی را ورودی بگیرد از همان‌جا شروع می‌شود.
 * دو نسخه‌ی کوچک در دو لایه‌ی نمایش، ارزان‌تر از آن در است.
 */
export function jalaliDayMonthFa(instant: Date): string {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    timeZone: APP_TIMEZONE,
    day: "numeric",
    month: "long",
  }).format(instant);
}

/**
 * «شنبه ۲۴ مرداد ساعت ۱۷:۰۰» — برای اعلانی که می‌تواند هفته‌ها فاصله
 * داشته باشد.
 *
 * `relativeDayFa` اینجا کافی نیست: یادآوری حداکثر یک روز جلوتر است و
 * «شنبه» در آن بی‌ابهام است، ولی رزروی که همین حالا برای سه هفته‌ی دیگر
 * قطعی شده هم «شنبه» است و هنرجو نمی‌داند کدام شنبه.
 *
 * نام روز از `WEEKDAY_NAMES_FA` می‌آید نه از `Intl`، به همان دلیل بقیه‌ی
 * پروژه: `Intl` «پنجشنبه» می‌نویسد و جدول ما «پنج‌شنبه» با نیم‌فاصله.
 */
export function sessionDateTimeFa(instant: Date): string {
  const weekday = weekdayNameFa(tehranWeekday(instant));

  return `${weekday} ${jalaliDayMonthFa(instant)} ساعت ${tehranClock(instant)}`;
}

export interface ReminderContext {
  /** «گیتار کلاسیک» */
  instrumentName: string;
  /** طرف مقابل: برای هنرجو نام استاد، برای استاد نام هنرجو */
  counterpartName: string;
  sessionAt: Date;
  now: Date;
}

/**
 * متن یادآوری.
 *
 * از «۲۴ ساعت دیگر» یا «یک ساعت دیگر» استفاده نمی‌کند و ساعت واقعی جلسه
 * را می‌گوید. دلیلش این است که جارو خودترمیم است: اگر وُرکر مدتی پایین
 * بوده باشد، یادآوری با تأخیر می‌رود و آن وقت «۲۴ ساعت دیگر» دروغ
 * می‌شود، ولی «فردا شنبه ساعت ۱۷:۰۰» همچنان درست است.
 */
export function sessionReminderText(context: ReminderContext): string {
  const when = `${relativeDayFa(context.sessionAt, context.now)} ساعت ${tehranClock(context.sessionAt)}`;

  return `یادآوری کلاس ${context.instrumentName} با ${context.counterpartName}، ${when}. ده دقیقه پیش از شروع اتاق باز می‌شود. هدفون سیمی یادتان نرود.`;
}
