import { DomainError } from "../common/domain-error.js";

/** خطاهای دامنه‌ی کلاس. */
export class ClassroomError extends DomainError {}

/**
 * هنوز زود است.
 *
 * لحظه‌ی باز شدن هم برمی‌گردد تا فرانت بتواند شمارش معکوس نشان دهد
 * به‌جای اینکه کاربر دکمه را بی‌هدف بزند.
 */
export class RoomNotOpenYetError extends ClassroomError {
  constructor(readonly opensAt: Date) {
    super(
      "اتاق کلاس هنوز باز نشده است. از ۱۰ دقیقه پیش از شروع جلسه می‌توانید وارد شوید.",
      "ROOM_NOT_OPEN",
    );
  }
}

/** جلسه تمام شده و مهلت پس از آن هم گذشته است. */
export class RoomClosedError extends ClassroomError {
  constructor() {
    super("زمان این جلسه به پایان رسیده و اتاق کلاس بسته شده است.", "ROOM_CLOSED");
  }
}

/**
 * وضعیت رزرو اجازه‌ی ورود نمی‌دهد.
 *
 * پیام بر اساس وضعیت فرق می‌کند، چون «هنوز پرداخت نکرده‌ای» و «این جلسه
 * لغو شده» دو کار کاملاً متفاوت از کاربر می‌خواهند. یک پیام عمومی،
 * هنرجویی را که فقط پرداخت نکرده سردرگم می‌کند.
 */
const REASON_BY_STATUS: Record<string, string> = {
  PENDING_PAYMENT:
    "این جلسه هنوز پرداخت نشده است. پس از پرداخت می‌توانید وارد کلاس شوید.",
  EXPIRED: "مهلت پرداخت این جلسه تمام شده و اسلات آزاد شده است.",
  CANCELLED_BY_STUDENT: "این جلسه لغو شده است.",
  CANCELLED_BY_TEACHER: "این جلسه توسط استاد لغو شده است.",
  COMPLETED: "این جلسه برگزار شده و به پایان رسیده است.",
  NO_SHOW_STUDENT: "این جلسه با عدم حضور ثبت شده است.",
  NO_SHOW_TEACHER: "این جلسه با عدم حضور ثبت شده است.",
};

export class BookingNotJoinableError extends ClassroomError {
  constructor(status: string) {
    super(
      REASON_BY_STATUS[status] ?? `این جلسه در وضعیت فعلی قابل ورود نیست (${status}).`,
      "NOT_JOINABLE",
    );
  }
}
