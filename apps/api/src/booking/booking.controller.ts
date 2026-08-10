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
import { bookings } from "../db/schema/index.js";
import {
  cancelBooking,
  createPackageEnrollment,
  createSingleBooking,
  createTrialBooking,
} from "./booking.service.js";
import { zodPipe } from "../common/validation.pipe.js";
import { CurrentUserId } from "../common/current-user.decorator.js";
import { dateKeySchema, minuteOfDaySchema, uuidSchema } from "../common/schemas.js";

@Injectable()
export class BookingProvider {
  readonly createTrial = createTrialBooking;
  readonly createSingle = createSingleBooking;
  readonly createPackage = createPackageEnrollment;
  readonly cancel = cancelBooking;
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
  sessionCount: z.number().int().min(1).max(12).optional(),
});

const cancelSchema = z.object({
  reason: z.string().max(500).optional(),
});

interface BookingView {
  id: string;
  roomId: string;
  type: string;
  status: string;
  scheduledAt: string;
  endsAt: string;
  date: string;
  startTime: string;
  weekdayName: string;
  holdExpiresAt: string | null;
  price: string;
}

function toBookingView(booking: {
  id: string;
  roomId: string;
  type?: string;
  status: string;
  scheduledAt: Date;
  endsAt: Date;
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
    weekdayName: weekdayNameFa(tehranWeekday(booking.scheduledAt)),
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
      sessionCount: body.sessionCount,
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
  ): Promise<{ status: string; refundable: boolean }> {
    const result = await this.booking.cancel({
      bookingId,
      actorId,
      reason: body.reason,
    });

    return { status: result.status, refundable: result.refundable };
  }

  /** رزروهای کاربر جاری، چه به عنوان هنرجو و چه به عنوان استاد. */
  @Get("me")
  async listMine(@CurrentUserId() userId: string): Promise<{ bookings: BookingView[] }> {
    const rows = await db
      .select()
      .from(bookings)
      .where(or(eq(bookings.studentId, userId), eq(bookings.teacherId, userId)))
      .orderBy(desc(bookings.scheduledAt))
      .limit(100);

    return { bookings: rows.map(toBookingView) };
  }

  /** جزئیات یک رزرو. فقط طرفین آن دسترسی دارند. */
  @Get(":bookingId")
  async getOne(
    @CurrentUserId() userId: string,
    @Param("bookingId", zodPipe(uuidSchema)) bookingId: string,
  ): Promise<BookingView | null> {
    const [row] = await db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.id, bookingId),
          or(eq(bookings.studentId, userId), eq(bookings.teacherId, userId)),
        ),
      )
      .limit(1);

    return row ? toBookingView(row) : null;
  }
}
