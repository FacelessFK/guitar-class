import { describe, expect, it } from "vitest";
import {
  TEHRAN_OFFSET_MINUTES,
  Weekday,
  addDaysToDateKey,
  dateKeyRange,
  formatMinutes,
  fromTehranWallClock,
  parseTimeToMinutes,
  persianDateOf,
  previousPersianMonthRange,
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

describe("تقویم شمسی", () => {
  /**
   * چند نقطه‌ی مرجع که مستقل قابل بررسی‌اند: اول فروردین همیشه حوالی
   * ۲۰ یا ۲۱ مارس است، و اول مهر حوالی ۲۳ سپتامبر.
   */
  it("تاریخ میلادی را به شمسی برمی‌گرداند", () => {
    expect(persianDateOf("2026-03-21")).toEqual({ year: 1405, month: 1, day: 1 });
    expect(persianDateOf("2026-08-12")).toEqual({ year: 1405, month: 5, day: 21 });
    expect(persianDateOf("2026-09-23")).toEqual({ year: 1405, month: 7, day: 1 });
  });
});

describe("بازه‌ی ماه شمسیِ پیشین", () => {
  /**
   * ماه‌های اول سال ۳۱ روزه‌اند. از میانه‌ی مرداد، ماه پیش تیر است:
   * ۱ تیر ۱۴۰۵ تا ۳۱ تیر ۱۴۰۵.
   */
  it("ماه ۳۱ روزه را کامل می‌گیرد", () => {
    const range = previousPersianMonthRange("2026-08-12");

    expect(persianDateOf(range.start)).toEqual({ year: 1405, month: 4, day: 1 });
    expect(persianDateOf(range.end)).toEqual({ year: 1405, month: 4, day: 31 });
  });

  /** ماه‌های دوم سال ۳۰ روزه‌اند — آبان اینجا. */
  it("ماه ۳۰ روزه را کامل می‌گیرد", () => {
    const range = previousPersianMonthRange("2026-12-10");

    expect(persianDateOf(range.start)).toEqual({ year: 1405, month: 8, day: 1 });
    expect(persianDateOf(range.end)).toEqual({ year: 1405, month: 8, day: 30 });
  });

  /**
   * اسفند: ۲۹ روز در سال عادی و ۳۰ روز در کبیسه. طول ماه از تقویم
   * درمی‌آید نه از جدولی که ما نوشته باشیم، پس هر دو باید درست شوند.
   */
  it("اسفند را با طول درستش می‌گیرد و از مرز سال رد می‌شود", () => {
    // فروردین ۱۴۰۵ → ماه پیش، اسفند ۱۴۰۴
    const range = previousPersianMonthRange("2026-04-10");

    expect(persianDateOf(range.start)).toEqual({ year: 1404, month: 12, day: 1 });

    const end = persianDateOf(range.end);
    expect(end.year).toBe(1404);
    expect(end.month).toBe(12);
    expect([29, 30]).toContain(end.day);
  });

  /** روز اولِ ماه هم باید همان ماه پیش را بدهد، نه ماه خودش. */
  it("در روز اول ماه هم ماه پیش را می‌دهد", () => {
    const firstOfMehr = "2026-09-23";
    expect(persianDateOf(firstOfMehr).day).toBe(1);

    const range = previousPersianMonthRange(firstOfMehr);
    expect(persianDateOf(range.start)).toEqual({ year: 1405, month: 6, day: 1 });
    expect(persianDateOf(range.end)).toEqual({ year: 1405, month: 6, day: 31 });
  });

  /**
   * هر روزِ یک ماه باید **همان** بازه را بدهد.
   *
   * جارو هر شب اجرا می‌شود و اگر بازه در طول ماه جابه‌جا شود، ایندکس
   * یکتای `payouts_one_per_teacher_period` جلویش را نمی‌گیرد و هر شب یک
   * تسویه‌ی تازه ساخته می‌شود.
   */
  it("در تمام روزهای یک ماه، بازه‌ی یکسانی می‌دهد", () => {
    const dates = dateKeyRange("2026-08-23", "2026-09-22");
    const ranges = new Set(
      dates.map((date) => {
        const range = previousPersianMonthRange(date);
        return `${range.start}..${range.end}`;
      }),
    );

    expect(persianDateOf("2026-08-23").month).toBe(6);
    expect(persianDateOf("2026-09-22").month).toBe(6);
    expect(ranges.size).toBe(1);
  });
});
