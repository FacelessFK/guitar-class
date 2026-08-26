"use client";

import { usePathname } from "next/navigation";

import { AppHeader } from "@/components/shell/app-header";
import { TeacherHeader } from "@/components/shell/teacher-header";

/**
 * پوسته‌ی اپِ پشت لاگین.
 *
 * دیزاین **دو پوسته‌ی جدا** برای هنرجو و استاد دارد، نه یک پوسته با
 * ناوبری متفاوت. لایوت در App Router قابل حذف نیست فقط قابل افزودن،
 * پس `(app)/teacher/layout.tsx` نمی‌تواند سربرگ والد را برداشته و
 * سربرگ خودش را بگذارد — انتخاب سربرگ همین‌جا و از روی مسیر انجام
 * می‌شود.
 *
 * ادمین سربرگ هنرجو را می‌گیرد: در دیزاین آرت‌بوردی ندارد و ابزار
 * داخلی است، پس `AdminNav` خودش زیر همین سربرگ می‌ماند.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const teacherWorld = pathname.startsWith("/teacher");

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      {teacherWorld ? <TeacherHeader /> : <AppHeader />}
      <main className="flex-1">{children}</main>
    </div>
  );
}
