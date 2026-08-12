import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { RequireAuth } from "@/components/require-auth";
import { SessionBootstrap } from "@/lib/session";

/**
 * اپِ پشت لاگین.
 *
 * `robots: noindex` روی کل این شاخه است، نه صفحه‌به‌صفحه: این صفحات
 * محتوای عمومی ندارند و ایندکس شدن یکی‌شان یعنی گوگل صفحه‌ی «در حال
 * بارگذاری…» را به عنوان محتوای سایت ثبت کند. سند معماری هم همین را
 * می‌گوید (بخش ۷).
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <SessionBootstrap />
      <RequireAuth>
        <AppShell>{children}</AppShell>
      </RequireAuth>
    </>
  );
}
