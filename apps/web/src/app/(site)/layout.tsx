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

/**
 * وردامارک — نام برند هنوز انتخاب نشده، پس همین توصیف با فونت نمایشی
 * نقشش را بازی می‌کند. روزی که نام آمد، فقط همین رشته عوض می‌شود.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`font-display text-xl leading-none text-ink transition-colors hover:text-accent ${className ?? ""}`}
    >
      کلاس آنلاین موسیقی
    </Link>
  );
}

function SiteHeader() {
  return (
    <header className="border-b border-border bg-surface-sunken">
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4">
        <Wordmark />

        <ul className="flex items-center gap-5 text-sm text-ink-muted sm:gap-6">
          <li>
            <Link href="/teachers" className="transition-colors hover:text-ink">
              استادها
            </Link>
          </li>
          <li>
            <Link href="/blog" className="transition-colors hover:text-ink">
              مقاله‌ها
            </Link>
          </li>
          <li>
            <Link href="/rules" className="transition-colors hover:text-ink">
              قوانین
            </Link>
          </li>
          <li>
            <Link
              href="/dashboard"
              className="font-medium text-accent transition-colors hover:text-accent-strong"
            >
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
    <footer className="mt-20 border-t border-border bg-surface-sunken text-sm text-ink-muted">
      <div className="mx-auto max-w-5xl px-5 py-10">
        <p>
          کلاس خصوصی آنلاین موسیقی، یک‌به‌یک و زنده. پیش از رزرو،{" "}
          <Link href="/rules" className="text-accent underline underline-offset-4">
            قوانین و سیاست لغو
          </Link>{" "}
          را بخوانید.
        </p>
      </div>
    </footer>
  );
}
