import type { Metadata } from "next";

import { RequireAuth } from "@/components/require-auth";
import { SessionBootstrap } from "@/lib/session";

/**
 * اتاق کلاس.
 *
 * عمداً بیرون از گروه `(app)` است و سربرگ و ناوبری ندارد: ویدیوکنفرانس
 * باید کل صفحه را بگیرد و هر عنصر ثابتی بالای آن، ارتفاع مفید را کم
 * می‌کند. گارد ورود همان است، پوسته نه.
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
      <RequireAuth>{children}</RequireAuth>
    </>
  );
}
