import { relations, sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAt, percent, primaryId, rial, tstz, updatedAt } from "./columns.js";
import { bookingStatus, bookingType, enrollmentStatus } from "./enums.js";
import { users } from "./identity.js";
import { offerings } from "./catalog.js";

/** پکیج ماهانه: روز و ساعت ثابت هفتگی، چند جلسه‌ی متوالی. */
export const enrollments = pgTable(
  "enrollments",
  {
    id: primaryId(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id),
    offeringId: uuid("offering_id")
      .notNull()
      .references(() => offerings.id),

    sessionsTotal: integer("sessions_total").notNull().default(4),
    /** شنبه = ۰ ... جمعه = ۶ */
    weekday: integer().notNull(),
    /** دقیقه از نیمه‌شب، به وقت تهران */
    startMinute: integer("start_minute").notNull(),
    startDate: date("start_date").notNull(),

    /** اسنپ‌شات — تغییر بعدی قیمت استاد نباید این را جابه‌جا کند */
    priceTotal: rial("price_total").notNull(),
    status: enrollmentStatus().notNull().default("PENDING_PAYMENT"),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("enrollments_student_status_idx").on(table.studentId, table.status),
    check("enrollments_valid_weekday", sql`${table.weekday} BETWEEN 0 AND 6`),
    check("enrollments_sessions_positive", sql`${table.sessionsTotal} > 0`),
  ],
);

/**
 * واحد اصلی سیستم: یک جلسه.
 *
 * قیدهای یکپارچگی این جدول در مایگریشن دست‌نویس
 * `booking_integrity_constraints` تعریف شده‌اند، چون `EXCLUDE USING gist`
 * را نه Drizzle و نه هیچ ORM دیگری در زبان اسکیمای خودش بیان نمی‌کند.
 */
export const bookings = pgTable(
  "bookings",
  {
    id: primaryId(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id),
    /** به `users.id` استاد اشاره می‌کند، نه به `teacher_profiles.id` */
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => users.id),
    offeringId: uuid("offering_id")
      .notNull()
      .references(() => offerings.id),
    enrollmentId: uuid("enrollment_id").references(() => enrollments.id),
    /** جلسه‌ی چندم از پکیج (از ۱) */
    sessionIndex: integer("session_index"),

    type: bookingType().notNull(),
    scheduledAt: tstz("scheduled_at").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),

    /**
     * پایان جلسه، ستون ذخیره‌شده.
     *
     * چرا محاسبه‌ای نیست: قید `EXCLUDE` که تداخل رزرو را ناممکن می‌کند
     * پشت صحنه ایندکس GiST می‌سازد، و ایندکس فقط عبارت IMMUTABLE
     * می‌پذیرد. عملگر `timestamptz + interval` در پستگرس STABLE است،
     * چون نتیجه‌اش می‌تواند به تنظیم منطقه‌ی زمانی وابسته باشد.
     *
     * اپلیکیشن مقدارش را می‌نویسد و قید `bookings_ends_at_consistent`
     * تضمین می‌کند همیشه با `durationMinutes` بخواند.
     */
    endsAt: tstz("ends_at").notNull(),

    status: bookingStatus().notNull().default("PENDING_PAYMENT"),

    /**
     * مهلت پرداخت. جاب پس‌زمینه بعد از این لحظه رزرو را `EXPIRED` می‌کند
     * تا اسلات آزاد شود. بدون این، هر کسی می‌تواند فقط با باز کردن صفحه‌ی
     * پرداخت، کل برنامه‌ی یک استاد را مسدود کند.
     */
    holdExpiresAt: tstz("hold_expires_at"),

    /** کپی می‌شوند نه ارجاع، تا تغییر قیمت روی گذشته اثر نگذارد */
    priceSnapshot: rial("price_snapshot").notNull(),
    commissionSnapshot: percent("commission_snapshot").notNull(),

    /** نام اتاق جیتسی. غیرقابل حدس، پس لو رفتن لینک بی‌خطر است. */
    roomId: uuid("room_id").notNull().unique().defaultRandom(),

    /**
     * از رویدادهای جیتسی پر می‌شوند.
     * هشدار: این داده از سمت کلاینت می‌آید و قابل دستکاری است. برای
     * گزارش عادی خوب است ولی برای رفع اختلاف مالی کافی نیست.
     */
    actualStartedAt: tstz("actual_started_at"),
    actualEndedAt: tstz("actual_ended_at"),

    /**
     * اولین ورودِ هر طرف، جدا از هم.
     *
     * `actual_started_at` می‌گوید «کسی وارد شد» ولی نمی‌گوید کدامشان، و
     * سه حالت از چهار حالت جدول عدم حضور (بخش ۵ سند معماری) دقیقاً به
     * همین تفکیک بند است: عدم حضور استاد جلسه را برمی‌گرداند و پول را
     * پس می‌دهد، عدم حضور هنرجو جلسه را می‌سوزاند. اشتباه گرفتنشان یعنی
     * پول اشتباه جابه‌جا می‌شود.
     *
     * مثل `actual_started_at` با `COALESCE` نوشته می‌شوند: ورود دوباره‌ی
     * همان نفر (قطع و وصل شبکه) اولین لحظه را جابه‌جا نمی‌کند.
     *
     * همان بدهی اینجا هم برقرار است — گزارش از کلاینت می‌آید و کسی که
     * وارد اتاق نشده هم می‌تواند خودش را حاضر ثبت کند.
     */
    teacherJoinedAt: tstz("teacher_joined_at"),
    studentJoinedAt: tstz("student_joined_at"),

    /**
     * همان دو ستون بالا، ولی از زبان **سرور جیتسی**.
     *
     * هوک prosody این‌ها را می‌نویسد و هویتِ توی رویداد از ادعای
     * `context.user.id` همان توکنی می‌آید که خودمان امضا کرده‌ایم و
     * prosody اعتبارش را سنجیده. چون سرور با `ENABLE_GUESTS=0` بالا
     * آمده، هیچ‌کس بدون آن توکن داخل اتاق نیست — پس این ستون‌ها را،
     * برخلاف دو تای بالا، نمی‌شود با یک `curl` پر کرد.
     *
     * جدا نگه داشته شده‌اند نه جایگزین، چون دو چیز متفاوت می‌گویند:
     * آن‌ها «مرورگر گفت آمدم» و این‌ها «سرور دید که آمد». اختلافشان
     * خودش داده است — یعنی یا هوک خوابیده یا کسی خودش را حاضر جا زده.
     *
     * تصمیم مالی (بازپرداخت عدم حضور استاد) فقط روی این‌ها گرفته
     * می‌شود؛ `docs/architecture.md` بخش ۶.۵.
     */
    teacherVerifiedAt: tstz("teacher_verified_at"),
    studentVerifiedAt: tstz("student_verified_at"),

    cancelledAt: tstz("cancelled_at"),
    cancelledById: uuid("cancelled_by_id").references(() => users.id),
    cancellationReason: text("cancellation_reason"),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("bookings_teacher_scheduled_idx").on(table.teacherId, table.scheduledAt),
    index("bookings_student_scheduled_idx").on(table.studentId, table.scheduledAt),
    /** برای جابی که رزروهای پرداخت‌نشده را منقضی می‌کند */
    index("bookings_hold_expiry_idx").on(table.status, table.holdExpiresAt),
    /**
     * برای جاروی بستن خودکار جلسه: «کدام جلسه‌ی باز، پایانش گذشته؟»
     * بدون این، هر دقیقه کل جدول رزروها اسکن می‌شود.
     */
    index("bookings_session_close_idx").on(table.status, table.endsAt),
    /** برای جاروی یادآوری: «کدام جلسه‌ی قطعی‌شده نزدیک است؟» */
    index("bookings_reminder_idx").on(table.status, table.scheduledAt),
    index("bookings_enrollment_idx").on(table.enrollmentId),
    check("bookings_duration_positive", sql`${table.durationMinutes} > 0`),
    check("bookings_price_non_negative", sql`${table.priceSnapshot} >= 0`),
    // جلسه‌ی پکیج باید به ثبت‌نام وصل باشد و شماره داشته باشد؛
    // جلسه‌ی غیرپکیج نباید هیچ‌کدام را داشته باشد
    check(
      "bookings_package_fields_consistent",
      sql`(${table.type} = 'PACKAGE' AND ${table.enrollmentId} IS NOT NULL AND ${table.sessionIndex} IS NOT NULL)
          OR (${table.type} <> 'PACKAGE' AND ${table.enrollmentId} IS NULL AND ${table.sessionIndex} IS NULL)`,
    ),
  ],
);

export const enrollmentsRelations = relations(enrollments, ({ one, many }) => ({
  student: one(users, { fields: [enrollments.studentId], references: [users.id] }),
  offering: one(offerings, {
    fields: [enrollments.offeringId],
    references: [offerings.id],
  }),
  bookings: many(bookings),
}));

export const bookingsRelations = relations(bookings, ({ one }) => ({
  student: one(users, {
    fields: [bookings.studentId],
    references: [users.id],
    relationName: "studentBookings",
  }),
  teacher: one(users, {
    fields: [bookings.teacherId],
    references: [users.id],
    relationName: "teacherBookings",
  }),
  offering: one(offerings, {
    fields: [bookings.offeringId],
    references: [offerings.id],
  }),
  enrollment: one(enrollments, {
    fields: [bookings.enrollmentId],
    references: [enrollments.id],
  }),
}));
