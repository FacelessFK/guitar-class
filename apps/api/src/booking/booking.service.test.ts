import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { fromTehranWallClock, tehranMinutesOfDay } from "@music/shared";

import { db } from "../db/client.js";
import { bookings, enrollments } from "../db/schema/index.js";
import {
  cancelBooking,
  confirmBookings,
  createPackageEnrollment,
  createSingleBooking,
  createTrialBooking,
  expireStaleHolds,
} from "./booking.service.js";
import {
  BookingNotCancellableError,
  NotBookingParticipantError,
  PackageConflictError,
  SlotUnavailableError,
  StudentBusyError,
  TrialAlreadyUsedError,
} from "./errors.js";
import { closeDatabase, resetDatabase, seedFixture, type Fixture } from "../test/fixtures.js";

/**
 * تست‌های یکپارچگی سرویس رزرو، روی پستگرس واقعی.
 *
 * قید `EXCLUDE` دیتابیس تنها لایه‌ای است که در برابر شرط رقابتی مصون
 * است، و آن را با هیچ ماکی نمی‌شود اثبات کرد. برای همین این تست‌ها به
 * دیتابیس واقعی نیاز دارند: `pnpm dev:infra && pnpm db:migrate`
 */

/** ۱۵ اوت ۲۰۲۶ شنبه است — اولین روز هفته در تقویم ایرانی. */
const SATURDAY = "2026-08-15";
/** لحظه‌ی مرجع، خیلی جلوتر از جلسات تا محدودیت «حداقل فاصله» دخالت نکند. */
const NOW = new Date("2026-08-01T00:00:00Z");

function slotAt(dateKey: string, hour: number): Date {
  return fromTehranWallClock(dateKey, hour * 60);
}

let fixture: Fixture;

beforeEach(async () => {
  await resetDatabase();
  fixture = await seedFixture();
});

afterAll(async () => {
  await closeDatabase();
});

describe("جلسه‌ی تکی", () => {
  it("روی اسلات معتبر با وضعیت انتظار پرداخت ساخته می‌شود", async () => {
    const booking = await createSingleBooking({
      studentId: fixture.studentId,
      teacherProfileId: fixture.teacherProfileId,
      offeringId: fixture.offeringId,
      scheduledAt: slotAt(SATURDAY, 17),
      now: NOW,
    });

    expect(booking.status).toBe("PENDING_PAYMENT");
    expect(booking.holdExpiresAt).not.toBeNull();
    expect(booking.priceSnapshot).toBe(3_000_000n);
    // `endsAt` باید دقیقاً یک ساعت بعد باشد، وگرنه قید دیتابیس رد می‌کرد
    expect(booking.endsAt.getTime() - booking.scheduledAt.getTime()).toBe(3_600_000);
  });

  it("مهلت پرداخت روی رزرو ثبت می‌شود", async () => {
    const booking = await createSingleBooking({
      studentId: fixture.studentId,
      teacherProfileId: fixture.teacherProfileId,
      offeringId: fixture.offeringId,
      scheduledAt: slotAt(SATURDAY, 17),
      now: NOW,
    });

    const holdMinutes =
      (booking.holdExpiresAt!.getTime() - NOW.getTime()) / 60_000;
    expect(holdMinutes).toBe(15);
  });

  it("ساعت خارج از برنامه‌ی استاد را رد می‌کند", async () => {
    await expect(
      createSingleBooking({
        studentId: fixture.studentId,
        teacherProfileId: fixture.teacherProfileId,
        offeringId: fixture.offeringId,
        scheduledAt: slotAt(SATURDAY, 9),
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(SlotUnavailableError);
  });

  it("ساعتی که سرِ شبکه نیست را رد می‌کند", async () => {
    await expect(
      createSingleBooking({
        studentId: fixture.studentId,
        teacherProfileId: fixture.teacherProfileId,
        offeringId: fixture.offeringId,
        scheduledAt: fromTehranWallClock(SATURDAY, 16 * 60 + 30),
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(SlotUnavailableError);
  });

  it("اسلات پرشده را برای هنرجوی دیگر رد می‌کند", async () => {
    await createSingleBooking({
      studentId: fixture.studentId,
      teacherProfileId: fixture.teacherProfileId,
      offeringId: fixture.offeringId,
      scheduledAt: slotAt(SATURDAY, 17),
      now: NOW,
    });

    await expect(
      createSingleBooking({
        studentId: fixture.otherStudentId,
        teacherProfileId: fixture.teacherProfileId,
        offeringId: fixture.offeringId,
        scheduledAt: slotAt(SATURDAY, 17),
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(SlotUnavailableError);
  });

  it("هنرجو نمی‌تواند دو کلاس هم‌زمان داشته باشد", async () => {
    await createSingleBooking({
      studentId: fixture.studentId,
      teacherProfileId: fixture.teacherProfileId,
      offeringId: fixture.offeringId,
      scheduledAt: slotAt(SATURDAY, 17),
      now: NOW,
    });

    // همان هنرجو، همان ساعت، ولی از مسیر مستقیم دیتابیس تا بررسی
    // پیش از درج دور زده شود و قید student_overlap سنجیده شود
    await expect(
      db.insert(bookings).values({
        studentId: fixture.studentId,
        teacherId: fixture.teacherUserId,
        offeringId: fixture.offeringId,
        type: "SINGLE",
        scheduledAt: slotAt(SATURDAY, 17),
        endsAt: slotAt(SATURDAY, 18),
        durationMinutes: 60,
        status: "CONFIRMED",
        priceSnapshot: 3_000_000n,
        commissionSnapshot: "20",
      }),
    ).rejects.toThrow();
  });
});

describe("شرط رقابتی", () => {
  /**
   * مهم‌ترین تست این فایل.
   *
   * دو درخواست کاملاً هم‌زمان برای یک اسلات. بررسی پیش از درج هر دو را
   * «آزاد» می‌بیند، چون هنوز هیچ‌کدام چیزی ننوشته‌اند. فقط قید
   * `EXCLUDE` پستگرس می‌تواند جلوی رزرو دوتایی را بگیرد.
   */
  it("از دو رزرو هم‌زمان روی یک اسلات، دقیقاً یکی موفق می‌شود", async () => {
    const scheduledAt = slotAt(SATURDAY, 18);

    const results = await Promise.allSettled([
      createSingleBooking({
        studentId: fixture.studentId,
        teacherProfileId: fixture.teacherProfileId,
        offeringId: fixture.offeringId,
        scheduledAt,
        now: NOW,
      }),
      createSingleBooking({
        studentId: fixture.otherStudentId,
        teacherProfileId: fixture.teacherProfileId,
        offeringId: fixture.offeringId,
        scheduledAt,
        now: NOW,
      }),
    ]);

    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    // بازنده باید پیام قابل فهم بگیرد، نه خطای خام دیتابیس
    expect((failed[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      SlotUnavailableError,
    );

    const stored = await db.select().from(bookings);
    expect(stored).toHaveLength(1);
  });
});

describe("جلسه‌ی معارفه‌ی رایگان", () => {
  it("رایگان و مستقیماً قطعی ساخته می‌شود", async () => {
    const booking = await createTrialBooking({
      studentId: fixture.studentId,
      teacherProfileId: fixture.teacherProfileId,
      offeringId: fixture.offeringId,
      scheduledAt: slotAt(SATURDAY, 16),
      now: NOW,
    });

    expect(booking.status).toBe("CONFIRMED");
    expect(booking.priceSnapshot).toBe(0n);
    expect(booking.holdExpiresAt).toBeNull();
    // طول جلسه‌ی معارفه ۲۰ دقیقه است، نه ۶۰
    expect(booking.endsAt.getTime() - booking.scheduledAt.getTime()).toBe(1_200_000);
  });

  it("بار دوم برای همان کاربر رد می‌شود، حتی با استاد دیگر", async () => {
    await createTrialBooking({
      studentId: fixture.studentId,
      teacherProfileId: fixture.teacherProfileId,
      offeringId: fixture.offeringId,
      scheduledAt: slotAt(SATURDAY, 16),
      now: NOW,
    });

    await expect(
      createTrialBooking({
        studentId: fixture.studentId,
        teacherProfileId: fixture.teacherProfileId,
        offeringId: fixture.offeringId,
        scheduledAt: slotAt(SATURDAY, 17),
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(TrialAlreadyUsedError);
  });

  it("دو درخواست هم‌زمان تریال، فقط یکی را می‌گیرد", async () => {
    const results = await Promise.allSettled([
      createTrialBooking({
        studentId: fixture.studentId,
        teacherProfileId: fixture.teacherProfileId,
        offeringId: fixture.offeringId,
        scheduledAt: slotAt(SATURDAY, 16),
        now: NOW,
      }),
      createTrialBooking({
        studentId: fixture.studentId,
        teacherProfileId: fixture.teacherProfileId,
        offeringId: fixture.offeringId,
        scheduledAt: slotAt(SATURDAY, 18),
        now: NOW,
      }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
});

describe("پکیج ماهانه", () => {
  it("چهار جلسه‌ی هفتگی در یک تراکنش می‌سازد", async () => {
    const result = await createPackageEnrollment({
      studentId: fixture.studentId,
      teacherProfileId: fixture.teacherProfileId,
      offeringId: fixture.offeringId,
      firstSessionDate: SATURDAY,
      startMinute: 17 * 60,
      now: NOW,
    });

    expect(result.bookings).toHaveLength(4);
    expect(result.priceTotal).toBe(12_000_000n);

    const dates = result.bookings
      .map((b) => b.scheduledAt.toISOString().slice(0, 10))
      .sort();
    expect(dates).toEqual(["2026-08-15", "2026-08-22", "2026-08-29", "2026-09-05"]);
  });

  it("همه‌ی جلسات سرِ ساعت ثابت هستند", async () => {
    const result = await createPackageEnrollment({
      studentId: fixture.studentId,
      teacherProfileId: fixture.teacherProfileId,
      offeringId: fixture.offeringId,
      firstSessionDate: SATURDAY,
      startMinute: 17 * 60,
      now: NOW,
    });

    for (const booking of result.bookings) {
      expect(tehranMinutesOfDay(booking.scheduledAt)).toBe(17 * 60);
    }
  });

  it("تداخل در یک هفته، کل پکیج را رول‌بک می‌کند", async () => {
    // هفته‌ی سوم را با یک رزرو تکی اشغال می‌کنیم
    await createSingleBooking({
      studentId: fixture.otherStudentId,
      teacherProfileId: fixture.teacherProfileId,
      offeringId: fixture.offeringId,
      scheduledAt: slotAt("2026-08-29", 17),
      now: NOW,
    });

    await expect(
      createPackageEnrollment({
        studentId: fixture.studentId,
        teacherProfileId: fixture.teacherProfileId,
        offeringId: fixture.offeringId,
        firstSessionDate: SATURDAY,
        startMinute: 17 * 60,
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(PackageConflictError);

    // هیچ ثبت‌نامی نباید ساخته شده باشد، و تنها رزرو موجود همان
    // رزرو تکی اولیه است — نه سه جلسه‌ی نیمه‌کاره
    expect(await db.select().from(enrollments)).toHaveLength(0);
    expect(await db.select().from(bookings)).toHaveLength(1);
  });

  it("می‌گوید دقیقاً کدام هفته مشکل دارد", async () => {
    await createSingleBooking({
      studentId: fixture.otherStudentId,
      teacherProfileId: fixture.teacherProfileId,
      offeringId: fixture.offeringId,
      scheduledAt: slotAt("2026-08-29", 17),
      now: NOW,
    });

    try {
      await createPackageEnrollment({
        studentId: fixture.studentId,
        teacherProfileId: fixture.teacherProfileId,
        offeringId: fixture.offeringId,
        firstSessionDate: SATURDAY,
        startMinute: 17 * 60,
        now: NOW,
      });
      expect.unreachable("باید خطا می‌داد");
    } catch (error) {
      expect(error).toBeInstanceOf(PackageConflictError);
      const conflict = error as PackageConflictError;
      expect(conflict.conflicts).toHaveLength(1);
      expect(conflict.conflicts[0]?.index).toBe(3);
      expect(conflict.conflicts[0]?.date).toBe("2026-08-29");
    }
  });
});

describe("انقضای مهلت پرداخت", () => {
  it("رزرو پرداخت‌نشده را منقضی می‌کند و اسلات را آزاد می‌کند", async () => {
    await createSingleBooking({
      studentId: fixture.studentId,
      teacherProfileId: fixture.teacherProfileId,
      offeringId: fixture.offeringId,
      scheduledAt: slotAt(SATURDAY, 17),
      now: NOW,
    });

    const expiredCount = await expireStaleHolds(new Date(NOW.getTime() + 16 * 60_000));
    expect(expiredCount).toBe(1);

    // حالا هنرجوی دیگری می‌تواند همان اسلات را بگیرد
    const rebooked = await createSingleBooking({
      studentId: fixture.otherStudentId,
      teacherProfileId: fixture.teacherProfileId,
      offeringId: fixture.offeringId,
      scheduledAt: slotAt(SATURDAY, 17),
      now: NOW,
    });
    expect(rebooked.status).toBe("PENDING_PAYMENT");
  });

  it("رزرو داخل مهلت را دست نمی‌زند", async () => {
    await createSingleBooking({
      studentId: fixture.studentId,
      teacherProfileId: fixture.teacherProfileId,
      offeringId: fixture.offeringId,
      scheduledAt: slotAt(SATURDAY, 17),
      now: NOW,
    });

    expect(await expireStaleHolds(new Date(NOW.getTime() + 10 * 60_000))).toBe(0);
  });

  it("رزرو قطعی‌شده دیگر منقضی نمی‌شود", async () => {
    const booking = await createSingleBooking({
      studentId: fixture.studentId,
      teacherProfileId: fixture.teacherProfileId,
      offeringId: fixture.offeringId,
      scheduledAt: slotAt(SATURDAY, 17),
      now: NOW,
    });

    expect(await confirmBookings([booking.id])).toBe(1);
    expect(await expireStaleHolds(new Date(NOW.getTime() + 60 * 60_000))).toBe(0);

    const [stored] = await db
      .select({ status: bookings.status })
      .from(bookings)
      .where(eq(bookings.id, booking.id));
    expect(stored?.status).toBe("CONFIRMED");
  });
});

describe("لغو رزرو", () => {
  async function makeConfirmedBooking() {
    const booking = await createSingleBooking({
      studentId: fixture.studentId,
      teacherProfileId: fixture.teacherProfileId,
      offeringId: fixture.offeringId,
      scheduledAt: slotAt(SATURDAY, 17),
      now: NOW,
    });
    await confirmBookings([booking.id]);
    return booking;
  }

  it("لغو هنرجو بیش از ۲۴ ساعت قبل، جلسه را برمی‌گرداند", async () => {
    const booking = await makeConfirmedBooking();

    const result = await cancelBooking({
      bookingId: booking.id,
      actorId: fixture.studentId,
      now: new Date(booking.scheduledAt.getTime() - 48 * 3_600_000),
    });

    expect(result.status).toBe("CANCELLED_BY_STUDENT");
    expect(result.refundable).toBe(true);
  });

  it("لغو هنرجو کمتر از ۲۴ ساعت قبل، جلسه را می‌سوزاند", async () => {
    const booking = await makeConfirmedBooking();

    const result = await cancelBooking({
      bookingId: booking.id,
      actorId: fixture.studentId,
      now: new Date(booking.scheduledAt.getTime() - 3 * 3_600_000),
    });

    expect(result.refundable).toBe(false);
  });

  it("لغو استاد در هر زمان، جلسه را برمی‌گرداند", async () => {
    const booking = await makeConfirmedBooking();

    const result = await cancelBooking({
      bookingId: booking.id,
      actorId: fixture.teacherUserId,
      now: new Date(booking.scheduledAt.getTime() - 30 * 60_000),
    });

    expect(result.status).toBe("CANCELLED_BY_TEACHER");
    expect(result.refundable).toBe(true);
  });

  it("اسلات را پس از لغو آزاد می‌کند", async () => {
    const booking = await makeConfirmedBooking();
    await cancelBooking({
      bookingId: booking.id,
      actorId: fixture.studentId,
      now: NOW,
    });

    const rebooked = await createSingleBooking({
      studentId: fixture.otherStudentId,
      teacherProfileId: fixture.teacherProfileId,
      offeringId: fixture.offeringId,
      scheduledAt: slotAt(SATURDAY, 17),
      now: NOW,
    });
    expect(rebooked.id).not.toBe(booking.id);
  });

  it("کاربر بی‌ربط نمی‌تواند لغو کند", async () => {
    const booking = await makeConfirmedBooking();

    await expect(
      cancelBooking({
        bookingId: booking.id,
        actorId: fixture.otherStudentId,
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(NotBookingParticipantError);
  });

  it("رزروِ از قبل لغوشده دوباره لغو نمی‌شود", async () => {
    const booking = await makeConfirmedBooking();
    await cancelBooking({ bookingId: booking.id, actorId: fixture.studentId, now: NOW });

    await expect(
      cancelBooking({ bookingId: booking.id, actorId: fixture.studentId, now: NOW }),
    ).rejects.toBeInstanceOf(BookingNotCancellableError);
  });
});
