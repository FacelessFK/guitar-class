"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useSession } from "@/lib/session";

/**
 * گارد مسیرهای پشت لاگین.
 *
 * سه وضعیت دارد و هر سه لازم‌اند:
 *
 *   `loading`        هنوز معلوم نیست — چیزی جز اسکلت نشان نده
 *   `anonymous`      برو صفحه‌ی ورود، و مقصد را با خودت ببر
 *   `authenticated`  محتوا
 *
 * حذف حالت اول وسوسه‌انگیز است ولی یعنی هر بار تازه‌سازی صفحه، کاربرِ
 * واردشده برای یک لحظه به صفحه‌ی ورود پرتاب می‌شود — چون تا وقتی توکن
 * تازه‌سازی امتحان نشده، «واردنشده» نمی‌دانیم.
 *
 * ⚠️ این گارد **تجربه‌ی کاربری** است، نه امنیت. هیچ داده‌ای پشت آن پنهان
 * نیست؛ محافظت واقعی گاردِ سراسری API است که بدون توکن معتبر هیچ چیز
 * برنمی‌گرداند.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status !== "anonymous") return;

    // مقصد فعلی همراه می‌رود تا بعد از ورود، کاربر به همان‌جا برگردد
    // نه به داشبورد. کسی که روی لینک کلاسش کلیک کرده و نشستش تمام شده
    // باید بعد از ورود سر همان کلاس برگردد.
    const next = window.location.pathname + window.location.search;
    router.replace(`/auth/login?next=${encodeURIComponent(next)}`);
  }, [status, router]);

  if (status !== "authenticated") {
    return <FullPageLoading />;
  }

  return <>{children}</>;
}

export function FullPageLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <p className="text-sm text-ink-muted">در حال بارگذاری…</p>
    </div>
  );
}
