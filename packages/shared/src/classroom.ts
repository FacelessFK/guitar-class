/**
 * پنجره‌ی باز بودن اتاق کلاس.
 *
 * منطق خالص است تا فرانت هم بتواند بدون صدا زدن API بگوید «اتاق ۱۰
 * دقیقه‌ی دیگر باز می‌شود» و دکمه‌ی ورود را در لحظه‌ی درست فعال کند.
 *
 * ولی تصمیم واقعی همیشه سمت سرور گرفته می‌شود: API خارج از این پنجره
 * اصلاً توکن صادر نمی‌کند. یعنی جلو بردن ساعت مرورگر فقط دکمه را زودتر
 * روشن می‌کند، نه اینکه در اتاق را باز کند.
 */

import { BUSINESS_RULES } from "./enums";
import type { Interval } from "./interval";

const MINUTE_MS = 60_000;

/**
 * بازه‌ای که در آن ورود به اتاق مجاز است.
 *
 * مثل بقیه‌ی بازه‌های این پکیج نیم‌باز است: `[start, end)`. یعنی درست در
 * لحظه‌ی `end` اتاق دیگر باز نیست.
 */
export function roomWindow(session: Interval): Interval {
  return {
    start: session.start - BUSINESS_RULES.ROOM_OPEN_BEFORE_MINUTES * MINUTE_MS,
    end: session.end + BUSINESS_RULES.ROOM_OPEN_AFTER_MINUTES * MINUTE_MS,
  };
}

/**
 * سه حالت ممکن، نه یک بولین.
 *
 * «هنوز باز نشده» و «بسته شده» برای کاربر دو چیز کاملاً متفاوت‌اند: اولی
 * یعنی صبر کن، دومی یعنی این جلسه تمام شده. یک `false` مشترک، لایه‌ی
 * بالاتر را مجبور می‌کرد دوباره خودش زمان را مقایسه کند تا بفهمد کدام
 * پیام را نشان دهد.
 */
export type RoomState = "TOO_EARLY" | "OPEN" | "CLOSED";

export function roomState(session: Interval, now: number): RoomState {
  const window = roomWindow(session);

  if (now < window.start) return "TOO_EARLY";
  if (now >= window.end) return "CLOSED";
  return "OPEN";
}
