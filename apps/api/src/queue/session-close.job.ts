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
  /** پرونده‌هایی که همین اجرا روی میز ادمین باز شدند */
  reviewsOpened: number;
}

/**
 * کدام پایانِ جلسه پرونده‌ی بررسی می‌سازد.
 *
 * عدم حضور هنرجو اینجا نیست و عمدی است: تکلیفش روشن است — جلسه
 * می‌سوزد و پول جابه‌جا نمی‌شود، پس چیزی برای تصمیم گرفتن نمانده.
 * دو حالت دیگر تصمیم لازم دارند: عدم حضور استاد پول را برگردانده و
 * باید با خود استاد حل شود، و «هیچ‌کس نیامد» اصلاً معلوم نیست تقصیر
 * چه کسی بوده.
 */
const REVIEWABLE: readonly SessionReviewReason[] = ["NO_SHOW_TEACHER", "NO_SHOW"];

/**
 * تنگ‌کننده‌ی نوع، نه فقط بررسی عضویت.
 *
 * `SessionReviewReason` عمداً همان `ClosedSessionStatus` نیست — یکی
 * می‌گوید جلسه چطور تمام شد و دیگری چه چیزی باید بررسی شود. این تابع
 * تنها جایی است که یکی به دیگری تبدیل می‌شود، و اگر روزی حالت تازه‌ای
 * به چرخه‌ی حیات رزرو اضافه شود، تایپ‌چک همین‌جا می‌ایستد.
 */
const isReviewable = (status: ClosedSessionStatus): status is SessionReviewReason =>
  REVIEWABLE.includes(status as SessionReviewReason);

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
  let reviewsOpened = 0;

  for (const session of closed) {
    if (session.status === "NO_SHOW_TEACHER") {
      const refund = await recordCancellationRefund({
        bookingId: session.id,
        refundable: true,
      });

      if (refund) refunded += 1;

      logger.warn(
        `استاد ${session.teacherId} در جلسه‌ی ${session.id} حاضر نشد — پرونده‌ی بررسی باز شد.`,
      );
    }

    if (!isReviewable(session.status)) continue;

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
      reason: session.status,
    });

    if (!opened) continue;

    reviewsOpened += 1;

    await notifyInApp({
      userId: session.studentId,
      type: IN_APP_TYPES.SESSION_UNDER_REVIEW,
      message:
        session.status === "NO_SHOW_TEACHER"
          ? "استاد در جلسه‌ی شما حاضر نشد. هزینه برگشت خورد و موضوع در حال بررسی است."
          : "جلسه‌ی شما برگزار نشد و موضوع در حال بررسی است.",
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
    reviewsOpened,
  };

  // در حالت عادی هیچ جلسه‌ای بسته نمی‌شود؛ لاگ خالی هر دقیقه فقط
  // چیزهای مهم را دفن می‌کند.
  if (closed.length > 0) {
    logger.log(
      `${closed.length} جلسه بسته شد: ${result.completed} برگزارشده، ` +
        `${result.noShowStudent} عدم حضور هنرجو، ${result.noShowTeacher} عدم حضور استاد، ` +
        `${result.noShow} بدون حضور. ${result.refunded} بازپرداخت ثبت شد و ` +
        `${result.reviewsOpened} پرونده‌ی بررسی باز شد.`,
    );
  }

  return result;
}
