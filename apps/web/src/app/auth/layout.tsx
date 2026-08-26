import type { Metadata } from "next";
import Link from "next/link";

import { SessionBootstrap } from "@/lib/session";

/**
 * پوسته‌ی صفحات ورود.
 *
 * گارد ندارد — این تنها جایی در اپ است که کاربرِ واردنشده باید ببیند.
 * ولی `SessionBootstrap` دارد، چون صفحه‌ی ورود باید تشخیص دهد کاربر از
 * قبل نشست فعال دارد و او را جلو بفرستد به‌جای اینکه دوباره کد بخواهد.
 *
 * دو هاله‌ی شعاعی در گوشه‌ها — یکی چوبی و یکی بنفش، هر دو زیر ۱۰ درصد
 * — تنها تزئین این صفحه‌اند. `overflow-hidden` روی `main` لازم است
 * وگرنه هاله‌ها که بیرون از کادرند صفحه را افقی اسکرول می‌کنند.
 */
export const metadata: Metadata = {
  title: "ورود",
  robots: { index: false, follow: false },
};

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col bg-bg leading-[1.75]">
      <header className="px-4.5 py-4 md:px-7 md:py-5.5">
        <Link
          href="/"
          className="text-xl font-bold tracking-[-0.02em] text-ink hover:text-ink"
        >
          هوگه
        </Link>
      </header>

      <SessionBootstrap />

      <main className="relative grid flex-1 place-items-start justify-items-center overflow-hidden px-4.5 pt-2 pb-30 md:place-items-center md:px-6 md:pb-10">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 start-[-120px] size-[520px] rounded-full [background:radial-gradient(circle,color-mix(in_srgb,var(--color-wood)_9%,transparent)_0%,transparent_68%)]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-35 end-[-160px] size-[560px] rounded-full [background:radial-gradient(circle,color-mix(in_srgb,var(--color-violet)_7%,transparent)_0%,transparent_70%)]"
        />
        {children}
      </main>
    </div>
  );
}
