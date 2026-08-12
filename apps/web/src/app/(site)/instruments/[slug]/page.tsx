import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getInstrument,
  getInstruments,
  getTeachers,
  type Teacher,
} from "@/lib/api";
import { faNumber, formatDuration, formatToman, lowestPrice } from "@/lib/format";

/**
 * ⚠️ عدد باید **عینی** نوشته شود.
 *
 * Next تنظیمات سگمنت را به‌صورت ایستا و پیش از اجرای کد می‌خواند، پس
 * ثابتِ import‌شده را نمی‌پذیرد و بیلد را با «Invalid segment
 * configuration export» رد می‌کند. هم‌تای این عدد در `lib/api.ts` است
 * (`CATALOG_REVALIDATE_SECONDS`) و باید با هم عوض شوند.
 */
export const revalidate = 3600;

/**
 * صفحه‌های ساز در زمان بیلد ساخته می‌شوند.
 *
 * سند معماری اینها را مهم‌ترین دارایی سئوی پروژه می‌داند: با تعداد کم
 * استاد، «کلاس آنلاین گیتار کلاسیک» خیلی بیشتر از نام یک استاد جست‌وجو
 * می‌شود.
 */
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const instruments = await getInstruments();
  return instruments.map((instrument) => ({ slug: instrument.slug }));
}

/** ساز ناشناخته باید ۴۰۴ بدهد، نه صفحه‌ی خالی. */
export const dynamicParams = true;

interface PageProps {
  params: Promise<{ slug: string }>;
}

/** عنوانی که واقعاً جست‌وجو می‌شود، نه فقط نام ساز. */
const pageTitle = (nameFa: string): string => `کلاس آنلاین ${nameFa}`;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const instrument = await getInstrument(slug);

  if (!instrument) return {};

  const title = pageTitle(instrument.nameFa);
  const description =
    instrument.descriptionFa ??
    `آموزش خصوصی و آنلاین ${instrument.nameFa} با استادهای تأییدشده. جلسه‌ی معارفه‌ی اول رایگان است.`;

  return {
    title,
    description,
    alternates: { canonical: `/instruments/${instrument.slug}` },
    openGraph: { title, description, type: "website" },
  };
}

export default async function InstrumentPage({ params }: PageProps) {
  const { slug } = await params;

  // هر دو با هم — کندترینشان زمان صفحه را تعیین می‌کند، نه جمعشان
  const [instrument, teachers] = await Promise.all([
    getInstrument(slug),
    getTeachers(slug),
  ]);

  if (!instrument) notFound();

  const title = pageTitle(instrument.nameFa);

  return (
    <>
      <CourseJsonLd
        title={title}
        description={instrument.descriptionFa}
        instrumentName={instrument.nameFa}
      />

      <article className="mx-auto max-w-5xl px-5 py-16">
        <h1 className="text-3xl font-bold sm:text-4xl">{title}</h1>

        {instrument.descriptionFa ? (
          <p className="mt-6 max-w-2xl text-lg text-ink-muted">
            {instrument.descriptionFa}
          </p>
        ) : null}

        <section className="mt-14">
          <h2 className="text-2xl font-bold">
            استادهای {instrument.nameFa}
          </h2>

          {teachers.length === 0 ? (
            <p className="mt-6 text-ink-muted">
              هنوز استادی برای این ساز تأیید نشده است.
            </p>
          ) : (
            <ul className="mt-8 grid gap-4 sm:grid-cols-2">
              {teachers.map((teacher) => (
                <li key={teacher.profileId}>
                  <TeacherCard teacher={teacher} instrumentSlug={slug} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-14">
          <h2 className="text-2xl font-bold">کلاس چطور برگزار می‌شود؟</h2>

          <ol className="mt-6 max-w-2xl list-decimal space-y-3 pr-5">
            <li>ساز و استاد را انتخاب می‌کنی و ساعت آزادش را می‌بینی.</li>
            <li>
              اولین جلسه، یک معارفه‌ی رایگان بیست‌دقیقه‌ای است تا استاد و روش
              کارش را بشناسی.
            </li>
            <li>
              کلاس زنده و یک‌به‌یک در مرورگر برگزار می‌شود؛ نصب هیچ برنامه‌ای
              لازم نیست.
            </li>
            <li>
              برای شنیدن درست صدای ساز، هدفون سیمی لازم است — بدون آن، بلندگوی
              باز پژواک می‌سازد.
            </li>
          </ol>
        </section>
      </article>
    </>
  );
}

function TeacherCard({
  teacher,
  instrumentSlug,
}: {
  teacher: Teacher;
  instrumentSlug: string;
}) {
  // فقط سرویس‌های همین ساز؛ استاد ممکن است چند ساز درس بدهد
  const offerings = teacher.offerings.filter(
    (offering) => offering.instrumentSlug === instrumentSlug,
  );
  const cheapest = lowestPrice(offerings.map((offering) => offering.price));

  return (
    <Link
      href={`/teachers/${teacher.slug}`}
      className="card"
    >
      <h3 className="font-bold">{teacher.fullName}</h3>
      <p className="mt-1 text-sm text-ink-muted">{teacher.headline}</p>

      <dl className="mt-4 space-y-1 text-sm">
        {teacher.yearsExperience > 0 ? (
          <div className="flex gap-2">
            <dt className="text-ink-muted">سابقه:</dt>
            <dd>{faNumber(teacher.yearsExperience)} سال</dd>
          </div>
        ) : null}

        {cheapest ? (
          <div className="flex gap-2">
            <dt className="text-ink-muted">شروع از:</dt>
            <dd>
              {formatToman(cheapest)} تومان
              {offerings[0]
                ? ` / ${formatDuration(offerings[0].durationMinutes)}`
                : null}
            </dd>
          </div>
        ) : null}
      </dl>
    </Link>
  );
}

/**
 * اسکیمای `Course` برای نتایج غنی گوگل.
 *
 * `dangerouslySetInnerHTML` تنها راه تزریق JSON-LD است؛ محتوایش از
 * `JSON.stringify` می‌آید و ورودی کاربر خام داخلش نمی‌رود.
 */
function CourseJsonLd({
  title,
  description,
  instrumentName,
}: {
  title: string;
  description: string | null;
  instrumentName: string;
}) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: title,
    description:
      description ?? `آموزش خصوصی و آنلاین ${instrumentName} با استادهای تأییدشده.`,
    inLanguage: "fa-IR",
    courseMode: "online",
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
