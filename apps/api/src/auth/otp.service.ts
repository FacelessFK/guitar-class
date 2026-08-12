import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import type { NormalizedPhone } from "@music/shared";

import { redis } from "../redis/client.js";

/**
 * کدهای یک‌بارمصرف ورود.
 *
 * تصمیم‌های امنیتی این فایل و دلیلشان:
 *
 * ۱. کد **هش‌شده** ذخیره می‌شود، نه خام. اگر کسی به ردیس دسترسی پیدا
 *    کند، نباید بتواند به جای کاربران وارد شود.
 * ۲. مقایسه با `timingSafeEqual` انجام می‌شود تا از روی زمان پاسخ
 *    نشود کد را رقم به رقم حدس زد.
 * ۳. کد با `randomInt` تولید می‌شود که مولد امن رمزنگاری است، نه
 *    `Math.random` که قابل پیش‌بینی است.
 * ۴. سقف تلاش دارد. بدون آن، ۱۰۰۰۰۰۰ حالت کد شش‌رقمی با اسکریپت در
 *    چند دقیقه پیمایش می‌شود.
 * ۵. ذخیره در ردیس است نه دیتابیس، چون عمرش دو دقیقه است، باید خودکار
 *    منقضی شود، و نباید در پشتیبان‌گیری بماند.
 */

export const OTP_CONFIG = {
  CODE_LENGTH: 6,
  /** اعتبار کد */
  TTL_SECONDS: 120,
  /** فاصله‌ی اجباری بین دو درخواست کد برای یک شماره */
  RESEND_COOLDOWN_SECONDS: 60,
  /** سقف درخواست کد برای یک شماره در یک ساعت */
  MAX_REQUESTS_PER_HOUR: 5,
  /** سقف تلاش برای یک کد، پیش از باطل شدنش */
  MAX_ATTEMPTS: 5,
} as const;

const keys = {
  code: (phone: string) => `otp:code:${phone}`,
  attempts: (phone: string) => `otp:attempts:${phone}`,
  cooldown: (phone: string) => `otp:cooldown:${phone}`,
  hourlyCount: (phone: string) => `otp:hourly:${phone}`,
};

function hashCode(phone: NormalizedPhone, code: string): string {
  // شماره در هش وارد می‌شود تا هش یک کد برای دو شماره یکسان نباشد
  return createHash("sha256").update(`${phone}:${code}`).digest("hex");
}

function safeCompare(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export type OtpRequestOutcome =
  | { ok: true; retryAfterSeconds: number; code: string }
  | { ok: false; reason: "COOLDOWN" | "HOURLY_LIMIT"; retryAfterSeconds: number };

/**
 * کد جدید تولید و ذخیره می‌کند.
 *
 * کد تولیدشده برگردانده می‌شود تا لایه‌ی بالاتر آن را به فرستنده‌ی
 * پیامک بدهد. **هرگز نباید در پاسخ HTTP قرار بگیرد** مگر در حالت
 * توسعه که صریحاً کنترل می‌شود.
 */
export async function requestOtp(phone: NormalizedPhone): Promise<OtpRequestOutcome> {
  const cooldownTtl = await redis.ttl(keys.cooldown(phone));
  if (cooldownTtl > 0) {
    return { ok: false, reason: "COOLDOWN", retryAfterSeconds: cooldownTtl };
  }

  const hourlyCount = await redis.incr(keys.hourlyCount(phone));
  if (hourlyCount === 1) {
    await redis.expire(keys.hourlyCount(phone), 3600);
  }

  if (hourlyCount > OTP_CONFIG.MAX_REQUESTS_PER_HOUR) {
    const ttl = await redis.ttl(keys.hourlyCount(phone));
    return { ok: false, reason: "HOURLY_LIMIT", retryAfterSeconds: Math.max(ttl, 1) };
  }

  // بازه‌ی کامل شش‌رقمی، شامل کدهایی که با صفر شروع می‌شوند
  const code = String(randomInt(0, 1_000_000)).padStart(OTP_CONFIG.CODE_LENGTH, "0");

  await redis
    .multi()
    .set(keys.code(phone), hashCode(phone, code), "EX", OTP_CONFIG.TTL_SECONDS)
    .set(keys.attempts(phone), "0", "EX", OTP_CONFIG.TTL_SECONDS)
    .set(keys.cooldown(phone), "1", "EX", OTP_CONFIG.RESEND_COOLDOWN_SECONDS)
    .exec();

  return {
    ok: true,
    retryAfterSeconds: OTP_CONFIG.RESEND_COOLDOWN_SECONDS,
    code,
  };
}

export type OtpVerifyOutcome =
  | { ok: true }
  | { ok: false; reason: "NO_CODE" | "TOO_MANY_ATTEMPTS" | "INVALID"; attemptsLeft: number };

/**
 * کد را بررسی می‌کند و در صورت درست بودن، مصرفش می‌کند.
 *
 * کد پس از یک بار استفاده‌ی موفق حذف می‌شود تا با شنود یا تکرار
 * درخواست، دوباره قابل استفاده نباشد.
 *
 * `consume: false` مصرف را به تعویق می‌اندازد و کار صدازننده می‌شود.
 * لازم است چون ورود فقط بررسی کد نیست: کاربر تازه باید نامش را هم
 * بدهد، و آن خطا **بعد** از بررسی کد معلوم می‌شود. اگر کد همان‌جا
 * سوزانده می‌شد، هر کاربر تازه‌ای که اول بار نامش را نداده بود باید
 * شصت ثانیه‌ی cooldown را صبر می‌کرد و کد دیگری می‌گرفت — یعنی
 * اولین تجربه‌ی هر کاربر جدید، یک بن‌بست بود.
 */
export async function verifyOtp(
  phone: NormalizedPhone,
  code: string,
  options: { consume?: boolean } = {},
): Promise<OtpVerifyOutcome> {
  const stored = await redis.get(keys.code(phone));

  if (!stored) {
    return { ok: false, reason: "NO_CODE", attemptsLeft: 0 };
  }

  const attempts = await redis.incr(keys.attempts(phone));

  if (attempts > OTP_CONFIG.MAX_ATTEMPTS) {
    // کد سوخته است؛ باید کد جدید بگیرد
    await redis.del(keys.code(phone), keys.attempts(phone));
    return { ok: false, reason: "TOO_MANY_ATTEMPTS", attemptsLeft: 0 };
  }

  if (!safeCompare(stored, hashCode(phone, code))) {
    return {
      ok: false,
      reason: "INVALID",
      attemptsLeft: OTP_CONFIG.MAX_ATTEMPTS - attempts,
    };
  }

  if (options.consume ?? true) {
    await consumeOtp(phone);
  }

  return { ok: true };
}

/**
 * کد را می‌سوزاند.
 *
 * شمارنده‌ی تلاش هم با آن می‌رود: کد دیگری وجود ندارد که تلاش‌هایش
 * شمرده شود، و ماندنش یعنی کدِ بعدیِ همین شماره با شمارنده‌ی
 * پرشده شروع شود.
 */
export async function consumeOtp(phone: NormalizedPhone): Promise<void> {
  await redis.del(keys.code(phone), keys.attempts(phone));
}

/** فقط برای تست — همه‌ی حالت‌های یک شماره را پاک می‌کند. */
export async function clearOtpState(phone: NormalizedPhone): Promise<void> {
  await redis.del(
    keys.code(phone),
    keys.attempts(phone),
    keys.cooldown(phone),
    keys.hourlyCount(phone),
  );
}
