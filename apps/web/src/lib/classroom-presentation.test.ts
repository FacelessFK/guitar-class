import { describe, expect, it } from "vitest";

import type { BookingDetail } from "./app-api";
import {
  attendanceEventForJitsiEvent,
  classroomCounterpartLabel,
  classroomDashboardHref,
  classroomSessionTypeLabel,
  classroomTimingPresentation,
  mediaControlLabel,
} from "./classroom-presentation";

const MINUTE = 60_000;
const START = Date.parse("2026-09-01T13:30:00.000Z");

const booking = {
  scheduledAt: new Date(START).toISOString(),
  endsAt: new Date(START + 60 * MINUTE).toISOString(),
} as BookingDetail;

describe("classroomTimingPresentation", () => {
  it("زمان را از لحظه‌های مطلق رزرو می‌سازد", () => {
    expect(classroomTimingPresentation(booking, START + 36 * MINUTE + 21_000)).toEqual({
      phase: "ACTIVE",
      timerLabel: "۳۶:۲۱",
      live: true,
      notice: null,
    });
  });

  it("پنج دقیقه‌ی پایانی و مهلت پس از جلسه را جدا می‌کند", () => {
    expect(classroomTimingPresentation(booking, START + 55 * MINUTE).phase).toBe(
      "NEAR_END",
    );
    expect(classroomTimingPresentation(booking, START + 65 * MINUTE)).toMatchObject({
      phase: "OVERTIME",
      timerLabel: "۶۰:۰۰",
      live: true,
    });
  });

  it("در لبه‌ی بسته شدن از همان roomWindow مشترک پیروی می‌کند", () => {
    expect(classroomTimingPresentation(booking, START + 75 * MINUTE).phase).toBe(
      "CLOSED",
    );
  });
});

describe("role-safe classroom presentation", () => {
  it("طرف مقابل و مقصد خروج را از نقش همین رزرو می‌گیرد", () => {
    expect(
      classroomCounterpartLabel({ role: "TEACHER", counterpartName: "علی محمدی" }),
    ).toBe("علی محمدی · هنرجو");
    expect(classroomDashboardHref("TEACHER")).toBe("/teacher");
    expect(classroomDashboardHref("STUDENT")).toBe("/dashboard");
  });

  it("شماره‌ی واقعی جلسه‌ی بسته را نشان می‌دهد", () => {
    expect(classroomSessionTypeLabel({ type: "PACKAGE", sessionIndex: 2 })).toBe(
      "جلسه ۲ از ۴",
    );
  });
});

describe("safe control and event labels", () => {
  it("وضعیت میکروفون را در برچسب کنش اعلام می‌کند", () => {
    expect(mediaControlLabel("MICROPHONE", false, true)).toBe(
      "خاموش کردن میکروفون",
    );
    expect(mediaControlLabel("MICROPHONE", true, true)).toBe(
      "روشن کردن میکروفون",
    );
    expect(mediaControlLabel("MICROPHONE", true, false)).toBe(
      "میکروفون در دسترس نیست",
    );
  });

  it("خروج طرف مقابل را خروج کاربر جاری گزارش نمی‌کند", () => {
    expect(attendanceEventForJitsiEvent("participantLeft")).toBeNull();
    expect(attendanceEventForJitsiEvent("videoConferenceJoined")).toBe("JOINED");
    expect(attendanceEventForJitsiEvent("videoConferenceLeft")).toBe("LEFT");
    expect(attendanceEventForJitsiEvent("readyToClose")).toBe("LEFT");
  });
});
