import { describe, expect, it } from "vitest";

import type { PracticeItem } from "./app-api";
import { buildPracticeSections, practiceSectionFor, practiceStateLabel } from "./practice-presentation";

const item = (overrides: Partial<PracticeItem> = {}): PracticeItem => ({
  id: "assignment-1",
  title: "آرپژ",
  description: null,
  dueDate: null,
  status: "ASSIGNED",
  completedAt: null,
  createdAt: "2026-08-20T10:00:00.000Z",
  role: "STUDENT",
  bookingId: "booking-1",
  scheduledAt: "2026-08-19T14:30:00.000Z",
  instrumentName: "گیتار کلاسیک",
  counterpartName: "نگار",
  counterpartAvatarUrl: null,
  latestSubmission: null,
  ...overrides,
});

describe("نمایش تمرین هنرجو", () => {
  it.each([
    ["ASSIGNED", "ACTIVE"],
    ["SUBMITTED", "WAITING"],
    ["REVIEWED", "FEEDBACK"],
  ] as const)("حالت %s بدون تکمیل دستی را درست گروه می‌کند", (status, expected) => {
    expect(practiceSectionFor(item({ status }))).toBe(expected);
  });

  it.each(["ASSIGNED", "SUBMITTED", "REVIEWED"] as const)(
    "تکمیل دستی را مستقل از حالت %s به تاریخچه می‌برد",
    (status) => {
      expect(practiceSectionFor(item({ status, completedAt: "2026-08-30T10:00:00Z" }))).toBe(
        "COMPLETED",
      );
    },
  );

  it("پس از برداشتن تیک، حالت واقعی ارسال دوباره دیده می‌شود", () => {
    const submitted = item({ status: "SUBMITTED", completedAt: null });
    expect(practiceSectionFor(submitted)).toBe("WAITING");
    expect(practiceStateLabel(submitted)).toBe("ارسال شد");
  });

  it("آیتم نقش استاد را وارد دنیای هنرجو نمی‌کند", () => {
    expect(buildPracticeSections([item({ role: "TEACHER" })])).toEqual([]);
  });
});
