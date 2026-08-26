/**
 * عکس پروفایل، با فالبک حرف‌های اول نام.
 *
 * پیش از این هر جا `<img class="rounded-full">` جدا نوشته شده بود و
 * حالتِ «عکس ندارد» در هرکدام چیز دیگری بود: در پوسته‌ی اپ هیچ (نام
 * بدون هیچ نشانه‌ای می‌لغزید)، در پروفایل و صفحه‌ی استاد جعبه‌ی خاکستریِ
 * «بدون عکس». آن متن جای خالی را اعلام می‌کرد بی‌آنکه پرش کند.
 *
 * **کامپوننت سروری است — عمداً.** صفحه‌ی عمومی استاد SSG است و همین
 * تصویر بزرگ‌ترین عنصرِ بالای صفحه‌اش؛ کلاینتی کردنش برای مدیریت خطای
 * بارگذاری تصویر، به یک صفحه‌ی ایستا جاوااسکریپت اضافه می‌کند.
 *
 * اندازه و شکل از بیرون می‌آید، چون یکی نیست: در پوسته‌ی اپ دایره‌ی
 * ۲۸ پیکسلی است و در صفحه‌ی استاد تصویر تمام‌عرضِ بالای صفحه.
 */
export function Avatar({
  name,
  url,
  className,
  textClassName = "text-sm",
  alt = "",
}: {
  name: string;
  url?: string | null;
  /** کلاس جعبه: اندازه، شکل، و هر چیزی که به چیدمان مربوط است */
  className: string;
  /** اندازه‌ی حرف‌های فالبک؛ باید با اندازه‌ی جعبه بخواند */
  textClassName?: string;
  alt?: string;
}) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- نشانی از باکت می‌آید و دامنه‌اش با محیط عوض می‌شود؛ next/image پیکربندی دامنه می‌خواهد
      <img src={url} alt={alt} className={`object-cover ${className}`} />
    );
  }

  return (
    // فالبک همیشه از دسترس‌پذیری پنهان است: حرف اولِ نامی که همان کنارش
    // نوشته شده، برای صفحه‌خوان تکرارِ بی‌فایده است
    <span
      aria-hidden="true"
      className={`flex items-center justify-center bg-violet-surface font-medium text-violet-strong ${textClassName} ${className}`}
    >
      {initialsOf(name)}
    </span>
  );
}

/**
 * حرف اول نام و حرف اول نام خانوادگی.
 *
 * نیم‌فاصله بینشان لازم است و تزئینی نیست: حرف‌های فارسی به هم می‌چسبند
 * و «ع» و «ر» کنار هم به شکل یک کلمه‌ی سرهم درمی‌آیند، نه دو حرفِ جدا.
 */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) return "";

  const first = [...words[0]!][0] ?? "";
  if (words.length === 1) return first;

  return `${first}‌${[...words[words.length - 1]!][0] ?? ""}`;
}
