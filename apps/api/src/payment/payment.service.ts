/**
 * پرداخت: سفارش، تأیید، دفتر کل.
 *
 * سه قاعده که کل این ماژول رویشان بنا شده:
 *
 *   ۱. **هیچ‌چیزی که مرورگر کاربر می‌گوید باور نمی‌شود.** آدرس بازگشتِ
 *      درگاه عمومی است و هر کسی می‌تواند صدایش کند. تنها منبع حقیقت،
 *      پاسخ سرورِ درگاه به درخواست تأییدِ ماست — و در همان درخواست مبلغ
 *      مورد انتظار را می‌فرستیم تا دستکاری مبلغ هم بی‌اثر شود.
 *
 *   ۲. **تأیید ایدمپوتنت است.** کاربر صفحه‌ی بازگشت را رفرش می‌کند،
 *      درگاه دوباره می‌فرستد، شبکه قطع و وصل می‌شود. قطعی کردن سفارش با
 *      یک `UPDATE` شرطی انجام می‌شود و درج در دفتر کل ایندکس یکتا دارد،
 *      پس دو بار پول به استاد نمی‌رسد.
 *
 *   ۳. **دفتر کل فقط افزودنی است.** بازپرداخت یک سطر منفی است، نه
 *      ویرایش سطر درآمد. مجموع `net_amount` هر استاد، بدهی واقعی
 *      پلتفرم به اوست.
 */

import { and, eq, inArray, lt, sql, sum } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  BUSINESS_RULES,
  negateSplit,
  splitCommission,
  type CommissionSplit,
} from "@music/shared";

import { db, type Database } from "../db/client.js";
import {
  bookings,
  enrollments,
  instruments,
  ledgerEntries,
  offerings,
  orderItems,
  orders,
  teacherProfiles,
  users,
} from "../db/schema/index.js";
import { confirmBookings } from "../booking/booking.service.js";
import { BookingNotFoundError } from "../booking/errors.js";
import { IN_APP_TYPES, notifyInApp } from "../notification/in-app.service.js";
import { sessionDateTimeFa } from "../notification/templates.js";
import {
  GatewayUnreachableError,
  NotPayableError,
  OrderNotFoundError,
  PaymentHoldExpiredError,
} from "./errors.js";
import { paymentGateway, type PaymentGateway } from "./gateway.port.js";

const MINUTE_MS = 60_000;

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** دو بار `users` در یک کوئری: یک بار هنرجو، یک بار استاد. */
const paymentStudent = alias(users, "payment_student");
const paymentTeacher = alias(users, "payment_teacher");

/**
 * وضعیت‌هایی که سفارش از آن‌ها می‌تواند به `PAID` برود.
 *
 * `FAILED` عمداً هست: جاروی سفارش‌های کهنه ممکن است سفارشی را ناموفق
 * علامت بزند در حالی که کاربر همان لحظه روی صفحه‌ی درگاه پرداخت را
 * کامل کرده. اگر درگاه تأیید کند، پول واقعاً گرفته شده و انکارش کردن
 * بدترین کار ممکن است.
 */
const SETTLEABLE_ORDER_STATUSES = ["PENDING", "FAILED"] as const;

// ---------------------------------------------------------------------------
// پیدا کردن چیزی که قرار است پرداخت شود
// ---------------------------------------------------------------------------

interface PayableBooking {
  id: string;
  status: string;
  holdExpiresAt: Date | null;
  priceSnapshot: bigint;
  commissionSnapshot: string;
  /** `teacher_profiles.id` — دفتر کل به این ارجاع می‌دهد، نه به `users.id` */
  teacherProfileId: string;
}

interface PayableTarget {
  bookingIds: string[];
  bookingRows: PayableBooking[];
  enrollmentId: string | null;
  amount: bigint;
  description: string;
}

const bookingSelection = {
  id: bookings.id,
  studentId: bookings.studentId,
  status: bookings.status,
  type: bookings.type,
  enrollmentId: bookings.enrollmentId,
  holdExpiresAt: bookings.holdExpiresAt,
  priceSnapshot: bookings.priceSnapshot,
  commissionSnapshot: bookings.commissionSnapshot,
  teacherProfileId: teacherProfiles.id,
  teacherName: users.fullName,
  instrumentName: instruments.nameFa,
};

/** رزرو را با نام استاد و ساز می‌خواند — شرح سفارش در درگاه دیده می‌شود. */
function bookingQuery() {
  return db
    .select(bookingSelection)
    .from(bookings)
    .innerJoin(offerings, eq(offerings.id, bookings.offeringId))
    .innerJoin(teacherProfiles, eq(teacherProfiles.id, offerings.teacherId))
    .innerJoin(users, eq(users.id, teacherProfiles.userId))
    .innerJoin(instruments, eq(instruments.id, offerings.instrumentId));
}

type BookingRow = Awaited<ReturnType<typeof bookingQuery>>[number];

/**
 * بررسی می‌کند رزرو واقعاً قابل پرداخت است.
 *
 * پیام به ازای هر وضعیت فرق می‌کند: هنرجویی که مهلتش تمام شده باید
 * بفهمد چرا صفحه‌ی پرداخت باز نمی‌شود، نه اینکه «خطایی رخ داد» ببیند.
 */
function assertPayable(row: BookingRow, now: Date): void {
  switch (row.status) {
    case "PENDING_PAYMENT":
      break;
    case "CONFIRMED":
    case "IN_PROGRESS":
    case "COMPLETED":
      throw new NotPayableError("این جلسه قبلاً پرداخت شده است.");
    case "EXPIRED":
      throw new PaymentHoldExpiredError();
    default:
      throw new NotPayableError("این رزرو لغو شده است.");
  }

  // ممکن است مهلت گذشته باشد ولی جاب پس‌زمینه هنوز نرسیده باشد وضعیت را
  // عوض کند. زمان مرجع همین‌جاست، نه ستون `status`.
  if (row.holdExpiresAt && row.holdExpiresAt.getTime() <= now.getTime()) {
    throw new PaymentHoldExpiredError();
  }
}

function toPayableBooking(row: BookingRow): PayableBooking {
  return {
    id: row.id,
    status: row.status,
    holdExpiresAt: row.holdExpiresAt,
    priceSnapshot: row.priceSnapshot,
    commissionSnapshot: row.commissionSnapshot,
    teacherProfileId: row.teacherProfileId,
  };
}

async function resolveBookingTarget(
  studentId: string,
  bookingId: string,
  now: Date,
): Promise<PayableTarget> {
  const [row] = await bookingQuery().where(eq(bookings.id, bookingId)).limit(1);

  if (!row || row.studentId !== studentId) {
    // «مال تو نیست» و «وجود ندارد» عمداً یک پیام می‌گیرند تا نشود با
    // حدس زدن شناسه فهمید چه رزروهایی وجود دارند.
    throw new BookingNotFoundError(bookingId);
  }

  if (row.enrollmentId !== null) {
    throw new NotPayableError(
      "جلسه‌ی پکیج جداگانه پرداخت نمی‌شود. کل پکیج را یک‌جا پرداخت کنید.",
    );
  }

  if (row.type === "TRIAL" || row.priceSnapshot === 0n) {
    throw new NotPayableError("جلسه‌ی معارفه رایگان است و پرداخت نمی‌خواهد.");
  }

  assertPayable(row, now);

  return {
    bookingIds: [row.id],
    bookingRows: [toPayableBooking(row)],
    enrollmentId: null,
    amount: row.priceSnapshot,
    description: `یک جلسه ${row.instrumentName} با ${row.teacherName}`,
  };
}

async function resolveEnrollmentTarget(
  studentId: string,
  enrollmentId: string,
  now: Date,
): Promise<PayableTarget> {
  const [enrollment] = await db
    .select()
    .from(enrollments)
    .where(eq(enrollments.id, enrollmentId))
    .limit(1);

  if (!enrollment || enrollment.studentId !== studentId) {
    throw new OrderNotFoundError();
  }

  if (enrollment.status !== "PENDING_PAYMENT") {
    throw new NotPayableError(
      enrollment.status === "CANCELLED"
        ? "این پکیج لغو شده است."
        : "این پکیج قبلاً پرداخت شده است.",
    );
  }

  const rows = await bookingQuery().where(eq(bookings.enrollmentId, enrollmentId));

  if (rows.length === 0) {
    throw new NotPayableError("این پکیج جلسه‌ای ندارد.");
  }

  for (const row of rows) {
    assertPayable(row, now);
  }

  const first = rows[0]!;

  /**
   * مبلغ از `enrollments.price_total` می‌آید، نه از جمع اسنپ‌شات جلسات.
   * اگر روزی تخفیف پکیج اضافه شود (تصمیم باز، بخش ۱۰.۲ سند معماری)،
   * تخفیف روی همان ستون می‌نشیند و اینجا خودبه‌خود درست می‌ماند.
   */
  return {
    bookingIds: rows.map((row) => row.id),
    bookingRows: rows.map(toPayableBooking),
    enrollmentId,
    amount: enrollment.priceTotal,
    description: `پکیج ${rows.length} جلسه‌ای ${first.instrumentName} با ${first.teacherName}`,
  };
}

// ---------------------------------------------------------------------------
// شروع پرداخت
// ---------------------------------------------------------------------------

export interface CheckoutInput {
  studentId: string;
  bookingId?: string;
  enrollmentId?: string;
  /** پیش‌فرض از `PAYMENT_CALLBACK_URL` خوانده می‌شود */
  callbackUrl?: string;
  gateway?: PaymentGateway;
  now?: Date;
}

export interface CheckoutResult {
  orderId: string;
  amount: bigint;
  gateway: string;
  redirectUrl: string;
}

function callbackUrlFromEnv(): string {
  return (
    process.env.PAYMENT_CALLBACK_URL ?? "http://localhost:4000/api/payments/callback"
  );
}

/**
 * سفارش می‌سازد و آدرس درگاه را برمی‌گرداند.
 *
 * فراخوانی درگاه **بیرون** از تراکنش دیتابیس انجام می‌شود. باز نگه
 * داشتن تراکنش روی یک درخواست شبکه یعنی یک درگاه کند، استخر اتصال
 * پستگرس را تمام می‌کند و کل سرویس می‌خوابد.
 */
export async function startCheckout(input: CheckoutInput): Promise<CheckoutResult> {
  const now = input.now ?? new Date();
  const gateway = input.gateway ?? paymentGateway();

  if ((input.bookingId === undefined) === (input.enrollmentId === undefined)) {
    throw new NotPayableError("باید دقیقاً یکی از رزرو یا پکیج مشخص شود.");
  }

  const target = input.bookingId
    ? await resolveBookingTarget(input.studentId, input.bookingId, now)
    : await resolveEnrollmentTarget(input.studentId, input.enrollmentId!, now);

  const orderId = await upsertPendingOrder(input.studentId, gateway.name, target);

  let requested;
  try {
    requested = await gateway.request({
      orderId,
      amount: target.amount,
      description: target.description,
      callbackUrl: input.callbackUrl ?? callbackUrlFromEnv(),
    });
  } catch {
    throw new GatewayUnreachableError();
  }

  await db
    .update(orders)
    .set({ gatewayAuthority: requested.authority })
    .where(eq(orders.id, orderId));

  return {
    orderId,
    amount: target.amount,
    gateway: gateway.name,
    redirectUrl: requested.redirectUrl,
  };
}

/**
 * سفارش در انتظارِ همین هدف را پیدا می‌کند یا می‌سازد.
 *
 * چرا دوباره استفاده می‌شود: کاربر ممکن است چند بار روی «پرداخت» بزند
 * یا از درگاه برگردد و دوباره تلاش کند. ساختن سفارش تازه در هر تلاش،
 * جدول را پر از رکورد بی‌صاحب می‌کند و گزارش‌های مالی را مبهم. شناسه‌ی
 * درگاه در هر تلاش تازه می‌شود، ولی سفارش یکی می‌ماند.
 */
async function upsertPendingOrder(
  studentId: string,
  gatewayName: string,
  target: PayableTarget,
): Promise<string> {
  const targetCondition = target.enrollmentId
    ? eq(orderItems.enrollmentId, target.enrollmentId)
    : eq(orderItems.bookingId, target.bookingIds[0]!);

  const [existing] = await db
    .select({ id: orders.id })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(and(eq(orders.status, "PENDING"), eq(orders.amount, target.amount), targetCondition))
    .limit(1);

  if (existing) return existing.id;

  return db.transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({
        studentId,
        amount: target.amount,
        gateway: gatewayName,
        status: "PENDING",
      })
      .returning({ id: orders.id });

    if (!order) throw new Error("ساخت سفارش ناموفق بود");

    await tx.insert(orderItems).values(
      target.enrollmentId
        ? [{ orderId: order.id, enrollmentId: target.enrollmentId, amount: target.amount }]
        : target.bookingRows.map((booking) => ({
            orderId: order.id,
            bookingId: booking.id,
            amount: booking.priceSnapshot,
          })),
    );

    return order.id;
  });
}

// ---------------------------------------------------------------------------
// تأیید و قطعی کردن
// ---------------------------------------------------------------------------

export interface SettlementResult {
  orderId: string;
  status: "PAID" | "ALREADY_PAID" | "FAILED";
  refId: string | null;
  /** رزروهایی که قطعی شدند */
  confirmedBookingIds: string[];
  /**
   * رزروهایی که پول برایشان گرفته شد ولی دیگر قابل قطعی کردن نبودند.
   *
   * یعنی مهلت پرداخت در همان فاصله تمام شده و اسلات آزاد شده. پول
   * انکار نمی‌شود؛ یک سطر `ADJUSTMENT` در دفتر کل ثبت می‌شود تا ادمین
   * بازپرداخت دستی انجام دهد.
   */
  unconfirmedBookingIds: string[];
  reason: string | null;
}

export interface SettleInput {
  authority: string;
  gateway?: PaymentGateway;
  now?: Date;
}

/**
 * پرداخت را تأیید و سفارش را قطعی می‌کند.
 *
 * وضعیتی که درگاه در آدرس بازگشت به مرورگر داده عمداً **خوانده هم
 * نمی‌شود**. همیشه تأیید سرور به سرور انجام می‌شود؛ اگر کاربر پرداخت را
 * لغو کرده باشد، همان تأیید ناموفق برمی‌گردد. این‌طور یک پارامتر
 * دستکاری‌شده در URL هیچ مسیری برای قطعی کردن رزرو باز نمی‌کند.
 */
export async function settleOrder(input: SettleInput): Promise<SettlementResult> {
  const now = input.now ?? new Date();
  const gateway = input.gateway ?? paymentGateway();

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.gatewayAuthority, input.authority))
    .limit(1);

  if (!order) {
    throw new OrderNotFoundError();
  }

  if (order.status === "PAID") {
    return {
      orderId: order.id,
      status: "ALREADY_PAID",
      refId: order.gatewayRefId,
      confirmedBookingIds: await bookingIdsOfOrder(order.id),
      unconfirmedBookingIds: [],
      reason: null,
    };
  }

  if (order.status === "REFUNDED") {
    throw new NotPayableError("این سفارش مسترد شده است.");
  }

  let verification;
  try {
    verification = await gateway.verify({
      authority: input.authority,
      amount: order.amount,
    });
  } catch {
    throw new GatewayUnreachableError();
  }

  if (verification.status === "FAILED") {
    await db
      .update(orders)
      .set({ status: "FAILED" })
      .where(and(eq(orders.id, order.id), eq(orders.status, "PENDING")));

    return {
      orderId: order.id,
      status: "FAILED",
      refId: null,
      confirmedBookingIds: [],
      unconfirmedBookingIds: [],
      reason: verification.reason,
    };
  }

  const settlement = await applySuccessfulPayment(order.id, verification.refId, now);

  /**
   * اعلان **بعد** از برگشتن تراکنش می‌رود، نه داخلش.
   *
   * `applySuccessfulPayment` سفارش، ثبت‌نام، رزروها و سطرهای دفتر کل را
   * در یک تراکنش می‌نویسد. `notifyInApp` خطا پرتاب نمی‌کند، ولی درجِ
   * اعلان داخل همان تراکنش راه دیگری هم برای خراب کردن دارد: خطای
   * پستگرس تراکنش را «abort» می‌کند و از آن لحظه به بعد هر دستور دیگری
   * هم رد می‌شود. یعنی یک اعلانِ ناموفق می‌تواند سطر درآمد استاد را با
   * خودش ببرد.
   */
  if (settlement.status === "PAID") {
    await notifyConfirmedBookings(settlement.confirmedBookingIds);
  }

  return settlement;
}

/**
 * «پرداخت انجام شد و جلسه‌ات قطعی است» — به هر دو طرف.
 *
 * به هر دو می‌رود چون رویداد برای هر دو تازه است: هنرجو از درگاه
 * برگشته و ممکن است صفحه‌ی نتیجه را نبیند (اینترنت قطع، مرورگر بسته)،
 * و استاد اصلاً در جریان این پرداخت نبوده — تا پیش از این، تنها راه
 * فهمیدنش باز کردن فهرست کلاس‌ها بود.
 *
 * پکیج چهار جلسه دارد و چهار اعلان می‌سازد، نه یکی. عمدی است: هر جلسه
 * سطر خودش را در «کلاس‌های پیش رو» دارد و اعلان به همان جلسه لینک
 * می‌شود؛ یک اعلانِ خلاصه یعنی کلیک روی آن معلوم نباشد کجا باید برود.
 */
async function notifyConfirmedBookings(bookingIds: string[]): Promise<void> {
  if (bookingIds.length === 0) return;

  const rows = await db
    .select({
      id: bookings.id,
      studentId: bookings.studentId,
      teacherId: bookings.teacherId,
      scheduledAt: bookings.scheduledAt,
      studentName: paymentStudent.fullName,
      teacherName: paymentTeacher.fullName,
      instrumentName: instruments.nameFa,
    })
    .from(bookings)
    .innerJoin(paymentStudent, eq(paymentStudent.id, bookings.studentId))
    .innerJoin(paymentTeacher, eq(paymentTeacher.id, bookings.teacherId))
    .innerJoin(offerings, eq(offerings.id, bookings.offeringId))
    .innerJoin(instruments, eq(instruments.id, offerings.instrumentId))
    .where(inArray(bookings.id, bookingIds));

  for (const row of rows) {
    const when = sessionDateTimeFa(row.scheduledAt);

    await notifyInApp({
      userId: row.studentId,
      type: IN_APP_TYPES.BOOKING_CONFIRMED,
      message: `پرداخت انجام شد. جلسه‌ی ${row.instrumentName} با ${row.teacherName}، ${when}.`,
      href: `/sessions/${row.id}`,
      bookingId: row.id,
    });

    await notifyInApp({
      userId: row.teacherId,
      type: IN_APP_TYPES.BOOKING_CONFIRMED,
      message: `جلسه‌ی تازه با ${row.studentName} قطعی شد: ${row.instrumentName}، ${when}.`,
      href: `/sessions/${row.id}`,
      bookingId: row.id,
    });
  }
}

/** همه‌ی رزروهای یک سفارش — چه مستقیم و چه از راه پکیج. */
async function bookingIdsOfOrder(orderId: string): Promise<string[]> {
  const items = await db
    .select({ bookingId: orderItems.bookingId, enrollmentId: orderItems.enrollmentId })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  const direct = items
    .map((item) => item.bookingId)
    .filter((id): id is string => id !== null);

  const enrollmentIds = items
    .map((item) => item.enrollmentId)
    .filter((id): id is string => id !== null);

  if (enrollmentIds.length === 0) return direct;

  const rows = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(inArray(bookings.enrollmentId, enrollmentIds));

  return [...direct, ...rows.map((row) => row.id)];
}

/**
 * همه‌ی اثرهای یک پرداخت موفق، در یک تراکنش.
 *
 * سفارش با `UPDATE` شرطی قطعی می‌شود. اگر صفر سطر برگشت یعنی درخواست
 * هم‌زمان دیگری زودتر رسیده — همان‌جا برمی‌گردیم و دوباره کاری نمی‌کنیم.
 */
async function applySuccessfulPayment(
  orderId: string,
  refId: string,
  now: Date,
): Promise<SettlementResult> {
  return db.transaction(async (tx) => {
    const claimed = await tx
      .update(orders)
      .set({ status: "PAID", gatewayRefId: refId, paidAt: now })
      .where(
        and(
          eq(orders.id, orderId),
          inArray(orders.status, [...SETTLEABLE_ORDER_STATUSES]),
        ),
      )
      .returning({ id: orders.id });

    if (claimed.length === 0) {
      return {
        orderId,
        status: "ALREADY_PAID" as const,
        refId,
        confirmedBookingIds: [],
        unconfirmedBookingIds: [],
        reason: null,
      };
    }

    const items = await tx
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));

    const directBookingIds = items
      .map((item) => item.bookingId)
      .filter((id): id is string => id !== null);
    const enrollmentIds = items
      .map((item) => item.enrollmentId)
      .filter((id): id is string => id !== null);

    let bookingIds = directBookingIds;
    if (enrollmentIds.length > 0) {
      const rows = await tx
        .select({ id: bookings.id })
        .from(bookings)
        .where(inArray(bookings.enrollmentId, enrollmentIds));
      bookingIds = [...bookingIds, ...rows.map((row) => row.id)];

      await tx
        .update(enrollments)
        .set({ status: "ACTIVE" })
        .where(
          and(
            inArray(enrollments.id, enrollmentIds),
            eq(enrollments.status, "PENDING_PAYMENT"),
          ),
        );
    }

    const confirmedIds = await confirmBookings(bookingIds, tx);
    const unconfirmedIds = bookingIds.filter((id) => !confirmedIds.includes(id));

    await writeEarnings(tx, orderId, confirmedIds);
    await writeUnmatchedPaymentAdjustment(tx, orderId, unconfirmedIds);

    return {
      orderId,
      status: "PAID" as const,
      refId,
      confirmedBookingIds: confirmedIds,
      unconfirmedBookingIds: unconfirmedIds,
      reason: null,
    };
  });
}

/** یک سطر درآمد به ازای هر جلسه‌ی قطعی‌شده. */
async function writeEarnings(
  tx: Transaction,
  orderId: string,
  bookingIds: string[],
): Promise<void> {
  if (bookingIds.length === 0) return;

  const rows = await tx
    .select({
      id: bookings.id,
      priceSnapshot: bookings.priceSnapshot,
      commissionSnapshot: bookings.commissionSnapshot,
      teacherProfileId: teacherProfiles.id,
    })
    .from(bookings)
    .innerJoin(offerings, eq(offerings.id, bookings.offeringId))
    .innerJoin(teacherProfiles, eq(teacherProfiles.id, offerings.teacherId))
    .where(inArray(bookings.id, bookingIds));

  const values = rows
    .filter((row) => row.priceSnapshot > 0n)
    .map((row) => {
      const split = splitCommission(row.priceSnapshot, row.commissionSnapshot);
      return {
        type: "EARNING" as const,
        orderId,
        bookingId: row.id,
        teacherId: row.teacherProfileId,
        grossAmount: split.gross,
        commission: split.commission,
        netAmount: split.net,
        description: "درآمد جلسه",
      };
    });

  if (values.length > 0) {
    await tx.insert(ledgerEntries).values(values);
  }
}

/**
 * پولی که گرفته شد ولی جلسه‌ای پشتش قطعی نشد.
 *
 * حالت نادری است: مهلت پرداخت دقیقاً در فاصله‌ی رفتن به درگاه و برگشتن
 * تمام شده و اسلات به کس دیگری رسیده. رزرو را نمی‌شود قطعی کرد — قید
 * `EXCLUDE` هم اجازه نمی‌دهد — ولی پول واقعاً گرفته شده. یک سطر
 * `ADJUSTMENT` ثبت می‌شود تا در گزارش ادمین دیده شود و بازپرداخت دستی
 * انجام گیرد. بی‌صدا رد شدن از این حالت یعنی پولِ گم‌شده.
 */
async function writeUnmatchedPaymentAdjustment(
  tx: Transaction,
  orderId: string,
  bookingIds: string[],
): Promise<void> {
  if (bookingIds.length === 0) return;

  const rows = await tx
    .select({ id: bookings.id, priceSnapshot: bookings.priceSnapshot })
    .from(bookings)
    .where(inArray(bookings.id, bookingIds));

  const values = rows
    .filter((row) => row.priceSnapshot > 0n)
    .map((row) => ({
      type: "ADJUSTMENT" as const,
      orderId,
      bookingId: null,
      teacherId: null,
      grossAmount: row.priceSnapshot,
      commission: row.priceSnapshot,
      netAmount: 0n,
      description: `پرداخت بدون جلسه‌ی قابل تأیید — نیازمند بازپرداخت دستی (رزرو ${row.id})`,
    }));

  if (values.length > 0) {
    await tx.insert(ledgerEntries).values(values);
  }
}

// ---------------------------------------------------------------------------
// بازپرداخت
// ---------------------------------------------------------------------------

export interface RefundInput {
  bookingId: string;
  /** تصمیم سیاست لغو — از `cancelBooking` می‌آید */
  refundable: boolean;
}

/**
 * بازپرداخت لغو را در دفتر کل ثبت می‌کند.
 *
 * برگرداندن واقعی پول به کارت در این فاز **دستی** است: درگاه‌های ایرانی
 * استرداد خودکار را به همه‌ی پذیرنده‌ها نمی‌دهند. کاری که اینجا انجام
 * می‌شود ثبت بدهی است، نه انتقال وجه. سطر منفی در دفتر کل، درآمد استاد
 * را دقیقاً خنثی می‌کند تا تسویه‌ی ماه بعد درست باشد.
 *
 * اگر جلسه سوخته باشد (`refundable === false`) هیچ سطری نوشته نمی‌شود:
 * پول پیش استاد می‌ماند، که دقیقاً معنای سیاست لغوِ بخش ۵ سند معماری
 * است.
 */
export async function recordCancellationRefund(
  input: RefundInput,
): Promise<CommissionSplit | null> {
  if (!input.refundable) return null;

  return db.transaction(async (tx) => {
    const [earning] = await tx
      .select()
      .from(ledgerEntries)
      .where(
        and(eq(ledgerEntries.bookingId, input.bookingId), eq(ledgerEntries.type, "EARNING")),
      )
      .limit(1);

    // چیزی پرداخت نشده بود — لغو رزروِ پرداخت‌نشده اثر مالی ندارد
    if (!earning) return null;

    const [alreadyRefunded] = await tx
      .select({ id: ledgerEntries.id })
      .from(ledgerEntries)
      .where(
        and(eq(ledgerEntries.bookingId, input.bookingId), eq(ledgerEntries.type, "REFUND")),
      )
      .limit(1);

    if (alreadyRefunded) return null;

    const refund = negateSplit({
      gross: earning.grossAmount,
      commission: earning.commission,
      net: earning.netAmount,
    });

    await tx.insert(ledgerEntries).values({
      type: "REFUND",
      orderId: earning.orderId,
      bookingId: input.bookingId,
      teacherId: earning.teacherId,
      grossAmount: refund.gross,
      commission: refund.commission,
      netAmount: refund.net,
      description: "بازپرداخت لغو جلسه",
    });

    return refund;
  });
}

// ---------------------------------------------------------------------------
// گزارش
// ---------------------------------------------------------------------------

export interface LedgerSummary {
  gross: bigint;
  commission: bigint;
  /** بدهی پلتفرم به استاد — همان چیزی که در تسویه پرداخت می‌شود */
  net: bigint;
}

/**
 * جمع دفتر کل یک استاد.
 *
 * چون بازپرداخت سطر منفی است، همین یک جمعِ ساده رقم درست را می‌دهد و
 * لازم نیست جایی «منهای بازپرداخت‌ها» حساب شود.
 */
export async function teacherLedgerSummary(
  teacherProfileId: string,
): Promise<LedgerSummary> {
  const [row] = await db
    .select({
      gross: sum(ledgerEntries.grossAmount),
      commission: sum(ledgerEntries.commission),
      net: sum(ledgerEntries.netAmount),
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.teacherId, teacherProfileId));

  return {
    gross: BigInt(row?.gross ?? 0),
    commission: BigInt(row?.commission ?? 0),
    net: BigInt(row?.net ?? 0),
  };
}

export interface EarningsBreakdown {
  /** فروش ناخالص — تسویه‌ها در آن نیستند */
  gross: bigint;
  commission: bigint;
  /** آنچه از دفتر کل به استاد تعلق گرفته، پیش از کسر تسویه‌ها */
  earned: bigint;
  /** جمع تسویه‌های انجام‌شده، به صورت مثبت */
  paidOut: bigint;
  /** بدهی فعلی پلتفرم به استاد = `earned − paidOut` */
  outstanding: bigint;
}

/**
 * تفکیک درآمد استاد — برای پنل استاد و برای ثبت تسویه در پنل ادمین.
 *
 * `teacherLedgerSummary` جمع خامِ همه‌ی سطرهاست و `net` آن دقیقاً مانده
 * است؛ ولی `gross` آن بعد از یک تسویه پایین می‌آید، چون سطر تسویه
 * ناچار `gross` منفی دارد (قید `ledger_amounts_balance` می‌گوید
 * `gross = commission + net` و تسویه کمیسیون ندارد).
 *
 * برای استاد این گمراه‌کننده است: «درآمد ناخالص» نباید با گرفتنِ پول کم
 * شود. پس تسویه‌ها از دو ستون اول کنار گذاشته می‌شوند و به‌جایش ستون
 * خودشان را می‌گیرند. مانده همچنان همان جمع ساده است، چون هر دو راه به
 * یک عدد می‌رسند.
 */
export async function teacherEarningsBreakdown(
  teacherProfileId: string,
): Promise<EarningsBreakdown> {
  const [row] = await db
    .select({
      gross: sum(sql`CASE WHEN ${ledgerEntries.type} = 'PAYOUT' THEN 0 ELSE ${ledgerEntries.grossAmount} END`),
      commission: sum(sql`CASE WHEN ${ledgerEntries.type} = 'PAYOUT' THEN 0 ELSE ${ledgerEntries.commission} END`),
      earned: sum(sql`CASE WHEN ${ledgerEntries.type} = 'PAYOUT' THEN 0 ELSE ${ledgerEntries.netAmount} END`),
      /** سطر تسویه منفی است؛ قرینه‌اش را می‌گیریم تا رو به کاربر مثبت باشد */
      paidOut: sum(sql`CASE WHEN ${ledgerEntries.type} = 'PAYOUT' THEN -${ledgerEntries.netAmount} ELSE 0 END`),
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.teacherId, teacherProfileId));

  const earned = BigInt(row?.earned ?? 0);
  const paidOut = BigInt(row?.paidOut ?? 0);

  return {
    gross: BigInt(row?.gross ?? 0),
    commission: BigInt(row?.commission ?? 0),
    earned,
    paidOut,
    outstanding: earned - paidOut,
  };
}

// ---------------------------------------------------------------------------
// نگه‌داری
// ---------------------------------------------------------------------------

/**
 * سفارش‌های در انتظارِ کهنه را ناموفق علامت می‌زند.
 *
 * همراه با `expireStaleHolds` در سرویس رزرو صدا زده می‌شود: وقتی مهلت
 * پرداخت رزرو تمام شده، سفارشش هم بی‌معنی است. علامت خوردن برگشت‌ناپذیر
 * نیست — اگر درگاه بعداً تأیید کند، `settleOrder` سفارش را از همین
 * وضعیت هم قطعی می‌کند.
 */
export async function expireStalePendingOrders(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - BUSINESS_RULES.PAYMENT_HOLD_MINUTES * MINUTE_MS);

  const expired = await db
    .update(orders)
    .set({ status: "FAILED" })
    .where(and(eq(orders.status, "PENDING"), lt(orders.createdAt, cutoff)))
    .returning({ id: orders.id });

  return expired.length;
}
