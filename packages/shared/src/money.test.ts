import { describe, expect, it } from "vitest";

import { negateSplit, parsePercent, splitCommission, sumRial } from "./money";

describe("خواندن درصد", () => {
  it("عدد صحیح را می‌خواند", () => {
    expect(parsePercent("20")).toBe(2000n);
  });

  it("شکلی که پستگرس برمی‌گرداند را می‌خواند", () => {
    // ستون `numeric(5,2)` همیشه با دو رقم اعشار برمی‌گردد
    expect(parsePercent("20.00")).toBe(2000n);
  });

  it("یک رقم اعشار یعنی دهگان اعشار، نه صدگان", () => {
    expect(parsePercent("20.5")).toBe(2050n);
    expect(parsePercent("20.05")).toBe(2005n);
  });

  it("صفر و صد مجازند", () => {
    expect(parsePercent("0")).toBe(0n);
    expect(parsePercent("100.00")).toBe(10000n);
  });

  it("بیشتر از صد را رد می‌کند", () => {
    expect(() => parsePercent("100.01")).toThrow(RangeError);
  });

  it("ورودی بی‌معنی را رد می‌کند", () => {
    expect(() => parsePercent("")).toThrow(RangeError);
    expect(() => parsePercent("-5")).toThrow(RangeError);
    expect(() => parsePercent("۲۰")).toThrow(RangeError);
  });
});

describe("تقسیم کمیسیون", () => {
  it("۲۰٪ از سه میلیون ریال", () => {
    expect(splitCommission(3_000_000n, "20.00")).toEqual({
      gross: 3_000_000n,
      commission: 600_000n,
      net: 2_400_000n,
    });
  });

  it("جلسه‌ی رایگان چیزی تولید نمی‌کند", () => {
    expect(splitCommission(0n, "20.00")).toEqual({
      gross: 0n,
      commission: 0n,
      net: 0n,
    });
  });

  it("کمیسیون صفر یعنی همه‌اش سهم استاد", () => {
    expect(splitCommission(1_234_567n, "0")).toEqual({
      gross: 1_234_567n,
      commission: 0n,
      net: 1_234_567n,
    });
  });

  /**
   * مهم‌ترین خاصیت: قید `ledger_amounts_balance` در دیتابیس
   * `gross = commission + net` می‌خواهد. اگر دو طرف جداگانه گرد شوند،
   * یک ریال اختلاف کل درج را رد می‌کند.
   */
  it("همیشه تراز می‌ماند، حتی وقتی گرد کردن لازم است", () => {
    const awkward = ["17.50", "33.33", "7.77", "12.34", "99.99", "0.01"];

    for (const rate of awkward) {
      for (const gross of [1n, 7n, 999n, 1_000_001n, 3_333_333n, 987_654_321n]) {
        const split = splitCommission(gross, rate);
        expect(split.commission + split.net).toBe(gross);
        expect(split.commission).toBeGreaterThanOrEqual(0n);
        expect(split.net).toBeGreaterThanOrEqual(0n);
      }
    }
  });

  it("نصف را به بالا گرد می‌کند", () => {
    // ۵٪ از ۱۰ ریال = ۰.۵ ریال
    expect(splitCommission(10n, "5").commission).toBe(1n);
    // ۵٪ از ۹ ریال = ۰.۴۵ ریال
    expect(splitCommission(9n, "5").commission).toBe(0n);
  });

  it("مبلغ ناخالص منفی را رد می‌کند", () => {
    expect(() => splitCommission(-1n, "20")).toThrow(RangeError);
  });

  /**
   * مبالغ بزرگ نباید از دقت خارج شوند. جمع سالانه‌ی یک استاد پرکار
   * از سقف `Number.MAX_SAFE_INTEGER` رد نمی‌شود، ولی جمع کل پلتفرم
   * می‌شود — و همین دلیل `bigint` بودن ستون‌هاست.
   */
  it("مبالغ بزرگ‌تر از سقف امن جاوااسکریپت را درست حساب می‌کند", () => {
    const gross = 9_007_199_254_740_993n; // MAX_SAFE_INTEGER + 2
    const split = splitCommission(gross, "20");
    expect(split.commission + split.net).toBe(gross);
    expect(split.commission).toBe(1_801_439_850_948_199n);
  });
});

describe("قرینه کردن برای بازپرداخت", () => {
  /**
   * بازپرداخت باید درآمد متناظرش را دقیقاً صفر کند. اگر گرد کردن روی
   * مقدار منفی به سمت دیگری می‌رفت، یک ریال در دفتر کل باقی می‌ماند و
   * سال بعد کسی باید دنبالش می‌گشت.
   */
  it("درآمد را دقیقاً خنثی می‌کند", () => {
    const earning = splitCommission(3_333_333n, "17.50");
    const refund = negateSplit(earning);

    expect(earning.gross + refund.gross).toBe(0n);
    expect(earning.commission + refund.commission).toBe(0n);
    expect(earning.net + refund.net).toBe(0n);
  });

  it("خودش هم تراز است", () => {
    const refund = negateSplit(splitCommission(1_000_001n, "33.33"));
    expect(refund.commission + refund.net).toBe(refund.gross);
  });
});

describe("جمع مبالغ", () => {
  it("آرایه‌ی خالی صفر است", () => {
    expect(sumRial([])).toBe(0n);
  });

  it("جمع می‌زند", () => {
    expect(sumRial([1n, 2n, 3n])).toBe(6n);
  });
});
