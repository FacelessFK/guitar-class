"use client";

import { cx } from "@/lib/cx";

/**
 * تراشه‌ی انتخابی.
 *
 * دو شکل در دیزاین هست و هر دو لازم‌اند:
 *
 *   `pill`  گرد — فیلترِ ساز در تمرین‌ها، وضعیت تسویه در درآمدها،
 *           حالت‌های نمونه‌ی نتیجه‌ی پرداخت.
 *   `box`   با شعاع کنترل — ساز و سطح در پروفایل مدرس و درخواست تدریس،
 *           و اسلات زمان در رزرو.
 *
 * حالت فعال با **پرِ ته‌رنگ + لبه‌ی بنفش** ساخته می‌شود نه با پرِ بنفش:
 * پرِ سیرِ بنفش در یک ردیفِ ده‌تایی صفحه را غرق می‌کرد و قاعده‌ی
 * «اکسنت را سیل نکن» را می‌شکست.
 */
export function Chip({
  children,
  selected,
  shape = "pill",
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
  shape?: "pill" | "box";
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      {...rest}
      className={cx(
        "cursor-pointer border-0 bg-transparent text-[13.5px] transition-[background-color,box-shadow,color] duration-200",
        shape === "pill" ? "rounded-pill px-4 py-2" : "rounded-control px-4 py-2.5 text-sm",
        selected
          ? "bg-violet-surface text-ink shadow-[inset_0_0_0_1px_var(--color-violet-border)]"
          : "text-ink-2 shadow-[inset_0_0_0_1px_var(--color-divider)] hover:bg-surface-2 hover:text-ink",
        "disabled:cursor-not-allowed disabled:opacity-45",
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * تراشه‌ی زمان — اسلات آزادِ صفحه‌ی رزرو.
 *
 * جدا از `Chip` است چون سه حالت دارد نه دو: آزاد، انتخاب‌شده، و
 * **در دسترس نیست**. حالت سوم `disabled` نیست فقط؛ متنِ توضیح هم
 * می‌گیرد و لبه‌اش نصفِ پررنگی لبه‌ی معمولی است تا در ردیف گم نشود
 * ولی دعوت به کلیک هم نکند.
 */
export function TimeChip({
  children,
  selected,
  unavailable,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
  unavailable?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      {...rest}
      disabled={unavailable || rest.disabled}
      className={cx(
        "min-w-23 rounded-control px-4 py-3 text-center text-[15px] transition-[background-color,box-shadow] duration-200",
        unavailable
          ? "cursor-default bg-transparent text-meta shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-divider)_55%,transparent)]"
          : selected
            ? "cursor-pointer bg-violet-surface text-ink shadow-[inset_0_0_0_1px_var(--color-violet-border)]"
            : "cursor-pointer bg-surface text-ink-2 shadow-[inset_0_0_0_1px_var(--color-divider)]",
        className,
      )}
    >
      {children}
    </button>
  );
}
