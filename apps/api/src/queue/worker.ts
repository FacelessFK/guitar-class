import { Logger } from "@nestjs/common";
import { Worker, type Job } from "bullmq";

import { createQueueConnection } from "./connection.js";
import {
  EXPIRE_HOLDS_JOB,
  MAINTENANCE_QUEUE,
  runMaintenance,
  type MaintenanceResult,
} from "./maintenance.job.js";
import {
  CLEANUP_MEDIA_JOB,
  MONTHLY_PAYOUTS_JOB,
  runCleanupMedia,
  runPayoutRun,
} from "./nightly.job.js";
import type { RetentionResult } from "../media/retention.service.js";
import type { PayoutRunResult } from "../payment/payout-run.service.js";
import {
  SEND_REMINDERS_JOB,
  runReminders,
  type ReminderResult,
} from "./reminder.job.js";
import {
  CLOSE_SESSIONS_JOB,
  runSessionClose,
  type SessionCloseResult,
} from "./session-close.job.js";

const logger = new Logger("Worker");

export type JobResult =
  | MaintenanceResult
  | (Omit<SessionCloseResult, "credited"> & { credited: string })
  | ReminderResult
  | RetentionResult
  | PayoutRunResult;

/**
 * جاب را به هندلرش می‌رساند.
 *
 * جابِ ناشناخته صریح خطا می‌دهد و بی‌صدا رد نمی‌شود. اگر نام جابی عوض
 * شود و یک طرف به‌روز نشود، باید همان‌جا سر و صدا کند نه اینکه کارها
 * بی‌صدا انجام نشوند.
 */
export async function processMaintenanceJob(job: Job): Promise<JobResult> {
  switch (job.name) {
    case EXPIRE_HOLDS_JOB:
      return runMaintenance();
    case CLOSE_SESSIONS_JOB: {
      const result = await runSessionClose();

      // BullMQ نتیجه‌ی هندلر را با JSON.stringify در Redis می‌نویسد و
      // bigint در JSON پشتیبانی نمی‌شود. مبلغ را دقیق و بدون تبدیل به
      // number (و خطر از دست رفتن دقت) به رشته تبدیل می‌کنیم.
      return { ...result, credited: result.credited.toString() };
    }
    case SEND_REMINDERS_JOB:
      return runReminders();
    case CLEANUP_MEDIA_JOB:
      return runCleanupMedia();
    case MONTHLY_PAYOUTS_JOB:
      return runPayoutRun();
    default:
      throw new Error(`جاب ناشناخته در صف ${MAINTENANCE_QUEUE}: «${job.name}»`);
  }
}

export function createMaintenanceWorker(): Worker {
  const worker = new Worker(MAINTENANCE_QUEUE, processMaintenanceJob, {
    connection: createQueueConnection(),
    /**
     * یک جاب در لحظه. جارو ایدمپوتنت است ولی موازی اجرا کردنش فقط
     * باعث می‌شود دو تراکنش سر همان سطرها با هم قفل بیفتند.
     */
    concurrency: 1,
  });

  worker.on("failed", (job, error) => {
    logger.error(`جاب «${job?.name ?? "?"}» شکست خورد: ${error.message}`, error.stack);
  });

  worker.on("error", (error) => {
    // خطای خود وُرکر (مثلاً قطع شدن ردیس)، نه خطای یک جاب
    logger.error(`خطای وُرکر: ${error.message}`);
  });

  return worker;
}
