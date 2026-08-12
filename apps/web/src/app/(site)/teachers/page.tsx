import type { Metadata } from "next";
import Link from "next/link";

import { getTeachers } from "@/lib/api";
import { faNumber, formatToman, lowestPrice } from "@/lib/format";

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
  const teachers = await getTeachers();

  return (
    <section className="mx-auto max-w-5xl px-5 py-16">
      <h1 className="text-3xl font-bold sm:text-4xl">استادها</h1>

      <p className="mt-6 max-w-2xl text-lg text-ink-muted">
        هر استاد پیش از نمایش در این فهرست بررسی و تأیید می‌شود.
      </p>

      {teachers.length === 0 ? (
        <p className="mt-10 text-ink-muted">
          هنوز استادی تأیید نشده است.
        </p>
      ) : (
        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {teachers.map((teacher) => {
            const cheapest = lowestPrice(
              teacher.offerings.map((offering) => offering.price),
            );
            const instruments = [
              ...new Set(
                teacher.offerings.map((offering) => offering.instrumentName),
              ),
            ];

            return (
              <li key={teacher.profileId}>
                <Link
                  href={`/teachers/${teacher.slug}`}
                  className="card"
                >
                  <h2 className="font-bold">{teacher.fullName}</h2>
                  <p className="mt-1 text-sm text-ink-muted">
                    {teacher.headline}
                  </p>

                  {instruments.length > 0 ? (
                    <p className="mt-3 text-sm">{instruments.join("، ")}</p>
                  ) : null}

                  <dl className="mt-3 space-y-1 text-sm">
                    {teacher.yearsExperience > 0 ? (
                      <div className="flex gap-2">
                        <dt className="text-ink-muted">سابقه:</dt>
                        <dd>{faNumber(teacher.yearsExperience)} سال</dd>
                      </div>
                    ) : null}

                    {cheapest ? (
                      <div className="flex gap-2">
                        <dt className="text-ink-muted">شروع از:</dt>
                        <dd>{formatToman(cheapest)} تومان</dd>
                      </div>
                    ) : null}
                  </dl>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
