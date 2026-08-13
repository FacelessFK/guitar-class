import type { NormalizedPhone } from "@music/shared";

import { redis } from "../redis/client.js";

/**
 * محدودیت تلاش برای ورود با رمز.
 *
 * کد پیامکی از خودش محافظت دارد: دو دقیقه عمر می‌کند و بعد از پنج
 * تلاش باطل می‌شود. رمز عبور هیچ‌کدام را ندارد — تا وقتی کاربر عوضش
 * نکرده معتبر است — پس تنها چیزی که بین یک رمز ضعیف و یک اسکریپت
 * می‌ایستد همین شمارنده است.
 *
 * قفل روی **شماره** است و نه روی IP. یک مهاجم IP عوض می‌کند؛ شماره‌ی
 * هدف را نه. عوارضش این است که کسی می‌تواند با تلاش عمدی، حساب دیگری
 * را موقتاً قفل کند — برای همین قفل کوتاه است و با ورود موفق پاک
 * می‌شود، و **راه ورود با کد پیامکی باز می‌ماند**. یعنی قفل، صاحب حساب
 * را بیرون نمی‌گذارد، فقط حدس زدن رمز را گران می‌کند.
 */

export const PASSWORD_LOGIN_LIMIT = {
  /** تلاش ناموفق پیش از قفل */
  MAX_ATTEMPTS: 8,
  /** پنجره‌ای که تلاش‌ها در آن شمرده می‌شوند */
  WINDOW_SECONDS: 15 * 60,
  /** مدت قفل پس از پر شدن سقف */
  LOCK_SECONDS: 15 * 60,
} as const;

const keys = {
  attempts: (phone: string) => `pwd:attempts:${phone}`,
  lock: (phone: string) => `pwd:lock:${phone}`,
};

export type LoginGate = { ok: true } | { ok: false; retryAfterSeconds: number };

/**
 * آیا این شماره اجازه‌ی تلاش دارد؟
 *
 * پیش از هر کار دیگری صدا زده می‌شود — از جمله پیش از خواندن کاربر از
 * دیتابیس، تا شمارنده به وجود داشتن حساب گره نخورد.
 */
export async function checkLoginAllowed(phone: NormalizedPhone): Promise<LoginGate> {
  const ttl = await redis.ttl(keys.lock(phone));

  if (ttl > 0) {
    return { ok: false, retryAfterSeconds: ttl };
  }

  return { ok: true };
}

/**
 * تلاش ناموفق را می‌شمارد و در صورت رسیدن به سقف، قفل می‌کند.
 *
 * پنجره با اولین تلاش شروع می‌شود و **با تلاش‌های بعدی جلو نمی‌رود**:
 * `EXPIRE` فقط وقتی گذاشته می‌شود که شمارنده تازه ساخته شده باشد.
 * وگرنه یک تلاش در هر چهارده دقیقه، پنجره را تا ابد زنده نگه می‌دارد
 * و سقف هیچ‌وقت پر نمی‌شود.
 */
export async function recordFailedLogin(phone: NormalizedPhone): Promise<void> {
  const attempts = await redis.incr(keys.attempts(phone));

  if (attempts === 1) {
    await redis.expire(keys.attempts(phone), PASSWORD_LOGIN_LIMIT.WINDOW_SECONDS);
  }

  if (attempts >= PASSWORD_LOGIN_LIMIT.MAX_ATTEMPTS) {
    await redis
      .multi()
      .set(keys.lock(phone), "1", "EX", PASSWORD_LOGIN_LIMIT.LOCK_SECONDS)
      .del(keys.attempts(phone))
      .exec();
  }
}

/** ورود موفق، تاریخچه را پاک می‌کند. */
export async function clearLoginAttempts(phone: NormalizedPhone): Promise<void> {
  await redis.del(keys.attempts(phone), keys.lock(phone));
}
