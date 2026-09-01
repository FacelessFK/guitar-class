import { describe, expect, it } from "vitest";

import { statusDisplay } from "./booking-display";

describe("نمایش نقش‌محور وضعیت رزرو", () => {
  it("پرداخت معلق و جلسه تأییدشده را برای هر دو نقش با وضعیت واقعی نشان می‌دهد", () => {
    expect(statusDisplay("PENDING_PAYMENT", "STUDENT").label).toBe("در انتظار پرداخت");
    expect(statusDisplay("PENDING_PAYMENT", "TEACHER").label).toBe("در انتظار پرداخت");
    expect(statusDisplay("CONFIRMED", "STUDENT").label).toBe("تأییدشده");
    expect(statusDisplay("CONFIRMED", "TEACHER").label).toBe("تأییدشده");
  });

  it("لغو را از دید هنرجو و استاد اشتباه نسبت نمی‌دهد", () => {
    expect(statusDisplay("CANCELLED_BY_STUDENT", "STUDENT").label).toBe("شما لغو کردید");
    expect(statusDisplay("CANCELLED_BY_STUDENT", "TEACHER").label).toBe("هنرجو لغو کرد");
    expect(statusDisplay("CANCELLED_BY_TEACHER", "STUDENT").label).toBe("استاد لغو کرد");
    expect(statusDisplay("CANCELLED_BY_TEACHER", "TEACHER").label).toBe("شما لغو کردید");
  });
});
