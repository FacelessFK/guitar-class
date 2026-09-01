import { describe, expect, it } from "vitest";

import { formatLedgerToman, ledgerTypeLabel } from "./earnings-presentation";

describe("نمایش دفتر کل درآمد", () => {
  it("سطر منفی را با منهای صریح و بدون تغییر قدرمطلق نشان می‌دهد", () => {
    expect(formatLedgerToman("-1234560")).toBe("−۱۲۳٬۴۵۶");
    expect(formatLedgerToman("1234560")).toBe("۱۲۳٬۴۵۶");
  });

  it("بازپرداخت و تعدیل را با معنای واقعی دفتر کل نام‌گذاری می‌کند", () => {
    expect(ledgerTypeLabel("REFUND")).toBe("بازپرداخت");
    expect(ledgerTypeLabel("ADJUSTMENT")).toBe("تعدیل");
  });
});
