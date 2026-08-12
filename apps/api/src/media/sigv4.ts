import { createHash, createHmac } from "node:crypto";

/**
 * امضای SigV4 برای آدرس‌های از پیش امضاشده‌ی S3.
 *
 * کتابخانه‌ی `@aws-sdk/*` استفاده نشد چون فقط برای همین یک کار، چند
 * مگابایت وابستگی و یک درخت انتقالی کامل می‌آورد؛ الگوریتم خودش تعریف
 * ثابت و کوتاهی دارد و اینجا کامل پیاده شده است.
 *
 * بهایش این است که خطاهای امضا بی‌صدا و مبهم‌اند — سرویس فقط
 * `SignatureDoesNotMatch` می‌دهد و نمی‌گوید کدام جزء غلط بوده. برای
 * همین `sigv4.test.ts` هر جزء را جدا می‌سنجد: درخواست متعارف، رشته‌ی
 * امضا، و کلید مشتق‌شده. تغییر دادن این فایل بدون قرمز شدن آن تست
 * تقریباً ناممکن است.
 */

const ALGORITHM = "AWS4-HMAC-SHA256";

/**
 * محتوا امضا نمی‌شود.
 *
 * فایل مستقیم از مرورگر کاربر می‌رود و ما هرگز آن را نمی‌بینیم، پس
 * `sha256` بدنه را نداریم. `UNSIGNED-PAYLOAD` دقیقاً برای همین حالت
 * است. اندازه و نوع فایل جای دیگری کنترل می‌شوند (بلیت آپلود در ردیس)،
 * نه در امضا.
 */
const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";

export interface SignPresignedUrlInput {
  method: "PUT" | "GET";
  /** میزبان درخواست، مثلاً `my-bucket.s3.ir-thr-at1.arvanstorage.ir` */
  host: string;
  /** مسیر آبجکت، **بدون** اسلش ابتدایی */
  key: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresInSeconds: number;
  /** برای تست تزریق می‌شود؛ در عمل «الان» */
  now?: Date;
}

/**
 * پارامترهای پرس‌وجوی امضاشده.
 *
 * جدا از ساختِ URL برگردانده می‌شوند تا تست بتواند تک‌تکشان را ببیند،
 * و چون بعضی سرویس‌ها به ترتیب پارامترها حساس‌اند و چسباندن دستی رشته
 * دقیقاً همان‌جاست که اشتباه می‌شود.
 */
export function signedQueryParameters(
  input: SignPresignedUrlInput,
): URLSearchParams {
  const now = input.now ?? new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${input.region}/s3/aws4_request`;

  const query = new URLSearchParams();
  query.set("X-Amz-Algorithm", ALGORITHM);
  query.set("X-Amz-Credential", `${input.accessKeyId}/${scope}`);
  query.set("X-Amz-Date", amzDate);
  query.set("X-Amz-Expires", String(input.expiresInSeconds));
  query.set("X-Amz-SignedHeaders", "host");

  const canonicalRequest = buildCanonicalRequest({
    method: input.method,
    key: input.key,
    // پارامترها باید **مرتب‌شده** در درخواست متعارف بیایند.
    // `URLSearchParams.sort` این را تضمین می‌کند؛ ترتیب درج کافی نیست
    // چون خودِ سرویس هم مرتب‌شده حساب می‌کند.
    canonicalQuery: sortedQueryString(query),
    host: input.host,
  });

  const stringToSign = [
    ALGORITHM,
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signature = hmacHex(
    signingKey(input.secretAccessKey, dateStamp, input.region),
    stringToSign,
  );

  query.set("X-Amz-Signature", signature);

  return query;
}

/** آدرس کامل و امضاشده. */
export function presignUrl(input: SignPresignedUrlInput): string {
  const query = signedQueryParameters(input);
  return `https://${input.host}/${encodeS3Key(input.key)}?${sortedQueryString(query)}`;
}

// ---------------------------------------------------------------------------
// اجزا — جدا `export` شده‌اند تا تست بتواند هرکدام را مستقل بسنجد
// ---------------------------------------------------------------------------

export function buildCanonicalRequest(input: {
  method: string;
  key: string;
  canonicalQuery: string;
  host: string;
}): string {
  return [
    input.method,
    `/${encodeS3Key(input.key)}`,
    input.canonicalQuery,
    `host:${input.host}\n`,
    "host",
    UNSIGNED_PAYLOAD,
  ].join("\n");
}

/**
 * کلید امضا: زنجیره‌ی چهار HMAC.
 *
 * هر مرحله خروجی مرحله‌ی قبل را به‌عنوان **کلید** می‌گیرد، نه به‌عنوان
 * پیام. جابه‌جا کردن این دو، امضایی می‌سازد که کاملاً معتبر به نظر
 * می‌رسد و همیشه رد می‌شود.
 *
 * `service` پارامتر است هرچند اینجا همیشه `s3` می‌آید: تنها بردار
 * مرجعی که AWS برای این زنجیره منتشر کرده روی `iam` است، و بدون
 * پارامتر بودنِ سرویس هیچ راهی برای سنجیدن الگوریتم در برابر یک مقدار
 * مستقل نمی‌ماند — فقط قفل کردن خروجی خودمان.
 */
export function signingKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service = "s3",
): Buffer {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, service);
  return hmac(serviceKey, "aws4_request");
}

/**
 * کدگذاری کلید آبجکت.
 *
 * `encodeURIComponent` اسلش را هم کد می‌کند و مسیرهای تودرتو را خراب
 * می‌کند، پس هر بخش جدا کد و بعد با اسلش وصل می‌شود. ضمناً آن تابع
 * `!'()*` را رها می‌کند در حالی که S3 انتظار دارد کد شده باشند —
 * بدون این اصلاح، فایلی که پرانتز در نامش دارد امضایش نمی‌خواند.
 */
export function encodeS3Key(key: string): string {
  return key
    .split("/")
    .map((segment) =>
      encodeURIComponent(segment).replace(
        /[!'()*]/g,
        (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join("/");
}

/** `20260812T134500Z` */
export function toAmzDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function sortedQueryString(query: URLSearchParams): string {
  const sorted = new URLSearchParams(query);
  sorted.sort();
  return sorted.toString();
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function hmacHex(key: Buffer, value: string): string {
  return createHmac("sha256", key).update(value, "utf8").digest("hex");
}
