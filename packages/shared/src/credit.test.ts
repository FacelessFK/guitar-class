import { describe, expect, it } from "vitest";

import {
  MIN_GATEWAY_AMOUNT_RIAL,
  creditBalance,
  isCreditAmountValid,
  splitPayment,
} from "./credit";

describe("موجودی اعتبار", () => {
  it("جمع ساده‌ی سطرهاست", () => {
    expect(
      creditBalance([
        { reason: "CANCELLATION", amount: 3_000_000n },
        { reason: "CANCELLATION", amount: 2_000_000n },
      ]),
    ).toBe(5_000_000n);
  });

  it("خرج سطر منفی است، نه ویرایش سطر اعطا", () => {
    expect(
      creditBalance([
        { reason: "CANCELLATION", amount: 3_000_000n },
        { reason: "SPEND", amount: -1_200_000n },
      ]),
    ).toBe(1_800_000n);
  });

  it("بدون سطر، صفر است", () => {
    expect(creditBalance([])).toBe(0n);
  });

  it("اصلاح منفی ادمین هم در همان جمع می‌نشیند", () => {
    expect(
      creditBalance([
        { reason: "ADMIN_ADJUSTMENT", amount: 5_000_000n },
        { reason: "ADMIN_ADJUSTMENT", amount: -5_000_000n },
      ]),
    ).toBe(0n);
  });
});

describe("علامت مبلغ به ازای دلیل", () => {
  it("اعتبار لغو فقط مثبت است", () => {
    expect(isCreditAmountValid("CANCELLATION", 1n)).toBe(true);
    expect(isCreditAmountValid("CANCELLATION", -1n)).toBe(false);
  });

  it("خرج فقط منفی است", () => {
    expect(isCreditAmountValid("SPEND", -1n)).toBe(true);
    expect(isCreditAmountValid("SPEND", 1n)).toBe(false);
  });

  it("ادمین هر دو جهت را دارد", () => {
    expect(isCreditAmountValid("ADMIN_ADJUSTMENT", 1n)).toBe(true);
    expect(isCreditAmountValid("ADMIN_ADJUSTMENT", -1n)).toBe(true);
  });

  it("صفر هیچ‌جا معنا ندارد", () => {
    expect(isCreditAmountValid("CANCELLATION", 0n)).toBe(false);
    expect(isCreditAmountValid("ADMIN_ADJUSTMENT", 0n)).toBe(false);
  });
});

describe("تقسیم مبلغ بین اعتبار و درگاه", () => {
  it("بدون درخواست هنرجو، اعتبار دست‌نخورده می‌ماند", () => {
    expect(
      splitPayment({ total: 3_000_000n, balance: 5_000_000n, useCredit: false }),
    ).toEqual({ fromCredit: 0n, fromGateway: 3_000_000n });
  });

  it("موجودی صفر یعنی کل مبلغ به درگاه", () => {
    expect(splitPayment({ total: 3_000_000n, balance: 0n, useCredit: true })).toEqual({
      fromCredit: 0n,
      fromGateway: 3_000_000n,
    });
  });

  it("اعتبار بیشتر از مبلغ: فقط به اندازه‌ی مبلغ برداشته می‌شود", () => {
    expect(
      splitPayment({ total: 3_000_000n, balance: 5_000_000n, useCredit: true }),
    ).toEqual({ fromCredit: 3_000_000n, fromGateway: 0n });
  });

  it("اعتبار دقیقاً برابر مبلغ: سفارش به درگاه نمی‌رود", () => {
    expect(
      splitPayment({ total: 3_000_000n, balance: 3_000_000n, useCredit: true }),
    ).toEqual({ fromCredit: 3_000_000n, fromGateway: 0n });
  });

  it("اعتبار بخشی از مبلغ: باقی‌مانده به درگاه می‌رود", () => {
    expect(
      splitPayment({ total: 3_000_000n, balance: 1_200_000n, useCredit: true }),
    ).toEqual({ fromCredit: 1_200_000n, fromGateway: 1_800_000n });
  });

  it("دو سهم همیشه دقیقاً کل مبلغ می‌شوند", () => {
    for (const balance of [1n, 999n, 1_000n, 1_499_999n, 2_999_999n, 3_000_000n]) {
      const split = splitPayment({ total: 3_000_000n, balance, useCredit: true });
      expect(split.fromCredit + split.fromGateway).toBe(3_000_000n);
      expect(split.fromCredit).toBeGreaterThanOrEqual(0n);
      expect(split.fromGateway).toBeGreaterThanOrEqual(0n);
    }
  });

  it("باقی‌مانده‌ی زیر کف درگاه، سهم اعتبار را کم می‌کند", () => {
    // ۵۰۰ ریال باقی می‌ماند که درگاه رد می‌کند
    const split = splitPayment({
      total: 3_000_000n,
      balance: 2_999_500n,
      useCredit: true,
    });

    expect(split).toEqual({
      fromCredit: 3_000_000n - MIN_GATEWAY_AMOUNT_RIAL,
      fromGateway: MIN_GATEWAY_AMOUNT_RIAL,
    });
  });

  it("باقی‌مانده‌ی دقیقاً برابر کف پذیرفته می‌شود", () => {
    expect(
      splitPayment({ total: 3_000_000n, balance: 2_999_000n, useCredit: true }),
    ).toEqual({ fromCredit: 2_999_000n, fromGateway: MIN_GATEWAY_AMOUNT_RIAL });
  });

  it("سهم اعتبار هرگز از آنچه هنرجو دارد بیشتر نمی‌شود", () => {
    // وسوسه‌ی «بگذار اعتبار کل را بپوشاند تا درگاه لازم نشود» — ولی
    // موجودی کافی نیست و برداشتنش یعنی اعتبار منفی
    const split = splitPayment({ total: 3_000_000n, balance: 2_999_500n, useCredit: true });
    expect(split.fromCredit).toBeLessThanOrEqual(2_999_500n);
  });

  it("مبلغی کمتر از کف درگاه که اعتبار پوششش نمی‌دهد، کامل به درگاه می‌رود", () => {
    expect(splitPayment({ total: 800n, balance: 300n, useCredit: true })).toEqual({
      fromCredit: 0n,
      fromGateway: 800n,
    });
  });

  it("مبلغ صفر (جلسه‌ی معارفه) اعتبار را لمس نمی‌کند", () => {
    expect(splitPayment({ total: 0n, balance: 5_000_000n, useCredit: true })).toEqual({
      fromCredit: 0n,
      fromGateway: 0n,
    });
  });
});
