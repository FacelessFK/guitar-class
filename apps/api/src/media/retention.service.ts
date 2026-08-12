/**
 * سیاست نگه‌داری فایل.
 *
 * هزینه‌ی آبجکت‌استوریج خطی است و هیچ‌وقت خودش متوقف نمی‌شود. با ۸۰۰
 * جلسه در ماه و کلیپ ۲۰ مگابایتی، اجراهای هنرجو ماهی حدود ۱۶ گیگابایت
 * اضافه می‌کنند — و بدون سیاست پاک‌سازی، این عدد فقط جمع می‌شود.
 * (سند معماری، بخش ۴.۶)
 *
 * **قاعده‌ی مرکزی: فایل می‌رود، سطر می‌ماند.**
 *
 * حذف سطر ساده‌تر بود ولی تاریخچه‌ی یادگیری را سوراخ می‌کند: بازخورد
 * استاد به اجرایی وصل می‌ماند که دیگر وجود ندارد، و فهرست تمرین‌های
 * هنرجو بی‌آنکه توضیحی بدهد کوتاه می‌شود. با ماندن سطر و گذاشتن
 * `purged_at`، صفحه می‌تواند صریح بگوید «فایل طبق سیاست نگه‌داری پاک
 * شد» — که واقعیت است، در برابر پخش‌کننده‌ی خرابی که مثل باگ به نظر
 * می‌رسد و پشتیبانی می‌گیرد.
 */

import { Logger } from "@nestjs/common";
import { and, asc, eq, isNull, lt, sql } from "drizzle-orm";

import { db } from "../db/client.js";
import { feedbacks, recordings, submissions } from "../db/schema/index.js";
import { objectStorage } from "./storage.port.js";

/**
 * چند روز اجرای هنرجو نگه داشته می‌شود.
 *
 * سند برای ضبط جلسه ۹۰ روز گفته ولی برای اجرای هنرجو چیزی نگفته بود.
 * شش ماه انتخاب شد چون یک دوره‌ی کامل یادگیری را می‌پوشاند: هنرجو
 * می‌تواند اجرای امروزش را با آنچه پاییز پیش فرستاده مقایسه کند، که
 * دقیقاً همان چیزی است که او را روی پلتفرم نگه می‌دارد. در حالت پایدار
 * حدود ۹۶ گیگابایت می‌شود.
 */
const DEFAULT_SUBMISSION_RETENTION_DAYS = 180;

export function submissionRetentionDays(): number {
  const raw = Number(process.env.SUBMISSION_RETENTION_DAYS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_SUBMISSION_RETENTION_DAYS;
}

/**
 * سقف پاک‌سازی در هر اجرا.
 *
 * هر حذف یک درخواست شبکه به سرویس است. بدون سقف، اولین اجرا پس از
 * روشن شدن این سیاست می‌تواند ده‌ها هزار درخواست پشت سر هم بفرستد و
 * سرویس آن را محدود کند. جارو هر شب اجرا می‌شود، پس عقب‌ماندگی
 * خودبه‌خود و بی‌سر و صدا جبران می‌شود.
 */
const PURGE_BATCH = 500;

const DAY_MS = 24 * 60 * 60_000;

export interface RetentionResult {
  submissions: number;
  voiceNotes: number;
  recordings: number;
  /** حذف‌هایی که سرویس رد کرد — سطرشان دست‌نخورده می‌ماند */
  failed: number;
}

/**
 * یک آبجکت را پاک می‌کند و می‌گوید موفق بود یا نه.
 *
 * خطا بالا نمی‌رود چون یک فایلِ پاک‌نشدنی نباید بقیه‌ی جارو را متوقف
 * کند. ولی **سطر هم علامت نمی‌خورد**: تا وقتی فایل واقعاً نرفته،
 * `purged_at` گذاشتن یعنی دروغی که هیچ اجرای بعدی‌ای اصلاحش نمی‌کند و
 * فایل تا ابد در باکت می‌ماند بی‌آنکه کسی دنبالش بگردد.
 */
async function purgeObject(objectKey: string, logger: Logger): Promise<boolean> {
  try {
    await objectStorage().deleteObject(objectKey);
    return true;
  } catch (error) {
    logger.warn(
      `پاک کردن ${objectKey} شکست خورد: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

/**
 * اجراهایی که از مدت نگه‌داری گذشته‌اند.
 *
 * ترتیب «اول فایل، بعد سطر» عمدی است و بدترین حالتش را انتخاب می‌کند:
 * اگر پروسه بین این دو بمیرد، فایل رفته و سطر هنوز علامت نخورده، پس
 * اجرای بعدی دوباره تلاش می‌کند و حذفِ چیزِ نبوده بی‌خطر است
 * (`deleteObject` ایدمپوتنت است). ترتیب برعکس یعنی سطر علامت‌خورده و
 * فایلی که تا ابد می‌ماند و هیچ‌کس دیگر سراغش نمی‌رود.
 */
async function purgeExpiredSubmissions(
  before: Date,
  logger: Logger,
): Promise<{ purged: number; failed: number }> {
  const due = await db
    .select({ id: submissions.id, objectKey: submissions.objectKey })
    .from(submissions)
    .where(and(isNull(submissions.mediaPurgedAt), lt(submissions.createdAt, before)))
    .orderBy(asc(submissions.createdAt))
    .limit(PURGE_BATCH);

  let purged = 0;
  let failed = 0;

  for (const row of due) {
    if (!(await purgeObject(row.objectKey, logger))) {
      failed += 1;
      continue;
    }

    await db
      .update(submissions)
      .set({ mediaPurgedAt: new Date() })
      .where(eq(submissions.id, row.id));

    purged += 1;
  }

  return { purged, failed };
}

/**
 * بازخورد صوتیِ اجرایی که خودش پاک شده.
 *
 * به عمر خودش بند نیست بلکه به اجرایی که درباره‌اش است: بازخورد صوتی
 * حدود سه مگابایت است و نگه داشتنش تقریباً رایگان، ولی بازخوردی که
 * درباره‌ی فایلِ رفته حرف می‌زند («اینجا که این آکورد را زدی…») بدون آن
 * فایل بی‌معناست. پس با هم می‌روند.
 *
 * ⚠️ `voice_note_url` **پاک نمی‌شود**، فقط `voice_purged_at` گذاشته
 * می‌شود. قید `feedbacks_has_content` می‌گوید بازخورد باید متن یا صدا
 * داشته باشد؛ خالی کردن نشانی روی بازخوردی که فقط صوتی بوده، آن قید را
 * می‌شکند و کل جارو را با خطای دیتابیس می‌خواباند.
 */
async function purgeOrphanVoiceNotes(
  logger: Logger,
): Promise<{ purged: number; failed: number }> {
  const due = await db
    .select({ id: feedbacks.id, objectKey: feedbacks.voiceObjectKey })
    .from(feedbacks)
    .innerJoin(submissions, eq(submissions.id, feedbacks.submissionId))
    .where(
      and(
        isNull(feedbacks.voicePurgedAt),
        sql`${feedbacks.voiceObjectKey} IS NOT NULL`,
        sql`${submissions.mediaPurgedAt} IS NOT NULL`,
      ),
    )
    .limit(PURGE_BATCH);

  let purged = 0;
  let failed = 0;

  for (const row of due) {
    if (!row.objectKey) continue;

    if (!(await purgeObject(row.objectKey, logger))) {
      failed += 1;
      continue;
    }

    await db
      .update(feedbacks)
      .set({ voicePurgedAt: new Date() })
      .where(eq(feedbacks.id, row.id));

    purged += 1;
  }

  return { purged, failed };
}

/**
 * ضبط‌های منقضی.
 *
 * برخلاف دو تای بالا، مهلتش روی خود سطر است (`expires_at`) نه از یک
 * عدد سراسری: ضبط قابلیت پولی فاز بعد است و مدت نگه‌داری‌اش می‌تواند
 * به پلن فروخته‌شده بند باشد. جدول هنوز تولیدکننده‌ای ندارد، ولی جارو
 * از حالا هست تا روزی که تولیدکننده بیاید، مصرف‌کننده‌اش از قبل کار
 * کرده باشد — همان اشتباهی که با `expireStaleHolds` شد، برعکس.
 */
async function purgeExpiredRecordings(
  now: Date,
  logger: Logger,
): Promise<{ purged: number; failed: number }> {
  const due = await db
    .select({ id: recordings.id, objectKey: recordings.objectKey })
    .from(recordings)
    .where(and(eq(recordings.status, "READY"), lt(recordings.expiresAt, now)))
    .limit(PURGE_BATCH);

  let purged = 0;
  let failed = 0;

  for (const row of due) {
    if (!(await purgeObject(row.objectKey, logger))) {
      failed += 1;
      continue;
    }

    await db
      .update(recordings)
      .set({ status: "EXPIRED" })
      .where(eq(recordings.id, row.id));

    purged += 1;
  }

  return { purged, failed };
}

/** کل سیاست نگه‌داری، در یک اجرا. */
export async function runRetention(now: Date = new Date()): Promise<RetentionResult> {
  const logger = new Logger("Retention");
  const before = new Date(now.getTime() - submissionRetentionDays() * DAY_MS);

  const submissionResult = await purgeExpiredSubmissions(before, logger);
  // بعد از اجراها اجرا می‌شود، نه موازی: بازخوردهایی را برمی‌دارد که
  // اجرایشان همین حالا پاک شده، پس همان شب می‌روند نه شب بعد
  const voiceResult = await purgeOrphanVoiceNotes(logger);
  const recordingResult = await purgeExpiredRecordings(now, logger);

  return {
    submissions: submissionResult.purged,
    voiceNotes: voiceResult.purged,
    recordings: recordingResult.purged,
    failed: submissionResult.failed + voiceResult.failed + recordingResult.failed,
  };
}
