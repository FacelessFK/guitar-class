import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema/index.js";

/**
 * متغیرهای محیطی همین‌جا و در زمان بارگذاری ماژول خوانده می‌شوند، نه از
 * طریق `ConfigModule` نست.
 *
 * دلیل: این ماژول از سرویس‌های فارغ از فریم‌ورک و از تست‌ها و اسکریپت‌های
 * مایگریشن هم import می‌شود، جایی که اصلاً Nest بالا نیامده. پس `.env`
 * باید پیش از هر import بار شده باشد — اسکریپت‌های `dev` و `start` این
 * کار را با `--env-file-if-exists` نود انجام می‌دهند و تست‌ها با
 * `src/test/setup.ts`.
 */
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "متغیر محیطی DATABASE_URL تعریف نشده است. `cp .env.example .env` را اجرا کنید.",
  );
}

/**
 * اتصال به پستگرس.
 *
 * در حالت توسعه روی `globalThis` نگه داشته می‌شود تا با هر بار بارگذاری
 * مجدد ماژول، استخر اتصال جدیدی ساخته نشود.
 */
const globalForDb = globalThis as unknown as {
  sqlClient?: ReturnType<typeof postgres>;
};

export const sqlClient =
  globalForDb.sqlClient ??
  postgres(connectionString, {
    max: 10,
    // سرور دیتابیس روی UTC است و همه‌ی زمان‌ها هم UTC ذخیره می‌شوند
    types: {},
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.sqlClient = sqlClient;
}

export const db = drizzle(sqlClient, { schema });

export type Database = typeof db;
export { schema };
