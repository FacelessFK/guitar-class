"use client";

import { useState } from "react";

import { cx } from "@/lib/cx";

/**
 * آکاردئون.
 *
 * باز و بسته شدن با `grid-template-rows: 0fr → 1fr` انجام می‌شود نه با
 * `max-height`: ارتفاع پاسخ از قبل معلوم نیست و با `max-height` باید
 * عددی حدسی می‌گذاشتیم که پاسخ‌های بلند را می‌بُرید یا پاسخ‌های کوتاه را
 * کند باز می‌کرد.
 *
 * فقط یکی هم‌زمان باز است — همان رفتار هر چهار صفحه‌ی دیزاین. `-۱`
 * یعنی همه بسته.
 *
 * علامتِ `+` ۴۵ درجه می‌چرخد و `−` نمی‌شود؛ چرخش، حرکتِ باز شدن را
 * نشان می‌دهد و در دیزاین همین است.
 */
export type AccordionItemData = {
  q: string;
  a: React.ReactNode;
  /** لینکِ اختیاریِ پای پاسخ — «دیدن سازها ←» */
  footer?: React.ReactNode;
};

export function Accordion({
  items,
  defaultOpen = 0,
  boxed,
  className,
}: {
  items: ReadonlyArray<AccordionItemData>;
  /** `-1` یعنی همه بسته */
  defaultOpen?: number;
  /**
   * قابِ کارت دور هر آیتم — شکلی که صفحه‌ی «نحوه کار» دارد. بدون آن،
   * آیتم‌ها با خط محوشونده از هم جدا می‌شوند (سوالات متداول، ساز،
   * پروفایل استاد).
   */
  boxed?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cx(boxed ? "flex flex-col gap-3" : "flex flex-col", className)}>
      {items.map((item, i) => {
        const on = open === i;
        return (
          <div
            key={item.q}
            className={cx(
              boxed
                ? "rounded-control bg-surface shadow-[inset_0_0_0_1px_var(--color-divider)]"
                : "rule-bottom-8",
            )}
          >
            <button
              type="button"
              aria-expanded={on}
              onClick={() => setOpen(on ? -1 : i)}
              className={cx(
                "flex w-full cursor-pointer items-baseline justify-between gap-4 border-0 bg-transparent text-start text-[17px] leading-[1.7] transition-colors duration-200",
                boxed ? "px-4.5 py-4" : "py-5",
                on ? "text-ink" : "text-ink-2 hover:text-ink",
              )}
            >
              <span className="flex-1">{item.q}</span>
              <span
                aria-hidden="true"
                className={cx(
                  "shrink-0 text-xl leading-none transition-[transform,color] duration-200",
                  on ? "rotate-45 text-wood-light" : "text-meta",
                )}
              >
                +
              </span>
            </button>

            <div
              className="grid transition-[grid-template-rows] duration-[240ms] ease-out"
              style={{ gridTemplateRows: on ? "1fr" : "0fr" }}
            >
              <div className="min-h-0 overflow-hidden">
                <p
                  className={cx(
                    "m-0 max-w-[62ch] text-base leading-[2] text-ink-2 text-pretty",
                    boxed ? "px-4.5 pb-4.5" : "pb-6 pe-8",
                  )}
                >
                  {item.a}
                </p>
                {item.footer && (
                  <div className={cx(boxed ? "px-4.5 pb-4.5" : "pb-6")}>
                    {item.footer}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
