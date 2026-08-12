import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";

import { verifyAccessToken, type AccessTokenPayload } from "./token.service.js";

/** اندپوینت‌هایی که بدون ورود هم قابل دسترسی‌اند (کاتالوگ عمومی، سلامت). */
export const IS_PUBLIC_KEY = "isPublicRoute";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export interface AuthenticatedRequest extends Request {
  user?: AccessTokenPayload;
}

/**
 * گارد احراز هویت.
 *
 * به صورت **سراسری** ثبت می‌شود و مسیرها باید صریحاً با `@Public()`
 * از آن معاف شوند. عکس این حالت — گارد اختیاری روی هر کنترلر — یعنی
 * اندپوینت جدیدی که یادت برود محافظتش کنی، بی‌سر و صدا باز می‌ماند.
 * با این ترتیب، فراموشی به سمت امن می‌افتد.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException({
        code: "UNAUTHENTICATED",
        message: "برای این عملیات باید وارد شوید.",
      });
    }

    const payload = await verifyAccessToken(token);

    if (!payload) {
      throw new UnauthorizedException({
        code: "INVALID_TOKEN",
        message: "نشست شما معتبر نیست یا منقضی شده است.",
      });
    }

    request.user = payload;
    return true;
  }
}

function extractBearerToken(request: Request): string | null {
  const header = request.header("authorization");
  if (!header) return null;

  const [scheme, value] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !value) return null;

  return value;
}

/**
 * فقط برای ادمین‌ها.
 *
 * پس از `AuthGuard` سراسری اجرا می‌شود، پس `request.user` از قبل نشسته
 * و امضای توکن بررسی شده است. نبودنش یعنی مسیر به اشتباه `@Public()`
 * شده — که برای مسیر ادمین بدترین حالت ممکن است، پس همان‌جا رد می‌شود.
 *
 * پاسخ **۴۰۳** است نه ۴۰۱. تفاوتشان اینجا رفتاری است، نه سلیقه‌ای:
 * `apiFetch` در فرانت هر ۴۰۱ را «نشست منقضی شد» می‌خواند، یک بار تمدید
 * می‌کند و اگر باز ۴۰۱ گرفت کاربر را بیرون می‌اندازد. با ۴۰۱، کاربر
 * عادی‌ای که آدرس `/admin` را باز می‌کرد از حسابش خارج می‌شد — که نه
 * درست است و نه قابل تشخیص از یک خرابی واقعی.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.user) {
      throw new UnauthorizedException({
        code: "UNAUTHENTICATED",
        message: "برای این عملیات باید وارد شوید.",
      });
    }

    if (!request.user.isAdmin) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "این بخش فقط برای مدیران است.",
      });
    }

    return true;
  }
}
