import { DomainError } from "../common/domain-error.js";

/** خطاهای دامنه‌ی پنل ادمین. */
export class AdminError extends DomainError {}

/**
 * موردی که ادمین به آن ارجاع داده وجود ندارد.
 *
 * برخلاف «پیدا نشد»های پنل استاد، اینجا لازم نیست وجود و مالکیت را با
 * هم پنهان کنیم: ادمین به همه‌چیز دسترسی دارد، پس «پیدا نشد» واقعاً
 * یعنی پیدا نشد و مبهم کردنش فقط اشکال‌زدایی را سخت می‌کند.
 */
export class AdminRecordNotFoundError extends AdminError {
  constructor(what: string) {
    super(`${what} پیدا نشد.`, "ADMIN_RECORD_NOT_FOUND");
  }
}

/** نشانی ساز تکراری است. */
export class InstrumentSlugTakenError extends AdminError {
  constructor() {
    super("سازی با این نشانی از قبل وجود دارد.", "INSTRUMENT_SLUG_TAKEN");
  }
}

/**
 * برای این جفتِ (استاد، ساز) از قبل سرویسی هست.
 *
 * قید `offerings_teacher_instrument_unique` همین را در دیتابیس تضمین
 * می‌کند. ساخت دوباره خطاست نه به‌روزرسانی بی‌صدا: قیمت، سرویسِ موجود
 * را عوض می‌کند و آن مسیرِ دیگری است که ادمین باید آگاهانه انتخابش کند.
 */
export class OfferingExistsError extends AdminError {
  constructor() {
    super(
      "برای این استاد و این ساز از قبل سرویسی تعریف شده است. همان را ویرایش کنید.",
      "OFFERING_EXISTS",
    );
  }
}

/**
 * مبلغ تسویه از مانده‌ی استاد بیشتر است.
 *
 * رد می‌شود و اجازه‌ی «هرچه بود ثبت کن» داده نمی‌شود، چون تنها راه رسیدن
 * به این حالت در عمل، یک صفر اضافه در تایپ مبلغ است — و نتیجه‌اش مانده‌ی
 * منفی‌ای است که هیچ گزارشی به آن اعتراض نمی‌کند. عدد واقعی در پیام
 * می‌آید تا ادمین بتواند همان‌جا اصلاحش کند.
 */
export class PayoutExceedsBalanceError extends AdminError {
  constructor(readonly outstanding: bigint) {
    super(
      `مبلغ تسویه از مانده‌ی استاد بیشتر است. مانده‌ی فعلی ${outstanding} ریال است.`,
      "PAYOUT_EXCEEDS_BALANCE",
    );
  }
}

/** تسویه‌ای که از قبل پرداخت شده، دوباره پرداخت نمی‌شود. */
export class PayoutNotPendingError extends AdminError {
  constructor() {
    super("این تسویه از قبل پرداخت‌شده علامت خورده است.", "PAYOUT_NOT_PENDING");
  }
}
