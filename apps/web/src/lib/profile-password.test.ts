import { describe, expect, it } from "vitest";

import { ownPasswordPayload } from "./profile-password";

describe("بدنه‌ی تغییر رمز", () => {
  it("برای حساب رمزدار، رمز فعلی را می‌فرستد", () => {
    expect(ownPasswordPayload(true, "old password", "new password")).toEqual({
      currentPassword: "old password",
      newPassword: "new password",
    });
  });

  it("برای حساب OTP-only فیلد رمز فعلی را اصلاً نمی‌فرستد", () => {
    expect(ownPasswordPayload(false, "", "first password")).toEqual({
      newPassword: "first password",
    });
  });
});
