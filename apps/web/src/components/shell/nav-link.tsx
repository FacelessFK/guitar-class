import Link from "next/link";

import { cx } from "@/lib/cx";

/**
 * لینک ناوبری.
 *
 * دو شکلِ «صفحه‌ی فعلی» در دیزاین هست و هر دو خط بنفشِ ۱ پیکسلی‌اند —
 * فقط عرضش فرق می‌کند:
 *
 *   `site` لبه‌ی زیرینِ تمام‌عرضِ خودِ متن (`border-bottom`)
 *   `app`  خطی به عرض `calc(100% - 24px)` که وسط‌چین زیر آیتمِ
 *          پدینگ‌دار می‌نشیند — پس کوتاه‌تر از ناحیه‌ی کلیک است
 *
 * بازبینی دیزاین (بند B-09) پیش از این سه شکل مختلفِ حالت فعال را
 * گرفته بود؛ حالا فقط این دو مانده و هر دو `aria-current="page"` هم
 * می‌گیرند تا صفحه‌خوان همان چیزی را بگوید که چشم می‌بیند.
 */
export function NavLink({
  href,
  active,
  world,
  children,
}: {
  href: React.ComponentProps<typeof Link>["href"];
  active: boolean;
  world: "site" | "app";
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "transition-colors duration-150",
        world === "site"
          ? active
            ? "border-b border-violet pb-1 text-ink"
            : "text-ink-2 hover:text-ink"
          : active
            ? "px-3 pt-2 pb-3 text-ink [background:linear-gradient(var(--color-violet),var(--color-violet))_no-repeat_bottom_center/calc(100%-24px)_1px]"
            : "px-3 pt-2 pb-3 text-ink-2 hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}
