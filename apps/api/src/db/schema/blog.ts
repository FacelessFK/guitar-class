import { relations } from "drizzle-orm";
import { index, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";

import { createdAt, primaryId, tstz, updatedAt } from "./columns.js";
import { postStatus } from "./enums.js";
import { users } from "./identity.js";
import { instruments } from "./catalog.js";

/**
 * بلاگ.
 *
 * سند معماری (بخش ۷) `/blog/[slug]` را در جدول مسیرها داشت و هیچ‌وقت
 * ساخته نشده بود، در حالی که فاز ۱ انتشار محتوا را از همه‌چیز واجب‌تر
 * می‌داند: سئو سه تا شش ماه طول می‌کشد، پس هر هفته‌ای که نوشته‌ای منتشر
 * نشود، هفته‌ای است که ساعت اصلاً شروع نشده.
 *
 * جدول است و نه فایل مارک‌داون در مخزن: نوشتن باید بدون دیپلوی و بدون
 * دانستن git ممکن باشد، وگرنه تنها کسی که می‌تواند محتوا منتشر کند
 * همان کسی است که کد را می‌نویسد — و آن دقیقاً همان گلوگاهی است که
 * تولید محتوا را متوقف می‌کند.
 */
export const posts = pgTable(
  "posts",
  {
    id: primaryId(),

    /**
     * اسلاگ فارسی مجاز است — سند معماری صریحاً می‌خواهدش.
     *
     * طولش سخاوتمندانه است چون هر حرف فارسی در URL به سه بایت
     * درصدکدشده تبدیل می‌شود و اسلاگی که در مرورگر کوتاه به نظر می‌رسد
     * می‌تواند در پایگاه داده بلند باشد.
     */
    slug: varchar({ length: 200 }).notNull().unique(),
    title: varchar({ length: 200 }).notNull(),

    /**
     * خلاصه — هم در فهرست دیده می‌شود و هم `meta description` می‌شود.
     *
     * جدا از بریدنِ ابتدای متن است و باید دستی نوشته شود: بریدنِ خودکار
     * جمله را وسط قطع می‌کند و توضیحِ گوگل را به یک نیم‌جمله تبدیل
     * می‌کند، که همان‌جایی است که نرخ کلیک از دست می‌رود.
     */
    excerpt: text().notNull(),

    /** متن کامل، مارک‌داون. رندر در زمان بیلد انجام می‌شود. */
    content: text().notNull(),

    coverUrl: varchar("cover_url", { length: 500 }),
    /** کلید آبجکت تصویر — به همان دلیلِ `submissions.object_key` */
    coverObjectKey: varchar("cover_object_key", { length: 300 }),

    /**
     * ساز مرتبط، اختیاری.
     *
     * ارزش سئویی‌اش پیوند داخلی است: نوشته‌ی «چطور گیتار کلاسیک تمرین
     * کنیم» باید به `/instruments/classical-guitar` وصل شود و برعکس.
     * صفحه‌ی ساز مهم‌ترین دارایی سئوی پروژه است و نوشته‌ها اعتبار را به
     * همان‌جا می‌برند.
     */
    instrumentId: uuid("instrument_id").references(() => instruments.id, {
      onDelete: "set null",
    }),

    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),

    status: postStatus().notNull().default("DRAFT"),

    /**
     * لحظه‌ی انتشار — جدا از `created_at`.
     *
     * نوشته‌ای که سه هفته پیش‌نویس بوده، تاریخ انتشارش امروز است نه سه
     * هفته پیش. گوگل همین تاریخ را در نتایج نشان می‌دهد و اشتباهش یعنی
     * محتوای تازه، کهنه دیده شود.
     */
    publishedAt: tstz("published_at"),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    /** مسیر عمومی همیشه «منتشرشده‌ها، تازه‌ترین اول» را می‌خواهد. */
    index("posts_published_idx").on(table.status, table.publishedAt),
    index("posts_instrument_idx").on(table.instrumentId),
  ],
);

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, { fields: [posts.authorId], references: [users.id] }),
  instrument: one(instruments, {
    fields: [posts.instrumentId],
    references: [instruments.id],
  }),
}));
