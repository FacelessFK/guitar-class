import { Queue } from "bullmq";

import { createQueueConnection } from "./connection.js";
import {
  EXPIRE_HOLDS_INTERVAL_MS,
  EXPIRE_HOLDS_JOB,
  MAINTENANCE_QUEUE,
} from "./maintenance.job.js";
import {
  CLEANUP_MEDIA_JOB,
  MONTHLY_PAYOUTS_JOB,
  NIGHTLY_CRON,
  NIGHTLY_TIMEZONE,
} from "./nightly.job.js";
import { SEND_REMINDERS_INTERVAL_MS, SEND_REMINDERS_JOB } from "./reminder.job.js";
import {
  CLOSE_SESSIONS_INTERVAL_MS,
  CLOSE_SESSIONS_JOB,
} from "./session-close.job.js";

/**
 * جاروهای تکرارشونده — هر کدام زمان‌بند مستقل خودش را دارد.
 *
 * دو شکل زمان‌بندی: دقیقه‌ای‌ها با `every` و شبانه‌ها با `pattern`.
 * `every` برای جاروی شبانه کافی نبود چون از لحظه‌ی بالا آمدن وُرکر
 * می‌شمارد؛ یعنی ساعت اجرا با هر ری‌استارت جابه‌جا می‌شود و پاک‌سازی
 * می‌تواند وسط شلوغ‌ترین ساعت روز بیفتد.
 */
type Schedule =
  | { name: string; everyMs: number }
  | { name: string; pattern: string; tz: string };

const SCHEDULES: readonly Schedule[] = [
  { name: EXPIRE_HOLDS_JOB, everyMs: EXPIRE_HOLDS_INTERVAL_MS },
  { name: CLOSE_SESSIONS_JOB, everyMs: CLOSE_SESSIONS_INTERVAL_MS },
  { name: SEND_REMINDERS_JOB, everyMs: SEND_REMINDERS_INTERVAL_MS },
  { name: CLEANUP_MEDIA_JOB, pattern: NIGHTLY_CRON, tz: NIGHTLY_TIMEZONE },
  { name: MONTHLY_PAYOUTS_JOB, pattern: NIGHTLY_CRON, tz: NIGHTLY_TIMEZONE },
];

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
 * زمان‌بندِ جاب‌های تکرارشونده را ثبت می‌کند.
 *
 * `upsertJobScheduler` با شناسه‌ی ثابت صدا زده می‌شود، پس هر بار بالا
 * آمدن وُرکر همان زمان‌بند را به‌روز می‌کند و زمان‌بندهای موازی روی هم
 * انباشته نمی‌شوند. اگر با شناسه‌ی تصادفی ثبت می‌شد، هر ری‌استارت یک
 * زمان‌بندِ دیگر اضافه می‌کرد و جارو چند بار در دقیقه اجرا می‌شد.
 */
export async function registerSchedulers(queue: Queue = maintenanceQueue()): Promise<void> {
  for (const schedule of SCHEDULES) {
    const repeat =
      "everyMs" in schedule
        ? { every: schedule.everyMs }
        : { pattern: schedule.pattern, tz: schedule.tz };

    await queue.upsertJobScheduler(schedule.name, repeat, { name: schedule.name });
  }
}

/**
 * جاروهای شبانه را همین حالا یک بار در صف می‌گذارد.
 *
 * دو مسئله را با هم حل می‌کند و هر دو واقعی‌اند:
 *
 *   ۱. **وُرکری که در ساعت ۳ بامداد پایین بوده، اجرای آن شب را از دست
 *      داده و با کرونِ تنها باید تا فردا شب صبر کند.** کل استدلال «جارو
 *      و نه جابِ زمان‌بندی‌شده» (بخش ۸ سند) این است که هر اجرا
 *      عقب‌افتاده‌ها را هم برمی‌دارد؛ اجرای هنگام بالا آمدن، همان
 *      خاصیت را به جاروی شبانه هم می‌دهد.
 *   ۲. **بدون آن، `GET /health` پس از هر استقرار تا ۳ بامداد
 *      `degraded` می‌ماند** — چون ضربانِ شبانه هنوز ثبت نشده. هشداری که
 *      بعد از هر استقرار یک روز روشن است، خیلی زود نادیده گرفته می‌شود.
 *
 * اجرای اضافه بی‌ضرر است: هر دو جارو ایدمپوتنت‌اند و در حالت عادی صفر
 * سطر برمی‌دارند.
 */
export async function runNightlySweepsNow(
  queue: Queue = maintenanceQueue(),
): Promise<void> {
  for (const schedule of SCHEDULES) {
    if ("everyMs" in schedule) continue;
    await queue.add(schedule.name, {});
  }
}

export async function closeQueues(): Promise<void> {
  if (maintenance) {
    await maintenance.close();
    maintenance = undefined;
  }
}
