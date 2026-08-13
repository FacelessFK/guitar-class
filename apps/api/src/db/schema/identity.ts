import { relations } from "drizzle-orm";
import { boolean, index, pgTable, uuid, varchar } from "drizzle-orm/pg-core";

import { createdAt, primaryId, tstz, updatedAt } from "./columns.js";
import { userStatus } from "./enums.js";
import { teacherProfiles } from "./catalog.js";

/**
 * کاربر.
 *
 * ایمیل نداریم — کاربر ایرانی ایمیلش را چک نمی‌کند. هویت، شماره‌ی
 * موبایل است و ورود دو راه دارد: کد پیامکی، یا رمز عبور.
 *
 * نقش جدا ذخیره نمی‌شود: «استاد بودن» با وجود رکورد در `teacher_profiles`
 * مشخص می‌شود. یک کاربر می‌تواند هم‌زمان هنرجو و استاد باشد.
 */
export const users = pgTable(
  "users",
  {
    id: primaryId(),
    phone: varchar({ length: 15 }).notNull().unique(),
    fullName: varchar("full_name", { length: 120 }).notNull(),
    avatarUrl: varchar("avatar_url", { length: 500 }),
    /**
     * رمز عبور، هش‌شده — و **تهی‌پذیر**.
     *
     * ورود با کد پیامکی هنوز مسیر اصلی است و حسابی که از آن راه ساخته
     * شده رمزی ندارد. تهی بودن این ستون یعنی «این حساب رمز ندارد»، نه
     * «رمزش خالی است»؛ ورود با رمز برای چنین حسابی رد می‌شود.
     *
     * خودِ هش و قالبش در `auth/password.ts` است.
     */
    passwordHash: varchar("password_hash", { length: 200 }),
    isAdmin: boolean("is_admin").notNull().default(false),
    status: userStatus().notNull().default("ACTIVE"),

    /** جلسه‌ی معارفه‌ی رایگان یک‌بار برای همیشه است، نه یکی به ازای هر استاد. */
    trialUsedAt: tstz("trial_used_at"),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("users_status_idx").on(table.status)],
);

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: primaryId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 128 }).notNull().unique(),
    userAgent: varchar("user_agent", { length: 300 }),
    expiresAt: tstz("expires_at").notNull(),
    revokedAt: tstz("revoked_at"),
    createdAt: createdAt(),
  },
  (table) => [index("refresh_tokens_user_idx").on(table.userId)],
);

export const usersRelations = relations(users, ({ one, many }) => ({
  teacherProfile: one(teacherProfiles, {
    fields: [users.id],
    references: [teacherProfiles.userId],
  }),
  refreshTokens: many(refreshTokens),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
}));
