"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { getNotifications } from "@/lib/app-api";
import { faNumber } from "@/lib/format";

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
      className={`relative ${active ? "font-medium text-accent" : "text-ink-muted"}`}
      aria-label={
        unread > 0 ? `اعلان‌ها، ${unread} مورد نخوانده` : "اعلان‌ها"
      }
    >
      اعلان‌ها
      {unread > 0 ? (
        <span className="badge badge-off absolute -top-3 -left-4 px-1.5">
          {faNumber(unread)}
        </span>
      ) : null}
    </Link>
  );
}
