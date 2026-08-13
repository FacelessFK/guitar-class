import { Logger } from "@nestjs/common";
import type { SessionReviewReason } from "@music/shared";

import {
  closeFinishedSessions,
  type ClosedSession,
  type ClosedSessionStatus,
} from "../booking/booking.service.js";
import { recordCancellationRefund } from "../payment/payment.service.js";
import { openSessionReview } from "../admin/review.service.js";
import { IN_APP_TYPES, notifyInApp } from "../notification/in-app.service.js";
import { SWEEPS, recordHeartbeat } from "./heartbeat.js";

/**
 * بستن خودکار جلسه و تشخیص عدم حضور.
 *
 * جلسه‌ای که تمام شده ولی کسی نبسته، تا ابد `CONFIRMED` یا `IN_PROGRESS`
 * می‌ماند: در «کلاس‌های پیش رو» می‌نشیند، اسلات را در قید `EXCLUDE`
 * اشغال نگه می‌دارد، و تسویه‌ی استاد هیچ‌وقت تکلیفش روشن نمی‌شود.
 *
 * چرا جارو و نه جابِ تأخیردار به ازای هر جلسه — همان دلیل جاروی مهلت
 * پرداخت (سند معماری، بخش ۸): جابِ گم‌شده یعنی جلسه‌ای که تا ابد باز
 * می‌ماند. ردیس پاک شود یا وُرکر در آن پانزده دقیقه پایین باشد و آن
 * جلسه دیگر هرگز بسته نمی‌شود. جارو هر اجرا همه‌ی عقب‌افتاده‌ها را هم
 * برمی‌دارد، و جلسه‌های پیش از وجود این جاب را هم می‌بندد.
 */

export const CLOSE_SESSIONS_JOB = SWEEPS.CLOSE_SESSIONS;

/**
 * هر دقیقه یک بار.
 *
 * مهلت پانزده‌دقیقه‌ای است، پس دقت یک‌دقیقه‌ای کافی است. هزینه‌اش یک
 * `UPDATE` ایندکس‌دار (`bookings_session_close_idx`) است که در حالت
 * عادی صفر سطر برمی‌گرداند.
 */
export const CLOSE_SESSIONS_INTERVAL_MS = 60_000;

export interface SessionCloseResult {
  completed: number;
  noShowStudent: number;
  noShowTeacher: number;
  noShow: number;
  /** بازپرداخت‌هایی که واقعاً در دفتر کل نوشته شدند */
  refunded: number;
  /** جمع اعتباری که همین اجرا به هنرجوها برگشت، به ریال */
  credited: bigint;
  /** پرونده‌هایی که همین اجرا روی میز ادمین باز شدند */
  reviewsOpened: number;
  /**
   * جلسه‌هایی که نتیجه‌شان اثر مالی داشت ولی سرور جیتسی تأییدشان نکرده
   * بود، پس پول جابه‌جا نشد و به ادمین سپرده شدند.
   *
   * تا وقتی هوک نصب نشده این عدد با `noShowTeacher` برابر است. بعد از
   * نصب باید صفر بماند؛ غیرصفر شدنش یعنی یا هوک افتاده یا کسی حضور جعل
   * کرده.
   */
  unverified: number;
}

/**
 * چه چیزی از این جلسه باید روی میز ادمین برود — و آیا پول جابه‌جا شود.
 *
 * `SessionReviewReason` عمداً همان `ClosedSessionStatus` نیست: یکی
 * می‌گوید جلسه چطور تمام شد و دیگری چه چیزی باید بررسی شود. این تابع
 * تنها جایی است که یکی به دیگری تبدیل می‌شود، پس اگر روزی حالت تازه‌ای
 * به چرخه‌ی حیات رزرو اضافه شود، تایپ‌چک همین‌جا می‌ایستد.
 *
 * سه قاعده، و هر سه درباره‌ی همان یک چیزند — پول:
 *
 *   • **عدم حضور استادِ تأییدشده** → بازپرداخت خودکار و پرونده. سرور
 *     جیتسی دیده که استاد نیامده؛ این دیگر ادعای کسی نیست.
 *   • **عدم حضور استادِ تأییدنشده** → پرونده، **بدون** بازپرداخت. یا
 *     هوک نصب نیست یا هنرجو خودش را حاضر جا زده تا جلسه‌ی نرفته را
 *     پس بگیرد، و این دو از بیرون یکی به نظر می‌رسند. حدس زدن در این
 *     نقطه یعنی حدس زدن با پول کسی.
 *   • **هیچ‌کس نیامد** → پرونده، چون تکلیفش از اول روشن نبوده.
 *
 * دو حالت دیگر پرونده نمی‌سازند: `COMPLETED` چیزی برای تصمیم ندارد، و
 * `NO_SHOW_STUDENT` هم نه — نبودنِ هنرجو را فقط گزارشِ خودِ هنرجو
 * می‌سازد و استاد نمی‌تواند جایش ادعایش کند، پس تأییدنشده بودنش چیزی
 * را عوض نمی‌کند. اگر این دو هم پرونده می‌ساختند، تا وقتی هوک نصب نشده
 * صف ادمین از جلسه‌های سالم پر می‌شد و پرونده‌های واقعی زیرشان گم
 * می‌شدند.
 */
function reviewReasonFor(session: ClosedSession): SessionReviewReason | null {
  if (session.status === "NO_SHOW") return "NO_SHOW";

  if (session.status === "NO_SHOW_TEACHER") {
    return session.attendanceVerified ? "NO_SHOW_TEACHER" : "ATTENDANCE_UNVERIFIED";
  }

  return null;
}

/** بازپرداخت خودکار فقط روی چیزی که سرور جیتسی تأییدش کرده. */
const shouldRefund = (session: ClosedSession): boolean =>
  session.status === "NO_SHOW_TEACHER" && session.attendanceVerified;

/** آنچه هنرجو می‌بیند. به ازای هر دلیل، نه به ازای وضعیت جلسه. */
const REVIEW_MESSAGE: Record<SessionReviewReason, string> = {
  NO_SHOW_TEACHER:
    "استاد در جلسه‌ی شما حاضر نشد. هزینه به اعتبار شما برگشت و موضوع در حال بررسی است.",
  NO_SHOW: "جلسه‌ی شما برگزار نشد و موضوع در حال بررسی است.",
  ATTENDANCE_UNVERIFIED:
    "برگزاری جلسه‌ی شما تأیید نشد و موضوع در حال بررسی است. نتیجه را به شما اطلاع می‌دهیم.",
};

const countOf = (sessions: ClosedSession[], status: ClosedSessionStatus): number =>
  sessions.filter((session) => session.status === status).length;

/**
 * جلسه‌های تمام‌شده را می‌بندد و اثر مالیِ عدم حضور استاد را ثبت می‌کند.
 *
 * ترتیب مهم است: اول وضعیت جلسه‌ها با یک `UPDATE` شرطی عوض می‌شود و
 * فهرست چیزهایی که *همین اجرا* بسته شدند برمی‌گردد. بازپرداخت فقط برای
 * همان‌ها نوشته می‌شود. اجرای دوم صفر سطر می‌بندد، پس هیچ سطر مالی
 * دومی هم نمی‌نویسد.
 *
 * دو لایه‌ی دیگر هم زیر همین هستند: `recordCancellationRefund` پیش از
 * درج، سطر بازپرداخت موجود را می‌بیند، و ایندکس یکتای
 * `ledger_one_refund_per_booking` در دیتابیس دومی را ناممکن می‌کند.
 * برای پول، سه لایه زیادی نیست.
 *
 * عدم حضور استاد **بازپرداخت‌شدنی است، بی‌قید و شرط** — همان سطری از
 * جدول سیاست لغو که می‌گوید جلسه برمی‌گردد. عدم حضور هنرجو جلسه را
 * می‌سوزاند و هیچ سطری نمی‌نویسد. «هیچ‌کس نیامد» هم فعلاً می‌سوزد؛ اگر
 * قرار شود آن هم برگردد، فقط همین یک شرط عوض می‌شود.
 */
export async function runSessionClose(
  now: Date = new Date(),
): Promise<SessionCloseResult> {
  const logger = new Logger("SessionClose");

  const closed = await closeFinishedSessions(now);

  let refunded = 0;
  let credited = 0n;
  let reviewsOpened = 0;
  let unverified = 0;

  for (const session of closed) {
    if (shouldRefund(session)) {
      const settlement = await recordCancellationRefund({
        bookingId: session.id,
        refundable: true,
      });

      if (settlement?.refund) refunded += 1;
      if (settlement?.credit) credited += settlement.credit;

      logger.warn(
        `استاد ${session.teacherId} در جلسه‌ی ${session.id} حاضر نشد — پرونده‌ی بررسی باز شد.`,
      );
    }

    const reason = reviewReasonFor(session);

    if (reason === "ATTENDANCE_UNVERIFIED") {
      unverified += 1;

      logger.error(
        `جلسه‌ی ${session.id} با عدم حضور استاد بسته شد ولی سرور جیتسی حضور هیچ‌کس را تأیید نکرده — ` +
          "بازپرداخت خودکار انجام نشد و پرونده برای بررسی باز شد. " +
          "اگر این پیام برای همه‌ی جلسه‌ها می‌آید، ماژول event_sync روی prosody نصب یا سالم نیست " +
          "(docs/deployment.md بخش ۱۰).",
      );
    }

    if (!reason) continue;

    /**
     * پرونده پیش از اعلان باز می‌شود و اعلان فقط وقتی می‌رود که پرونده
     * **همین اجرا** ساخته شده باشد.
     *
     * جارو هر دقیقه اجرا می‌شود. اگر اعلان به باز بودن پرونده گره
     * می‌خورد نه به ساخته شدنش، هنرجو تا وقتی ادمین رسیدگی نکرده هر
     * دقیقه یک اعلان می‌گرفت. در عمل `closeFinishedSessions` هم دومین
     * بار همین جلسه را برنمی‌گرداند، ولی تکیه کردن به یک لایه برای
     * چیزی که به کاربر پیام می‌فرستد کافی نیست.
     */
    const opened = await openSessionReview({
      bookingId: session.id,
      reason,
    });

    if (!opened) continue;

    reviewsOpened += 1;

    await notifyInApp({
      userId: session.studentId,
      type: IN_APP_TYPES.SESSION_UNDER_REVIEW,
      /**
       * پیامِ «هزینه برگشت خورد» فقط جایی گفته می‌شود که واقعاً سطر
       * بازپرداخت نوشته شده باشد. حالت تأییدنشده همان نتیجه را دارد
       * ولی پولش هنوز جابه‌جا نشده، و وعده‌ی پولی که نیامده بدتر از
       * سکوت است.
       */
      message: REVIEW_MESSAGE[reason],
      href: `/sessions/${session.id}`,
      bookingId: session.id,
    });
  }

  await recordHeartbeat(SWEEPS.CLOSE_SESSIONS, now);

  const result: SessionCloseResult = {
    completed: countOf(closed, "COMPLETED"),
    noShowStudent: countOf(closed, "NO_SHOW_STUDENT"),
    noShowTeacher: countOf(closed, "NO_SHOW_TEACHER"),
    noShow: countOf(closed, "NO_SHOW"),
    refunded,
    credited,
    reviewsOpened,
    unverified,
  };

  // در حالت عادی هیچ جلسه‌ای بسته نمی‌شود؛ لاگ خالی هر دقیقه فقط
  // چیزهای مهم را دفن می‌کند.
  if (closed.length > 0) {
    logger.log(
      `${closed.length} جلسه بسته شد: ${result.completed} برگزارشده، ` +
        `${result.noShowStudent} عدم حضور هنرجو، ${result.noShowTeacher} عدم حضور استاد، ` +
        `${result.noShow} بدون حضور. ${result.refunded} بازپرداخت ثبت شد، ` +
        `${result.reviewsOpened} پرونده‌ی بررسی باز شد و ${result.unverified} جلسه ` +
        `به دلیل تأیید نشدن حضور بدون اثر مالی ماند.`,
    );
  }

  return result;
}
