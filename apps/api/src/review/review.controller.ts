import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { z } from "zod";

import { Public } from "../auth/auth.guard.js";
import { CurrentUserId } from "../common/current-user.decorator.js";
import { slugSchema, uuidSchema } from "../common/schemas.js";
import { zodPipe } from "../common/validation.pipe.js";
import {
  listReviewableBookingIds,
  listTeacherReviews,
  submitReview,
  type ReviewPage,
  type ReviewView,
} from "./review.service.js";

@Injectable()
export class ReviewProvider {
  readonly submit = submitReview;
  readonly listForTeacher = listTeacherReviews;
  readonly reviewablePending = listReviewableBookingIds;
}

const submitSchema = z.object({
  bookingId: uuidSchema,
  /**
   * عدد صحیحِ ۱ تا ۵. قید `CHECK` دیتابیس گاردِ نهایی است، ولی همین‌جا
   * هم گرفته می‌شود تا کاربر پیامِ فارسی بگیرد نه ۵۰۰.
   */
  rating: z
    .number()
    .int("امتیاز باید عدد صحیح باشد")
    .min(1, "امتیاز از ۱ تا ۵ است")
    .max(5, "امتیاز از ۱ تا ۵ است"),
  comment: z.string().trim().max(2000, "متن نظر خیلی بلند است").optional(),
});

const listQuerySchema = z.object({
  limit: z
    .string()
    .regex(/^\d{1,4}$/)
    .transform(Number)
    .optional(),
  offset: z
    .string()
    .regex(/^\d{1,9}$/)
    .transform(Number)
    .optional(),
});

/**
 * نظرِ هنرجو به استاد.
 *
 * ثبت پشتِ گارد است (فقط هنرجوی همان جلسه)، خواندنِ فهرست `@Public()`
 * چون صفحه‌ی عمومیِ استاد که SSG است مصرفش می‌کند.
 */
@Controller()
export class ReviewController {
  constructor(private readonly reviews: ReviewProvider) {}

  @Post("reviews")
  @HttpCode(HttpStatus.CREATED)
  async submit(
    @CurrentUserId() userId: string,
    @Body(zodPipe(submitSchema)) body: z.infer<typeof submitSchema>,
  ): Promise<{ id: string }> {
    return this.reviews.submit(userId, body);
  }

  /**
   * شناسه‌ی جلسه‌های تمام‌شده‌ای که این کاربر هنوز نظر نداده.
   *
   * پنل هنرجو با این تصمیم می‌گیرد کجا دکمه‌ی «ثبت نظر» نشان دهد؛ فرمِ
   * نظر روی جلسه‌ای که قبلاً نظر گرفته اصلاً نباید دیده شود.
   */
  @Get("reviews/pending")
  async pending(@CurrentUserId() userId: string): Promise<{ bookingIds: string[] }> {
    return { bookingIds: await this.reviews.reviewablePending(userId) };
  }

  @Public()
  @Get("teachers/:slug/reviews")
  async forTeacher(
    @Param("slug", zodPipe(slugSchema)) slug: string,
    @Query(zodPipe(listQuerySchema)) query: z.infer<typeof listQuerySchema>,
  ): Promise<{
    reviews: ReviewView[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const page: ReviewPage = await this.reviews.listForTeacher(slug, {
      limit: query.limit,
      offset: query.offset,
    });

    return {
      reviews: page.rows,
      total: page.total,
      limit: page.limit,
      offset: page.offset,
    };
  }
}
