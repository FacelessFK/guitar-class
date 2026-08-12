import { relations } from "drizzle-orm";
import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { createdAt, primaryId, tstz } from "./columns.js";
import { sessionReviewReason, sessionReviewStatus } from "./enums.js";
import { users } from "./identity.js";
import { bookings } from "./booking.js";

/**
 * صف بررسی ادمین.
 *
 * سند معماری می‌گفت عدم حضور استاد «به بررسی ادمین می‌رود»، ولی هیچ صفی
 * وجود نداشت: صفحه‌ی ادمین فقط روی `NO_SHOW_TEACHER` فیلتر می‌کرد. فیلتر
 * صف نیست — راهی برای گفتن «این یکی رسیدگی شد» ندارد، پس فهرست تا ابد
 * رشد می‌کند و بعد از چند ماه هیچ‌کس نمی‌داند کدام سطرش تازه است. همان
 * الگویی که یک بار در `notifications` دیدیم: کاری که حالت دارد به سطرِ
 * حالت‌دار نیاز دارد، نه به کوئری.
 *
 * جدا از `bookings` است و نه چند ستون روی آن، چون چرخه‌ی حیاتش جداست:
 * رزرو تمام شده و دیگر عوض نمی‌شود، ولی پرونده‌ی بررسی‌اش تازه باز شده.
 * ستون‌های `resolved_*` روی جدول رزرو یعنی هر کوئری رزرو، حالتی را حمل
 * کند که به جلسه ربطی ندارد.
 */
export const sessionReviews = pgTable(
  "session_reviews",
  {
    id: primaryId(),

    /**
     * یکتاست، و همین یکتایی کل ایدمپوتنسی صف است.
     *
     * جاروی بستن جلسه هر دقیقه اجرا می‌شود. با `ON CONFLICT DO NOTHING`
     * روی این ایندکس، اجرای دوم سطر دوم نمی‌سازد. تکیه به بررسی «قبلاً
     * هست؟» در کد کافی نیست: دو وُرکر هم‌زمان هر دو خالی بودن را
     * می‌بینند و هر دو درج می‌کنند.
     */
    bookingId: uuid("booking_id")
      .notNull()
      .unique()
      .references(() => bookings.id, { onDelete: "cascade" }),

    reason: sessionReviewReason().notNull(),
    status: sessionReviewStatus().notNull().default("OPEN"),

    /** ادمین چه کرد — «با استاد تماس گرفتم و جبران شد» */
    resolution: text(),
    resolvedById: uuid("resolved_by_id").references(() => users.id),
    resolvedAt: tstz("resolved_at"),

    createdAt: createdAt(),
  },
  (table) => [
    /**
     * صفحه‌ی ادمین همیشه «بازها، قدیمی‌ترین اول» را می‌خواهد: کاری که
     * بیشترین وقت را منتظر مانده باید بالای فهرست باشد.
     */
    index("session_reviews_status_idx").on(table.status, table.createdAt),
  ],
);

export const sessionReviewsRelations = relations(sessionReviews, ({ one }) => ({
  booking: one(bookings, {
    fields: [sessionReviews.bookingId],
    references: [bookings.id],
  }),
  resolvedBy: one(users, {
    fields: [sessionReviews.resolvedById],
    references: [users.id],
  }),
}));
