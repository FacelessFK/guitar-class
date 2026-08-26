"use client";

import { useEffect, useRef } from "react";

import { cx } from "@/lib/cx";

/**
 * دیالوگ.
 *
 * سه جا در دیزاین هست: خروج از کلاس، پایان کلاس، و «تغییرات ذخیره‌نشده
 * داری» در پروفایل مدرس و درخواست تدریس.
 *
 * `<dialog>` نیتیو استفاده می‌شود نه `div` — سه چیز را مجانی می‌دهد که
 * دستی نوشتنشان همیشه ناقص می‌ماند: به دام انداختن فوکوس، بستن با
 * Escape، و بیرون بردن بقیه‌ی صفحه از دسترسِ صفحه‌خوان. تنها کاری که
 * باید بکنیم `showModal()` است، چون React خودش این را صدا نمی‌زند.
 *
 * پس‌زمینه‌ی `::backdrop` در `globals.css` نیامده چون فقط همین‌جا لازم
 * است و به‌عنوان کلاس دلخواه روی همین کامپوننت می‌نشیند.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  actions,
  width = "sm",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: React.ReactNode;
  actions: React.ReactNode;
  width?: "sm" | "md";
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        // پیش‌فرضِ Escape خودِ `close()` است ولی حالتِ React عوض نمی‌شود
        // و دیالوگ در رندر بعدی برمی‌گردد
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // کلیک روی خودِ `dialog` یعنی کلیک روی backdrop؛ کارت درونی
        // رویداد را متوقف می‌کند
        if (e.target === ref.current) onClose();
      }}
      className={cx(
        "m-auto w-full bg-transparent p-6 text-ink backdrop:bg-[color-mix(in_srgb,#0a0c16_72%,transparent)]",
        width === "sm" ? "max-w-[400px]" : "max-w-[420px]",
      )}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-card bg-surface p-6 shadow-dialog animate-fade"
      >
        <h2 className="m-0 text-[19px] font-semibold leading-normal text-ink">
          {title}
        </h2>
        {children && (
          <div className="mt-2.5 text-[14.5px] leading-[1.9] text-ink-2 text-pretty">
            {children}
          </div>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-2.5">{actions}</div>
      </div>
    </dialog>
  );
}
