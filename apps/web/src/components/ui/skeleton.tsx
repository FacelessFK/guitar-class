import { cx } from "@/lib/cx";

/**
 * اسکلتونِ بارگذاری.
 *
 * بازبینی دیزاین (بند B-13) می‌گوید این الگو فقط در چهار صفحه هست و
 * شش صفحه‌ی دیگر بی‌آن مستقیم به محتوا می‌رسند؛ و می‌خواهد الگوی
 * صفحه‌ی رزرو **الگوی مشترکِ** همه شود. این همان است.
 *
 * `delay` برای وقتی است که چند بلوک کنار هم‌اند: بدون آن هر سه با هم
 * نفس می‌کشند و مثل یک بلوک واحد دیده می‌شوند.
 */
const DELAY = ["", "[animation-delay:0.15s]", "[animation-delay:0.3s]"] as const;

export function Skeleton({
  className,
  delay = 0,
}: {
  className?: string;
  delay?: 0 | 1 | 2;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "block rounded-control bg-surface-2 animate-pulse-slot",
        DELAY[delay],
        className,
      )}
    />
  );
}

/** سه اسلات زمان — همان چیزی که صفحه‌ی رزرو موقع گرفتن ساعت‌های آزاد نشان می‌دهد */
export function SkeletonRow({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-[46px] w-23" delay={(i % 3) as 0 | 1 | 2} />
      ))}
    </div>
  );
}
