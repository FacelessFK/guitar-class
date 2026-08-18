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
      <ul className="mx-auto flex max-w-5xl flex-wrap gap-6 px-5 text-sm">
        {TABS.map((tab) => {
          const active =
            tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);

          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={
                  active
                    ? "-mb-px block border-b-2 border-accent py-3 font-medium text-accent-strong"
                    : "block py-3 text-ink-muted"
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
