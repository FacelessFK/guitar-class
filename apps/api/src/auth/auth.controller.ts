import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Injectable,
  Post,
} from "@nestjs/common";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { toLocalPhone } from "@music/shared";

import { db } from "../db/client.js";
import { users } from "../db/schema/index.js";
import { zodPipe } from "../common/validation.pipe.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { Public, type AuthenticatedRequest } from "./auth.guard.js";
import { requestLoginCode, refreshSession, verifyLoginCode } from "./auth.service.js";
import { revokeAllUserTokens, revokeRefreshToken, type AccessTokenPayload } from "./token.service.js";
import { createSmsSender, type SmsSender } from "../notification/sms.port.js";

@Injectable()
export class AuthProvider {
  /**
   * فرستنده‌ی پیامک یک بار هنگام بالا آمدن انتخاب می‌شود.
   *
   * اگر در تولید کلید API نباشد، همین‌جا برنامه بالا نمی‌آید — به‌جای
   * اینکه بی‌صدا به آداپتور کنسول برگردد و کد ورود همه‌ی کاربران را
   * در لاگ بنویسد.
   */
  readonly sms: SmsSender = createSmsSender();
}

const requestCodeSchema = z.object({
  phone: z.string().min(1, "شماره‌ی موبایل لازم است").max(20),
});

const verifyCodeSchema = z.object({
  phone: z.string().min(1).max(20),
  code: z.string().regex(/^\d{6}$/, "کد باید شش رقم باشد"),
  /** فقط برای کاربر تازه لازم است */
  fullName: z.string().trim().min(2, "نام باید حداقل دو حرف باشد").max(120).optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthProvider) {}

  /**
   * درخواست کد ورود.
   *
   * پاسخ عمداً نمی‌گوید شماره از قبل ثبت شده یا نه — وگرنه می‌شود با
   * پیمایش شماره‌ها فهمید چه کسانی کاربر پلتفرم‌اند.
   */
  @Public()
  @Post("otp/request")
  @HttpCode(HttpStatus.OK)
  async requestCode(
    @Body(zodPipe(requestCodeSchema)) body: z.infer<typeof requestCodeSchema>,
  ): Promise<{ message: string; retryAfterSeconds: number; devCode?: string }> {
    const result = await requestLoginCode(body.phone, this.auth.sms);

    return {
      message: "کد ورود پیامک شد.",
      retryAfterSeconds: result.retryAfterSeconds,
      ...(result.devCode ? { devCode: result.devCode } : {}),
    };
  }

  /** بررسی کد و ورود. اگر شماره تازه باشد، حساب ساخته می‌شود. */
  @Public()
  @Post("otp/verify")
  @HttpCode(HttpStatus.OK)
  async verifyCode(
    @Body(zodPipe(verifyCodeSchema)) body: z.infer<typeof verifyCodeSchema>,
    @Headers("user-agent") userAgent?: string,
  ) {
    const result = await verifyLoginCode({ ...body, userAgent });

    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
      user: {
        ...result.user,
        phone: toLocalPhone(result.user.phone),
      },
    };
  }

  /**
   * تمدید نشست.
   *
   * توکن تازه‌سازی می‌چرخد: توکن قدیمی همین‌جا باطل می‌شود و یکی جدید
   * برمی‌گردد. پس هر توکن فقط یک بار قابل استفاده است.
   */
  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body(zodPipe(refreshSchema)) body: z.infer<typeof refreshSchema>,
    @Headers("user-agent") userAgent?: string,
  ) {
    const result = await refreshSession(body.refreshToken, userAgent);

    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
      user: { ...result.user, phone: toLocalPhone(result.user.phone) },
    };
  }

  /** خروج از همین دستگاه. */
  @Public()
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(
    @Body(zodPipe(refreshSchema)) body: z.infer<typeof refreshSchema>,
  ): Promise<{ message: string }> {
    await revokeRefreshToken(body.refreshToken);
    // چه توکن معتبر بوده و چه نه، پاسخ یکی است — وگرنه می‌شود اعتبار
    // توکن را با همین اندپوینت آزمود
    return { message: "از حساب خارج شدید." };
  }

  /** خروج از همه‌ی دستگاه‌ها. */
  @Post("logout-all")
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<{ message: string; revokedSessions: number }> {
    const count = await revokeAllUserTokens(user.userId);
    return { message: "از همه‌ی دستگاه‌ها خارج شدید.", revokedSessions: count };
  }

  /** پروفایل کاربر واردشده. */
  @Get("me")
  async me(@CurrentUser() user: AccessTokenPayload) {
    const [row] = await db
      .select({
        id: users.id,
        phone: users.phone,
        fullName: users.fullName,
        avatarUrl: users.avatarUrl,
        isAdmin: users.isAdmin,
        trialUsedAt: users.trialUsedAt,
      })
      .from(users)
      .where(eq(users.id, user.userId))
      .limit(1);

    if (!row) return null;

    return {
      ...row,
      phone: toLocalPhone(row.phone),
      trialUsed: row.trialUsedAt !== null,
    };
  }
}

export type { AuthenticatedRequest };
