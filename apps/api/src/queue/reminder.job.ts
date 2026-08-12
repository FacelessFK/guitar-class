import { Logger } from "@nestjs/common";

import {
  dispatchDueReminders,
  scheduleDueReminders,
} from "../notification/reminder.service.js";
import { SWEEPS, recordHeartbeat } from "./heartbeat.js";

/**
 * یادآوری پیامکی ۲۴ و ۱ ساعت پیش از جلسه.
 *
 * سند معماری این را «زمان‌بندی‌شده» نوشته بود — یعنی دو جاب تأخیردار به
 * ازای هر رزرو. مثل جاروی مهلت پرداخت به جارو تبدیل شد و دلیلش همان
 * است (بخش ۸): جابِ تأخیردار در ردیس زندگی می‌کند و ردیس حافظه است.
 * پاک شدنش یعنی هیچ‌کس یادآوری نمی‌گیرد و هیچ‌جا معلوم نمی‌شود. جارو
 * حقیقت را از جدول رزروها می‌خواند، پس بعد از هر قطعی خودش را ترمیم
 * می‌کند.
 *
 * ضمناً لغو جلسه هیچ کار اضافه‌ای لازم ندارد: جابِ تأخیردار باید پیدا و
 * حذف می‌شد، ولی جارو جلسه‌ی لغوشده را از اول نمی‌بیند.
 */

export const SEND_REMINDERS_JOB = SWEEPS.SEND_REMINDERS;

/**
 * هر دقیقه یک بار.
 *
 * یعنی یادآوری حداکثر یک دقیقه دیرتر از موعدش می‌رسد؛ برای پیامکی که
 * ۲۴ ساعت یا یک ساعت مانده می‌رود، بی‌معناست. با فاصله‌ی بیشتر (مثلاً
 * پنج دقیقه) صرفه‌جویی واقعی‌ای هم نمی‌شد، چون هر اجرا دو کوئری
 * ایندکس‌دار است.
 */
export const SEND_REMINDERS_INTERVAL_MS = 60_000;

export interface ReminderResult {
  /** سطرهای تازه‌ای که موعدشان رسیده */
  scheduled: number;
  sent: number;
  failed: number;
}

export async function runReminders(now: Date = new Date()): Promise<ReminderResult> {
  const logger = new Logger("Reminder");

  const scheduled = await scheduleDueReminders(now);
  const { sent, failed } = await dispatchDueReminders(now);

  await recordHeartbeat(SWEEPS.SEND_REMINDERS, now);

  if (sent > 0 || failed > 0) {
    logger.log(`${sent} یادآوری فرستاده شد و ${failed} ناموفق بود.`);
  }

  return { scheduled, sent, failed };
}
