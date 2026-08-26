import type { Metadata } from "next";

import { TeacherDirectory } from "@/components/teachers/teacher-directory";
import { SectionMark } from "@/components/ui";
import { getInstruments, getTeachers } from "@/lib/api";

/**
 * ⚠️ عدد باید **عینی** نوشته شود.
 *
 * Next تنظیمات سگمنت را به‌صورت ایستا و پیش از اجرای کد می‌خواند، پس
 * ثابتِ import‌شده را نمی‌پذیرد و بیلد را با «Invalid segment
 * configuration export» رد می‌کند. هم‌تای این عدد در `lib/api.ts` است
 * (`CATALOG_REVALIDATE_SECONDS`) و باید با هم عوض شوند.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "استادهای موسیقی",
  description:
    "استادهای تأییدشده‌ی کلاس آنلاین موسیقی. سابقه، ساز و قیمت هر استاد را ببینید و جلسه‌ی معارفه‌ی رایگان بگیرید.",
  alternates: { canonical: "/teachers" },
};

export default async function TeachersPage() {
  // هر دو با هم — کندترینشان زمان صفحه را تعیین می‌کند، نه جمعشان
  const [teachers, instruments] = await Promise.all([
    getTeachers(),
    getInstruments(),
  ]);

  return (
    <>
      <section className="mx-auto max-w-[1160px] px-4.5 pt-10 pb-7 md:px-6 md:pt-[clamp(56px,7vw,96px)] md:pb-[clamp(32px,4vw,48px)]">
        <SectionMark hero tone="violet" className="mb-5.5">
          استادها
        </SectionMark>

        <h1 className="max-w-[26ch] text-[clamp(32px,4.4vw,48px)] leading-[1.4] font-semibold tracking-[-0.025em] text-ink text-pretty">
          استادی را پیدا کن که با مسیر تو هماهنگ باشد.
        </h1>

        <p className="mt-6 max-w-[54ch] text-[16.5px] leading-[1.9] text-ink-2 md:text-lg">
          هر استاد پیش از دیده‌شدن در این فهرست بررسی و تأیید می‌شود — سابقه،
          نمونه‌ی تدریس و کیفیت کلاس.
        </p>
      </section>

      <TeacherDirectory teachers={teachers} instruments={instruments} />
    </>
  );
}
