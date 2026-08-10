import {
  Catch,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Response } from "express";

import { AuthError } from "../auth/auth.service.js";

/**
 * خطاهای احراز هویت را به پاسخ HTTP تبدیل می‌کند.
 *
 * محدودسازی نرخ، `429` با هدر `Retry-After` می‌گیرد تا کلاینت بداند
 * دقیقاً چقدر صبر کند و شمارش معکوس نشان دهد.
 */
const STATUS_BY_CODE: Record<string, HttpStatus> = {
  INVALID_PHONE: HttpStatus.BAD_REQUEST,
  FULL_NAME_REQUIRED: HttpStatus.BAD_REQUEST,
  COOLDOWN: HttpStatus.TOO_MANY_REQUESTS,
  HOURLY_LIMIT: HttpStatus.TOO_MANY_REQUESTS,
  TOO_MANY_ATTEMPTS: HttpStatus.TOO_MANY_REQUESTS,
  INVALID_CODE: HttpStatus.UNAUTHORIZED,
  NO_ACTIVE_CODE: HttpStatus.UNAUTHORIZED,
  INVALID_REFRESH_TOKEN: HttpStatus.UNAUTHORIZED,
  ACCOUNT_SUSPENDED: HttpStatus.FORBIDDEN,
  ACCOUNT_UNAVAILABLE: HttpStatus.FORBIDDEN,
};

@Catch(AuthError)
export class AuthExceptionFilter implements ExceptionFilter<AuthError> {
  catch(exception: AuthError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.BAD_REQUEST;

    if (exception.retryAfterSeconds !== undefined) {
      response.setHeader("Retry-After", String(exception.retryAfterSeconds));
    }

    response.status(status).json({
      code: exception.code,
      message: exception.message,
      ...(exception.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: exception.retryAfterSeconds }
        : {}),
    });
  }
}
