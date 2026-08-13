import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  InstrumentDrawing,
  InstrumentSignature,
} from "@/components/instrument-art";
import { getTeachers, type Teacher } from "@/lib/api";
import { faNumber, formatDuration, formatToman } from "@/lib/format";

/**
 * ⚠️ عدد باید **عینی** نوشته شود.
 *
 * Next تنظیمات سگمنت را به‌صورت ایستا و پیش از اجرای کد می‌خواند، پس
 * ثابتِ import‌شده را نمی‌پذیرد و بیلد را با «Invalid segment
 * configuration export» رد می‌کند. هم‌تای این عدد در `lib/api.ts` است
 * (`CATALOG_REVALIDATE_SECONDS`) و باید با هم عوض شوند.
 */
export const revalidate = 3600;

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const teachers = await getTeachers();
  return teachers.map((teacher) => ({ slug: teacher.slug }));
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * یک استاد از فهرست کامل.
 *
 * اندپوینت `teachers/:slug` هم وجود دارد ولی خودش همین کار را می‌کند و
 * استفاده از فهرست، همان پاسخِ کش‌شده‌ی صفحات دیگر را دوباره مصرف
 * می‌کند به‌جای یک درخواست جدا به ازای هر استاد در زمان بیلد.
 */
async function findTeacher(slug: string): Promise<Teacher | null> {
  const teachers = await getTeachers();
  return teachers.find((teacher) => teacher.slug === slug) ?? null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const teacher = await findTeacher(slug);

  if (!teacher) return {};

  const instruments = [
    ...new Set(teacher.offerings.map((offering) => offering.instrumentName)),
  ].join("، ");

  const title = instruments
    ? `${teacher.fullName} — استاد ${instruments}`
    : teacher.fullName;

  const description =
    teacher.bio ?? `${teacher.headline} — کلاس خصوصی آنلاین با ${teacher.fullName}.`;

  return {
    title,
    description,
    alternates: { canonical: `/teachers/${teacher.slug}` },
    openGraph: { title, description, type: "profile" },
  };
}

export default async function TeacherPage({ params }: PageProps) {
  const { slug } = await params;
  const teacher = await findTeacher(slug);

  if (!teacher) notFound();

  return (
    <>
      <PersonJsonLd teacher={teacher} />

      <article className="mx-auto max-w-5xl px-5 py-12 sm:py-16">
        <header className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <h1 className="font-display text-4xl leading-[1.5] sm:text-5xl sm:leading-[1.45]">
              {teacher.fullName}
            </h1>
            <p className="mt-2 text-lg text-ink-soft">{teacher.headline}</p>

            {teacher.yearsExperience > 0 ? (
              <p className="tnum mt-3 text-sm text-ink-muted">
                {faNumber(teacher.yearsExperience)} سال سابقه‌ی تدریس
              </p>
            ) : null}
          </div>

          {/**
           * سازهایی که تدریس می‌کند، با همان طرحِ خطیِ صفحه‌ی ساز —
           * پیش از خواندن یک کلمه معلوم است این استاد اهل چیست.
           */}
          <div className="flex gap-3">
            {[
              ...new Map(
                teacher.offerings.map((offering) => [
                  offering.instrumentSlug,
                  offering.instrumentName,
                ]),
              ),
            ]
              .slice(0, 3)
              .map(([instrumentSlug]) => (
                <div
                  key={instrumentSlug}
                  className="rounded-lg border border-border bg-surface-sunken p-2"
                >
                  <InstrumentDrawing
                    slug={instrumentSlug}
                    className="h-16 w-16 text-accent sm:h-20 sm:w-20"
                  />
                </div>
              ))}
          </div>
        </header>

        {teacher.bio ? (
          <section className="mt-12 max-w-2xl">
            <h2 className="text-2xl font-bold">درباره‌ی استاد</h2>
            <p className="mt-4 leading-9 whitespace-pre-line text-ink-soft">
              {teacher.bio}
            </p>
          </section>
        ) : null}

        <section className="mt-12">
          <h2 className="text-2xl font-bold">کلاس‌ها و قیمت</h2>

          {teacher.offerings.length === 0 ? (
            <p className="mt-4 text-ink-muted">
              این استاد در حال حاضر کلاس فعالی ندارد.
            </p>
          ) : (
            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {teacher.offerings.map((offering) => (
                <li key={offering.id} className="card">
                  <InstrumentSignature
                    slug={offering.instrumentSlug}
                    className="w-20 text-accent-dim"
                  />
                  <h3 className="mt-3 font-display text-2xl leading-tight">
                    {offering.instrumentName}
                  </h3>
                  <p className="tnum mt-2 text-sm text-ink-muted">
                    {formatDuration(offering.durationMinutes)}
                  </p>
                  <p className="tnum mt-1 text-lg">
                    {formatToman(offering.price)} تومان
                  </p>

                  {/*
                    ساز و استاد هر دو در آدرس می‌روند تا کسی که از
                    جست‌وجو به این صفحه رسیده و تصمیمش را گرفته، دو
                    مرحله‌ی اول جریان رزرو را دوباره طی نکند. اگر
                    واردنشده باشد، گاردِ `/dashboard` او را به ورود
                    می‌فرستد و بعد به همین‌جا برمی‌گرداند.
                  */}
                  <Link
                    href={{
                      pathname: "/dashboard/book",
                      query: {
                        instrument: offering.instrumentSlug,
                        teacher: teacher.slug,
                      },
                    }}
                    className="btn-primary mt-4"
                  >
                    رزرو این کلاس
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </article>
    </>
  );
}

function PersonJsonLd({ teacher }: { teacher: Teacher }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: teacher.fullName,
    jobTitle: teacher.headline,
    ...(teacher.bio ? { description: teacher.bio } : {}),
    ...(teacher.avatarUrl ? { image: teacher.avatarUrl } : {}),
    knowsAbout: [
      ...new Set(teacher.offerings.map((offering) => offering.instrumentName)),
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
