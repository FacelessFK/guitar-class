import {
  Catch,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Response } from "express";

import { BookingError, PackageConflictError } from "../booking/errors.js";

/**
 * خطاهای دامنه‌ی رزرو را به پاسخ HTTP تبدیل می‌کند.
 *
 * پیام‌ها از قبل فارسی و قابل نمایش‌اند، پس همان‌ها را می‌فرستیم به‌علاوه‌ی
 * یک `code` ماشین‌خوان تا فرانت بدون تکیه بر متن تصمیم بگیرد.
 *
 * توجه: خطاهای `CHECK` دیتابیس عمداً به اینجا نمی‌رسند. آن‌ها نشانه‌ی
 * باگ برنامه‌نویسی‌اند نه خطای کاربر، پس خام بالا می‌روند و ۵۰۰ می‌شوند
 * تا در لاگ دیده شوند.
 */
const STATUS_BY_CODE: Record<string, HttpStatus> = {
  SLOT_UNAVAILABLE: HttpStatus.CONFLICT,
  STUDENT_BUSY: HttpStatus.CONFLICT,
  PACKAGE_CONFLICT: HttpStatus.CONFLICT,
  TRIAL_ALREADY_USED: HttpStatus.CONFLICT,
  NOT_CANCELLABLE: HttpStatus.CONFLICT,
  OFFERING_NOT_FOUND: HttpStatus.NOT_FOUND,
  BOOKING_NOT_FOUND: HttpStatus.NOT_FOUND,
  NOT_PARTICIPANT: HttpStatus.FORBIDDEN,
};

@Catch(BookingError)
export class BookingExceptionFilter implements ExceptionFilter<BookingError> {
  catch(exception: BookingError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.BAD_REQUEST;

    const body: Record<string, unknown> = {
      code: exception.code,
      message: exception.message,
    };

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
