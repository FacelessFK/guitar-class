import Link from "next/link";

import { PublicNav } from "@/components/shell/public-nav";

/**
 * سربرگ عمومی.
 *
 * چسبان، با پس‌زمینه‌ی ۸۲ درصدی و `backdrop-blur` — محتوا از زیرش رد
 * می‌شود و دیده می‌شود، که روی زمینه‌ی تاریک همان چیزی است که عمق
 * می‌سازد.
 *
 * **سروری می‌ماند.** فقط `PublicNav` کلاینتی است (برای `usePathname`)؛
 * برند و پوسته اینجا رندر سروری می‌شوند تا صفحات `(site)` که در زمان
 * بیلد ساخته می‌شوند کمترین جاوااسکریپت را بگیرند.
 *
 * لینک «ورود» ساده است و گارد نمی‌خواهد: اپِ پشت لاگین خودش تشخیص
 * می‌دهد کاربر از قبل واردشده و او را جلو می‌فرستد.
 */
export function PublicHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-divider bg-[color-mix(in_srgb,var(--color-bg)_82%,transparent)] backdrop-blur-[14px]">
      <div className="mx-auto flex max-w-[1160px] flex-nowrap items-center gap-3 px-4.5 py-2.75 md:flex-wrap md:gap-7 md:px-6 md:py-3.5">
        <Link
          href="/"
          className="me-auto text-[22px] font-bold tracking-[-0.02em] text-ink hover:text-ink"
        >
          هوگه
        </Link>

        <PublicNav />
      </div>
    </header>
  );
}
