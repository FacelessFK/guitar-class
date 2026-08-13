import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { BUSINESS_RULES, fromTehranWallClock, type NormalizedPhone } from "@music/shared";

import { db } from "../db/client.js";
import {
  bookings,
  ledgerEntries,
  notifications,
  orders,
  sessionReviews,
} from "../db/schema/index.js";
import { cancelBooking, createSingleBooking } from "../booking/booking.service.js";
import { recordAttendance } from "../classroom/classroom.service.js";
import { recordHookAttendance } from "../classroom/hook.service.js";
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
import { SWEEPS, readWorkerStatus, type SweepName } from "./heartbeat.js";
import { runMaintenance } from "./maintenance.job.js";
import { runCleanupMedia, runPayoutRun } from "./nightly.job.js";
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

/**
 * ورودِ **ادعاشده** — همان مسیری که مرورگر کاربر صدا می‌زند.
 *
 * این داده جعل‌پذیر است و از وقتی بازپرداخت به آن بند شد، اثر مالی هم
 * داشت. حالا دیگر به‌تنهایی پول جابه‌جا نمی‌کند؛ تست‌هایی که دنبال
 * بازپرداخت‌اند باید `joinVerified` صدا بزنند.
 */
async function join(bookingId: string, userId: string, at: Date): Promise<void> {
  await recordAttendance({ bookingId, userId, event: "JOINED", now: at });
}

/**
 * ورودِ **تأییدشده** — همان چیزی که هوک prosody می‌فرستد.
 *
 * عمداً از مسیر واقعی سرویس هوک می‌رود نه با `UPDATE` مستقیم روی ستون:
 * چیزی که باید اثبات شود این است که رویدادِ سرور، تصمیم مالی را عوض
 * می‌کند — و اگر تست خودش ستون را پر کند، آن زنجیره اصلاً آزموده نمی‌شود.
 */
async function joinVerified(
  booking: { id: string; roomId: string },
  userId: string,
  at: Date,
): Promise<void> {
  await recordHookAttendance({
    roomName: booking.roomId,
    userId,
    event: "JOINED",
    reportedAt: at,
    occupantJid: `${booking.roomId}@conference.meet.jitsi/${userId.slice(0, 8)}`,
    now: at,
  });
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

/**
 * فقط سطرهای یادآوری، نه هر اعلانی که به این جلسه وصل است.
 *
 * از وقتی «رزرو قطعی شد» اعلان درون‌اپ می‌سازد، همان `booking_id` دو
 * سطر `IN_APP` هم دارد. بدون این شرط، تست‌های ایدمپوتنسیِ یادآوری آن‌ها
 * را هم می‌شمردند و شکستشان به‌جای «پیامک دوم رفت» می‌شد «عدد فرق کرد».
 */
const reminderRowsOf = (bookingId: string) =>
  and(eq(notifications.bookingId, bookingId), eq(notifications.channel, "SMS"));

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
    await joinVerified(booking, fixture.studentId, booking.scheduledAt);

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
    await joinVerified(booking, fixture.studentId, booking.scheduledAt);

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
   * ضربان‌ها جدا هستند و سلامت به **همه‌ی** جاروها بند است. با یک ضربان
   * مشترک، جاروی بستن جلسه می‌توانست هفته‌ها خوابیده باشد و سرویس همچنان
   * «سالم» گزارش شود چون جاروی مهلت پرداخت کار می‌کرد.
   *
   * جاروها یکی‌یکی اجرا می‌شوند و تا آخرینشان، سلامت نباید `ok` شود.
   * فهرست از خودِ `SWEEPS` می‌آید نه دستی، پس جاروی تازه‌ای که ضربانش
   * را ثبت نکند همین‌جا می‌ایستد — همان چیزی که با `expireStaleHolds`
   * از دست رفت.
   */
  it("ضربان جداگانه ثبت می‌کند و سلامت به همه‌ی جاروها بند است", async () => {
    const now = new Date();

    const runners: Record<SweepName, () => Promise<unknown>> = {
      [SWEEPS.CLOSE_SESSIONS]: () => runSessionClose(now),
      [SWEEPS.EXPIRE_HOLDS]: () => runMaintenance(now),
      [SWEEPS.SEND_REMINDERS]: () => runReminders(now),
      [SWEEPS.CLEANUP_MEDIA]: () => runCleanupMedia(now),
      [SWEEPS.MONTHLY_PAYOUTS]: () => runPayoutRun(now),
    };

    const sweeps = Object.values(SWEEPS);
    expect((await readWorkerStatus()).status).toBe("never");

    for (const [index, sweep] of sweeps.entries()) {
      await runners[sweep]();

      const status = await readWorkerStatus();
      const isLast = index === sweeps.length - 1;

      expect(status.status, `پس از اجرای ${sweep}`).toBe(isLast ? "ok" : "never");
    }
  });
});

// ---------------------------------------------------------------------------
// صف بررسی و اعلان رویدادهای رزرو
// ---------------------------------------------------------------------------

/** اعلان‌های درون‌اپِ یک کاربر، از تازه به قدیم. */
async function inAppOf(userId: string, bookingId?: string) {
  return db
    .select({ type: notifications.type, payload: notifications.payload })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.channel, "IN_APP"),
        bookingId ? eq(notifications.bookingId, bookingId) : undefined,
      ),
    );
}

async function reviewsOf(bookingId: string) {
  return db
    .select()
    .from(sessionReviews)
    .where(eq(sessionReviews.bookingId, bookingId));
}

describe("صف بررسی جلسه‌های برگزارنشده", () => {
  it("عدم حضور استاد پرونده باز می‌کند", async () => {
    const booking = await confirmedBooking();
    await joinVerified(booking, fixture.studentId, booking.scheduledAt);

    const result = await runSessionClose(afterGrace(booking));

    expect(result.reviewsOpened).toBe(1);

    const reviews = await reviewsOf(booking.id);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({
      reason: "NO_SHOW_TEACHER",
      status: "OPEN",
      resolvedAt: null,
    });
  });

  it("«هیچ‌کس نیامد» هم پرونده باز می‌کند", async () => {
    const booking = await confirmedBooking();

    await runSessionClose(afterGrace(booking));

    expect(await reviewsOf(booking.id)).toMatchObject([{ reason: "NO_SHOW" }]);
  });

  /**
   * دو حالتی که تکلیفشان روشن است نباید صف را شلوغ کنند. صفی که همه‌چیز
   * در آن می‌ریزد، همان فهرست بی‌فایده‌ای است که این ماژول جایگزینش کرد.
   */
  it("جلسه‌ی برگزارشده و عدم حضور هنرجو پرونده نمی‌سازند", async () => {
    const held = await confirmedBooking(17);
    await join(held.id, fixture.teacherUserId, held.scheduledAt);
    await join(held.id, fixture.studentId, held.scheduledAt);

    const studentAbsent = await confirmedBooking(18);
    await join(studentAbsent.id, fixture.teacherUserId, studentAbsent.scheduledAt);

    const result = await runSessionClose(afterGrace(studentAbsent));

    expect(result.reviewsOpened).toBe(0);
    expect(await reviewsOf(held.id)).toEqual([]);
    expect(await reviewsOf(studentAbsent.id)).toEqual([]);
  });

  /**
   * قلب ایدمپوتنسی صف، و دلیل وجود ایندکس یکتای `booking_id`: جارو هر
   * دقیقه اجرا می‌شود و پرونده تا رسیدگی ادمین باز می‌ماند.
   */
  it("اجرای دوباره‌ی جارو پرونده‌ی دوم و اعلان دوم نمی‌سازد", async () => {
    const booking = await confirmedBooking();
    await join(booking.id, fixture.studentId, booking.scheduledAt);

    const first = await runSessionClose(afterGrace(booking));
    const second = await runSessionClose(afterGrace(booking));

    expect(first.reviewsOpened).toBe(1);
    expect(second.reviewsOpened).toBe(0);
    expect(await reviewsOf(booking.id)).toHaveLength(1);

    const underReview = (await inAppOf(fixture.studentId, booking.id)).filter(
      (row) => row.type === "SESSION_UNDER_REVIEW",
    );
    expect(underReview).toHaveLength(1);
  });

  it("هنرجو خبردار می‌شود که استاد نیامد و پول برگشت", async () => {
    const booking = await confirmedBooking();
    await joinVerified(booking, fixture.studentId, booking.scheduledAt);

    await runSessionClose(afterGrace(booking));

    const [review] = (await inAppOf(fixture.studentId, booking.id)).filter(
      (row) => row.type === "SESSION_UNDER_REVIEW",
    );

    expect(review).toBeDefined();
    expect((review!.payload as { message: string }).message).toContain("برگشت");
  });
});

// ---------------------------------------------------------------------------
// حضورِ تأییدشده در برابر حضورِ ادعاشده
// ---------------------------------------------------------------------------

/**
 * چیزی که این بخش نگه می‌دارد، تنها جایی است که دروغ گفتن سود مالی
 * داشت: استادی که در جلسه حاضر نشده، با یک درخواست از مرورگر خودش را
 * «حاضر» ثبت می‌کرد و نتیجه از `NO_SHOW_TEACHER` (بازپرداخت به هنرجو)
 * به `NO_SHOW_STUDENT` (سوختن جلسه، پول پیش خودش) تبدیل می‌شد.
 *
 * حالا تصمیم مالی فقط روی چیزی گرفته می‌شود که سرور جیتسی دیده باشد.
 */
describe("حضور تأییدشده", () => {
  it("ادعای استاد وقتی سرور فقط هنرجو را دیده، جلسه را نمی‌سوزاند", async () => {
    const booking = await confirmedBooking();

    // هنرجو واقعاً آمد — سرور دیدش
    await joinVerified(booking, fixture.studentId, booking.scheduledAt);
    // استاد نیامد ولی مرورگرش «آمدم» گزارش کرد
    await join(booking.id, fixture.teacherUserId, booking.scheduledAt);

    const result = await runSessionClose(afterGrace(booking));

    expect(result.noShowTeacher).toBe(1);
    expect(result.noShowStudent).toBe(0);
    expect(result.refunded).toBe(1);
    expect(result.unverified).toBe(0);
    expect(await statusOf(booking.id)).toBe("NO_SHOW_TEACHER");
    expect(await refundRowsOf(booking.id)).toHaveLength(1);
  });

  /**
   * قرینه‌ی همان قاعده، و دلیل وجود حالت «تأییدنشده».
   *
   * وقتی هیچ رویداد سرورتأییدی نرسیده، «هوک نصب نیست» و «هنرجو خودش را
   * حاضر جا زده تا پول جلسه‌ی نرفته را پس بگیرد» از بیرون یک شکل دارند.
   * پس نتیجه ثبت می‌شود ولی پول تکان نمی‌خورد.
   */
  it("بدون تأیید سرور، عدم حضور استاد بازپرداخت خودکار نمی‌گیرد", async () => {
    const booking = await confirmedBooking();
    await join(booking.id, fixture.studentId, booking.scheduledAt);

    const result = await runSessionClose(afterGrace(booking));

    expect(result.noShowTeacher).toBe(1);
    expect(result.refunded).toBe(0);
    expect(result.unverified).toBe(1);
    expect(await refundRowsOf(booking.id)).toHaveLength(0);

    expect(await reviewsOf(booking.id)).toMatchObject([
      { reason: "ATTENDANCE_UNVERIFIED", status: "OPEN" },
    ]);
  });

  /**
   * نبودنِ هوک نباید به یک صفِ ادمینِ پر از جلسه‌ی سالم ترجمه شود.
   *
   * تا وقتی ماژول prosody نصب نشده، **همه‌ی** جلسه‌ها تأییدنشده‌اند. اگر
   * هر جلسه‌ی تأییدنشده‌ای پرونده می‌ساخت، صف از چیزهایی پر می‌شد که
   * هیچ تصمیمی نمی‌خواهند و پرونده‌های واقعی زیرشان گم می‌شدند.
   */
  it("جلسه‌ی برگزارشده‌ی تأییدنشده نه پرونده می‌سازد نه شمرده می‌شود", async () => {
    const booking = await confirmedBooking();
    await join(booking.id, fixture.teacherUserId, booking.scheduledAt);
    await join(booking.id, fixture.studentId, booking.scheduledAt);

    const result = await runSessionClose(afterGrace(booking));

    expect(result.completed).toBe(1);
    expect(result.unverified).toBe(0);
    expect(result.reviewsOpened).toBe(0);
    expect(await reviewsOf(booking.id)).toEqual([]);
  });

  /**
   * رویدادِ سرور علاوه بر ستون تأیید، خودِ جلسه را هم جلو می‌برد.
   *
   * وگرنه جلسه‌ای که هر دو طرفش آمده‌اند ولی گزارش مرورگرشان گم شده،
   * تا لحظه‌ی بسته شدن `CONFIRMED` می‌ماند و در «کلاس‌های پیش رو» به
   * نظر می‌رسد هنوز شروع نشده.
   */
  it("رویداد سرور جلسه را IN_PROGRESS می‌کند", async () => {
    const booking = await confirmedBooking();

    await joinVerified(booking, fixture.teacherUserId, booking.scheduledAt);

    expect(await statusOf(booking.id)).toBe("IN_PROGRESS");
  });

  /** تلاش مجدد prosody نباید سطر دوم بسازد — کلید یکتای تحویل. */
  it("رویداد تکراری دوباره ثبت نمی‌شود", async () => {
    const booking = await confirmedBooking();

    await joinVerified(booking, fixture.studentId, booking.scheduledAt);
    const again = await recordHookAttendance({
      roomName: booking.roomId,
      userId: fixture.studentId,
      event: "JOINED",
      reportedAt: booking.scheduledAt,
      occupantJid: null,
      now: new Date(booking.scheduledAt.getTime() + 5_000),
    });

    expect(again.outcome).toBe("DUPLICATE");
  });

  it("اتاق ناشناس و کاربر غیرطرفِ رزرو رد می‌شوند", async () => {
    const booking = await confirmedBooking();

    const unknownRoom = await recordHookAttendance({
      roomName: "0d1f4e3a-0000-4000-8000-000000000000",
      userId: fixture.studentId,
      event: "JOINED",
      reportedAt: null,
      occupantJid: null,
      now: booking.scheduledAt,
    });

    const outsider = await recordHookAttendance({
      roomName: booking.roomId,
      userId: fixture.otherStudentId,
      event: "JOINED",
      reportedAt: null,
      occupantJid: null,
      now: booking.scheduledAt,
    });

    expect(unknownRoom.outcome).toBe("UNKNOWN_ROOM");
    expect(outsider.outcome).toBe("NOT_PARTICIPANT");
  });
});

describe("اعلان رویدادهای رزرو", () => {
  it("پرداخت موفق هر دو طرف را خبر می‌کند", async () => {
    const booking = await confirmedBooking();

    const student = await inAppOf(fixture.studentId, booking.id);
    const teacher = await inAppOf(fixture.teacherUserId, booking.id);

    expect(student).toHaveLength(1);
    expect(teacher).toHaveLength(1);
    expect(student[0]!.type).toBe("BOOKING_CONFIRMED");
    expect(teacher[0]!.type).toBe("BOOKING_CONFIRMED");

    // ساعت دیواری تهران در متن است، نه UTC — جلسه ۱۷:۰۰ تهران است
    expect((student[0]!.payload as { message: string }).message).toContain("17:00");
    expect((teacher[0]!.payload as { message: string }).message).toContain("هنرجوی الف");
  });

  /**
   * کاربر صفحه‌ی بازگشت از درگاه را رفرش می‌کند و درگاه هم می‌تواند
   * دوباره بفرستد. تأیید ایدمپوتنت است، پس اعلانش هم باید باشد — وگرنه
   * هر رفرش یک «جلسه‌ات قطعی شد» تازه می‌سازد.
   */
  it("تأیید دوباره‌ی همان پرداخت اعلان دوم نمی‌سازد", async () => {
    const booking = await createSingleBooking({
      studentId: fixture.studentId,
      teacherProfileId: fixture.teacherProfileId,
      offeringId: fixture.offeringId,
      scheduledAt: slotAt(19),
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

    for (let i = 0; i < 3; i += 1) {
      await settleOrder({ authority: order!.authority!, gateway, now: NOW });
    }

    expect(await inAppOf(fixture.studentId, booking.id)).toHaveLength(1);
  });

  it("لغو فقط طرف مقابل را خبر می‌کند", async () => {
    const booking = await confirmedBooking();

    await cancelBooking({
      bookingId: booking.id,
      actorId: fixture.studentId,
      now: NOW,
    });

    const cancelled = (row: { type: string }) => row.type === "BOOKING_CANCELLED";

    const teacher = (await inAppOf(fixture.teacherUserId, booking.id)).filter(cancelled);
    const student = (await inAppOf(fixture.studentId, booking.id)).filter(cancelled);

    expect(teacher).toHaveLength(1);
    expect((teacher[0]!.payload as { message: string }).message).toContain("هنرجوی الف");

    // کسی که خودش لغو کرده، لازم نیست خبردار شود
    expect(student).toHaveLength(0);
  });

  it("لغو توسط استاد، هنرجو را خبر می‌کند", async () => {
    const booking = await confirmedBooking();

    await cancelBooking({
      bookingId: booking.id,
      actorId: fixture.teacherUserId,
      now: NOW,
    });

    const student = (await inAppOf(fixture.studentId, booking.id)).filter(
      (row) => row.type === "BOOKING_CANCELLED",
    );

    expect(student).toHaveLength(1);
    expect((student[0]!.payload as { message: string }).message).toContain("استاد رضایی");
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
      .where(reminderRowsOf(booking.id));

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
      .where(reminderRowsOf(booking.id));

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
      .where(reminderRowsOf(booking.id));

    expect(rows.every((row) => row.status === "FAILED")).toBe(true);
    expect(rows[0]?.error).toContain("پنل پیامک");
  });
});
