import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Injectable,
  Patch,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { toLocalPhone } from "@music/shared";

import { db } from "../db/client.js";
import { users } from "../db/schema/index.js";
import { zodPipe } from "../common/validation.pipe.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { Public, type AuthenticatedRequest } from "./auth.guard.js";
import { AuthError, requestLoginCode, refreshSession, verifyLoginCode } from "./auth.service.js";
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from "./refresh-cookie.js";
import { updateOwnProfile, type ProfileUpdate } from "./profile.service.js";
import { revokeAllUserTokens, revokeRefreshToken, type AccessTokenPayload } from "./token.service.js";
import { createSmsSender, type SmsSender } from "../notification/sms.port.js";
import { findTeacherProfileId } from "../teacher/teacher.service.js";

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

/**
 * توکن تازه‌سازی دیگر از بدنه نمی‌آید.
 *
 * در کوکی `httpOnly` است و مرورگر خودش می‌فرستدش؛ جاوااسکریپت اصلاً
 * نمی‌بیندش. پس `refresh` و `logout` بدنه‌ی ورودی ندارند و اسکیمای
 * قبلی حذف شد — نگه داشتنِ یک مسیرِ جایگزین در بدنه یعنی همان توکنی که
 * از دسترس XSS بیرون بردیم، دوباره در دسترسش باشد.
 */

/**
 * ویرایش پروفایل.
 *
 * `avatarObjectKey` کلید است نه نشانی — قاعده‌ی ثابت هر اندپوینتی که
 * فایل می‌گیرد. `null` صریح یعنی «عکس را بردار»، و با نفرستادنِ فیلد
 * فرق دارد که یعنی «دست نزن».
 *
 * شماره‌ی موبایل عمداً نیست: هویتِ ورود است، نه یک فیلد پروفایل.
 */
const updateProfileSchema = z
  .object({
    fullName: z.string().trim().min(2, "نام باید حداقل دو حرف باشد").max(120).optional(),
    avatarObjectKey: z.string().trim().min(1).max(300).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "چیزی برای تغییر فرستاده نشده است",
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

  /**
   * بررسی کد و ورود. اگر شماره تازه باشد، حساب ساخته می‌شود.
   *
   * توکن تازه‌سازی در کوکی `httpOnly` می‌رود و **در بدنه نمی‌آید**.
   * توکن دسترسی در بدنه می‌ماند چون فرانت باید در هدر `Authorization`
   * حملش کند و عمرش ۱۵ دقیقه است.
   */
  @Public()
  @Post("otp/verify")
  @HttpCode(HttpStatus.OK)
  async verifyCode(
    @Body(zodPipe(verifyCodeSchema)) body: z.infer<typeof verifyCodeSchema>,
    @Res({ passthrough: true }) response: Response,
    @Headers("user-agent") userAgent?: string,
  ) {
    const result = await verifyLoginCode({ ...body, userAgent });

    setRefreshCookie(response, result.refreshToken, result.refreshExpiresAt);

    return {
      accessToken: result.accessToken,
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
   * در کوکی می‌نشیند. پس هر توکن فقط یک بار قابل استفاده است — با یک
   * پنجره‌ی چندثانیه‌ای که در `token.service.ts` توضیح داده شده و
   * جلوی بیرون افتادنِ تبِ دوم را می‌گیرد.
   */
  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Headers("user-agent") userAgent?: string,
  ) {
    const token = readRefreshCookie(request);

    if (!token) {
      throw new AuthError("نشست شما منقضی شده است. دوباره وارد شوید.", "NO_REFRESH_TOKEN");
    }

    const result = await refreshSession(token, userAgent);

    setRefreshCookie(response, result.refreshToken, result.refreshExpiresAt);

    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: { ...result.user, phone: toLocalPhone(result.user.phone) },
    };
  }

  /** خروج از همین دستگاه. */
  @Public()
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ message: string }> {
    const token = readRefreshCookie(request);

    if (token) await revokeRefreshToken(token);

    // کوکی در هر حالت پاک می‌شود، حتی اگر توکنی نبوده
    clearRefreshCookie(response);

    // چه توکن معتبر بوده و چه نه، پاسخ یکی است — وگرنه می‌شود اعتبار
    // توکن را با همین اندپوینت آزمود
    return { message: "از حساب خارج شدید." };
  }

  /** خروج از همه‌ی دستگاه‌ها. */
  @Post("logout-all")
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @CurrentUser() user: AccessTokenPayload,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ message: string; revokedSessions: number }> {
    const count = await revokeAllUserTokens(user.userId);

    // این دستگاه هم جزو «همه» است؛ بدون این، کوکیِ باطل‌شده می‌ماند و
    // اولین تمدید بی‌دلیل یک درخواست شکست‌خورده می‌شود
    clearRefreshCookie(response);

    return { message: "از همه‌ی دستگاه‌ها خارج شدید.", revokedSessions: count };
  }

  /**
   * پروفایل کاربر واردشده.
   *
   * `teacherProfileId` هم برمی‌گردد چون فرانت در همان اولین درخواستِ
   * راه‌اندازی نشست باید بداند کدام بخش‌ها را نشان دهد. یک درخواست
   * جدا برای «آیا استاد هستم؟» یعنی پوسته‌ی اپ دو بار جابه‌جا شود.
   *
   * فقط شناسه می‌آید نه کل پروفایل: جزئیات استاد را `GET /api/teacher/me`
   * می‌دهد و فقط پنل استاد لازمش دارد.
   */
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
      teacherProfileId: await findTeacherProfileId(row.id),
    };
  }

  /**
   * ویرایش نام و عکس پروفایل.
   *
   * روی `auth` نشسته و نه یک ماژول `users` تازه، به همان دلیلی که سند
   * معماری برای نداشتن آن ماژول آورده: تنها داده‌ی کاربر که مسیر
   * نوشتنی می‌خواهد همین دو فیلد است، و کنارِ `GET me` جای طبیعی‌اش
   * است. شناسه از نشست می‌آید، پس کسی نمی‌تواند پروفایل دیگری را
   * عوض کند.
   */
  @Patch("me")
  async updateMe(
    @CurrentUser() user: AccessTokenPayload,
    @Body(zodPipe(updateProfileSchema)) body: z.infer<typeof updateProfileSchema>,
  ): Promise<ProfileUpdate> {
    return updateOwnProfile(user.userId, body);
  }
}

export type { AuthenticatedRequest };
