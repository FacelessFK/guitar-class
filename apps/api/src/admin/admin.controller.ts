import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";

import { AdminGuard } from "../auth/auth.guard.js";
import { CurrentUserId } from "../common/current-user.decorator.js";
import { dateKeySchema, slugSchema, uuidSchema } from "../common/schemas.js";
import { zodPipe } from "../common/validation.pipe.js";
import {
  createInstrument,
  createOffering,
  createPayout,
  getTeacher,
  listBookings,
  listInstruments,
  listOrders,
  listPayouts,
  listTeachers,
  markPayoutPaid,
  overview,
  updateInstrument,
  updateOffering,
  updateTeacher,
  type AdminBookingRow,
  type AdminInstrumentRow,
  type AdminOrderRow,
  type AdminOverview,
  type AdminPayoutRow,
  type AdminTeacherDetail,
  type AdminTeacherRow,
} from "./admin.service.js";
import {
  listSessionReviews,
  resolveSessionReview,
  type AdminReviewRow,
} from "./review.service.js";

@Injectable()
export class AdminProvider {
  readonly overview = overview;
  readonly listTeachers = listTeachers;
  readonly getTeacher = getTeacher;
  readonly updateTeacher = updateTeacher;
  readonly listInstruments = listInstruments;
  readonly createInstrument = createInstrument;
  readonly updateInstrument = updateInstrument;
  readonly createOffering = createOffering;
  readonly updateOffering = updateOffering;
  readonly listBookings = listBookings;
  readonly listOrders = listOrders;
  readonly listPayouts = listPayouts;
  readonly createPayout = createPayout;
  readonly markPayoutPaid = markPayoutPaid;
  readonly listReviews = listSessionReviews;
  readonly resolveReview = resolveSessionReview;
}

// ---------------------------------------------------------------------------
// اسکیماها
// ---------------------------------------------------------------------------

const teacherStatusSchema = z.enum(["PENDING", "APPROVED", "SUSPENDED"], {
  message: "وضعیت استاد نامعتبر است",
});

const skillLevelSchema = z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"], {
  message: "سطح نامعتبر است",
});

/**
 * مبلغ به ریال، به صورت رشته.
 *
 * عدد جاوااسکریپت نمی‌گیریم چون مبالغ این سیستم `bigint`اند و JSON عدد
 * بزرگ‌تر از حد امن را بی‌صدا گرد می‌کند — همان اتفاقی که در مسیر پول
 * هیچ‌وقت نباید بیفتد. کل پروژه مبالغ را به صورت رشته حمل می‌کند و این
 * ورودی هم همان قرارداد را نگه می‌دارد.
 */
const rialSchema = z
  .string()
  .trim()
  .regex(/^\d{1,18}$/, "مبلغ باید عددی صحیح و به ریال باشد")
  .transform((value) => BigInt(value))
  .refine((value) => value > 0n, "مبلغ باید بزرگ‌تر از صفر باشد");

/**
 * درصد کمیسیون.
 *
 * رشته می‌ماند و به `number` تبدیل نمی‌شود: ستون `numeric(5,2)` است و
 * عبور از ممیز شناور، خطای گردکردن را وارد محاسبه‌ی سهم استاد می‌کند.
 */
const commissionRateSchema = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,2})?$/, "درصد کمیسیون نامعتبر است")
  .refine((value) => Number(value) >= 0 && Number(value) <= 100, {
    message: "درصد کمیسیون باید بین ۰ تا ۱۰۰ باشد",
  });

const updateTeacherSchema = z
  .object({
    status: teacherStatusSchema.optional(),
    commissionRate: commissionRateSchema.optional(),
    bufferMinutes: z
      .number()
      .int("فاصله‌ی بین کلاس‌ها باید عدد صحیح باشد")
      .min(0, "فاصله نمی‌تواند منفی باشد")
      .max(120, "فاصله نمی‌تواند بیشتر از ۱۲۰ دقیقه باشد")
      .optional(),
    slug: slugSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "چیزی برای تغییر فرستاده نشده است",
  });

const instrumentBodySchema = z.object({
  slug: slugSchema,
  nameFa: z.string().trim().min(1, "نام ساز لازم است").max(80),
  descriptionFa: z.string().trim().max(8000).optional(),
  iconUrl: z.string().trim().max(500).optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

const updateInstrumentSchema = z
  .object({
    slug: slugSchema.optional(),
    nameFa: z.string().trim().min(1).max(80).optional(),
    descriptionFa: z.string().trim().max(8000).nullable().optional(),
    iconUrl: z.string().trim().max(500).nullable().optional(),
    sortOrder: z.number().int().min(0).max(1000).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "چیزی برای تغییر فرستاده نشده است",
  });

const durationSchema = z
  .number()
  .int("مدت جلسه باید عدد صحیح باشد")
  .min(15, "مدت جلسه نمی‌تواند کمتر از ۱۵ دقیقه باشد")
  .max(180, "مدت جلسه نمی‌تواند بیشتر از ۱۸۰ دقیقه باشد");

const createOfferingSchema = z.object({
  instrumentId: uuidSchema,
  price: rialSchema,
  durationMinutes: durationSchema.optional(),
  levels: z.array(skillLevelSchema).max(3).optional(),
});

const updateOfferingSchema = z
  .object({
    price: rialSchema.optional(),
    durationMinutes: durationSchema.optional(),
    levels: z.array(skillLevelSchema).max(3).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "چیزی برای تغییر فرستاده نشده است",
  });

/**
 * فیلتر رزروها.
 *
 * `status` چندمقداری است و با کاما می‌آید، چون صفحه‌ی ادمین معمولاً
 * «همه‌ی حالت‌های عدم حضور» را با هم می‌خواهد و سه درخواست جدا برای
 * چیزی که یک نگاه است، بی‌معنی است.
 */
const bookingFilterSchema = z.object({
  status: z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean)
        : undefined,
    ),
  teacherProfileId: uuidSchema.optional(),
  from: dateKeySchema.optional(),
  to: dateKeySchema.optional(),
});

const createPayoutSchema = z
  .object({
    teacherProfileId: uuidSchema,
    periodStart: dateKeySchema,
    periodEnd: dateKeySchema,
    amount: rialSchema,
    note: z.string().trim().max(500).optional(),
  })
  .refine((value) => value.periodStart <= value.periodEnd, {
    message: "پایان دوره نمی‌تواند پیش از شروع آن باشد",
    path: ["periodEnd"],
  });

const markPaidSchema = z.object({
  trackingCode: z.string().trim().max(120).optional(),
});

const reviewStatusSchema = z.enum(["OPEN", "RESOLVED"], {
  message: "وضعیت پرونده نامعتبر است",
});

/**
 * یادداشت رسیدگی.
 *
 * اجباری نیست چون بیشتر پرونده‌ها با یک تماس تلفنی بسته می‌شوند و
 * اجباری کردنش فقط «ok» تولید می‌کند. اختیاری بودنش یعنی وقتی چیزی
 * نوشته شده، واقعاً حرفی برای گفتن بوده.
 */
const resolveReviewSchema = z.object({
  resolution: z.string().trim().max(2000).optional(),
});

// ---------------------------------------------------------------------------
// کنترلر
// ---------------------------------------------------------------------------

/**
 * پنل ادمین.
 *
 * `AdminGuard` روی **کل** کنترلر است، نه روی تک‌تک متدها: مسیری که
 * فراموش شود محافظت کند، کل داده‌ی مالی پلتفرم را باز می‌گذارد. با
 * گاردِ کلاس، اضافه کردن اندپوینت تازه به‌صورت پیش‌فرض امن است — همان
 * قاعده‌ای که `AuthGuard` سراسری هم از آن پیروی می‌کند.
 *
 * ⚠️ هیچ‌کدام از این مسیرها شناسه‌ی کاربرِ نشست را برای *تعیین دسترسی*
 * نمی‌گیرند؛ آن را گارد از توکن می‌خواند. شناسه‌های داخل مسیر همیشه
 * اشاره به «چه چیزی را عوض کن» دارند، نه «چه کسی اجازه دارد».
 */
@UseGuards(AdminGuard)
@Controller("admin")
export class AdminController {
  constructor(private readonly admin: AdminProvider) {}

  @Get("overview")
  async overview(): Promise<AdminOverview> {
    return this.admin.overview();
  }

  // --- استادها ---

  @Get("teachers")
  async listTeachers(
    @Query("status", zodPipe(teacherStatusSchema.optional()))
    status?: "PENDING" | "APPROVED" | "SUSPENDED",
  ): Promise<{ teachers: AdminTeacherRow[] }> {
    return { teachers: await this.admin.listTeachers(status) };
  }

  @Get("teachers/:profileId")
  async getTeacher(
    @Param("profileId", zodPipe(uuidSchema)) profileId: string,
  ): Promise<AdminTeacherDetail> {
    return this.admin.getTeacher(profileId);
  }

  /** تأیید، رد و تنظیم شرایط مالی — همه با یک `PATCH`. */
  @Patch("teachers/:profileId")
  async updateTeacher(
    @Param("profileId", zodPipe(uuidSchema)) profileId: string,
    @Body(zodPipe(updateTeacherSchema)) body: z.infer<typeof updateTeacherSchema>,
  ): Promise<AdminTeacherDetail> {
    return this.admin.updateTeacher(profileId, body);
  }

  // --- سازها ---

  @Get("instruments")
  async listInstruments(): Promise<{ instruments: AdminInstrumentRow[] }> {
    return { instruments: await this.admin.listInstruments() };
  }

  @Post("instruments")
  @HttpCode(HttpStatus.CREATED)
  async createInstrument(
    @Body(zodPipe(instrumentBodySchema)) body: z.infer<typeof instrumentBodySchema>,
  ): Promise<AdminInstrumentRow> {
    return this.admin.createInstrument({
      slug: body.slug,
      nameFa: body.nameFa,
      descriptionFa: body.descriptionFa?.length ? body.descriptionFa : null,
      iconUrl: body.iconUrl?.length ? body.iconUrl : null,
      sortOrder: body.sortOrder ?? 0,
    });
  }

  @Patch("instruments/:instrumentId")
  async updateInstrument(
    @Param("instrumentId", zodPipe(uuidSchema)) instrumentId: string,
    @Body(zodPipe(updateInstrumentSchema)) body: z.infer<typeof updateInstrumentSchema>,
  ): Promise<AdminInstrumentRow> {
    return this.admin.updateInstrument(instrumentId, body);
  }

  // --- سرویس‌ها ---

  @Post("teachers/:profileId/offerings")
  @HttpCode(HttpStatus.CREATED)
  async createOffering(
    @Param("profileId", zodPipe(uuidSchema)) profileId: string,
    @Body(zodPipe(createOfferingSchema)) body: z.infer<typeof createOfferingSchema>,
  ): Promise<AdminTeacherDetail> {
    return this.admin.createOffering(profileId, {
      instrumentId: body.instrumentId,
      price: body.price,
      durationMinutes: body.durationMinutes ?? 60,
      levels: body.levels ?? ["BEGINNER", "INTERMEDIATE"],
    });
  }

  @Patch("offerings/:offeringId")
  async updateOffering(
    @Param("offeringId", zodPipe(uuidSchema)) offeringId: string,
    @Body(zodPipe(updateOfferingSchema)) body: z.infer<typeof updateOfferingSchema>,
  ): Promise<AdminTeacherDetail> {
    return this.admin.updateOffering(offeringId, body);
  }

  // --- رزروها و تراکنش‌ها ---

  @Get("bookings")
  async listBookings(
    @Query(zodPipe(bookingFilterSchema)) query: z.infer<typeof bookingFilterSchema>,
  ): Promise<{ bookings: AdminBookingRow[] }> {
    return { bookings: await this.admin.listBookings(query) };
  }

  @Get("orders")
  async listOrders(
    @Query("status", zodPipe(z.enum(["PENDING", "PAID", "FAILED", "REFUNDED"]).optional()))
    status?: string,
  ): Promise<{ orders: AdminOrderRow[] }> {
    return { orders: await this.admin.listOrders(status) };
  }

  // --- صف بررسی ---

  /**
   * جلسه‌هایی که برگزار نشدند و تکلیفشان روشن نیست.
   *
   * پیش‌فرضش پرونده‌های باز است، نه همه: صف را باز می‌کنی که ببینی چه
   * کاری مانده، و فهرستی که رسیدگی‌شده‌ها را هم دارد بعد از چند ماه
   * همان فهرست بی‌فایده‌ای می‌شود که این ماژول برای جایگزینی‌اش ساخته شد.
   */
  @Get("reviews")
  async listReviews(
    @Query("status", zodPipe(reviewStatusSchema.optional()))
    status?: "OPEN" | "RESOLVED",
  ): Promise<{ reviews: AdminReviewRow[] }> {
    return { reviews: await this.admin.listReviews({ status: status ?? "OPEN" }) };
  }

  /**
   * «رسیدگی شد».
   *
   * شناسه‌ی ادمین از نشست خوانده می‌شود نه از بدنه — همان قاعده‌ی کل
   * پنل. کسی که پرونده را بسته باید قابل ردیابی باشد و اگر از کلاینت
   * می‌آمد، هر ادمینی می‌توانست کارش را به اسم دیگری ثبت کند.
   */
  @Post("reviews/:reviewId/resolve")
  @HttpCode(HttpStatus.OK)
  async resolveReview(
    @CurrentUserId() adminUserId: string,
    @Param("reviewId", zodPipe(uuidSchema)) reviewId: string,
    @Body(zodPipe(resolveReviewSchema)) body: z.infer<typeof resolveReviewSchema>,
  ): Promise<AdminReviewRow> {
    return this.admin.resolveReview({
      reviewId,
      adminUserId,
      resolution: body.resolution?.length ? body.resolution : null,
    });
  }

  // --- تسویه ---

  @Get("payouts")
  async listPayouts(
    @Query("teacherProfileId", zodPipe(uuidSchema.optional())) teacherProfileId?: string,
  ): Promise<{ payouts: AdminPayoutRow[] }> {
    return { payouts: await this.admin.listPayouts(teacherProfileId) };
  }

  @Post("payouts")
  @HttpCode(HttpStatus.CREATED)
  async createPayout(
    @Body(zodPipe(createPayoutSchema)) body: z.infer<typeof createPayoutSchema>,
  ): Promise<AdminPayoutRow> {
    return this.admin.createPayout({
      teacherProfileId: body.teacherProfileId,
      periodStart: body.periodStart,
      periodEnd: body.periodEnd,
      amount: body.amount,
      note: body.note?.length ? body.note : null,
    });
  }

  /** پول واقعاً رفت: وضعیت `PAID` می‌شود و سطر منفی در دفتر کل می‌نشیند. */
  @Post("payouts/:payoutId/paid")
  @HttpCode(HttpStatus.OK)
  async markPayoutPaid(
    @Param("payoutId", zodPipe(uuidSchema)) payoutId: string,
    @Body(zodPipe(markPaidSchema)) body: z.infer<typeof markPaidSchema>,
  ): Promise<AdminPayoutRow> {
    return this.admin.markPayoutPaid(payoutId, body.trackingCode?.length ? body.trackingCode : null);
  }
}
