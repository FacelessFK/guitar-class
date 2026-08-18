"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Avatar } from "@/components/avatar";
import { NotificationBell } from "@/components/notification-bell";
import { useSession } from "@/lib/session";

/**
 * پوسته‌ی اپِ پشت لاگین.
 *
 * ناوبری از روی خودِ کاربر ساخته می‌شود نه از روی یک فیلد «نقش»: هر
 * کسی می‌تواند هم‌زمان هنرجو و استاد باشد (سند معماری، بخش ۴.۱)، پس
 * «پنل استاد» وقتی می‌آید که `teacherProfileId` پر باشد، در کنار
 * بخش هنرجو نه به‌جای آن.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  async function handleLogout() {
    await logout();
    router.replace("/");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <nav className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="font-bold">
              کلاس آنلاین موسیقی
            </Link>

            <ul className="flex items-center gap-5 text-sm">
              <NavLink href="/dashboard" active={pathname.startsWith("/dashboard")}>
                کلاس‌های من
              </NavLink>
              <NavLink href="/dashboard/book" active={pathname === "/dashboard/book"}>
                رزرو کلاس
              </NavLink>
              <NavLink href="/practice" active={pathname.startsWith("/practice")}>
                تمرین‌ها
              </NavLink>
              {user?.teacherProfileId ? (
                <NavLink href="/teacher" active={pathname.startsWith("/teacher")}>
                  پنل استاد
                </NavLink>
              ) : (
                /*
                  کاربری که پروفایل استاد ندارد به‌جای پنل، راه ساختنش را
                  می‌بیند. تا پیش از این هیچ لینکی به این مسیر نبود و
                  «استاد شدن» فقط با ویرایش دستی دیتابیس ممکن بود.
                */
                <NavLink
                  href="/become-teacher"
                  active={pathname === "/become-teacher"}
                >
                  تدریس در پلتفرم
                </NavLink>
              )}

              {user?.isAdmin ? (
                <NavLink href="/admin" active={pathname.startsWith("/admin")}>
                  پنل ادمین
                </NavLink>
              ) : null}
            </ul>
          </div>

          <div className="flex items-center gap-5 text-sm">
            <NotificationBell />

            {/*
              نام، لینکِ صفحه‌ی پروفایل است. تا پیش از این متن ساده بود و
              هیچ راهی برای عوض کردن نام یا عکس وجود نداشت — کسی که در
              عجله «علی» تایپ کرده بود تا ابد برای استادش «علی» می‌ماند.
            */}
            <Link
              href="/profile"
              className={
                pathname.startsWith("/profile")
                  ? "flex items-center gap-2 font-medium text-accent-strong"
                  : "flex items-center gap-2 text-ink-muted"
              }
            >
              <Avatar
                name={user?.fullName ?? ""}
                url={user?.avatarUrl}
                className="size-7 shrink-0 rounded-full"
                textClassName="text-xs"
              />
              {user?.fullName}
            </Link>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="text-ink-muted underline"
            >
              خروج
            </button>
          </div>
        </nav>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}

/**
 * `active` به صورت prop می‌آید و داخل خودِ کامپوننت از `usePathname`
 * خوانده نمی‌شود: مسیر «فعال» برای هر لینک قاعده‌ی خودش را دارد —
 * «کلاس‌های من» با پیشوند تطبیق می‌کند ولی «رزرو کلاس» فقط با مسیر
 * دقیق، وگرنه هر دو هم‌زمان فعال دیده می‌شوند.
 */
function NavLink({
  href,
  active,
  children,
}: {
  href:
    | "/dashboard"
    | "/dashboard/book"
    | "/practice"
    | "/teacher"
    | "/become-teacher"
    | "/admin";
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className={active ? "font-medium text-accent-strong" : "text-ink-muted"}
      >
        {children}
      </Link>
    </li>
  );
}
