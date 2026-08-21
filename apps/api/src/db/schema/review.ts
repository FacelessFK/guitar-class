import { relations, sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { createdAt, primaryId, tstz } from "./columns.js";
import { sessionReviewReason, sessionReviewStatus } from "./enums.js";
import { users } from "./identity.js";
import { teacherProfiles } from "./catalog.js";
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

/**
 * امتیاز و نظرِ هنرجو به استاد.
 *
 * جدا از `session_reviews` است و نباید با آن اشتباه شود: آن یکی صفِ
 * بررسیِ ادمین برای عدم‌حضور است، این یکی نظرِ عمومیِ هنرجو که در صفحه‌ی
 * استاد دیده می‌شود. هم‌نامیِ کلمه‌ی «review» اتفاقی است.
 *
 * نظر روی **یک رزروِ تمام‌شده** بنا می‌شود، نه روی رابطه‌ی کلیِ
 * هنرجو-استاد: تنها مدرکِ اینکه این هنرجو واقعاً سرِ کلاسِ این استاد
 * بوده، همان رزرو است. سرویس پیش از درج، `COMPLETED` بودن و مالکیت را
 * می‌سنجد.
 */
export const teacherReviews = pgTable(
  "teacher_reviews",
  {
    id: primaryId(),

    /**
     * یکتاست، و همین یکتایی ضدِ اسپم و کلِ ایدمپوتنسی است: یک نظر برای
     * هر جلسه. بدون آن، یک هنرجو می‌توانست یک استاد را با ده نظر پشت سر
     * هم بالا یا پایین بکشد. تلاش دوم روی همان رزرو به `409` می‌خورد،
     * نه به سطر دوم.
     */
    bookingId: uuid("booking_id")
      .notNull()
      .unique()
      .references(() => bookings.id, { onDelete: "cascade" }),

    /** نویسنده‌ی نظر — برای نمایش نام/عکس و بررسی مالکیت */
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id),

    /**
     * به `teacher_profiles.id` اشاره می‌کند نه به `users.id` استاد
     * (برخلاف `bookings.teacher_id`).
     *
     * غیرنرمال و عمدی: میانگینِ امتیازِ کاتالوگ روی همین ستون
     * `GROUP BY` می‌زند و نمی‌خواهد برای هر تجمیع از رزرو به کاربر به
     * پروفایل برود. سرویس این را هنگام درج، از روی رزرو حساب می‌کند.
     */
    teacherProfileId: uuid("teacher_profile_id")
      .notNull()
      .references(() => teacherProfiles.id, { onDelete: "cascade" }),

    /** یک تا پنج. قیدِ `CHECK` گاردِ واقعی است، نه اعتبارسنجیِ لایه‌ی وب. */
    rating: integer().notNull(),

    /** متن اختیاری — ستاره‌ی بی‌کلام هم سیگنال است */
    comment: text(),

    createdAt: createdAt(),
  },
  (table) => [
    /**
     * صفحه‌ی استاد «تازه‌ترین نظرها» را می‌خواهد و کاتالوگ میانگین را،
     * هر دو به تفکیک استاد. ایندکس روی (پروفایل، تاریخ نزولی) هر دو را
     * می‌پوشاند.
     */
    index("teacher_reviews_teacher_idx").on(
      table.teacherProfileId,
      table.createdAt.desc(),
    ),
    check("teacher_reviews_rating_range", sql`${table.rating} BETWEEN 1 AND 5`),
  ],
);

export const teacherReviewsRelations = relations(teacherReviews, ({ one }) => ({
  booking: one(bookings, {
    fields: [teacherReviews.bookingId],
    references: [bookings.id],
  }),
  student: one(users, {
    fields: [teacherReviews.studentId],
    references: [users.id],
  }),
  teacherProfile: one(teacherProfiles, {
    fields: [teacherReviews.teacherProfileId],
    references: [teacherProfiles.id],
  }),
}));
