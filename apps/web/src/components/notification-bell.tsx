"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { BellIcon } from "@/components/ui";
import { getNotifications } from "@/lib/app-api";
import { cx } from "@/lib/cx";

/**
 * هر چند وقت یک بار شمارنده تازه شود.
 *
 * یک دقیقه عمدی است: اعلان درون‌اپ برای اتفاقی است که همین حالا افتاده
 * ولی فوریتِ ثانیه‌ای ندارد، و نظرسنجی سریع‌تر روی اینترنت موبایل فقط
 * باتری و ترافیک می‌سوزاند. جریان زنده (SSE یا وب‌سوکت) کار درست‌تری
 * است ولی یک اتصال باز به ازای هر برگه می‌خواهد و ارزشش را وقتی دارد
 * که کاربر واقعی وجود داشته باشد.
 */
const POLL_INTERVAL_MS = 60_000;

/**
 * نشانِ اعلان‌های نخوانده.
 *
 * دیزاین **نقطه** نشان می‌دهد نه عدد (پراپ `showNavCount` پیش‌فرض
 * خاموش است): در نوار بالا مهم این است که «چیزی هست»، و عددِ دقیق در
 * خودِ صفحه‌ی اعلان‌ها می‌آید. عدد اما در `aria-label` می‌ماند، چون
 * صفحه‌خوان نقطه را نمی‌بیند.
 *
 * خطا را بی‌صدا می‌بلعد و چیزی نشان نمی‌دهد: این یک نشانه‌ی فرعی در
 * نوار بالاست و شکستن کل پوسته‌ی اپ به‌خاطر آن، هزینه‌اش از فایده‌اش
 * بیشتر است. اگر نشست تمام شده باشد، اولین درخواست واقعیِ صفحه خودش
 * کاربر را به صفحه‌ی ورود می‌فرستد.
 */
export function NotificationBell() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const data = await getNotifications();
        if (!cancelled) setUnread(data.unread);
      } catch {
        // بالا را ببین — نشانه‌ی فرعی نباید پوسته را بشکند
      }
    }

    void refresh();
    const timer = setInterval(() => void refresh(), POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // مسیر در وابستگی‌هاست تا بعد از باز کردن صفحه‌ی اعلان‌ها — که همه
    // را خوانده می‌کند — شمارنده بلافاصله صفر شود، نه یک دقیقه بعد
  }, [pathname]);

  const active = pathname.startsWith("/notifications");

  return (
    <Link
      href="/notifications"
      aria-current={active ? "page" : undefined}
      aria-label={unread > 0 ? `اعلان‌ها، ${unread} مورد نخوانده` : "اعلان‌ها"}
      className={cx(
        "relative grid size-[34px] shrink-0 place-items-center rounded-[9px] transition-[background-color,color] duration-150",
        active
          ? "bg-violet-surface text-violet-strong hover:text-violet-strong"
          : "text-ink-2 hover:bg-surface-2 hover:text-ink",
      )}
    >
      <BellIcon />
      {unread > 0 ? (
        <span
          aria-hidden="true"
          className="absolute top-1.5 end-[7px] size-1.5 rounded-full bg-violet-strong"
        />
      ) : null}
    </Link>
  );
}
