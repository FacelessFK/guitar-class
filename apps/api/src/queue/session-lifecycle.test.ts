import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { BUSINESS_RULES, fromTehranWallClock, type NormalizedPhone } from "@music/shared";

import { db } from "../db/client.js";
import { bookings, ledgerEntries, notifications, orders } from "../db/schema/index.js";
import { cancelBooking, createSingleBooking } from "../booking/booking.service.js";
import { recordAttendance } from "../classroom/classroom.service.js";
import { FakePaymentGateway } from "../payment/gateway.port.js";
import { settleOrder, startCheckout } from "../payment/payment.service.js";
import { setSmsSender, type SmsSender } from "../notification/sms.port.js";
import {
  closeDatabase,
  resetDatabase,
  resetRedis,
  seedFixture,
  type Fixture,
} from "../test/fixtures.js";
import { readWorkerStatus } from "./heartbeat.js";
import { runMaintenance } from "./maintenance.job.js";
import { runReminders } from "./reminder.job.js";
import { runSessionClose } from "./session-close.job.js";

/**
 * جاروهای چرخه‌ی جلسه، روی پستگرس و ردیس واقعی.
 *
 * چیزی که اینجا اثبات می‌شود، رفتار در برابر **اجرای دوباره** است. هر
 * دو جارو هر دقیقه اجرا می‌شوند و وُرکر هر لحظه ممکن است ری‌استارت
 * شود؛ اجرای دوم نباید پول را دو بار برگرداند یا پیامک را دو بار
 * بفرستد. این را با ماک نمی‌شود نشان داد، چون ضامنش قید و ایندکس
 * دیتابیس است.
 */

/** ۱۵ اوت ۲۰۲۶ شنبه است — استاد در fixture شنبه‌ها ۱۶ تا ۲۰ آزاد است. */
const SATURDAY = "2026-08-15";
const NOW = new Date("2026-08-01T00:00:00Z");

const PRICE = 3_000_000n;
const NET = 2_400_000n;

const GRACE_MS = BUSINESS_RULES.NO_SHOW_GRACE_MINUTES * 60_000;

let fixture: Fixture;
let sms: RecordingSmsSender;

/** فرستنده‌ی پیامکِ تستی — هر پیام را نگه می‌دارد. */
class RecordingSmsSender implements SmsSender {
  readonly sent: { phone: string; text: string }[] = [];
  /** وقتی روشن باشد، ارسال خطا می‌دهد — برای تست مسیر شکست */
  failing = false;

  async sendOtp(): Promise<void> {}

  async sendText(phone: NormalizedPhone, text: string): Promise<void> {
    if (this.failing) throw new Error("پنل پیامک جواب نداد");
    this.sent.push({ phone, text });
  }
}

beforeEach(async () => {
  await resetDatabase();
  await resetRedis();
  fixture = await seedFixture();

  sms = new RecordingSmsSender();
  setSmsSender(sms);
});

afterAll(async () => {
  await closeDatabase();
});

// ---------------------------------------------------------------------------

const slotAt = (hour: number): Date => fromTehranWallClock(SATURDAY, hour * 60);

/** یک جلسه‌ی پرداخت‌شده و قطعی — نقطه‌ی شروع همه‌ی سناریوها. */
async function confirmedBooking(hour = 17) {
  const booking = await createSingleBooking({
    studentId: fixture.studentId,
    teacherProfileId: fixture.teacherProfileId,
    offeringId: fixture.offeringId,
    scheduledAt: slotAt(hour),
    now: NOW,
  });

  const gateway = new FakePaymentGateway();
  const checkout = await startCheckout({
    studentId: fixture.studentId,
    bookingId: booking.id,
    gateway,
    now: NOW,
  });

  const [order] = await db
    .select({ authority: orders.gatewayAuthority })
    .from(orders)
    .where(eq(orders.id, checkout.orderId));

  await settleOrder({ authority: order!.authority!, gateway, now: NOW });

  return booking;
}

/** ورود یکی از دو طرف به اتاق، از همان مسیر واقعیِ اندپوینت حضور. */
async function join(bookingId: string, userId: string, at: Date): Promise<void> {
  await recordAttendance({ bookingId, userId, event: "JOINED", now: at });
}

async function statusOf(bookingId: string): Promise<string> {
  const [row] = await db
    .select({ status: bookings.status })
    .from(bookings)
    .where(eq(bookings.id, bookingId));

  return row!.status;
}

async function refundRowsOf(bookingId: string) {
  return db
    .select()
    .from(ledgerEntries)
    .where(
      and(eq(ledgerEntries.bookingId, bookingId), eq(ledgerEntries.type, "REFUND")),
    );
}

/** لحظه‌ای که جارو باید جلسه را ببندد: پایان جلسه + مهلت + یک دقیقه. */
const afterGrace = (booking: { endsAt: Date }): Date =>
  new Date(booking.endsAt.getTime() + GRACE_MS + 60_000);

// ---------------------------------------------------------------------------
// بستن جلسه و چهار حالت عدم حضور
// ---------------------------------------------------------------------------

describe("بستن خودکار جلسه", () => {
  it("هر دو آمدند → COMPLETED", async () => {
    const booking = await confirmedBooking();
    await join(booking.id, fixture.teacherUserId, booking.scheduledAt);
    await join(booking.id, fixture.studentId, booking.scheduledAt);

    const result = await runSessionClose(afterGrace(booking));

    expect(result.completed).toBe(1);
    expect(await statusOf(booking.id)).toBe("COMPLETED");
    expect(await refundRowsOf(booking.id)).toHaveLength(0);
  });

  it("فقط استاد آمد → NO_SHOW_STUDENT و جلسه می‌سوزد", async () => {
    const booking = await confirmedBooking();
    await join(booking.id, fixture.teacherUserId, booking.scheduledAt);

    const result = await runSessionClose(afterGrace(booking));

    expect(result.noShowStudent).toBe(1);
    expect(await statusOf(booking.id)).toBe("NO_SHOW_STUDENT");
    // سوختن یعنی پول پیش استاد می‌ماند
    expect(await refundRowsOf(booking.id)).toHaveLength(0);
  });

  it("فقط هنرجو آمد → NO_SHOW_TEACHER و جلسه برمی‌گردد", async () => {
    const booking = await confirmedBooking();
    await join(booking.id, fixture.studentId, booking.scheduledAt);

    const result = await runSessionClose(afterGrace(booking));

    expect(result.noShowTeacher).toBe(1);
    expect(result.refunded).toBe(1);
    expect(await statusOf(booking.id)).toBe("NO_SHOW_TEACHER");

    const refunds = await refundRowsOf(booking.id);
    expect(refunds).toHaveLength(1);
    // سطر منفی، نه ویرایش سطر درآمد
    expect(refunds[0]?.grossAmount).toBe(-PRICE);
    expect(refunds[0]?.netAmount).toBe(-NET);
  });

  it("هیچ‌کس نیامد → NO_SHOW", async () => {
    const booking = await confirmedBooking();

    const result = await runSessionClose(afterGrace(booking));

    expect(result.noShow).toBe(1);
    expect(await statusOf(booking.id)).toBe("NO_SHOW");
  });

  /**
   * پیش از پایان مهلت، جلسه باید باز بماند. استادی که پنج دقیقه دیر
   * می‌آید نباید جلسه‌اش سوخته باشد.
   */
  it("پیش از پایان مهلت دست نمی‌زند", async () => {
    const booking = await confirmedBooking();
    const tooEarly = new Date(booking.endsAt.getTime() + GRACE_MS - 60_000);

    const result = await runSessionClose(tooEarly);

    expect(result.noShow).toBe(0);
    expect(await statusOf(booking.id)).toBe("CONFIRMED");
  });

  /**
   * شکاف آگاهانه‌ی بخش ۶.۵ سند معماری: خروجی که بعد از بسته شدن پنجره
   * برسد رد می‌شود، پس جلسه‌ای که تا آخر ادامه داشته `actual_ended_at`
   * ثبت‌شده ندارد. جبرانش کار همین جاب است.
   */
  it("پایانِ ثبت‌نشده را از روی برنامه پر می‌کند", async () => {
    const booking = await confirmedBooking();
    await join(booking.id, fixture.teacherUserId, booking.scheduledAt);
    await join(booking.id, fixture.studentId, booking.scheduledAt);

    await runSessionClose(afterGrace(booking));

    const [row] = await db
      .select({ endedAt: bookings.actualEndedAt })
      .from(bookings)
      .where(eq(bookings.id, booking.id));

    expect(row?.endedAt).toEqual(booking.endsAt);
  });

  it("برای جلسه‌ای که هیچ‌کس نیامد پایان ساختگی نمی‌نویسد", async () => {
    const booking = await confirmedBooking();

    await runSessionClose(afterGrace(booking));

    const [row] = await db
      .select({
        startedAt: bookings.actualStartedAt,
        endedAt: bookings.actualEndedAt,
      })
      .from(bookings)
      .where(eq(bookings.id, booking.id));

    expect(row?.startedAt).toBeNull();
    expect(row?.endedAt).toBeNull();
  });

  /**
   * مهم‌ترین تست این فایل. بازپرداختِ دوباره یعنی پول دو بار از حساب
   * استاد کم شود.
   */
  it("اجرای دوباره‌ی جارو سطر مالی دوم نمی‌نویسد", async () => {
    const booking = await confirmedBooking();
    await join(booking.id, fixture.studentId, booking.scheduledAt);

    const first = await runSessionClose(afterGrace(booking));
    const second = await runSessionClose(afterGrace(booking));

    expect(first.refunded).toBe(1);
    expect(second.noShowTeacher).toBe(0);
    expect(second.refunded).toBe(0);
    expect(await refundRowsOf(booking.id)).toHaveLength(1);
  });

  it("جلسه‌ی لغوشده را دوباره نمی‌بندد", async () => {
    const booking = await confirmedBooking();
    await cancelBooking({
      bookingId: booking.id,
      actorId: fixture.studentId,
      now: NOW,
    });

    const result = await runSessionClose(afterGrace(booking));

    expect(result.noShow).toBe(0);
    expect(await statusOf(booking.id)).toBe("CANCELLED_BY_STUDENT");
  });

  /**
   * ضربان‌ها جدا هستند و سلامت به هر سه بند است. با یک ضربان مشترک،
   * جاروی بستن جلسه می‌توانست هفته‌ها خوابیده باشد و سرویس همچنان
   * «سالم» گزارش شود چون جاروی مهلت پرداخت کار می‌کرد.
   */
  it("ضربان جداگانه ثبت می‌کند و سلامت به همه‌ی جاروها بند است", async () => {
    const now = new Date();

    expect((await readWorkerStatus()).status).toBe("never");

    await runSessionClose(now);
    expect((await readWorkerStatus()).status).toBe("never");

    await runMaintenance(now);
    expect((await readWorkerStatus()).status).toBe("never");

    await runReminders(now);
    expect((await readWorkerStatus()).status).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// یادآوری پیامکی
// ---------------------------------------------------------------------------

describe("یادآوری جلسه", () => {
  /** لحظه‌ی دقیق موعد یادآوری، به علاوه‌ی چند ثانیه. */
  const reminderTime = (booking: { scheduledAt: Date }, leadMinutes: number): Date =>
    new Date(booking.scheduledAt.getTime() - leadMinutes * 60_000 + 10_000);

  it("۲۴ ساعت قبل به هر دو طرف پیامک می‌دهد", async () => {
    const booking = await confirmedBooking();

    const result = await runReminders(reminderTime(booking, 24 * 60));

    expect(result.sent).toBe(2);
    expect(sms.sent).toHaveLength(2);
    expect(sms.sent.map((message) => message.phone).sort()).toEqual(
      ["+989120000001", "+989120000003"].sort(),
    );

    // ساعت دیواری تهران در متن است، نه UTC — جلسه ۱۷:۰۰ تهران است
    for (const message of sms.sent) {
      expect(message.text).toContain("17:00");
      expect(message.text).toContain("گیتار کلاسیک");
    }

    // هر طرف نام طرف مقابل را می‌بیند
    const toStudent = sms.sent.find((message) => message.phone === "+989120000001");
    const toTeacher = sms.sent.find((message) => message.phone === "+989120000003");
    expect(toStudent?.text).toContain("استاد رضایی");
    expect(toTeacher?.text).toContain("هنرجوی الف");
  });

  it("یک ساعت قبل هم می‌فرستد و با یادآوری ۲۴ ساعته قاطی نمی‌شود", async () => {
    const booking = await confirmedBooking();

    await runReminders(reminderTime(booking, 24 * 60));
    sms.sent.length = 0;
    await runReminders(reminderTime(booking, 60));

    expect(sms.sent).toHaveLength(2);

    const rows = await db
      .select({ type: notifications.type })
      .from(notifications)
      .where(eq(notifications.bookingId, booking.id));

    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((row) => row.type))).toEqual(
      new Set(["SESSION_REMINDER_24H", "SESSION_REMINDER_1H"]),
    );
  });

  /**
   * قلب ایدمپوتنسی: جارو هر دقیقه اجرا می‌شود و موعد یادآوری برای
   * ساعت‌ها در گذشته می‌ماند.
   */
  it("اجرای دوباره‌ی جارو پیامک دوم نمی‌فرستد", async () => {
    const booking = await confirmedBooking();
    const at = reminderTime(booking, 24 * 60);

    await runReminders(at);
    await runReminders(at);
    await runReminders(new Date(at.getTime() + 30 * 60_000));

    expect(sms.sent).toHaveLength(2);

    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.bookingId, booking.id));

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.status === "SENT")).toBe(true);
  });

  it("پیش از موعد چیزی نمی‌فرستد", async () => {
    const booking = await confirmedBooking();

    const result = await runReminders(
      new Date(booking.scheduledAt.getTime() - 25 * 60 * 60_000),
    );

    expect(result.scheduled).toBe(0);
    expect(sms.sent).toHaveLength(0);
  });

  it("برای جلسه‌ی لغوشده یادآوری نمی‌فرستد", async () => {
    const booking = await confirmedBooking();
    await cancelBooking({
      bookingId: booking.id,
      actorId: fixture.studentId,
      now: NOW,
    });

    const result = await runReminders(reminderTime(booking, 24 * 60));

    expect(result.sent).toBe(0);
    expect(sms.sent).toHaveLength(0);
  });

  /**
   * جلسه‌ای که سه ساعت پیش از شروعش رزرو شده، هرگز «۲۴ ساعت مانده»
   * نداشته. یادآوری ۲۴ ساعته‌ای که همان لحظه‌ی رزرو برسد بی‌معناست.
   */
  it("یادآوریِ گذشته را برای رزرو دیرهنگام نمی‌سازد", async () => {
    // رزرو سه ساعت پیش از شروع جلسه
    const bookedAt = new Date(slotAt(17).getTime() - 3 * 60 * 60_000);
    const booking = await createSingleBooking({
      studentId: fixture.studentId,
      teacherProfileId: fixture.teacherProfileId,
      offeringId: fixture.offeringId,
      scheduledAt: slotAt(17),
      now: bookedAt,
    });
    await db
      .update(bookings)
      .set({ status: "CONFIRMED", createdAt: bookedAt })
      .where(eq(bookings.id, booking.id));

    const result = await runReminders(new Date(bookedAt.getTime() + 60_000));

    expect(result.scheduled).toBe(0);

    // ولی یادآوری یک‌ساعته سر جای خودش می‌رسد
    const later = await runReminders(reminderTime(booking, 60));
    expect(later.sent).toBe(2);
  });

  /**
   * پیامکی که نرفته نباید «فرستاده شد» بماند، و نباید هم دوباره تلاش
   * شود: یادآوریِ ساعت‌ها بعد از جلسه بدتر از نفرستادن است.
   */
  it("شکست ارسال را ثبت می‌کند و دوباره تلاش نمی‌کند", async () => {
    const booking = await confirmedBooking();
    sms.failing = true;

    const at = reminderTime(booking, 24 * 60);
    const first = await runReminders(at);

    expect(first.failed).toBe(2);

    sms.failing = false;
    const second = await runReminders(at);

    expect(second.sent).toBe(0);
    expect(sms.sent).toHaveLength(0);

    const rows = await db
      .select({ status: notifications.status, error: notifications.error })
      .from(notifications)
      .where(eq(notifications.bookingId, booking.id));

    expect(rows.every((row) => row.status === "FAILED")).toBe(true);
    expect(rows[0]?.error).toContain("پنل پیامک");
  });
});
