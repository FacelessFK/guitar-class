"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

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
              {user?.teacherProfileId ? (
                <NavLink href="/teacher" active={pathname.startsWith("/teacher")}>
                  پنل استاد
                </NavLink>
              ) : null}
            </ul>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <span className="text-ink-muted">{user?.fullName}</span>
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
  href: "/dashboard" | "/dashboard/book" | "/teacher";
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className={active ? "font-medium text-accent" : "text-ink-muted"}
      >
        {children}
      </Link>
    </li>
  );
}
