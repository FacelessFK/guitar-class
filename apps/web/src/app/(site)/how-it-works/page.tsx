import type { Metadata } from "next";

import { SectionMark } from "@/components/ui";

/**
 * نحوه کار.
 *
 * ⚠️ فعلاً فقط سرصفحه. متن سرصفحه نهایی و از پروتوتایپ تأییدشده است؛
 * بخش‌های بدنه در فاز ۸ اضافه می‌شوند (`docs/nocturne-plan.md`).
 * این صفحه در فاز ۱ ساخته شد چون آیتمش در ناوبری تأییدشده هست و بدون
 * آن سربرگ به ۴۰۴ لینک می‌داد.
 */
export const metadata: Metadata = {
  title: "نحوه کار",
};

export default function Page() {
  return (
    <section className="mx-auto max-w-[1160px] px-4.5 pt-9 pb-11 md:px-6 md:pt-16 md:pb-20">
      <SectionMark hero tone="wood">
        نحوه کار هوگه
      </SectionMark>
      <h1 className="mt-5 max-w-[20ch] text-[clamp(31px,4.6vw,52px)] font-semibold tracking-[-0.025em] text-ink text-pretty">
        مسیر یادگیری موسیقی در هوگه
      </h1>
      <p className="mt-5 max-w-[46ch] text-[16.5px] leading-[1.95] text-ink-2 md:mt-6 md:text-lg">
        از انتخاب ساز تا تمرین بعد از کلاس، همه چیز برای یک مسیر شخصی و واقعی طراحی شده است.
      </p>
    </section>
  );
}
