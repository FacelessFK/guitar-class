import { DomainError } from "../common/domain-error.js";

/** خطاهای دامنه‌ی نظرِ هنرجو به استاد. */
export class ReviewError extends DomainError {}

/**
 * نظر روی جلسه‌ای که هنوز برگزار نشده.
 *
 * نظر گواهیِ یک برخوردِ واقعی است؛ تا جلسه `COMPLETED` نشده، چیزی برای
 * نظر دادن نبوده. جلسه‌ی لغوشده یا پرداخت‌نشده هم به همین در می‌خورد.
 */
export class SessionNotReviewableError extends ReviewError {
  constructor(status: string) {
    super(
      `برای جلسه‌ای در وضعیت «${status}» نمی‌شود نظر ثبت کرد؛ نظر پس از برگزاری جلسه ممکن است.`,
      "SESSION_NOT_REVIEWABLE",
    );
  }
}

/**
 * نظر قبلاً ثبت شده.
 *
 * یکتاییِ `booking_id` این را در دیتابیس هم می‌گیرد؛ این خطا همان قید
 * را به پیامِ قابل‌نمایش ترجمه می‌کند به‌جای آنکه بگذارد `23505` خام به
 * ۵۰۰ تبدیل شود.
 */
export class ReviewAlreadyExistsError extends ReviewError {
  constructor() {
    super("برای این جلسه قبلاً نظر ثبت کرده‌اید.", "REVIEW_ALREADY_EXISTS");
  }
}
