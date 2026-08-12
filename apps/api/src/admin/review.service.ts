/**
 * صف بررسی جلسه‌های برگزارنشده.
 *
 * سند معماری می‌گفت عدم حضور استاد «به بررسی ادمین می‌رود» و در عمل
 * چیزی جز یک فیلتر روی `admin/bookings` وجود نداشت. تفاوت فیلتر و صف
 * همان چیزی است که این ماژول اضافه می‌کند: **راهی برای تمام کردن کار.**
 * فهرستی که فقط فیلتر است هر روز بلندتر می‌شود و بعد از چند ماه ادمین
 * نمی‌تواند بگوید کدام سطر تازه است و کدام پارسال رسیدگی شده — پس عملاً
 * هیچ‌کدام رسیدگی نمی‌شوند.
 *
 * پرونده را جارو باز می‌کند و ادمین می‌بندد. باز کردن ایدمپوتنت است
 * (ایندکس یکتای `booking_id`)، بستن هم (`UPDATE` شرطی روی `OPEN`).
 */

import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { SessionReviewReason, SessionReviewStatus } from "@music/shared";

import { db } from "../db/client.js";
import {
  bookings,
  instruments,
  offerings,
  sessionReviews,
  teacherProfiles,
  users,
} from "../db/schema/index.js";
import { AdminRecordNotFoundError } from "./errors.js";
import { pageBounds, type Page, type PageQuery } from "./pagination.js";

/**
 * پرونده‌ی بررسی برای یک جلسه باز می‌کند.
 *
 * `ON CONFLICT DO NOTHING` روی `session_reviews_booking_id_unique` کار
 * می‌کند و برگرداندن سطر یعنی «همین اجرا بازش کرد». جاروی بستن جلسه هر
 * دقیقه اجرا می‌شود و صدا زدنِ دوباره‌ی این تابع باید بی‌اثر باشد؛ فراخوان
 * از روی همین مقدار تصمیم می‌گیرد که اعلان بفرستد یا نه، وگرنه هنرجو هر
 * دقیقه یک اعلان می‌گیرد.
 *
 * برخلاف بقیه‌ی این ماژول، سطرِ ساخته‌شده را برنمی‌گرداند بلکه فقط
 * می‌گوید ساخته شد یا نه: فراخواننده‌اش وُرکر است و به جزئیات پرونده
 * کاری ندارد.
 */
export async function openSessionReview(input: {
  bookingId: string;
  reason: SessionReviewReason;
}): Promise<boolean> {
  const created = await db
    .insert(sessionReviews)
    .values({ bookingId: input.bookingId, reason: input.reason })
    .onConflictDoNothing({ target: sessionReviews.bookingId })
    .returning({ id: sessionReviews.id });

  return created.length > 0;
}

export interface AdminReviewRow {
  id: string;
  bookingId: string;
  reason: string;
  status: string;
  resolution: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  createdAt: string;
  /** وضعیت خود جلسه — پرونده حالتش را از رزرو کپی نمی‌کند */
  bookingStatus: string;
  scheduledAt: string;
  durationMinutes: number;
  price: string;
  studentName: string;
  studentPhone: string;
  teacherName: string;
  teacherPhone: string;
  teacherProfileId: string | null;
  instrumentName: string;
}

const student = alias(users, "review_student");
const teacher = alias(users, "review_teacher");
const resolver = alias(users, "review_resolver");

function reviewQuery() {
  return db
    .select({
      id: sessionReviews.id,
      bookingId: sessionReviews.bookingId,
      reason: sessionReviews.reason,
      status: sessionReviews.status,
      resolution: sessionReviews.resolution,
      resolvedByName: resolver.fullName,
      resolvedAt: sessionReviews.resolvedAt,
      createdAt: sessionReviews.createdAt,
      bookingStatus: bookings.status,
      scheduledAt: bookings.scheduledAt,
      durationMinutes: bookings.durationMinutes,
      price: bookings.priceSnapshot,
      studentName: student.fullName,
      studentPhone: student.phone,
      teacherName: teacher.fullName,
      teacherPhone: teacher.phone,
      teacherProfileId: teacherProfiles.id,
      instrumentName: instruments.nameFa,
    })
    .from(sessionReviews)
    .innerJoin(bookings, eq(sessionReviews.bookingId, bookings.id))
    .innerJoin(student, eq(bookings.studentId, student.id))
    .innerJoin(teacher, eq(bookings.teacherId, teacher.id))
    .leftJoin(resolver, eq(sessionReviews.resolvedById, resolver.id))
    .leftJoin(teacherProfiles, eq(teacherProfiles.userId, bookings.teacherId))
    .innerJoin(offerings, eq(bookings.offeringId, offerings.id))
    .innerJoin(instruments, eq(offerings.instrumentId, instruments.id));
}

/**
 * فهرست پرونده‌ها.
 *
 * ترتیبِ پرونده‌های باز **صعودی** است و این برعکس بقیه‌ی فهرست‌های پنل
 * است: در صف، آنچه بیشترین وقت منتظر مانده مهم‌ترین است، نه تازه‌ترین.
 * برای پرونده‌های بسته‌شده برعکس — آنجا «آخرین کاری که کردم» را می‌خواهی.
 */
export async function listSessionReviews(
  filter: { status?: SessionReviewStatus } & PageQuery = {},
): Promise<Page<AdminReviewRow>> {
  const open = filter.status !== "RESOLVED";
  const { limit, offset } = pageBounds(filter);
  const where = filter.status ? eq(sessionReviews.status, filter.status) : undefined;

  const [rows, total] = await Promise.all([
    reviewQuery()
      .where(where)
      .orderBy(open ? asc(sessionReviews.createdAt) : desc(sessionReviews.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ value: count() })
      .from(sessionReviews)
      .where(where)
      .then((result) => result[0]?.value ?? 0),
  ]);

  return { rows: rows.map(toRow), total, limit, offset };
}

/**
 * پرونده را می‌بندد.
 *
 * شرط `status = 'OPEN'` روی خودِ `UPDATE` است نه بررسی جدا: دو ادمین که
 * هم‌زمان روی یک پرونده کار می‌کنند نباید یادداشت هم را بازنویسی کنند.
 * صفر سطر یعنی یکی زودتر رسیده، و آن حالت خطا نیست — پرونده بسته است و
 * همان چیزی که خواسته شده اتفاق افتاده. سطرِ فعلی برمی‌گردد تا صفحه
 * تصمیمِ نفر اول را نشان دهد، نه پیام خطای بی‌ربط.
 */
export async function resolveSessionReview(input: {
  reviewId: string;
  adminUserId: string;
  resolution: string | null;
  now?: Date;
}): Promise<AdminReviewRow> {
  const now = input.now ?? new Date();

  await db
    .update(sessionReviews)
    .set({
      status: "RESOLVED",
      resolution: input.resolution,
      resolvedById: input.adminUserId,
      resolvedAt: now,
    })
    .where(and(eq(sessionReviews.id, input.reviewId), eq(sessionReviews.status, "OPEN")));

  const [row] = await reviewQuery().where(eq(sessionReviews.id, input.reviewId)).limit(1);

  if (!row) throw new AdminRecordNotFoundError("پرونده‌ی بررسی");

  return toRow(row);
}

/** برای نمای کلی پنل: چند پرونده باز مانده است. */
export async function countOpenReviews(): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(sessionReviews)
    .where(eq(sessionReviews.status, "OPEN"));

  return rows[0]?.value ?? 0;
}

/**
 * پرونده‌های باز چند جلسه، برای صفحه‌ی رزروهای ادمین.
 *
 * جدا از فهرست است تا صفحه‌ی رزروها بتواند نشان بدهد کدام سطرش پرونده‌ی
 * باز دارد، بی‌آنکه دو فهرست را در فرانت به هم بچسباند.
 */
export async function openReviewsForBookings(
  bookingIds: string[],
): Promise<Map<string, string>> {
  if (bookingIds.length === 0) return new Map();

  const rows = await db
    .select({ id: sessionReviews.id, bookingId: sessionReviews.bookingId })
    .from(sessionReviews)
    .where(
      and(
        inArray(sessionReviews.bookingId, bookingIds),
        eq(sessionReviews.status, "OPEN"),
      ),
    );

  return new Map(rows.map((row) => [row.bookingId, row.id]));
}

type ReviewQueryRow = Awaited<ReturnType<typeof reviewQuery>>[number];

function toRow(row: ReviewQueryRow): AdminReviewRow {
  return {
    ...row,
    price: row.price.toString(),
    scheduledAt: row.scheduledAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}
