import {
  Catch,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Response } from "express";

import { PayoutExceedsBalanceError } from "../admin/errors.js";
import { PackageConflictError } from "../booking/errors.js";
import { RoomNotOpenYetError } from "../classroom/errors.js";
import { DomainError } from "./domain-error.js";

/**
 * خطاهای دامنه را به پاسخ HTTP تبدیل می‌کند.
 *
 * پیام‌ها از قبل فارسی و قابل نمایش‌اند، پس همان‌ها را می‌فرستیم به‌علاوه‌ی
 * یک `code` ماشین‌خوان تا فرانت بدون تکیه بر متن تصمیم بگیرد.
 *
 * توجه: خطاهای `CHECK` دیتابیس عمداً به اینجا نمی‌رسند. آن‌ها نشانه‌ی
 * باگ برنامه‌نویسی‌اند نه خطای کاربر، پس خام بالا می‌روند و ۵۰۰ می‌شوند
 * تا در لاگ دیده شوند.
 *
 * خطاهای احراز هویت فیلتر جدا دارند چون هدر `Retry-After` می‌فرستند.
 */
const STATUS_BY_CODE: Record<string, HttpStatus> = {
  // رزرو
  SLOT_UNAVAILABLE: HttpStatus.CONFLICT,
  STUDENT_BUSY: HttpStatus.CONFLICT,
  PACKAGE_CONFLICT: HttpStatus.CONFLICT,
  TRIAL_ALREADY_USED: HttpStatus.CONFLICT,
  NOT_CANCELLABLE: HttpStatus.CONFLICT,
  OFFERING_NOT_FOUND: HttpStatus.NOT_FOUND,
  BOOKING_NOT_FOUND: HttpStatus.NOT_FOUND,
  NOT_PARTICIPANT: HttpStatus.FORBIDDEN,

  // کلاس
  // «هنوز باز نشده» و «بسته شده» تعارض با وضعیت فعلی‌اند نه خطای ورودی،
  // پس ۴۰۹ می‌گیرند مثل بقیه‌ی تعارض‌های این سیستم.
  ROOM_NOT_OPEN: HttpStatus.CONFLICT,
  ROOM_CLOSED: HttpStatus.CONFLICT,
  NOT_JOINABLE: HttpStatus.CONFLICT,

  // پنل استاد
  // «استاد نیستی» ۴۰۳ است نه ۴۰۴: کاربر معتبر است و مسیر هم وجود دارد،
  // فقط این بخش مال او نیست.
  NOT_A_TEACHER: HttpStatus.FORBIDDEN,
  AVAILABILITY_ENTRY_NOT_FOUND: HttpStatus.NOT_FOUND,
  OVERLAPPING_RULE: HttpStatus.CONFLICT,
  ALREADY_A_TEACHER: HttpStatus.CONFLICT,
  TEACHER_SLUG_TAKEN: HttpStatus.CONFLICT,

  // حلقه‌ی یادگیری
  // «هستی ولی طرفِ دیگرش» — ۴۰۳ مثل بقیه‌ی خطاهای نقش
  TEACHER_ONLY: HttpStatus.FORBIDDEN,
  STUDENT_ONLY: HttpStatus.FORBIDDEN,
  COMPLETION_STUDENT_ONLY: HttpStatus.FORBIDDEN,
  ASSIGNMENT_NOT_FOUND: HttpStatus.NOT_FOUND,
  SUBMISSION_NOT_FOUND: HttpStatus.NOT_FOUND,
  ATTACHMENT_NOT_FOUND: HttpStatus.NOT_FOUND,
  SESSION_NOT_TEACHABLE: HttpStatus.CONFLICT,
  // درخواست درست است ولی با حالت فعلیِ اجرا نمی‌خواند — مثل بقیه‌ی ۴۰۹ها
  SUBMISSION_HAS_FEEDBACK: HttpStatus.CONFLICT,

  // نظرِ هنرجو به استاد
  // «جلسه هنوز تمام نشده» و «نظر تکراری» تعارض با حالت فعلی‌اند، پس ۴۰۹
  SESSION_NOT_REVIEWABLE: HttpStatus.CONFLICT,
  REVIEW_ALREADY_EXISTS: HttpStatus.CONFLICT,

  // رسانه
  UNSUPPORTED_MEDIA: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
  MEDIA_TICKET_INVALID: HttpStatus.CONFLICT,

  // بلاگ
  POST_NOT_FOUND: HttpStatus.NOT_FOUND,
  POST_SLUG_TAKEN: HttpStatus.CONFLICT,

  // پنل ادمین
  ADMIN_RECORD_NOT_FOUND: HttpStatus.NOT_FOUND,
  INSTRUMENT_SLUG_TAKEN: HttpStatus.CONFLICT,
  OFFERING_EXISTS: HttpStatus.CONFLICT,
  PAYOUT_EXCEEDS_BALANCE: HttpStatus.CONFLICT,
  PAYOUT_NOT_PENDING: HttpStatus.CONFLICT,

  // پرداخت
  ORDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  NOT_PAYABLE: HttpStatus.CONFLICT,
  HOLD_EXPIRED: HttpStatus.CONFLICT,
  NOT_ORDER_OWNER: HttpStatus.FORBIDDEN,
  VERIFICATION_FAILED: HttpStatus.PAYMENT_REQUIRED,
  GATEWAY_UNREACHABLE: HttpStatus.BAD_GATEWAY,
};

@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter<DomainError> {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.BAD_REQUEST;

    const body: Record<string, unknown> = {
      code: exception.code,
      message: exception.message,
    };

    // «اتاق هنوز باز نشده» باید بگوید کِی باز می‌شود، تا فرانت شمارش
    // معکوس نشان دهد به‌جای اینکه کاربر دکمه را بی‌هدف تکرار کند
    if (exception instanceof RoomNotOpenYetError) {
      body.opensAt = exception.opensAt.toISOString();
    }

    // مبلغ تسویه که رد شده باید بگوید مانده‌ی واقعی چقدر است، وگرنه
    // ادمین باید صفحه را ببندد و از جای دیگری عدد را پیدا کند.
    // رشته می‌رود نه عدد، چون `bigint` را `JSON.stringify` پرت می‌کند.
    if (exception instanceof PayoutExceedsBalanceError) {
      body.outstanding = exception.outstanding.toString();
    }

    // تداخل پکیج باید بگوید دقیقاً کدام هفته‌ها مشکل دارند، تا هنرجو
    // بتواند ساعت دیگری انتخاب کند به‌جای دیدن یک پیام کلی
    if (exception instanceof PackageConflictError) {
      body.conflicts = exception.conflicts.map((conflict) => ({
        sessionIndex: conflict.index,
        date: conflict.date,
        scheduledAt: new Date(conflict.start.start).toISOString(),
      }));
    }

    response.status(status).json(body);
  }
}
