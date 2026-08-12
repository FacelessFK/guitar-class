/**
 * ورود به کلاس و ثبت حضور.
 *
 * قاعده‌ی اصلی این ماژول: **خارج از شرایط، توکن اصلاً صادر نمی‌شود.**
 * نه اینکه صادر شود و جیتسی ردش کند. دلیلش هم امنیت است و هم تجربه‌ی
 * کاربر: توکنِ ردشده در مرورگر فقط یک «Authentication required» انگلیسی
 * نشان می‌دهد، ولی اینجا می‌توانیم بگوییم «اتاق ۱۰ دقیقه‌ی دیگر باز
 * می‌شود» یا «این جلسه هنوز پرداخت نشده».
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { roomState, roomWindow, type Interval } from "@music/shared";

import { db } from "../db/client.js";
import { bookings, users } from "../db/schema/index.js";
import {
  BookingNotFoundError,
  NotBookingParticipantError,
} from "../booking/errors.js";
import {
  BookingNotJoinableError,
  RoomClosedError,
  RoomNotOpenYetError,
} from "./errors.js";
import { jitsiDomain, signRoomToken } from "./jitsi.js";
import { MUSIC_MODE, type MusicModeConfig } from "./music-mode.js";

/**
 * وضعیت‌هایی که ورود به اتاق از آن‌ها ممکن است.
 *
 * `IN_PROGRESS` هست چون اولین نفری که وارد می‌شود وضعیت را عوض می‌کند و
 * نفر دوم باید بتواند بیاید. `PENDING_PAYMENT` عمداً نیست: رزروِ
 * پرداخت‌نشده اسلات را قفل کرده ولی هنوز خریده نشده.
 */
const JOINABLE_STATUSES = ["CONFIRMED", "IN_PROGRESS"] as const;

interface BookingRow {
  id: string;
  roomId: string;
  studentId: string;
  teacherId: string;
  status: string;
  scheduledAt: Date;
  endsAt: Date;
  actualStartedAt: Date | null;
  actualEndedAt: Date | null;
}

async function loadBooking(bookingId: string): Promise<BookingRow> {
  const [booking] = await db
    .select({
      id: bookings.id,
      roomId: bookings.roomId,
      studentId: bookings.studentId,
      teacherId: bookings.teacherId,
      status: bookings.status,
      scheduledAt: bookings.scheduledAt,
      endsAt: bookings.endsAt,
      actualStartedAt: bookings.actualStartedAt,
      actualEndedAt: bookings.actualEndedAt,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking) {
    throw new BookingNotFoundError(bookingId);
  }

  return booking;
}

const sessionInterval = (booking: BookingRow): Interval => ({
  start: booking.scheduledAt.getTime(),
  end: booking.endsAt.getTime(),
});

/**
 * سه بررسی‌ای که هر دو اندپوینت این ماژول لازم دارند: طرفِ رزرو بودن،
 * وضعیت، و پنجره‌ی زمانی.
 *
 * ترتیبشان عمدی است. «شما به این رزرو دسترسی ندارید» باید پیش از هر
 * حرفی درباره‌ی وضعیت یا ساعت جلسه بیاید، وگرنه پیام خطا به کسی که طرف
 * رزرو نیست می‌گوید این رزرو وجود دارد و کِی است.
 */
function assertMayEnterRoom(
  booking: BookingRow,
  userId: string,
  now: Date,
): { isTeacher: boolean } {
  const isStudent = booking.studentId === userId;
  const isTeacher = booking.teacherId === userId;

  if (!isStudent && !isTeacher) {
    throw new NotBookingParticipantError();
  }

  if (!JOINABLE_STATUSES.includes(booking.status as (typeof JOINABLE_STATUSES)[number])) {
    throw new BookingNotJoinableError(booking.status);
  }

  const state = roomState(sessionInterval(booking), now.getTime());

  if (state === "TOO_EARLY") {
    throw new RoomNotOpenYetError(new Date(roomWindow(sessionInterval(booking)).start));
  }

  if (state === "CLOSED") {
    throw new RoomClosedError();
  }

  return { isTeacher };
}

export interface JoinClassroomInput {
  bookingId: string;
  userId: string;
  now?: Date;
}

export interface ClassroomTicket {
  /** دامنه‌ی عمومی جیتسی */
  domain: string;
  /** نام اتاق = `bookings.room_id` */
  roomName: string;
  jwt: string;
  /** انقضای توکن، برای اینکه فرانت پیش از بسته شدن اتاق هشدار بدهد */
  expiresAt: Date;
  moderator: boolean;
  /** عیناً به `configOverwrite` در IFrame API داده می‌شود */
  config: MusicModeConfig;
}

/**
 * بلیت ورود به کلاس.
 *
 * `nbf` و `exp` توکن دقیقاً همان دو لبه‌ی پنجره‌ی مجاز ورودند. یعنی
 * توکنی که همین حالا صادر می‌شود، بعد از پایان مهلت جلسه خودبه‌خود از
 * کار می‌افتد و کلیدِ همیشگی آن اتاق نمی‌شود.
 */
export async function joinClassroom(
  input: JoinClassroomInput,
): Promise<ClassroomTicket> {
  const now = input.now ?? new Date();
  const booking = await loadBooking(input.bookingId);
  const { isTeacher } = assertMayEnterRoom(booking, input.userId, now);

  const [user] = await db
    .select({ fullName: users.fullName, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);

  if (!user) {
    // گارد احراز هویت از قبل توکن را بررسی کرده، پس رسیدن به اینجا یعنی
    // کاربر بین دو درخواست حذف شده — نه خطای کاربر، نه حالت عادی.
    throw new NotBookingParticipantError();
  }

  const window = roomWindow(sessionInterval(booking));
  const expiresAt = new Date(window.end);

  const jwt = await signRoomToken({
    roomId: booking.roomId,
    userId: input.userId,
    displayName: user.fullName,
    avatarUrl: user.avatarUrl,
    moderator: isTeacher,
    notBefore: new Date(window.start),
    expiresAt,
  });

  return {
    domain: jitsiDomain(),
    roomName: booking.roomId,
    jwt,
    expiresAt,
    moderator: isTeacher,
    config: MUSIC_MODE,
  };
}

/**
 * رویدادهای IFrame API که به ثبت حضور ترجمه می‌شوند.
 *
 * فرانت `videoConferenceJoined` را به `JOINED` و `participantLeft`
 * یا `readyToClose` را به `LEFT` نگاشت می‌کند. نام‌های جیتسی عمداً وارد
 * دامنه نمی‌شوند تا ارتقای IFrame API به تغییر اسکیمای API منجر نشود.
 */
export type AttendanceEvent = "JOINED" | "LEFT";

export interface RecordAttendanceInput {
  bookingId: string;
  userId: string;
  event: AttendanceEvent;
  now?: Date;
}

export interface AttendanceResult {
  status: string;
  actualStartedAt: Date | null;
  actualEndedAt: Date | null;
}

/**
 * ثبت حضور.
 *
 * ⚠️ **این داده از سمت کلاینت می‌آید و قابل دستکاری است.** لحظه‌ها
 * ساعتِ سرورند (کلاینت زمان نمی‌فرستد) و فقط داخل پنجره‌ی باز بودن اتاق
 * پذیرفته می‌شوند، پس نمی‌شود ساعت دلخواه جا زد. ولی کاربری که اصلاً
 * وارد اتاق نشده هم می‌تواند همین درخواست را بفرستد و «حاضر» ثبت شود.
 *
 * برای گزارش عادی کافی است، برای رفع اختلاف مالی نه. راه‌حل واقعی، هوک
 * سمت سرور جیتسی است که در فاز بعد اضافه می‌شود (سند معماری، بخش ۶.۵).
 * تا آن موقع این بدهی در README ثبت است.
 *
 * نکته‌ی دیگر: `LEFT` بعد از بسته شدن اتاق رد می‌شود. یعنی کسی که تا
 * لحظه‌ی آخر مانده و جیتسی بیرونش کرده، `actual_ended_at` ثبت‌شده ندارد.
 * جبرانش کار جابِ بستن خودکار جلسه است که پایان را از روی برنامه حساب
 * می‌کند، نه کار این اندپوینت — اینجا نباید زمانی نوشته شود که هیچ‌کس
 * گزارشش نکرده.
 */
export async function recordAttendance(
  input: RecordAttendanceInput,
): Promise<AttendanceResult> {
  const now = input.now ?? new Date();
  const booking = await loadBooking(input.bookingId);
  assertMayEnterRoom(booking, input.userId, now);

  if (input.event === "JOINED") {
    /**
     * `COALESCE` یعنی نفر دوم شروع را جابه‌جا نمی‌کند: «کِی جلسه شروع
     * شد» یعنی لحظه‌ی ورود اولین نفر. اتمی است تا ورود هم‌زمان استاد و
     * هنرجو دو مقدار متفاوت ننویسد.
     */
    const [updated] = await db
      .update(bookings)
      .set({
        // داخل `sql` نگاشتِ ستون اعمال نمی‌شود، پس `Date` خام به درایور
        // می‌رسد و رد می‌شود؛ رشته‌ی ISO با کست صریح فرستاده می‌شود.
        actualStartedAt: sql`COALESCE(${bookings.actualStartedAt}, ${now.toISOString()}::timestamptz)`,
        status: "IN_PROGRESS",
      })
      .where(
        and(eq(bookings.id, booking.id), inArray(bookings.status, JOINABLE_STATUSES)),
      )
      .returning({
        status: bookings.status,
        actualStartedAt: bookings.actualStartedAt,
        actualEndedAt: bookings.actualEndedAt,
      });

    return updated ?? toResult(booking);
  }

  /**
   * خروج فقط وقتی معنا دارد که ورودی ثبت شده باشد. گزارشِ خروجِ بدون
   * ورود بی‌صدا نادیده گرفته می‌شود، نه اینکه پایانِ بدونِ شروع بنویسد.
   *
   * آخرین خروج جایگزین قبلی می‌شود: هر کس دیرتر رفته، لحظه‌ی خالی شدن
   * اتاق همان است.
   */
  const [updated] = await db
    .update(bookings)
    .set({ actualEndedAt: now })
    .where(and(eq(bookings.id, booking.id), eq(bookings.status, "IN_PROGRESS")))
    .returning({
      status: bookings.status,
      actualStartedAt: bookings.actualStartedAt,
      actualEndedAt: bookings.actualEndedAt,
    });

  return updated ?? toResult(booking);
}

function toResult(booking: BookingRow): AttendanceResult {
  return {
    status: booking.status,
    actualStartedAt: booking.actualStartedAt,
    actualEndedAt: booking.actualEndedAt,
  };
}
