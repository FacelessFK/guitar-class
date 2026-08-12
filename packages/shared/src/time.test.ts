import { describe, expect, it } from "vitest";
import {
  TEHRAN_OFFSET_MINUTES,
  Weekday,
  addDaysToDateKey,
  dateKeyRange,
  formatMinutes,
  fromTehranWallClock,
  parseTimeToMinutes,
  tehranDateKey,
  tehranMinutesOfDay,
  tehranWeekday,
  weekdayOfDateKey,
} from "./time";

describe("آفست ثابت تهران", () => {
  /**
   * محافظ در برابر تغییر قانون: کل محاسبات بر این فرض بنا شده که ایران
   * ساعت تابستانی ندارد و آفست همیشه +۰۳:۳۰ است. اگر روزی این قانون
   * برگردد، پایگاه‌داده‌ی منطقه‌ی زمانی سیستم به‌روز می‌شود و این تست
   * می‌شکند — که دقیقاً هدف است.
   */
  it("با پایگاه‌داده‌ی منطقه‌ی زمانی سیستم در طول سال یکی است", () => {
    const samples = [
      "2026-01-15T12:00:00Z",
      "2026-03-25T12:00:00Z",
      "2026-06-21T12:00:00Z",
      "2026-08-10T12:00:00Z",
      "2026-11-05T12:00:00Z",
    ];

    for (const sample of samples) {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Tehran",
        timeZoneName: "longOffset",
      });
      const rendered = formatter.format(new Date(sample));
      const match = rendered.match(/GMT([+-])(\d{2}):(\d{2})/);
      expect(match, `آفست برای ${sample} خوانده نشد`).not.toBeNull();

      const sign = match![1] === "-" ? -1 : 1;
      const offsetMinutes = sign * (Number(match![2]) * 60 + Number(match![3]));
      expect(offsetMinutes, `آفست تهران در ${sample} تغییر کرده`).toBe(
        TEHRAN_OFFSET_MINUTES,
      );
    }
  });
});

describe("روز هفته‌ی ایرانی", () => {
  it("شنبه را صفر می‌گیرد، نه یک‌شنبه را", () => {
    // ۱۵ اوت ۲۰۲۶ شنبه است
    expect(weekdayOfDateKey("2026-08-15")).toBe(Weekday.SATURDAY);
    expect(weekdayOfDateKey("2026-08-16")).toBe(Weekday.SUNDAY);
    expect(weekdayOfDateKey("2026-08-21")).toBe(Weekday.FRIDAY);
  });

  it("برای یک لحظه‌ی UTC بر اساس تقویم تهران حساب می‌کند", () => {
    // ۲۱:۳۰ به وقت UTC روز جمعه، در تهران یعنی ۰۱:۰۰ بامداد شنبه
    const lateFriday = new Date("2026-08-14T21:30:00Z");
    expect(tehranWeekday(lateFriday)).toBe(Weekday.SATURDAY);
    expect(tehranDateKey(lateFriday)).toBe("2026-08-15");
  });
});

describe("تبدیل ساعت دیواری تهران", () => {
  it("۱۶:۰۰ تهران برابر ۱۲:۳۰ یو‌تی‌سی است", () => {
    const utc = fromTehranWallClock("2026-08-15", 16 * 60);
    expect(utc.toISOString()).toBe("2026-08-15T12:30:00.000Z");
  });

  it("رفت و برگشت اطلاعات را از دست نمی‌دهد", () => {
    const utc = fromTehranWallClock("2026-08-15", 17 * 60 + 45);
    expect(tehranDateKey(utc)).toBe("2026-08-15");
    expect(tehranMinutesOfDay(utc)).toBe(17 * 60 + 45);
  });

  it("سرریز به روز بعد را درست مدیریت می‌کند", () => {
    // ۲۵:۰۰ یعنی ۰۱:۰۰ بامداد روز بعد — برای جلسه‌ای که از نیمه‌شب رد شود
    const utc = fromTehranWallClock("2026-08-15", 25 * 60);
    expect(tehranDateKey(utc)).toBe("2026-08-16");
    expect(tehranMinutesOfDay(utc)).toBe(60);
  });
});

describe("کار با کلید تاریخ", () => {
  it("روز اضافه می‌کند و از مرز ماه رد می‌شود", () => {
    expect(addDaysToDateKey("2026-08-29", 7)).toBe("2026-09-05");
    expect(addDaysToDateKey("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("بازه‌ی تاریخ را شامل هر دو سر می‌سازد", () => {
    expect(dateKeyRange("2026-08-15", "2026-08-18")).toEqual([
      "2026-08-15",
      "2026-08-16",
      "2026-08-17",
      "2026-08-18",
    ]);
  });
});

describe("قالب‌بندی ساعت", () => {
  it("دقیقه را به ساعت خوانا تبدیل می‌کند", () => {
    expect(formatMinutes(990)).toBe("16:30");
    expect(formatMinutes(0)).toBe("00:00");
  });

  it("ساعت خوانا را به دقیقه برمی‌گرداند", () => {
    expect(parseTimeToMinutes("16:30")).toBe(990);
  });

  it("ساعت نامعتبر را رد می‌کند", () => {
    expect(() => parseTimeToMinutes("25:00")).toThrow();
    expect(() => parseTimeToMinutes("چرند")).toThrow();
  });
});
