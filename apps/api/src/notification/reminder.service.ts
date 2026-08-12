/**
 * یادآوری پیامکی جلسه.
 *
 * دو مرحله‌ی جدا، و جدا بودنشان عمدی است:
 *
 *   ۱. **ساختن سطر** در `notifications` برای یادآوری‌ای که وقتش رسیده.
 *      ایندکس یکتای `notifications_once_per_booking` یعنی این کار هر
 *      چند بار هم انجام شود، بیش از یک سطر ساخته نمی‌شود.
 *   ۲. **فرستادن** سطرهای در انتظار.
 *
 * اگر یک مرحله بود — «پیدا کن و بفرست» — تنها راه جلوگیری از ارسال
 * دوباره، حافظه‌ی پروسه بود، و ری‌استارت وُرکر یعنی همه دوباره پیامک
 * بگیرند. با این ترتیب، حقیقت در دیتابیس است نه در حافظه.
 */

import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Logger } from "@nestjs/common";

import { db } from "../db/client.js";
import {
  bookings,
  instruments,
  notifications,
  offerings,
  users,
} from "../db/schema/index.js";
import { sessionReminderText } from "./templates.js";
import { smsSender, type SmsSender } from "./sms.port.js";

const MINUTE_MS = 60_000;

/**
 * چند یادآوری در هر اجرا فرستاده می‌شود.
 *
 * سقف دارد تا یک جاب، پنل پیامک را در چند ثانیه بمباران نکند و اجرای
 * بعدی جارو (یک دقیقه بعد) بقیه را بردارد. عقب‌ماندگی خودبه‌خود جبران
 * می‌شود.
 */
const DISPATCH_BATCH = 200;

export interface ReminderKind {
  /** در ستون `notifications.type` می‌نشیند */
  type: string;
  /** چند دقیقه پیش از شروع جلسه */
  leadMinutes: number;
}

export const REMINDER_KINDS: readonly ReminderKind[] = [
  { type: "SESSION_REMINDER_24H", leadMinutes: 24 * 60 },
  { type: "SESSION_REMINDER_1H", leadMinutes: 60 },
];

const REMINDER_TYPES = REMINDER_KINDS.map((kind) => kind.type);

// ---------------------------------------------------------------------------
// مرحله‌ی ۱ — ساختن سطر یادآوری
// ---------------------------------------------------------------------------

/**
 * برای جلسه‌هایی که به موعد یادآوری رسیده‌اند سطر می‌سازد.
 *
 * یک `INSERT ... SELECT` است، نه خواندن در برنامه و بعد درج. دو دلیل:
 * رفت‌وبرگشت کمتر، و مهم‌تر از آن، `ON CONFLICT DO NOTHING` روی همان
 * دستور اتمی است. اگر اول می‌خواندیم «سطری هست؟» و بعد درج می‌کردیم،
 * دو اجرای هم‌زمان هر دو خالی بودن را می‌دیدند.
 *
 * شرط `scheduled_for >= created_at` نکته‌ی ظریفی را می‌گیرد: جلسه‌ای که
 * سه ساعت پیش از شروعش رزرو شده، هرگز «۲۴ ساعت مانده» نداشته است.
 * بدون این شرط، همان لحظه یک یادآوری ۲۴ ساعته‌ی بی‌معنا می‌گرفت.
 *
 * `IN_PROGRESS` عمداً بیرون است: کسی که وارد اتاق شده یادآوری نمی‌خواهد.
 */
export async function scheduleDueReminders(now: Date = new Date()): Promise<number> {
  const at = sql`${now.toISOString()}::timestamptz`;
  let created = 0;

  for (const kind of REMINDER_KINDS) {
    /** لحظه‌ی موعدِ همین یادآوری: شروع جلسه منهای فاصله‌اش. */
    const dueAt = sql`(b.scheduled_at - make_interval(mins => ${kind.leadMinutes}))`;

    const inserted = await db.execute<{ id: string }>(sql`
      INSERT INTO notifications (user_id, booking_id, type, channel, payload, scheduled_for)
      SELECT
        party.user_id,
        b.id,
        ${kind.type},
        'SMS',
        jsonb_build_object('role', party.role),
        ${dueAt}
      FROM bookings b
      CROSS JOIN LATERAL (
        VALUES (b.student_id, 'STUDENT'), (b.teacher_id, 'TEACHER')
      ) AS party(user_id, role)
      WHERE b.status = 'CONFIRMED'
        AND b.scheduled_at > ${at}
        AND ${dueAt} <= ${at}
        AND ${dueAt} >= b.created_at
      ON CONFLICT (booking_id, user_id, type) WHERE booking_id IS NOT NULL
      DO NOTHING
      RETURNING id
    `);

    created += inserted.length;
  }

  return created;
}

// ---------------------------------------------------------------------------
// مرحله‌ی ۲ — فرستادن
// ---------------------------------------------------------------------------

export interface DispatchResult {
  sent: number;
  failed: number;
}

const recipient = alias(users, "recipient");
const studentUser = alias(users, "student_user");
const teacherUser = alias(users, "teacher_user");

/**
 * یادآوری‌های در انتظار را می‌فرستد.
 *
 * ترتیب «اول علامت بزن، بعد بفرست» عمدی است و بدترین حالتش را انتخاب
 * می‌کند: اگر پروسه دقیقاً بین این دو بمیرد، یک یادآوری فرستاده نمی‌شود.
 * ترتیب برعکس، بدترین حالتش این بود که کاربر نصف شب دو بار پیامک بگیرد.
 * برای یادآوری، از دست رفتن بهتر از تکرار است.
 *
 * علامت زدن `UPDATE` شرطی است، پس دو وُرکر هم‌زمان هم یک سطر را دو بار
 * برنمی‌دارند.
 *
 * وضعیت رزرو دوباره بررسی می‌شود: جلسه‌ای که بعد از ساخته شدن یادآوری
 * لغو شده، نباید یادآوری بگیرد.
 */
export async function dispatchDueReminders(
  now: Date = new Date(),
  sender: SmsSender = smsSender(),
): Promise<DispatchResult> {
  const logger = new Logger("Reminder");

  const due = await db
    .select({
      id: notifications.id,
      userId: notifications.userId,
      phone: recipient.phone,
      studentId: bookings.studentId,
      studentName: studentUser.fullName,
      teacherName: teacherUser.fullName,
      scheduledAt: bookings.scheduledAt,
      instrumentName: instruments.nameFa,
    })
    .from(notifications)
    .innerJoin(recipient, eq(recipient.id, notifications.userId))
    .innerJoin(bookings, eq(bookings.id, notifications.bookingId))
    .innerJoin(studentUser, eq(studentUser.id, bookings.studentId))
    .innerJoin(teacherUser, eq(teacherUser.id, bookings.teacherId))
    .innerJoin(offerings, eq(offerings.id, bookings.offeringId))
    .innerJoin(instruments, eq(instruments.id, offerings.instrumentId))
    .where(
      and(
        eq(notifications.status, "PENDING"),
        eq(notifications.channel, "SMS"),
        inArray(notifications.type, REMINDER_TYPES),
        lte(notifications.scheduledFor, now),
        eq(bookings.status, "CONFIRMED"),
      ),
    )
    .limit(DISPATCH_BATCH);

  let sent = 0;
  let failed = 0;

  for (const row of due) {
    const [claimed] = await db
      .update(notifications)
      .set({ status: "SENT", sentAt: now })
      .where(and(eq(notifications.id, row.id), eq(notifications.status, "PENDING")))
      .returning({ id: notifications.id });

    // اجرای دیگری زودتر برش داشته
    if (!claimed) continue;

    const isStudent = row.userId === row.studentId;
    const text = sessionReminderText({
      instrumentName: row.instrumentName,
      counterpartName: isStudent ? row.teacherName : row.studentName,
      sessionAt: row.scheduledAt,
      now,
    });

    try {
      await sender.sendText(row.phone, text);
      sent += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);

      /**
       * سطر روی `FAILED` می‌نشیند و دوباره تلاش نمی‌شود.
       *
       * یادآوری ارزشش به سر وقت رسیدن است؛ تلاش دوباره‌ی خودکار یعنی
       * پیامکِ «فردا ساعت ۱۷» ساعت‌ها بعد از جلسه برسد. متن خطا می‌ماند
       * تا ادمین ببیند چه شد.
       */
      await db
        .update(notifications)
        .set({ status: "FAILED", error: message })
        .where(eq(notifications.id, row.id));

      logger.warn(`ارسال یادآوری ${row.id} شکست خورد: ${message}`);
    }
  }

  return { sent, failed };
}
