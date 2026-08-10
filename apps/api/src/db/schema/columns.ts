import { sql } from "drizzle-orm";
import { bigint, numeric, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * ستون‌های تکرارشونده، یک‌جا تعریف می‌شوند تا قراردادهای پروژه در همه‌ی
 * جدول‌ها یکسان بمانند.
 */

/** کلید اصلی. تولید UUID سمت دیتابیس است، نه اپلیکیشن. */
export const primaryId = () => uuid().primaryKey().defaultRandom();

/**
 * هر زمانی در این پروژه `timestamptz` است و مقدارش UTC.
 * تبدیل به تهران و تقویم شمسی فقط در لایه‌ی نمایش انجام می‌شود.
 */
export const tstz = (name: string) =>
  timestamp(name, { withTimezone: true, precision: 3, mode: "date" });

export const createdAt = () => tstz("created_at").notNull().defaultNow();

export const updatedAt = () =>
  tstz("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** مبلغ به ریال. `bigint` چون تجمیع‌های ماهانه از سقف `int` رد می‌شوند. */
export const rial = (name: string) => bigint(name, { mode: "bigint" });

/**
 * درصد با دو رقم اعشار.
 * حالت `string` عمدی است — تبدیل به `number` شناور، خطای گردکردن وارد
 * محاسبات مالی می‌کند.
 */
export const percent = (name: string) => numeric(name, { precision: 5, scale: 2 });

/** برای ستون‌هایی که مقدار پیش‌فرضشان آرایه‌ی خالی JSON است. */
export const emptyJsonArray = sql`'[]'::jsonb`;
export const emptyJsonObject = sql`'{}'::jsonb`;
