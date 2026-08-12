import { Logger } from "@nestjs/common";

import {
  closeFinishedSessions,
  type ClosedSession,
  type ClosedSessionStatus,
} from "../booking/booking.service.js";
import { recordCancellationRefund } from "../payment/payment.service.js";
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
}

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
  for (const session of closed) {
    if (session.status !== "NO_SHOW_TEACHER") continue;

    const refund = await recordCancellationRefund({
      bookingId: session.id,
      refundable: true,
    });

    if (refund) refunded += 1;

    /**
     * عدم حضور استاد به بررسی ادمین نیاز دارد و صف بررسی، خودِ وضعیت
     * رزرو است — صفحه‌ی ادمین روی `NO_SHOW_TEACHER` فیلتر می‌کند. تا
     * وقتی آن صفحه ساخته نشده، این خط تنها جایی است که دیده می‌شود، پس
     * سطح `warn` دارد نه `log`.
     */
    logger.warn(
      `استاد ${session.teacherId} در جلسه‌ی ${session.id} حاضر نشد — نیازمند بررسی ادمین.`,
    );
  }

  await recordHeartbeat(SWEEPS.CLOSE_SESSIONS, now);

  const result: SessionCloseResult = {
    completed: countOf(closed, "COMPLETED"),
    noShowStudent: countOf(closed, "NO_SHOW_STUDENT"),
    noShowTeacher: countOf(closed, "NO_SHOW_TEACHER"),
    noShow: countOf(closed, "NO_SHOW"),
    refunded,
  };

  // در حالت عادی هیچ جلسه‌ای بسته نمی‌شود؛ لاگ خالی هر دقیقه فقط
  // چیزهای مهم را دفن می‌کند.
  if (closed.length > 0) {
    logger.log(
      `${closed.length} جلسه بسته شد: ${result.completed} برگزارشده، ` +
        `${result.noShowStudent} عدم حضور هنرجو، ${result.noShowTeacher} عدم حضور استاد، ` +
        `${result.noShow} بدون حضور. ${result.refunded} بازپرداخت ثبت شد.`,
    );
  }

  return result;
}
