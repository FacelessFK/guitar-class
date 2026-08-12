/**
 * پیشنهاد تسویه‌ی ماهانه.
 *
 * جدول کارهای پس‌زمینه‌ی سند «محاسبه‌ی تسویه‌ی ماهانه» را لازم می‌دانست و
 * ساخته نشده بود. تا امروز ادمین باید خودش بازه را انتخاب می‌کرد، مانده‌ی
 * هر استاد را نگاه می‌کرد و مبلغ را دستی می‌نوشت — یعنی کاری که هر ماه
 * تکرار می‌شود، هر ماه دستی و قابل فراموش شدن بود.
 *
 * **این جارو فقط سطر `PENDING` می‌سازد و پول را جابه‌جا نمی‌کند.** دو
 * مرحله بودنِ تسویه عمدی است (سند، بخش ۴.۵): انتقال وجه در این فاز
 * بیرون از سیستم انجام می‌شود و بین «تصمیم گرفتم بدهم» تا «دادم و کد
 * رهگیری دارم» فاصله‌ی واقعی هست. پس آنچه خودکار می‌شود همان مرحله‌ی
 * اول است — محاسبه — و «پرداخت شد» همچنان کار دست آدم می‌ماند.
 *
 * چرا جارو و نه جابِ ماهانه، همان دلیل بقیه (سند، بخش ۸): جابِ ماهانه‌ی
 * گم‌شده یعنی یک ماه تسویه‌ی هیچ استادی حساب نمی‌شود و هیچ‌جا هم معلوم
 * نمی‌شود. این هر شب اجرا می‌شود، می‌بیند دوره‌ی ماه پیش پوشش داده شده
 * یا نه، و اگر نه می‌سازدش. ماهی که در قطعی سرور گذشته باشد، شب بعد
 * جبران می‌شود.
 */

import { Logger } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { previousPersianMonthRange, tehranDateKey, type DateRange } from "@music/shared";

import { db } from "../db/client.js";
import { payouts, teacherProfiles } from "../db/schema/index.js";
import { uniqueViolationConstraint } from "../common/pg-error.js";
import { teacherEarningsBreakdown } from "./payment.service.js";

export interface PayoutRunResult {
  period: DateRange;
  /** تسویه‌های تازه‌ی ساخته‌شده */
  created: number;
  /** استادهایی که مانده‌ی پرداختنی نداشتند */
  skipped: number;
  /** دوره‌ای که از قبل پوشش داده شده بود */
  alreadyCovered: number;
}

/**
 * مانده‌ی در انتظارِ استاد.
 *
 * تسویه‌های `PENDING` از مانده کسر می‌شوند — همان قاعده‌ای که
 * `createPayout` دارد. بدون آن، جارو در فاصله‌ی «ادمین سطر را ساخت» تا
 * «پرداخت شد را زد» مانده را همچنان پرداخت‌نشده می‌بیند و سطر دومی برای
 * همان پول می‌سازد.
 */
async function availableBalance(teacherProfileId: string): Promise<bigint> {
  const [breakdown, pendingRow] = await Promise.all([
    teacherEarningsBreakdown(teacherProfileId),
    db
      .select({ total: sql<string>`COALESCE(SUM(${payouts.amount}), 0)::text` })
      .from(payouts)
      .where(
        and(eq(payouts.teacherId, teacherProfileId), eq(payouts.status, "PENDING")),
      ),
  ]);

  return breakdown.outstanding - BigInt(pendingRow[0]?.total ?? 0);
}

/**
 * برای هر استاد با ماندهٔ مثبت، یک تسویه‌ی «در انتظار» برای ماه گذشته.
 *
 * ⚠️ مبلغ **کل مانده** است، نه فقط درآمدِ همان دوره. عمدی است: دوره
 * برچسبی برای «این تسویه مال کِی است» است، ولی آنچه واقعاً به استاد
 * بدهکاریم جمع کل دفتر کل اوست. اگر فقط درآمد همان ماه حساب می‌شد،
 * جلسه‌ای که دیرتر قطعی شده یا بازپرداختی که ماه بعد ثبت شده، برای
 * همیشه از تسویه جا می‌ماند و هیچ‌کجا هم دیده نمی‌شود.
 */
export async function runMonthlyPayouts(
  now: Date = new Date(),
): Promise<PayoutRunResult> {
  const logger = new Logger("PayoutRun");
  const period = previousPersianMonthRange(tehranDateKey(now));

  const teachers = await db
    .select({ id: teacherProfiles.id })
    .from(teacherProfiles)
    .where(eq(teacherProfiles.status, "APPROVED"));

  let created = 0;
  let skipped = 0;
  let alreadyCovered = 0;

  for (const teacher of teachers) {
    const available = await availableBalance(teacher.id);

    if (available <= 0n) {
      skipped += 1;
      continue;
    }

    /**
     * ایدمپوتنسی از دیتابیس می‌آید، نه از بررسیِ پیش از درج.
     *
     * «اول ببین هست، بعد درج کن» در برابر دو اجرای هم‌زمان مصون نیست و
     * اینجا نتیجه‌اش دو سطر پرداختنی برای یک دوره است. ایندکس یکتای
     * `payouts_one_per_teacher_period` این را ناممکن می‌کند و ما فقط
     * خطایش را می‌گیریم.
     */
    try {
      await db.insert(payouts).values({
        teacherId: teacher.id,
        periodStart: period.start,
        periodEnd: period.end,
        amount: available,
        note: "پیشنهاد خودکار تسویه‌ی ماهانه",
      });

      created += 1;
    } catch (error) {
      if (uniqueViolationConstraint(error) === "payouts_one_per_teacher_period") {
        alreadyCovered += 1;
        continue;
      }

      throw error;
    }
  }

  if (created > 0) {
    logger.log(
      `${created} تسویه‌ی در انتظار برای دوره‌ی ${period.start} تا ${period.end} ساخته شد.`,
    );
  }

  return { period, created, skipped, alreadyCovered };
}
