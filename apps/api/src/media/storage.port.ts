import { randomUUID } from "node:crypto";

import { Logger } from "@nestjs/common";

import { presignUrl } from "./sigv4.js";

/**
 * پورت آبجکت‌استوریج.
 *
 * پشت یک واسط است تا تا وقتی باکت آروان/لیارا آماده نیست، کل مسیر
 * آپلود ساخته و تست شود — همان کاری که برای پیامک و درگاه شد.
 *
 * **فایل هرگز از API عبور نمی‌کند.** مرورگر مستقیم روی آدرس امضاشده
 * `PUT` می‌زند. دلیلش اقتصاد است: کلیپ تمرین حدود ۲۰ مگابایت است و با
 * ۸۰۰ جلسه در ماه، عبور دادن همه از پروسه‌ی نود یعنی پهنای باند و
 * حافظه‌ای که هیچ کاری با آن نمی‌کنیم. ضمناً آپلود کند روی اینترنت
 * خانگی، یک اتصال HTTP را دقایق طولانی اشغال نگه می‌دارد.
 */

export interface UploadTicket {
  /** کلید آبجکت در باکت — همین چیزی است که بعداً به API برمی‌گردد */
  objectKey: string;
  /** آدرس امضاشده؛ مرورگر روی آن `PUT` می‌زند */
  uploadUrl: string;
  /** هدرهایی که باید عیناً روی `PUT` گذاشته شوند */
  headers: Record<string, string>;
  /** آدرس خواندن فایل پس از آپلود */
  publicUrl: string;
  expiresAt: Date;
}

export interface UploadRequest {
  objectKey: string;
  contentType: string;
  expiresInSeconds: number;
}

export interface ObjectStorage {
  /** در لاگ و پیام خطا دیده می‌شود */
  readonly name: string;
  createUploadTicket(request: UploadRequest): UploadTicket;
  publicUrlFor(objectKey: string): string;
}

// ---------------------------------------------------------------------------
// آداپتور واقعی
// ---------------------------------------------------------------------------

export interface S3Config {
  /** میزبان باکت، بدون پروتکل — مثلاً `music.s3.ir-thr-at1.arvanstorage.ir` */
  host: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** اگر باکت پشت CDN است، آدرس خواندن با آدرس نوشتن فرق دارد */
  publicBaseUrl: string;
}

/**
 * آبجکت‌استوریج سازگار با S3 (آروان‌کلاد، لیارا).
 *
 * ⚠️ **در برابر یک باکت واقعی آزموده نشده است.** امضا در
 * `sigv4.test.ts` تا حد بردار مرجع AWS سنجیده شده، ولی چیزهایی که فقط
 * سرویس واقعی نشان می‌دهد — سیاست CORS باکت، پذیرش
 * `UNSIGNED-PAYLOAD`، شکل دقیق میزبان — هنوز باز است. اولین کاری که
 * پس از ساختن باکت باید انجام شود همین است.
 *
 * سیاست CORS باکت باید `PUT` را از `WEB_ORIGIN` بپذیرد، وگرنه مرورگر
 * درخواست را پیش از رسیدن به سرویس رد می‌کند و خطایش هیچ ربطی به امضا
 * ندارد.
 */
export class S3ObjectStorage implements ObjectStorage {
  readonly name = "s3";

  constructor(private readonly config: S3Config) {}

  createUploadTicket(request: UploadRequest): UploadTicket {
    const uploadUrl = presignUrl({
      method: "PUT",
      host: this.config.host,
      key: request.objectKey,
      region: this.config.region,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      expiresInSeconds: request.expiresInSeconds,
    });

    return {
      objectKey: request.objectKey,
      uploadUrl,
      /**
       * `Content-Type` امضا **نمی‌شود** و فقط به‌عنوان فراداده می‌رود.
       * امضا کردنش یعنی مرورگر باید دقیقاً همان رشته را بفرستد و
       * کوچک‌ترین تفاوت (`; charset=utf-8` که بعضی مرورگرها اضافه
       * می‌کنند) کل آپلود را با خطای امضا رد می‌کند.
       */
      headers: { "content-type": request.contentType },
      publicUrl: this.publicUrlFor(request.objectKey),
      expiresAt: new Date(Date.now() + request.expiresInSeconds * 1000),
    };
  }

  publicUrlFor(objectKey: string): string {
    return `${this.config.publicBaseUrl.replace(/\/$/, "")}/${objectKey}`;
  }
}

// ---------------------------------------------------------------------------
// آداپتور توسعه
// ---------------------------------------------------------------------------

/**
 * ذخیره‌سازی درون‌حافظه‌ای برای توسعه و تست.
 *
 * آپلود و دانلود را خود API انجام می‌دهد (`/api/media/dev/:key`)، پس کل
 * حلقه‌ی یادگیری — تعیین تمرین، آپلود اجرا، بازخورد صوتی — بدون هیچ
 * حساب ابری از سر تا ته اجرا می‌شود. دقیقاً همان نقشی که درگاه جعلی
 * برای مسیر پرداخت بازی می‌کند.
 *
 * ⚠️ محتوا در حافظه‌ی پروسه می‌ماند و با ری‌استارت می‌پرد، و سقف حجم
 * دارد. برای توسعه درست است و برای هیچ‌چیز دیگری نیست — کارخانه‌ی زیر
 * جلوی انتخاب شدنش در تولید را می‌گیرد.
 */
export class InMemoryObjectStorage implements ObjectStorage {
  readonly name = "memory";

  private readonly logger = new Logger("Media");
  private readonly objects = new Map<string, { body: Buffer; contentType: string }>();

  constructor(private readonly apiBaseUrl: string) {}

  createUploadTicket(request: UploadRequest): UploadTicket {
    this.logger.warn(
      `ذخیره‌سازی توسعه: بلیت آپلود برای ${request.objectKey} (${request.contentType})`,
    );

    return {
      objectKey: request.objectKey,
      uploadUrl: `${this.apiBaseUrl}/media/dev/${request.objectKey}`,
      headers: { "content-type": request.contentType },
      publicUrl: this.publicUrlFor(request.objectKey),
      expiresAt: new Date(Date.now() + request.expiresInSeconds * 1000),
    };
  }

  publicUrlFor(objectKey: string): string {
    return `${this.apiBaseUrl}/media/dev/${objectKey}`;
  }

  put(objectKey: string, body: Buffer, contentType: string): void {
    this.objects.set(objectKey, { body, contentType });
  }

  get(objectKey: string): { body: Buffer; contentType: string } | null {
    return this.objects.get(objectKey) ?? null;
  }
}

// ---------------------------------------------------------------------------
// انتخاب آداپتور
// ---------------------------------------------------------------------------

/**
 * ذخیره‌سازی را از روی محیط انتخاب می‌کند.
 *
 * اگر در تولید تنظیمات باکت نباشد، عمداً بالا نمی‌آید. برگشتن بی‌صدا به
 * آداپتور حافظه یعنی اجرای هنرجو در حافظه‌ی پروسه بنشیند و با اولین
 * ری‌استارت ناپدید شود — و چون رکوردش در دیتابیس می‌ماند، خرابی‌اش
 * هفته‌ها بعد و به شکل «فایل باز نمی‌شود» دیده می‌شود.
 */
export function createObjectStorage(): ObjectStorage {
  const host = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;
  const isProduction = process.env.NODE_ENV === "production";

  if (host && bucket && accessKeyId && secretAccessKey) {
    return new S3ObjectStorage({
      host: bucketHost(host, bucket),
      region: process.env.S3_REGION ?? "ir-thr-at1",
      accessKeyId,
      secretAccessKey,
      publicBaseUrl:
        process.env.S3_PUBLIC_BASE_URL ?? `https://${bucketHost(host, bucket)}`,
    });
  }

  if (isProduction) {
    throw new Error(
      "تنظیمات S3 در محیط تولید کامل نیست. آداپتور حافظه فایل‌ها را با ری‌استارت از دست می‌دهد و نباید در تولید استفاده شود.",
    );
  }

  return new InMemoryObjectStorage(
    process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}/api`,
  );
}

/**
 * میزبان به سبک «باکت در زیردامنه».
 *
 * سبک مسیری (`endpoint/bucket/key`) هم وجود دارد ولی آروان و لیارا هر
 * دو زیردامنه‌ای‌اند، و مهم‌تر: امضا میزبان را در خود دارد، پس انتخاب
 * اشتباه اینجا به خطای امضا تبدیل می‌شود نه به ۴۰۴ — یعنی سراغ جای
 * اشتباهی می‌فرستدت.
 */
function bucketHost(endpoint: string, bucket: string): string {
  const host = endpoint.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return host.startsWith(`${bucket}.`) ? host : `${bucket}.${host}`;
}

let storage: ObjectStorage | undefined;

/** ذخیره‌سازی مشترک پروسه — مثل `smsSender()` و `paymentGateway()`. */
export function objectStorage(): ObjectStorage {
  storage ??= createObjectStorage();
  return storage;
}

/** فقط برای تست. */
export function setObjectStorage(replacement: ObjectStorage): void {
  storage = replacement;
}

/**
 * کلید آبجکت.
 *
 * `randomUUID` در نام هست تا کلید **غیرقابل حدس** باشد: باکت عمومی
 * است و کلیدِ قابل حدس یعنی اجرای یک هنرجو با آزمودن نام‌ها پیدا شود.
 * پوشه‌بندی بر اساس ماه است تا سیاست نگه‌داری و پاک‌سازی بعدی بتواند
 * روی پیشوند کار کند، نه روی فهرست کردن کل باکت.
 */
export function buildObjectKey(prefix: string, fileName: string): string {
  const month = new Date().toISOString().slice(0, 7);
  const extension = extensionOf(fileName);
  return `${prefix}/${month}/${randomUUID()}${extension}`;
}

function extensionOf(fileName: string): string {
  const match = /\.([a-z0-9]{1,8})$/i.exec(fileName.trim());
  return match ? `.${match[1]!.toLowerCase()}` : "";
}
