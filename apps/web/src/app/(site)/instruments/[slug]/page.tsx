import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BUSINESS_RULES } from "@music/shared";

import { TeacherCard } from "@/components/teachers/teacher-card";
import {
  ButtonLink,
  EmptyState,
  Mark,
  Photo,
  SectionMark,
} from "@/components/ui";
import { getInstrument, getInstruments, getTeachers } from "@/lib/api";
import { formatDuration, formatToman, lowestPrice } from "@/lib/format";

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

/**
 * صفحه‌ی ساز.
 *
 * ⚠️ **بخش‌هایی از آرت‌بورد عمداً پیاده نشده‌اند.** پروتوتایپ برای
 * «گیتار کلاسیک» نوشته شده و چند بخشش متنِ مخصوص همان ساز دارد: فهرست
 * تکنیک‌ها («آرپژ و تکنیک دست راست»، «آکورد و تغییر موقعیت») و سوالات
 * متداولِ ساز. این صفحه اما برای هفت ساز رندر می‌شود و دامنه چنین
 * داده‌ای ندارد؛ تعمیم دادنشان یعنی نوشتن متنی که هیچ‌کس تأیید نکرده.
 * پس فقط بخش‌هایی آمده‌اند که یا مستقل از سازند، یا با نام ساز از
 * دیتابیس قالب می‌گیرند.
 *
 * ⚠️ **قیمت از استادهای همین ساز درمی‌آید، نه از متن.** آرت‌بورد «از
 * ۶۵۰ هزار تومان» نوشته بود؛ اینجا کمترین قیمتِ سرویس‌های واقعیِ همین
 * ساز است و اگر استادی نباشد، اصلاً نمایش داده نمی‌شود.
 */
export default async function InstrumentPage({ params }: PageProps) {
  const { slug } = await params;

  // هر سه با هم — کندترینشان زمان صفحه را تعیین می‌کند، نه جمعشان
  const [instrument, teachers, allInstruments] = await Promise.all([
    getInstrument(slug),
    getTeachers(slug),
    getInstruments(),
  ]);

  if (!instrument) notFound();

  const title = pageTitle(instrument.nameFa);
  const name = instrument.nameFa;

  /**
   * کمترین قیمت میان سرویس‌های **همین ساز**.
   *
   * فیلتر روی `instrumentSlug` لازم است: استادِ چندساز سرویس‌های ساز
   * دیگرش را هم دارد و بی‌فیلتر، قیمتِ پیانو می‌توانست زیر عنوان ویولن
   * بنشیند.
   */
  const cheapest = lowestPrice(
    teachers.flatMap((teacher) =>
      teacher.offerings
        .filter((offering) => offering.instrumentSlug === slug)
        .map((offering) => offering.price),
    ),
  );

  const others = allInstruments.filter((item) => item.slug !== slug);

  return (
    <>
      <CourseJsonLd
        title={title}
        description={instrument.descriptionFa}
        instrumentName={name}
      />

      <nav
        aria-label="مسیر"
        className="mx-auto flex max-w-[1160px] items-center gap-2.5 px-4.5 pt-4.5 text-[13px] text-meta md:px-6 md:pt-5"
      >
        <Link href="/instruments" className="py-1.5 text-meta">
          سازها
        </Link>
        <span aria-hidden="true" className="opacity-60">
          ←
        </span>
        <span className="text-ink-2">{name}</span>
      </nav>

      {/* ─────────────── قهرمان ─────────────── */}
      <section className="mx-auto grid max-w-[1160px] grid-cols-1 items-center gap-8 px-4.5 pt-7 pb-10 md:grid-cols-2 md:gap-[clamp(32px,5vw,64px)] md:px-6 md:pt-[clamp(28px,4vw,48px)] md:pb-[clamp(40px,5vw,64px)]">
        <div>
          <SectionMark hero className="mb-6">
            یادگیری {name}
          </SectionMark>

          <h1 className="max-w-[18ch] text-[clamp(34px,4.6vw,52px)] leading-[1.35] font-semibold tracking-[-0.025em] text-ink text-pretty">
            {name} را با یک مسیر شخصی یاد بگیر.
          </h1>

          {instrument.descriptionFa ? (
            <p className="mt-6.5 max-w-[46ch] text-[16.5px] leading-[1.95] text-ink-2 md:text-lg">
              {instrument.descriptionFa}
            </p>
          ) : null}

          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3.5 md:mt-9">
            <ButtonLink href="/teachers" size="lg">
              دیدن استادهای {name}
            </ButtonLink>
            <ButtonLink
              href="/dashboard/book"
              variant="ghost"
              className="px-1.5 py-3.75 text-base"
            >
              رزرو جلسه معارفه رایگان ←
            </ButtonLink>
          </div>
        </div>

        {/*
          ⚠️ **دارایی امضاشده‌ی این قاب هنوز نرسیده.** آرت‌بورد
          `assets/hero-guitar.png` می‌خواهد. به‌جای گذاشتن یک عکسِ
          بی‌ربط، همان قابِ تأییدشده با چاهِ خالی رندر می‌شود: چیدمان
          دست‌نخورده می‌ماند و هیچ تصویرِ نادرستی هم ادعا نمی‌شود.
        */}
        <Photo
          src={null}
          alt=""
          rounded="stage"
          className="max-h-[34vh] w-full [aspect-ratio:4/3] md:max-h-[560px] md:[aspect-ratio:4/5]"
        />
      </section>

      {/* ─────────────── نوار مشخصات ─────────────── */}
      <section className="mx-auto max-w-[1160px] px-4.5 md:px-6">
        <div className="rule-top-24 rule-bottom-24 flex flex-col gap-2.5 py-5 text-[15px] text-ink-2 md:flex-row md:gap-0 md:py-5.5">
          <span className="md:pe-7">از مبتدی تا پیشرفته</span>
          <span className="md:border-s md:border-divider md:px-7">
            کلاس خصوصی آنلاین
          </span>
          {cheapest ? (
            <span className="text-ink md:border-s md:border-divider md:px-7">
              از {formatToman(cheapest)} تومان
            </span>
          ) : null}
        </div>
      </section>

      {/* ─────────────── برای چه کسی ─────────────── */}
      <section className="mx-auto max-w-[1160px] px-4.5 pt-14 md:px-6 md:pt-[clamp(72px,9vw,112px)]">
        <h2 className="max-w-[22ch] text-[clamp(25px,3vw,34px)] leading-[1.45] font-semibold tracking-[-0.02em] text-ink">
          {name} برای چه کسی مناسب است؟
        </h2>
        <div className="mt-8 grid grid-cols-1 gap-5 md:mt-[clamp(32px,4vw,48px)] md:[grid-template-columns:repeat(auto-fit,minmax(240px,1fr))] md:gap-[clamp(28px,4vw,52px)]">
          {AUDIENCE.map((item) => (
            <div key={item.title}>
              <Mark width="lg" className="mb-5 w-7" />
              <h3 className="text-[19px] leading-[1.6] font-semibold text-ink">
                {item.title}
              </h3>
              <p className="mt-3 text-base leading-[1.95] text-ink-2">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ─────────────── تازه‌کار / لوازم ─────────────── */}
      <section className="mx-auto max-w-[1160px] px-4.5 pt-14 md:px-6 md:pt-[clamp(72px,9vw,112px)]">
        <div className="grid grid-cols-1 items-start gap-7 md:[grid-template-columns:repeat(auto-fit,minmax(280px,1fr))] md:gap-[clamp(28px,4vw,56px)]">
          <div className="rounded-card bg-violet-surface p-6 shadow-[inset_0_0_0_1px_var(--color-violet-border)] md:p-[clamp(28px,3.4vw,40px)]">
            <h2 className="text-[clamp(21px,2.4vw,27px)] leading-[1.5] font-semibold tracking-[-0.02em] text-ink">
              اگر تا حالا ساز نزده‌ام چی؟
            </h2>
            <p className="mt-4 text-[17px] leading-[1.95] text-ink-2">
              لازم نیست از قبل نت‌خوانی یا تکنیک خاصی بلد باشی. استاد می‌تواند
              مسیر را از اولین قدم‌ها با سطح تو شروع کند.
            </p>
          </div>

          <div>
            <h2 className="text-[clamp(21px,2.4vw,27px)] leading-[1.5] font-semibold tracking-[-0.02em] text-ink">
              برای شروع چه چیزهایی لازم داری؟
            </h2>
            <ul className="mt-5.5 grid list-none gap-3.5 p-0 text-base text-ink-2">
              <li className="flex gap-3">
                <span aria-hidden="true" className="text-wood">
                  —
                </span>
                <span>
                  <span className="text-ink">یک {name}</span> — داشتن ساز برای
                  شروع کلاس لازم است.
                </span>
              </li>
              {GEAR.map((item) => (
                <li key={item} className="flex gap-3">
                  <span aria-hidden="true" className="text-wood">
                    —
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ─────────────── استادها ─────────────── */}
      <section className="mx-auto max-w-[1160px] px-4.5 pt-14 md:px-6 md:pt-[clamp(80px,10vw,128px)]">
        <h2 className="text-[clamp(25px,3vw,34px)] leading-[1.45] font-semibold tracking-[-0.02em] text-ink">
          استادهای {name}
        </h2>
        <p className="mt-4.5 max-w-[52ch] text-[17px] leading-[1.95] text-ink-2">
          سبک تدریس، سابقه و زمان‌های هر استاد را ببین و کسی را انتخاب کن که با
          مسیرت هماهنگ‌تر است.
        </p>

        {teachers.length > 0 ? (
          <>
            <div className="mt-8 grid grid-cols-1 gap-5 md:mt-[clamp(32px,4vw,44px)] md:[grid-template-columns:repeat(auto-fit,minmax(300px,1fr))] md:gap-[clamp(20px,2.4vw,30px)]">
              {teachers.map((teacher) => (
                <TeacherCard key={teacher.profileId} teacher={teacher} />
              ))}
            </div>
            <ButtonLink
              href="/teachers"
              variant="quiet"
              className="mt-7 md:mt-[clamp(28px,3vw,40px)]"
            >
              دیدن همه استادها
            </ButtonLink>
          </>
        ) : (
          <div className="mt-8 py-8 md:mt-[clamp(32px,4vw,44px)] md:py-[clamp(48px,6vw,76px)]">
            <EmptyState
              title={`فعلاً استادی برای ${name} در دسترس نیست.`}
              action={<ButtonLink href="/teachers">دیدن همه استادها</ButtonLink>}
            >
              می‌توانی همه‌ی استادهای هوگه را ببینی یا سازِ دیگری را انتخاب کنی.
            </EmptyState>
          </div>
        )}
      </section>

      {/* ─────────────── مسیر کلاس ─────────────── */}
      <section className="mx-auto max-w-[1160px] px-4.5 pt-14 md:px-6 md:pt-[clamp(80px,10vw,128px)]">
        <h2 className="text-[clamp(25px,3vw,34px)] leading-[1.45] font-semibold tracking-[-0.02em] text-ink">
          کلاس‌ها چطور پیش می‌روند؟
        </h2>
        <ol className="mt-9 grid list-none grid-cols-1 gap-8 p-0 md:mt-[clamp(36px,4vw,56px)] md:[grid-template-columns:repeat(auto-fit,minmax(200px,1fr))] md:gap-[clamp(28px,3vw,44px)]">
          {FLOW.map((step) => (
            <li key={step.n}>
              <div aria-hidden="true" className="relative my-5.5 h-2.75">
                <span className="absolute -inset-x-3.5 top-1.25 h-px opacity-55 [background:linear-gradient(to_left,transparent,var(--color-wood),transparent)]" />
                <span className="relative block size-2.75 rounded-full bg-bg shadow-[0_0_0_1px_var(--color-wood)]" />
              </div>
              <p className="text-[13px] tracking-[0.14em] text-wood-light">
                {step.n}
              </p>
              <h3 className="mt-2.5 text-[18px] leading-[1.6] font-semibold text-ink">
                {step.title}
              </h3>
              <p className="mt-2.5 text-[15px] leading-[1.9] text-ink-2">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* ─────────────── گزینه‌های برگزاری ─────────────── */}
      <section className="mx-auto max-w-[1160px] px-4.5 pt-14 md:px-6 md:pt-[clamp(80px,10vw,128px)]">
        <h2 className="text-[clamp(25px,3vw,34px)] leading-[1.45] font-semibold tracking-[-0.02em] text-ink">
          گزینه‌های برگزاری کلاس
        </h2>
        <div className="mt-7 grid grid-cols-1 md:mt-[clamp(28px,3.4vw,44px)] md:[grid-template-columns:repeat(auto-fit,minmax(250px,1fr))]">
          <div className="rule-plain pt-6.5 pb-7 md:[background-image:none] md:pt-1 md:pe-[clamp(0px,3vw,40px)]">
            <h3 className="text-[19px] font-semibold text-ink">
              جلسه معارفه رایگان
            </h3>
            <p className="mt-3 text-base leading-[1.95] text-ink-2">
              برای آشنایی با استاد و مشخص کردن مسیر. یک گفت‌وگوی کوتاه، پیش از
              تصمیم‌گیری.
            </p>
            <p className="mt-4.5 text-[15px] text-meta">
              رایگان · {formatDuration(BUSINESS_RULES.TRIAL_DURATION_MINUTES)}
            </p>
          </div>

          {SESSION_OPTIONS.map((option) => (
            <div
              key={option.title}
              className="rule-plain pt-6.5 pb-7 md:[background-image:none] md:border-s md:border-divider md:px-[clamp(0px,3vw,40px)] md:pt-1"
            >
              <h3 className="text-[19px] font-semibold text-ink">
                {option.title}
              </h3>
              <p className="mt-3 text-base leading-[1.95] text-ink-2">
                {option.body}
              </p>
              {/*
                قیمت اینجا **عدد نمی‌گیرد**. آرت‌بورد «از ۶۵۰ هزار
                تومان» داشت ولی قیمت مالِ استاد است نه پلتفرم؛ عددِ
                واقعی روی کارت استاد و پروفایلش می‌آید.
              */}
              <p className="mt-4.5 text-[15px] text-meta">{option.meta}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─────────────── بعد از کلاس ─────────────── */}
      <section className="mx-auto max-w-[1160px] px-4.5 pt-14 md:px-6 md:pt-[clamp(80px,10vw,128px)]">
        <div className="grid grid-cols-1 items-start gap-7 md:[grid-template-columns:repeat(auto-fit,minmax(280px,1fr))] md:gap-[clamp(28px,4vw,64px)]">
          <h2 className="max-w-[20ch] text-[clamp(23px,2.8vw,32px)] leading-[1.5] font-semibold tracking-[-0.02em] text-ink">
            کلاس با تمام شدن تماس تمام نمی‌شود.
          </h2>
          <div className="grid gap-5">
            {AFTER.map((item) => (
              <p
                key={item.lead}
                className="flex gap-4 text-base leading-[1.95] text-ink-2"
              >
                <span aria-hidden="true" className="shrink-0 text-wood">
                  —
                </span>
                <span>
                  <span className="text-ink">{item.lead}</span> {item.rest}
                </span>
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────── سازهای دیگر ─────────────── */}
      {others.length > 0 ? (
        <section className="mx-auto max-w-[1160px] px-4.5 pt-14 md:px-6 md:pt-[clamp(80px,10vw,128px)]">
          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-4">
            <h2 className="text-[19px] font-semibold text-ink">سازهای دیگر</h2>
            <div className="flex flex-wrap gap-x-6 gap-y-3 text-base">
              {others.map((item) => (
                <Link
                  key={item.slug}
                  href={`/instruments/${item.slug}`}
                  className="py-1 text-ink-2 hover:text-ink"
                >
                  {item.nameFa}
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ─────────────── بستنِ صفحه ─────────────── */}
      <section className="mx-auto max-w-[1160px] px-4.5 pt-14 pb-20 md:px-6 md:pt-[clamp(72px,9vw,112px)] md:pb-[clamp(96px,12vw,140px)]">
        <div className="rule-top flex flex-col items-start pt-12 md:pt-[clamp(48px,6vw,76px)]">
          <span
            aria-hidden="true"
            className="mb-6.5 h-px w-18 [background:linear-gradient(to_left,transparent,var(--color-wood),transparent)]"
          />
          <h2 className="max-w-[20ch] text-[clamp(26px,3.4vw,38px)] leading-[1.4] font-semibold tracking-[-0.025em] text-ink">
            استاد {name} خود را پیدا کن.
          </h2>
          <p className="mt-4.5 max-w-[46ch] text-[17px] leading-[1.95] text-ink-2">
            پروفایل استادها را ببین، سبک تدریسشان را مقایسه کن و از یک جلسه
            معارفه شروع کن.
          </p>
          <ButtonLink href="/teachers" size="lg" className="mt-7">
            دیدن استادهای {name}
          </ButtonLink>
        </div>
      </section>
    </>
  );
}

/* ──────────────────────── متن‌های ثابت ──────────────────────── */

/** مستقل از ساز — همان متنِ تأییدشده. */
const AUDIENCE = [
  {
    title: "اگر از صفر شروع می‌کنی",
    body: "مقدمات، نت‌خوانی و تکنیک را گام‌به‌گام و بدون پیش‌نیاز یاد می‌گیری.",
  },
  {
    title: "اگر قبلاً ساز زده‌ای",
    body: "استاد عادت‌های دست، ریتم و صداگیری را می‌بیند و تکنیکت را اصلاح می‌کند.",
  },
  {
    title: "اگر دنبال قطعه و رپرتوار هستی",
    body: "قطعه‌هایی را که دوست داری تمرین می‌کنی و به اجرای کامل می‌رسانی.",
  },
] as const;

const GEAR = [
  "اینترنت پایدار برای تماس تصویری",
  "موبایل، تبلت یا لپ‌تاپ",
  "هدفون سیمی برای شنیدن دقیق‌تر صدا",
] as const;

const FLOW = [
  {
    n: "۰۱",
    title: "استاد مناسب را انتخاب کن",
    body: "پروفایل، سابقه و سبک تدریس استادها را مقایسه کن.",
  },
  {
    n: "۰۲",
    title: "یک زمان آزاد بردار",
    body: "از تقویم استاد، زمانی را که به برنامه‌ات می‌خورد رزرو کن.",
  },
  {
    n: "۰۳",
    title: "کلاس خصوصی آنلاین داشته باش",
    body: "یک‌به‌یک و زنده، با تمرکز روی ساز خودت.",
  },
  {
    n: "۰۴",
    title: "تمرین و بازخورد بگیر",
    body: "بعد از کلاس، تمرین و یادداشت‌های استاد برایت می‌ماند.",
  },
] as const;

const SESSION_OPTIONS = [
  {
    title: "تک جلسه",
    body: "برای یک کلاس مستقل؛ وقتی می‌خواهی موضوع مشخصی را با استاد کار کنی.",
    meta: "قیمت بر اساس استاد",
  },
  {
    title: "بسته ماهانه ۴ جلسه‌ای",
    body: "برای مسیر منظم هفتگی؛ وقتی می‌خواهی تمرین و پیشرفت پیوسته باشد.",
    meta: "هفته‌ای یک جلسه · قیمت بر اساس استاد",
  },
] as const;

const AFTER = [
  { lead: "یادداشت جلسه", rest: "بعد از هر کلاس ثبت می‌شود." },
  { lead: "تمرین هفته", rest: "با توجه به سطح تو تعیین می‌شود." },
  { lead: "بازخورد استاد", rest: "روی تمرین‌ها، پیش از جلسه‌ی بعد." },
] as const;

/**
 * داده‌ی ساخت‌یافته‌ی `Course`.
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
