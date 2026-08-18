/**
 * آماده‌سازی عکس پروفایل، پیش از آپلود.
 *
 * عکسی که مرورگر در ۲۸ پیکسل نشان می‌دهد، مستقیم از دوربین موبایل
 * می‌آید: چهار پنج مگابایت، چند هزار پیکسل. آپلودش روی اینترنت خانگی
 * دقیقه‌ها طول می‌کشد و بعد **در هر بارگذاری هر صفحه‌ای** دوباره دانلود
 * می‌شود. مرورگر همان‌جا می‌تواند به پنجاه کیلوبایت برساندش.
 *
 * دو چیز دیگر هم مجانی حل می‌شوند:
 *
 * - `sizeBytes` و `contentType` که کلاینت هنگام گرفتن بلیت اعلام می‌کند
 *   ادعای اوست و با `PUT` امضاشده قابل اجرا نیست — سرور بایت‌ها را
 *   اصلاً نمی‌بیند. چیزی که از `canvas` بیرون می‌آید قطعاً یک JPEG
 *   واقعی و قطعاً کوچک است. این جای آن بررسی را نمی‌گیرد (مهاجم این
 *   تابع را دور می‌زند)، ولی کاربر عادی را از آن مسیر بیرون می‌برد.
 * - فراداده‌ی EXIF پاک می‌شود. عکس موبایل مختصات GPS دارد و مقصد این
 *   فایل یک باکت عمومی است؛ آواتار استاد روی صفحه‌ی عمومی می‌نشیند.
 */

/**
 * ضلع خروجی.
 *
 * بزرگ‌ترین جایی که آواتار دیده می‌شود صفحه‌ی عمومی استاد است و آنجا
 * هم زیر ۲۵۶ پیکسل می‌ماند؛ ۵۱۲ برای نمایشگر رتینا دو برابرش است.
 */
const AVATAR_SIZE = 512;

const AVATAR_QUALITY = 0.85;

/**
 * پس‌زمینه‌ی نواحی شفاف.
 *
 * JPEG کانال آلفا ندارد و PNG شفاف بدون این، سیاه درمی‌آید. همان سفیدِ
 * گرمِ `--color-surface` است تا لبه‌ی عکس در صفحه گم شود.
 */
const MATTE = "#fbfaf8";

/**
 * عکس را به مربعِ وسط برش می‌دهد، کوچک می‌کند و JPEG می‌سازد.
 *
 * برشِ مربعِ مرکزی به‌جای ابزار برش تعاملی: آواتار در همه‌ی جاهای
 * پلتفرم گرد و مربع نشان داده می‌شود، پس مرورگر بدون پرسیدن هم همان
 * کاری را می‌کند که `object-cover` می‌کرد — فقط این بار بایت‌هایش هم
 * فرستاده نمی‌شوند.
 *
 * در هر شکستی **فایل اصلی** برمی‌گردد، نه خطا. کاندید اصلی این شکست
 * HEIC آیفون است که مرورگرهای غیرسافاری رمزگشایی‌اش نمی‌کنند؛ رد کردن
 * آپلود یعنی کاربری که هیچ کار اشتباهی نکرده جلوی یک پیام خطا بماند،
 * در حالی که سرور خودش `image/heic` را می‌پذیرد.
 */
export async function prepareAvatar(file: File): Promise<File> {
  let bitmap: ImageBitmap;

  try {
    // بدون `from-image`، عکسِ افقیِ موبایل که چرخشش فقط در EXIF ثبت
    // شده، خوابیده روی بوم می‌افتد — و این بار چرخش در خودِ پیکسل‌ها
    // ثبت می‌شود، جایی که دیگر قابل جبران نیست.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }

  try {
    const side = Math.min(bitmap.width, bitmap.height);
    // بزرگ‌نمایی نمی‌کنیم: عکس ۲۰۰ پیکسلی با کشیده شدن به ۵۱۲ فقط
    // حجیم‌تر می‌شود، واضح‌تر نه
    const size = Math.min(side, AVATAR_SIZE);

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    const context = canvas.getContext("2d");
    if (!context) return file;

    context.fillStyle = MATTE;
    context.fillRect(0, 0, size, size);
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size,
    );

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", AVATAR_QUALITY),
    );

    if (!blob) return file;

    // نام تازه و ثابت: نام فایل اصلی به کلید آبجکت راه پیدا می‌کند و
    // پسوندش دیگر با محتوا نمی‌خواند
    return new File([blob], "avatar.jpg", { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}
