/**
 * اسکیمای کامل دیتابیس.
 *
 * `drizzle-kit` از همین فایل مایگریشن تولید می‌کند و کلاینت هم برای
 * کوئری‌های رابطه‌ای از همین استفاده می‌کند.
 *
 * قواعد ثابت:
 *   • هر زمانی `timestamptz` است و مقدارش UTC. تبدیل به تهران و تقویم
 *     شمسی فقط در لایه‌ی نمایش.
 *   • ساعت روز به صورت «دقیقه از نیمه‌شب» (۰ تا ۱۴۴۰) ذخیره می‌شود.
 *   • روز هفته: شنبه = ۰ تا جمعه = ۶.
 *   • مبالغ `bigint` و واحدشان ریال.
 *
 * مستندات طراحی: docs/architecture.md
 */

export * from "./enums.js";
export * from "./identity.js";
export * from "./catalog.js";
export * from "./availability.js";
export * from "./booking.js";
export * from "./finance.js";
export * from "./learning.js";
export * from "./review.js";
