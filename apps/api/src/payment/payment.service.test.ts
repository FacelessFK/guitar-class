import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { fromTehranWallClock } from "@music/shared";

import { db } from "../db/client.js";
import {
  bookings,
  enrollments,
  ledgerEntries,
  orderItems,
  orders,
} from "../db/schema/index.js";
import {
  cancelBooking,
  createPackageEnrollment,
  createSingleBooking,
  createTrialBooking,
  expireStaleHolds,
} from "../booking/booking.service.js";
import { BookingNotFoundError } from "../booking/errors.js";
import { closeDatabase, resetDatabase, seedFixture, type Fixture } from "../test/fixtures.js";
import { FakePaymentGateway, type PaymentGateway } from "./gateway.port.js";
import {
  NotPayableError,
  OrderNotFoundError,
  PaymentHoldExpiredError,
} from "./errors.js";
import {
  expireStalePendingOrders,
  recordCancellationRefund,
  settleOrder,
  startCheckout,
  teacherLedgerSummary,
} from "./payment.service.js";

/**
 * تست‌های یکپارچگی پرداخت، روی پستگرس واقعی.
 *
 * درگاه جعلی است ولی دیتابیس نه — و مهم‌ترین چیزهایی که اینجا اثبات
 * می‌شوند در دیتابیس‌اند: ایدمپوتنت بودن تأیید، تراز ماندن دفتر کل، و
 * اینکه رزروِ منقضی‌شده با پرداخت زنده نمی‌شود.
 */

/** ۱۵ اوت ۲۰۲۶ شنبه است. */
const SATURDAY = "2026-08-15";
const NOW = new Date("2026-08-01T00:00:00Z");

const PRICE = 3_000_000n;
/** کمیسیون ۲۰٪ در `seedFixture` — یعنی ۶۰۰٬۰۰۰ سهم پلتفرم. */
const COMMISSION = 600_000n;
const NET = 2_400_000n;

let fixture: Fixture;
let gateway: FakePaymentGateway;

function slotAt(dateKey: string, hour: number): Date {
  return fromTehranWallClock(dateKey, hour * 60);
}

beforeEach(async () => {
  await resetDatabase();
  fixture = await seedFixture();
  gateway = new FakePaymentGateway();
});

afterAll(async () => {
  await closeDatabase();
});

async function makeSingleBooking(hour = 17) {
  return createSingleBooking({
    studentId: fixture.studentId,
    teacherProfileId: fixture.teacherProfileId,
    offeringId: fixture.offeringId,
    scheduledAt: slotAt(SATURDAY, hour),
    now: NOW,
  });
}

/** شناسه‌ی درگاه را از سفارش می‌خواند — همان چیزی که کال‌بک با آن می‌آید. */
async function authorityOf(orderId: string): Promise<string> {
  const [order] = await db
    .select({ authority: orders.gatewayAuthority })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  return order!.authority!;
}

async function checkoutSingle(bookingId: string, now = NOW) {
  return startCheckout({ studentId: fixture.studentId, bookingId, gateway, now });
}

// ---------------------------------------------------------------------------

describe("شروع پرداخت", () => {
  it("سفارش می‌سازد و آدرس درگاه می‌دهد", async () => {
    const booking = await makeSingleBooking();
    const checkout = await checkoutSingle(booking.id);

    expect(checkout.amount).toBe(PRICE);
    expect(checkout.gateway).toBe("fake");
    expect(checkout.redirectUrl).toContain("Authority=");

    const [order] = await db.select().from(orders).where(eq(orders.id, checkout.orderId));
    expect(order?.status).toBe("PENDING");
    expect(order?.amount).toBe(PRICE);
    expect(order?.gatewayAuthority).not.toBeNull();
  });

  it("قلم سفارش به همان رزرو وصل است", async () => {
    const booking = await makeSingleBooking();
    const checkout = await checkoutSingle(booking.id);

    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, checkout.orderId));

    expect(items).toHaveLength(1);
    expect(items[0]?.bookingId).toBe(booking.id);
    expect(items[0]?.enrollmentId).toBeNull();
  });

  /**
   * زدن دوباره‌ی دکمه‌ی پرداخت نباید سفارش تازه بسازد، وگرنه جدول پر از
   * رکورد بی‌صاحب می‌شود و گزارش «چند نفر به پرداخت رسیدند» بی‌معنا.
   */
  it("تلاش دوباره همان سفارش را برمی‌گرداند", async () => {
    const booking = await makeSingleBooking();

    const first = await checkoutSingle(booking.id);
    const second = await checkoutSingle(booking.id);

    expect(second.orderId).toBe(first.orderId);

    const all = await db.select({ id: orders.id }).from(orders);
    expect(all).toHaveLength(1);
  });

  it("رزرو کاربر دیگر پیدا نمی‌شود", async () => {
    const booking = await makeSingleBooking();

    await expect(
      startCheckout({ studentId: fixture.otherStudentId, bookingId: booking.id, gateway, now: NOW }),
    ).rejects.toThrow(BookingNotFoundError);
  });

  it("جلسه‌ی معارفه پرداخت نمی‌خواهد", async () => {
    const trial = await createTrialBooking({
      studentId: fixture.studentId,
      teacherProfileId: fixture.teacherProfileId,
      offeringId: fixture.offeringId,
      scheduledAt: slotAt(SATURDAY, 18),
      now: NOW,
    });

    await expect(checkoutSingle(trial.id)).rejects.toThrow(NotPayableError);
  });

  it("جلسه‌ی پکیج جداگانه پرداخت نمی‌شود", async () => {
    const created = await createPackageEnrollment({
      studentId: fixture.studentId,
      teacherProfileId: fixture.teacherProfileId,
      offeringId: fixture.offeringId,
      firstSessionDate: SATURDAY,
      startMinute: 17 * 60,
      now: NOW,
    });

    await expect(checkoutSingle(created.bookings[0]!.id)).rejects.toThrow(NotPayableError);
  });

  /**
   * مهلت ممکن است تمام شده باشد ولی جاب پس‌زمینه هنوز نرسیده باشد
   * وضعیت را عوض کند. زمان مرجع باید ساعت باشد نه ستون `status`.
   */
  it("رزروی که مهلتش گذشته پرداخت نمی‌شود، حتی پیش از اجرای جاب انقضا", async () => {
    const booking = await makeSingleBooking();
    const tooLate = new Date(NOW.getTime() + 30 * 60_000);

    await expect(checkoutSingle(booking.id, tooLate)).rejects.toThrow(
      PaymentHoldExpiredError,
    );
  });

  it("رزروی که منقضی شده پرداخت نمی‌شود", async () => {
    const booking = await makeSingleBooking();
    await expireStaleHolds(new Date(NOW.getTime() + 30 * 60_000));

    await expect(checkoutSingle(booking.id)).rejects.toThrow(PaymentHoldExpiredError);
  });

  it("باید دقیقاً یکی از رزرو یا پکیج داده شود", async () => {
    await expect(
      startCheckout({ studentId: fixture.studentId, gateway, now: NOW }),
    ).rejects.toThrow(NotPayableError);
  });
});

// ---------------------------------------------------------------------------

describe("تأیید پرداخت", () => {
  it("رزرو را قطعی می‌کند و سفارش را پرداخت‌شده", async () => {
    const booking = await makeSingleBooking();
    const checkout = await checkoutSingle(booking.id);

    const result = await settleOrder({
      authority: await authorityOf(checkout.orderId),
      gateway,
      now: NOW,
    });

    expect(result.status).toBe("PAID");
    expect(result.confirmedBookingIds).toEqual([booking.id]);
    expect(result.unconfirmedBookingIds).toEqual([]);

    const [stored] = await db
      .select({ status: bookings.status, holdExpiresAt: bookings.holdExpiresAt })
      .from(bookings)
      .where(eq(bookings.id, booking.id));

    expect(stored?.status).toBe("CONFIRMED");
    // مهلت پرداخت باید پاک شود، وگرنه جاب انقضا رزروِ پرداخت‌شده را می‌کشد
    expect(stored?.holdExpiresAt).toBeNull();

    const [order] = await db.select().from(orders).where(eq(orders.id, checkout.orderId));
    expect(order?.status).toBe("PAID");
    expect(order?.gatewayRefId).not.toBeNull();
    expect(order?.paidAt).not.toBeNull();
  });

  it("سطر درآمد با تقسیم درست کمیسیون می‌نویسد", async () => {
    const booking = await makeSingleBooking();
    const checkout = await checkoutSingle(booking.id);
    await settleOrder({ authority: await authorityOf(checkout.orderId), gateway, now: NOW });

    const entries = await db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.bookingId, booking.id));

    expect(entries).toHaveLength(1);
    expect(entries[0]?.type).toBe("EARNING");
    expect(entries[0]?.grossAmount).toBe(PRICE);
    expect(entries[0]?.commission).toBe(COMMISSION);
    expect(entries[0]?.netAmount).toBe(NET);
    // به پروفایل استاد ارجاع می‌دهد، نه به کاربرِ استاد
    expect(entries[0]?.teacherId).toBe(fixture.teacherProfileId);
  });

  /**
   * کاربر صفحه‌ی بازگشت را رفرش می‌کند، یا درگاه دوباره می‌فرستد. اگر
   * این ایدمپوتنت نباشد، استاد دو برابر پول می‌گیرد.
   */
  it("تأیید دوباره چیزی را دو بار ثبت نمی‌کند", async () => {
    const booking = await makeSingleBooking();
    const checkout = await checkoutSingle(booking.id);
    const authority = await authorityOf(checkout.orderId);

    const first = await settleOrder({ authority, gateway, now: NOW });
    const second = await settleOrder({ authority, gateway, now: NOW });

    expect(first.status).toBe("PAID");
    expect(second.status).toBe("ALREADY_PAID");

    const entries = await db.select().from(ledgerEntries);
    expect(entries).toHaveLength(1);
  });

  /**
   * دو کال‌بک هم‌زمان. `UPDATE` شرطیِ سفارش تنها یکی را برنده می‌کند و
   * ایندکس یکتای دفتر کل پشتوانه‌ی دوم است.
   */
  it("دو تأیید هم‌زمان فقط یک سطر درآمد می‌سازند", async () => {
    const booking = await makeSingleBooking();
    const checkout = await checkoutSingle(booking.id);
    const authority = await authorityOf(checkout.orderId);

    const results = await Promise.allSettled([
      settleOrder({ authority, gateway, now: NOW }),
      settleOrder({ authority, gateway, now: NOW }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    const entries = await db.select().from(ledgerEntries);
    expect(entries).toHaveLength(1);

    const [stored] = await db
      .select({ status: bookings.status })
      .from(bookings)
      .where(eq(bookings.id, booking.id));
    expect(stored?.status).toBe("CONFIRMED");
  });

  it("پرداخت ناموفق، سفارش را ناموفق می‌کند و رزرو را دست نمی‌زند", async () => {
    const booking = await makeSingleBooking();
    const checkout = await checkoutSingle(booking.id);
    const authority = await authorityOf(checkout.orderId);

    gateway.fail(authority);

    const result = await settleOrder({ authority, gateway, now: NOW });

    expect(result.status).toBe("FAILED");

    const [stored] = await db
      .select({ status: bookings.status })
      .from(bookings)
      .where(eq(bookings.id, booking.id));
    expect(stored?.status).toBe("PENDING_PAYMENT");

    expect(await db.select().from(ledgerEntries)).toHaveLength(0);
  });

  /**
   * مهم‌ترین دفاع این ماژول: وضعیتی که مرورگر می‌گوید هیچ‌جا خوانده
   * نمی‌شود. اگر کسی آدرس بازگشت را با شناسه‌ی دلخواه صدا بزند، تأیید
   * سرور به سرور شکست می‌خورد.
   */
  it("شناسه‌ی ساختگی چیزی را قطعی نمی‌کند", async () => {
    await expect(
      settleOrder({ authority: "FAKE-not-a-real-authority", gateway, now: NOW }),
    ).rejects.toThrow(OrderNotFoundError);
  });

  /**
   * درگاهی که مبلغی غیر از مبلغ سفارش را تأیید می‌کند نباید پذیرفته
   * شود. اینجا با یک درگاه دستکاری‌شده شبیه‌سازی می‌شود.
   */
  it("مبلغ سفارش عیناً به درگاه فرستاده می‌شود", async () => {
    const booking = await makeSingleBooking();
    let verifiedAmount: bigint | null = null;

    const spy: PaymentGateway = {
      name: "spy",
      request: (input) => gateway.request(input),
      verify: (input) => {
        verifiedAmount = input.amount;
        return gateway.verify(input);
      },
    };

    const checkout = await startCheckout({
      studentId: fixture.studentId,
      bookingId: booking.id,
      gateway: spy,
      now: NOW,
    });
    await settleOrder({ authority: await authorityOf(checkout.orderId), gateway: spy, now: NOW });

    expect(verifiedAmount).toBe(PRICE);
  });

  /**
   * حالت نادر ولی گران: مهلت دقیقاً در فاصله‌ی رفتن به درگاه و برگشتن
   * تمام شده. رزرو نباید زنده شود — اسلاتش را از دست داده — ولی پول هم
   * نباید بی‌صدا گم شود.
   */
  it("پولِ بی‌جلسه را در دفتر کل علامت می‌زند به‌جای اینکه رزرو منقضی را زنده کند", async () => {
    const booking = await makeSingleBooking();
    const checkout = await checkoutSingle(booking.id);
    const authority = await authorityOf(checkout.orderId);

    await expireStaleHolds(new Date(NOW.getTime() + 30 * 60_000));

    const result = await settleOrder({ authority, gateway, now: NOW });

    expect(result.status).toBe("PAID");
    expect(result.confirmedBookingIds).toEqual([]);
    expect(result.unconfirmedBookingIds).toEqual([booking.id]);

    const [stored] = await db
      .select({ status: bookings.status })
      .from(bookings)
      .where(eq(bookings.id, booking.id));
    expect(stored?.status).toBe("EXPIRED");

    const entries = await db.select().from(ledgerEntries);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.type).toBe("ADJUSTMENT");
    expect(entries[0]?.teacherId).toBeNull();
    expect(entries[0]?.grossAmount).toBe(PRICE);
    // چیزی به استاد تعلق نمی‌گیرد؛ پول تا بازپرداخت دستی نزد پلتفرم است
    expect(entries[0]?.netAmount).toBe(0n);
  });

  it("سفارشی که جارو ناموفق علامت زده، با تأیید درگاه باز هم قطعی می‌شود", async () => {
    const booking = await makeSingleBooking();
    const checkout = await checkoutSingle(booking.id);
    const authority = await authorityOf(checkout.orderId);

    // جارو دیر رسیده و سفارش را ناموفق کرده، ولی کاربر واقعاً پرداخت کرده
    await db.update(orders).set({ status: "FAILED" }).where(eq(orders.id, checkout.orderId));

    const result = await settleOrder({ authority, gateway, now: NOW });

    expect(result.status).toBe("PAID");
    const [stored] = await db
      .select({ status: bookings.status })
      .from(bookings)
      .where(eq(bookings.id, booking.id));
    expect(stored?.status).toBe("CONFIRMED");
  });
});

// ---------------------------------------------------------------------------

describe("پرداخت پکیج", () => {
  async function makePackage() {
    return createPackageEnrollment({
      studentId: fixture.studentId,
      teacherProfileId: fixture.teacherProfileId,
      offeringId: fixture.offeringId,
      firstSessionDate: SATURDAY,
      startMinute: 17 * 60,
      now: NOW,
    });
  }

  it("مبلغ از ثبت‌نام می‌آید، نه از جمع اسنپ‌شات جلسات", async () => {
    const created = await makePackage();

    const checkout = await startCheckout({
      studentId: fixture.studentId,
      enrollmentId: created.enrollmentId,
      gateway,
      now: NOW,
    });

    expect(checkout.amount).toBe(created.priceTotal);
    expect(checkout.amount).toBe(PRICE * 4n);
  });

  it("همه‌ی چهار جلسه را قطعی و ثبت‌نام را فعال می‌کند", async () => {
    const created = await makePackage();
    const checkout = await startCheckout({
      studentId: fixture.studentId,
      enrollmentId: created.enrollmentId,
      gateway,
      now: NOW,
    });

    const result = await settleOrder({
      authority: await authorityOf(checkout.orderId),
      gateway,
      now: NOW,
    });

    expect(result.status).toBe("PAID");
    expect(result.confirmedBookingIds).toHaveLength(4);

    const [enrollment] = await db
      .select({ status: enrollments.status })
      .from(enrollments)
      .where(eq(enrollments.id, created.enrollmentId));
    expect(enrollment?.status).toBe("ACTIVE");

    const stored = await db
      .select({ status: bookings.status })
      .from(bookings)
      .where(eq(bookings.enrollmentId, created.enrollmentId));
    expect(stored.every((row) => row.status === "CONFIRMED")).toBe(true);
  });

  it("به ازای هر جلسه یک سطر درآمد می‌نویسد", async () => {
    const created = await makePackage();
    const checkout = await startCheckout({
      studentId: fixture.studentId,
      enrollmentId: created.enrollmentId,
      gateway,
      now: NOW,
    });
    await settleOrder({ authority: await authorityOf(checkout.orderId), gateway, now: NOW });

    const entries = await db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.type, "EARNING"));

    expect(entries).toHaveLength(4);

    const summary = await teacherLedgerSummary(fixture.teacherProfileId);
    expect(summary.gross).toBe(PRICE * 4n);
    expect(summary.commission).toBe(COMMISSION * 4n);
    expect(summary.net).toBe(NET * 4n);
  });

  it("پکیج پرداخت‌شده دوباره پرداخت نمی‌شود", async () => {
    const created = await makePackage();
    const checkout = await startCheckout({
      studentId: fixture.studentId,
      enrollmentId: created.enrollmentId,
      gateway,
      now: NOW,
    });
    await settleOrder({ authority: await authorityOf(checkout.orderId), gateway, now: NOW });

    await expect(
      startCheckout({
        studentId: fixture.studentId,
        enrollmentId: created.enrollmentId,
        gateway,
        now: NOW,
      }),
    ).rejects.toThrow(NotPayableError);
  });
});

// ---------------------------------------------------------------------------

describe("بازپرداخت", () => {
  async function paidBooking(hour = 17) {
    const booking = await makeSingleBooking(hour);
    const checkout = await checkoutSingle(booking.id);
    await settleOrder({ authority: await authorityOf(checkout.orderId), gateway, now: NOW });
    return booking;
  }

  it("لغو زودهنگام هنرجو، درآمد را دقیقاً خنثی می‌کند", async () => {
    const booking = await paidBooking();

    const cancellation = await cancelBooking({
      bookingId: booking.id,
      actorId: fixture.studentId,
      now: new Date(booking.scheduledAt.getTime() - 48 * 3_600_000),
    });

    const settlement = await recordCancellationRefund({
      bookingId: booking.id,
      refundable: cancellation.refundable,
    });

    expect(settlement).not.toBeNull();
    expect(settlement?.refund?.gross).toBe(-PRICE);
    expect(settlement?.refund?.net).toBe(-NET);

    // جمع دفتر کل باید دقیقاً صفر شود، بدون هیچ باقی‌مانده‌ای
    const summary = await teacherLedgerSummary(fixture.teacherProfileId);
    expect(summary.gross).toBe(0n);
    expect(summary.commission).toBe(0n);
    expect(summary.net).toBe(0n);
  });

  /** لغو دیرهنگام یعنی جلسه می‌سوزد و پول پیش استاد می‌ماند. */
  it("لغو دیرهنگام هنرجو چیزی برنمی‌گرداند", async () => {
    const booking = await paidBooking();

    const cancellation = await cancelBooking({
      bookingId: booking.id,
      actorId: fixture.studentId,
      now: new Date(booking.scheduledAt.getTime() - 2 * 3_600_000),
    });

    expect(cancellation.refundable).toBe(false);

    const refund = await recordCancellationRefund({
      bookingId: booking.id,
      refundable: cancellation.refundable,
    });

    expect(refund).toBeNull();

    const summary = await teacherLedgerSummary(fixture.teacherProfileId);
    expect(summary.net).toBe(NET);
  });

  it("لغو استاد در هر زمان برمی‌گرداند", async () => {
    const booking = await paidBooking();

    const cancellation = await cancelBooking({
      bookingId: booking.id,
      actorId: fixture.teacherUserId,
      now: new Date(booking.scheduledAt.getTime() - 60_000),
    });

    expect(cancellation.refundable).toBe(true);
    expect(
      await recordCancellationRefund({ bookingId: booking.id, refundable: true }),
    ).not.toBeNull();
  });

  it("لغو رزروِ پرداخت‌نشده اثر مالی ندارد", async () => {
    const booking = await makeSingleBooking();

    await cancelBooking({
      bookingId: booking.id,
      actorId: fixture.studentId,
      now: NOW,
    });

    expect(
      await recordCancellationRefund({ bookingId: booking.id, refundable: true }),
    ).toBeNull();
    expect(await db.select().from(ledgerEntries)).toHaveLength(0);
  });

  it("بازپرداخت دوباره ثبت نمی‌شود", async () => {
    const booking = await paidBooking();

    await recordCancellationRefund({ bookingId: booking.id, refundable: true });
    expect(
      await recordCancellationRefund({ bookingId: booking.id, refundable: true }),
    ).toBeNull();

    const refunds = await db
      .select()
      .from(ledgerEntries)
      .where(
        and(eq(ledgerEntries.bookingId, booking.id), eq(ledgerEntries.type, "REFUND")),
      );
    expect(refunds).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------

/**
 * برخلاف بقیه‌ی تست‌ها، اینجا زمان مرجع ساعت واقعی است نه `NOW`.
 * `orders.created_at` را دیتابیس با `now()` می‌نویسد، پس جارو باید با
 * همان مقیاس زمانی سنجیده شود.
 */
describe("جاروی سفارش‌های کهنه", () => {
  const anHourFromNow = () => new Date(Date.now() + 60 * 60_000);

  it("سفارش در انتظارِ گذشته از مهلت را ناموفق می‌کند", async () => {
    const booking = await makeSingleBooking();
    const checkout = await checkoutSingle(booking.id);

    expect(await expireStalePendingOrders(anHourFromNow())).toBe(1);

    const [order] = await db.select().from(orders).where(eq(orders.id, checkout.orderId));
    expect(order?.status).toBe("FAILED");
  });

  it("سفارش تازه را دست نمی‌زند", async () => {
    const booking = await makeSingleBooking();
    await checkoutSingle(booking.id);

    expect(await expireStalePendingOrders(new Date())).toBe(0);
  });

  it("سفارش پرداخت‌شده را دست نمی‌زند", async () => {
    const booking = await makeSingleBooking();
    const checkout = await checkoutSingle(booking.id);
    await settleOrder({ authority: await authorityOf(checkout.orderId), gateway, now: NOW });

    expect(await expireStalePendingOrders(anHourFromNow())).toBe(0);

    const [order] = await db.select().from(orders).where(eq(orders.id, checkout.orderId));
    expect(order?.status).toBe("PAID");
  });
});
