"use client";

import { AdminNav } from "@/components/admin-nav";
import { useSession } from "@/lib/session";

/**
 * پنل ادمین.
 *
 * ⚠️ این بررسی **تجربه‌ی کاربری** است، نه امنیت. محافظت واقعی
 * `AdminGuard` سمت API است که بدون `isAdmin` در توکن هیچ داده‌ای
 * برنمی‌گرداند؛ اگر این فایل را کسی حذف کند، پنل خالی می‌ماند نه باز.
 *
 * برخلاف پنل استاد که گارد کلاینتی ندارد، اینجا هست: آنجا نبودِ لینک و
 * ۴۰۳ گرفتنِ اندپوینت‌ها کافی بود، ولی صفحه‌های ادمین شش تا هستند و هر
 * کدام چند درخواست می‌زنند — کاربر عادی‌ای که به آدرس بخورد، به‌جای یک
 * پیام، انبوهی خطای بی‌ربط می‌دید.
 */
export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { user } = useSession();

  if (!user?.isAdmin) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16">
        <p className="alert-error">این بخش فقط برای مدیران است.</p>
      </div>
    );
  }

  return (
    <>
      <AdminNav />
      {children}
    </>
  );
}
