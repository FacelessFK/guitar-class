import { relations, sql } from "drizzle-orm";
import { index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { createdAt, primaryId, tstz } from "./columns.js";
import { attendanceEvent, attendanceSource } from "./enums.js";
import { users } from "./identity.js";
import { bookings } from "./booking.js";

/**
 * دفترِ ورود و خروجِ اتاق کلاس — فقط افزودنی.
 *
 * چهار ستونِ `*_joined_at` و `*_verified_at` روی `bookings` جوابِ «آمد یا
 * نه» را می‌دهند و برای بستن خودکار جلسه کافی‌اند. چیزی که نمی‌دهند
 * «چه اتفاقی افتاد» است: استادی که آمد و بعد از پنج دقیقه رفت، از نگاه
 * آن ستون‌ها با استادی که کل جلسه ماند یکی است. اولین اختلاف مالی واقعی
 * دقیقاً همان‌جاست، و آن موقع دیگر نمی‌شود داده‌ای را که ذخیره نشده
 * بازسازی کرد.
 *
 * همان قاعده‌ی دفتر کل: **ویرایش نمی‌شود، فقط سطر اضافه می‌شود.** خروج،
 * ورود را پاک نمی‌کند؛ رویدادِ بعدی است. و چون هر دو منبع در یک جدول
 * می‌نشینند، «مرورگر گفت آمدم ولی سرور ندیدش» یک کوئری ساده است نه یک
 * بازسازی از روی لاگ.
 */
export const attendanceEvents = pgTable(
  "attendance_events",
  {
    id: primaryId(),

    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),

    /**
     * کدام طرف. از ادعای `context.user.id` توکن جیتسی می‌آید، نه از
     * بدنه‌ی درخواست — پس همیشه یکی از دو طرفِ همین رزرو است.
     */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),

    event: attendanceEvent().notNull(),
    source: attendanceSource().notNull(),

    /**
     * لحظه‌ی رسیدن رویداد به ما — **ساعت خودمان**.
     *
     * همان قاعده‌ی اندپوینت حضور: زمان از فرستنده گرفته نمی‌شود. برای
     * هوک، فرستنده سرور جیتسی است نه کاربر، ولی ساعتش هم مال ما نیست و
     * می‌تواند بلغزد. مقایسه‌ی دو منبع فقط وقتی معنا دارد که هر دو با یک
     * ساعت سنجیده شده باشند.
     */
    occurredAt: tstz("occurred_at").notNull(),

    /**
     * لحظه‌ای که خودِ فرستنده ادعا کرده — برای هوک، `joined_at`/`left_at`
     * از prosody.
     *
     * در هیچ تصمیمی خوانده نمی‌شود و فقط برای رفع اختلاف است: اگر روزی
     * فاصله‌ی این دو ستون بزرگ شد، یعنی یا ساعت سرور جیتسی خراب است یا
     * رویدادها با تأخیر و در دسته‌های بزرگ می‌رسند — و هر دو را باید
     * دید، نه اینکه بی‌صدا در `occurred_at` حل شوند.
     */
    reportedAt: tstz("reported_at"),

    /** `occupant_jid` — برای پیدا کردن همان نشست در لاگ prosody */
    occupantJid: text("occupant_jid"),

    createdAt: createdAt(),
  },
  (table) => [
    /** «این رزرو چه رویدادهایی داشت» — به ترتیب زمان */
    index("attendance_events_booking_idx").on(table.bookingId, table.occurredAt),
    /**
     * ایدمپوتنسی تحویل.
     *
     * ماژول prosody روی خطای ۵xx و تایم‌اوت دوباره می‌فرستد، پس همان
     * رویداد می‌تواند دو بار برسد. کلید یکتا از چیزی ساخته شده که در
     * تلاش دوم عوض نمی‌شود: زمانِ ادعاشده‌ی خودِ فرستنده. `occurred_at`
     * به درد نمی‌خورد چون ساعتِ رسیدن است و در تلاش دوم فرق دارد.
     *
     * `reported_at` تهی (یعنی گزارش کلاینت) از این قید بیرون است: دو
     * تبِ باز که هر دو `JOINED` می‌فرستند رویدادِ تکراری نیستند، دو
     * رویداد واقعی‌اند.
     */
    uniqueIndex("attendance_events_delivery_idx")
      .on(table.bookingId, table.userId, table.event, table.reportedAt)
      .where(sql`${table.reportedAt} IS NOT NULL`),
  ],
);

export const attendanceEventsRelations = relations(attendanceEvents, ({ one }) => ({
  booking: one(bookings, {
    fields: [attendanceEvents.bookingId],
    references: [bookings.id],
  }),
  user: one(users, {
    fields: [attendanceEvents.userId],
    references: [users.id],
  }),
}));
