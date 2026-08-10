import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * متغیرهای محیطی را از `.env` ریشه‌ی مونوریپو بار می‌کند.
 *
 * از `process.loadEnvFile` نود استفاده می‌شود تا وابستگی اضافه‌ای لازم
 * نباشد. تست‌ها از `apps/api` اجرا می‌شوند.
 */
const envPath = resolve(process.cwd(), "../../.env");

if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL تعریف نشده است. `cp .env.example .env` و `pnpm dev:infra` را اجرا کنید.",
  );
}
