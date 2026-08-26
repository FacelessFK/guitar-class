"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Avatar } from "@/components/avatar";
import { NotificationBell } from "@/components/notification-bell";
import { NavLink } from "@/components/shell/nav-link";
import {
  ChevronDownIcon,
  MobileMenu,
  MobileMenuButton,
  MobileMenuLink,
  MobileMenuRule,
} from "@/components/ui";
import { cx } from "@/lib/cx";
import { useSession } from "@/lib/session";

/**
 * سربرگ اپِ هنرجو.
 *
 * ناوبری از روی خودِ کاربر ساخته می‌شود نه از روی یک فیلد «نقش»: هر
 * کسی می‌تواند هم‌زمان هنرجو و استاد باشد (سند معماری، بخش ۴.۱). آیتم
 * چهارم برای کسی که پروفایل استاد دارد «پنل استاد» است و برای بقیه
 * «تدریس در پلتفرم» — همان چیزی که دیزاین برای هنرجو کشیده.
 *
 * جابه‌جایی نقشِ صریح (کنترلی که بین دو دنیا سوییچ کند) عمداً نیست؛
 * تصمیمش به تعویق افتاده و در `docs/nocturne-plan.md` بند ۸.۴ ثبت شده.
 *
 * «پنل ادمین» در دیزاین وجود ندارد و ابزار داخلی است؛ همان‌طور که بود
 * ماند و در فاز ۹ فقط توکن‌هایش عوض می‌شود.
 */
export function AppHeader() {
  const { user, logout } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  async function handleLogout() {
    await logout();
    router.replace("/");
  }

  const isTeacher = !!user?.teacherProfileId;

  /*
   * «فعال» برای هر لینک قاعده‌ی خودش را دارد: «کلاس‌های من» با پیشوند
   * تطبیق می‌کند ولی «رزرو کلاس» فقط با مسیر دقیق، وگرنه در
   * `/dashboard/book` هر دو هم‌زمان فعال دیده می‌شوند.
   */
  const nav = [
    {
      href: "/dashboard" as const,
      label: "کلاس‌های من",
      active: pathname === "/dashboard" || pathname.startsWith("/sessions"),
    },
    {
      href: "/dashboard/book" as const,
      label: "رزرو کلاس",
      active: pathname === "/dashboard/book",
    },
    {
      href: "/practice" as const,
      label: "تمرین‌ها",
      active: pathname.startsWith("/practice"),
    },
    isTeacher
      ? {
          href: "/teacher" as const,
          label: "پنل استاد",
          active: pathname.startsWith("/teacher"),
        }
      : {
          href: "/become-teacher" as const,
          label: "تدریس در پلتفرم",
          active: pathname === "/become-teacher",
        },
    ...(user?.isAdmin
      ? [
          {
            href: "/admin" as const,
            label: "پنل ادمین",
            active: pathname.startsWith("/admin"),
          },
        ]
      : []),
  ];

  return (
    <AppBar
      nav={nav}
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
        <MobileMenu label="منوی حساب">
          <MenuIdentity name={user?.fullName ?? ""} avatarUrl={user?.avatarUrl} />
          {nav.map((item) => (
            <MobileMenuLink key={item.href} href={item.href} active={item.active}>
              {item.label}
            </MobileMenuLink>
          ))}
          <MobileMenuLink
            href="/notifications"
            active={pathname.startsWith("/notifications")}
          >
            اعلان‌ها
          </MobileMenuLink>
          <MobileMenuLink href="/profile" active={pathname.startsWith("/profile")}>
            پروفایل
          </MobileMenuLink>
          <MobileMenuRule />
          <MobileMenuButton onClick={() => void handleLogout()}>
            خروج
          </MobileMenuButton>
        </MobileMenu>
      }
    />
  );
}

/**
 * قالبِ مشترک نوار بالا — هنرجو و استاد از یک اسکلت استفاده می‌کنند.
 *
 * بین ۷۶۸ و ۱۰۲۳ پیکسل ناوبری اسکرول افقی می‌شود و اسکرول‌بارش پنهان
 * است: چهار برچسب فارسی در آن عرض جا نمی‌شوند ولی هنوز آن‌قدر عرض هست
 * که منوی همبرگری زیادی به نظر برسد.
 */
export function AppBar({
  nav,
  leading,
  trailing,
  menu,
}: {
  nav: ReadonlyArray<{
    href: React.ComponentProps<typeof Link>["href"];
    label: string;
    active: boolean;
  }>;
  leading?: React.ReactNode;
  trailing: React.ReactNode;
  menu: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-divider bg-[color-mix(in_srgb,var(--color-bg)_88%,transparent)] backdrop-blur-[12px]">
      <div className="mx-auto flex max-w-[1080px] flex-nowrap items-center gap-3 px-4.5 py-2.5 md:flex-wrap md:gap-5 md:px-6 md:py-3">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 text-[19px] font-bold tracking-[-0.02em] text-ink hover:text-ink"
        >
          <span>هوگه</span>
          <span aria-hidden="true" className="h-px w-[22px] bg-wood" />
        </Link>

        <nav className="ms-2 hidden min-w-0 items-center overflow-x-auto text-[14.5px] [scrollbar-width:none] md:flex lg:gap-1 lg:overflow-visible [&::-webkit-scrollbar]:hidden">
          {nav.map((item) => (
            <span key={String(item.href)} className="whitespace-nowrap">
              <NavLink href={item.href} world="app" active={item.active}>
                {item.label}
              </NavLink>
            </span>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-3 md:gap-3.5">
          {leading}
          {trailing}
          {menu}
        </div>
      </div>
    </header>
  );
}

/**
 * قرصِ کاربر.
 *
 * نام بین ۷۶۸ و ۱۰۲۳ پیکسل پنهان می‌شود و فقط آواتار می‌ماند — همان
 * جایی که ناوبری هم دارد فشرده می‌شود.
 */
export function UserPill({
  name,
  avatarUrl,
  active,
  href = "/profile",
}: {
  name: string;
  avatarUrl?: string | null;
  active: boolean;
  href?: React.ComponentProps<typeof Link>["href"];
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "hidden shrink-0 items-center gap-2.5 rounded-pill py-1 ps-1 pe-2.5 text-sm transition-colors duration-150 md:flex",
        active
          ? "bg-surface-2 text-ink hover:text-ink"
          : "text-ink-2 hover:bg-surface-2 hover:text-ink-2",
      )}
    >
      <Avatar
        name={name}
        url={avatarUrl}
        className="size-7 shrink-0 rounded-full"
        textClassName="text-xs"
      />
      <span className="hidden lg:inline">{name}</span>
      <ChevronDownIcon />
    </Link>
  );
}

/** سطر هویت در بالای منوی موبایل — همان چیزی که قرصِ کاربر در دسکتاپ است */
export function MenuIdentity({
  name,
  avatarUrl,
  badge,
}: {
  name: string;
  avatarUrl?: string | null;
  badge?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 px-3.5 pt-2 pb-3.5 text-sm text-ink-2">
      <Avatar
        name={name}
        url={avatarUrl}
        className="size-7 shrink-0 rounded-full"
        textClassName="text-xs"
      />
      <span>{name}</span>
      {badge && (
        <span className="ms-auto text-[11.5px] text-violet-strong">{badge}</span>
      )}
    </div>
  );
}
