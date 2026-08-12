import {
  assertTestDatabase,
  loadRootEnv,
  testDatabaseUrl,
  testRedisUrl,
} from "./env.js";

/**
 * محیط هر فایل تست.
 *
 * ترتیب اینجا حیاتی است: `DATABASE_URL` و `REDIS_URL` باید **پیش از**
 * اولین import از `db/client.ts` یا `redis/client.ts` جایگزین شوند، چون
 * آن دو ماژول اتصال را در زمان بارگذاری و از روی همین متغیرها می‌سازند.
 * ویتست `setupFiles` را پیش از ماژول تست بار می‌کند، پس این تنها جای
 * درست برای این کار است — نه `globalSetup` که در پروسه‌ی دیگری اجرا
 * می‌شود و متغیرهایش به اینجا نمی‌رسند.
 */

loadRootEnv();

const databaseUrl = testDatabaseUrl();

// حتی با وجود بررسی در `globalSetup`، اینجا هم بررسی می‌شود: این پروسه
// همان جایی است که واقعاً `TRUNCATE` را اجرا می‌کند.
assertTestDatabase(databaseUrl);

process.env.DATABASE_URL = databaseUrl;
process.env.REDIS_URL = testRedisUrl();
