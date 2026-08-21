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
      <header className="border-b border-border">
        <div className="mx-auto max-w-5xl px-5 py-4">
          <Link href="/" className="text-xl font-bold tracking-tight">
            هوگه
          </Link>
        </div>
      </header>

      <SessionBootstrap />
      <main className="flex flex-1 items-center justify-center px-5 py-12">
        {children}
      </main>
    </div>
  );
}
