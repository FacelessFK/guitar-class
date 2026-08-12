/**
 * صدور بلیت آپلود.
 *
 * قاعده‌ی مرکزی این ماژول: **کلاینت نشانی فایل را تعیین نمی‌کند.**
 *
 * جریان طبیعی وسوسه‌انگیز این است که مرورگر فایل را جایی بگذارد و بعد
 * نشانی‌اش را به `POST /submissions` بدهد. آن شکل یعنی هر کاربر
 * واردشده می‌تواند هر رشته‌ای را به‌عنوان «اجرای من» ثبت کند: نشانی
 * فایل کس دیگری، یک آدرس بیرونی که هر لحظه محتوایش عوض می‌شود، یا
 * `javascript:` که در صفحه‌ی استاد رندر شود.
 *
 * پس API خودش کلید را می‌سازد، آن را با «چه کسی و برای چه» در ردیس
 * ثبت می‌کند، و بعداً فقط کلیدی را می‌پذیرد که خودش صادر کرده و هنوز
 * مصرف نشده. نشانی نهایی از روی همان کلید ساخته می‌شود، نه از ورودی.
 */

import { redis } from "../redis/client.js";
import {
  buildObjectKey,
  objectStorage,
  type UploadTicket,
} from "./storage.port.js";
import { MediaTicketInvalidError, UnsupportedMediaTypeError } from "./errors.js";

/**
 * مقصد فایل.
 *
 * نوع فایل مجاز و سقف حجم به همین بستگی دارد و نه به چیزی که کلاینت
 * می‌گوید: کلیپ اجرای هنرجو ویدیو هم می‌تواند باشد، ولی بازخورد صوتی
 * استاد فقط صداست — سند معماری روی همین تفکیک حساب باز کرده، چون
 * تفاوت حجمشان بیش از ده برابر است.
 */
export const MEDIA_PURPOSES = {
  /** اجرای هنرجو — کلیپ کوتاه موبایلی */
  SUBMISSION: {
    prefix: "submissions",
    maxBytes: 100 * 1024 * 1024,
    allowed: ["audio/", "video/"],
  },
  /** بازخورد صوتی استاد — چند دقیقه، چند مگابایت */
  FEEDBACK_VOICE: {
    prefix: "feedback",
    maxBytes: 20 * 1024 * 1024,
    allowed: ["audio/"],
  },
  /** پیوست تمرین: نت، تبلچر، فایل صوتی نمونه */
  ASSIGNMENT_ATTACHMENT: {
    prefix: "assignments",
    maxBytes: 25 * 1024 * 1024,
    allowed: ["audio/", "image/", "application/pdf"],
  },
  /**
   * عکس پروفایل — فقط تصویر.
   *
   * سقفش تنگ است چون عکسی که مرورگر در ۴۸ پیکسل نشان می‌دهد، پنج
   * مگابایت لازم ندارد؛ و برخلاف اجرای هنرجو، این فایل در هر بارگذاری
   * صفحه دانلود می‌شود.
   */
  AVATAR: {
    prefix: "avatars",
    maxBytes: 5 * 1024 * 1024,
    allowed: ["image/"],
  },
  /**
   * تصویر شاخص نوشته‌ی بلاگ.
   *
   * سقفش از آواتار بازتر است چون تصویر بالای صفحه است و باید در نمایشگر
   * بزرگ هم مرتب باشد — ولی همچنان تنگ: صفحه‌ای که برای سئو ساخته شده،
   * سرعت بارگذاری‌اش خودش یکی از سیگنال‌هاست.
   */
  POST_COVER: {
    prefix: "posts",
    maxBytes: 8 * 1024 * 1024,
    allowed: ["image/"],
  },
} as const;

export type MediaPurpose = keyof typeof MEDIA_PURPOSES;

/**
 * مهلت بلیت.
 *
 * سخاوتمندانه است چون آپلود ۲۰ مگابایتی روی اینترنت خانگی ایران
 * می‌تواند چند دقیقه طول بکشد، و بلیتی که وسط آپلود منقضی شود یعنی
 * کاربر کل فایل را دوباره بفرستد بی‌آنکه بفهمد چرا.
 */
const TICKET_TTL_SECONDS = 30 * 60;

interface TicketRecord {
  userId: string;
  purpose: MediaPurpose;
  contentType: string;
  /**
   * حجمی که کلاینت هنگام گرفتن بلیت اعلام کرد.
   *
   * همین‌جا نگه داشته می‌شود تا اندپوینتِ ثبت، مجبور نباشد دوباره از
   * کلاینت بپرسدش. پرسیدنِ دوباره یعنی دو عدد وجود داشته باشد که
   * می‌توانند با هم نخوانند، و آن که در دیتابیس می‌نشیند همانی باشد که
   * هیچ بررسی‌ای رویش انجام نشده — عملاً یک عدد دلخواه.
   *
   * ادعای کلاینت است و نه اندازه‌ی واقعی فایل. برای گزارش و سهمیه خوب
   * است، برای اجرای سقف نه؛ سقف واقعی باید در سیاست باکت بنشیند.
   */
  sizeBytes: number;
}

const ticketKey = (objectKey: string): string => `media:ticket:${objectKey}`;

export interface IssueUploadInput {
  userId: string;
  purpose: MediaPurpose;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface IssuedUpload extends UploadTicket {
  purpose: MediaPurpose;
}

/**
 * بلیت آپلود صادر می‌کند.
 *
 * حجم **پیش از** صدور بررسی می‌شود، نه بعد از آپلود: بعدش یعنی کاربر
 * صد مگابایت را روی اینترنت خانگی فرستاده و بعد بشنود که قبول نیست.
 * این بررسی به عدد اعلام‌شده‌ی کلاینت تکیه دارد و قابل دور زدن است —
 * سقف واقعی باید در سیاست باکت هم بنشیند؛ این یکی برای کاربر صادق
 * است، نه برای مهاجم.
 */
export async function issueUploadTicket(
  input: IssueUploadInput,
): Promise<IssuedUpload> {
  const purpose = MEDIA_PURPOSES[input.purpose];

  if (!purpose.allowed.some((prefix) => input.contentType.startsWith(prefix))) {
    throw new UnsupportedMediaTypeError(input.contentType);
  }

  if (input.sizeBytes > purpose.maxBytes) {
    throw new UnsupportedMediaTypeError(
      `حجم فایل از ${Math.floor(purpose.maxBytes / (1024 * 1024))} مگابایت بیشتر است`,
    );
  }

  const objectKey = buildObjectKey(purpose.prefix, input.fileName);

  const ticket = objectStorage().createUploadTicket({
    objectKey,
    contentType: input.contentType,
    expiresInSeconds: TICKET_TTL_SECONDS,
  });

  const record: TicketRecord = {
    userId: input.userId,
    purpose: input.purpose,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
  };

  await redis.set(ticketKey(objectKey), JSON.stringify(record), "EX", TICKET_TTL_SECONDS);

  return { ...ticket, purpose: input.purpose };
}

/**
 * بلیت را مصرف می‌کند و نشانی عمومی فایل را برمی‌گرداند.
 *
 * `GETDEL` اتمی است: دو درخواست هم‌زمان با یک کلید، فقط یکی‌شان رکورد
 * را می‌گیرد. بدون آن، «بخوان بعد حذف کن» یعنی یک کلید بتواند به دو
 * رکورد وصل شود.
 *
 * مالکیت هم بررسی می‌شود، نه فقط وجود بلیت: کلید غیرقابل حدس است ولی
 * از هدر پاسخ یا لاگ مرورگر بیرون می‌آید، و بدون این بررسی هر کسی که
 * کلید را دیده باشد می‌تواند فایل را به اسم خودش ثبت کند.
 */
export async function consumeUploadTicket(
  objectKey: string,
  userId: string,
  expected: MediaPurpose,
): Promise<{ url: string; contentType: string; sizeBytes: number }> {
  const raw = await redis.getdel(ticketKey(objectKey));

  if (!raw) throw new MediaTicketInvalidError();

  const record = JSON.parse(raw) as TicketRecord;

  if (record.userId !== userId || record.purpose !== expected) {
    // بلیت از بین رفت و برنمی‌گردد. سخت‌گیرانه است ولی حالت درست، هرگز
    // به اینجا نمی‌رسد: بلیت را همان کسی مصرف می‌کند که گرفته است.
    throw new MediaTicketInvalidError();
  }

  return {
    url: objectStorage().publicUrlFor(objectKey),
    contentType: record.contentType,
    // بلیت‌های پیش از افزوده شدن این فیلد هنوز در ردیس زنده‌اند (مهلتشان
    // نیم ساعت است) و `sizeBytes` ندارند. صفر یعنی «نمی‌دانم» و در ستون
    // nullable می‌نشیند، نه یک عدد ساختگی
    sizeBytes: record.sizeBytes ?? 0,
  };
}

/** برای فرانت: نوع رسانه از روی `content-type`. */
export function mediaTypeOf(contentType: string): "AUDIO" | "VIDEO" {
  return contentType.startsWith("video/") ? "VIDEO" : "AUDIO";
}
