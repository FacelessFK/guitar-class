import { DomainError } from "../common/domain-error.js";

/** خطاهای دامنه‌ی پنل استاد. */
export class TeacherError extends DomainError {}

/**
 * کاربر واردشده پروفایل استاد ندارد.
 *
 * ۴۰۳ می‌گیرد نه ۴۰۴: کاربر معتبر است و مسیر هم وجود دارد، فقط این
 * بخش مال او نیست. فرانت از روی `teacherProfileId` در `auth/me` از
 * قبل می‌داند و اصلاً این مسیرها را نشان نمی‌دهد؛ این پیام برای
 * درخواست مستقیم است.
 */
export class NotATeacherError extends TeacherError {
  constructor() {
    super("این بخش فقط برای استادهاست.", "NOT_A_TEACHER");
  }
}

/**
 * قانون یا استثنایی که پاک می‌شود باید مال خودِ همین استاد باشد.
 *
 * «مال کس دیگری است» و «اصلاً وجود ندارد» عمداً یک پیام می‌گیرند،
 * وگرنه می‌شود با آزمودن شناسه‌ها فهمید چه رکوردهایی در سیستم هست.
 */
export class AvailabilityEntryNotFoundError extends TeacherError {
  constructor() {
    super("این مورد در برنامه‌ی شما پیدا نشد.", "AVAILABILITY_ENTRY_NOT_FOUND");
  }
}

/**
 * قانون تازه با یک قانون موجود روی همان روز هفته هم‌پوشانی دارد.
 *
 * موتور دسترس‌پذیری پنجره‌های هم‌پوشان را ادغام می‌کند، پس این حالت
 * چیزی را خراب نمی‌کند — ولی استاد در فهرستش دو سطر می‌بیند که با هم
 * یک بازه‌ی سوم می‌سازند و هیچ‌کدام آن را نشان نمی‌دهد. رد کردنش
 * فهرست را با واقعیت یکی نگه می‌دارد.
 */
export class OverlappingRuleError extends TeacherError {
  constructor() {
    super(
      "این بازه با یکی از بازه‌های موجود در همان روز هم‌پوشانی دارد. اول آن را حذف کنید.",
      "OVERLAPPING_RULE",
    );
  }
}
