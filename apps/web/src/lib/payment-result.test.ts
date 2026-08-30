import { describe, expect, it } from "vitest";

import {
  isAuthoritativePaymentSuccess,
  orderForPaymentResult,
  orderIdFromPaymentResultParams,
  paymentResultState,
} from "./payment-result";

const order = {
  id: "order-1",
  outcome: "PAID_MATCHED" as const,
  paymentMethod: "GATEWAY" as const,
  target: {
    kind: "SINGLE" as const,
    id: "booking-1",
    teacherName: "استاد",
    instrumentName: "گیتار",
    firstSessionAt: "2026-09-05T14:30:00.000Z",
    sessionCount: 1,
  },
};

describe("مرجع نتیجه‌ی پرداخت", () => {
  it("status=paid جعلی نه سفارش می‌سازد و نه موفقیت", () => {
    const forged = new URLSearchParams("status=paid");

    expect(orderIdFromPaymentResultParams(forged)).toBeNull();
    expect(isAuthoritativePaymentSuccess(null)).toBe(false);
  });

  it("order خالی را هم شناسه‌ی معتبر نمی‌داند", () => {
    expect(orderIdFromPaymentResultParams(new URLSearchParams("order=%20"))).toBeNull();
  });

  it("پس از تغییر query، سفارش قبلی را حتی موقتاً نمایش نمی‌دهد", () => {
    expect(orderForPaymentResult(order, "order-2")).toBeNull();
    expect(orderForPaymentResult(order, "order-1")).toBe(order);
  });

  it("فقط outcome سرور موفقیت قطعی می‌سازد", () => {
    expect(isAuthoritativePaymentSuccess({ outcome: "PAID_MATCHED" })).toBe(true);
    expect(isAuthoritativePaymentSuccess({ outcome: "PAID_UNMATCHED" })).toBe(false);
  });

  it("pending و failed هیچ‌کدام ظاهر موفق نمی‌گیرند", () => {
    expect(paymentResultState({ ...order, outcome: "PENDING" })).toBe("PENDING");
    expect(paymentResultState({ ...order, outcome: "FAILED" })).toBe("FAILED");
  });

  it("پرداخت matched بر اساس روش واقعی، موفقیت متناظر می‌گیرد", () => {
    expect(paymentResultState(order)).toBe("SUCCESS_GATEWAY");
    expect(paymentResultState({ ...order, paymentMethod: "CREDIT" })).toBe(
      "SUCCESS_CREDIT",
    );
    expect(paymentResultState({ ...order, paymentMethod: "MIXED" })).toBe(
      "SUCCESS_MIXED",
    );
    expect(
      paymentResultState({
        ...order,
        target: { ...order.target, kind: "PACKAGE", sessionCount: 4 },
      }),
    ).toBe("SUCCESS_PACKAGE");
  });

  it("paid unmatched پیام بازیابی اعتبار می‌گیرد، نه موفقیت کلاس", () => {
    expect(paymentResultState({ ...order, outcome: "PAID_UNMATCHED" })).toBe(
      "RECOVERED_TO_CREDIT",
    );
  });
});
