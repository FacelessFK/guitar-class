import { Logger } from "@nestjs/common";

import { expireStaleHolds } from "../booking/booking.service.js";
import { expireStalePendingOrders } from "../payment/payment.service.js";
import { recordHeartbeat } from "./heartbeat.js";

/**
 * جاب نگه‌داری: آزاد کردن اسلات‌هایی که مهلت پرداختشان تمام شده.
 *
 * بدون این، هر کسی فقط با باز کردن صفحه‌ی پرداخت و رها کردنش می‌تواند
 * برنامه‌ی یک استاد را برای همیشه مسدود کند. قید `EXCLUDE` رزروِ
 * `PENDING_PAYMENT` را اشغال‌کننده می‌شمارد، پس تا وقتی وضعیتش عوض
 * نشود اسلات به کسی نمی‌رسد.
 */

export const MAINTENANCE_QUEUE = "maintenance";
export const EXPIRE_HOLDS_JOB = "expire-holds";

/**
 * هر دقیقه یک بار.
 *
 * دقت یک‌دقیقه‌ای برای مهلت پانزده‌دقیقه‌ای کافی است و بار ناچیزی دارد:
 * هر اجرا دو `UPDATE` ایندکس‌دار است که در حالت عادی صفر سطر برمی‌گرداند
 * (`bookings_hold_expiry_idx` دقیقاً برای همین ساخته شده).
 */
export const EXPIRE_HOLDS_INTERVAL_MS = 60_000;

export interface MaintenanceResult {
  expiredBookings: number;
  failedOrders: number;
}

/**
 * جارو، نه جابِ زمان‌بندی‌شده به ازای هر رزرو.
 *
 * سند معماری این را «۱۵ دقیقه بعد از ساخت» نوشته بود، یعنی یک جاب
 * تأخیردار برای هر رزرو. عمداً به جارو تبدیل شد:
 *
 *   • جابِ گم‌شده یعنی اسلاتی که تا ابد قفل می‌ماند. ردیس پاک شود، یا
 *     رزرو در فاصله‌ی قطعی وُرکر ساخته شود، و آن اسلات دیگر هرگز آزاد
 *     نمی‌شود. جارو خودش را ترمیم می‌کند: هر اجرا همه‌ی موارد عقب‌افتاده
 *     را هم برمی‌دارد.
 *   • رزروهایی که پیش از وجود این وُرکر ساخته شده‌اند هم پاک می‌شوند.
 *   • دو تابعِ زیرین از قبل به شکل جارو نوشته شده‌اند و ایدمپوتنت‌اند،
 *     پس اجرای دوباره‌ی یک جاب هیچ ضرری ندارد.
 *
 * هزینه‌اش این است که آزاد شدن اسلات تا یک دقیقه تأخیر دارد. برای
 * سیستمی که کمترین فاصله‌ی رزرو تا کلاسش دو ساعت است، این چیزی نیست.
 */
export async function runMaintenance(now: Date = new Date()): Promise<MaintenanceResult> {
  const logger = new Logger("Maintenance");

  const [expiredBookings, failedOrders] = await Promise.all([
    expireStaleHolds(now),
    expireStalePendingOrders(now),
  ]);

  // بعد از کار ثبت می‌شود نه قبلش: ضربان باید بگوید جارو واقعاً تمام
  // شده، نه اینکه شروع شده و وسطش گیر کرده
  await recordHeartbeat(now);

  // فقط وقتی کاری انجام شده لاگ می‌شود؛ وگرنه هر دقیقه یک خط بی‌محتوا
  // در لاگ می‌نشیند و چیزهای مهم را دفن می‌کند.
  if (expiredBookings > 0 || failedOrders > 0) {
    logger.log(
      `${expiredBookings} رزرو منقضی شد و ${failedOrders} سفارش ناموفق علامت خورد.`,
    );
  }

  return { expiredBookings, failedOrders };
}
