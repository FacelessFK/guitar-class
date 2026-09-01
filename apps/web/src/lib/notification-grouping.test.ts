import { describe, expect, it } from "vitest";

import type { AppNotification } from "./app-api";
import { groupNotifications, notificationGroupFor } from "./notification-grouping";

const note = (createdAt: string): AppNotification => ({
  id: createdAt,
  type: "BOOKING_CONFIRMED",
  message: "کلاس تأیید شد.",
  href: "/dashboard",
  bookingId: "booking-1",
  read: false,
  createdAt,
});

describe("گروه‌بندی تاریخ اعلان", () => {
  const now = new Date("2026-08-31T08:00:00.000Z"); // دوشنبه ۹ شهریور، تهران

  it("مرز روز را با وقت تهران می‌سنجد", () => {
    expect(notificationGroupFor(note("2026-08-30T20:45:00.000Z"), now)).toBe("TODAY");
  });

  it("روزهای قبل در هفته‌ی ایرانی جاری را این هفته می‌گذارد", () => {
    expect(notificationGroupFor(note("2026-08-29T10:00:00.000Z"), now)).toBe("THIS_WEEK");
  });

  it("هفته‌های قبل را قدیمی‌تر می‌گذارد و گروه خالی نمی‌سازد", () => {
    const groups = groupNotifications([note("2026-08-20T10:00:00.000Z")], now);
    expect(groups.map((group) => group.key)).toEqual(["OLDER"]);
  });
});
