import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * جداسازی محیط تست از محیط توسعه.
 *
 * تست‌های یکپارچگی بین هر تست `TRUNCATE ... CASCADE` و `FLUSHDB` اجرا
 * می‌کنند. تا پیش از این، همان `DATABASE_URL` و `REDIS_URL` توسعه را
 * می‌خواندند — یعنی هر بار `pnpm test`، دیتابیس توسعه خالی می‌شد.
 * تا وقتی داده‌ی دستی‌ای در توسعه نبود کسی متوجه نمی‌شد، ولی همین که
 * چند استاد و ساز برای ساختن فرانت‌اند دستی وارد شوند، هر اجرای تست
 * پاکشان می‌کند — و چون `db:studio` تنها راه تأیید استاد است، آن داده
 * دقیقاً همان چیزی است که دستی ساخته شده.
 *
 * خطر بزرگ‌ترش این بود: هیچ چیزی بررسی نمی‌کرد که `DATABASE_URL` به کدام
 * دیتابیس اشاره می‌کند. یک `.env` که به استیجینگ اشاره کند کافی بود تا
 * `pnpm test` یک دیتابیس واقعی را خالی کند.
 *
 * راه‌حل: تست‌ها همیشه روی دیتابیسِ جدا (`<name>_test`) و روی دیتابیسِ
 * شماره‌ی ۱ ردیس اجرا می‌شوند، و پیش از هر کار مخربی نام دیتابیس بررسی
 * می‌شود.
 */

/** پسوندی که دیتابیس تست را از هر دیتابیس دیگری جدا می‌کند. */
const TEST_DB_SUFFIX = "_test";

/** شماره‌ی دیتابیس ردیس مخصوص تست — توسعه روی ۰ می‌ماند. */
const TEST_REDIS_DB = "1";

/** `.env` ریشه‌ی مونوریپو را بار می‌کند. تست‌ها از `apps/api` اجرا می‌شوند. */
export function loadRootEnv(): void {
  const envPath = resolve(process.cwd(), "../../.env");

  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

/**
 * آدرس دیتابیس تست.
 *
 * اگر `TEST_DATABASE_URL` صریحاً تعریف شده باشد همان استفاده می‌شود،
 * وگرنه از روی `DATABASE_URL` ساخته می‌شود: همان سرور، همان کاربر، فقط
 * نام دیتابیس با پسوند `_test`. پیش‌فرضِ خودکار عمدی است تا کسی که
 * `.env.example` قدیمی دارد هم بدون تنظیم اضافه، ایمن باشد.
 */
export function testDatabaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL;
  if (explicit) return explicit;

  const base = process.env.DATABASE_URL;

  if (!base) {
    throw new Error(
      "DATABASE_URL تعریف نشده است. `cp .env.example .env` و `pnpm dev:infra` را اجرا کنید.",
    );
  }

  const url = new URL(base);
  const name = url.pathname.replace(/^\//, "");

  if (!name) {
    throw new Error(`DATABASE_URL نام دیتابیس ندارد: ${redact(base)}`);
  }

  url.pathname = `/${name}${name.endsWith(TEST_DB_SUFFIX) ? "" : TEST_DB_SUFFIX}`;

  return url.toString();
}

/** آدرس ردیس تست — همان سرور، دیتابیس شماره‌ی ۱. */
export function testRedisUrl(): string {
  const explicit = process.env.TEST_REDIS_URL;
  if (explicit) return explicit;

  const base = process.env.REDIS_URL;

  if (!base) {
    throw new Error("REDIS_URL تعریف نشده است. `pnpm dev:infra` را اجرا کنید.");
  }

  const url = new URL(base);
  url.pathname = `/${TEST_REDIS_DB}`;

  return url.toString();
}

/**
 * نام دیتابیس از روی آدرس اتصال.
 *
 * آدرس نامعتبر یا خالی رشته‌ی خالی برمی‌گرداند نه استثنا، تا
 * `assertTestDatabase` بتواند پیام درست خودش را بدهد؛ `TypeError: Invalid
 * URL` به کسی نمی‌گوید چه چیزی را باید درست کند.
 */
export function databaseName(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\//, "");
  } catch {
    return "";
  }
}

/**
 * آخرین خط دفاع پیش از `TRUNCATE`.
 *
 * این بررسی روی *نام دیتابیس* است نه روی `NODE_ENV`، چون `NODE_ENV` را
 * می‌شود اشتباه تنظیم کرد ولی نام دیتابیس همان چیزی است که واقعاً پاک
 * می‌شود. اگر روزی کسی `TEST_DATABASE_URL` را به دیتابیس واقعی وصل کند،
 * تست‌ها بالا نمی‌آیند به‌جای اینکه داده را ببلعند.
 */
export function assertTestDatabase(url: string): void {
  const name = databaseName(url);

  if (!name.endsWith(TEST_DB_SUFFIX)) {
    throw new Error(
      `تست‌ها فقط روی دیتابیسی با پسوند «${TEST_DB_SUFFIX}» اجرا می‌شوند، ولی ` +
        `آدرس فعلی به «${name || "<نامشخص>"}» اشاره می‌کند. این تست‌ها جدول‌ها را ` +
        `TRUNCATE می‌کنند — اجرا روی دیتابیس توسعه یا تولید یعنی از دست ` +
        `رفتن داده. TEST_DATABASE_URL را درست کنید.`,
    );
  }
}

/** آدرس اتصال بدون گذرواژه، برای پیام خطا و لاگ. */
export function redact(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "***";
    return parsed.toString();
  } catch {
    return "<آدرس نامعتبر>";
  }
}
