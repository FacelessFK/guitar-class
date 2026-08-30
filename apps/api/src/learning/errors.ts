import { DomainError } from "../common/domain-error.js";

/** خطاهای دامنه‌ی حلقه‌ی یادگیری. */
export class LearningError extends DomainError {}

/**
 * این کار فقط از استادِ همان جلسه برمی‌آید.
 *
 * جدا از `NOT_PARTICIPANT` است: آن یکی یعنی «تو اصلاً طرف این جلسه
 * نیستی»، این یعنی «هستی، ولی طرفِ دیگرش». هنرجویی که تلاش کند نکات
 * جلسه‌ی خودش را بنویسد باید بفهمد چرا نمی‌شود، نه اینکه فکر کند جلسه
 * مال او نیست.
 */
export class TeacherOnlyActionError extends LearningError {
  constructor() {
    super("این بخش را فقط استاد همین جلسه می‌تواند بنویسد.", "TEACHER_ONLY");
  }
}

/** اجرای هنرجو را فقط خودِ هنرجو آپلود می‌کند. */
export class StudentOnlyActionError extends LearningError {
  constructor() {
    super("اجرای تمرین را فقط هنرجوی همین جلسه می‌تواند بفرستد.", "STUDENT_ONLY");
  }
}

/** تکمیل دستی مال هنرجوی همان رزرو است، نه استاد. */
export class StudentCompletionOnlyActionError extends LearningError {
  constructor() {
    super(
      "فقط هنرجوی همین جلسه می‌تواند وضعیت انجام تمرین را تغییر دهد.",
      "COMPLETION_STUDENT_ONLY",
    );
  }
}

export class AssignmentNotFoundError extends LearningError {
  constructor() {
    super("این تمرین پیدا نشد.", "ASSIGNMENT_NOT_FOUND");
  }
}

export class SubmissionNotFoundError extends LearningError {
  constructor() {
    super("این اجرا پیدا نشد.", "SUBMISSION_NOT_FOUND");
  }
}

/**
 * اجرایی که بازخورد گرفته حذف نمی‌شود.
 *
 * حذفش بازخورد را هم می‌برد (کاسکید) و در تاریخچه‌ی یادگیری سوراخ
 * می‌سازد — همان چیزی که سیاست نگه‌داری با «فایل را ببر، سطر را نگه
 * دار» عمداً از آن پرهیز می‌کند. برای همین اینجا هم سطر نمی‌رود.
 */
export class SubmissionHasFeedbackError extends LearningError {
  constructor() {
    super(
      "این اجرا بازخورد گرفته و دیگر حذف نمی‌شود. اجرای تازه بفرستید.",
      "SUBMISSION_HAS_FEEDBACK",
    );
  }
}

export class AttachmentNotFoundError extends LearningError {
  constructor() {
    super("این پیوست در تمرین پیدا نشد.", "ATTACHMENT_NOT_FOUND");
  }
}

/**
 * تمرین برای جلسه‌ای که هنوز برگزار نشده.
 *
 * حلقه‌ی یادگیری بعد از کلاس شروع می‌شود: نکات جلسه و برنامه‌ی تمرین
 * حاصل همان کلاس‌اند. تمرین دادن روی جلسه‌ای که هنوز `CONFIRMED` است
 * تقریباً همیشه یعنی استاد شناسه‌ی جلسه‌ی اشتباهی را باز کرده.
 *
 * جلسه‌ی لغوشده هم رد می‌شود؛ آن دیگر هیچ‌وقت کلاسی نداشت.
 */
export class SessionNotTeachableYetError extends LearningError {
  constructor(status: string) {
    super(
      status === "COMPLETED" || status === "IN_PROGRESS"
        ? "این جلسه هنوز آماده‌ی ثبت نکات نیست."
        : `برای جلسه‌ای در وضعیت «${status}» نمی‌شود تمرین یا نکته ثبت کرد.`,
      "SESSION_NOT_TEACHABLE",
    );
  }
}
