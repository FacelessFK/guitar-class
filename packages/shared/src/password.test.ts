import { describe, expect, it } from "vitest";

import {
  PASSWORD_POLICY,
  checkPassword,
  passwordProblemMessage,
} from "./password";

describe("قاعده‌ی رمز عبور", () => {
  it("رمز خالی را رد می‌کند", () => {
    expect(checkPassword("")).toBe("EMPTY");
  });

  it("کوتاه‌تر از حداقل را رد می‌کند", () => {
    expect(checkPassword("a".repeat(PASSWORD_POLICY.MIN_LENGTH - 1))).toBe("TOO_SHORT");
  });

  it("دقیقاً به اندازه‌ی حداقل را می‌پذیرد", () => {
    expect(checkPassword("a".repeat(PASSWORD_POLICY.MIN_LENGTH))).toBeNull();
  });

  it("بلندتر از سقف را رد می‌کند", () => {
    expect(checkPassword("a".repeat(PASSWORD_POLICY.MAX_LENGTH + 1))).toBe("TOO_LONG");
  });

  /**
   * فاصله بخشی از رمز است.
   *
   * اگر trim می‌شد، رمزی که کاربر ساخته با رمزی که ذخیره شده فرق
   * می‌کرد و ورود بعدی‌اش بی‌دلیل شکست می‌خورد.
   */
  it("فاصله را حذف نمی‌کند و به‌عنوان کاراکتر می‌شمارد", () => {
    expect(checkPassword("  ab  ")).toBe("TOO_SHORT");
    expect(checkPassword(" ".repeat(PASSWORD_POLICY.MIN_LENGTH))).toBeNull();
  });

  it("پیام خطا برای رمز سالم null است", () => {
    expect(passwordProblemMessage("hunter2!hunter2")).toBeNull();
    expect(passwordProblemMessage("kotah")).toContain("حداقل");
  });
});
