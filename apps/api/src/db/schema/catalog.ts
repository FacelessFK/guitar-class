import { relations } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { createdAt, percent, primaryId, rial, updatedAt } from "./columns.js";
import { skillLevel, teacherStatus } from "./enums.js";
import { users } from "./identity.js";

/**
 * ساز جدول است نه شمارشی، چون قرار است مدام اضافه شود:
 * گیتار کلاسیک و سنتور شروع، و بعد هرچه پیش بیاید.
 */
export const instruments = pgTable("instruments", {
  id: primaryId(),
  /** در URL صفحه‌ی سئو: /instruments/classical-guitar */
  slug: varchar({ length: 80 }).notNull().unique(),
  nameFa: varchar("name_fa", { length: 80 }).notNull(),
  /** محتوای صفحه‌ی لندینگ — این صفحات موتور اصلی سئو هستند */
  descriptionFa: text("description_fa"),
  iconUrl: varchar("icon_url", { length: 500 }),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
});

export const teacherProfiles = pgTable(
  "teacher_profiles",
  {
    id: primaryId(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),

    slug: varchar({ length: 80 }).notNull().unique(),
    headline: varchar({ length: 160 }).notNull(),
    bio: text(),
    /** ویدیوی معارفه — بیشترین اثر را روی نرخ تبدیل دارد */
    introVideoUrl: varchar("intro_video_url", { length: 500 }),
    yearsExperience: integer("years_experience").notNull().default(0),
    status: teacherStatus().notNull().default("PENDING"),

    /**
     * درصد سهم پلتفرم. روی استاد نشسته نه ثابت در کد، چون قطعاً یک روز
     * به یک استاد خوب نرخ بهتری داده می‌شود.
     */
    commissionRate: percent("commission_rate").notNull().default("20"),

    /** فاصله‌ی اجباری بین دو کلاس پشت‌سرهم، به دقیقه */
    bufferMinutes: integer("buffer_minutes").notNull().default(15),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("teacher_profiles_status_idx").on(table.status),
    check(
      "teacher_profiles_commission_range",
      sql`${table.commissionRate} >= 0 AND ${table.commissionRate} <= 100`,
    ),
    check("teacher_profiles_buffer_positive", sql`${table.bufferMinutes} >= 0`),
  ],
);

/**
 * واحد قیمت‌گذاری: جفتِ (استاد، ساز).
 *
 * قیمت روی استاد نیست چون یک استاد ممکن است گیتار را با قیمتی و تئوری
 * موسیقی را با قیمت دیگری تدریس کند.
 */
export const offerings = pgTable(
  "offerings",
  {
    id: primaryId(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teacherProfiles.id, { onDelete: "cascade" }),
    instrumentId: uuid("instrument_id")
      .notNull()
      .references(() => instruments.id),

    /** ریال */
    price: rial("price").notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(60),
    levels: skillLevel().array().notNull().default([]),
    isActive: boolean("is_active").notNull().default(true),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("offerings_teacher_instrument_unique").on(table.teacherId, table.instrumentId),
    index("offerings_instrument_active_idx").on(table.instrumentId, table.isActive),
    check("offerings_price_positive", sql`${table.price} > 0`),
    check("offerings_duration_positive", sql`${table.durationMinutes} > 0`),
  ],
);

export const instrumentsRelations = relations(instruments, ({ many }) => ({
  offerings: many(offerings),
}));

export const teacherProfilesRelations = relations(teacherProfiles, ({ one, many }) => ({
  user: one(users, { fields: [teacherProfiles.userId], references: [users.id] }),
  offerings: many(offerings),
}));

export const offeringsRelations = relations(offerings, ({ one }) => ({
  teacher: one(teacherProfiles, {
    fields: [offerings.teacherId],
    references: [teacherProfiles.id],
  }),
  instrument: one(instruments, {
    fields: [offerings.instrumentId],
    references: [instruments.id],
  }),
}));
