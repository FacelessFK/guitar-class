import { describe, expect, it } from "vitest";

import { formatJalaliShort, formatTehranJalaliShort } from "./format";

describe("قالب‌بندی تاریخ تهران", () => {
  it("لحظه‌ی نزدیک نیمه‌شب را با روز تقویمی تهران نمایش می‌دهد", () => {
    const afterTehranMidnight = "2026-08-31T21:00:00.000Z";

    expect(formatTehranJalaliShort(afterTehranMidnight)).toBe(
      formatJalaliShort("2026-09-01"),
    );
    expect(formatTehranJalaliShort(afterTehranMidnight)).not.toBe(
      formatJalaliShort("2026-08-31"),
    );
  });
});
