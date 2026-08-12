import { sql } from "drizzle-orm";

import { db, sqlClient } from "../db/client.js";
import { closeRedis, redis } from "../redis/client.js";
import { assertTestDatabase } from "./env.js";
import {
  availabilityRules,
  instruments,
  offerings,
  teacherProfiles,
  users,
} from "../db/schema/index.js";

/**
 * کمک‌کننده‌های تست یکپارچگی.
 *
 * این تست‌ها روی پستگرس واقعی اجرا می‌شوند، نه روی جایگزین درون‌حافظه‌ای.
 * دلیلش این است که مهم‌ترین رفتار سیستم رزرو — مصونیت در برابر شرط
 * رقابتی — از قید `EXCLUDE` دیتابیس می‌آید و با هیچ ماک دیگری قابل
 * اثبات نیست.
 */

/**
 * همه‌ی جدول‌ها را خالی می‌کند. بین تست‌ها صدا زده می‌شود.
 *
 * بررسی نام دیتابیس دقیقاً پیش از `TRUNCATE` تکرار می‌شود. `setup.ts`
 * هم همین را بررسی می‌کند، ولی این تابع `export` شده است و مخربترین کار
 * کل مخزن را انجام می‌دهد؛ تکیه کردنش به اینکه «یک جای دیگر بررسی شده»
 * یعنی اولین import اشتباه، دیتابیس توسعه را پاک می‌کند.
 */
export async function resetDatabase(): Promise<void> {
  assertTestDatabase(process.env.DATABASE_URL ?? "");

  await db.execute(sql`
    TRUNCATE TABLE
      bookings, enrollments, order_items, orders, ledger_entries, payouts,
      session_notes, assignments, submissions, feedbacks, recordings,
      notifications, availability_rules, availability_exceptions,
      offerings, teacher_profiles, instruments, refresh_tokens, users
    RESTART IDENTITY CASCADE
  `);
}

export async function closeDatabase(): Promise<void> {
  await sqlClient.end();
  await closeRedis();
}

/** حالت‌های ردیس (کد ورود، محدودسازی نرخ) را بین تست‌ها پاک می‌کند. */
export async function resetRedis(): Promise<void> {
  await redis.flushdb();
}

/**
 * توکن دسترسی معتبر برای یک کاربر می‌سازد.
 * تست‌های e2e برای عبور از گارد سراسری به آن نیاز دارند.
 */
export async function accessTokenFor(userId: string, isAdmin = false): Promise<string> {
  const { issueAccessToken } = await import("../auth/token.service.js");
  return issueAccessToken({ userId, isAdmin });
}

export interface Fixture {
  studentId: string;
  otherStudentId: string;
  teacherUserId: string;
  teacherProfileId: string;
  offeringId: string;
  instrumentId: string;
}

export interface SeedOptions {
  /** شنبه = ۰ ... جمعه = ۶ */
  weekday?: number;
  startMinute?: number;
  endMinute?: number;
  sessionMinutes?: number;
  bufferMinutes?: number;
  /** ریال */
  price?: bigint;
  commissionRate?: string;
}

/**
 * یک استاد، دو هنرجو، یک ساز و یک سرویس می‌سازد.
 * استاد به‌صورت پیش‌فرض شنبه‌ها ۱۶:۰۰ تا ۲۰:۰۰ در دسترس است.
 */
export async function seedFixture(options: SeedOptions = {}): Promise<Fixture> {
  const {
    weekday = 0, // شنبه
    startMinute = 16 * 60,
    endMinute = 20 * 60,
    sessionMinutes = 60,
    bufferMinutes = 0,
    price = 3_000_000n,
    commissionRate = "20",
  } = options;

  const insertedUsers = await db
    .insert(users)
    .values([
      { phone: "+989120000001", fullName: "هنرجوی الف" },
      { phone: "+989120000002", fullName: "هنرجوی ب" },
      { phone: "+989120000003", fullName: "استاد رضایی" },
    ])
    .returning({ id: users.id });

  const student = insertedUsers[0]!;
  const otherStudent = insertedUsers[1]!;
  const teacherUser = insertedUsers[2]!;

  const [teacherProfile] = await db
    .insert(teacherProfiles)
    .values({
      userId: teacherUser.id,
      slug: "rezaei",
      headline: "مدرس گیتار کلاسیک",
      status: "APPROVED",
      commissionRate,
      bufferMinutes,
    })
    .returning({ id: teacherProfiles.id });

  const [instrument] = await db
    .insert(instruments)
    .values({ slug: "classical-guitar", nameFa: "گیتار کلاسیک" })
    .returning({ id: instruments.id });

  const [offering] = await db
    .insert(offerings)
    .values({
      teacherId: teacherProfile!.id,
      instrumentId: instrument!.id,
      price,
      durationMinutes: sessionMinutes,
    })
    .returning({ id: offerings.id });

  await db.insert(availabilityRules).values({
    teacherId: teacherProfile!.id,
    weekday,
    startMinute,
    endMinute,
    validFrom: "2026-01-01",
    validUntil: null,
  });

  return {
    studentId: student.id,
    otherStudentId: otherStudent.id,
    teacherUserId: teacherUser.id,
    teacherProfileId: teacherProfile!.id,
    offeringId: offering!.id,
    instrumentId: instrument!.id,
  };
}
