/**
 * حضورِ تأییدشده — از زبان سرور جیتسی، نه مرورگر کاربر.
 *
 * ماژول `event_sync_component` روی prosody با هر ورود و خروج یک POST به
 * این ماژول می‌زند. تفاوتش با `POST /bookings/:id/attendance` یک چیز
 * است و همان یک چیز همه‌ی ارزشش است: **هویت را ما از بدنه‌ی درخواست
 * نمی‌خوانیم، prosody آن را از ادعای `context.user.id` توکنی برداشته که
 * خودمان امضا کرده‌ایم و او امضایش را سنجیده.** سرور با
 * `ENABLE_GUESTS=0` بالا آمده، پس اصلاً کسی بدون آن توکن داخل اتاق
 * نیست.
 *
 * نتیجه: استادی که غیبت کرده دیگر نمی‌تواند خودش را حاضر جا بزند و
 * بازپرداخت هنرجو را به سوختن جلسه تبدیل کند. آن بدهی — که با نوشتن
 * بازپرداخت در جاروی بستن جلسه اثر مالی هم پیدا کرده بود — از همین‌جا
 * بسته می‌شود.
 *
 * ⚠️ قرارداد کد وضعیت با prosody: ماژول فقط روی **۵xx** (و خطای شبکه)
 * دوباره می‌فرستد. یعنی هر چیزی که می‌خواهیم دوباره بیاید باید ۵xx
 * بگیرد، و هر چیزی که عمداً نادیده می‌گیریم باید ۲۰۰ بگیرد — وگرنه یک
 * رویدادِ مربوط به اتاقی که نمی‌شناسیم تا ابد در حلقه‌ی تلاش مجدد
 * می‌ماند.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { AttendanceEvent, AttendanceSource } from "@music/shared";

import { db } from "../db/client.js";
import { attendanceEvents, bookings } from "../db/schema/index.js";

/** وضعیت‌هایی که رویداد حضور می‌تواند وضعیت جلسه را در آن‌ها جلو ببرد. */
const LIVE_STATUSES = ["CONFIRMED", "IN_PROGRESS"] as const;

/** آنچه از یک رویداد prosody برای ما اهمیت دارد. */
export interface HookAttendanceInput {
  /** `room_name` — نودِ jid اتاق، که برابر `bookings.room_id` است */
  roomName: string;
  /** ادعای `context.user.id` توکن جیتسی */
  userId: string;
  event: AttendanceEvent;
  /** `joined_at` / `left_at` از prosody — ساعت آن سرور، فقط برای رفع اختلاف */
  reportedAt: Date | null;
  occupantJid: string | null;
  now?: Date;
}

/**
 * سرنوشت یک رویداد.
 *
 * همه‌ی حالت‌های «نادیده گرفته شد» جدا از هم برمی‌گردند و در لاگ
 * می‌نشینند. یکی‌کردنشان یعنی روزی که هوک بی‌صدا هیچ‌چیز ثبت نمی‌کند،
 * تنها سرنخِ اینکه *چرا*، از بین رفته باشد — و آن روز، روزی است که
 * تصمیم‌های مالی روی داده‌ی ناقص گرفته می‌شوند.
 */
export type HookOutcome =
  | "RECORDED"
  /** همان رویداد قبلاً رسیده — تلاش مجدد prosody */
  | "DUPLICATE"
  /** اتاقی که به هیچ رزروی وصل نیست: جیتسیِ تیم، اتاق آزمایشی، بریک‌اوت ناشناس */
  | "UNKNOWN_ROOM"
  /** توکن معتبر بود ولی این کاربر طرفِ این رزرو نیست */
  | "NOT_PARTICIPANT";

export interface HookResult {
  outcome: HookOutcome;
  bookingId: string | null;
}

/** `room_name` باید uuidِ اتاق باشد؛ هر چیز دیگری اصلاً به دیتابیس نمی‌رسد. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ثبت یک رویداد حضورِ سرورتأیید.
 *
 * ترتیب کار: اول سطر دفتر (که فقط اضافه می‌شود و هرگز ویرایش نمی‌شود)،
 * بعد ستون‌های خلاصه روی `bookings`. اگر درج به قید یکتای تحویل بخورد،
 * یعنی همین رویداد قبلاً پردازش شده و ستون‌ها هم قبلاً نوشته شده‌اند.
 */
export async function recordHookAttendance(
  input: HookAttendanceInput,
): Promise<HookResult> {
  const now = input.now ?? new Date();

  if (!UUID_PATTERN.test(input.roomName)) {
    return { outcome: "UNKNOWN_ROOM", bookingId: null };
  }

  const [booking] = await db
    .select({
      id: bookings.id,
      studentId: bookings.studentId,
      teacherId: bookings.teacherId,
    })
    .from(bookings)
    .where(eq(bookings.roomId, input.roomName))
    .limit(1);

  if (!booking) {
    return { outcome: "UNKNOWN_ROOM", bookingId: null };
  }

  const isTeacher = booking.teacherId === input.userId;
  const isStudent = booking.studentId === input.userId;

  if (!isTeacher && !isStudent) {
    return { outcome: "NOT_PARTICIPANT", bookingId: booking.id };
  }

  const [recorded] = await db
    .insert(attendanceEvents)
    .values({
      bookingId: booking.id,
      userId: input.userId,
      event: input.event,
      source: AttendanceSource.SERVER_HOOK,
      occurredAt: now,
      reportedAt: input.reportedAt,
      occupantJid: input.occupantJid,
    })
    .onConflictDoNothing()
    .returning({ id: attendanceEvents.id });

  if (!recorded) {
    return { outcome: "DUPLICATE", bookingId: booking.id };
  }

  if (input.event === AttendanceEvent.JOINED) {
    await markVerifiedJoin(booking.id, isTeacher, now);
  } else {
    await markVerifiedLeave(booking.id, now);
  }

  return { outcome: "RECORDED", bookingId: booking.id };
}

/**
 * ورود.
 *
 * ستون تأییدشده **بی‌قید و شرطِ وضعیت** نوشته می‌شود: «سرور دید که این
 * نفر در اتاق بود» یک واقعیت است، نه یک حالت. اگر رویدادی دیر برسد و
 * جلسه از قبل بسته شده باشد، ثبت نکردنش یعنی دور انداختن تنها مدرکی که
 * برای بازبینی دستی داریم.
 *
 * ولی وضعیت و «شروع واقعی» فقط وقتی جلو می‌روند که جلسه هنوز باز باشد.
 * جلسه‌ی بسته‌شده را یک رویداد عقب‌مانده دوباره باز نمی‌کند.
 */
async function markVerifiedJoin(
  bookingId: string,
  isTeacher: boolean,
  now: Date,
): Promise<void> {
  // داخل `sql` نگاشت ستون اعمال نمی‌شود؛ همان کست صریحی که
  // `recordAttendance` هم لازم دارد.
  const at = sql`${now.toISOString()}::timestamptz`;
  const live = inArray(bookings.status, LIVE_STATUSES);

  const side = isTeacher
    ? { teacherVerifiedAt: sql`COALESCE(${bookings.teacherVerifiedAt}, ${at})` }
    : { studentVerifiedAt: sql`COALESCE(${bookings.studentVerifiedAt}, ${at})` };

  await db
    .update(bookings)
    .set({
      ...side,
      actualStartedAt: sql`CASE WHEN ${live} THEN COALESCE(${bookings.actualStartedAt}, ${at}) ELSE ${bookings.actualStartedAt} END`,
      status: sql`(CASE WHEN ${live} THEN 'IN_PROGRESS' ELSE ${bookings.status}::text END)::booking_status`,
    })
    .where(eq(bookings.id, bookingId));
}

/**
 * خروج.
 *
 * ستون تأییدشده‌ی خروج نداریم و لازم هم نیست: تصمیم عدم حضور فقط به
 * «آمد یا نه» بند است، و اینکه کِی رفت در دفتر رویدادها هست. اینجا فقط
 * `actual_ended_at` به‌روز می‌شود، دقیقاً مثل مسیر کلاینت — هر کس دیرتر
 * رفته، لحظه‌ی خالی شدن اتاق همان است.
 */
async function markVerifiedLeave(bookingId: string, now: Date): Promise<void> {
  await db
    .update(bookings)
    .set({ actualEndedAt: now })
    .where(and(eq(bookings.id, bookingId), eq(bookings.status, "IN_PROGRESS")));
}
