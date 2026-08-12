import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  getTeachers,
  type Teacher,
} from "@/lib/api";
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

      <article className="mx-auto max-w-5xl px-5 py-16">
        <h1 className="text-3xl font-bold sm:text-4xl">{teacher.fullName}</h1>
        <p className="mt-3 text-lg text-ink-muted">{teacher.headline}</p>

        {teacher.yearsExperience > 0 ? (
          <p className="mt-4 text-sm">
            {faNumber(teacher.yearsExperience)} سال سابقه‌ی تدریس
          </p>
        ) : null}

        {teacher.bio ? (
          <section className="mt-10 max-w-2xl">
            <h2 className="text-2xl font-bold">درباره‌ی استاد</h2>
            <p className="mt-4 whitespace-pre-line">{teacher.bio}</p>
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
                <li
                  key={offering.id}
                  className="card"
                >
                  <h3 className="font-bold">{offering.instrumentName}</h3>
                  <p className="mt-2 text-sm text-ink-muted">
                    {formatDuration(offering.durationMinutes)}
                  </p>
                  <p className="mt-1">{formatToman(offering.price)} تومان</p>
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
