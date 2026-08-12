/**
 * اعلان درون‌اپ.
 *
 * ستون `channel` از روز اول حالت `IN_APP` داشت و هیچ‌کس نه می‌نوشتش و
 * نه می‌خواندش. تنها کانال فعال پیامک بود، که برای «یادآوری کلاس»
 * درست است ولی برای «استاد بازخوردت را گذاشت» نه: پیامک هزینه دارد،
 * محدودیت الگو دارد، و برای رویدادی که ارزشش وقتی است که کاربر داخل
 * اپ است، اسراف است.
 *
 * تفاوت کلیدی با پیامک: **اینجا «فرستادن» مرحله‌ی جدایی نیست.** سطر
 * که ساخته شد، تحویل شده است. برای همین `status` مستقیم `SENT` درج
 * می‌شود و آنچه دنبال می‌شود «خوانده شد» است، نه «فرستاده شد».
 */

import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db, type Database } from "../db/client.js";
import { notifications } from "../db/schema/index.js";

/**
 * انواع اعلان درون‌اپ.
 *
 * ⚠️ هیچ‌کدام با `SESSION_REMINDER` شروع نمی‌شود، و این عمدی است:
 * ایندکس یکتای `notifications_once_per_booking` فقط همان پیشوند را
 * می‌گیرد. اعلان رویدادی باید بتواند تکرار شود — هنرجویی که دوباره
 * تمرینش را می‌فرستد باید اعلان تازه بسازد.
 */
export const IN_APP_TYPES = {
  /** استاد تمرین تازه‌ای تعیین کرد → هنرجو */
  ASSIGNMENT_CREATED: "ASSIGNMENT_CREATED",
  /** هنرجو اجرایش را فرستاد → استاد */
  SUBMISSION_RECEIVED: "SUBMISSION_RECEIVED",
  /** استاد بازخورد داد → هنرجو */
  FEEDBACK_RECEIVED: "FEEDBACK_RECEIVED",
  /** استاد نکات جلسه را نوشت → هنرجو */
  SESSION_NOTE_ADDED: "SESSION_NOTE_ADDED",
  /** ادمین وضعیت پروفایل استاد را عوض کرد → استاد */
  TEACHER_STATUS_CHANGED: "TEACHER_STATUS_CHANGED",
  /** تسویه پرداخت شد → استاد */
  PAYOUT_PAID: "PAYOUT_PAID",
} as const;

export type InAppType = (typeof IN_APP_TYPES)[keyof typeof IN_APP_TYPES];

export interface NotifyInput {
  userId: string;
  type: InAppType;
  /** متنی که به کاربر نشان داده می‌شود — همین‌جا ساخته می‌شود نه در فرانت */
  message: string;
  /** مسیر درون‌اپ برای رفتن به موضوع اعلان */
  href?: string;
  bookingId?: string | null;
}

/**
 * یک اعلان درون‌اپ می‌سازد.
 *
 * **هرگز خطا پرتاب نمی‌کند.** اعلان اثر جانبی است، نه بخشی از کاری که
 * کاربر خواسته: اگر درج اعلان شکست بخورد، ثبت بازخورد نباید با آن
 * شکست بخورد. سکوتِ آگاهانه اینجا درست است چون بدترین حالتش یک اعلان
 * از دست رفته است، در برابر از دست رفتن خودِ بازخورد.
 *
 * `tx` اختیاری است ولی معمولاً **داده نمی‌شود**، دقیقاً به همین دلیل:
 * درج اعلان داخل تراکنشِ کار اصلی یعنی خطایش کل تراکنش را رول‌بک کند.
 */
export async function notifyInApp(
  input: NotifyInput,
  tx: Database | Parameters<Parameters<Database["transaction"]>[0]>[0] = db,
): Promise<void> {
  try {
    const now = new Date();

    await tx.insert(notifications).values({
      userId: input.userId,
      bookingId: input.bookingId ?? null,
      type: input.type,
      channel: "IN_APP",
      payload: { message: input.message, ...(input.href ? { href: input.href } : {}) },
      scheduledFor: now,
      // ساخته شدن یعنی تحویل شدن؛ مرحله‌ی ارسال جدایی وجود ندارد
      status: "SENT",
      sentAt: now,
    });
  } catch {
    // عمداً بلعیده می‌شود — بالای این تابع را ببین
  }
}

// ---------------------------------------------------------------------------
// خواندن
// ---------------------------------------------------------------------------

export interface NotificationView {
  id: string;
  type: string;
  message: string;
  href: string | null;
  bookingId: string | null;
  read: boolean;
  createdAt: string;
}

const LIST_LIMIT = 50;

/**
 * اعلان‌های کاربر، تازه‌ترین اول.
 *
 * فقط کانال `IN_APP` — سطرهای پیامک هم در همین جدول‌اند و نشان دادنشان
 * یعنی کاربر یادآوری‌ای را که هفته‌ی پیش پیامک شده دوباره ببیند.
 */
export async function listNotifications(
  userId: string,
): Promise<{ notifications: NotificationView[]; unread: number }> {
  const [rows, [count]] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(
        and(eq(notifications.userId, userId), eq(notifications.channel, "IN_APP")),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(LIST_LIMIT),
    db
      .select({ value: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.channel, "IN_APP"),
          isNull(notifications.readAt),
        ),
      ),
  ]);

  return {
    notifications: rows.map(toView),
    // شمارنده از کل جدول می‌آید نه از طول فهرست: کاربری که پنجاه اعلان
    // نخوانده دارد، «۵۰» می‌بیند نه عددی که به سقف فهرست چسبیده
    unread: count?.value ?? 0,
  };
}

function toView(row: typeof notifications.$inferSelect): NotificationView {
  const payload = (row.payload ?? {}) as { message?: unknown; href?: unknown };

  return {
    id: row.id,
    type: row.type,
    message: typeof payload.message === "string" ? payload.message : row.type,
    href: typeof payload.href === "string" ? payload.href : null,
    bookingId: row.bookingId,
    read: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * علامت زدن به‌عنوان خوانده‌شده.
 *
 * `ids` تهی یعنی همه. شرط `read_at IS NULL` هم هست تا زدن دوباره،
 * لحظه‌ی خواندن را جابه‌جا نکند — چیزی که اگر روزی «از آخرین بازدید»
 * جایی نشان داده شود، اهمیت پیدا می‌کند.
 *
 * شرط `user_id` روی خودِ `UPDATE` است نه بررسی جدا: با بررسی جداگانه،
 * اولین مسیری که فراموشش کند اجازه می‌دهد کسی اعلان دیگران را خوانده
 * علامت بزند.
 */
export async function markRead(userId: string, ids?: string[]): Promise<number> {
  const updated = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.channel, "IN_APP"),
        isNull(notifications.readAt),
        ids?.length
          ? sql`${notifications.id} = ANY(${sql.param(ids)}::uuid[])`
          : undefined,
      ),
    )
    .returning({ id: notifications.id });

  return updated.length;
}
