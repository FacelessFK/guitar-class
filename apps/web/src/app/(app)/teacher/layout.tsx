import { TeacherNav } from "@/components/teacher-nav";

/**
 * پنل استاد.
 *
 * گارد «استاد بودن» اینجا نیست و لازم هم نیست: هر سه صفحه داده‌شان را
 * از `/api/teacher/*` می‌گیرند و آن اندپوینت‌ها به کاربر بدون پروفایل
 * ۴۰۳ می‌دهند. یک گارد کلاینتی روی این لایوت فقط همان تصمیم را دوباره
 * و این بار بی‌اثر می‌گرفت — و لینک پنل هم برای کاربر بدون پروفایل
 * اصلاً در ناوبری نمی‌آید.
 */
export default function TeacherLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <TeacherNav />
      {children}
    </>
  );
}
