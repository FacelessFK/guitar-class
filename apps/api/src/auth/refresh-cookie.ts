import type { Request, Response } from "express";

import { isProduction } from "../config/env.js";

/**
 * توکن تازه‌سازی در کوکی `httpOnly`.
 *
 * تا پیش از این، API توکن را در بدنه‌ی JSON برمی‌گرداند و فرانت در
 * `localStorage` نگهش می‌داشت — یعنی هر آسیب‌پذیری XSS می‌توانست نشستِ
 * سی‌روزه‌ی کاربر را بردارد و ببرد. کوکی `httpOnly` را جاوااسکریپت
 * اصلاً نمی‌بیند، پس همان XSS دیگر به توکن نمی‌رسد.
 *
 * توکن **دسترسی** عمداً کوکی نشد و در حافظه‌ی جاوااسکریپت می‌ماند: عمرش
 * ۱۵ دقیقه است، در هدر `Authorization` می‌رود، و کوکی کردنش یعنی هر
 * درخواست به‌صورت خودکار احراز هویت شود — که همان چیزی است که CSRF از
 * آن تغذیه می‌کند. با این تقسیم، تنها درخواست‌هایی که کوکی حمل می‌کنند
 * سه اندپوینت زیرِ `/api/auth` هستند و هیچ‌کدام عملیات دامنه‌ای انجام
 * نمی‌دهند.
 */

export const REFRESH_COOKIE = "music_refresh";

/**
 * مسیر کوکی به `/api/auth` محدود است.
 *
 * یعنی مرورگر آن را روی هیچ درخواست دیگری — رزرو، پرداخت، آپلود —
 * نمی‌فرستد. هم سطح حمله کوچک‌تر می‌شود و هم هر درخواست دیگری چند صد
 * بایت سبک‌تر.
 */
const COOKIE_PATH = "/api/auth";

/**
 * ⚠️ **API باید روی همان دامنه‌ی ثبت‌شده‌ی فرانت باشد** —
 * `api.example.com` کنار `example.com`.
 *
 * `SameSite=Lax` کوکی را روی درخواست‌های هم‌سایت می‌فرستد، و «سایت»
 * یعنی دامنه‌ی ثبت‌شده، نه مبدأ. پس زیردامنه‌ی متفاوت و پورت متفاوت
 * هر دو مشکلی ندارند (در توسعه هم `localhost:3000` به `localhost:4000`
 * کار می‌کند). ولی اگر روزی API روی دامنه‌ی **دیگری** برود، مرورگر کوکی
 * را نمی‌فرستد و تمدید نشست بی‌صدا شکست می‌خورد — که به شکل «کاربرها
 * مدام بیرون می‌افتند» دیده می‌شود، نه به شکل خطا. آن حالت
 * `SameSite=None` می‌خواهد که خودش الزامات دیگری دارد.
 *
 * `Secure` فقط در تولید روشن است: در توسعه سرور روی http بالا می‌آید و
 * کوکی `Secure` روی http ذخیره نمی‌شود.
 */
export function setRefreshCookie(response: Response, token: string, expiresAt: Date): void {
  response.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: COOKIE_PATH,
    expires: expiresAt,
  });
}

/**
 * پاک کردن کوکی.
 *
 * `path` باید **دقیقاً** همان مسیر ست کردن باشد، وگرنه مرورگر کوکی
 * دیگری را هدف می‌گیرد و کوکی اصلی سر جایش می‌ماند — یعنی «خروج» که
 * سمت سرور توکن را باطل کرده ولی مرورگر هنوز یک کوکیِ مرده حمل می‌کند.
 */
export function clearRefreshCookie(response: Response): void {
  response.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: COOKIE_PATH,
  });
}

/**
 * خواندن کوکی از هدر خام.
 *
 * `cookie-parser` عمداً اضافه نشد: تنها کوکی این برنامه همین یکی است و
 * یک وابستگی و یک میدل‌ور سراسری برای یک مقدار، بهای بیشتری دارد از
 * این چند خط.
 */
export function readRefreshCookie(request: Request): string | null {
  const header = request.headers.cookie;
  if (!header) return null;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;

    if (part.slice(0, separator).trim() === REFRESH_COOKIE) {
      return decodeURIComponent(part.slice(separator + 1).trim()) || null;
    }
  }

  return null;
}
