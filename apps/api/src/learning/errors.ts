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
