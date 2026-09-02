import { BUSINESS_RULES, roomState, roomWindow } from "@music/shared";

import type { BookingDetail } from "./app-api";
import { faDigits, faNumber } from "./format";

const MINUTE_MS = 60_000;
const NEAR_END_MS = 5 * MINUTE_MS;

export type ClassroomTimingPhase =
  | "LOADING"
  | "BEFORE_START"
  | "ACTIVE"
  | "NEAR_END"
  | "OVERTIME"
  | "CLOSED";

export interface ClassroomTimingPresentation {
  phase: ClassroomTimingPhase;
  timerLabel: string;
  live: boolean;
  notice: string | null;
}

/**
 * تایمر اتاق فقط از لحظه‌های مطلق رزرو می‌آید؛ هیچ‌وقت از زمان لود صفحه
 * شروع نمی‌شود. خروجی ساعتِ سپری‌شده duration است، نه ساعت تقویمی.
 */
export function classroomTimingPresentation(
  booking: Pick<BookingDetail, "scheduledAt" | "endsAt">,
  now: number | null,
): ClassroomTimingPresentation {
  if (now === null) {
    return { phase: "LOADING", timerLabel: "—", live: false, notice: null };
  }

  const session = {
    start: Date.parse(booking.scheduledAt),
    end: Date.parse(booking.endsAt),
  };
  const state = roomState(session, now);

  if (state === "CLOSED") {
    return {
      phase: "CLOSED",
      timerLabel: formatDurationClock(session.end - session.start),
      live: false,
      notice: "زمان ورود به این کلاس به پایان رسیده است.",
    };
  }

  if (now < session.start) {
    return {
      phase: "BEFORE_START",
      timerLabel: formatDurationClock(session.start - now),
      live: false,
      notice: "اتاق باز است؛ کلاس در زمان برنامه‌ریزی‌شده شروع می‌شود.",
    };
  }

  if (now >= session.end) {
    return {
      phase: "OVERTIME",
      timerLabel: formatDurationClock(session.end - session.start),
      live: true,
      notice: `زمان برنامه‌ریزی‌شده تمام شده؛ اتاق تا ${formatDurationClock(
        roomWindow(session).end - now,
      )} دیگر باز می‌ماند.`,
    };
  }

  const remaining = session.end - now;
  const nearEnd = remaining <= NEAR_END_MS;

  return {
    phase: nearEnd ? "NEAR_END" : "ACTIVE",
    timerLabel: formatDurationClock(now - session.start),
    live: true,
    notice: nearEnd
      ? `${formatDurationClock(remaining)} تا پایان زمان برنامه‌ریزی‌شده`
      : null,
  };
}

export function formatDurationClock(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return faDigits(`${minutes}:${rest}`);
}

export function classroomSessionTypeLabel(
  booking: Pick<BookingDetail, "type" | "sessionIndex">,
): string {
  if (booking.type === "TRIAL") return "جلسه معارفه";
  if (booking.type === "SINGLE") return "تک‌جلسه";

  return booking.sessionIndex === null
    ? "جلسه بسته"
    : `جلسه ${faNumber(booking.sessionIndex)} از ${faNumber(
        BUSINESS_RULES.PACKAGE_SESSION_COUNT,
      )}`;
}

export function classroomCounterpartLabel(
  booking: Pick<BookingDetail, "role" | "counterpartName">,
): string {
  return `${booking.counterpartName} · ${booking.role === "TEACHER" ? "هنرجو" : "استاد"}`;
}

export function classroomDashboardHref(
  role: BookingDetail["role"],
): "/teacher" | "/dashboard" {
  return role === "TEACHER" ? "/teacher" : "/dashboard";
}

export type MediaControl = "MICROPHONE" | "CAMERA";

export function mediaControlLabel(
  control: MediaControl,
  muted: boolean,
  available: boolean,
): string {
  const name = control === "MICROPHONE" ? "میکروفون" : "دوربین";
  if (!available) return `${name} در دسترس نیست`;
  return muted ? `روشن کردن ${name}` : `خاموش کردن ${name}`;
}

export type ClientAttendanceEvent = "JOINED" | "LEFT";

/**
 * `participantLeft` خروجِ طرف مقابل است، نه کاربر جاری. نسخه‌ی قبلی آن
 * را به نام کاربر جاری گزارش می‌کرد و `actualEndedAt` را زود جابه‌جا
 * می‌کرد. فقط رویدادهای محلی به دفتر حضور کلاینت نگاشت می‌شوند.
 */
export function attendanceEventForJitsiEvent(
  event: string,
): ClientAttendanceEvent | null {
  if (event === "videoConferenceJoined") return "JOINED";
  if (event === "videoConferenceLeft" || event === "readyToClose") return "LEFT";
  return null;
}

/**
 * payloadهای IFrame از مرز جاوااسکریپت خارجی می‌آیند و نباید صرفاً با
 * type assertion به وضعیت کنترل تبدیل شوند. فقط بولین واقعی پذیرفته می‌شود.
 */
export function jitsiEventBoolean(
  payload: unknown,
  key: "muted" | "on",
): boolean | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : null;
}
