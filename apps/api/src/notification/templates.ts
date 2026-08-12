/**
 * متن پیامک‌ها.
 *
 * جدا از سرویس نگه داشته می‌شود چون تنها جایی از بک‌اند است که زمان UTC
 * به ساعت دیواری تهران ترجمه می‌شود. پیامک لایه‌ی نمایش است، پس تبدیل
 * اینجا مجاز است — و فقط اینجا.
 */

import {
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
