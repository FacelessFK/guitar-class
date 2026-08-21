/**
 * امتیاز و نظرِ هنرجو به استاد.
 *
 * دو قاعده، همان‌هایی که کلِ ماژول‌های دیگر رویشان بنا شده‌اند:
 *
 *   ۱. **دسترسی و طرفین از روی رزرو خوانده می‌شوند، نه از ورودی.**
 *      کلاینت فقط `bookingId` و امتیاز می‌دهد. اینکه استاد کیست و آیا
 *      این کاربر حق نظر دارد یا نه، از `bookings` درمی‌آید — نه از
 *      بدنه‌ی درخواست. همان قاعده‌ای که حلقه‌ی یادگیری و پنل استاد
 *      رویش ایستاده‌اند.
 *
 *   ۲. **نظر روی یک جلسه‌ی `COMPLETED` بنا می‌شود.** تنها مدرکِ اینکه
 *      این هنرجو واقعاً سرِ کلاسِ این استاد بوده، همان رزروِ تمام‌شده
 *      است. بدون این شرط، هر کاربری می‌توانست هر استادی را بدون یک
 *      جلسه امتیاز بدهد.
 */

import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "../db/client.js";
import {
  bookings,
  teacherProfiles,
  teacherReviews,
  users,
} from "../db/schema/index.js";
import {
  BookingNotFoundError,
  NotBookingParticipantError,
} from "../booking/errors.js";
import {
  ReviewAlreadyExistsError,
  SessionNotReviewableError,
} from "./errors.js";

export interface SubmitReviewInput {
  bookingId: string;
  rating: number;
  comment?: string | null;
}

export interface ReviewView {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  studentName: string;
  studentAvatarUrl: string | null;
}

/**
 * نظر را ثبت می‌کند.
 *
 * `teacherProfileId` از ورودی گرفته نمی‌شود — از روی رزرو حساب می‌شود.
 * رزرو `teacher_id` را به‌صورت `users.id` نگه می‌دارد؛ اینجا به
 * `teacher_profiles.id` ترجمه‌اش می‌کنیم تا میانگینِ کاتالوگ روی همان
 * ستون جمع بزند.
 */
export async function submitReview(
  userId: string,
  input: SubmitReviewInput,
): Promise<{ id: string }> {
  const [booking] = await db
    .select({
      studentId: bookings.studentId,
      teacherUserId: bookings.teacherId,
      status: bookings.status,
    })
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1);

  if (!booking) throw new BookingNotFoundError(input.bookingId);

  // فقط هنرجوی همان جلسه نظر می‌دهد. استاد یا کاربر بی‌ربط رد می‌شود.
  if (booking.studentId !== userId) throw new NotBookingParticipantError();

  if (booking.status !== "COMPLETED") {
    throw new SessionNotReviewableError(booking.status);
  }

  const [profile] = await db
    .select({ id: teacherProfiles.id })
    .from(teacherProfiles)
    .where(eq(teacherProfiles.userId, booking.teacherUserId))
    .limit(1);

  // رزروی که استادش پروفایل ندارد نباید وجود داشته باشد؛ اگر رسید، باگ
  // است نه خطای کاربر، پس خام بالا می‌رود و ۵۰۰ می‌شود تا دیده شود.
  if (!profile) throw new Error(`teacher profile missing for booking ${input.bookingId}`);

  /**
   * `onConflictDoNothing` روی `booking_id`: تلاش دوم سطر دوم نمی‌سازد و
   * آرایه‌ی خالی برمی‌گرداند. خالی بودن یعنی نظر از قبل بوده — که به
   * پیامِ قابل‌نمایش ترجمه می‌شود، نه اینکه `23505` خام به ۵۰۰ برسد.
   */
  const [row] = await db
    .insert(teacherReviews)
    .values({
      bookingId: input.bookingId,
      studentId: userId,
      teacherProfileId: profile.id,
      rating: input.rating,
      comment: input.comment ?? null,
    })
    .onConflictDoNothing({ target: teacherReviews.bookingId })
    .returning({ id: teacherReviews.id });

  if (!row) throw new ReviewAlreadyExistsError();

  return { id: row.id };
}

export interface ReviewPage {
  rows: ReviewView[];
  total: number;
  limit: number;
  offset: number;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/**
 * نظرهای یک استاد، تازه‌ترین اول.
 *
 * با اسلاگ کار می‌کند نه شناسه، چون مصرف‌کننده‌اش صفحه‌ی عمومیِ استاد
 * است که خودش با اسلاگ آدرس‌دهی می‌شود. استادِ ناموجود فهرست خالی
 * می‌دهد، نه خطا: صفحه‌ی عمومی از قبل با `notFound` رفتار استادِ نبوده
 * را دارد و این اندپوینت نباید مسیر دومی برای همان باشد.
 */
export async function listTeacherReviews(
  slug: string,
  options: { limit?: number; offset?: number } = {},
): Promise<ReviewPage> {
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(options.offset ?? 0, 0);

  const [profile] = await db
    .select({ id: teacherProfiles.id })
    .from(teacherProfiles)
    .where(eq(teacherProfiles.slug, slug))
    .limit(1);

  if (!profile) return { rows: [], total: 0, limit, offset };

  const rows = await db
    .select({
      id: teacherReviews.id,
      rating: teacherReviews.rating,
      comment: teacherReviews.comment,
      createdAt: teacherReviews.createdAt,
      studentName: users.fullName,
      studentAvatarUrl: users.avatarUrl,
    })
    .from(teacherReviews)
    .innerJoin(users, eq(teacherReviews.studentId, users.id))
    .where(eq(teacherReviews.teacherProfileId, profile.id))
    .orderBy(desc(teacherReviews.createdAt))
    .limit(limit)
    .offset(offset);

  const [totals] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(teacherReviews)
    .where(eq(teacherReviews.teacherProfileId, profile.id));
  const total = totals?.total ?? 0;

  return {
    rows: rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      comment: row.comment,
      createdAt: row.createdAt.toISOString(),
      studentName: row.studentName,
      studentAvatarUrl: row.studentAvatarUrl,
    })),
    total,
    limit,
    offset,
  };
}

/**
 * شناسه‌ی رزروهایی از این کاربر که هنوز نظر نگرفته‌اند و `COMPLETED`اند.
 *
 * پنل هنرجو با این می‌فهمد کدام جلسه هنوز جای نظر دارد؛ بدون آن، فرمِ
 * نظر روی جلسه‌ای که قبلاً نظر گرفته هم نشان داده می‌شد و کاربر تازه سرِ
 * ثبت، خطای «قبلاً ثبت شده» می‌گرفت.
 */
export async function listReviewableBookingIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: bookings.id })
    .from(bookings)
    .leftJoin(teacherReviews, eq(teacherReviews.bookingId, bookings.id))
    .where(
      and(
        eq(bookings.studentId, userId),
        eq(bookings.status, "COMPLETED"),
        sql`${teacherReviews.id} IS NULL`,
      ),
    );

  return rows.map((row) => row.id);
}
