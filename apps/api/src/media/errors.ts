import { DomainError } from "../common/domain-error.js";

/** خطاهای دامنه‌ی رسانه. */
export class MediaError extends DomainError {}

export class UnsupportedMediaTypeError extends MediaError {
  constructor(detail: string) {
    super(`این فایل قابل قبول نیست: ${detail}`, "UNSUPPORTED_MEDIA");
  }
}

/**
 * کلید آبجکت با هیچ بلیت معتبری نمی‌خواند.
 *
 * سه حالت به یک پیام می‌رسند و عمداً از هم جدا نمی‌شوند: بلیت منقضی
 * شده، قبلاً مصرف شده، یا مال کاربر دیگری است. تفکیکشان به کسی که
 * کلیدی را حدس زده می‌گوید کدام کلیدها وجود دارند.
 */
export class MediaTicketInvalidError extends MediaError {
  constructor() {
    super(
      "آپلود این فایل تأیید نشد. دوباره فایل را انتخاب و ارسال کنید.",
      "MEDIA_TICKET_INVALID",
    );
  }
}
