/**
 * ثبت و لغو رزرو.
 *
 * دو لایه‌ی دفاعی وجود دارد و هر دو لازم‌اند:
 *
 *   ۱. بررسی پیش از درج با موتور دسترس‌پذیری — پیام خطای دقیق و
 *      قابل فهم می‌دهد («این ساعت خارج از برنامه‌ی استاد است»).
 *   ۲. قیدهای پستگرس — تنها لایه‌ای که در برابر شرط رقابتی مصون است.
 *      وقتی این یکی فعال می‌شود یعنی واقعاً دو درخواست هم‌زمان به یک
 *      اسلات رسیده‌اند.
 *
 * لایه‌ی اول را نمی‌شود جای لایه‌ی دوم گذاشت و برعکس.
 */

import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import {
  BUSINESS_RULES,
  addDaysToDateKey,
  fromTehranWallClock,
  isSlotBookable,
  planPackageSessions,
  tehranDateKey,
  tehranMinutesOfDay,
  tehranWeekday,
  type DateKey,
} from "@music/shared";

import { alias } from "drizzle-orm/pg-core";

import { db, type Database } from "../db/client.js";
import {
  bookings,
  enrollments,
  instruments,
  offerings,
  users,
} from "../db/schema/index.js";
import { loadSchedule, type LoadedSchedule } from "../availability/availability.service.js";
import { IN_APP_TYPES, notifyInApp } from "../notification/in-app.service.js";
import { sessionDateTimeFa } from "../notification/templates.js";
import {
  BookingNotCancellableError,
  BookingNotFoundError,
  NotBookingParticipantError,
  OfferingNotFoundError,
  PackageConflictError,
  SlotUnavailableError,
  TrialAlreadyUsedError,
  rethrowTranslated,
} from "./errors.js";

const MINUTE_MS = 60_000;

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * MINUTE_MS);
}

/**
 * برنامه‌ی استاد را برای روزی که جلسه در آن است می‌خواند.
 * یک روز حاشیه در `loadSchedule` گرفته می‌شود، پس نیازی به گشاد کردن
 * بازه اینجا نیست.
 */
async function loadScheduleForInstant(
  teacherProfileId: string,
  offeringId: string,
  instant: Date,
): Promise<LoadedSchedule> {
  const dateKey = tehranDateKey(instant);
  try {
    return await loadSchedule(teacherProfileId, offeringId, dateKey, dateKey);
  } catch {
    throw new OfferingNotFoundError(offeringId);
  }
}

/** بررسی می‌کند اسلات درخواستی واقعاً در برنامه‌ی استاد آزاد است. */
function assertSlotBookable(
  schedule: LoadedSchedule,
  scheduledAt: Date,
  sessionMinutes: number,
  now: Date,
): void {
  const bookable = isSlotBookable(scheduledAt, {
    rules: schedule.rules,
    exceptions: schedule.exceptions,
    busy: schedule.busy,
    now,
    options: {
      sessionMinutes,
      bufferMinutes: schedule.bufferMinutes,
      minLeadMinutes: BUSINESS_RULES.MIN_LEAD_MINUTES,
    },
  });

  if (!bookable) {
    throw new SlotUnavailableError();
  }
}

export interface CreateBookingInput {
  studentId: string;
  /** شناسه‌ی `teacher_profiles` */
  teacherProfileId: string;
  offeringId: string;
  scheduledAt: Date;
  now?: Date;
}

export interface CreatedBooking {
  id: string;
  roomId: string;
  scheduledAt: Date;
  endsAt: Date;
  status: string;
  holdExpiresAt: Date | null;
  priceSnapshot: bigint;
}

/**
 * جلسه‌ی معارفه‌ی رایگان.
 *
 * رایگان است، پس مرحله‌ی پرداخت ندارد و مستقیم `CONFIRMED` می‌شود.
 *
 * یک‌بار برای همیشه به ازای هر کاربر است، نه یکی به ازای هر استاد —
 * وگرنه می‌شود با چرخیدن بین استادها رایگان آموزش دید.
 */
export async function createTrialBooking(
  input: CreateBookingInput,
): Promise<CreatedBooking> {
  const now = input.now ?? new Date();
  const sessionMinutes = BUSINESS_RULES.TRIAL_DURATION_MINUTES;

  const schedule = await loadScheduleForInstant(
    input.teacherProfileId,
    input.offeringId,
    input.scheduledAt,
  );
  assertSlotBookable(schedule, input.scheduledAt, sessionMinutes, now);

  try {
    return await db.transaction(async (tx) => {
      // بررسی و ثبت مصرف تریال در یک دستور اتمیک انجام می‌شود.
      // اگر اول بخوانیم و بعد بنویسیم، دو درخواست هم‌زمان هر دو رد
      // می‌شوند از فیلتر و هر دو تریال می‌گیرند.
      const claimed = await tx
        .update(users)
        .set({ trialUsedAt: now })
        .where(and(eq(users.id, input.studentId), isNull(users.trialUsedAt)))
        .returning({ id: users.id });

      if (claimed.length === 0) {
        throw new TrialAlreadyUsedError();
      }

      const [created] = await tx
        .insert(bookings)
        .values({
          studentId: input.studentId,
          teacherId: schedule.teacherUserId,
          offeringId: input.offeringId,
          type: "TRIAL",
          scheduledAt: input.scheduledAt,
          endsAt: addMinutes(input.scheduledAt, sessionMinutes),
          durationMinutes: sessionMinutes,
          status: "CONFIRMED",
          holdExpiresAt: null,
          priceSnapshot: 0n,
          commissionSnapshot: schedule.commissionRate,
        })
        .returning();

      return created as CreatedBooking;
    });
  } catch (error) {
    rethrowTranslated(error);
  }
}

/**
 * جلسه‌ی تکی.
 *
 * با وضعیت `PENDING_PAYMENT` ساخته می‌شود و اسلات را بلافاصله قفل
 * می‌کند، ولی `holdExpiresAt` دارد. بدون این مهلت، هر کسی می‌تواند فقط
 * با باز کردن صفحه‌ی پرداخت، کل برنامه‌ی یک استاد را مسدود کند.
 */
export async function createSingleBooking(
  input: CreateBookingInput,
): Promise<CreatedBooking> {
  const now = input.now ?? new Date();

  const schedule = await loadScheduleForInstant(
    input.teacherProfileId,
    input.offeringId,
    input.scheduledAt,
  );
  assertSlotBookable(schedule, input.scheduledAt, schedule.sessionMinutes, now);

  try {
    const [created] = await db
      .insert(bookings)
      .values({
        studentId: input.studentId,
        teacherId: schedule.teacherUserId,
        offeringId: input.offeringId,
        type: "SINGLE",
        scheduledAt: input.scheduledAt,
        endsAt: addMinutes(input.scheduledAt, schedule.sessionMinutes),
        durationMinutes: schedule.sessionMinutes,
        status: "PENDING_PAYMENT",
        holdExpiresAt: addMinutes(now, BUSINESS_RULES.PAYMENT_HOLD_MINUTES),
        priceSnapshot: schedule.price,
        commissionSnapshot: schedule.commissionRate,
      })
      .returning();

    return created as CreatedBooking;
  } catch (error) {
    rethrowTranslated(error);
  }
}

export interface CreatePackageInput {
  studentId: string;
  teacherProfileId: string;
  offeringId: string;
  /** تاریخ اولین جلسه */
  firstSessionDate: DateKey;
  /** ساعت ثابت هفتگی، دقیقه از نیمه‌شب به وقت تهران */
  startMinute: number;
  sessionCount?: number;
  now?: Date;
}

export interface CreatedPackage {
  enrollmentId: string;
  bookings: CreatedBooking[];
  priceTotal: bigint;
}

/**
 * پکیج ماهانه: یک روز ثابت هفته، یک ساعت ثابت، چند هفته‌ی متوالی.
 *
 * همه‌ی جلسات در یک تراکنش ساخته می‌شوند. اگر حتی یکی از هفته‌ها آزاد
 * نباشد، کل تراکنش رول‌بک می‌شود — نه اینکه سه جلسه ساخته شود و چهارمی
 * جا بماند.
 *
 * ولی هر جلسه رکورد مستقل خودش را دارد، پس جابه‌جا کردن جلسه‌ی سوم
 * بعداً بقیه را خراب نمی‌کند.
 */
export async function createPackageEnrollment(
  input: CreatePackageInput,
): Promise<CreatedPackage> {
  const now = input.now ?? new Date();
  const sessionCount = input.sessionCount ?? BUSINESS_RULES.PACKAGE_SESSION_COUNT;
  const lastSessionDate = addDaysToDateKey(input.firstSessionDate, (sessionCount - 1) * 7);

  let schedule: LoadedSchedule;
  try {
    schedule = await loadSchedule(
      input.teacherProfileId,
      input.offeringId,
      input.firstSessionDate,
      lastSessionDate,
    );
  } catch {
    throw new OfferingNotFoundError(input.offeringId);
  }

  const plan = planPackageSessions({
    rules: schedule.rules,
    exceptions: schedule.exceptions,
    busy: schedule.busy,
    now,
    options: {
      sessionMinutes: schedule.sessionMinutes,
      bufferMinutes: schedule.bufferMinutes,
      minLeadMinutes: BUSINESS_RULES.MIN_LEAD_MINUTES,
    },
    firstSessionDate: input.firstSessionDate,
    startMinute: input.startMinute,
    sessionCount,
  });

  if (!plan.ok) {
    throw new PackageConflictError(plan.conflicts);
  }

  const priceTotal = schedule.price * BigInt(sessionCount);
  const holdExpiresAt = addMinutes(now, BUSINESS_RULES.PAYMENT_HOLD_MINUTES);
  const firstSession = plan.sessions[0];
  if (!firstSession) {
    throw new PackageConflictError([]);
  }

  try {
    return await db.transaction(async (tx) => {
      const [enrollment] = await tx
        .insert(enrollments)
        .values({
          studentId: input.studentId,
          offeringId: input.offeringId,
          sessionsTotal: sessionCount,
          weekday: tehranWeekday(new Date(firstSession.start)),
          startMinute: input.startMinute,
          startDate: input.firstSessionDate,
          priceTotal,
          status: "PENDING_PAYMENT",
        })
        .returning({ id: enrollments.id });

      if (!enrollment) {
        throw new Error("ساخت ثبت‌نام پکیج ناموفق بود");
      }

      const created = await tx
        .insert(bookings)
        .values(
          plan.sessions.map((session, index) => ({
            studentId: input.studentId,
            teacherId: schedule.teacherUserId,
            offeringId: input.offeringId,
            enrollmentId: enrollment.id,
            sessionIndex: index + 1,
            type: "PACKAGE" as const,
            scheduledAt: new Date(session.start),
            endsAt: new Date(session.end),
            durationMinutes: schedule.sessionMinutes,
            status: "PENDING_PAYMENT" as const,
            holdExpiresAt,
            priceSnapshot: schedule.price,
            commissionSnapshot: schedule.commissionRate,
          })),
        )
        .returning();

      return {
        enrollmentId: enrollment.id,
        bookings: created as CreatedBooking[],
        priceTotal,
      };
    });
  } catch (error) {
    rethrowTranslated(error);
  }
}

/**
 * رزروهایی که مهلت پرداختشان تمام شده را آزاد می‌کند.
 *
 * جاب پس‌زمینه این را صدا می‌زند. تعداد رکوردهای آزادشده را برمی‌گرداند.
 */
export async function expireStaleHolds(now: Date = new Date()): Promise<number> {
  const expired = await db
    .update(bookings)
    .set({ status: "EXPIRED", holdExpiresAt: null })
    .where(
      and(
        eq(bookings.status, "PENDING_PAYMENT"),
        lt(bookings.holdExpiresAt, now),
      ),
    )
    .returning({ id: bookings.id });

  return expired.length;
}

// ---------------------------------------------------------------------------
// بستن جلسه‌ی تمام‌شده
// ---------------------------------------------------------------------------

/** وضعیت‌هایی که جلسه از آن‌ها بسته می‌شود — یعنی هنوز باز است. */
const OPEN_SESSION_STATUSES = ["CONFIRMED", "IN_PROGRESS"] as const;

export type ClosedSessionStatus =
  | "COMPLETED"
  | "NO_SHOW_STUDENT"
  | "NO_SHOW_TEACHER"
  | "NO_SHOW";

export interface ClosedSession {
  id: string;
  status: ClosedSessionStatus;
  /** برای پیام لاگ و گزارش ادمین */
  teacherId: string;
  studentId: string;
}

/**
 * جلسه‌هایی که وقتشان گذشته را می‌بندد و نتیجه‌ی حضور را ثبت می‌کند.
 *
 * چهار حالت جدول بخش ۵ سند معماری، از روی دو ستونی که ماژول اتاق کلاس
 * پر می‌کند:
 *
 *   • هر دو آمدند    → `COMPLETED`
 *   • فقط استاد آمد  → `NO_SHOW_STUDENT` (جلسه می‌سوزد)
 *   • فقط هنرجو آمد  → `NO_SHOW_TEACHER` (جلسه برمی‌گردد + بررسی ادمین)
 *   • هیچ‌کس نیامد   → `NO_SHOW`
 *
 * **اثر مالی اینجا نیست.** این تابع فقط تصمیم می‌گیرد، مثل
 * `cancelBooking`. ثبت سطر منفی در دفتر کل کار ماژول پرداخت است و جاب
 * پس‌زمینه دو را به هم وصل می‌کند — دامنه‌ی رزرو نباید از وجود دفتر کل
 * خبر داشته باشد.
 *
 * یک `UPDATE` است، نه خواندن و بعد نوشتن: شرط `status IN (...)` در
 * `WHERE` یعنی هر جلسه دقیقاً یک بار بسته می‌شود. اجرای دوم آرایه‌ی خالی
 * برمی‌گرداند، پس بازپرداختِ دوباره هم اتفاق نمی‌افتد. اگر اول می‌خواندیم
 * و بعد می‌نوشتیم، دو اجرای هم‌زمان هر دو همان سطر را «باز» می‌دیدند.
 */
export async function closeFinishedSessions(
  now: Date = new Date(),
): Promise<ClosedSession[]> {
  const cutoff = new Date(
    now.getTime() - BUSINESS_RULES.NO_SHOW_GRACE_MINUTES * MINUTE_MS,
  );

  const teacherCame = sql`${bookings.teacherJoinedAt} IS NOT NULL`;
  const studentCame = sql`${bookings.studentJoinedAt} IS NOT NULL`;

  const closed = await db
    .update(bookings)
    .set({
      // کستِ صریح لازم است: پستگرس رشته‌های داخل `CASE` را `text` حساب
      // می‌کند و انتساب `text` به ستون شمارشی را رد می‌کند.
      status: sql`(CASE
        WHEN ${teacherCame} AND ${studentCame} THEN 'COMPLETED'
        WHEN ${teacherCame} THEN 'NO_SHOW_STUDENT'
        WHEN ${studentCame} THEN 'NO_SHOW_TEACHER'
        ELSE 'NO_SHOW'
      END)::booking_status`,
      /**
       * پایانِ ثبت‌نشده از روی برنامه پر می‌شود — همان شکافی که سند
       * معماری (بخش ۶.۵) به همین جاب سپرده: کسی که تا لحظه‌ی آخر مانده
       * و جیتسی بیرونش کرده، رویداد خروجش بعد از بسته شدن پنجره می‌رسد
       * و رد می‌شود.
       *
       * فقط وقتی که جلسه‌ای واقعاً شروع شده باشد. برای جلسه‌ای که
       * هیچ‌کس نیامده، «پایان» معنایی ندارد و نوشتنش یعنی داده‌ی ساختگی.
       */
      actualEndedAt: sql`CASE
        WHEN ${bookings.actualStartedAt} IS NULL THEN NULL
        ELSE COALESCE(${bookings.actualEndedAt}, ${bookings.endsAt})
      END`,
    })
    .where(
      and(
        inArray(bookings.status, OPEN_SESSION_STATUSES),
        lt(bookings.endsAt, cutoff),
      ),
    )
    .returning({
      id: bookings.id,
      status: bookings.status,
      teacherId: bookings.teacherId,
      studentId: bookings.studentId,
    });

  return closed as ClosedSession[];
}

/**
 * پس از پرداخت موفق، رزرو را قطعی می‌کند.
 *
 * شرط `PENDING_PAYMENT` در `WHERE` عمدی است و شناسه‌های واقعاً
 * قطعی‌شده برمی‌گردند، نه شناسه‌هایی که خواسته شده بودند. رزروی که در
 * فاصله‌ی رفتن به درگاه و برگشتن منقضی شده، اسلاتش را از دست داده و
 * قطعی کردنش می‌تواند با رزرو کس دیگری تداخل کند. لایه‌ی پرداخت باید
 * این تفاوت را ببیند تا پولِ بی‌جلسه گم نشود.
 */
export async function confirmBookings(
  bookingIds: string[],
  tx: Transaction | Database = db,
): Promise<string[]> {
  if (bookingIds.length === 0) return [];

  const confirmed = await tx
    .update(bookings)
    .set({ status: "CONFIRMED", holdExpiresAt: null })
    .where(
      and(inArray(bookings.id, bookingIds), eq(bookings.status, "PENDING_PAYMENT")),
    )
    .returning({ id: bookings.id });

  return confirmed.map((row) => row.id);
}

export interface CancelBookingInput {
  bookingId: string;
  /** کاربری که لغو را انجام می‌دهد — هنرجو یا استاد */
  actorId: string;
  reason?: string;
  now?: Date;
}

export interface CancellationResult {
  status: string;
  /**
   * آیا جلسه به هنرجو برمی‌گردد یا سوخت می‌شود؟
   *
   * لغو زودهنگام توسط هنرجو و لغو توسط استاد در هر زمان، جلسه را
   * برمی‌گردانند. لغو دیرهنگام توسط هنرجو آن را می‌سوزاند.
   *
   * این تابع فقط تصمیم را برمی‌گرداند؛ ثبت مالی کار ماژول پرداخت است.
   */
  refundable: boolean;
  hoursUntilSession: number;
}

/** وضعیت‌هایی که هنوز می‌شود از آن‌ها لغو کرد. */
const CANCELLABLE_STATUSES = ["PENDING_PAYMENT", "CONFIRMED"] as const;

/** دو بار `users` در یک کوئری: یک بار هنرجو، یک بار استاد. */
const cancelStudent = alias(users, "cancel_student");
const cancelTeacher = alias(users, "cancel_teacher");

/**
 * لغو رزرو.
 *
 * سیاست لغو (docs/architecture.md بخش ۵):
 *   • هنرجو، بیش از ۲۴ ساعت مانده  → جلسه برمی‌گردد
 *   • هنرجو، کمتر از ۲۴ ساعت مانده → جلسه می‌سوزد
 *   • استاد، هر زمان                → جلسه برمی‌گردد
 */
export async function cancelBooking(
  input: CancelBookingInput,
): Promise<CancellationResult> {
  const now = input.now ?? new Date();

  const [booking] = await db
    .select({
      id: bookings.id,
      studentId: bookings.studentId,
      teacherId: bookings.teacherId,
      status: bookings.status,
      scheduledAt: bookings.scheduledAt,
      studentName: cancelStudent.fullName,
      teacherName: cancelTeacher.fullName,
      instrumentName: instruments.nameFa,
    })
    .from(bookings)
    .innerJoin(cancelStudent, eq(cancelStudent.id, bookings.studentId))
    .innerJoin(cancelTeacher, eq(cancelTeacher.id, bookings.teacherId))
    .innerJoin(offerings, eq(offerings.id, bookings.offeringId))
    .innerJoin(instruments, eq(instruments.id, offerings.instrumentId))
    .where(eq(bookings.id, input.bookingId))
    .limit(1);

  if (!booking) {
    throw new BookingNotFoundError(input.bookingId);
  }

  const isStudent = booking.studentId === input.actorId;
  const isTeacher = booking.teacherId === input.actorId;
  if (!isStudent && !isTeacher) {
    throw new NotBookingParticipantError();
  }

  if (!CANCELLABLE_STATUSES.includes(booking.status as (typeof CANCELLABLE_STATUSES)[number])) {
    throw new BookingNotCancellableError(booking.status);
  }

  const hoursUntilSession =
    (booking.scheduledAt.getTime() - now.getTime()) / (60 * MINUTE_MS);

  const nextStatus = isTeacher ? "CANCELLED_BY_TEACHER" : "CANCELLED_BY_STUDENT";
  const refundable =
    isTeacher || hoursUntilSession >= BUSINESS_RULES.FREE_CANCELLATION_HOURS;

  /**
   * شرط وضعیت روی خودِ `UPDATE` تکرار می‌شود، با اینکه چند خط بالاتر
   * بررسی شده.
   *
   * بررسی جدا در برابر دو درخواست هم‌زمان بی‌دفاع است: هر دو رزرو را
   * `CONFIRMED` می‌بینند، هر دو رد می‌شوند و هر دو اعلان می‌فرستند. با
   * شرط روی `UPDATE`، سطر بازگشتی یعنی «همین درخواست لغوش کرد» و اعلان
   * فقط یک بار می‌رود.
   */
  const [claimed] = await db
    .update(bookings)
    .set({
      status: nextStatus,
      cancelledAt: now,
      cancelledById: input.actorId,
      cancellationReason: input.reason ?? null,
      holdExpiresAt: null,
    })
    .where(
      and(
        eq(bookings.id, input.bookingId),
        inArray(bookings.status, [...CANCELLABLE_STATUSES]),
      ),
    )
    .returning({ id: bookings.id });

  /**
   * اعلان فقط به **طرف مقابل** می‌رود.
   *
   * کسی که خودش دکمه‌ی لغو را زده، لازم نیست خبردار شود که لغو شد؛
   * اعلانِ کارِ خودِ کاربر فقط شمارنده‌ی نخوانده‌ها را شلوغ می‌کند و
   * ارزش بقیه‌ی اعلان‌ها را پایین می‌آورد.
   *
   * بیرون از هر تراکنشی و با خطای بلعیده‌شده — همان قاعده‌ی `notifyInApp`:
   * لغوی که ثبت شده نباید به‌خاطر اعلان برگردد.
   */
  if (claimed) {
    const actorName = isTeacher ? booking.teacherName : booking.studentName;
    const when = sessionDateTimeFa(booking.scheduledAt);

    await notifyInApp({
      userId: isTeacher ? booking.studentId : booking.teacherId,
      type: IN_APP_TYPES.BOOKING_CANCELLED,
      message: `${actorName} جلسه‌ی ${booking.instrumentName} (${when}) را لغو کرد.`,
      href: `/sessions/${booking.id}`,
      bookingId: booking.id,
    });
  }

  return { status: nextStatus, refundable, hoursUntilSession };
}

/** ساعت دیواری تهران را به لحظه‌ی UTC تبدیل می‌کند — کمک‌کننده‌ی لایه‌ی API. */
export function tehranSlotToInstant(date: DateKey, startMinute: number): Date {
  return fromTehranWallClock(date, startMinute);
}

/** لحظه‌ی UTC را به ساعت دیواری تهران برمی‌گرداند. */
export function instantToTehranSlot(instant: Date): {
  date: DateKey;
  startMinute: number;
} {
  return {
    date: tehranDateKey(instant),
    startMinute: tehranMinutesOfDay(instant),
  };
}

export { sql };
