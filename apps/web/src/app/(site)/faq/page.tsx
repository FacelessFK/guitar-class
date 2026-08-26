import type { Metadata } from "next";

import { SectionMark } from "@/components/ui";

/**
 * سوالات متداول.
 *
 * ⚠️ فعلاً فقط سرصفحه. متن سرصفحه نهایی و از پروتوتایپ تأییدشده است؛
 * بخش‌های بدنه در فاز ۸ اضافه می‌شوند (`docs/nocturne-plan.md`).
 * این صفحه در فاز ۱ ساخته شد چون آیتمش در ناوبری تأییدشده هست و بدون
 * آن سربرگ به ۴۰۴ لینک می‌داد.
 */
export const metadata: Metadata = {
  title: "سوالات متداول",
};

export default function Page() {
  return (
    <section className="mx-auto max-w-[1160px] px-4.5 pt-9 pb-11 md:px-6 md:pt-16 md:pb-20">
      <SectionMark hero tone="wood">
        راهنمای شروع
      </SectionMark>
      <h1 className="mt-5 max-w-[20ch] text-[clamp(31px,4.6vw,52px)] font-semibold tracking-[-0.025em] text-ink text-pretty">
        سوالات متداول
      </h1>
      <p className="mt-5 max-w-[46ch] text-[16.5px] leading-[1.95] text-ink-2 md:mt-6 md:text-lg">
        پاسخ سوال‌هایی که قبل از شروع مسیر یادگیری موسیقی ممکن است داشته باشی.
      </p>
    </section>
  );
}
