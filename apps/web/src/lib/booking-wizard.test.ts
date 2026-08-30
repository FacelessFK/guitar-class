import { describe, expect, it } from "vitest";

import {
  canReviewSelection,
  readSessionType,
  resolveDeeplinkStep,
  selectInstrument,
  selectSessionType,
  selectTeacher,
  type BookingSelection,
} from "./booking-wizard";
import { paymentResultHref } from "./payment-result";

const complete: BookingSelection = {
  instrumentId: "guitar",
  teacherId: "teacher-1",
  sessionType: "PACKAGE",
  slotId: "slot-1",
};

describe("deeplink ویزارد رزرو", () => {
  it.each([
    [{ instrumentValid: false, teacherValid: false, requestedType: null, trialEligible: true }, 1],
    [{ instrumentValid: true, teacherValid: false, requestedType: null, trialEligible: true }, 2],
    [{ instrumentValid: true, teacherValid: false, requestedType: "TRIAL" as const, trialEligible: true }, 2],
    [{ instrumentValid: true, teacherValid: true, requestedType: null, trialEligible: true }, 3],
    [{ instrumentValid: true, teacherValid: true, requestedType: "SINGLE" as const, trialEligible: true }, 4],
    [{ instrumentValid: true, teacherValid: true, requestedType: "PACKAGE" as const, trialEligible: true }, 4],
    [{ instrumentValid: true, teacherValid: true, requestedType: "TRIAL" as const, trialEligible: true }, 4],
  ])("زمینه‌ی معتبر را به مرحله‌ی درست می‌برد", (input, expected) => {
    expect(resolveDeeplinkStep(input)).toBe(expected);
  });

  it("deeplink معارفه‌ی مصرف‌شده را در مرحله‌ی نوع کلاس نگه می‌دارد", () => {
    expect(
      resolveDeeplinkStep({
        instrumentValid: true,
        teacherValid: true,
        requestedType: "TRIAL",
        trialEligible: false,
      }),
    ).toBe(3);
  });

  it("type نامعتبر را پیش‌انتخاب نمی‌کند", () => {
    expect(readSessionType("monthly")).toBeNull();
  });
});

describe("ابطال انتخاب‌های وابسته", () => {
  it("تغییر ساز، استاد و نوع و زمان را پاک می‌کند", () => {
    expect(selectInstrument(complete, "piano")).toEqual({
      instrumentId: "piano",
      teacherId: null,
      sessionType: null,
      slotId: null,
    });
  });

  it("تغییر استاد، نوع و زمان را پاک می‌کند", () => {
    expect(selectTeacher(complete, "teacher-2")).toEqual({
      ...complete,
      teacherId: "teacher-2",
      sessionType: null,
      slotId: null,
    });
  });

  it("تغییر نوع کلاس، زمان را پاک می‌کند", () => {
    expect(selectSessionType(complete, "SINGLE")).toEqual({
      ...complete,
      sessionType: "SINGLE",
      slotId: null,
    });
  });
});

describe("دروازه‌ی مرور و پرداخت", () => {
  it("تعارض بسته اجازه‌ی تأیید نمی‌دهد", () => {
    expect(
      canReviewSelection({
        sessionType: "PACKAGE",
        hasSlot: true,
        packagePreview: {
          ok: false,
          sessions: [],
          conflicts: [{ sessionIndex: 2, date: "2026-09-05" }],
        },
        packagePreviewError: null,
      }),
    ).toBe(false);
  });

  it("بسته فقط پس از پیش‌نمایش معتبر ادامه می‌دهد", () => {
    expect(
      canReviewSelection({
        sessionType: "PACKAGE",
        hasSlot: true,
        packagePreview: {
          ok: true,
          sessions: Array.from({ length: 4 }, (_, index) => ({
            startAt: `2026-09-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
            endAt: `2026-09-${String(index + 1).padStart(2, "0")}T11:00:00.000Z`,
            date: `2026-09-${String(index + 1).padStart(2, "0")}`,
            startTime: "13:30",
            endTime: "14:30",
            weekday: index,
            weekdayName: "شنبه",
          })),
          conflicts: [],
        },
        packagePreviewError: null,
      }),
    ).toBe(true);
  });

  it("پیش‌نمایش ناقص بسته را معتبر فرض نمی‌کند", () => {
    expect(
      canReviewSelection({
        sessionType: "PACKAGE",
        hasSlot: true,
        packagePreview: { ok: true, sessions: [], conflicts: [] },
        packagePreviewError: null,
      }),
    ).toBe(false);
  });

  it("تسویه‌ی اعتباری هم به Payment Result بدون status می‌رود", () => {
    expect(paymentResultHref("order/credit-only")).toBe(
      "/payment/result?order=order%2Fcredit-only",
    );
    expect(paymentResultHref("order-1")).not.toContain("status");
  });
});
