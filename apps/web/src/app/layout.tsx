import type { Metadata } from "next";
import { Vazirmatn } from "next/font/google";
import Link from "next/link";

import "./globals.css";

/**
 * وزیرمتن — فونت انتخاب‌شده در سند معماری.
 *
 * `next/font` فونت را در زمان بیلد دانلود و **کنار خود سایت** میزبانی
 * می‌کند، پس مرورگر کاربر هیچ درخواستی به گوگل نمی‌فرستد. برای کاربر
 * ایرانی این فقط یک نکته‌ی حریم خصوصی نیست: دسترسی به دامنه‌های گوگل
 * پایدار نیست و فونتِ بارنشده یعنی صفحه‌ای که با فونت پیش‌فرض و
 * شکسته دیده می‌شود.
 */
const vazirmatn = Vazirmatn({
  subsets: ["arabic"],
  variable: "--font-vazirmatn",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * فراداده‌ی پایه.
 *
 * `metadataBase` لازم است تا آدرس‌های Open Graph مطلق ساخته شوند؛
 * بدونش Next آدرس نسبی می‌گذارد و هیچ شبکه‌ی اجتماعی‌ای پیش‌نمایش
 * نشان نمی‌دهد.
 *
 * `title.template` یعنی هر صفحه فقط عنوان خودش را تعریف می‌کند و نام
 * سایت خودکار به آن اضافه می‌شود.
 */
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "کلاس آنلاین موسیقی با استاد خصوصی",
    template: "%s | کلاس آنلاین موسیقی",
  },
  description:
    "کلاس خصوصی آنلاین موسیقی با استادهای تأییدشده. جلسه‌ی معارفه‌ی رایگان، رزرو ساعت دلخواه، و کلاس زنده‌ی یک‌به‌یک.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "fa_IR",
    siteName: "کلاس آنلاین موسیقی",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" className={vazirmatn.variable}>
      <body className="flex min-h-screen flex-col font-sans">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
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
