"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { errorMessage } from "@/lib/api-client";
import {
  getNotifications,
  markNotificationsRead,
  type AppNotification,
} from "@/lib/app-api";
import { formatJalaliDate, formatTehranTime } from "@/lib/format";

/**
 * اعلان‌های درون‌اپ.
 *
 * متن هر اعلان از سرور می‌آید، نه از یک نگاشتِ نوع به جمله در فرانت.
 * دلیلش این است که متن به داده‌ی همان لحظه بند است («تمرین تازه: آرپژ»)
 * و ساختنش در مرورگر یعنی فرانت باید نام تمرین را هم جدا بگیرد — یا
 * جمله‌ای کلی بنویسد که هیچ‌چیز نمی‌گوید.
 *
 * باز کردن صفحه همه را خوانده می‌کند. جایگزینش — خوانده کردن تک‌تک با
 * کلیک — یعنی نشانِ زنگ روی عددی بماند که کاربر همین حالا دیده است.
 */
export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getNotifications();
      setItems(data.notifications);
      setError(null);

      if (data.unread > 0) {
        await markNotificationsRead();
        // پوسته‌ی اپ شمارنده‌اش را از سرور می‌خواند؛ این رفرش نشانِ زنگ
        // را همان لحظه پاک می‌کند به‌جای اینکه تا بارگذاری بعدی بماند
        router.refresh();
      }
    } catch (caught) {
      setError(errorMessage(caught));
      setItems([]);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <h1 className="text-2xl font-bold">اعلان‌ها</h1>

      {error ? <p className="alert-error mt-6">{error}</p> : null}

      {items === null ? (
        <p className="mt-8 text-sm text-ink-muted">در حال بارگذاری…</p>
      ) : items.length === 0 ? (
        <p className="alert-info mt-8">اعلانی ندارید.</p>
      ) : (
        <ul className="mt-8 space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <NotificationRow notification={item} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NotificationRow({ notification }: { notification: AppNotification }) {
  const body = (
    <>
      <p className={notification.read ? "" : "font-medium"}>{notification.message}</p>
      <p className="mt-1 text-xs text-ink-muted">
        {formatJalaliDate(notification.createdAt.slice(0, 10))} ساعت{" "}
        {formatTehranTime(notification.createdAt)}
      </p>
    </>
  );

  const className = `block rounded-lg border px-4 py-3 text-sm ${
    notification.read ? "border-border" : "border-accent bg-surface-muted"
  }`;

  /**
   * `href` از سرور می‌آید و می‌تواند تهی باشد.
   *
   * تهی بودنش یعنی اعلان مقصدی ندارد (اطلاعیه‌ی عمومی)، و کارت باید
   * همان‌جا بماند نه اینکه لینکِ به‌جایی‌نرسنده باشد.
   *
   * `as Route` راهِ مستندشده‌ی Next برای مسیری است که رشته‌ی ثابت نیست.
   * امن است چون مقادیر ممکن را خودِ API می‌سازد — رشته‌ی دلخواه از
   * بیرون هرگز وارد `payload.href` نمی‌شود.
   */
  return notification.href ? (
    <Link href={notification.href as Route} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
