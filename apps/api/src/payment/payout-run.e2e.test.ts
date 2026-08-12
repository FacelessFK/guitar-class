import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { fromTehranWallClock, persianDateOf } from "@music/shared";

import { db } from "../db/client.js";
import { orders, payouts, teacherProfiles } from "../db/schema/index.js";
import { createSingleBooking } from "../booking/booking.service.js";
import { createPayout, markPayoutPaid } from "../admin/admin.service.js";
import {
  closeDatabase,
  resetDatabase,
  resetRedis,
  seedFixture,
  type Fixture,
} from "../test/fixtures.js";
import { FakePaymentGateway } from "./gateway.port.js";
import { settleOrder, startCheckout, teacherEarningsBreakdown } from "./payment.service.js";
import { runMonthlyPayouts } from "./payout-run.service.js";

/**
 * جاروی تسویه‌ی ماهانه، روی پستگرس واقعی.
 *
 * دو چیز اثبات می‌شود و هر دو پولی‌اند:
 *
 *   ۱. جارو **فقط سطر در انتظار می‌سازد** و هیچ پولی جابه‌جا نمی‌کند.
 *      دفتر کل باید دست‌نخورده بماند.
 *   ۲. اجرای دوباره سطر دوم نمی‌سازد. جارو هر شب اجرا می‌شود، پس بدون
 *      این، تا آخر ماه سی سطر پرداختنی برای یک دوره ساخته می‌شد.
 */

const SATURDAY = "2026-08-15";
const NOW = new Date("2026-08-01T00:00:00Z");

/** میانه‌ی مرداد ۱۴۰۵ — ماه پیشش تیر است. */
const RUN_AT = new Date("2026-08-12T00:00:00Z");

let fixture: Fixture;

beforeEach(async () => {
  await resetDatabase();
  await resetRedis();
  fixture = await seedFixture();
});

afterAll(async () => {
  await closeDatabase();
});

/** یک جلسه‌ی پرداخت‌شده — یعنی درآمد واقعی در دفتر کل. */
async function earn(hour = 17): Promise<void> {
  const booking = await createSingleBooking({
    studentId: fixture.studentId,
    teacherProfileId: fixture.teacherProfileId,
    offeringId: fixture.offeringId,
    scheduledAt: fromTehranWallClock(SATURDAY, hour * 60),
    now: NOW,
  });

  const gateway = new FakePaymentGateway();
  const checkout = await startCheckout({
    studentId: fixture.studentId,
    bookingId: booking.id,
    gateway,
    now: NOW,
  });

  // شناسه‌ی درگاه روی سفارش می‌نشیند، نه در پاسخ شروع پرداخت
  const [order] = await db
    .select({ authority: orders.gatewayAuthority })
    .from(orders)
    .where(eq(orders.id, checkout.orderId));

  await settleOrder({ authority: order!.authority!, gateway, now: NOW });
}

const payoutRows = () =>
  db.select().from(payouts).where(eq(payouts.teacherId, fixture.teacherProfileId));

// ---------------------------------------------------------------------------

describe("جاروی تسویه‌ی ماهانه", () => {
  it("برای استاد با مانده‌ی مثبت، تسویه‌ی در انتظار می‌سازد", async () => {
    await earn();
    const balance = await teacherEarningsBreakdown(fixture.teacherProfileId);

    const result = await runMonthlyPayouts(RUN_AT);

    expect(result.created).toBe(1);

    const [row] = await payoutRows();
    expect(row!.status).toBe("PENDING");
    expect(row!.amount).toBe(balance.outstanding);
  });

  /**
   * دوره ماه **شمسی** است نه میلادی: عددی است که استاد می‌خواند، و
   * بازه‌ای که از ۱۰ مرداد تا ۹ شهریور برود در پنلی که تاریخ‌ها را شمسی
   * نشان می‌دهد شبیه باگ به نظر می‌رسد.
   */
  it("دوره را ماه شمسیِ گذشته می‌گیرد", async () => {
    await earn();

    const result = await runMonthlyPayouts(RUN_AT);

    // اجرا در مرداد ۱۴۰۵ → دوره باید کل تیر ۱۴۰۵ باشد
    expect(persianDateOf(result.period.start)).toEqual({
      year: 1405,
      month: 4,
      day: 1,
    });
    expect(persianDateOf(result.period.end)).toEqual({ year: 1405, month: 4, day: 31 });
  });

  /**
   * جارو هر شب اجرا می‌شود. بدون ایندکس یکتا، تا آخر ماه سی سطر
   * پرداختنی برای یک دوره ساخته می‌شد و هیچ‌کدام به‌تنهایی خطا نمی‌داد.
   */
  it("اجرای دوباره در همان ماه سطر دوم نمی‌سازد", async () => {
    await earn();

    expect((await runMonthlyPayouts(RUN_AT)).created).toBe(1);

    // مانده حالا صفر است چون تسویه‌ی در انتظار از آن کسر می‌شود، پس
    // اصلاً به درج نمی‌رسد
    const second = await runMonthlyPayouts(RUN_AT);
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(1);

    expect(await payoutRows()).toHaveLength(1);
  });

  /**
   * درآمد تازه **در همان ماهی** که تسویه‌اش ساخته شده.
   *
   * اینجا مانده دوباره مثبت است، پس جارو تا خودِ درج پیش می‌رود و
   * ایندکس یکتا جلویش را می‌گیرد — تنها لایه‌ای که در برابر دو اجرای
   * هم‌زمان هم کار می‌کند. پول گم نمی‌شود: ماه بعد پیشنهاد می‌شود.
   */
  it("درآمد تازه در همان دوره، سطر دوم نمی‌سازد و به ماه بعد می‌رود", async () => {
    await earn(17);
    expect((await runMonthlyPayouts(RUN_AT)).created).toBe(1);

    await earn(18);

    const second = await runMonthlyPayouts(RUN_AT);
    expect(second.created).toBe(0);
    expect(second.alreadyCovered).toBe(1);
    expect(await payoutRows()).toHaveLength(1);

    // ماه بعد، همان درآمدِ جامانده پیشنهاد می‌شود
    const nextMonth = await runMonthlyPayouts(new Date("2026-09-12T00:00:00Z"));
    expect(nextMonth.created).toBe(1);
  });

  /** اجرا در روز دیگری از همان ماه هم همان دوره را می‌دهد. */
  it("در روز دیگری از همان ماه هم سطر تازه نمی‌سازد", async () => {
    await earn();

    await runMonthlyPayouts(new Date("2026-08-12T00:00:00Z"));
    await runMonthlyPayouts(new Date("2026-08-20T00:00:00Z"));

    expect(await payoutRows()).toHaveLength(1);
  });

  it("استادِ بدون درآمد را رد می‌کند", async () => {
    const result = await runMonthlyPayouts(RUN_AT);

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(await payoutRows()).toHaveLength(0);
  });

  /**
   * تسویه‌ی در انتظار از مانده کسر می‌شود.
   *
   * بدون این، در فاصله‌ی «ادمین سطر را ساخت» تا «پرداخت شد را زد»، جارو
   * همان پول را پرداخت‌نشده می‌بیند و سطر دومی برایش می‌سازد — و جمع
   * آن دو، دو برابر بدهی واقعی است.
   */
  it("تسویه‌ی در انتظارِ دستی را دوباره پیشنهاد نمی‌کند", async () => {
    await earn();
    const balance = await teacherEarningsBreakdown(fixture.teacherProfileId);

    await createPayout({
      teacherProfileId: fixture.teacherProfileId,
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
      amount: balance.outstanding,
      note: null,
    });

    const result = await runMonthlyPayouts(RUN_AT);

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
  });

  /** پس از پرداخت شدنِ کل مانده، چیزی برای پیشنهاد نمی‌ماند. */
  it("پس از تسویه‌ی کامل، دوره‌ی بعد چیزی پیشنهاد نمی‌دهد", async () => {
    await earn();
    await runMonthlyPayouts(RUN_AT);

    const [pending] = await payoutRows();
    await markPayoutPaid(pending!.id, "TRACK-1");

    // ماه بعد: مانده صفر است
    const next = await runMonthlyPayouts(new Date("2026-09-12T00:00:00Z"));

    expect(next.created).toBe(0);
    expect(next.skipped).toBe(1);
  });

  /** درآمد تازه پس از تسویه، ماه بعد دوباره پیشنهاد می‌شود. */
  it("درآمد تازه پس از تسویه، دوره‌ی بعد پیشنهاد می‌شود", async () => {
    await earn(17);
    await runMonthlyPayouts(RUN_AT);
    const [first] = await payoutRows();
    await markPayoutPaid(first!.id, "TRACK-1");

    await earn(18);

    const next = await runMonthlyPayouts(new Date("2026-09-12T00:00:00Z"));
    expect(next.created).toBe(1);
    expect(await payoutRows()).toHaveLength(2);
  });

  /** استادِ تأییدنشده اصلاً نباید در محاسبه بیاید. */
  it("استاد تأییدنشده را نادیده می‌گیرد", async () => {
    await earn();
    await db
      .update(teacherProfiles)
      .set({ status: "SUSPENDED" })
      .where(eq(teacherProfiles.id, fixture.teacherProfileId));

    const result = await runMonthlyPayouts(RUN_AT);

    expect(result.created).toBe(0);
    expect(await payoutRows()).toHaveLength(0);
  });
});
