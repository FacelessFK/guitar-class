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
        <Link href="/" className="text-xl font-bold tracking-tight">
          هوگه
        </Link>

        <ul className="flex items-center gap-6 text-sm">
          <li>
            <Link href="/teachers">استادها</Link>
          </li>
          <li>
            <Link href="/blog">مقاله‌ها</Link>
          </li>
          <li>
            <Link href="/rules">قوانین</Link>
          </li>
          <li>
            <Link href="/dashboard" className="font-medium text-accent-strong">
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
    <footer className="mt-16 border-t border-border text-sm text-ink-muted">
      <div className="mx-auto grid max-w-5xl gap-8 px-5 py-10 sm:grid-cols-[1fr_auto]">
        <div className="max-w-sm">
          <p className="text-xl font-bold tracking-tight text-ink">هوگه</p>
          <p className="mt-3">
            یادگیری موسیقی به شیوه‌ی حرفه‌ای و دلنشین — کلاس خصوصی آنلاین،
            یک‌به‌یک و زنده.
          </p>
        </div>

        {/*
          فقط لینک‌هایی که واقعاً وجود دارند. نشانی و شبکه‌های اجتماعی
          عمداً نیست: هنوز حسابی ساخته نشده و گذاشتنِ لینکِ بی‌مقصد، بدتر
          از نبودنش است.
        */}
        <nav className="flex flex-col gap-2 sm:text-end">
          <Link href="/teachers" className="hover:text-ink">
            استادها
          </Link>
          <Link href="/blog" className="hover:text-ink">
            مقاله‌ها
          </Link>
          <Link href="/rules" className="hover:text-ink">
            قوانین و سیاست لغو
          </Link>
        </nav>
      </div>

      <div className="border-t border-border">
        <p className="mx-auto max-w-5xl px-5 py-4 text-xs">
          © هوگه — تمامی حقوق محفوظ است.
        </p>
      </div>
    </footer>
  );
}
