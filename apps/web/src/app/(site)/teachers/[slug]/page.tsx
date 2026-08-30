import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BUSINESS_RULES } from "@music/shared";

import { TeacherAvailability } from "@/components/teacher-availability";
import {
  Accordion,
  ButtonLink,
  Mark,
  Photo,
  SectionMark,
} from "@/components/ui";
import {
  getTeacherReviews,
  getTeachers,
  type Teacher,
  type TeacherOffering,
  type TeacherRating,
  type TeacherReview,
} from "@/lib/api";
import {
  faNumber,
  formatDuration,
  formatRelativeFa,
  formatToman,
} from "@/lib/format";

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

/**
 * ساز و استاد هر دو در آدرس می‌روند تا دو مرحله‌ی اول رزرو دوباره طی نشود.
 *
 * شیء است نه رشته: مسیرهای تایپ‌شده‌ی Next رشته‌ی ساخته‌شده در زمان اجرا
 * را نمی‌پذیرند و بیلد را رد می‌کنند.
 */
function bookHref(
  teacher: Teacher,
  offering: TeacherOffering,
  type?: BookType,
): BookHref {
  return {
    pathname: "/dashboard/book",
    query: {
      instrument: offering.instrumentSlug,
      teacher: teacher.slug,
      ...(type ? { type } : {}),
    },
  };
}

/**
 * نوع جلسه هم می‌تواند همراه برود، ولی **اختیاری است**.
 *
 * دکمه‌ای که روی «پکیج ماهانه» زده شده باید کاربر را روی همان بسته
 * بگذارد نه اول فهرست. جریان رزرو مقدار نامعتبر یا معارفه‌ی مصرف‌شده
 * را بی‌صدا نادیده می‌گیرد، پس این آدرس هیچ‌وقت به بن‌بست نمی‌رسد.
 */
type BookType = "trial" | "single" | "package";

export type BookHref = {
  pathname: "/dashboard/book";
  query: { instrument: string; teacher: string; type?: BookType };
};

function instrumentNames(teacher: Teacher): string[] {
  return [
    ...new Set(teacher.offerings.map((offering) => offering.instrumentName)),
  ];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const teacher = await findTeacher(slug);

  if (!teacher) return {};

  const instruments = instrumentNames(teacher).join("، ");

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

/**
 * صفحه‌ی عمومی استاد.
 *
 * ⚠️ **این پرقصدترین صفحه‌ی محصول است و در دیزاین هیچ مدیا-کوئری
 * نداشت** (بازبینی، بند A-09): گریدِ ثابتِ `minmax(0,1fr) 344px` زیر
 * ۹۰۰ پیکسل ستون محتوا را به چند صد پیکسل می‌فشرد. رفتار رسپانسیو
 * اینجا تصمیمِ صریحِ محصول است:
 *
 *   ≥ ۱۰۲۴  دو ستون؛ کارت رزرو در ستون کنار و چسبان
 *   < ۱۰۲۴  یک ستون؛ کارت رزرو **درون‌خطی** و بلافاصله بعد از هیرو
 *   < ۷۶۸   کارت درون‌خطی برداشته می‌شود و **فقط** نوار چسبانِ پایین
 *           می‌ماند — دو سطح رزرو روی یک پرده‌ی کوچک، هم جا می‌گیرد و
 *           هم کاربر را دوبار از یک تصمیم می‌پرسد
 *
 * چیدمان با گرید انجام می‌شود نه `display: contents`: ترتیب DOM همان
 * ترتیب موبایل است (هیرو، رزرو، بخش‌ها) و در دسکتاپ فقط جای سلول‌ها
 * عوض می‌شود — پس نشانه‌گذاری معنایی و ترتیب فوکوس هم درست می‌ماند.
 */
export default async function TeacherPage({ params }: PageProps) {
  const { slug } = await params;
  const teacher = await findTeacher(slug);

  if (!teacher) notFound();

  /**
   * نظرها جدا از کارت استاد فچ می‌شوند و **شکستشان صفحه را نمی‌اندازد**:
   * اگر اندپوینت نظر پاسخ ندهد، صفحه‌ی استاد باید همچنان با بقیه‌ی
   * محتوایش ساخته شود. کارت استاد بحرانی است (بدونش `notFound`)، نظرها
   * تزئینی.
   */
  const reviews = await getTeacherReviews(slug).catch(() => ({
    reviews: [],
    total: 0,
  }));

  const instruments = instrumentNames(teacher);

  /**
   * کارت کناری روی همین یک سرویس بسته می‌شود.
   *
   * استاد می‌تواند چند ساز داشته باشد با قیمت‌های متفاوت؛ کارت کناری
   * قیمت، مدت، اسلات‌های آزاد و CTA سرویس اول را یکپارچه نشان می‌دهد.
   * بخش بسته‌ها همه‌ی سرویس‌ها را جدا فهرست می‌کند.
   */
  const primary = teacher.offerings[0] ?? null;

  return (
    <>
      <PersonJsonLd teacher={teacher} />

      <nav
        aria-label="مسیر"
        className="mx-auto flex max-w-[1160px] items-center gap-2.5 px-4.5 pt-4.5 text-[12.5px] text-meta md:px-6 md:pt-6.5 md:text-[13.5px]"
      >
        <Link href="/teachers" className="py-1.5 text-meta">
          استادها
        </Link>
        {instruments[0] ? (
          <>
            <span aria-hidden="true">/</span>
            <Link href="/teachers" className="py-1.5 text-meta">
              {instruments[0]}
            </Link>
          </>
        ) : null}
        <span aria-hidden="true">/</span>
        <span className="text-ink-2">{teacher.fullName}</span>
      </nav>

      <div className="mx-auto grid max-w-[1160px] grid-cols-1 items-start gap-0 px-4.5 pt-5 pb-26 md:px-6 md:pb-[clamp(88px,11vw,132px)] lg:max-wide:grid-cols-[minmax(0,1fr)_300px] lg:max-wide:gap-[30px] wide:grid-cols-[minmax(0,1fr)_344px] wide:gap-[clamp(32px,4vw,56px)]">
        {/* هیرو — ستون یک، سطر یک */}
        <section className="grid grid-cols-1 items-center gap-6.5 lg:col-start-1 lg:row-start-1 lg:[grid-template-columns:minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-[clamp(28px,3.4vw,44px)]">
          <Photo
            src={teacher.avatarUrl}
            alt={teacher.fullName}
            focus="55% 30%"
            className="max-h-[38vh] w-full [aspect-ratio:4/3] md:max-h-[46vh] md:[aspect-ratio:16/10] lg:max-h-none lg:[aspect-ratio:4/5]"
            fallback={
              <span
                aria-hidden="true"
                className="text-[56px] font-semibold text-[color-mix(in_srgb,var(--color-ivory)_22%,transparent)]"
              >
                {initials(teacher.fullName)}
              </span>
            }
          />

          <div>
            <h1 className="text-[clamp(30px,3.8vw,44px)] leading-[1.35] font-semibold tracking-[-0.025em] text-ink">
              {teacher.fullName}
            </h1>

            <p className="mt-4 max-w-[36ch] text-[17px] leading-[1.9] text-ink-2">
              {teacher.headline}
            </p>

            {instruments.length > 0 ? (
              <ul className="mt-6 flex list-none flex-wrap gap-2.5 p-0">
                {instruments.map((name) => (
                  <li
                    key={name}
                    className="rounded-pill px-3.5 py-1.75 text-sm text-ink-2 shadow-[inset_0_0_0_1px_var(--color-divider)]"
                  >
                    {name}
                  </li>
                ))}
              </ul>
            ) : null}

            {/*
              نوارِ آمار فقط چیزی را می‌گوید که دامنه پشتش هست. امتیاز
              وقتی می‌آید که واقعاً نظری ثبت شده باشد؛ حالت پیش‌فرضِ
              محصولِ امروز یک ستونِ «سابقه» است و بس.
            */}
            {teacher.rating.count > 0 || teacher.yearsExperience > 0 ? (
              <div className="rule-top-wood mt-7.5 flex flex-wrap gap-8 pt-6">
                {teacher.rating.count > 0 && teacher.rating.average !== null ? (
                  <div>
                    <p className="flex items-center gap-2 text-[22px] font-semibold text-ink">
                      <span aria-hidden="true" className="text-base text-wood-light">
                        ★
                      </span>
                      <span>{faNumber(teacher.rating.average)}</span>
                    </p>
                    <p className="mt-1 text-[13.5px] text-meta">
                      {faNumber(teacher.rating.count)} نظر
                    </p>
                  </div>
                ) : null}

                {teacher.yearsExperience > 0 ? (
                  <div>
                    <p className="text-[22px] font-semibold text-ink">
                      {faNumber(teacher.yearsExperience)} سال
                    </p>
                    <p className="mt-1 text-[13.5px] text-meta">سابقه‌ی تدریس</p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        {/*
          کارت رزرو.
          ستون دو در دسکتاپ (که در RTL سمت چپ می‌نشیند — همان جای
          آرت‌بورد)، و زیر ۱۰۲۴ درون‌خطی بعد از هیرو. زیر ۷۶۸ کلاً پنهان
          می‌شود و نوار چسبانِ پایین جایش را می‌گیرد.
        */}
        {primary ? (
          <aside className="mt-8 hidden md:block lg:col-start-2 lg:row-start-1 lg:mt-0 lg:sticky lg:top-23">
            <div className="rounded-card bg-surface p-5.5 shadow-[inset_0_0_0_1px_var(--color-divider)] wide:p-7">
              <p className="text-[17px] leading-[1.6] font-semibold text-ink">
                رزرو کلاس با {teacher.fullName}
              </p>

              <div className="rule-plain mt-6 pt-5.5">
                <SectionMark width="sm" className="w-4.5">
                  قیمت هر جلسه
                </SectionMark>
                <p className="mt-3 text-[30px] font-semibold tracking-[-0.02em] text-ink">
                  {formatToman(primary.price)} تومان
                </p>
                <p className="mt-2 text-sm text-ink-2">
                  مدت زمان هر جلسه: {formatDuration(primary.durationMinutes)}
                </p>
              </div>

              <div className="mt-6.5 flex flex-col gap-3">
                <ButtonLink
                  href={bookHref(teacher, primary, "single")}
                  block
                  className="py-3.75 text-base"
                >
                  تک جلسه
                </ButtonLink>
                <ButtonLink
                  href={bookHref(teacher, primary, "trial")}
                  variant="outline"
                  block
                  className="py-3.5"
                >
                  جلسه معارفه رایگان
                </ButtonLink>
                <p className="text-[12.5px] leading-[1.85] text-meta">
                  جلسه معارفه{" "}
                  {faNumber(BUSINESS_RULES.TRIAL_DURATION_MINUTES)} دقیقه‌ای و یک
                  بار برای هر کاربر است.
                </p>
              </div>

              <TeacherAvailability
                offeringId={primary.id}
                teacherProfileId={teacher.profileId}
                bookHref={bookHref(teacher, primary)}
              />
            </div>
          </aside>
        ) : null}

        {/* بخش‌های بلند — ستون یک، سطر دو */}
        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          {teacher.bio ? (
            <Section title="درباره‌ی استاد">
              <p className="max-w-[62ch] text-[17px] leading-[2.05] whitespace-pre-line text-ink-2 text-pretty md:text-lg">
                {teacher.bio}
              </p>
            </Section>
          ) : null}

          <TeachingMethod />

          {instruments.length > 0 ? (
            <Section title="سازها">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3.5">
                {instruments.map((name, index) => (
                  <span key={name} className="flex items-center gap-5">
                    {index > 0 ? <Mark width="sm" className="w-4" /> : null}
                    <span className="text-xl font-semibold text-ink">{name}</span>
                  </span>
                ))}
              </div>
            </Section>
          ) : null}

          <Packages teacher={teacher} />

          <IntroVideo teacher={teacher} />

          <Reviews
            reviews={reviews.reviews}
            total={reviews.total}
            rating={teacher.rating}
          />

          <Section title="سوالات متداول">
            <Accordion items={FAQS} />
          </Section>
        </div>
      </div>

      {/* نوار چسبانِ رزرو — تنها سطح رزرو زیر ۷۶۸ پیکسل */}
      {primary ? (
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3.5 border-t border-divider bg-[color-mix(in_srgb,var(--color-bg)_90%,transparent)] px-4.5 py-2.75 backdrop-blur-[16px] md:hidden">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-base font-semibold whitespace-nowrap text-ink">
              {formatToman(primary.price)} تومان
            </span>
            <span className="text-[12.5px] whitespace-nowrap text-meta">
              هر جلسه {formatDuration(primary.durationMinutes)}
            </span>
          </div>
          <ButtonLink
            href={bookHref(teacher, primary, "single")}
            className="shrink-0 px-6.5"
          >
            تک جلسه
          </ButtonLink>
        </div>
      ) : null}
    </>
  );
}

/* ───────────────────────── بخش‌ها ───────────────────────── */

function Section({
  title,
  tone = "violet",
  children,
}: {
  title: string;
  tone?: "violet" | "wood";
  children: React.ReactNode;
}) {
  return (
    <section className="mt-13 md:mt-[clamp(64px,8vw,96px)]">
      <SectionMark tone={tone} className="mb-4.5 tracking-[0.1em]">
        {title}
      </SectionMark>
      {children}
    </section>
  );
}

const METHOD = [
  {
    title: "برنامه‌ی شخصی‌سازی‌شده",
    body: "بر اساس هدف، سطح و سرعت یادگیری خودت، نه یک سرفصل ثابت.",
  },
  {
    title: "تمرین هفتگی",
    body: "تمرین‌های هدفمند بین جلسات که پیشرفت را پیوسته نگه می‌دارد.",
  },
  {
    title: "بازخورد بعد از کلاس",
    body: "بررسی اجرای آپلودشده و راهنمایی صوتی دقیق در پرونده‌ی جلسه.",
  },
  {
    title: "از مبتدی تا پیشرفته",
    body: "مسیر یادگیری اصولی در همه‌ی سطح‌ها، از نخستین نت تا رپرتوار.",
  },
] as const;

function TeachingMethod() {
  return (
    <Section title="روش تدریس">
      <h2 className="mb-8 text-[clamp(24px,2.8vw,32px)] leading-[1.45] font-semibold tracking-[-0.02em] text-ink md:mb-[clamp(32px,4vw,48px)]">
        کلاس‌ها چطور پیش می‌روند؟
      </h2>
      <div className="grid grid-cols-1 gap-8 md:[grid-template-columns:repeat(auto-fit,minmax(240px,1fr))] md:gap-x-0 md:gap-y-[clamp(32px,4vw,44px)]">
        {METHOD.map((item) => (
          <div
            key={item.title}
            className="rule-plain relative pt-6.5 md:pe-[clamp(24px,3vw,44px)]"
          >
            <span
              aria-hidden="true"
              className="absolute -top-px start-0 h-px w-6.5 bg-violet-strong"
            />
            <p className="mb-3 text-xl leading-[1.5] font-semibold text-ink">
              {item.title}
            </p>
            <p className="max-w-[30ch] text-[15.5px] leading-[1.95] text-ink-2">
              {item.body}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}

/**
 * بسته‌های کلاس.
 *
 * یک ردیف به ازای هر **سرویس واقعی** استاد، با قیمت و مدتِ خودش. پروتوتایپ
 * اینجا دو ردیفِ ثابت («تک جلسه» و «بسته ماهانه» با قیمتِ نوشته‌شده)
 * داشت؛ قیمت بسته‌ی ماهانه در این محصول از منطق رزرو درمی‌آید نه از متن،
 * و نوشتنش اینجا یعنی ساختن عددی که هیچ‌جا پشتش نیست.
 *
 * جلسه‌ی معارفه ردیفِ خودش را می‌گیرد چون قیمتش قاعده است نه داده:
 * رایگان، و یک بار برای هر کاربر.
 */
function Packages({ teacher }: { teacher: Teacher }) {
  if (teacher.offerings.length === 0) return null;

  return (
    <Section title="بسته‌های کلاس">
      <div className="flex flex-col">
        <PackageRow
          title="جلسه معارفه رایگان"
          detail={`${formatDuration(BUSINESS_RULES.TRIAL_DURATION_MINUTES)} · آشنایی با استاد و تعیین مسیر`}
          note="یک بار برای هر کاربر"
          price="رایگان"
          priceTone="violet"
          href={
            teacher.offerings[0]
              ? bookHref(teacher, teacher.offerings[0], "trial")
              : undefined
          }
          cta="جلسه معارفه رایگان"
        />

        {teacher.offerings.flatMap((offering) => [
          <PackageRow
            key={`${offering.id}-single`}
            title="تک جلسه"
            detail={`${offering.instrumentName} · یک جلسه × ${formatDuration(offering.durationMinutes)}`}
            note="در ساعتی که خودت انتخاب می‌کنی"
            price={`${formatToman(offering.price)} تومان`}
            href={bookHref(teacher, offering, "single")}
            cta="انتخاب تک جلسه"
          />,
          <PackageRow
            key={`${offering.id}-package`}
            title="بسته ماهانه"
            detail={`${offering.instrumentName} · ${faNumber(BUSINESS_RULES.PACKAGE_SESSION_COUNT)} جلسه × ${formatDuration(offering.durationMinutes)}`}
            note="یک روز و ساعت ثابت هفتگی"
            price={`${formatToman(
              BigInt(offering.price) * BigInt(BUSINESS_RULES.PACKAGE_SESSION_COUNT),
            )} تومان`}
            href={bookHref(teacher, offering, "package")}
            cta="انتخاب بسته ماهانه"
          />,
        ])}
      </div>
    </Section>
  );
}

function PackageRow({
  title,
  detail,
  note,
  price,
  priceTone = "ink",
  href,
  cta,
}: {
  title: string;
  detail: string;
  note: string;
  price: string;
  priceTone?: "ink" | "violet";
  href?: BookHref;
  cta: string;
}) {
  return (
    <div className="mb-3 flex flex-col items-stretch gap-4.5 rounded-panel p-5 shadow-[inset_0_0_0_1px_var(--color-divider)] md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-6 md:p-6.5">
      <div className="flex flex-col gap-2">
        <span className="text-xl font-semibold text-ink">{title}</span>
        <span className="text-[15px] text-ink-2">{detail}</span>
        <span className="text-sm text-meta">{note}</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3.5 md:justify-end md:gap-6">
        <span
          className={
            priceTone === "violet"
              ? "text-lg font-semibold whitespace-nowrap text-violet-strong"
              : "text-lg font-semibold whitespace-nowrap text-ink"
          }
        >
          {price}
        </span>
        {href ? (
          <ButtonLink href={href} variant="outline" className="whitespace-nowrap">
            {cta}
          </ButtonLink>
        ) : null}
      </div>
    </div>
  );
}

/**
 * ویدیوی معرفی.
 *
 * حالتِ «هنوز اضافه نشده» خودِ دیزاین است، نه ابداعِ ما: قابِ ۱۶:۹ با
 * چاهِ تاریک و یک قرصِ توضیح رویش. برای استادی که ویدیو ندارد این
 * صادق‌ترین چیزی است که می‌شود نشان داد.
 */
function IntroVideo({ teacher }: { teacher: Teacher }) {
  return (
    <Section title="ویدیوی معرفی مدرس" tone="wood">
      {teacher.introVideoUrl ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption -- ویدیوی معرفی زیرنویس ندارد
        <video
          src={teacher.introVideoUrl}
          controls
          preload="none"
          poster={teacher.avatarUrl ?? undefined}
          className="w-full rounded-card bg-well shadow-[inset_0_0_0_1px_var(--color-divider)]"
        />
      ) : (
        <div className="relative overflow-hidden rounded-card bg-well [aspect-ratio:16/9]">
          <div className="absolute bottom-4.5 start-4.5 flex items-center gap-3 rounded-pill bg-[color-mix(in_srgb,var(--color-well)_72%,transparent)] px-4 py-2.5 text-[13.5px] text-ink-2 backdrop-blur-[8px] md:bottom-6.5 md:start-6.5 md:px-5 md:py-3">
            <Mark width="sm" className="w-4.5" />
            <span>ویدیو معرفی هنوز اضافه نشده است.</span>
          </div>
        </div>
      )}
    </Section>
  );
}

/**
 * نظرات هنرجویان.
 *
 * ⚠️ **حالتِ پیش‌فرض «هنوز نظری ثبت نشده است.» است.** پروتوتایپ اینجا
 * سه کارتِ نظرِ ساخته‌شده با نام و متن داشت و بازبینی (بند A-12) حذفشان
 * کرد: اعتماد ساختگی سریع‌ترین راه از دست دادن اعتماد واقعی است، و
 * وقتی نامِ یک استادِ حقیقی پایش باشد مسئولیت حقوقی هم دارد.
 *
 * پس این بخش فقط چیزی را نشان می‌دهد که در دیتابیس هست.
 */
function Reviews({
  reviews,
  total,
  rating,
}: {
  reviews: TeacherReview[];
  total: number;
  rating: TeacherRating;
}) {
  const hasReviews = reviews.length > 0 && rating.average !== null;

  return (
    <Section title="نظرات هنرجویان">
      {hasReviews ? (
        <>
          <div className="mb-7 flex items-baseline gap-3 md:mb-[clamp(28px,3.5vw,38px)]">
            <span aria-hidden="true" className="text-[15px] text-wood-light">
              ★
            </span>
            <span className="text-[clamp(26px,3vw,34px)] font-semibold tracking-[-0.02em] text-ink">
              {faNumber(rating.average!)}
            </span>
            <span className="text-[15px] text-meta">
              از {faNumber(total)} نظر
            </span>
          </div>

          <div className="flex flex-col">
            {reviews.map((review) => (
              <article key={review.id} className="rule-plain py-6.5">
                <div className="flex flex-wrap items-center gap-3.5">
                  <span
                    aria-hidden="true"
                    className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-sm text-ink-2"
                  >
                    {initials(review.studentName)}
                  </span>
                  <span className="text-base font-semibold text-ink">
                    {review.studentName}
                  </span>
                  <span
                    aria-label={`${faNumber(review.rating)} از ۵`}
                    className="text-[13.5px] tracking-[0.12em] text-wood-light"
                  >
                    {"★".repeat(review.rating)}
                    {"☆".repeat(Math.max(0, 5 - review.rating))}
                  </span>
                  <span className="text-[13.5px] text-meta md:ms-auto">
                    {formatRelativeFa(review.createdAt)}
                  </span>
                </div>
                {review.comment ? (
                  <p className="mt-3.5 max-w-[60ch] text-[16.5px] leading-[2] text-ink-2">
                    {review.comment}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </>
      ) : (
        <p className="max-w-[44ch] text-[17px] leading-[1.9] text-ink-2">
          هنوز نظری ثبت نشده است.
        </p>
      )}
    </Section>
  );
}

const FAQS = [
  {
    q: "جلسه معارفه رایگان چگونه برگزار می‌شود؟",
    a: "یک جلسه‌ی بیست دقیقه‌ای زنده و یک‌به‌یک است که یک بار برای هر کاربر رایگان برگزار می‌شود. در آن سطحت سنجیده می‌شود و مسیر کلاس‌ها مشخص می‌گردد.",
  },
  {
    q: "برای شرکت در کلاس به چه چیزهایی نیاز دارم؟",
    a: "سازت، اینترنت پایدار، و هدفون سیمی — هدفون سیمی برای شنیدن درست صدا الزامی است. دوربینی که هم دست و هم ساز را نشان بدهد کیفیت کلاس را بالا می‌برد.",
  },
  {
    q: "کلاس کجا برگزار می‌شود؟",
    a: "در اتاق کلاس خودِ هوگه، داخل همین سایت. ده دقیقه پیش از شروع جلسه اتاق باز می‌شود و نیازی به نصب نرم‌افزار دیگری نیست.",
  },
  {
    q: "در صورت لغو جلسه چه شرایطی وجود دارد؟",
    a: "لغو تا ۲۴ ساعت پیش از شروع کلاس بدون هزینه است و مبلغ به اعتبار تو برمی‌گردد. لغو دیرتر از آن، جلسه را مصرف‌شده در نظر می‌گیرد.",
  },
] as const;

/**
 * حرف اول نام و نام خانوادگی، با نیم‌فاصله — حرف‌های فارسی وگرنه به هم
 * می‌چسبند و یک کلمه‌ی سرهم می‌سازند.
 */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const first = [...words[0]!][0] ?? "";
  if (words.length === 1) return first;
  return `${first}‌${[...words[words.length - 1]!][0] ?? ""}`;
}

/**
 * داده‌ی ساخت‌یافته‌ی `Person`.
 *
 * فقط چیزی که واقعاً هست: نام، معرفی، عکس. امتیاز `aggregateRating`
 * عمداً نمی‌آید — گوگل برای آن نظرِ قابل‌بازبینی می‌خواهد و فرستادنش
 * پیش از وجود نظر واقعی، خطای Search Console می‌سازد.
 */
function PersonJsonLd({ teacher }: { teacher: Teacher }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: teacher.fullName,
    description: teacher.bio ?? teacher.headline,
    ...(teacher.avatarUrl ? { image: teacher.avatarUrl } : {}),
    jobTitle: "مدرس موسیقی",
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
