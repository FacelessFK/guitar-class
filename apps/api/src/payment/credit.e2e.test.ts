import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { fromTehranWallClock } from "@music/shared";

import { db } from "../db/client.js";
import { bookings, creditEntries, orders, users } from "../db/schema/index.js";
import {
  cancelBooking,
  createPackageEnrollment,
  createSingleBooking,
  createTrialBooking,
} from "../booking/booking.service.js";
import { closeDatabase, resetDatabase, seedFixture, type Fixture } from "../test/fixtures.js";
import { FakePaymentGateway } from "./gateway.port.js";
import { CreditCheckoutInProgressError, InsufficientCreditError } from "./errors.js";
import {
  creditBalanceOf,
  grantAdminCredit,
  listCreditEntries,
  spendCredit,
  writeCreditEntry,
} from "./credit.service.js";
import {
  recordCancellationRefund,
  settleOrder,
  startCheckout,
  teacherLedgerSummary,
} from "./payment.service.js";

/**
 * اعتبار هنرجو، روی پستگرس واقعی.
 *
 * چیزهایی که اینجا اثبات می‌شوند با ماک قابل اثبات نیستند: ایندکس‌های
 * یکتای جزئی، قید منفی نشدن موجودی، و همگام ماندن ستون کش با جمع
 * سطرها.
 */

/** ۱۵ اوت ۲۰۲۶ شنبه است. */
const SATURDAY = "2026-08-15";
const NOW = new Date("2026-08-01T00:00:00Z");

const PRICE = 3_000_000n;
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

async function authorityOf(orderId: string): Promise<string> {
  const [order] = await db
    .select({ authority: orders.gatewayAuthority })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  return order!.authority!;
}

/** یک جلسه‌ی پرداخت‌شده — نقطه‌ی شروع هر سناریوی لغو. */
async function paidBooking(hour = 17) {
  const booking = await makeSingleBooking(hour);
  const checkout = await startCheckout({
    studentId: fixture.studentId,
    bookingId: booking.id,
    gateway,
    now: NOW,
  });
  await settleOrder({ authority: await authorityOf(checkout.orderId), gateway, now: NOW });
  return booking;
}

/** اعتبار را بدون گذشتن از مسیر لغو می‌سازد. */
async function giveCredit(amount: bigint, studentId = fixture.studentId) {
  await grantAdminCredit({
    studentId,
    amount,
    adminId: fixture.teacherUserId,
    description: "اعتبار آزمایشی",
  });
}

async function cachedBalance(studentId = fixture.studentId): Promise<bigint> {
  const [row] = await db
    .select({ balance: users.creditBalance })
    .from(users)
    .where(eq(users.id, studentId))
    .limit(1);

  return row!.balance;
}

/** جمع واقعی سطرها — چیزی که ستون کش باید همیشه با آن یکی باشد. */
async function summedBalance(studentId = fixture.studentId): Promise<bigint> {
  const entries = await listCreditEntries(studentId);
  return entries.reduce((total, entry) => total + entry.amount, 0n);
}

// ---------------------------------------------------------------------------

describe("اعتبار از لغو", () => {
  it("لغو زودهنگام، مبلغ ناخالص را به اعتبار هنرجو می‌برد", async () => {
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

    // هنرجو کل قیمت را داده، پس کل قیمت برمی‌گردد — نه سهم استاد
    expect(settlement?.credit).toBe(PRICE);
    expect(await creditBalanceOf(fixture.studentId)).toBe(PRICE);
  });

  /**
   * دو دفتر کل، دو جهت. اگر این دو با هم جمع می‌شدند هیچ‌کدام دیگر بدهی
   * واقعی نبودند.
   */
  it("دفتر کل استاد صفر می‌شود و اعتبار هنرجو پر", async () => {
    const booking = await paidBooking();

    await cancelBooking({
      bookingId: booking.id,
      actorId: fixture.teacherUserId,
      now: NOW,
    });
    await recordCancellationRefund({ bookingId: booking.id, refundable: true });

    const summary = await teacherLedgerSummary(fixture.teacherProfileId);
    expect(summary.net).toBe(0n);
    expect(summary.gross).toBe(0n);

    expect(await creditBalanceOf(fixture.studentId)).toBe(PRICE);
  });

  it("لغو دیرهنگام هیچ اعتباری نمی‌سازد — جلسه می‌سوزد", async () => {
    const booking = await paidBooking();

    const cancellation = await cancelBooking({
      bookingId: booking.id,
      actorId: fixture.studentId,
      now: new Date(booking.scheduledAt.getTime() - 2 * 3_600_000),
    });

    expect(cancellation.refundable).toBe(false);
    expect(
      await recordCancellationRefund({
        bookingId: booking.id,
        refundable: cancellation.refundable,
      }),
    ).toBeNull();

    expect(await creditBalanceOf(fixture.studentId)).toBe(0n);
    expect((await teacherLedgerSummary(fixture.teacherProfileId)).net).toBe(NET);
  });

  it("لغو رزروِ پرداخت‌نشده اعتبار نمی‌سازد", async () => {
    const booking = await makeSingleBooking();

    await cancelBooking({ bookingId: booking.id, actorId: fixture.studentId, now: NOW });
    await recordCancellationRefund({ bookingId: booking.id, refundable: true });

    expect(await creditBalanceOf(fixture.studentId)).toBe(0n);
    expect(await db.select().from(creditEntries)).toHaveLength(0);
  });

  it("لغو جلسه‌ی معارفه‌ی رایگان اعتبار نمی‌سازد", async () => {
    const trial = await createTrialBooking({
      studentId: fixture.studentId,
      teacherProfileId: fixture.teacherProfileId,
      offeringId: fixture.offeringId,
      scheduledAt: slotAt(SATURDAY, 18),
      now: NOW,
    });

    await cancelBooking({ bookingId: trial.id, actorId: fixture.studentId, now: NOW });
    await recordCancellationRefund({ bookingId: trial.id, refundable: true });

    expect(await creditBalanceOf(fixture.studentId)).toBe(0n);
  });

  /**
   * دو مسیر مستقل (لغو دستی و جاروی عدم حضور) به یک رزرو می‌رسند. دومی
   * نباید اعتبار را دو برابر کند.
   */
  it("اجرای دوباره‌ی بازپرداخت، اعتبار دوم نمی‌سازد", async () => {
    const booking = await paidBooking();

    await cancelBooking({ bookingId: booking.id, actorId: fixture.teacherUserId, now: NOW });

    const first = await recordCancellationRefund({ bookingId: booking.id, refundable: true });
    const second = await recordCancellationRefund({ bookingId: booking.id, refundable: true });

    expect(first?.credit).toBe(PRICE);
    expect(second).toBeNull();
    expect(await creditBalanceOf(fixture.studentId)).toBe(PRICE);
    expect(await db.select().from(creditEntries)).toHaveLength(1);
  });

  it("ایندکس یکتا اعتبار دوم برای یک رزرو را در سطح دیتابیس رد می‌کند", async () => {
    const booking = await paidBooking();

    await db.transaction(async (tx) => {
      await writeCreditEntry(tx, {
        studentId: fixture.studentId,
        reason: "CANCELLATION",
        amount: PRICE,
        bookingId: booking.id,
        description: "اولی",
      });
    });

    await expect(
      db.transaction(async (tx) => {
        await writeCreditEntry(tx, {
          studentId: fixture.studentId,
          reason: "CANCELLATION",
          amount: PRICE,
          bookingId: booking.id,
          description: "دومی",
        });
      }),
    ).rejects.toThrow();

    expect(await creditBalanceOf(fixture.studentId)).toBe(PRICE);
  });

  it("هر جلسه‌ی پکیج اعتبار خودش را می‌گیرد، نه کل پکیج", async () => {
    const created = await createPackageEnrollment({
      studentId: fixture.studentId,
      teacherProfileId: fixture.teacherProfileId,
      offeringId: fixture.offeringId,
      firstSessionDate: SATURDAY,
      startMinute: 17 * 60,
      now: NOW,
    });

    const checkout = await startCheckout({
      studentId: fixture.studentId,
      enrollmentId: created.enrollmentId,
      gateway,
      now: NOW,
    });
    await settleOrder({ authority: await authorityOf(checkout.orderId), gateway, now: NOW });

    const third = created.bookings[2]!;
    await cancelBooking({ bookingId: third.id, actorId: fixture.teacherUserId, now: NOW });
    const settlement = await recordCancellationRefund({
      bookingId: third.id,
      refundable: true,
    });

    // یک جلسه از چهار جلسه — نه کل مبلغ پکیج
    expect(settlement?.credit).toBe(PRICE);
    expect(await creditBalanceOf(fixture.studentId)).toBe(PRICE);
  });
});

// ---------------------------------------------------------------------------

describe("موجودی و ستون کش", () => {
  it("موجودی جمع ساده‌ی سطرهاست", async () => {
    await giveCredit(1_000_000n);
    await giveCredit(2_000_000n);

    expect(await creditBalanceOf(fixture.studentId)).toBe(3_000_000n);
    expect(await summedBalance()).toBe(3_000_000n);
  });

  /**
   * ستون کش هرگز `balance + delta` نمی‌شود؛ از نو از روی جمع نوشته
   * می‌شود. این تست همان را بعد از یک زنجیره‌ی کامل اعطا و خرج می‌سنجد.
   */
  it("ستون کش با جمع سطرها یکی می‌ماند", async () => {
    const booking = await paidBooking();
    await cancelBooking({ bookingId: booking.id, actorId: fixture.teacherUserId, now: NOW });
    await recordCancellationRefund({ bookingId: booking.id, refundable: true });

    await giveCredit(500_000n);

    const next = await makeSingleBooking(19);
    await startCheckout({
      studentId: fixture.studentId,
      bookingId: next.id,
      useCredit: true,
      gateway,
      now: NOW,
    });

    expect(await cachedBalance()).toBe(await summedBalance());
  });

  it("اصلاح منفی ادمین موجودی را پایین می‌آورد", async () => {
    await giveCredit(3_000_000n);
    await grantAdminCredit({
      studentId: fixture.studentId,
      amount: -1_000_000n,
      adminId: fixture.teacherUserId,
      description: "اصلاح اشتباه",
    });

    expect(await creditBalanceOf(fixture.studentId)).toBe(2_000_000n);
    expect(await cachedBalance()).toBe(await summedBalance());
  });

  it("اعتبار یک هنرجو به هنرجوی دیگر نشت نمی‌کند", async () => {
    await giveCredit(3_000_000n);

    expect(await creditBalanceOf(fixture.otherStudentId)).toBe(0n);
  });

  it("خرج بیشتر از موجودی رد می‌شود", async () => {
    await giveCredit(1_000_000n);

    await expect(
      db.transaction(async (tx) =>
        spendCredit(tx, {
          studentId: fixture.studentId,
          orderId: null as unknown as string,
          amount: 2_000_000n,
        }),
      ),
    ).rejects.toThrow(InsufficientCreditError);

    expect(await creditBalanceOf(fixture.studentId)).toBe(1_000_000n);
  });

  it("اصلاح منفیِ بیشتر از موجودی هم رد می‌شود", async () => {
    await giveCredit(1_000_000n);

    await expect(
      grantAdminCredit({
        studentId: fixture.studentId,
        amount: -2_000_000n,
        adminId: fixture.teacherUserId,
        description: "بیشتر از موجودی",
      }),
    ).rejects.toThrow(InsufficientCreditError);

    expect(await creditBalanceOf(fixture.studentId)).toBe(1_000_000n);
  });
});

// ---------------------------------------------------------------------------

describe("خرج اعتبار در پرداخت", () => {
  it("بدون درخواست صریح، اعتبار دست‌نخورده می‌ماند", async () => {
    await giveCredit(PRICE);
    const booking = await makeSingleBooking();

    const checkout = await startCheckout({
      studentId: fixture.studentId,
      bookingId: booking.id,
      gateway,
      now: NOW,
    });

    expect(checkout.creditApplied).toBe(0n);
    expect(checkout.gatewayAmount).toBe(PRICE);
    expect(checkout.redirectUrl).not.toBeNull();
  });

  it("اعتبار جزئی، باقی‌مانده را به درگاه می‌فرستد", async () => {
    await giveCredit(1_000_000n);
    const booking = await makeSingleBooking();

    const checkout = await startCheckout({
      studentId: fixture.studentId,
      bookingId: booking.id,
      useCredit: true,
      gateway,
      now: NOW,
    });

    expect(checkout.creditApplied).toBe(1_000_000n);
    expect(checkout.gatewayAmount).toBe(2_000_000n);

    const [order] = await db.select().from(orders).where(eq(orders.id, checkout.orderId));
    // مبلغ کل سفارش دست‌نخورده می‌ماند؛ فقط سهم درگاه کم می‌شود
    expect(order?.amount).toBe(PRICE);
    expect(order?.creditApplied).toBe(1_000_000n);
  });

  it("اعتبار تا لحظه‌ی قطعی شدن سفارش کم نمی‌شود", async () => {
    await giveCredit(1_000_000n);
    const booking = await makeSingleBooking();

    await startCheckout({
      studentId: fixture.studentId,
      bookingId: booking.id,
      useCredit: true,
      gateway,
      now: NOW,
    });

    // کاربر هنوز روی صفحه‌ی درگاه است — رها کردنش نباید اعتبارش را ببرد
    expect(await creditBalanceOf(fixture.studentId)).toBe(1_000_000n);
  });

  it("پس از تأیید درگاه، فقط سهم اعتبار کم می‌شود", async () => {
    await giveCredit(1_000_000n);
    const booking = await makeSingleBooking();

    const checkout = await startCheckout({
      studentId: fixture.studentId,
      bookingId: booking.id,
      useCredit: true,
      gateway,
      now: NOW,
    });
    const settlement = await settleOrder({
      authority: await authorityOf(checkout.orderId),
      gateway,
      now: NOW,
    });

    expect(settlement.status).toBe("PAID");
    expect(await creditBalanceOf(fixture.studentId)).toBe(0n);

    const [confirmed] = await db
      .select({ status: bookings.status })
      .from(bookings)
      .where(eq(bookings.id, booking.id));
    expect(confirmed?.status).toBe("CONFIRMED");
  });

  /**
   * درگاه باید همان مبلغی را تأیید کند که گرفته، نه کل سفارش.
   *
   * این را خودِ درگاه جعلی می‌سنجد: مبلغ تأییدِ ناهمخوان `FAILED`
   * برمی‌گرداند — همان کاری که زرین‌پال با کد `-50` می‌کند. پس موفق شدن
   * تأیید، خودش اثبات یکی بودن دو مبلغ است.
   */
  it("مبلغ تأیید با مبلغ درخواست یکی است", async () => {
    await giveCredit(1_000_000n);
    const booking = await makeSingleBooking();

    const checkout = await startCheckout({
      studentId: fixture.studentId,
      bookingId: booking.id,
      useCredit: true,
      gateway,
      now: NOW,
    });

    const settlement = await settleOrder({
      authority: await authorityOf(checkout.orderId),
      gateway,
      now: NOW,
    });

    expect(settlement.status).toBe("PAID");
    expect(settlement.reason).toBeNull();
  });

  it("درآمد استاد کامل نوشته می‌شود، هرچقدر از مبلغ با اعتبار آمده باشد", async () => {
    await giveCredit(PRICE);
    const booking = await makeSingleBooking();

    await startCheckout({
      studentId: fixture.studentId,
      bookingId: booking.id,
      useCredit: true,
      gateway,
      now: NOW,
    });

    expect((await teacherLedgerSummary(fixture.teacherProfileId)).net).toBe(NET);
  });

  it("تأیید دوباره‌ی همان سفارش، اعتبار را دو بار کم نمی‌کند", async () => {
    await giveCredit(1_000_000n);
    const booking = await makeSingleBooking();

    const checkout = await startCheckout({
      studentId: fixture.studentId,
      bookingId: booking.id,
      useCredit: true,
      gateway,
      now: NOW,
    });
    const authority = await authorityOf(checkout.orderId);

    await settleOrder({ authority, gateway, now: NOW });
    const second = await settleOrder({ authority, gateway, now: NOW });

    expect(second.status).toBe("ALREADY_PAID");
    expect(await creditBalanceOf(fixture.studentId)).toBe(0n);
    expect(await summedBalance()).toBe(0n);
  });

  it("تغییر تصمیم درباره‌ی اعتبار، همان سفارش را به‌روز می‌کند", async () => {
    await giveCredit(1_000_000n);
    const booking = await makeSingleBooking();

    const first = await startCheckout({
      studentId: fixture.studentId,
      bookingId: booking.id,
      gateway,
      now: NOW,
    });
    const second = await startCheckout({
      studentId: fixture.studentId,
      bookingId: booking.id,
      useCredit: true,
      gateway,
      now: NOW,
    });

    expect(second.orderId).toBe(first.orderId);
    expect(second.creditApplied).toBe(1_000_000n);
    expect(await db.select({ id: orders.id }).from(orders)).toHaveLength(1);
  });

  /**
   * دو سفارشِ در انتظار که هر دو روی یک موجودی حساب کرده‌اند، یعنی
   * هنگام قطعی شدن دومی پول درگاه گرفته شده و اعتباری نمانده.
   */
  it("چک‌اوت اعتباریِ دوم تا تعیین تکلیف اولی رد می‌شود", async () => {
    await giveCredit(1_000_000n);
    const first = await makeSingleBooking(17);
    const second = await makeSingleBooking(19);

    await startCheckout({
      studentId: fixture.studentId,
      bookingId: first.id,
      useCredit: true,
      gateway,
      now: NOW,
    });

    await expect(
      startCheckout({
        studentId: fixture.studentId,
        bookingId: second.id,
        useCredit: true,
        gateway,
        now: NOW,
      }),
    ).rejects.toThrow(CreditCheckoutInProgressError);
  });

  it("چک‌اوت بدون اعتبار در همان زمان آزاد است", async () => {
    await giveCredit(1_000_000n);
    const first = await makeSingleBooking(17);
    const second = await makeSingleBooking(19);

    await startCheckout({
      studentId: fixture.studentId,
      bookingId: first.id,
      useCredit: true,
      gateway,
      now: NOW,
    });

    const plain = await startCheckout({
      studentId: fixture.studentId,
      bookingId: second.id,
      gateway,
      now: NOW,
    });

    expect(plain.creditApplied).toBe(0n);
  });
});

// ---------------------------------------------------------------------------

describe("رزرو بدون درگاه", () => {
  it("اعتبارِ کافی سفارش را همان‌جا قطعی می‌کند", async () => {
    await giveCredit(PRICE);
    const booking = await makeSingleBooking();

    /**
     * درگاهی که هر تماسی با آن تست را می‌شکند.
     *
     * «مبلغ درگاه صفر بود» را می‌شود با خواندن خروجی هم دید؛ آنچه اینجا
     * اثبات می‌شود این است که اصلاً **صدا زده نشده**. سفارشی که به درگاه
     * می‌رود و صفر ریال می‌خواهد، کد خطا می‌گیرد.
     */
    const forbidden = {
      name: "forbidden",
      request: async () => {
        throw new Error("درگاه نباید در مسیر تماماً اعتباری صدا زده شود");
      },
      verify: async () => {
        throw new Error("درگاه نباید در مسیر تماماً اعتباری صدا زده شود");
      },
    };

    const checkout = await startCheckout({
      studentId: fixture.studentId,
      bookingId: booking.id,
      useCredit: true,
      gateway: forbidden,
      now: NOW,
    });

    expect(checkout.gateway).toBeNull();
    expect(checkout.redirectUrl).toBeNull();
    expect(checkout.gatewayAmount).toBe(0n);
    expect(checkout.settlement?.status).toBe("PAID");
    expect(checkout.settlement?.confirmedBookingIds).toEqual([booking.id]);
  });

  it("جلسه قطعی می‌شود و اعتبار کم", async () => {
    await giveCredit(PRICE + 500_000n);
    const booking = await makeSingleBooking();

    await startCheckout({
      studentId: fixture.studentId,
      bookingId: booking.id,
      useCredit: true,
      gateway,
      now: NOW,
    });

    const [row] = await db
      .select({ status: bookings.status })
      .from(bookings)
      .where(eq(bookings.id, booking.id));

    expect(row?.status).toBe("CONFIRMED");
    expect(await creditBalanceOf(fixture.studentId)).toBe(500_000n);
  });

  it("سفارش بدون درگاه، کد رهگیری جعلی نمی‌گیرد", async () => {
    await giveCredit(PRICE);
    const booking = await makeSingleBooking();

    const checkout = await startCheckout({
      studentId: fixture.studentId,
      bookingId: booking.id,
      useCredit: true,
      gateway,
      now: NOW,
    });

    const [order] = await db.select().from(orders).where(eq(orders.id, checkout.orderId));

    expect(order?.status).toBe("PAID");
    expect(order?.gateway).toBe("CREDIT");
    expect(order?.gatewayRefId).toBeNull();
    expect(order?.gatewayAuthority).toBeNull();
  });

  it("درآمد استاد از سفارش تماماً اعتباری هم نوشته می‌شود", async () => {
    await giveCredit(PRICE);
    const booking = await makeSingleBooking();

    await startCheckout({
      studentId: fixture.studentId,
      bookingId: booking.id,
      useCredit: true,
      gateway,
      now: NOW,
    });

    expect((await teacherLedgerSummary(fixture.teacherProfileId)).net).toBe(NET);
  });

  /** چرخه‌ی کامل: جلسه‌ای که با اعتبارِ لغو جلسه‌ی قبلی رزرو می‌شود. */
  it("اعتبار لغو، جلسه‌ی بعدی را کامل می‌پوشاند", async () => {
    const first = await paidBooking(17);
    await cancelBooking({ bookingId: first.id, actorId: fixture.teacherUserId, now: NOW });
    await recordCancellationRefund({ bookingId: first.id, refundable: true });

    const second = await makeSingleBooking(19);
    const checkout = await startCheckout({
      studentId: fixture.studentId,
      bookingId: second.id,
      useCredit: true,
      gateway,
      now: NOW,
    });

    expect(checkout.settlement?.status).toBe("PAID");
    expect(await creditBalanceOf(fixture.studentId)).toBe(0n);
    // استاد بابت جلسه‌ی لغوشده چیزی ندارد و بابت جلسه‌ی تازه دارد
    expect((await teacherLedgerSummary(fixture.teacherProfileId)).net).toBe(NET);
  });
});

// ---------------------------------------------------------------------------

describe("اعطای دستی ادمین", () => {
  it("سطر با هویت ادمین ثبت می‌شود", async () => {
    await grantAdminCredit({
      studentId: fixture.studentId,
      amount: 500_000n,
      adminId: fixture.teacherUserId,
      description: "بازپرداخت دستی سفارش بی‌جلسه",
    });

    const [entry] = await db.select().from(creditEntries);

    expect(entry?.reason).toBe("ADMIN_ADJUSTMENT");
    expect(entry?.amount).toBe(500_000n);
    expect(entry?.createdById).toBe(fixture.teacherUserId);
    expect(entry?.description).toBe("بازپرداخت دستی سفارش بی‌جلسه");
  });

  it("تاریخچه تازه‌ترین سطر را اول می‌دهد", async () => {
    await giveCredit(100_000n);
    await giveCredit(200_000n);

    const entries = await listCreditEntries(fixture.studentId);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.createdAt.getTime()).toBeGreaterThanOrEqual(
      entries[1]!.createdAt.getTime(),
    );
  });

  it("مبلغ صفر پذیرفته نمی‌شود", async () => {
    await expect(
      grantAdminCredit({
        studentId: fixture.studentId,
        amount: 0n,
        adminId: fixture.teacherUserId,
        description: "هیچ",
      }),
    ).rejects.toThrow(RangeError);
  });
});
