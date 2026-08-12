import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { z } from "zod";
import { tehranDateKey } from "@music/shared";

import { CurrentUserId } from "../common/current-user.decorator.js";
import {
  dateKeySchema,
  minuteOfDaySchema,
  slugSchema,
  uuidSchema,
} from "../common/schemas.js";
import { zodPipe } from "../common/validation.pipe.js";
import {
  applyAsTeacher,
  createException,
  createRule,
  deleteException,
  deleteRule,
  getSchedule,
  getTeacherProfile,
  updateTeacherProfile,
  type ExceptionView,
  type RuleView,
  type TeacherProfileView,
} from "./teacher.service.js";
import type { Weekday } from "@music/shared";

@Injectable()
export class TeacherProvider {
  readonly profile = getTeacherProfile;
  readonly apply = applyAsTeacher;
  readonly updateProfile = updateTeacherProfile;
  readonly schedule = getSchedule;
  readonly createRule = createRule;
  readonly deleteRule = deleteRule;
  readonly createException = createException;
  readonly deleteException = deleteException;
}

/**
 * نشانی ویدیوی معارفه.
 *
 * فقط `http(s)` پذیرفته می‌شود. بدون این بررسی، `javascript:` در همان
 * فیلد می‌نشیند و صفحه‌ی عمومی استاد آن را در `href` رندر می‌کند —
 * پروفایلی که هر بازدیدکننده‌ی سئویی رویش می‌آید.
 */
const httpUrlSchema = z
  .string()
  .trim()
  .max(500, "نشانی نمی‌تواند بیشتر از ۵۰۰ نویسه باشد")
  .refine(
    (value) => /^https?:\/\//i.test(value),
    "نشانی باید با http:// یا https:// شروع شود",
  );

const headlineSchema = z
  .string()
  .trim()
  .min(3, "معرفی کوتاه باید دست‌کم سه نویسه باشد")
  .max(160, "معرفی کوتاه نمی‌تواند بیشتر از ۱۶۰ نویسه باشد");

const bioSchema = z.string().trim().max(4000, "متن معرفی خیلی بلند است");

const yearsSchema = z
  .number()
  .int("سال سابقه باید عدد صحیح باشد")
  .min(0, "سال سابقه نمی‌تواند منفی باشد")
  .max(80, "سال سابقه نامعتبر است");

const applySchema = z.object({
  headline: headlineSchema,
  bio: bioSchema.optional(),
  yearsExperience: yearsSchema.optional(),
  introVideoUrl: httpUrlSchema.optional(),
  /** اختیاری است؛ نبودنش یعنی سرور یکی بسازد */
  slug: slugSchema.optional(),
});

/**
 * ویرایش پروفایل — همه‌ی فیلدها اختیاری‌اند و «نبود» با «تهی» فرق دارد.
 *
 * `bio: null` یعنی «پاکش کن» و نبودن `bio` یعنی «دست نزن». اگر هر دو یک
 * معنا داشتند، فرستادن فرمی که فقط عنوان را عوض کرده، متن معرفی را هم
 * پاک می‌کرد.
 */
const updateProfileSchema = z
  .object({
    headline: headlineSchema.optional(),
    bio: bioSchema.nullable().optional(),
    yearsExperience: yearsSchema.optional(),
    introVideoUrl: httpUrlSchema.nullable().optional(),
    slug: slugSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "چیزی برای تغییر فرستاده نشده است",
  });

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

  /**
   * درخواست استاد شدن.
   *
   * تنها مسیر این کنترلر که کاربرِ **غیر**استاد صدایش می‌زند. پروفایل با
   * `PENDING` ساخته می‌شود و تا تأیید ادمین در هیچ صفحه‌ی عمومی نمی‌آید،
   * پس این اندپوینت به‌تنهایی چیزی برای فروش نمی‌سازد.
   */
  @Post("apply")
  @HttpCode(HttpStatus.CREATED)
  async apply(
    @CurrentUserId() userId: string,
    @Body(zodPipe(applySchema)) body: z.infer<typeof applySchema>,
  ): Promise<TeacherProfileView> {
    return this.teacher.apply(userId, {
      headline: body.headline,
      bio: body.bio?.length ? body.bio : null,
      yearsExperience: body.yearsExperience ?? 0,
      introVideoUrl: body.introVideoUrl?.length ? body.introVideoUrl : null,
      slug: body.slug ?? null,
    });
  }

  /**
   * ویرایش پروفایل توسط خودِ استاد.
   *
   * `commissionRate` و `status` عمداً پذیرفته نمی‌شوند — هرچه در بدنه
   * بیاید، اسکیمای Zod حذفش می‌کند. تنظیمشان کار پنل ادمین است.
   */
  @Patch("me")
  async updateProfile(
    @CurrentUserId() userId: string,
    @Body(zodPipe(updateProfileSchema)) body: z.infer<typeof updateProfileSchema>,
  ): Promise<TeacherProfileView> {
    return this.teacher.updateProfile(userId, {
      ...body,
      // فیلد متنی خالی‌شده در فرم یعنی «پاکش کن»، نه رشته‌ی خالی در
      // دیتابیس؛ وگرنه صفحه‌ی عمومی به‌جای نداشتن متن، متنِ خالی دارد
      ...(body.bio === undefined ? {} : { bio: body.bio?.length ? body.bio : null }),
    });
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
