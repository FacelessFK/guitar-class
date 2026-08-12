import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import {
  assertTestDatabase,
  databaseName,
  loadRootEnv,
  redact,
  testDatabaseUrl,
} from "./env.js";

/**
 * آماده‌سازی دیتابیس تست — یک بار پیش از کل اجرا.
 *
 * چرا اینجا و نه در `setup.ts`: آن فایل به ازای هر فایل تست اجرا می‌شود
 * و ساختن دیتابیس و مایگریشن نُه بار، کندی بی‌دلیل است. این یکی یک بار
 * در پروسه‌ی اصلی ویتست اجرا می‌شود.
 *
 * دیتابیس اگر نباشد ساخته می‌شود تا کسی که مخزن را تازه کلون کرده،
 * جز `pnpm dev:infra` کار دیگری لازم نداشته باشد. مایگریشن‌ها هم همین‌جا
 * اجرا می‌شوند تا اسکیمای تست هیچ‌وقت از `drizzle/` عقب نماند — عقب
 * ماندنش یعنی تستِ قرمزی که علتش به کد مربوط نیست.
 */
export default async function setup(): Promise<void> {
  loadRootEnv();

  const url = testDatabaseUrl();
  assertTestDatabase(url);

  await createDatabaseIfMissing(url);
  await runMigrations(url);
}

/**
 * دیتابیس تست را در صورت نبودن می‌سازد.
 *
 * `CREATE DATABASE` داخل تراکنش اجرا نمی‌شود و `IF NOT EXISTS` هم ندارد،
 * پس اول وجودش پرسیده می‌شود. خطای «تکراری» هم گرفته می‌شود چون دو اجرای
 * هم‌زمان می‌توانند هر دو نبودنش را ببینند.
 */
async function createDatabaseIfMissing(url: string): Promise<void> {
  const name = databaseName(url);

  // به دیتابیس نگه‌داری وصل می‌شویم؛ به دیتابیسی که هنوز نیست نمی‌شود
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";

  const admin = postgres(adminUrl.toString(), { max: 1 });

  try {
    const existing = await admin`
      SELECT 1 FROM pg_database WHERE datname = ${name}
    `;

    if (existing.length > 0) return;

    // نام دیتابیس شناسه است نه مقدار، پس پارامتر نمی‌پذیرد
    await admin.unsafe(`CREATE DATABASE "${name}"`);
  } catch (error) {
    const code = (error as { code?: string }).code;

    // 42P04 = duplicate_database — اجرای هم‌زمان دیگری زودتر ساختش
    if (code !== "42P04") {
      throw new Error(
        `ساخت دیتابیس تست «${name}» شکست خورد (${redact(adminUrl.toString())}): ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } finally {
    await admin.end();
  }
}

/** مایگریشن‌های `drizzle/` را روی دیتابیس تست اجرا می‌کند. */
async function runMigrations(url: string): Promise<void> {
  const client = postgres(url, { max: 1 });

  try {
    await migrate(drizzle(client), {
      migrationsFolder: resolve(process.cwd(), "drizzle"),
    });
  } finally {
    await client.end();
  }
}
