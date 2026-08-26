import { PublicFooter } from "@/components/shell/public-footer";
import { PublicHeader } from "@/components/shell/public-header";

/**
 * پوسته‌ی بخش عمومی — همان صفحاتی که گوگل می‌بیند.
 *
 * `page-glow` هاله‌ی شعاعیِ گوشه‌ی بالاست که در همه‌ی آرت‌بوردهای عمومی
 * هست و صفحات پشت لاگین ندارندش. `leading` اینجا ۱.۷۵ است نه ۱.۷ —
 * صفحات عمومی متن بلند دارند و دیزاین برایشان فاصله‌ی سطر بازتری
 * گذاشته.
 *
 * هیچ کد نشستی اینجا نیست و عمداً هم نباید بیاید: این صفحات در زمان
 * بیلد ساخته می‌شوند و تنها بخش کلاینتیِ سربرگ، `PublicNav` است.
 */
export default function SiteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="page-glow flex min-h-screen flex-col leading-[1.75]">
      <PublicHeader />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}
