import Link from "next/link";

/**
 * پوسته‌ی بخش عمومی — همان صفحاتی که گوگل می‌بیند.
 *
 * هیچ کد نشستی اینجا نیست و عمداً هم نباید بیاید: این صفحات در زمان
 * بیلد ساخته می‌شوند و افزودن یک `useSession` به سربرگ، کل درخت را
 * کلاینتی می‌کند. لینک «ورود» یک `Link` ساده است؛ اپِ پشت لاگین خودش
 * تشخیص می‌دهد کاربر از قبل واردشده است و او را جلو می‌فرستد.
 */
export default function SiteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="border-b border-border">
      <nav className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-5 py-4">
        <Link href="/" className="font-bold">
          کلاس آنلاین موسیقی
        </Link>

        <ul className="flex items-center gap-6 text-sm">
          <li>
            <Link href="/teachers">استادها</Link>
          </li>
          <li>
            <Link href="/rules">قوانین</Link>
          </li>
          <li>
            <Link href="/dashboard" className="font-medium text-accent">
              ورود
            </Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-border text-sm text-ink-muted">
      <div className="mx-auto max-w-5xl px-5 py-8">
        <p>
          کلاس خصوصی آنلاین موسیقی، یک‌به‌یک و زنده. پیش از رزرو،{" "}
          <Link href="/rules" className="underline">
            قوانین و سیاست لغو
          </Link>{" "}
          را بخوانید.
        </p>
      </div>
    </footer>
  );
}
