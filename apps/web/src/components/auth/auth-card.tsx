import Link from "next/link";

import { Mark } from "@/components/ui";

/**
 * کارت ورود — قالب مشترک ورود و ثبت‌نام.
 *
 * دیزاین **یک سطح ورود** دارد و پنج حالتش (رمز عبور، شماره، کد، کاربر
 * تازه، ثبت‌نام) همین کارت را پر می‌کنند. پیش از نسخه‌ی تأییدشده دو
 * سطح ورودِ جدا با دو لحن متفاوت در محصول بود — یکی «وارد شوید» و یکی
 * «وارد شو» — و بازبینی دیزاین (بند A-08) یکی‌شان را قطعی کرد: همین،
 * با لحن غیررسمیِ «تو».
 *
 * در تولید دو **مسیر** داریم (`/auth/login` و `/auth/register`) نه یک
 * صفحه با پراپ: ثبت‌نام رمز **می‌سازد** و ورود رمز **می‌گیرد**؛ یک فرمِ
 * دو‌منظوره به راهی برای عوض کردن رمزِ حسابِ دیگری تبدیل می‌شد. پس
 * سوییچِ پای کارت لینک است، نه تغییر حالت.
 */
export function AuthCard({
  heading,
  lede,
  children,
  switchLede,
  switchHref,
  switchCta,
}: {
  heading: string;
  /** می‌تواند `<bdi>` شماره‌ی ماسک‌شده را در خودش داشته باشد */
  lede: React.ReactNode;
  children: React.ReactNode;
  switchLede?: string;
  switchHref?: React.ComponentProps<typeof Link>["href"];
  switchCta?: string;
}) {
  return (
    <div className="relative w-[min(432px,100%)]">
      <div className="rounded-card bg-surface px-5 pt-6.5 pb-6 shadow-[inset_0_0_0_1px_var(--color-divider-soft)] md:px-8 md:pt-[34px] md:pb-[30px]">
        <Mark width="lg" className="mb-[22px] w-[34px]" />

        <h1 className="m-0 text-2xl font-semibold leading-normal tracking-[-0.02em] text-ink md:text-[26px]">
          {heading}
        </h1>
        <p className="mt-2.5 text-[15px] leading-[1.85] text-ink-2">{lede}</p>

        {children}

        {switchLede && switchHref && switchCta ? (
          <p className="rule-plain mt-6 pt-5 text-[14.5px] text-ink-2">
            <span>{switchLede}</span>
            <Link href={switchHref} className="ms-1.5 inline-block py-1.5">
              {switchCta}
            </Link>
          </p>
        ) : null}
      </div>

      <p className="mt-[18px] text-center text-sm">
        <Link
          href="/"
          className="inline-block px-3 py-2 text-meta hover:text-ink"
        >
          بازگشت به وب‌سایت هوگه ←
        </Link>
      </p>
    </div>
  );
}
