import { cx } from "@/lib/cx";

/**
 * عکسِ محتوایی.
 *
 * هر عکس در دیزاین از این ساختار رد می‌شود و هیچ‌کدام مستقیم `<img>`
 * نیستند: یک «چاهِ» تاریک‌تر از صفحه، و رویش عکس با
 * `mix-blend-mode: lighten`. هر پیکسلی از عکس که تاریک‌تر از چاه باشد
 * ناپدید می‌شود، پس پرتره‌ای که روی زمینه‌ی سیاه گرفته شده لبه‌ی
 * مستطیلی‌اش را از دست می‌دهد و در صفحه حل می‌شود.
 *
 * فیلترِ `contrast(1.05) saturate(1.02)` هم بخشی از سیستم است نه
 * سلیقه: هفت پرتره‌ی دیزاین همه با همین مقدار تصحیح شده‌اند تا کنار هم
 * یک‌دست دیده شوند.
 *
 * `focus` نقطه‌ی مرکزِ برش است و برای هر عکس فرق می‌کند — چهره‌ها در
 * پرتره‌ها هم‌ارتفاع نیستند. `object-position` دلخواه است، پس ناچار
 * inline می‌آید؛ رنگ نیست و قاعده‌ی «هیچ رنگ خامی در کامپوننت» را
 * نمی‌شکند.
 *
 * **کامپوننت سروری است.** صفحات عمومی SSG هستند و این تصویرِ بزرگ‌ترین
 * عنصر بالای صفحه‌شان است.
 */
export function Photo({
  src,
  alt,
  focus = "50% 50%",
  ratio,
  rounded = "card",
  className,
  imgClassName,
}: {
  src: string;
  alt: string;
  /** مقدار `object-position` — مثلاً `"55% 34%"` */
  focus?: string;
  /** مقدار `aspect-ratio` — مثلاً `"4 / 5"` */
  ratio?: string;
  rounded?: "card" | "panel" | "control" | "stage" | "full" | "none";
  className?: string;
  imgClassName?: string;
}) {
  return (
    <div
      style={ratio ? { aspectRatio: ratio } : undefined}
      className={cx(
        "relative overflow-hidden bg-well",
        rounded === "card" && "rounded-card",
        rounded === "panel" && "rounded-panel",
        rounded === "control" && "rounded-control",
        rounded === "stage" && "rounded-stage",
        rounded === "full" && "rounded-full",
        className,
      )}
    >
      <div className="lighten absolute inset-0 [filter:contrast(1.05)_saturate(1.02)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- نشانی از باکت می‌آید و دامنه‌اش با محیط عوض می‌شود؛ next/image پیکربندی دامنه می‌خواهد */}
        <img
          src={src}
          alt={alt}
          style={{ objectPosition: focus }}
          className={cx("size-full object-cover", imgClassName)}
        />
      </div>
    </div>
  );
}
