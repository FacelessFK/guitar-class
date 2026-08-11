import { Queue } from "bullmq";

import { createQueueConnection } from "./connection.js";
import {
  EXPIRE_HOLDS_INTERVAL_MS,
  EXPIRE_HOLDS_JOB,
  MAINTENANCE_QUEUE,
} from "./maintenance.job.js";

/**
 * صف‌ها.
 *
 * تولیدکننده و مصرف‌کننده جدا هستند: API فقط صف را می‌شناسد و وُرکر در
 * پروسه‌ی خودش جاب‌ها را برمی‌دارد. یعنی یک جاب سنگین یا یک حلقه‌ی
 * بی‌پایان در وُرکر، پاسخ‌گویی API را نمی‌خواباند.
 */

let maintenance: Queue | undefined;

export function maintenanceQueue(): Queue {
  maintenance ??= new Queue(MAINTENANCE_QUEUE, {
    connection: createQueueConnection(),
    defaultJobOptions: {
      /**
       * جاب‌های موفق نگه داشته نمی‌شوند. این جاب هر دقیقه اجرا می‌شود؛
       * نگه داشتنشان یعنی ردیس با تاریخچه‌ی بی‌مصرف پر شود.
       * جاب‌های شکست‌خورده می‌مانند — آن‌ها همان چیزی هستند که باید دیده
       * شوند.
       */
      removeOnComplete: true,
      removeOnFail: { count: 100 },
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
    },
  });

  return maintenance;
}

/**
 * زمان‌بندِ جاب تکرارشونده را ثبت می‌کند.
 *
 * `upsertJobScheduler` با شناسه‌ی ثابت صدا زده می‌شود، پس هر بار بالا
 * آمدن وُرکر همان زمان‌بند را به‌روز می‌کند و زمان‌بندهای موازی روی هم
 * انباشته نمی‌شوند. اگر با شناسه‌ی تصادفی ثبت می‌شد، هر ری‌استارت یک
 * زمان‌بندِ دیگر اضافه می‌کرد و جارو چند بار در دقیقه اجرا می‌شد.
 */
export async function registerSchedulers(queue: Queue = maintenanceQueue()): Promise<void> {
  await queue.upsertJobScheduler(
    EXPIRE_HOLDS_JOB,
    { every: EXPIRE_HOLDS_INTERVAL_MS },
    { name: EXPIRE_HOLDS_JOB },
  );
}

export async function closeQueues(): Promise<void> {
  if (maintenance) {
    await maintenance.close();
    maintenance = undefined;
  }
}
