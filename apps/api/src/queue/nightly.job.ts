import { Logger } from "@nestjs/common";

import { runRetention, type RetentionResult } from "../media/retention.service.js";
import { runMonthlyPayouts, type PayoutRunResult } from "../payment/payout-run.service.js";
import { SWEEPS, recordHeartbeat } from "./heartbeat.js";

/**
 * جاروهای شبانه.
 *
 * برخلاف سه جاروی دیگر که هر دقیقه اجرا می‌شوند، این دو شبی یک بار
 * کافی‌اند: هیچ‌کس منتظر نتیجه‌شان نیست و کارشان روی داده‌ای است که
 * روزها یا ماه‌ها قدیمی است. اجرای دقیقه‌ای فقط هر شبانه‌روز ۱۴۴۰ بار
 * کوئری‌ای می‌زد که تقریباً همیشه صفر سطر برمی‌گرداند.
 *
 * ⚠️ چون کند اجرا می‌شوند، آستانه‌ی کهنگیِ ضربانشان هم فرق دارد
 * (`heartbeat.ts`). با آستانه‌ی مشترکِ پنج دقیقه‌ای، سیستم بیست‌وسه ساعت
 * از هر شبانه‌روز `degraded` گزارش می‌شد.
 */

export const CLEANUP_MEDIA_JOB = SWEEPS.CLEANUP_MEDIA;
export const MONTHLY_PAYOUTS_JOB = SWEEPS.MONTHLY_PAYOUTS;

/**
 * ساعت اجرا، به وقت تهران.
 *
 * سه بامداد: کمترین ترافیک، و به‌اندازه‌ی کافی از نیمه‌شب دور که مرزِ
 * روزِ تقویمی مسئله‌ی این جاروها نباشد.
 */
export const NIGHTLY_CRON = "0 3 * * *";
export const NIGHTLY_TIMEZONE = "Asia/Tehran";

export async function runCleanupMedia(now: Date = new Date()): Promise<RetentionResult> {
  const logger = new Logger("Retention");

  const result = await runRetention(now);

  await recordHeartbeat(SWEEPS.CLEANUP_MEDIA, now);

  /**
   * برخلاف جاروهای دقیقه‌ای، این یکی حتی وقتی کاری نکرده هم لاگ می‌شود.
   *
   * آن‌ها هر دقیقه اجرا می‌شوند و لاگ خالی‌شان چیزهای مهم را دفن می‌کند.
   * این شبی یک خط است، و همان یک خط تنها نشانه‌ی بیرونیِ «سیاست
   * نگه‌داری واقعاً اجرا شد» است — چیزی که تا وقتی هزینه‌ی باکت بالا
   * نرفته، هیچ راه دیگری برای دیدنش نیست.
   */
  logger.log(
    `پاک‌سازی: ${result.submissions} اجرا، ${result.voiceNotes} بازخورد صوتی، ` +
      `${result.recordings} ضبط. ${result.failed} ناموفق.`,
  );

  return result;
}

export async function runPayoutRun(now: Date = new Date()): Promise<PayoutRunResult> {
  const result = await runMonthlyPayouts(now);

  await recordHeartbeat(SWEEPS.MONTHLY_PAYOUTS, now);

  return result;
}
