import { Redis } from "ioredis";

/**
 * اتصال ردیس.
 *
 * فعلاً فقط برای کدهای یک‌بارمصرف و محدودسازی نرخ استفاده می‌شود. کد
 * ورود عمداً در دیتابیس ذخیره نمی‌شود: عمرش دو دقیقه است، باید خودکار
 * منقضی شود، و نباید در پشتیبان‌گیری‌ها بماند.
 */
const url = process.env.REDIS_URL;

if (!url) {
  throw new Error("متغیر محیطی REDIS_URL تعریف نشده است.");
}

const globalForRedis = globalThis as unknown as { redis?: Redis };

export const redis =
  globalForRedis.redis ??
  new Redis(url, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}

export async function closeRedis(): Promise<void> {
  await redis.quit();
}
