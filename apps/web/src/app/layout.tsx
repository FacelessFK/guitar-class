import type { Metadata } from "next";
import { Lalezar, Vazirmatn } from "next/font/google";

import "./globals.css";

/**
 * وزیرمتن — فونت انتخاب‌شده در سند معماری.
 *
 * `next/font` فونت را در زمان بیلد دانلود و **کنار خود سایت** میزبانی
 * می‌کند، پس مرورگر کاربر هیچ درخواستی به گوگل نمی‌فرستد. برای کاربر
 * ایرانی این فقط یک نکته‌ی حریم خصوصی نیست: دسترسی به دامنه‌های گوگل
 * پایدار نیست و فونتِ بارنشده یعنی صفحه‌ای که با فونت پیش‌فرض و
 * شکسته دیده می‌شود.
 *
 * همین دانلودِ زمانِ بیلد است که اضافه کردن فونت دوم را روی سرورِ
 * بدون اینترنت ممکن می‌کند: بیلد روی ماشین توسعه انجام می‌شود و
 * ایمیج با `docker save` منتقل می‌شود.
 */
const vazirmatn = Vazirmatn({
  subsets: ["arabic"],
  variable: "--font-vazirmatn",
  display: "swap",
});

/**
 * لاله‌زار — فونت نمایشی، از حروف‌نگاری تابلوها و پوسترهای ایرانی.
 *
 * تک‌وزن است و زیر ۲۰px به‌هم می‌چسبد، پس فقط `h1`، نام ساز، و
 * وردامارک. `--font-display` در `globals.css` به آن اشاره می‌کند و
 * یوتیلیتی `font-display` از همان‌جا می‌آید.
 */
const lalezar = Lalezar({
  subsets: ["arabic"],
  weight: "400",
  variable: "--font-lalezar",
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

/**
 * لایوت ریشه فقط پوسته‌ی سند است: زبان، جهت، فونت، و رنگ پس‌زمینه.
 *
 * سربرگ و پابرگ اینجا نیستند چون سه دنیای متفاوت وجود دارد و هر کدام
 * لایوت خودش را دارد: صفحات عمومی (`(site)`) با ناوبری سئو، اپِ پشت
 * لاگین (`(app)`) با ناوبری کاربر، و اتاق کلاس (`/room`) که تمام‌صفحه
 * است و هیچ چیز اضافه‌ای نباید داشته باشد. لایوت در App Router قابل
 * حذف نیست، فقط قابل افزودن — پس هرچه اینجا بیاید در اتاق کلاس هم
 * می‌ماند.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" className={`${vazirmatn.variable} ${lalezar.variable}`}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
