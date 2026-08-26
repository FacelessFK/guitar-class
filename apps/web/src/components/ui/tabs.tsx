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

export function Tabs<T extends string>({
  items,
  active,
  onSelect,
  className,
}: {
  items: ReadonlyArray<TabItem<T>>;
  active: T;
  onSelect: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cx(
        "-mx-4 flex gap-5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:flex-wrap md:px-0",
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
            className={cx(
              "shrink-0 cursor-pointer whitespace-nowrap border-0 bg-transparent pt-1.5 pb-2.5 text-[13.5px] transition-colors duration-200",
              on
                ? "text-violet-strong [background:linear-gradient(var(--color-violet),var(--color-violet))_no-repeat_bottom_center/100%_1px]"
                : "text-meta hover:text-ink",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
