import {
  UnauthorizedException,
  createParamDecorator,
  type ExecutionContext,
} from "@nestjs/common";

import type { AuthenticatedRequest } from "../auth/auth.guard.js";

/**
 * شناسه‌ی کاربر واردشده.
 *
 * مقدار را `AuthGuard` سراسری روی درخواست گذاشته و امضای JWT را از
 * قبل بررسی کرده است. اگر اینجا کاربری نباشد یعنی مسیر به اشتباه
 * `@Public()` شده — پس به‌جای برگرداندن `undefined`، صریح خطا می‌دهیم.
 *
 * تا پیش از ساخته شدن احراز هویت، همین دکوراتور شناسه را از هدر
 * `x-user-id` می‌خواند. جایگزینی آن هیچ کنترلری را تغییر نداد، که هدف
 * از محصور کردنش در یک جا بود.
 */
export const CurrentUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.user) {
      throw new UnauthorizedException({
        code: "UNAUTHENTICATED",
        message: "برای این عملیات باید وارد شوید.",
      });
    }

    return request.user.userId;
  },
);

/** اطلاعات کامل کاربر واردشده، شامل نقش مدیریت. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.user) {
      throw new UnauthorizedException({
        code: "UNAUTHENTICATED",
        message: "برای این عملیات باید وارد شوید.",
      });
    }

    return request.user;
  },
);
