import Link from "next/link";

import { ButtonLink, Mark, Photo, SectionMark } from "@/components/ui";
import { getInstruments } from "@/lib/api";
import type { Instrument } from "@/lib/api";

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
 * صفحه‌ی اصلی.
 *
 * ⚠️ **نوارِ زیر تیتر عدد ندارد و نباید بگیرد.** نسخه‌ی قبلیِ دیزاین
 * اینجا «۱۲۰+ استاد تأییدشده» و «۴٫۹ میانگین امتیاز» داشت؛ بازبینی
 * (بند A-11) آن را حذف کرد چون بازارگاهی که هنوز یک کلاس هم برگزار
 * نکرده، با نمایش این اعداد اعتمادی را می‌سوزاند که کل برند رویش سوار
 * است. جایش «نوارِ حقیقت» آمد: سه چیزی که از روز اول درست است.
 */
export default async function HomePage() {
  const instruments = await getInstruments();

  return (
    <>
      <Hero />
      <SessionTypes />
      <Instruments instruments={instruments} />
      <Steps />
      <Closing />
    </>
  );
}

/* ─────────────────────────── قهرمان ─────────────────────────── */

const TRUTHS = [
  { title: "کلاس خصوصی آنلاین", sub: "یک‌به‌یک و زنده" },
  { title: "مسیر شخصی یادگیری", sub: "بر اساس سطح و هدف تو" },
  { title: "تمرین و بازخورد", sub: "ادامه‌ی کلاس بعد از جلسه" },
] as const;

function Hero() {
  return (
    <section className="mx-auto grid max-w-[1160px] grid-cols-1 items-center gap-7 px-4.5 pt-5 pb-10 md:grid-cols-2 md:gap-[clamp(20px,2.2vw,26px)] md:px-6 md:pt-[clamp(40px,7vw,96px)] md:pb-14">
      {/*
        روی موبایل عکس **بالای** متن می‌رود (`order-first`): تیترِ بلندِ
        فارسی در ۳۹۰ پیکسل بیش از نیمی از پرده را می‌گیرد و اگر عکس
        زیرش بیفتد، هیچ‌کس نمی‌بیندش.
      */}
      {/*
        ⚠️ **عکسِ نمونه، نه دارایی امضاشده.** دیزاین اینجا
        `assets/hero-guitar.png` می‌خواهد که هنوز به `public/` نرسیده.
        این عکس روی زمینه‌ی روشن گرفته شده و با `.lighten` شسته دیده
        می‌شود؛ با آمدن دارایی اصلی فقط همین `src` عوض می‌شود.
      */}
      <div className="order-first md:order-last">
        <Photo
          src="/teachers/sample-guitar-teacher.jpg"
          alt="نوازنده‌ی گیتار کلاسیک"
          focus="50% 50%"
          rounded="panel"
          className="hero-mask max-h-[34vh] w-full [aspect-ratio:16/10] md:hero-mask-wide md:max-h-none md:min-h-80 md:rounded-card md:[aspect-ratio:4/5]"
          imgClassName="scale-[1.06] -translate-y-[3%] md:scale-120 md:-translate-y-[9%] [transform-origin:50%_55%] [filter:contrast(1.09)_saturate(1.04)_brightness(1.05)]"
        />
      </div>

      <div>
        <div className="flex items-center gap-3.5 text-sm text-wood-light">
          <Mark width="hero" fade />
          <span>جلسه معارفه اول رایگان است</span>
        </div>

        <h1 className="mt-6.5 text-[clamp(38px,5.6vw,62px)] leading-[1.35] font-semibold tracking-[-0.025em] text-ink text-pretty">
          کلاس آنلاین موسیقی،
          <br />
          خصوصی و زنده
        </h1>

        <p className="mt-6.5 max-w-[46ch] text-lg leading-[1.9] text-ink-2 text-pretty">
          ساز و استادت را انتخاب کن، ساعت آزادش را رزرو کن، و کلاس را زنده و
          یک‌به‌یک برگزار کن. بعد از کلاس هم تمرین و بازخورد ادامه دارد.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-x-5.5 gap-y-3">
          <ButtonLink href="/teachers" size="lg">
            دیدن استادها
          </ButtonLink>
          <ButtonLink href="/how-it-works" variant="ghost" className="px-1 py-3.5">
            نحوه کار
          </ButtonLink>
        </div>

        <div className="rule-top-wood mt-10 flex flex-wrap gap-5.5 pt-6.5 md:mt-13 md:gap-11 md:pt-8">
          {TRUTHS.map((truth) => (
            <div key={truth.title}>
              <p className="text-[22px] font-semibold text-ink">{truth.title}</p>
              <p className="mt-1 text-sm text-meta">{truth.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ────────────────────── سه نوع جلسه ────────────────────── */

/**
 * ⚠️ **هیچ قیمتِ سراسری اینجا نوشته نمی‌شود.**
 *
 * پروتوتایپ «از ۸۵۰ هزار تومان» داشت و صفحه‌ی ساز در همان دیزاین «از
 * ۶۵۰ هزار تومان» — دو عددِ ناهم‌خوان که هیچ‌کدام از داده نمی‌آمدند.
 * قیمت در این محصول **مالِ استاد** است نه پلتفرم: هر استاد `offerings`
 * خودش را دارد و همان‌جا (کارت استاد و پروفایل) با عددِ واقعی نشان داده
 * می‌شود. متنِ عمومی فقط می‌گوید قیمت به استاد بستگی دارد.
 */
const SESSION_TYPES = [
  {
    kicker: "انعطاف",
    title: "تک جلسه",
    body: "یک جلسه‌ی شصت دقیقه‌ای در ساعتی که خودت از اسلات‌های آزاد استاد انتخاب می‌کنی.",
    meta: "۶۰ دقیقه · قیمت بر اساس استاد",
  },
  {
    kicker: "پیشرفت مستمر",
    title: "بسته ماهانه",
    body: "چهار جلسه روی یک روز و ساعت ثابت هفتگی، با تمرین و بازخورد بین جلسات.",
    meta: "۴ × ۶۰ دقیقه · قیمت بر اساس استاد",
  },
] as const;

function SessionTypes() {
  return (
    <section className="band-surface mt-10 py-14 md:mt-[clamp(40px,6vw,72px)] md:py-[clamp(72px,9vw,116px)]">
      <div className="mx-auto max-w-[1160px] px-4.5 md:px-6">
        <h2 className="mb-3.5 text-[clamp(28px,3.4vw,36px)] leading-[1.45] font-semibold tracking-[-0.02em] text-ink">
          سه نوع جلسه
        </h2>
        <p className="mb-10 max-w-[52ch] text-[17px] leading-[1.9] text-ink-2 md:mb-[clamp(40px,5vw,64px)]">
          اول جلسه معارفه، بعد تک جلسه یا بسته ماهانه روی یک روز و ساعت ثابت
          هفتگی.
        </p>

        <div className="flex flex-wrap gap-6 md:gap-[clamp(24px,3vw,44px)]">
          {/* جلسه‌ی معارفه کارتِ پر می‌گیرد چون قدم اول است، نه یکی از سه گزینه */}
          <div className="flex-[1.35_1_320px] rounded-panel bg-surface-2 p-5.5 md:p-8.5">
            <Mark className="mb-6.5 w-12" />
            <p className="mb-3.5 text-[13px] tracking-[0.12em] text-wood-light">
              قدم اول
            </p>
            <p className="mb-4 text-[clamp(28px,3vw,34px)] leading-[1.4] font-semibold tracking-[-0.02em] text-ink">
              جلسه معارفه رایگان
            </p>
            <p className="mb-6.5 max-w-[40ch] text-[17px] leading-[1.95] text-ink-2">
              بیست دقیقه گفت‌وگو با استاد، سنجیدن سطح و تعیین مسیر. یک بار برای
              هر کاربر.
            </p>
            <p className="text-sm text-meta">۲۰ دقیقه · بدون پرداخت</p>
          </div>

          {SESSION_TYPES.map((type) => (
            <div key={type.title} className="flex-[1_1_240px] py-2 md:py-8.5">
              <Mark tone="divider" className="mb-6.5 w-12" />
              <p className="mb-3.5 text-[13px] tracking-[0.12em] text-meta">
                {type.kicker}
              </p>
              <p className="mb-4 text-[23px] leading-[1.45] font-semibold tracking-[-0.01em] text-ink">
                {type.title}
              </p>
              <p className="mb-6.5 text-base leading-[1.95] text-ink-2">
                {type.body}
              </p>
              <p className="text-sm text-meta">{type.meta}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── سازها ─────────────────────────── */

function Instruments({ instruments }: { instruments: Instrument[] }) {
  return (
    <section className="mx-auto max-w-[1160px] px-4.5 pt-15 pb-10 md:px-6 md:pt-[clamp(72px,9vw,116px)] md:pb-[clamp(48px,6vw,80px)]">
      <div className="mb-11 flex flex-wrap items-baseline justify-between gap-4 md:mb-[clamp(44px,5vw,64px)]">
        <div>
          <SectionMark tone="violet" className="mb-4.5 tracking-[0.1em]">
            سازها
          </SectionMark>
          <h2 className="text-[clamp(30px,3.6vw,40px)] leading-[1.4] font-semibold tracking-[-0.025em] text-ink">
            با کدام ساز شروع می‌کنی؟
          </h2>
        </div>
        <Link href="/instruments" className="text-[15px]">
          همه‌ی سازها ←
        </Link>
      </div>

      {instruments.length === 0 ? (
        <p className="text-ink-2">هنوز سازی ثبت نشده است.</p>
      ) : (
        <div className="grid grid-cols-1 md:[grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
          {instruments.map((instrument) => (
            <Link
              key={instrument.id}
              href={`/instruments/${instrument.slug}`}
              className="rule-top-24 relative flex flex-col overflow-hidden px-5 pt-7.5 pb-6.5 text-ink transition-colors duration-200 hover:bg-surface hover:text-ink md:px-7.5 md:pt-9 md:pb-7.5"
            >
              {/*
                حرفِ سایه‌دار: اولین حرفِ نامِ ساز، در ۱۰۴ پیکسل و ۳.۵
                درصد عاجی. تزئین است و از دسترسِ صفحه‌خوان بیرون می‌ماند.
              */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute end-3 top-1 text-[104px] leading-none font-bold text-[color-mix(in_srgb,var(--color-ivory)_3.5%,transparent)]"
              >
                {[...instrument.nameFa][0]}
              </span>

              <span className="relative mb-4 text-[clamp(24px,2.6vw,30px)] leading-[1.4] font-semibold tracking-[-0.025em] text-ink">
                {instrument.nameFa}
              </span>

              {instrument.descriptionFa ? (
                <span className="relative line-clamp-2 max-w-[34ch] text-base leading-[1.95] text-ink-2">
                  {instrument.descriptionFa}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

/* ─────────────────────────── مسیر ─────────────────────────── */

const STEPS = [
  {
    n: "۰۱",
    title: "ساز و استاد را انتخاب کن",
    body: "کارت هر استاد سازها، سابقه و کمترین قیمت را نشان می‌دهد.",
  },
  {
    n: "۰۲",
    title: "اسلات آزاد را رزرو کن",
    body: "روز و ساعت را از برنامه‌ی خود استاد بردار — بدون پیام و هماهنگی.",
  },
  {
    n: "۰۳",
    title: "کلاس زنده‌ی یک‌به‌یک",
    body: "ده دقیقه پیش از جلسه اتاق کلاس باز می‌شود. هدفون سیمی الزامی است.",
  },
  {
    n: "۰۴",
    title: "تمرین و بازخورد",
    body: "تمرین‌ها، اجرای آپلودشده‌ی تو و بازخورد صوتی استاد در پرونده‌ی جلسه.",
  },
] as const;

function Steps() {
  return (
    <section className="mx-auto max-w-[1160px] px-4.5 py-16 md:px-6 md:pt-[clamp(80px,10vw,132px)] md:pb-[clamp(80px,10vw,128px)]">
      <SectionMark tone="violet" className="mb-4.5 tracking-[0.1em]">
        مسیر
      </SectionMark>
      <h2 className="mb-14 text-[clamp(30px,3.6vw,40px)] leading-[1.4] font-semibold tracking-[-0.025em] text-ink md:mb-[clamp(56px,7vw,88px)]">
        چطور کار می‌کند؟
      </h2>

      <div className="grid grid-cols-1 gap-10 md:[grid-template-columns:repeat(auto-fit,minmax(230px,1fr))] md:gap-x-0 md:gap-y-[clamp(40px,5vw,64px)]">
        {STEPS.map((step) => (
          <div
            key={step.n}
            className="rule-plain relative pt-8.5 md:pe-[clamp(24px,3.2vw,52px)]"
          >
            <span
              aria-hidden="true"
              className="absolute -top-[3.5px] start-0 size-[7px] rounded-full bg-violet-strong"
            />
            <p className="mb-6 text-[clamp(44px,4.8vw,58px)] leading-none font-semibold tracking-[-0.035em] text-violet-strong">
              {step.n}
            </p>
            <p className="mb-3.5 max-w-[20ch] text-[22px] leading-[1.5] font-semibold tracking-[-0.015em] text-ink">
              {step.title}
            </p>
            <p className="max-w-[30ch] text-base leading-[2] text-ink-2">
              {step.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────── بستنِ صفحه ─────────────────────── */

function Closing() {
  return (
    <section className="mx-auto max-w-[1160px] px-4.5 pb-20 md:px-6 md:pb-[clamp(96px,12vw,148px)]">
      <div className="rule-top flex flex-col items-center pt-14 text-center md:pt-[clamp(56px,7vw,88px)]">
        <span
          aria-hidden="true"
          className="mb-8 h-px w-18 [background:linear-gradient(to_left,transparent,var(--color-wood),transparent)] md:mb-[clamp(32px,4vw,48px)]"
        />
        <h2 className="max-w-[26ch] text-[clamp(28px,4.2vw,48px)] leading-[1.45] font-semibold tracking-[-0.025em] text-ink text-pretty">
          جلسه‌ی معارفه‌ی بیست دقیقه‌ای، رایگان
        </h2>
        <p className="mt-6 max-w-[46ch] text-lg leading-[1.9] text-ink-2">
          یک بار برای هر کاربر. استاد را ببین، بعد تصمیم بگیر.
        </p>
        <ButtonLink
          href="/auth/register"
          size="lg"
          className="mt-9 px-11.5 md:mt-[clamp(36px,4.5vw,52px)]"
        >
          ساخت حساب
        </ButtonLink>
      </div>
    </section>
  );
}
