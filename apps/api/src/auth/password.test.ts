import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password.js";

describe("هش رمز عبور", () => {
  it("رمز درست را می‌پذیرد و غلط را رد می‌کند", async () => {
    const hash = await hashPassword("correct horse battery");

    await expect(verifyPassword("correct horse battery", hash)).resolves.toBe(true);
    await expect(verifyPassword("correct horse batterY", hash)).resolves.toBe(false);
  });

  /**
   * نمک تصادفی است، پس دو حساب با رمز یکسان هم دو هش متفاوت دارند.
   * بدون این، یک نگاه به جدول می‌گوید کدام کاربرها رمز مشترک دارند.
   */
  it("برای یک رمز، دو بار دو هش متفاوت می‌سازد", async () => {
    const first = await hashPassword("same-password");
    const second = await hashPassword("same-password");

    expect(first).not.toBe(second);
    await expect(verifyPassword("same-password", second)).resolves.toBe(true);
  });

  it("پارامترها را داخل خود رشته نگه می‌دارد", async () => {
    const hash = await hashPassword("whatever-goes-here");
    const [algorithm, N, r, p] = hash.split("$");

    expect(algorithm).toBe("scrypt");
    expect(Number(N)).toBe(2 ** 15);
    expect(Number(r)).toBe(8);
    expect(Number(p)).toBe(1);
  });

  /**
   * هشی که با پارامترهای دیگری ساخته شده باید همچنان باز شود.
   *
   * این تنها چیزی است که سخت‌تر کردن پارامترها را در آینده بی‌درد
   * می‌کند: اگر بررسی از ثابت‌های کد می‌خواند نه از خود رشته، روزی که
   * `N` عوض شود همه‌ی رمزهای موجود باطل می‌شدند.
   */
  it("هشِ ساخته‌شده با پارامتر قدیمی‌تر را هم بررسی می‌کند", async () => {
    const { randomBytes, scryptSync } = await import("node:crypto");
    const salt = randomBytes(16);
    const weak = scryptSync("legacy-password", salt, 64, { N: 2 ** 14, r: 8, p: 1 });
    const stored = ["scrypt", 2 ** 14, 8, 1, salt.toString("base64"), weak.toString("base64")].join(
      "$",
    );

    await expect(verifyPassword("legacy-password", stored)).resolves.toBe(true);
  });

  /**
   * حساب بدون رمز (ساخته‌شده از راه کد پیامکی) نباید با هیچ رمزی وارد
   * شود — از جمله رشته‌ی خالی.
   */
  it("حساب بدون رمز را رد می‌کند", async () => {
    await expect(verifyPassword("anything", null)).resolves.toBe(false);
    await expect(verifyPassword("", null)).resolves.toBe(false);
  });

  /**
   * سطر خرابِ دیتابیس باید «رمز غلط» بدهد، نه خطای ۵۰۰ — وگرنه یک
   * مقدار دستکاری‌شده کل اندپوینت ورود را می‌شکند.
   */
  it("هش خراب را بدون پرتاب کردن رد می‌کند", async () => {
    const broken = [
      "",
      "plain-text-password",
      "scrypt$16384$8$1$onlyfiveparts",
      "scrypt$notanumber$8$1$c2FsdA==$aGFzaA==",
      // ‏N توانی از دو نیست
      "scrypt$16383$8$1$c2FsdA==$aGFzaA==",
      // ‏N بزرگِ دستکاری‌شده — نباید گیگابایت حافظه بخواهد، باید false بدهد
      "scrypt$1073741824$8$1$c2FsdA==$aGFzaA==",
      "bcrypt$16384$8$1$c2FsdA==$aGFzaA==",
    ];

    for (const stored of broken) {
      await expect(verifyPassword("anything", stored)).resolves.toBe(false);
    }
  });
});
