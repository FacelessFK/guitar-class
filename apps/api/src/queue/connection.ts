import { Redis } from "ioredis";

/**
 * اتصال ردیس مخصوص BullMQ.
 *
 * چرا از `redis/client.ts` جدا است و اشتراکی نیست:
 *
 * BullMQ برای گرفتن جاب از `BRPOPLPUSH` استفاده می‌کند — یک دستور
 * مسدودکننده که تا رسیدن جاب بعدی باز می‌ماند. اتصال اپلیکیشن
 * `maxRetriesPerRequest: 3` دارد و ioredis روی آن اتصال، فرمانی که
 * جواب نمی‌دهد را بعد از سه تلاش با خطا رد می‌کند. BullMQ صریحاً
 * `maxRetriesPerRequest: null` می‌خواهد و اگر نبیند، هنگام ساخت
 * `Worker` خطا می‌دهد.
 *
 * ضمناً اتصالی که در حال `BRPOPLPUSH` است تا وقتی جاب نیامده هیچ فرمان
 * دیگری را اجرا نمی‌کند. اگر همان اتصال را با کدهای ورود و محدودسازی
 * نرخ شریک می‌شدیم، ورود کاربر پشت انتظارِ صف می‌ماند.
 */
const url = process.env.REDIS_URL;

if (!url) {
  throw new Error("متغیر محیطی REDIS_URL تعریف نشده است.");
}

export function createQueueConnection(): Redis {
  return new Redis(url!, {
    maxRetriesPerRequest: null,
  });
}
