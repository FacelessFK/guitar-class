/**
 * شناسایی نقض قید یکتایی در پستگرس.
 *
 * چرا لازم است با اینکه پیش از درج هم بررسی می‌کنیم: «بررسی کن، بعد درج
 * کن» در برابر دو درخواست هم‌زمان مصون نیست — هر دو خالی بودن را می‌بینند
 * و دومی به قید می‌خورد. بدون این ترجمه، آن دومی ۵۰۰ می‌گیرد در حالی که
 * اتفاقی که افتاده کاملاً قابل توضیح است.
 *
 * `booking/errors.ts` معادل خودش را برای قید `EXCLUDE` دارد و عمداً ادغام
 * نشدند: آن یکی خطاهای دامنه‌ی رزرو را می‌سازد، این یکی فقط نام قید را
 * برمی‌گرداند و تصمیم را به صدازننده می‌سپارد.
 */

const PG_UNIQUE_VIOLATION = "23505";

interface PostgresError {
  code?: string;
  constraint_name?: string;
  constraint?: string;
}

/**
 * نام قید یکتایی که نقض شده، یا `null` اگر خطا از جنس دیگری است.
 *
 * نام برمی‌گردد نه فقط `true`: یک جدول می‌تواند چند قید یکتا داشته باشد
 * (`teacher_profiles` هم روی `user_id` و هم روی `slug`) و پیام درست به
 * کاربر به این بستگی دارد که کدامشان خورده.
 *
 * ⚠️ زنجیره‌ی `cause` هم پیموده می‌شود. Drizzle خطای درایور را در
 * `DrizzleQueryError` می‌پیچد، پس خطایی که به صدازننده می‌رسد نه `code`
 * دارد و نه `constraint_name` — بررسی مستقیم روی خودش همیشه `null`
 * می‌دهد و تعارض به ۵۰۰ تبدیل می‌شود.
 */
export function uniqueViolationConstraint(error: unknown): string | null {
  for (let current = error, depth = 0; depth < 5; depth += 1) {
    if (typeof current !== "object" || current === null) return null;

    const candidate = current as PostgresError & { cause?: unknown };

    if (candidate.code === PG_UNIQUE_VIOLATION) {
      return candidate.constraint_name ?? candidate.constraint ?? "";
    }

    current = candidate.cause;
  }

  return null;
}
