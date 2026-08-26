"use client";

import { usePathname, useRouter } from "next/navigation";

import { NotificationBell } from "@/components/notification-bell";
import {
  AppBar,
  MenuIdentity,
  UserPill,
} from "@/components/shell/app-header";
import {
  MobileMenu,
  MobileMenuButton,
  MobileMenuLink,
  MobileMenuRule,
} from "@/components/ui";
import { useSession } from "@/lib/session";

/**
 * سربرگ پنل استاد.
 *
 * پیش از نسخه‌ی تأییدشده، صفحات استاد **ناوبری هنرجو** را می‌پوشیدند و
 * سه مقصدِ هنرجو را نشان می‌دادند بی‌آنکه هیچ لینکی به برنامه‌ی زمانی،
 * درآمد یا پروفایل مدرس داشته باشند (بازبینی دیزاین، بند A-07). حالا
 * نقش استاد ناوبری خودش را دارد.
 *
 * قرصِ «حالت استاد» **ایستاست** — دیزاین همین را کشیده و کنترل
 * جابه‌جایی نقش ندارد. برای حساب دو‌نقشه فعلاً «حساب کاربری» راهِ
 * برگشت به دنیای هنرجوست؛ تصمیم نهایی در `docs/nocturne-plan.md`
 * بند ۸.۴ به تعویق افتاده.
 */
export function TeacherHeader() {
  const { user, logout } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  async function handleLogout() {
    await logout();
    router.replace("/");
  }

  const nav = [
    {
      href: "/teacher" as const,
      label: "داشبورد",
      active: pathname === "/teacher",
    },
    {
      href: "/teacher/availability" as const,
      label: "زمان‌های تدریس",
      active: pathname.startsWith("/teacher/availability"),
    },
    {
      href: "/teacher/profile" as const,
      label: "پروفایل مدرس",
      active: pathname.startsWith("/teacher/profile"),
    },
    {
      href: "/teacher/earnings" as const,
      label: "درآمد",
      active: pathname.startsWith("/teacher/earnings"),
    },
  ];

  return (
    <AppBar
      nav={nav}
      leading={
        <span className="hidden shrink-0 rounded-pill bg-violet-surface px-2.5 py-1 text-xs text-violet-strong lg:block">
          حالت استاد
        </span>
      }
      trailing={
        <>
          <NotificationBell />
          <UserPill
            name={user?.fullName ?? ""}
            avatarUrl={user?.avatarUrl}
            active={pathname.startsWith("/profile")}
          />
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="hidden shrink-0 cursor-pointer border-0 bg-transparent text-sm text-meta transition-colors hover:text-ink-2 md:block"
          >
            خروج
          </button>
        </>
      }
      menu={
        <MobileMenu label="منوی استاد">
          <MenuIdentity
            name={user?.fullName ?? ""}
            avatarUrl={user?.avatarUrl}
            badge="حالت استاد"
          />
          {nav.map((item) => (
            <MobileMenuLink key={item.href} href={item.href} active={item.active}>
              {item.label}
            </MobileMenuLink>
          ))}
          <MobileMenuRule />
          <MobileMenuLink
            href="/notifications"
            active={pathname.startsWith("/notifications")}
          >
            اعلان‌ها
          </MobileMenuLink>
          <MobileMenuLink href="/profile" active={pathname.startsWith("/profile")}>
            حساب کاربری
          </MobileMenuLink>
          <MobileMenuButton onClick={() => void handleLogout()}>
            خروج
          </MobileMenuButton>
        </MobileMenu>
      }
    />
  );
}
