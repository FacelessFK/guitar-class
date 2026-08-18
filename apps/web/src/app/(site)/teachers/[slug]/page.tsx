import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BUSINESS_RULES } from "@music/shared";

import { Avatar } from "@/components/avatar";
import { TeacherAvailability } from "@/components/teacher-availability";
import {
  getTeachers,
  type Teacher,
  type TeacherOffering,
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
  return [...new Set(teacher.offerings.map((offering) => offering.instrumentName))];
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

export default async function TeacherPage({ params }: PageProps) {
  const { slug } = await params;
  const teacher = await findTeacher(slug);

  if (!teacher) notFound();

  const instruments = instrumentNames(teacher);
  const cheapest = lowestPrice(teacher.offerings.map((offering) => offering.price));

  /**
   * کارت کناری و قیمت سرصفحه روی همین یک سرویس بسته می‌شوند.
   *
   * استاد می‌تواند چند ساز داشته باشد با قیمت‌های متفاوت؛ کارت کناری
   * ارزان‌ترین را می‌گوید («از … تومان») و بخش بسته‌ها همه را جدا
   * فهرست می‌کند. اسلات‌های آزاد به طول سرویس وابسته‌اند، پس یکی باید
   * انتخاب شود — اولی، همان که در فهرست هم اول می‌آید.
   */
  const primary = teacher.offerings[0] ?? null;

  return (
    <>
      <PersonJsonLd teacher={teacher} />

      <article className="mx-auto max-w-6xl px-5 py-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_20rem] lg:items-start">
          <div className="min-w-0">
            <Hero teacher={teacher} instruments={instruments} />

            {teacher.bio ? (
              <section className="card mt-8">
                <h2 className="text-xl font-bold">درباره‌ی استاد</h2>
                <p className="mt-4 whitespace-pre-line">{teacher.bio}</p>
              </section>
            ) : null}

            <TeachingMethod />

            {instruments.length > 0 ? (
              <section className="mt-12">
                <h2 className="text-xl font-bold">سازها و سطح‌ها</h2>
                <ul className="mt-5 flex flex-wrap gap-2.5">
                  {instruments.map((name) => (
                    <li key={name} className="badge badge-neutral px-4 py-1.5 text-sm">
                      {name}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <Packages teacher={teacher} />

            {teacher.introVideoUrl ? (
              <section className="mt-12">
                <h2 className="text-xl font-bold">ویدیوی معرفی مدرس</h2>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption -- ویدیوی معرفی زیرنویس ندارد */}
                <video
                  src={teacher.introVideoUrl}
                  controls
                  preload="none"
                  poster={teacher.avatarUrl ?? undefined}
                  className="mt-5 w-full rounded-2xl border border-border bg-surface-muted"
                />
              </section>
            ) : null}

            <Faq />
          </div>

          {primary ? (
            /*
             * `h-fit` لازم است و تزئینی نیست: کلاس `.card` قید
             * `height: 100%` دارد و کارت را تا ارتفاع کل ردیف گرید کش
             * می‌آورد. آن‌وقت کارتی بلندتر از پنجره داریم که `sticky`
             * هیچ‌وقت رویش نمی‌چسبد و به‌شکل یک کادر خالیِ بلند دیده
             * می‌شود. یوتیلیتی تیلویند بعد از لایه‌ی `components` می‌آید،
             * پس بر آن قید غالب است.
             */
            <aside className="card h-fit lg:sticky lg:top-8">
              <p className="text-center text-sm text-ink-muted">قیمت هر جلسه</p>
              <p className="mt-1 text-center text-4xl font-bold">
                {formatToman(cheapest ?? primary.price)}
              </p>
              <p className="mt-1 text-center text-sm text-ink-muted">
                تومان / {formatDuration(primary.durationMinutes)}
              </p>

              <div className="mt-6 space-y-3 border-t border-border pt-6">
                <Link
                  href={bookHref(teacher, primary, "trial")}
                  className="btn-accent block text-center"
                >
                  رزرو جلسه‌ی آشنایی رایگان
                </Link>
                <Link
                  href={bookHref(teacher, primary, "single")}
                  className="btn-primary block text-center"
                >
                  رزرو کلاس
                </Link>
                <p className="text-center text-xs text-ink-muted">
                  جلسه‌ی آشنایی {faNumber(BUSINESS_RULES.TRIAL_DURATION_MINUTES)} دقیقه‌ای و
                  یک بار برای هر کاربر است.
                </p>
              </div>

              <TeacherAvailability
                offeringId={primary.id}
                teacherProfileId={teacher.profileId}
                bookHref={bookHref(teacher, primary)}
              />
            </aside>
          ) : null}
        </div>
      </article>
    </>
  );
}

function Hero({ teacher, instruments }: { teacher: Teacher; instruments: string[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface-muted">
      <div className="grid gap-6 sm:grid-cols-[13rem_1fr] sm:items-center">
        <Avatar
          name={teacher.fullName}
          url={teacher.avatarUrl}
          alt={`عکس ${teacher.fullName}`}
          className="h-full min-h-56 w-full"
          textClassName="text-5xl"
        />

        <div className="px-6 pb-6 sm:px-0 sm:pe-6 sm:pb-0">
          <h1 className="text-3xl font-bold">{teacher.fullName}</h1>
          <p className="mt-3 text-lg text-ink-muted">{teacher.headline}</p>

          <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-4">
            {teacher.yearsExperience > 0 ? (
              <Stat value={faNumber(teacher.yearsExperience)} label="سال سابقه" />
            ) : null}
            {instruments.length > 0 ? (
              <Stat value={faNumber(instruments.length)} label="ساز" />
            ) : null}
          </dl>
        </div>
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dd className="text-2xl font-bold">{value}</dd>
      <dt className="text-sm text-ink-muted">{label}</dt>
    </div>
  );
}

/**
 * روش تدریس — متن **پلتفرم** است، نه فیلد استاد.
 *
 * هیچ ستونی برای این در `teacher_profiles` نیست و ساختنش یعنی هر استاد
 * باید چهار متن بنویسد. این چهار مورد چیزی را می‌گویند که برای همه‌ی
 * کلاس‌های پلتفرم صادق است (برنامه‌ی شخصی، تمرین هفتگی، بازخورد بعد از
 * جلسه، همه‌ی سطح‌ها) — پس متن ثابت درست است، نه داده.
 */
function TeachingMethod() {
  const items = [
    {
      title: "برنامه‌ی شخصی‌سازی‌شده",
      body: "برنامه متناسب با سطح، هدف و سلیقه‌ی هر هنرجو بسته می‌شود.",
      icon: <PlanIcon />,
    },
    {
      title: "تمرین هفتگی",
      body: "بعد از هر جلسه تمرین مشخص ثبت می‌شود و پیشرفتش دنبال می‌شود.",
      icon: <NoteIcon />,
    },
    {
      title: "بازخورد بعد از کلاس",
      body: "هنرجو تمرینش را می‌فرستد و استاد روی همان بازخورد می‌دهد.",
      icon: <ChatIcon />,
    },
    {
      title: "از مبتدی تا پیشرفته",
      body: "کلاس‌ها یک‌به‌یک است، پس هر سطحی از صفر تا حرفه‌ای جا می‌شود.",
      icon: <ChartIcon />,
    },
  ];

  return (
    <section className="mt-12">
      <h2 className="text-xl font-bold">روش تدریس</h2>
      <ul className="mt-5 grid gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.title} className="card bg-surface-muted">
            <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent-strong">
              {item.icon}
            </span>
            <h3 className="mt-4 font-bold">{item.title}</h3>
            <p className="mt-2 text-sm text-ink-muted">{item.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * بسته‌های کلاس — تک جلسه و پکیج ماهانه.
 *
 * ⚠️ **قیمت پکیج دقیقاً `price × ۴` است و تخفیفی ندارد**، چون
 * `createPackageEnrollment` همین را حساب می‌کند
 * (`schedule.price * BigInt(sessionCount)`). نوشتن عدد کمتر روی این
 * کارت یعنی هنرجو مبلغی را ببیند که در درگاه مبلغ دیگری می‌شود.
 */
function Packages({ teacher }: { teacher: Teacher }) {
  if (teacher.offerings.length === 0) {
    return (
      <section className="mt-12">
        <h2 className="text-xl font-bold">بسته‌های کلاس</h2>
        <p className="mt-4 text-ink-muted">این استاد در حال حاضر کلاس فعالی ندارد.</p>
      </section>
    );
  }

  const count = BUSINESS_RULES.PACKAGE_SESSION_COUNT;
  const showInstrument = teacher.offerings.length > 1;

  return (
    <section className="mt-12">
      <h2 className="text-xl font-bold">بسته‌های کلاس</h2>

      <div className="mt-5 space-y-6">
        {teacher.offerings.map((offering) => {
          const packagePrice = (BigInt(offering.price) * BigInt(count)).toString();

          return (
            <div key={offering.id}>
              {showInstrument ? (
                <h3 className="mb-3 font-medium text-ink-muted">
                  {offering.instrumentName}
                </h3>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <PackageCard
                  title="تک جلسه"
                  meta={`۱ جلسه × ${formatDuration(offering.durationMinutes)}`}
                  price={offering.price}
                  href={bookHref(teacher, offering, "single")}
                  cta="انتخاب"
                />
                <PackageCard
                  title={`${faNumber(count)} جلسه‌ی ماهانه`}
                  meta={`${faNumber(count)} جلسه × ${formatDuration(
                    offering.durationMinutes,
                  )} — یک روز و ساعت ثابت هفتگی`}
                  price={packagePrice}
                  href={bookHref(teacher, offering, "package")}
                  cta="انتخاب بسته"
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-center text-xs text-ink-muted">
        قیمت‌ها به تومان است و هنگام رزرو ثابت می‌شود؛ تغییر بعدی قیمت استاد روی
        رزرو انجام‌شده اثر ندارد.
      </p>
    </section>
  );
}

function PackageCard({
  title,
  meta,
  price,
  href,
  cta,
}: {
  title: string;
  meta: string;
  price: string;
  href: BookHref;
  cta: string;
}) {
  return (
    <div className="card flex flex-col text-center">
      <h3 className="font-bold">{title}</h3>
      <p className="mt-2 text-sm text-ink-muted">{meta}</p>
      <p className="mt-5 text-2xl font-bold">{formatToman(price)}</p>
      <p className="text-sm text-ink-muted">تومان</p>
      <Link href={href} className="btn-accent mt-5 block">
        {cta}
      </Link>
    </div>
  );
}

/**
 * سوالات متداول — متن پلتفرم، مثل «روش تدریس».
 *
 * `<details>` است نه آکاردئون جاوااسکریپتی: این صفحه ایستا رندر می‌شود و
 * باز و بسته شدن یک بخش دلیلی برای کلاینتی کردنش نیست. جواب‌ها با
 * قواعد واقعی خوانده شده‌اند — معارفه یک بار برای هر کاربر است و لغو
 * به اعتبار برمی‌گردد نه به کارت.
 */
function Faq() {
  const items = [
    {
      q: "جلسه‌ی آشنایی رایگان چگونه برگزار می‌شود؟",
      a: `یک جلسه‌ی ${faNumber(
        BUSINESS_RULES.TRIAL_DURATION_MINUTES,
      )} دقیقه‌ای و رایگان، برای اینکه با استاد آشنا شوید و مسیرتان را مشخص کنید. این جلسه یک بار برای هر کاربر است، نه یک بار به ازای هر استاد.`,
    },
    {
      q: "برای شرکت در کلاس به چه چیزهایی نیاز دارم؟",
      a: "اینترنت پایدار، ساز خودتان، و حتماً هدفون سیمی. بدون هدفون، صدای بلندگو دوباره وارد میکروفن می‌شود و کلاس پر از پژواک می‌شود.",
    },
    {
      q: "کلاس کجا برگزار می‌شود؟",
      a: "داخل خود پلتفرم و زنده. لازم نیست چیزی نصب کنید؛ چند دقیقه پیش از شروع، دکمه‌ی ورود به کلاس در پنل شما فعال می‌شود.",
    },
    {
      q: "در صورت لغو جلسه، چه شرایطی وجود دارد؟",
      a: "مبلغ به‌صورت اعتبار به حساب شما در پلتفرم برمی‌گردد و می‌توانید با آن جلسه‌ی دیگری رزرو کنید. مهلت‌ها و جزئیات در صفحه‌ی قوانین آمده است.",
    },
  ];

  return (
    <section className="mt-12">
      <h2 className="text-xl font-bold">سوالات متداول</h2>

      <div className="mt-5 space-y-3">
        {items.map((item) => (
          <details
            key={item.q}
            className="group rounded-xl border border-border bg-surface-raised px-5 py-4"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
              {item.q}
              <ChevronIcon />
            </summary>
            <p className="mt-3 text-sm text-ink-muted">{item.a}</p>
          </details>
        ))}
      </div>

      <p className="mt-5 text-sm text-ink-muted">
        جزئیات کامل در{" "}
        <Link href="/rules" className="text-accent-strong underline">
          قوانین و سیاست لغو
        </Link>{" "}
        آمده است.
      </p>
    </section>
  );
}

function PlanIcon() {
  return (
    <Icon>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4h6v3H9zM9 12h6M9 16h4" strokeLinecap="round" />
    </Icon>
  );
}

function NoteIcon() {
  return (
    <Icon>
      <path d="M9 18V6l9-2v12" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="15.5" cy="16" r="2.5" />
    </Icon>
  );
}

function ChatIcon() {
  return (
    <Icon>
      <path
        d="M20 12a7 7 0 0 1-7 7H8l-4 3v-4.5A7 7 0 0 1 8 5h5a7 7 0 0 1 7 7Z"
        strokeLinejoin="round"
      />
    </Icon>
  );
}

function ChartIcon() {
  return (
    <Icon>
      <path d="M5 20V13M10 20V8M15 20v-9M20 20V4" strokeLinecap="round" />
    </Icon>
  );
}

function ChevronIcon() {
  return (
    <svg
      className="size-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      className="size-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden="true"
    >
      {children}
    </svg>
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
    knowsAbout: instrumentNames(teacher),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
