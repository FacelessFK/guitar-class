import type { PackagePreview } from "./app-api";
import { BUSINESS_RULES } from "@music/shared";

export type SessionType = "TRIAL" | "SINGLE" | "PACKAGE";
export type BookingStep = 1 | 2 | 3 | 4 | 5;

export interface BookingSelection {
  instrumentId: string | null;
  teacherId: string | null;
  sessionType: SessionType | null;
  slotId: string | null;
}

/** مقدار عمومی URL را به enum داخلی دامنه وصل می‌کند. */
export function readSessionType(value: string | null): SessionType | null {
  switch (value) {
    case "trial":
      return "TRIAL";
    case "single":
      return "SINGLE";
    case "package":
      return "PACKAGE";
    default:
      return null;
  }
}

/**
 * نوعی که هنوز استاد ندارد باید تا انتخاب استاد زنده بماند، حتی اگر URL
 * برای مرحله‌ی ساز به شکل canonical بازنویسی شود.
 */
export function deferredSessionTypeIntent(input: {
  requestedTeacher: string | null;
  requestedType: SessionType | null;
}): SessionType | null {
  return input.requestedTeacher === null ? input.requestedType : null;
}

/** اعمال intent فقط بعد از معلوم شدن eligibility جلسه‌ی معارفه. */
export function resolveSessionTypeIntent(
  requestedType: SessionType | null,
  trialEligible: boolean,
): { sessionType: SessionType | null; step: 3 | 4 } {
  if (!requestedType || (requestedType === "TRIAL" && !trialEligible)) {
    return { sessionType: null, step: 3 };
  }

  return { sessionType: requestedType, step: 4 };
}

/**
 * عمیق‌ترین مرحله‌ای که یک deeplink اعتبارسنجی‌شده حق دارد باز کند.
 *
 * این تابع فقط نتیجه‌ی اعتبارسنجی داده‌های واقعی را می‌گیرد؛ وجود خامِ
 * query param هرگز برای جلو رفتن کافی نیست.
 */
export function resolveDeeplinkStep(input: {
  instrumentValid: boolean;
  teacherValid: boolean;
  requestedType: SessionType | null;
  trialEligible: boolean;
}): BookingStep {
  if (!input.instrumentValid) return 1;
  if (!input.teacherValid) return 2;
  return resolveSessionTypeIntent(input.requestedType, input.trialEligible).step;
}

/** انتخاب تازه‌ی ساز تمام تصمیم‌های وابسته را باطل می‌کند. */
export function selectInstrument(
  state: BookingSelection,
  instrumentId: string,
): BookingSelection {
  if (state.instrumentId === instrumentId) return state;
  return {
    instrumentId,
    teacherId: null,
    sessionType: null,
    slotId: null,
  };
}

/** انتخاب تازه‌ی استاد، نوع کلاس و زمان استاد قبلی را باطل می‌کند. */
export function selectTeacher(
  state: BookingSelection,
  teacherId: string,
): BookingSelection {
  if (state.teacherId === teacherId) return state;
  return { ...state, teacherId, sessionType: null, slotId: null };
}

/** تغییر نوع کلاس همیشه زمان قبلی را باطل می‌کند. */
export function selectSessionType(
  state: BookingSelection,
  sessionType: SessionType,
): BookingSelection {
  if (state.sessionType === sessionType) return state;
  return { ...state, sessionType, slotId: null };
}

/** تعارض یا پیش‌نمایشِ ناتمام بسته اجازه‌ی ورود به مرور نهایی نمی‌دهد. */
export function canReviewSelection(input: {
  sessionType: SessionType | null;
  hasSlot: boolean;
  packagePreview: PackagePreview | null;
  packagePreviewError: string | null;
}): boolean {
  if (!input.sessionType || !input.hasSlot) return false;
  if (input.sessionType !== "PACKAGE") return true;
  return (
    input.packagePreviewError === null &&
    input.packagePreview?.ok === true &&
    input.packagePreview.sessions.length === BUSINESS_RULES.PACKAGE_SESSION_COUNT
  );
}
