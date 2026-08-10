import { relations, sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, uuid, varchar } from "drizzle-orm/pg-core";

import { createdAt, primaryId } from "./columns.js";
import { exceptionType } from "./enums.js";
import { teacherProfiles } from "./catalog.js";

/**
 * دسترس‌پذیری استاد.
 *
 * تصمیم معماری: اسلات‌های آزاد ذخیره **نمی‌شوند**. فقط قوانین و استثناها
 * ذخیره می‌شوند و اسلات‌ها هر بار محاسبه می‌گردند. اگر برای تک‌تک
 * بازه‌های آزاد رکورد بسازیم، با هر تغییر در برنامه‌ی استاد باید هزاران
 * رکورد آینده را همگام‌سازی کنیم.
 *
 * منطق محاسبه: `packages/shared/src/availability.ts`
 *
 * قرارداد ساعت: «دقیقه از نیمه‌شب» (۰ تا ۱۴۴۰) به وقت تهران، نه تایپ
 * `time`. تایپ `time` در رفت‌وبرگشت با جاوااسکریپت ابهام منطقه‌ی زمانی
 * می‌سازد؛ حساب صحیح این ابهام را ندارد.
 */

export const availabilityRules = pgTable(
  "availability_rules",
  {
    id: primaryId(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teacherProfiles.id, { onDelete: "cascade" }),

    /** شنبه = ۰ ... جمعه = ۶ (شماره‌گذاری ایرانی، نه `Date.getDay()`) */
    weekday: integer().notNull(),
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),

    validFrom: date("valid_from").notNull(),
    /** `null` یعنی بدون تاریخ پایان */
    validUntil: date("valid_until"),

    createdAt: createdAt(),
  },
  (table) => [
    index("availability_rules_teacher_weekday_idx").on(table.teacherId, table.weekday),
    check("availability_rules_valid_weekday", sql`${table.weekday} BETWEEN 0 AND 6`),
    check(
      "availability_rules_valid_window",
      sql`${table.startMinute} >= 0 AND ${table.endMinute} <= 1440 AND ${table.startMinute} < ${table.endMinute}`,
    ),
    check(
      "availability_rules_valid_range",
      sql`${table.validUntil} IS NULL OR ${table.validUntil} >= ${table.validFrom}`,
    ),
  ],
);

export const availabilityExceptions = pgTable(
  "availability_exceptions",
  {
    id: primaryId(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teacherProfiles.id, { onDelete: "cascade" }),

    date: date().notNull(),
    type: exceptionType().notNull(),

    /** `null` در هر دو یعنی کل روز — فقط برای `BLOCK` معنا دارد */
    startMinute: integer("start_minute"),
    endMinute: integer("end_minute"),

    reason: varchar({ length: 200 }),
    createdAt: createdAt(),
  },
  (table) => [
    index("availability_exceptions_teacher_date_idx").on(table.teacherId, table.date),
    check(
      "availability_exceptions_valid_window",
      sql`(${table.startMinute} IS NULL AND ${table.endMinute} IS NULL)
          OR (${table.startMinute} >= 0 AND ${table.endMinute} <= 1440 AND ${table.startMinute} < ${table.endMinute})`,
    ),
    // «کل روز آزادم» معنای مفیدی ندارد و باید با قانون هفتگی تعریف شود
    check(
      "availability_exceptions_extra_needs_time",
      sql`${table.type} <> 'EXTRA' OR ${table.startMinute} IS NOT NULL`,
    ),
  ],
);

export const availabilityRulesRelations = relations(availabilityRules, ({ one }) => ({
  teacher: one(teacherProfiles, {
    fields: [availabilityRules.teacherId],
    references: [teacherProfiles.id],
  }),
}));

export const availabilityExceptionsRelations = relations(
  availabilityExceptions,
  ({ one }) => ({
    teacher: one(teacherProfiles, {
      fields: [availabilityExceptions.teacherId],
      references: [teacherProfiles.id],
    }),
  }),
);
