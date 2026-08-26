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
 * ⚠️ **`overflow-hidden` روی `main` نیست و نباید بیاید.** دو هاله‌ی
 * تزئینی از کادر بیرون می‌زنند و باید بریده شوند، ولی بریدن را خودِ
 * لایه‌ی تزئین انجام می‌دهد نه ظرفِ محتوا. اگر `main` ببُرد:
 *
 * - حالت‌های بلندِ ورود (ثبت‌نام با سه فیلد و خطا، یا مرحله‌ی کد با
 *   فیلد نام) روی نمایشگر کوتاه از پایین بریده می‌شوند و راهی برای
 *   اسکرول نمی‌ماند؛
 * - و روی موبایل، باز شدن کیبورد ارتفاع دیدنی را نصف می‌کند و دکمه‌ی
 *   ارسال زیر کیبورد گم می‌شود.
 *
 * پس محتوا در جریان عادی می‌ماند و صفحه اسکرول می‌شود. روی نمایشگر
 * کوتاه کارت از **بالا** شروع می‌شود (`items-start`) و فقط از `md` به
 * بالا وسط‌چین می‌شود — وسط‌چینیِ اجباری روی محتوای بلندتر از پنجره،
 * بالای کارت را به بیرونِ دسترس می‌فرستد.
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

      <main className="relative flex flex-1 flex-col items-center justify-start px-4.5 pt-2 pb-30 md:justify-center md:px-6 md:pb-10">
        {/*
          لایه‌ی تزئین: خودش می‌بُرد، و `absolute` است تا ارتفاع ظرف را
          تعیین نکند. `pointer-events-none` لازم است وگرنه روی کارت
          می‌افتد و کلیک را می‌خورد.
        */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <span className="absolute -top-20 start-[-120px] size-[520px] rounded-full [background:radial-gradient(circle,color-mix(in_srgb,var(--color-wood)_9%,transparent)_0%,transparent_68%)]" />
          <span className="absolute -bottom-35 end-[-160px] size-[560px] rounded-full [background:radial-gradient(circle,color-mix(in_srgb,var(--color-violet)_7%,transparent)_0%,transparent_70%)]" />
        </div>

        {children}
      </main>
    </div>
  );
}
