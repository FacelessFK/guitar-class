import { DomainError } from "../common/domain-error.js";

/** خطاهای دامنه‌ی بلاگ. */
export class BlogError extends DomainError {}

export class PostNotFoundError extends BlogError {
  constructor() {
    super("این نوشته پیدا نشد.", "POST_NOT_FOUND");
  }
}

/**
 * اسلاگ تکراری.
 *
 * خطاست و نه بازنویسی بی‌صدا: اسلاگ نشانی عمومی نوشته است و عوض شدنش
 * یعنی لینک‌های بیرونی و رتبه‌ی گوگل به صفحه‌ی دیگری برسند — همان چیزی
 * که سئو ماه‌ها برایش وقت گذاشته.
 */
export class PostSlugTakenError extends BlogError {
  constructor() {
    super("نوشته‌ای با این نشانی از قبل وجود دارد.", "POST_SLUG_TAKEN");
  }
}
