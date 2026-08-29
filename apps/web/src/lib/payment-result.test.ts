import { describe, expect, it } from "vitest";

import {
  isAuthoritativePaymentSuccess,
  orderIdFromPaymentResultParams,
} from "./payment-result";

describe("مرجع نتیجه‌ی پرداخت", () => {
  it("status=paid جعلی نه سفارش می‌سازد و نه موفقیت", () => {
    const forged = new URLSearchParams("status=paid");

    expect(orderIdFromPaymentResultParams(forged)).toBeNull();
    expect(isAuthoritativePaymentSuccess(null)).toBe(false);
  });

  it("فقط outcome سرور موفقیت قطعی می‌سازد", () => {
    expect(isAuthoritativePaymentSuccess({ outcome: "PAID_MATCHED" })).toBe(true);
    expect(isAuthoritativePaymentSuccess({ outcome: "PAID_UNMATCHED" })).toBe(false);
  });
});
