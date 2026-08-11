import type { DateKey, Interval } from "@music/shared";

import { DomainError } from "../common/domain-error.js";

/** خطاهای دامنه‌ی رزرو. */
export class BookingError extends DomainError {}

/**
 * اسلات بین لحظه‌ای که کاربر لیست را دید تا لحظه‌ای که دکمه را زد، پر شد.
 *
 * این خطا هم از بررسی پیش از درج می‌آید و هم از قید
 * `bookings_no_teacher_overlap` در پستگرس. دومی حالت رقابتی واقعی است:
 * دو نفر هم‌زمان یک اسلات را می‌زنند.
 */
export class SlotUnavailableError extends BookingError {
  constructor(message = "این ساعت دیگر آزاد نیست. لطفاً ساعت دیگری انتخاب کنید.") {
    super(message, "SLOT_UNAVAILABLE");
  }
}

/** هنرجو در همان ساعت با استاد دیگری کلاس دارد. */
export class StudentBusyError extends BookingError {
  constructor() {
    super("شما در این ساعت کلاس دیگری دارید.", "STUDENT_BUSY");
  }
}

/** جلسه‌ی معارفه‌ی رایگان یک‌بار برای همیشه است، نه یکی به ازای هر استاد. */
export class TrialAlreadyUsedError extends BookingError {
  constructor() {
    super("شما قبلاً از جلسه‌ی معارفه‌ی رایگان استفاده کرده‌اید.", "TRIAL_ALREADY_USED");
  }
}

/**
 * حداقل یکی از جلسات پکیج آزاد نبود.
 *
 * `conflicts` می‌گوید کدام هفته‌ها مشکل دارند تا بتوانیم دقیقاً همان را
 * به هنرجو نشان دهیم، نه یک پیام کلی.
 */
export class PackageConflictError extends BookingError {
  constructor(readonly conflicts: Array<{ index: number; date: DateKey; start: Interval }>) {
    super(
      `جلسه‌های ${conflicts.map((c) => c.index).join("، ")} از این پکیج در آن ساعت آزاد نیستند.`,
      "PACKAGE_CONFLICT",
    );
  }
}

export class OfferingNotFoundError extends BookingError {
  constructor(offeringId: string) {
    super(`سرویس مورد نظر پیدا نشد (${offeringId}).`, "OFFERING_NOT_FOUND");
  }
}

export class BookingNotFoundError extends BookingError {
  constructor(bookingId: string) {
    super(`رزرو مورد نظر پیدا نشد (${bookingId}).`, "BOOKING_NOT_FOUND");
  }
}

export class NotBookingParticipantError extends BookingError {
  constructor() {
    super("شما به این رزرو دسترسی ندارید.", "NOT_PARTICIPANT");
  }
}

export class BookingNotCancellableError extends BookingError {
  constructor(status: string) {
    super(`این رزرو در وضعیت فعلی قابل لغو نیست (${status}).`, "NOT_CANCELLABLE");
  }
}

// ---------------------------------------------------------------------------
// ترجمه‌ی خطاهای پستگرس
// ---------------------------------------------------------------------------

/** کدهای خطای پستگرس که به آن‌ها اهمیت می‌دهیم. */
const PG_EXCLUSION_VIOLATION = "23P01";
const PG_CHECK_VIOLATION = "23514";

interface PostgresError {
  code?: string;
  constraint_name?: string;
  constraint?: string;
}

function asPostgresError(error: unknown): PostgresError | null {
  if (typeof error !== "object" || error === null) return null;
  const candidate = error as PostgresError;
  return typeof candidate.code === "string" ? candidate : null;
}

/**
 * خطای خام دیتابیس را به خطای دامنه ترجمه می‌کند.
 *
 * قیدهای دیتابیس تنها لایه‌ی دفاعی نیستند — پیش از درج هم بررسی می‌کنیم —
 * ولی تنها لایه‌ای هستند که در برابر شرط رقابتی مصون‌اند. وقتی قید فعال
 * می‌شود یعنی واقعاً دو درخواست هم‌زمان به یک اسلات رسیده‌اند، و کاربر
 * باید پیام معناداری ببیند نه خطای ۵۰۰.
 */
export function translateDatabaseError(error: unknown): BookingError | null {
  const pgError = asPostgresError(error);
  if (!pgError) return null;

  const constraint = pgError.constraint_name ?? pgError.constraint ?? "";

  if (pgError.code === PG_EXCLUSION_VIOLATION) {
    if (constraint === "bookings_no_student_overlap") return new StudentBusyError();
    return new SlotUnavailableError();
  }

  if (pgError.code === PG_CHECK_VIOLATION) {
    // این‌ها باگ برنامه‌نویسی‌اند نه خطای کاربر، پس عمداً ترجمه نمی‌شوند
    // و خام بالا می‌روند تا در لاگ دیده شوند.
    return null;
  }

  return null;
}

/** خطای دیتابیس را ترجمه می‌کند و اگر ناشناخته بود، خام دوباره پرتاب می‌کند. */
export function rethrowTranslated(error: unknown): never {
  const translated = translateDatabaseError(error);
  if (translated) throw translated;
  throw error;
}
