"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NavLink } from "@/components/shell/nav-link";
import { MobileMenu, MobileMenuLink, MobileMenuRule } from "@/components/ui";

/**
 * ناوبری عمومی — **یکدست پنج‌آیتمی**.
 *
 * پیش از نسخه‌ی تأییدشده دو ست ناوبری متفاوت در محصول بود و رفتن از یک
 * صفحه به صفحه‌ی دیگر سه بخش سایت را بی‌صدا حذف می‌کرد (بازبینی
 * دیزاین، بند A-06). «درباره هوگه» عمداً فقط در پابرگ است.
 *
 * تنها بخشِ کلاینتیِ سربرگ عمومی، و فقط به‌خاطر `usePathname`. برند و
 * دکمه‌های کنش در `PublicHeader` سروری می‌مانند تا صفحات SSG کمترین
 * جاوااسکریپت را بگیرند.
 */
const NAV = [
  { href: "/teachers", label: "استادها" },
  { href: "/instruments", label: "سازها" },
  { href: "/how-it-works", label: "نحوه کار" },
  { href: "/blog", label: "مقاله‌ها" },
  { href: "/faq", label: "سوالات متداول" },
] as const;

export function PublicNav() {
  const pathname = usePathname();
  const isOn = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <nav className="hidden items-center gap-4.5 text-[14.5px] md:flex wide:gap-6 wide:text-[15px]">
        {NAV.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            world="site"
            active={isOn(item.href)}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="hidden items-center gap-3.5 md:flex">
        <Link
          href="/auth/login"
          className="px-2 py-2 text-[14.5px] text-violet-strong"
        >
          ورود
        </Link>
        <Link href="/auth/register" className="btn-primary text-sm">
          شروع کن
        </Link>
      </div>

      <MobileMenu label="منوی هوگه">
        {NAV.map((item) => (
          <MobileMenuLink
            key={item.href}
            href={item.href}
            active={isOn(item.href)}
            edge
          >
            {item.label}
          </MobileMenuLink>
        ))}
        <MobileMenuRule />
        <MobileMenuLink href="/auth/login" tone="violet">
          ورود
        </MobileMenuLink>
        <Link
          href="/auth/register"
          className="mt-1 rounded-control bg-ivory px-3.5 py-3 text-center text-[15px] text-on-ivory hover:text-on-ivory"
        >
          شروع کن
        </Link>
      </MobileMenu>
    </>
  );
}
