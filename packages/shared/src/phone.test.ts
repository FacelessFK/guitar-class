import { describe, expect, it } from "vitest";
import {
  isValidIranianMobile,
  maskPhone,
  normalizePhone,
  toLatinDigits,
  toLocalPhone,
} from "./phone";

const CANONICAL = "+989121234567";

describe("تبدیل ارقام فارسی و عربی", () => {
  it("ارقام فارسی را به لاتین تبدیل می‌کند", () => {
    expect(toLatinDigits("۰۹۱۲۱۲۳۴۵۶۷")).toBe("09121234567");
  });

  it("ارقام عربی را هم تبدیل می‌کند", () => {
    expect(toLatinDigits("٠٩١٢١٢٣٤٥٦٧")).toBe("09121234567");
  });

  it("متن غیرعددی را دست نمی‌زند", () => {
    expect(toLatinDigits("شماره ۱۲")).toBe("شماره 12");
  });
});

describe("نرمال‌سازی شماره", () => {
  /**
   * همه‌ی این‌ها یک شماره‌اند. اگر هر کدام به نتیجه‌ی متفاوتی برسد،
   * یک نفر می‌تواند چند حساب بسازد و جلسه‌ی معارفه‌ی رایگان را
   * چند بار بگیرد.
   */
  const equivalentForms = [
    "09121234567",
    "9121234567",
    "+989121234567",
    "00989121234567",
    "989121234567",
    "۰۹۱۲۱۲۳۴۵۶۷",
    "٠٩١٢١٢٣٤٥٦٧",
    "0912 123 4567",
    "0912-123-4567",
    "(0912) 123-4567",
    " 09121234567 ",
  ];

  for (const form of equivalentForms) {
    it(`«${form}» را به صورت متعارف تبدیل می‌کند`, () => {
      expect(normalizePhone(form)).toBe(CANONICAL);
    });
  }

  it("همه‌ی شکل‌ها دقیقاً به یک مقدار می‌رسند", () => {
    const results = new Set(equivalentForms.map((form) => normalizePhone(form)));
    expect(results.size).toBe(1);
  });
});

describe("رد کردن ورودی نامعتبر", () => {
  const invalid = [
    "",
    "12345",
    "02112345678", // تلفن ثابت
    "08121234567", // با ۹ شروع نمی‌شود
    "091212345678", // یک رقم اضافه
    "0912123456", // یک رقم کم
    "abcdefghijk",
    "+9891212345678",
    "+19121234567", // کد کشور دیگر
  ];

  for (const input of invalid) {
    it(`«${input}» را رد می‌کند`, () => {
      expect(normalizePhone(input)).toBeNull();
      expect(isValidIranianMobile(input)).toBe(false);
    });
  }
});

describe("نمایش", () => {
  it("به شکل محلی برمی‌گرداند", () => {
    expect(toLocalPhone(CANONICAL)).toBe("09121234567");
  });

  it("برای لاگ و پیام خطا می‌پوشاند", () => {
    expect(maskPhone(CANONICAL)).toBe("0912***4567");
  });
});
