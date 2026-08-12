import { z } from "zod";

/**
 * اسکیماهای پایه‌ی مشترک.
 *
 * عمداً از `z.string().regex()` استفاده می‌شود به‌جای کمک‌کننده‌های
 * نسخه‌محور، تا ارتقای Zod این‌ها را نشکند.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `YYYY-MM-DD` میلادی — همان قالب `DateKey` در پکیج مشترک. */
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * اسلاگ نشانی — فقط حروف کوچک لاتین، رقم و خط تیره.
 *
 * فارسی پذیرفته نمی‌شود با اینکه سند سئو «اسلاگ فارسی» را پیشنهاد کرده:
 * این اسلاگ‌ها را ادمین و استاد تایپ می‌کنند و شکل درصدکدشده‌شان در
 * لینک اشتراک‌گذاری‌شده ناخواناست. اسلاگ ساز را همین حالا هم فایل seed
 * لاتین می‌نویسد.
 */
const SLUG_PATTERN = /^[a-z0-9-]+$/;

export const uuidSchema = z
  .string()
  .regex(UUID_PATTERN, "شناسه نامعتبر است");

export const slugSchema = z
  .string()
  .trim()
  .min(2, "نشانی باید دست‌کم دو نویسه باشد")
  .max(80, "نشانی نمی‌تواند بیشتر از ۸۰ نویسه باشد")
  .regex(SLUG_PATTERN, "نشانی فقط می‌تواند حروف کوچک انگلیسی، رقم و خط تیره باشد");

export const dateKeySchema = z
  .string()
  .regex(DATE_KEY_PATTERN, "تاریخ باید به قالب YYYY-MM-DD باشد");

/** دقیقه از نیمه‌شب به وقت تهران. */
export const minuteOfDaySchema = z
  .number()
  .int("دقیقه باید عدد صحیح باشد")
  .min(0, "دقیقه نمی‌تواند منفی باشد")
  .max(1439, "دقیقه باید کمتر از ۱۴۴۰ باشد");

/**
 * بازه‌ی درخواستی تقویم.
 *
 * سقف ۶۲ روز عمدی است: بدون آن یک درخواست می‌تواند محاسبه‌ی چند ساله
 * را تحمیل کند، و ضمناً رزرو خیلی دور از الان معنای کسب‌وکاری ندارد.
 */
export const dateRangeSchema = z
  .object({
    from: dateKeySchema,
    to: dateKeySchema,
  })
  .refine((value) => value.from <= value.to, {
    message: "تاریخ شروع باید پیش از تاریخ پایان باشد",
    path: ["from"],
  })
  .refine(
    (value) => {
      const days =
        (Date.parse(`${value.to}T00:00:00Z`) - Date.parse(`${value.from}T00:00:00Z`)) /
        86_400_000;
      return days <= 62;
    },
    { message: "بازه‌ی درخواستی نمی‌تواند بیشتر از ۶۲ روز باشد", path: ["to"] },
  );

export type DateRangeQuery = z.infer<typeof dateRangeSchema>;
