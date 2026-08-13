import type { Metadata } from "next";
import Link from "next/link";

import { SessionBootstrap } from "@/lib/session";

/**
 * پوسته‌ی صفحات ورود.
 *
 * گارد ندارد — این تنها جایی در اپ است که کاربرِ واردنشده باید ببیند.
 * ولی `SessionBootstrap` دارد، چون صفحه‌ی ورود باید تشخیص دهد کاربر از
 * قبل نشست فعال دارد و او را جلو بفرستد به‌جای اینکه دوباره کد بخواهد.
 */
export const metadata: Metadata = {
  title: "ورود",
  robots: { index: false, follow: false },
};

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-surface-sunken">
        <div className="mx-auto max-w-5xl px-5 py-4">
          <Link href="/" className="font-display text-xl leading-none text-ink">
            کلاس آنلاین موسیقی
          </Link>
        </div>
      </header>

      <SessionBootstrap />
      {/**
       * فرم روی یک کارت می‌نشیند و کارت وسط صفحه.
       *
       * پیش از این فرم بدون ظرف وسط یک صفحه‌ی خالی شناور بود و در
       * دسکتاپ حدود هزار پیکسل فضای بی‌کار دورش می‌ماند؛ چیزی که مرزِ
       * «کجا باید تایپ کنم» را از بین می‌برد.
       */}
      <main className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm rounded-lg border border-border bg-surface-raised p-6 sm:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
