import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Param,
  Post,
} from "@nestjs/common";
import { and, desc, eq, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import {
  formatMinutes,
  fromTehranWallClock,
  tehranDateKey,
  tehranMinutesOfDay,
  tehranWeekday,
  weekdayNameFa,
} from "@music/shared";

import { db } from "../db/client.js";
import {
  bookings,
  instruments,
  offerings,
  teacherProfiles,
  teacherReviews,
  users,
} from "../db/schema/index.js";
import {
  cancelBooking,
  createPackageEnrollment,
  createSingleBooking,
  createTrialBooking,
} from "./booking.service.js";
import { recordCancellationRefund } from "../payment/payment.service.js";
import { zodPipe } from "../common/validation.pipe.js";
import { CurrentUserId } from "../common/current-user.decorator.js";
import { dateKeySchema, minuteOfDaySchema, uuidSchema } from "../common/schemas.js";

@Injectable()
export class BookingProvider {
  readonly createTrial = createTrialBooking;
  readonly createSingle = createSingleBooking;
  readonly createPackage = createPackageEnrollment;
  readonly cancel = cancelBooking;
  /**
   * سرویس رزرو فقط تصمیم می‌گیرد جلسه برمی‌گردد یا می‌سوزد؛ ثبت مالی
   * کار ماژول پرداخت است. جهت وابستگی همین است و برعکسش نه — دامنه‌ی
   * رزرو نباید از وجود دفتر کل خبر داشته باشد.
   */
  readonly recordRefund = recordCancellationRefund;
}

/**
 * اسلات به صورت «تاریخ + دقیقه به وقت تهران» گرفته می‌شود، نه به صورت
 * ISO با منطقه‌ی زمانی.
 *
 * دلیل: کاربر «شنبه ساعت ۱۷» را انتخاب می‌کند. اگر کلاینت خودش به UTC
 * تبدیل کند، منطق منطقه‌ی زمانی در دو جا تکرار می‌شود و اختلافشان به
 * رزرو در ساعت اشتباه منجر می‌شود. تبدیل فقط یک جا انجام می‌شود: اینجا.
 */
const slotSchema = z.object({
  teacherProfileId: uuidSchema,
  offeringId: uuidSchema,
  date: dateKeySchema,
  startMinute: minuteOfDaySchema,
});

const packageSchema = z.object({
  teacherProfileId: uuidSchema,
  offeringId: uuidSchema,
  firstSessionDate: dateKeySchema,
  startMinute: minuteOfDaySchema,
});

const cancelSchema = z.object({
  reason: z.string().max(500).optional(),
});

/**
 * رزرو، همان‌طور که بلافاصله پس از ساخته شدن برمی‌گردد.
 *
 * ساعت هم به صورت لحظه‌ی مطلق UTC می‌آید و هم به صورت ساعت دیواری
 * تهران. اگر فقط اولی بود، فرانت باید خودش تبدیل می‌کرد و منطق منطقه‌ی
 * زمانی در دو جا تکرار می‌شد.
 */
interface BookingView {
  id: string;
  roomId: string;
  type: string;
  status: string;
  scheduledAt: string;
  endsAt: string;
  date: string;
  startTime: string;
  endTime: string;
  weekdayName: string;
  durationMinutes: number;
  holdExpiresAt: string | null;
  price: string;
}

/**
 * همان رزرو، به‌علاوه‌ی چیزهایی که فقط در فهرست معنا دارند.
 *
 * جدا از `BookingView` است چون پر کردنش به سه `JOIN` نیاز دارد و
 * اندپوینت‌های ساخت رزرو هیچ‌کدامشان را لازم ندارند — کاربر بعد از رزرو
 * مستقیم به درگاه می‌رود، نه به صفحه‌ای که نام ساز را نشان دهد.
 *
 * `role` می‌گوید کاربر جاری در این رزرو هنرجوست یا استاد. یک اندپوینت
 * برای هر دو نقش است (`GET bookings/me`) و بدون این فیلد، فرانت باید
 * شناسه‌ی کاربر را با `studentId` مقایسه کند — یعنی همان تصمیم را دوباره
 * و این بار سمت کلاینت بگیرد.
 */
interface BookingDetailView extends BookingView {
  role: "STUDENT" | "TEACHER";
  /** نام طرف مقابل: برای هنرجو نام استاد، برای استاد نام هنرجو */
  counterpartName: string;
  /** اسلاگ پروفایل عمومی استاد — فقط برای لینک، ممکن است نباشد */
  teacherSlug: string | null;
  instrumentName: string;
  /**
   * اگر پر باشد، این جلسه بخشی از یک پکیج است.
   *
   * فرانت بدون آن نمی‌تواند درست رفتار کند: جلسه‌ی پکیج **جداگانه
   * پرداخت نمی‌شود** و چهار جلسه‌ی یک پکیج نباید چهار دکمه‌ی پرداخت
   * نشان دهند که سه‌تایشان با خطا برمی‌گردند.
   */
  enrollmentId: string | null;
  /** جلسه‌ی چندم از پکیج (۱ تا ۴)؛ برای جلسه‌ی مستقل تهی است */
  sessionIndex: number | null;
  /** هنرجو می‌تواند به این جلسه امتیاز بدهد: تمام‌شده و هنوز نظر نداده */
  canReview: boolean;
}

function toBookingView(booking: {
  id: string;
  roomId: string;
  type?: string;
  status: string;
  scheduledAt: Date;
  endsAt: Date;
  durationMinutes?: number;
  holdExpiresAt: Date | null;
  priceSnapshot: bigint;
}): BookingView {
  return {
    id: booking.id,
    roomId: booking.roomId,
    type: booking.type ?? "",
    status: booking.status,
    scheduledAt: booking.scheduledAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    date: tehranDateKey(booking.scheduledAt),
    startTime: formatMinutes(tehranMinutesOfDay(booking.scheduledAt)),
    endTime: formatMinutes(tehranMinutesOfDay(booking.endsAt)),
    weekdayName: weekdayNameFa(tehranWeekday(booking.scheduledAt)),
    durationMinutes:
      booking.durationMinutes ??
      Math.round((booking.endsAt.getTime() - booking.scheduledAt.getTime()) / 60_000),
    holdExpiresAt: booking.holdExpiresAt?.toISOString() ?? null,
    price: booking.priceSnapshot.toString(),
  };
}

@Controller("bookings")
export class BookingController {
  constructor(private readonly booking: BookingProvider) {}

  /** جلسه‌ی معارفه‌ی رایگان — یک‌بار برای همیشه به ازای هر کاربر. */
  @Post("trial")
  @HttpCode(HttpStatus.CREATED)
  async createTrial(
    @CurrentUserId() studentId: string,
    @Body(zodPipe(slotSchema)) body: z.infer<typeof slotSchema>,
  ): Promise<BookingView> {
    const created = await this.booking.createTrial({
      studentId,
      teacherProfileId: body.teacherProfileId,
      offeringId: body.offeringId,
      scheduledAt: fromTehranWallClock(body.date, body.startMinute),
    });

    return toBookingView({ ...created, type: "TRIAL" });
  }

  /**
   * جلسه‌ی تکی.
   *
   * با وضعیت `PENDING_PAYMENT` ساخته می‌شود و `holdExpiresAt` برمی‌گردد
   * تا فرانت بتواند شمارش معکوس پرداخت را نشان دهد.
   */
  @Post("single")
  @HttpCode(HttpStatus.CREATED)
  async createSingle(
    @CurrentUserId() studentId: string,
    @Body(zodPipe(slotSchema)) body: z.infer<typeof slotSchema>,
  ): Promise<BookingView> {
    const created = await this.booking.createSingle({
      studentId,
      teacherProfileId: body.teacherProfileId,
      offeringId: body.offeringId,
      scheduledAt: fromTehranWallClock(body.date, body.startMinute),
    });

    return toBookingView({ ...created, type: "SINGLE" });
  }

  /** پکیج ماهانه — همه‌ی جلسات یا هیچ‌کدام. */
  @Post("package")
  @HttpCode(HttpStatus.CREATED)
  async createPackage(
    @CurrentUserId() studentId: string,
    @Body(zodPipe(packageSchema)) body: z.infer<typeof packageSchema>,
  ): Promise<{
    enrollmentId: string;
    priceTotal: string;
    bookings: BookingView[];
  }> {
    const result = await this.booking.createPackage({
      studentId,
      teacherProfileId: body.teacherProfileId,
      offeringId: body.offeringId,
      firstSessionDate: body.firstSessionDate,
      startMinute: body.startMinute,
    });

    return {
      enrollmentId: result.enrollmentId,
      priceTotal: result.priceTotal.toString(),
      bookings: result.bookings.map((item) => toBookingView({ ...item, type: "PACKAGE" })),
    };
  }

  @Post(":bookingId/cancel")
  async cancel(
    @CurrentUserId() actorId: string,
    @Param("bookingId", zodPipe(uuidSchema)) bookingId: string,
    @Body(zodPipe(cancelSchema)) body: z.infer<typeof cancelSchema>,
  ): Promise<{
    status: string;
    refundable: boolean;
    refunded: boolean;
    creditGranted: string | null;
  }> {
    const result = await this.booking.cancel({
      bookingId,
      actorId,
      reason: body.reason,
    });

    /**
     * `refundable` تصمیم سیاست است و `refunded` اتفاق مالی.
     * لغو یک رزروِ هنوز پرداخت‌نشده، برگشت‌پذیر است ولی چیزی برای
     * برگرداندن ندارد — فرانت باید این دو را از هم جدا ببیند.
     *
     * `creditGranted` مبلغی است که همین لحظه به اعتبار هنرجو رفت.
     * `null` یعنی چیزی اضافه نشد — یا جلسه سوخته، یا پرداخت‌نشده بوده،
     * یا اعتبارش از قبل ثبت شده. فرانت بدون این عدد فقط می‌تواند بگوید
     * «لغو شد»، و هنرجویی که پول داده باید همان‌جا ببیند کجا رفت.
     */
    const settlement = await this.booking.recordRefund({
      bookingId,
      refundable: result.refundable,
    });

    return {
      status: result.status,
      refundable: result.refundable,
      refunded: settlement?.refund != null,
      creditGranted: settlement?.credit?.toString() ?? null,
    };
  }

  /** رزروهای کاربر جاری، چه به عنوان هنرجو و چه به عنوان استاد. */
  @Get("me")
  async listMine(
    @CurrentUserId() userId: string,
  ): Promise<{ bookings: BookingDetailView[] }> {
    const rows = await detailQuery()
      .where(or(eq(bookings.studentId, userId), eq(bookings.teacherId, userId)))
      .orderBy(desc(bookings.scheduledAt))
      .limit(100);

    return { bookings: rows.map((row) => toBookingDetailView(row, userId)) };
  }

  /** جزئیات یک رزرو. فقط طرفین آن دسترسی دارند. */
  @Get(":bookingId")
  async getOne(
    @CurrentUserId() userId: string,
    @Param("bookingId", zodPipe(uuidSchema)) bookingId: string,
  ): Promise<BookingDetailView | null> {
    const [row] = await detailQuery()
      .where(
        and(
          eq(bookings.id, bookingId),
          or(eq(bookings.studentId, userId), eq(bookings.teacherId, userId)),
        ),
      )
      .limit(1);

    return row ? toBookingDetailView(row, userId) : null;
  }
}

/**
 * دو بار `users` در یک کوئری لازم است — یک بار برای هنرجو و یک بار
 * برای استاد — پس هر کدام نام مستعار خودش را می‌گیرد.
 */
const studentUser = alias(users, "student_user");
const teacherUser = alias(users, "teacher_user");

/**
 * پایه‌ی کوئریِ فهرست و جزئیات.
 *
 * یکی است چون هر دو دقیقاً یک شکل داده برمی‌گردانند و فقط شرطشان فرق
 * دارد؛ دو نسخه‌ی جدا یعنی اضافه شدن یک ستون به یکی و نه به دیگری.
 *
 * `teacherProfiles` با `leftJoin` می‌آید نه `innerJoin`: اگر روزی
 * پروفایل استادی حذف شود، رزروهای گذشته‌اش باید همچنان در فهرست هنرجو
 * دیده شوند، فقط بدون لینک به صفحه‌ی عمومی.
 */
function detailQuery() {
  return db
    .select({
      id: bookings.id,
      roomId: bookings.roomId,
      type: bookings.type,
      status: bookings.status,
      scheduledAt: bookings.scheduledAt,
      endsAt: bookings.endsAt,
      durationMinutes: bookings.durationMinutes,
      holdExpiresAt: bookings.holdExpiresAt,
      priceSnapshot: bookings.priceSnapshot,
      enrollmentId: bookings.enrollmentId,
      sessionIndex: bookings.sessionIndex,
      studentId: bookings.studentId,
      studentName: studentUser.fullName,
      teacherName: teacherUser.fullName,
      teacherSlug: teacherProfiles.slug,
      instrumentName: instruments.nameFa,
      /**
       * فقط برای دانستنِ «نظر داده شده یا نه» — شناسه‌اش خام برنمی‌گردد.
       * `leftJoin` است چون بیشترِ رزروها نظری ندارند و نبودنش `null`
       * می‌ماند، نه حذفِ سطر.
       */
      reviewId: teacherReviews.id,
    })
    .from(bookings)
    .innerJoin(studentUser, eq(bookings.studentId, studentUser.id))
    .innerJoin(teacherUser, eq(bookings.teacherId, teacherUser.id))
    .leftJoin(teacherProfiles, eq(teacherProfiles.userId, bookings.teacherId))
    .leftJoin(teacherReviews, eq(teacherReviews.bookingId, bookings.id))
    .innerJoin(offerings, eq(bookings.offeringId, offerings.id))
    .innerJoin(instruments, eq(offerings.instrumentId, instruments.id));
}

type DetailRow = Awaited<ReturnType<ReturnType<typeof detailQuery>["execute"]>>[number];

function toBookingDetailView(row: DetailRow, userId: string): BookingDetailView {
  const isStudent = row.studentId === userId;

  return {
    ...toBookingView(row),
    role: isStudent ? "STUDENT" : "TEACHER",
    counterpartName: isStudent ? row.teacherName : row.studentName,
    teacherSlug: row.teacherSlug,
    instrumentName: row.instrumentName,
    enrollmentId: row.enrollmentId,
    sessionIndex: row.sessionIndex,
    /**
     * فقط هنرجو، فقط جلسه‌ی تمام‌شده، و فقط اگر هنوز نظر نداده. همان سه
     * شرطی که سرویسِ نظر هم می‌سنجد؛ اینجا محاسبه می‌شود تا فرانت فرمِ
     * نظر را روی جلسه‌ای که واجد شرایط نیست اصلاً نشان ندهد.
     */
    canReview: isStudent && row.status === "COMPLETED" && row.reviewId === null,
  };
}
