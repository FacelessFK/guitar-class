import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Param,
  Post,
} from "@nestjs/common";
import { z } from "zod";
import { tehranDateKey } from "@music/shared";

import { CurrentUserId } from "../common/current-user.decorator.js";
import { dateKeySchema, minuteOfDaySchema, uuidSchema } from "../common/schemas.js";
import { zodPipe } from "../common/validation.pipe.js";
import {
  createException,
  createRule,
  deleteException,
  deleteRule,
  getSchedule,
  getTeacherProfile,
  type ExceptionView,
  type RuleView,
  type TeacherProfileView,
} from "./teacher.service.js";
import type { Weekday } from "@music/shared";

@Injectable()
export class TeacherProvider {
  readonly profile = getTeacherProfile;
  readonly schedule = getSchedule;
  readonly createRule = createRule;
  readonly deleteRule = deleteRule;
  readonly createException = createException;
  readonly deleteException = deleteException;
}

/**
 * پایان بازه می‌تواند ۱۴۴۰ باشد («تا نیمه‌شب») ولی شروع نه.
 * `minuteOfDaySchema` سقفش ۱۴۳۹ است، پس پایان اسکیمای خودش را دارد.
 */
const endMinuteSchema = z
  .number()
  .int("دقیقه باید عدد صحیح باشد")
  .min(1, "پایان بازه نمی‌تواند نیمه‌شب باشد")
  .max(1440, "پایان بازه نمی‌تواند بیشتر از ۲۴:۰۰ باشد");

const ruleSchema = z
  .object({
    /** شنبه = ۰ ... جمعه = ۶ — عمداً با `Date.getDay()` فرق دارد */
    weekday: z.number().int().min(0, "روز هفته نامعتبر است").max(6, "روز هفته نامعتبر است"),
    startMinute: minuteOfDaySchema,
    endMinute: endMinuteSchema,
    validFrom: dateKeySchema,
    validUntil: dateKeySchema.nullable().optional(),
  })
  .refine((value) => value.startMinute < value.endMinute, {
    message: "ساعت شروع باید پیش از ساعت پایان باشد",
    path: ["startMinute"],
  })
  .refine((value) => !value.validUntil || value.validFrom <= value.validUntil, {
    message: "تاریخ پایان اعتبار نمی‌تواند پیش از تاریخ شروع باشد",
    path: ["validUntil"],
  });

/**
 * استثنا: ساعت یا هر دو تهی است (کل روز) یا هر دو پر.
 *
 * `EXTRA` بدون ساعت رد می‌شود — «کل این روز آزادم» جایش قانون هفتگی
 * است، نه استثنا. قید `availability_exceptions_extra_needs_time` در
 * دیتابیس هم همین را می‌گوید؛ اینجا با پیام فارسی جلویش گرفته می‌شود.
 */
const exceptionSchema = z
  .object({
    date: dateKeySchema,
    type: z.enum(["BLOCK", "EXTRA"], { message: "نوع استثنا نامعتبر است" }),
    startMinute: minuteOfDaySchema.nullable().optional(),
    endMinute: endMinuteSchema.nullable().optional(),
    reason: z.string().trim().max(200).optional(),
  })
  .refine(
    (value) =>
      (value.startMinute === null || value.startMinute === undefined) ===
      (value.endMinute === null || value.endMinute === undefined),
    { message: "ساعت شروع و پایان باید با هم پر یا با هم خالی باشند", path: ["endMinute"] },
  )
  .refine(
    (value) =>
      value.startMinute === null ||
      value.startMinute === undefined ||
      value.endMinute === null ||
      value.endMinute === undefined ||
      value.startMinute < value.endMinute,
    { message: "ساعت شروع باید پیش از ساعت پایان باشد", path: ["startMinute"] },
  )
  .refine(
    (value) =>
      value.type !== "EXTRA" ||
      (value.startMinute !== null && value.startMinute !== undefined),
    {
      message: "برای «استثنائاً هستم» باید ساعت مشخص شود",
      path: ["startMinute"],
    },
  );

/**
 * پنل استاد.
 *
 * ⚠️ هیچ‌کدام از این مسیرها `teacherProfileId` نمی‌گیرند. پروفایل از
 * روی نشست پیدا می‌شود، وگرنه هر کاربر واردشده‌ای می‌توانست برنامه‌ی هر
 * استادی را عوض کند — و چون این قوانین تعیین می‌کنند چه ساعتی قابل
 * فروش است، یعنی دست بردن در درآمد یک نفر دیگر.
 *
 * مسیر خواندنِ اسلات‌ها (`offerings/:id/availability`) جدا و عمومی
 * می‌ماند: آن یکی برای هنرجوی نادیده‌گرفته است، این یکی برای صاحب برنامه.
 */
@Controller("teacher")
export class TeacherController {
  constructor(private readonly teacher: TeacherProvider) {}

  /** پروفایل استاد و سرویس‌هایش. اگر کاربر استاد نباشد ۴۰۳ می‌گیرد. */
  @Get("me")
  async me(@CurrentUserId() userId: string): Promise<TeacherProfileView> {
    return this.teacher.profile(userId);
  }

  /** قوانین هفتگی و استثناهای پیشِ رو. */
  @Get("availability")
  async schedule(
    @CurrentUserId() userId: string,
  ): Promise<{ rules: RuleView[]; exceptions: ExceptionView[] }> {
    // «امروز» به وقت تهران حساب می‌شود نه UTC، وگرنه بین نیمه‌شب و
    // ۳:۳۰ بامداد، استثنای امروز از فهرست می‌افتد
    return this.teacher.schedule(userId, tehranDateKey(new Date()));
  }

  @Post("availability/rules")
  @HttpCode(HttpStatus.CREATED)
  async addRule(
    @CurrentUserId() userId: string,
    @Body(zodPipe(ruleSchema)) body: z.infer<typeof ruleSchema>,
  ): Promise<RuleView> {
    return this.teacher.createRule(userId, {
      weekday: body.weekday as Weekday,
      startMinute: body.startMinute,
      endMinute: body.endMinute,
      validFrom: body.validFrom,
      validUntil: body.validUntil ?? null,
    });
  }

  /**
   * حذف یک پنجره‌ی هفتگی.
   *
   * `affectedBookings` تعداد جلسات آینده‌ای است که در همان بازه رزرو
   * شده‌اند و **لغو نمی‌شوند**. پنل باید صریح بگویدشان، وگرنه استاد فرض
   * می‌کند برنامه‌اش پاک شده و سر کلاس نمی‌آید.
   */
  @Delete("availability/rules/:ruleId")
  async removeRule(
    @CurrentUserId() userId: string,
    @Param("ruleId", zodPipe(uuidSchema)) ruleId: string,
  ): Promise<{ affectedBookings: number }> {
    return this.teacher.deleteRule(userId, ruleId);
  }

  @Post("availability/exceptions")
  @HttpCode(HttpStatus.CREATED)
  async addException(
    @CurrentUserId() userId: string,
    @Body(zodPipe(exceptionSchema)) body: z.infer<typeof exceptionSchema>,
  ): Promise<ExceptionView> {
    return this.teacher.createException(userId, {
      date: body.date,
      type: body.type,
      startMinute: body.startMinute ?? null,
      endMinute: body.endMinute ?? null,
      reason: body.reason?.length ? body.reason : null,
    });
  }

  @Delete("availability/exceptions/:exceptionId")
  async removeException(
    @CurrentUserId() userId: string,
    @Param("exceptionId", zodPipe(uuidSchema)) exceptionId: string,
  ): Promise<{ message: string }> {
    await this.teacher.deleteException(userId, exceptionId);
    return { message: "استثنا حذف شد." };
  }
}
