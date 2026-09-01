import { describe, expect, it } from "vitest";

import type { BookingDetail } from "./app-api";
import { splitTeacherBookings } from "./teacher-dashboard";

function booking(
  id: string,
  role: BookingDetail["role"],
  status: BookingDetail["status"],
  scheduledAt: string,
): BookingDetail {
  return {
    id,
    role,
    status,
    scheduledAt,
    endsAt: scheduledAt,
    roomId: `room-${id}`,
    type: "SINGLE",
    date: scheduledAt.slice(0, 10),
    startTime: "16:00",
    endTime: "17:00",
    weekdayName: "شنبه",
    durationMinutes: 60,
    holdExpiresAt: null,
    price: "1000000",
    counterpartName: "نام طرف مقابل",
    teacherSlug: null,
    instrumentName: "گیتار کلاسیک",
    enrollmentId: null,
    sessionIndex: null,
    canReview: false,
  };
}

describe("تفکیک رزروهای داشبورد استاد", () => {
  it("رزرو هنرجویی حساب دو‌نقشه را حتی با وضعیت زنده وارد پنل استاد نمی‌کند", () => {
    const result = splitTeacherBookings([
      booking("student", "STUDENT", "CONFIRMED", "2026-09-03T12:30:00.000Z"),
      booking("teacher", "TEACHER", "PENDING_PAYMENT", "2026-09-02T12:30:00.000Z"),
    ]);

    expect(result.upcoming.map((item) => item.id)).toEqual(["teacher"]);
  });

  it("وضعیت‌های زنده را صعودی و وضعیت‌های نهایی را نزولی مرتب می‌کند", () => {
    const result = splitTeacherBookings([
      booking("past-old", "TEACHER", "COMPLETED", "2026-08-01T12:30:00.000Z"),
      booking("next-later", "TEACHER", "CONFIRMED", "2026-09-05T12:30:00.000Z"),
      booking("past-new", "TEACHER", "CANCELLED_BY_STUDENT", "2026-08-08T12:30:00.000Z"),
      booking("next-first", "TEACHER", "IN_PROGRESS", "2026-09-01T12:30:00.000Z"),
    ]);

    expect(result.upcoming.map((item) => item.id)).toEqual(["next-first", "next-later"]);
    expect(result.past.map((item) => item.id)).toEqual(["past-new", "past-old"]);
  });
});
