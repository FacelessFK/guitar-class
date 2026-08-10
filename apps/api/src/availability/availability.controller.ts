import { Body, Controller, Get, Injectable, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import {
  formatMinutes,
  tehranDateKey,
  tehranMinutesOfDay,
  weekdayNameFa,
  tehranWeekday,
  type Interval,
} from "@music/shared";

import {
  getAvailableSlots,
  getTrialSlots,
  previewPackage,
} from "./availability.service.js";
import { zodPipe } from "../common/validation.pipe.js";
import {
  dateKeySchema,
  dateRangeSchema,
  minuteOfDaySchema,
  uuidSchema,
} from "../common/schemas.js";

/**
 * پروایدر نازک دور توابع سرویس.
 *
 * منطق واقعی در ماژول‌های تابعی و فارغ از فریم‌ورک می‌ماند تا بدون
 * بالا آوردن Nest قابل تست باشد. این کلاس فقط آن‌ها را وارد گراف
 * تزریق وابستگی می‌کند.
 */
@Injectable()
export class AvailabilityProvider {
  readonly slots = getAvailableSlots;
  readonly trialSlots = getTrialSlots;
  readonly packagePreview = previewPackage;
}

/**
 * نمایش یک اسلات به کاربر.
 *
 * هم لحظه‌ی مطلق UTC می‌آید و هم ساعت دیواری تهران. فرانت‌اند برای
 * نمایش به دومی نیاز دارد و اگر خودش تبدیل کند، منطق منطقه‌ی زمانی در
 * دو جا تکرار می‌شود.
 */
interface SlotView {
  startAt: string;
  endAt: string;
  date: string;
  startTime: string;
  endTime: string;
  weekday: number;
  weekdayName: string;
}

function toSlotView(slot: Interval): SlotView {
  const start = new Date(slot.start);
  const end = new Date(slot.end);

  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    date: tehranDateKey(start),
    startTime: formatMinutes(tehranMinutesOfDay(start)),
    endTime: formatMinutes(tehranMinutesOfDay(end)),
    weekday: tehranWeekday(start),
    weekdayName: weekdayNameFa(tehranWeekday(start)),
  };
}

const packagePreviewSchema = z.object({
  teacherProfileId: uuidSchema,
  firstSessionDate: dateKeySchema,
  startMinute: minuteOfDaySchema,
  sessionCount: z.number().int().min(1).max(12).optional(),
});

const availabilityQuerySchema = dateRangeSchema.and(
  z.object({ teacherProfileId: uuidSchema }),
);

@Controller("offerings/:offeringId")
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityProvider) {}

  /** اسلات‌های آزاد برای جلسه‌ی عادی. */
  @Get("availability")
  async getAvailability(
    @Param("offeringId", zodPipe(uuidSchema)) offeringId: string,
    @Query(zodPipe(availabilityQuerySchema))
    query: { from: string; to: string; teacherProfileId: string },
  ): Promise<{ slots: SlotView[] }> {
    const slots = await this.availability.slots({
      teacherProfileId: query.teacherProfileId,
      offeringId,
      from: query.from,
      to: query.to,
    });

    return { slots: slots.map(toSlotView) };
  }

  /**
   * اسلات‌های آزاد برای جلسه‌ی معارفه.
   *
   * جدا از بالا است چون طول جلسه‌ی معارفه ثابت ۲۰ دقیقه است و نه طول
   * سرویس، پس شبکه‌ی ساعت‌ها هم متفاوت می‌شود.
   */
  @Get("availability/trial")
  async getTrialAvailability(
    @Param("offeringId", zodPipe(uuidSchema)) offeringId: string,
    @Query(zodPipe(availabilityQuerySchema))
    query: { from: string; to: string; teacherProfileId: string },
  ): Promise<{ slots: SlotView[] }> {
    const slots = await this.availability.trialSlots({
      teacherProfileId: query.teacherProfileId,
      offeringId,
      from: query.from,
      to: query.to,
    });

    return { slots: slots.map(toSlotView) };
  }

  /**
   * پیش‌نمایش پکیج ماهانه، پیش از پرداخت.
   *
   * هیچ رکوردی نمی‌سازد. اگر هفته‌ای آزاد نباشد، همان‌جا معلوم می‌شود تا
   * هنرجو ساعت دیگری انتخاب کند.
   */
  @Post("availability/package-preview")
  async previewPackagePlan(
    @Param("offeringId", zodPipe(uuidSchema)) offeringId: string,
    @Body(zodPipe(packagePreviewSchema))
    body: z.infer<typeof packagePreviewSchema>,
  ): Promise<{
    ok: boolean;
    sessions: SlotView[];
    conflicts: Array<{ sessionIndex: number; date: string }>;
  }> {
    const plan = await this.availability.packagePreview({
      teacherProfileId: body.teacherProfileId,
      offeringId,
      firstSessionDate: body.firstSessionDate,
      startMinute: body.startMinute,
      sessionCount: body.sessionCount,
    });

    return {
      ok: plan.ok,
      sessions: plan.sessions.map(toSlotView),
      conflicts: plan.conflicts.map((conflict) => ({
        sessionIndex: conflict.index,
        date: conflict.date,
      })),
    };
  }
}
