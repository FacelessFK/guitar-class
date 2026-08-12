import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Injectable,
  Param,
  Post,
} from "@nestjs/common";
import { z } from "zod";

import { CurrentUserId } from "../common/current-user.decorator.js";
import { uuidSchema } from "../common/schemas.js";
import { zodPipe } from "../common/validation.pipe.js";
import {
  joinClassroom,
  recordAttendance,
  type AttendanceEvent,
} from "./classroom.service.js";
import type { MusicModeConfig } from "./music-mode.js";

@Injectable()
export class ClassroomProvider {
  readonly join = joinClassroom;
  readonly recordAttendance = recordAttendance;
}

/**
 * رویداد حضور.
 *
 * نگاشت سمت فرانت:
 *   `videoConferenceJoined`               → `JOINED`
 *   `participantLeft` یا `readyToClose`   → `LEFT`
 *
 * لحظه‌ی رویداد گرفته **نمی‌شود**؛ ساعت سرور ملاک است. اگر کلاینت زمان
 * می‌فرستاد، ثبت حضور علاوه بر «آمدم یا نه» در «کِی آمدم» هم دستکاری‌پذیر
 * می‌شد و ساختن گزارش عدم حضور از رویش بی‌معنا بود.
 */
const attendanceSchema = z.object({
  event: z.enum(["JOINED", "LEFT"]),
});

interface JoinResponse {
  domain: string;
  roomName: string;
  jwt: string;
  expiresAt: string;
  moderator: boolean;
  config: MusicModeConfig;
}

/**
 * اتاق کلاس.
 *
 * پیشوند مسیر عمداً همان `bookings` است — ورود به کلاس کاری روی یک رزرو
 * است و مسیر باید همان را بگوید. کنترلر جداست چون دامنه‌اش جداست: این
 * یکی با سرور جیتسی حرف می‌زند، آن یکی با موتور دسترس‌پذیری.
 */
@Controller("bookings")
export class ClassroomController {
  constructor(private readonly classroom: ClassroomProvider) {}

  /**
   * بلیت ورود به کلاس.
   *
   * `config` را باید عیناً به `configOverwrite` هنگام ساخت IFrame داد؛
   * پروفایل «حالت موسیقی» است و بدون آن، پردازش‌های پیش‌فرض صوتی جیتسی
   * صدای ساز را تخریب می‌کنند.
   *
   * پاسخ ۲۰۰ است نه ۲۰۱: چیزی ساخته نمی‌شود، توکن صادر می‌شود.
   */
  @Post(":bookingId/join")
  @HttpCode(HttpStatus.OK)
  async join(
    @CurrentUserId() userId: string,
    @Param("bookingId", zodPipe(uuidSchema)) bookingId: string,
  ): Promise<JoinResponse> {
    const ticket = await this.classroom.join({ bookingId, userId });

    return {
      domain: ticket.domain,
      roomName: ticket.roomName,
      jwt: ticket.jwt,
      expiresAt: ticket.expiresAt.toISOString(),
      moderator: ticket.moderator,
      config: ticket.config,
    };
  }

  /** گزارش ورود و خروج از اتاق، برای پر کردن زمان واقعی جلسه. */
  @Post(":bookingId/attendance")
  @HttpCode(HttpStatus.OK)
  async attendance(
    @CurrentUserId() userId: string,
    @Param("bookingId", zodPipe(uuidSchema)) bookingId: string,
    @Body(zodPipe(attendanceSchema)) body: z.infer<typeof attendanceSchema>,
  ): Promise<{
    status: string;
    actualStartedAt: string | null;
    actualEndedAt: string | null;
  }> {
    const result = await this.classroom.recordAttendance({
      bookingId,
      userId,
      event: body.event as AttendanceEvent,
    });

    return {
      status: result.status,
      actualStartedAt: result.actualStartedAt?.toISOString() ?? null,
      actualEndedAt: result.actualEndedAt?.toISOString() ?? null,
    };
  }
}
