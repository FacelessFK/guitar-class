/**
 * اعتبار هنرجو.
 *
 * سه قاعده که کل این فایل رویشان بنا شده:
 *
 *   ۱. **سطرها منبع حقیقت‌اند، ستون کش است.** `users.credit_balance`
 *      هرگز `balance + delta` نمی‌شود؛ در هر تغییر از نو از روی
 *      `SUM(amount)` نوشته می‌شود. یعنی ستون نمی‌تواند بی‌صدا از سطرها
 *      جدا بیفتد، چون هیچ‌وقت مستقل از آن‌ها محاسبه نمی‌شود.
 *
 *   ۲. **هر نوشتن زیر قفل سطر `users` انجام می‌شود.** موجودی یک جمع
 *      است نه یک سطر، و جمع را نمی‌شود با ایندکس یکتا محافظت کرد. این
 *      تنها گاردِ این ماژول است که از جنس بقیه‌ی گاردهای پروژه نیست، و
 *      بدون آن دو چک‌اوت هم‌زمان هر دو همان موجودی را می‌بینند و هر دو
 *      خرجش می‌کنند.
 *
 *   ۳. **تکرار با ایندکس یکتا گرفته می‌شود، نه با بررسی پیش از درج.**
 *      یکی به ازای هر رزرو برای اعطای لغو، یکی به ازای هر سفارش برای
 *      خرج — دقیقاً به همان دلیلی که `ledger_one_refund_per_booking`
 *      وجود دارد.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { isCreditAmountValid, type CreditReason } from "@music/shared";

import { db, type Database } from "../db/client.js";
import { creditEntries, users } from "../db/schema/index.js";
import { InsufficientCreditError, StudentNotFoundError } from "./errors.js";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Transaction | Database;

export interface CreditEntryInput {
  studentId: string;
  reason: CreditReason;
  /** مثبت یعنی اعطا، منفی یعنی خرج */
  amount: bigint;
  bookingId?: string | null;
  orderId?: string | null;
  createdById?: string | null;
  description: string;
}

/**
 * موجودی اعتبار هنرجو.
 *
 * از ستون کش‌شده خوانده می‌شود، نه با جمع زدن تاریخچه: این عدد در هر
 * صفحه‌ی رزرو و هر چک‌اوت لازم است و جمع زدن سطرها در هر بار باز شدن
 * صفحه، هزینه‌ای است که دلیلی ندارد.
 *
 * برای تصمیم‌های مالی از این تابع استفاده نکن — `writeCreditEntry`
 * موجودی را خودش زیر قفل می‌خواند. این یکی برای نمایش است.
 */
export async function creditBalanceOf(studentId: string): Promise<bigint> {
  const [row] = await db
    .select({ balance: users.creditBalance })
    .from(users)
    .where(eq(users.id, studentId))
    .limit(1);

  return row?.balance ?? 0n;
}

/**
 * تنها نویسنده‌ی اعتبار.
 *
 * ترتیب سه کار عمدی است و جابه‌جا کردنش مسئله می‌سازد:
 *
 *   ۱. قفل گرفتن روی سطر `users`. از این لحظه هیچ تراکنش دیگری نمی‌تواند
 *      برای همین هنرجو اعتبار بنویسد.
 *   ۲. درج سطر.
 *   ۳. نوشتن دوباره‌ی ستون کش از روی جمعِ سطرها.
 *
 * قفل **پیش از** خواندن موجودی گرفته می‌شود، نه بعدش. اگر اول
 * می‌خواندیم و بعد قفل می‌گرفتیم، همان شرط رقابتی‌ای که قرار بود بسته
 * شود باز می‌ماند.
 *
 * حتماً داخل تراکنش صدا زده شود: سطر و ستون باید با هم بروند یا با هم
 * برگردند.
 */
export async function writeCreditEntry(
  tx: Transaction,
  input: CreditEntryInput,
): Promise<bigint> {
  if (!isCreditAmountValid(input.reason, input.amount)) {
    throw new RangeError(
      `مبلغ ${input.amount} با دلیل ${input.reason} نمی‌خواند`,
    );
  }

  const balance = await lockBalance(tx, input.studentId);

  if (balance + input.amount < 0n) {
    throw new InsufficientCreditError(balance, -input.amount);
  }

  await tx.insert(creditEntries).values({
    studentId: input.studentId,
    reason: input.reason,
    amount: input.amount,
    bookingId: input.bookingId ?? null,
    orderId: input.orderId ?? null,
    createdById: input.createdById ?? null,
    description: input.description,
  });

  return recomputeBalance(tx, input.studentId);
}

/**
 * سطر هنرجو را قفل می‌کند و موجودی‌اش را برمی‌گرداند.
 *
 * `FOR UPDATE` روی یک سطر است، نه روی جدول: دو هنرجوی مختلف هم‌زمان
 * اعتبار خرج می‌کنند بی‌آنکه منتظر هم بمانند.
 */
async function lockBalance(tx: Transaction, studentId: string): Promise<bigint> {
  const [row] = await tx
    .select({ balance: users.creditBalance })
    .from(users)
    .where(eq(users.id, studentId))
    .limit(1)
    .for("update");

  if (!row) throw new StudentNotFoundError();

  return row.balance;
}

/**
 * ستون کش را از نو از روی سطرها می‌نویسد.
 *
 * زیرکوئری نام مستعار دارد چون `student_id` در `users` وجود ندارد ولی
 * تکیه کردن به «وجود ندارد» برای چیزی که پول را جابه‌جا می‌کند کافی
 * نیست؛ اضافه شدن ستونی به همین نام در آینده، شرط را بی‌صدا به سطر خودش
 * می‌بندد و موجودی همه را برابر می‌کند.
 */
async function recomputeBalance(tx: Transaction, studentId: string): Promise<bigint> {
  const [updated] = await tx
    .update(users)
    .set({
      creditBalance: sql`(
        SELECT COALESCE(SUM(ce."amount"), 0)
        FROM "credit_entries" AS ce
        WHERE ce."student_id" = ${studentId}
      )`,
    })
    .where(eq(users.id, studentId))
    .returning({ balance: users.creditBalance });

  return updated?.balance ?? 0n;
}

/**
 * خرج کردن اعتبار در یک سفارش.
 *
 * `amount` مثبت گرفته می‌شود و منفی ثبت می‌شود — همان قرارداد
 * `negateSplit` در دفتر کل: بیرون از این لایه کسی با علامت درگیر نشود.
 *
 * داخل همان تراکنشی صدا زده می‌شود که سفارش را قطعی می‌کند. اگر درج
 * دوم به ایندکس یکتا بخورد، کل تراکنش برمی‌گردد و سفارش هم قطعی
 * نمی‌شود؛ یعنی هیچ حالتی نیست که سفارش پرداخت‌شده باشد و اعتبارش دو
 * بار کم شده باشد.
 */
export async function spendCredit(
  tx: Transaction,
  input: { studentId: string; orderId: string; amount: bigint },
): Promise<bigint> {
  if (input.amount <= 0n) {
    throw new RangeError("مبلغ خرج اعتبار باید مثبت باشد");
  }

  return writeCreditEntry(tx, {
    studentId: input.studentId,
    reason: "SPEND",
    amount: -input.amount,
    orderId: input.orderId,
    description: "پرداخت با اعتبار",
  });
}

export interface AdminCreditInput {
  studentId: string;
  /** مثبت برای اعطا، منفی برای پس گرفتن اشتباهِ خود ادمین */
  amount: bigint;
  adminId: string;
  description: string;
}

/**
 * اعطا یا اصلاح دستی اعتبار از پنل ادمین.
 *
 * دو حالت واقعی دارد که تا امروز هیچ فعلی نداشتند و در پنل فقط «نیازمند
 * بازپرداخت دستی» دیده می‌شدند:
 *
 *   • سطر `ADJUSTMENT` که `writeUnmatchedPaymentAdjustment` می‌سازد —
 *     پولی که گرفته شد ولی جلسه‌ای پشتش قطعی نشد.
 *   • پرونده‌ی `ATTENDANCE_UNVERIFIED` که عمداً بازپرداخت خودکار
 *     نمی‌گیرد و منتظر تصمیم آدم می‌ماند.
 *
 * هویت ادمین روی سطر ثبت می‌شود. اعتبارِ بی‌نام یعنی مبلغی که فردا
 * هیچ‌کس نمی‌تواند بگوید چه کسی و چرا داده.
 */
export async function grantAdminCredit(input: AdminCreditInput): Promise<bigint> {
  return db.transaction(async (tx) =>
    writeCreditEntry(tx, {
      studentId: input.studentId,
      reason: "ADMIN_ADJUSTMENT",
      amount: input.amount,
      createdById: input.adminId,
      description: input.description,
    }),
  );
}

export interface CreditEntryRow {
  id: string;
  reason: CreditReason;
  amount: bigint;
  bookingId: string | null;
  orderId: string | null;
  description: string;
  createdAt: Date;
}

/** تاریخچه‌ی اعتبار هنرجو، تازه‌ترین اول. */
export async function listCreditEntries(
  studentId: string,
  limit = 100,
  executor: Executor = db,
): Promise<CreditEntryRow[]> {
  return executor
    .select({
      id: creditEntries.id,
      reason: creditEntries.reason,
      amount: creditEntries.amount,
      bookingId: creditEntries.bookingId,
      orderId: creditEntries.orderId,
      description: creditEntries.description,
      createdAt: creditEntries.createdAt,
    })
    .from(creditEntries)
    .where(eq(creditEntries.studentId, studentId))
    .orderBy(desc(creditEntries.createdAt))
    .limit(limit);
}

/**
 * آیا این رزرو قبلاً به اعتبار تبدیل شده است.
 *
 * ایندکس یکتا تکرار را ناممکن می‌کند؛ این تابع برای آن است که مسیر
 * عادی به خطای قید نخورد و بتواند «قبلاً انجام شده» را آرام رد کند.
 */
export async function cancellationCreditExists(
  tx: Executor,
  bookingId: string,
): Promise<boolean> {
  const [row] = await tx
    .select({ id: creditEntries.id })
    .from(creditEntries)
    .where(
      and(
        eq(creditEntries.bookingId, bookingId),
        eq(creditEntries.reason, "CANCELLATION"),
      ),
    )
    .limit(1);

  return row !== undefined;
}
