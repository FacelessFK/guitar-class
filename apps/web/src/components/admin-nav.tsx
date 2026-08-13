"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "نمای کلی" },
  { href: "/admin/teachers", label: "استادها" },
  { href: "/admin/instruments", label: "سازها" },
  { href: "/admin/posts", label: "بلاگ" },
  { href: "/admin/bookings", label: "رزروها" },
  { href: "/admin/reviews", label: "صف بررسی" },
  { href: "/admin/orders", label: "تراکنش‌ها" },
  { href: "/admin/payouts", label: "تسویه" },
] as const;

/**
 * ناوبری پنل ادمین.
 *
 * «نمای کلی» با مسیر دقیق تطبیق می‌کند و بقیه با پیشوند: بدون این
 * تفکیک، صفحه‌ی اول روی همه‌ی زیرمسیرها هم فعال دیده می‌شود. همان
 * قاعده‌ای که `AppShell` هم رعایتش می‌کند.
 */
export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-border">
      {/**
       * هشت تب روی موبایل در سه سطر می‌پیچید و نوار ناوبری را به یک
       * بلوک تبدیل می‌کرد. حالا یک سطر می‌ماند و داخل خودش اسکرول
       * می‌شود — همان رفتاری که سربرگ اصلی و پنل استاد هم دارند.
       */}
      <ul className="scroll-strip mx-auto flex max-w-5xl gap-6 px-5 text-sm">
        {TABS.map((tab) => {
          const active =
            tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);

          return (
            <li key={tab.href} className="flex-none">
              <Link
                href={tab.href}
                className={
                  active
                    ? "-mb-px block border-b-2 border-accent py-3 font-medium whitespace-nowrap text-accent"
                    : "block py-3 whitespace-nowrap text-ink-muted transition-colors hover:text-ink"
                }
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
