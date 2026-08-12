import Link from "next/link";

import { getInstruments } from "@/lib/api";

/**
 * ⚠️ عدد باید **عینی** نوشته شود.
 *
 * Next تنظیمات سگمنت را به‌صورت ایستا و پیش از اجرای کد می‌خواند، پس
 * ثابتِ import‌شده را نمی‌پذیرد و بیلد را با «Invalid segment
 * configuration export» رد می‌کند. هم‌تای این عدد در `lib/api.ts` است
 * (`CATALOG_REVALIDATE_SECONDS`) و باید با هم عوض شوند.
 */
export const revalidate = 3600;

export default async function HomePage() {
  const instruments = await getInstruments();

  return (
    <>
      <section className="mx-auto max-w-5xl px-5 py-16">
        <h1 className="text-3xl font-bold sm:text-4xl">
          کلاس آنلاین موسیقی، خصوصی و زنده
        </h1>

        <p className="mt-6 max-w-2xl text-lg text-ink-muted">
          ساز و استادت را انتخاب کن، ساعت آزادش را رزرو کن، و کلاس را زنده و
          یک‌به‌یک برگزار کن. جلسه‌ی معارفه‌ی اول رایگان است.
        </p>

        <div className="mt-8 flex flex-wrap gap-4">
          <Link
            href="/teachers"
            className="rounded-lg bg-accent px-5 py-3 text-accent-ink"
          >
            دیدن استادها
          </Link>
          <Link
            href="/rules"
            className="rounded-lg border border-border px-5 py-3"
          >
            قوانین و سیاست لغو
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-20">
        <h2 className="text-2xl font-bold">با کدام ساز شروع می‌کنی؟</h2>

        {instruments.length === 0 ? (
          <p className="mt-6 text-ink-muted">
            هنوز سازی ثبت نشده است.
          </p>
        ) : (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {instruments.map((instrument) => (
              <li key={instrument.id}>
                <Link
                  href={`/instruments/${instrument.slug}`}
                  className="block h-full rounded-xl border border-border p-5"
                >
                  <h3 className="font-bold">{instrument.nameFa}</h3>
                  {instrument.descriptionFa ? (
                    <p className="mt-2 line-clamp-3 text-sm text-ink-muted">
                      {instrument.descriptionFa}
                    </p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
