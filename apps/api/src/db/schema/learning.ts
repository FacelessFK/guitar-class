import { relations, sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  createdAt,
  emptyJsonArray,
  emptyJsonObject,
  primaryId,
  tstz,
  updatedAt,
} from "./columns.js";
import {
  assignmentStatus,
  mediaType,
  notificationChannel,
  notificationStatus,
  recordingStatus,
} from "./enums.js";
import { users } from "./identity.js";
import { bookings } from "./booking.js";

/**
 * چرخه‌ی یادگیری.
 *
 * این بخش آن چیزی است که پلتفرم را از «یک لینک جیتسی» متمایز می‌کند و
 * مانع خروج استاد و هنرجو از پلتفرم می‌شود. تزئینات نیست — قلب محصول است.
 */

export const sessionNotes = pgTable("session_notes", {
  id: primaryId(),
  bookingId: uuid("booking_id")
    .notNull()
    .unique()
    .references(() => bookings.id, { onDelete: "cascade" }),
  content: text().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const assignments = pgTable(
  "assignments",
  {
    id: primaryId(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),

    title: varchar({ length: 160 }).notNull(),
    description: text(),
    /** نت، تبلچر، فایل صوتی نمونه */
    attachments: jsonb().notNull().default(emptyJsonArray),

    dueDate: date("due_date"),
    status: assignmentStatus().notNull().default("ASSIGNED"),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("assignments_booking_idx").on(table.bookingId)],
);

/**
 * اجرای هنرجو.
 *
 * کلیپ کوتاه موبایلی — حدود ۲۰ مگابایت، نه ضبط یک‌ساعته. ارزش آموزشی‌اش
 * از ضبط کل جلسه بیشتر است چون حول یک مسئله‌ی مشخص می‌چرخد.
 */
export const submissions = pgTable(
  "submissions",
  {
    id: primaryId(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id),

    mediaUrl: varchar("media_url", { length: 500 }).notNull(),
    mediaType: mediaType("media_type").notNull(),
    durationSeconds: integer("duration_seconds"),
    sizeBytes: bigint("size_bytes", { mode: "bigint" }),

    createdAt: createdAt(),
  },
  (table) => [index("submissions_assignment_idx").on(table.assignmentId)],
);

export const feedbacks = pgTable(
  "feedbacks",
  {
    id: primaryId(),
    submissionId: uuid("submission_id")
      .notNull()
      .unique()
      .references(() => submissions.id, { onDelete: "cascade" }),

    content: text(),
    /** بازخورد صوتی — برای موسیقی طبیعی‌تر از متن است و حجمش ناچیز */
    voiceNoteUrl: varchar("voice_note_url", { length: 500 }),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      "feedbacks_has_content",
      sql`${table.content} IS NOT NULL OR ${table.voiceNoteUrl} IS NOT NULL`,
    ),
  ],
);

/**
 * ضبط جلسه — فاز بعد.
 *
 * ضبط ویدیویی کامل حدود ۵۰۰ مگ تا ۱ گیگ برای هر ساعت است و ضبط صوتی
 * حدود ۴۰ مگ. برای آموزش موسیقی صدا تقریباً همه‌ی ارزش را دارد.
 */
export const recordings = pgTable(
  "recordings",
  {
    id: primaryId(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),

    url: varchar({ length: 500 }).notNull(),
    type: mediaType().notNull(),
    sizeBytes: bigint("size_bytes", { mode: "bigint" }),
    durationSeconds: integer("duration_seconds"),
    status: recordingStatus().notNull().default("PROCESSING"),

    /**
     * جاب شبانه فایل‌های منقضی را پاک می‌کند. بدون سیاست نگه‌داری،
     * هزینه‌ی ذخیره‌سازی خطی رشد می‌کند و هیچ‌وقت متوقف نمی‌شود.
     */
    expiresAt: tstz("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("recordings_booking_idx").on(table.bookingId),
    index("recordings_expiry_idx").on(table.status, table.expiresAt),
  ],
);

/** کاربر ایرانی ایمیل چک نمی‌کند. کانال اصلی پیامک است. */
export const notifications = pgTable(
  "notifications",
  {
    id: primaryId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * اعلانی که درباره‌ی یک جلسه است به همان جلسه وصل می‌شود.
     *
     * فقط ارجاع نیست، کلید ایدمپوتنسی است: جاروی یادآوری هر دقیقه اجرا
     * می‌شود و باید بتواند بگوید «این یادآوری قبلاً ساخته شده». بدون
     * ستون، تنها راه، شرط روی محتوای `payload` بود که ایندکس یکتای
     * قابل اتکا نمی‌دهد.
     *
     * `NULL` مجاز است چون همه‌ی اعلان‌ها درباره‌ی جلسه نیستند (خوش‌آمد،
     * اطلاعیه، تسویه).
     */
    bookingId: uuid("booking_id").references(() => bookings.id, {
      onDelete: "cascade",
    }),
    type: varchar({ length: 60 }).notNull(),
    channel: notificationChannel().notNull(),
    payload: jsonb().notNull().default(emptyJsonObject),

    scheduledFor: tstz("scheduled_for").notNull(),
    sentAt: tstz("sent_at"),
    status: notificationStatus().notNull().default("PENDING"),
    error: text(),

    /**
     * لحظه‌ی خوانده شدن — فقط برای کانال درون‌اپ معنا دارد.
     *
     * از `sent_at` جدا شد چون آن دو یک چیز نیستند: پیامک وقتی «فرستاده»
     * می‌شود که به پنل تحویل برود، و اعلان درون‌اپ همان لحظه‌ی ساخته
     * شدن تحویل شده است. یکی کردنشان یعنی شمارنده‌ی نخوانده‌ها هیچ‌وقت
     * نتواند بین «رسید» و «دید» فرق بگذارد.
     */
    readAt: tstz("read_at"),

    createdAt: createdAt(),
  },
  (table) => [
    index("notifications_dispatch_idx").on(table.status, table.scheduledFor),
    index("notifications_user_idx").on(table.userId),
    /**
     * یک یادآوری از هر نوع، برای هر کاربر، برای هر جلسه — و بس.
     *
     * جارو چند بار در دقیقه هم که اجرا شود، `ON CONFLICT DO NOTHING`
     * روی همین ایندکس یعنی سطر دوم ساخته نمی‌شود. تکیه کردن به بررسی
     * «قبلاً هست؟» در کد کافی نیست: دو اجرای هم‌زمان هر دو خالی بودن را
     * می‌بینند و هر دو درج می‌کنند، و کاربر دو پیامک می‌گیرد.
     *
     * ⚠️ شرط فقط **یادآوری‌ها** را می‌گیرد، نه هر اعلانِ وصل به جلسه.
     * فرم اولیه‌اش همه را می‌گرفت، که تا وقتی تنها تولیدکننده‌ی اعلان
     * جاروی یادآوری بود درست کار می‌کرد. با آمدن اعلان‌های رویدادی
     * غلط شد: هنرجویی که پس از بازخورد دوباره تمرینش را می‌فرستد باید
     * اعلان تازه بسازد، ولی سطر قبلی جلویش را می‌گرفت و استاد هرگز
     * نمی‌فهمید کار تازه‌ای رسیده.
     *
     * پیشوند `SESSION_REMINDER` با `REMINDER_KINDS` در
     * `notification/reminder.service.ts` گره خورده است — نوع یادآوری
     * تازه باید همان پیشوند را داشته باشد وگرنه بی‌صدا ایدمپوتنسی‌اش
     * را از دست می‌دهد. تست `notification.test.ts` هر دو سمت را می‌سنجد.
     */
    uniqueIndex("notifications_once_per_booking")
      .on(table.bookingId, table.userId, table.type)
      .where(
        sql`${table.bookingId} IS NOT NULL AND ${table.type} LIKE 'SESSION_REMINDER%'`,
      ),
  ],
);

export const sessionNotesRelations = relations(sessionNotes, ({ one }) => ({
  booking: one(bookings, {
    fields: [sessionNotes.bookingId],
    references: [bookings.id],
  }),
}));

export const assignmentsRelations = relations(assignments, ({ one, many }) => ({
  booking: one(bookings, { fields: [assignments.bookingId], references: [bookings.id] }),
  submissions: many(submissions),
}));

export const submissionsRelations = relations(submissions, ({ one }) => ({
  assignment: one(assignments, {
    fields: [submissions.assignmentId],
    references: [assignments.id],
  }),
  student: one(users, { fields: [submissions.studentId], references: [users.id] }),
  feedback: one(feedbacks, {
    fields: [submissions.id],
    references: [feedbacks.submissionId],
  }),
}));

export const feedbacksRelations = relations(feedbacks, ({ one }) => ({
  submission: one(submissions, {
    fields: [feedbacks.submissionId],
    references: [submissions.id],
  }),
}));

export const recordingsRelations = relations(recordings, ({ one }) => ({
  booking: one(bookings, { fields: [recordings.bookingId], references: [bookings.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));
