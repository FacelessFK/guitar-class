import type { Metadata } from "next";

import { RequireAuth } from "@/components/require-auth";
import { SessionBootstrap } from "@/lib/session";

/**
 * اتاق کلاس.
 *
 * عمداً بیرون از گروه `(app)` است و سربرگ و ناوبری ندارد: ویدیوکنفرانس
 * باید کل صفحه را بگیرد و هر عنصر ثابتی بالای آن، ارتفاع مفید را کم
 * می‌کند. گارد ورود همان است، پوسته نه.
 *
 * `h-screen` و `overflow-hidden` روی خودِ پوسته می‌نشینند نه صفحه:
 * صحنه‌ی ویدیو و نوار کنترل با `flex` ارتفاع را بین خودشان تقسیم
 * می‌کنند و اگر صفحه اسکرول شود نوار کنترل از دید بیرون می‌رود.
 */
export const metadata: Metadata = {
  title: "اتاق کلاس",
  robots: { index: false, follow: false },
};

export default function RoomLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <SessionBootstrap />
      <RequireAuth>
        <div className="flex h-screen flex-col overflow-hidden bg-bg leading-[1.7]">
          {children}
        </div>
      </RequireAuth>
    </>
  );
}
