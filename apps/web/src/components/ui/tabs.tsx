"use client";

import { cx } from "@/lib/cx";

/**
 * تب‌های خط‌زیرین.
 *
 * حالت فعال = خط بنفش ۱ پیکسلی زیر آیتم + متن عاجی. بازبینی دیزاین
 * (بند B-09) این را به‌عنوان **تنها** شکلِ «صفحه‌ی فعلی/تبِ فعال» در
 * کل محصول قطعی کرده — پیش از آن سه شکل مختلف در کار بود.
 *
 * `aria-pressed` است نه `aria-current="page"`: این‌ها تبِ درون‌صفحه‌اند
 * نه لینک ناوبری، و بازبینی (بند C-03) صریحاً همین اشتباه را در
 * صفحه‌ی اعلان‌ها و درآمدها گرفته بود.
 *
 * روی موبایل اسکرول افقی می‌شود و اسکرول‌بارش پنهان است؛ فهرست
 * دسته‌های سوالات متداول و مجله در ۳۷۵ پیکسل جا نمی‌شود.
 */
export type TabItem<T extends string> = { value: T; label: string };

/**
 * عرضِ خطِ زیرین سه مقدار دارد و هر سه در دیزاین هست: تمام‌عرضِ آیتم
 * (فیلترهای تمرین و اعلان)، ۷۰٪ (تبِ روش ورود)، و ۶۰٪ (فیلتر استادها و
 * مجله). خطِ کوتاه‌تر روی آیتمِ پدینگ‌دار وسط‌چین می‌نشیند.
 */
const UNDERLINE = {
  full: "100%",
  wide: "70%",
  narrow: "60%",
} as const;

export function Tabs<T extends string>({
  items,
  active,
  onSelect,
  underline = "full",
  dense,
  className,
  itemClassName,
}: {
  items: ReadonlyArray<TabItem<T>>;
  active: T;
  onSelect: (value: T) => void;
  underline?: keyof typeof UNDERLINE;
  /** پدینگِ افقی و فاصله‌ی کمتر — شکلی که تبِ روش ورود دارد */
  dense?: boolean;
  className?: string;
  /**
   * تنظیمِ اندازه‌ی خودِ آیتم.
   *
   * دیزاین سه هندسه‌ی متفاوت برای یک نقش دارد و ساختن یک واریانتِ تازه
   * به ازای هرکدام، پریمیتیو را به سه کامپوننت تکه می‌کرد.
   */
  itemClassName?: string;
}) {
  return (
    <div
      role="tablist"
      className={cx(
        "-mx-4 flex overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:flex-wrap md:px-0",
        dense ? "gap-1.5" : "gap-5",
        className,
      )}
    >
      {items.map((item) => {
        const on = item.value === active;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onSelect(item.value)}
            style={
              on
                ? {
                    backgroundImage:
                      "linear-gradient(var(--color-violet), var(--color-violet))",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "bottom center",
                    backgroundSize: `${UNDERLINE[underline]} 1px`,
                  }
                : undefined
            }
            className={cx(
              "shrink-0 cursor-pointer whitespace-nowrap border-0 bg-transparent transition-colors duration-200",
              dense
                ? "px-3.5 pt-2 pb-3 text-[14.5px]"
                : "pt-1.5 pb-2.5 text-[13.5px]",
              on
                ? dense
                  ? "text-ink"
                  : "text-violet-strong"
                : "text-meta hover:text-ink",
              itemClassName,
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
