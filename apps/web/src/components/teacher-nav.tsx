"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/teacher", label: "کلاس‌ها" },
  { href: "/teacher/availability", label: "برنامه‌ی من" },
  { href: "/teacher/profile", label: "پروفایل من" },
  { href: "/teacher/earnings", label: "درآمد" },
] as const;

/**
 * ناوبری داخل پنل استاد.
 *
 * سه بخش پنل مسیر جدا دارند نه تب درون‌صفحه‌ای: هر کدام داده‌ی خودش
 * را می‌خواند و ادغامشان یعنی باز کردن «کلاس‌ها» درآمد و برنامه را هم
 * می‌گیرد. ضمناً استاد می‌تواند مستقیم روی «برنامه‌ی من» بوکمارک بگذارد.
 */
export function TeacherNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-border">
      {/** روی موبایل تب‌ها به‌جای بیرون زدن از صفحه، داخل نوار اسکرول می‌شوند */}
      <ul className="scroll-strip mx-auto flex max-w-3xl gap-6 px-5 text-sm">
        {TABS.map((tab) => {
          const active = pathname === tab.href;

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
