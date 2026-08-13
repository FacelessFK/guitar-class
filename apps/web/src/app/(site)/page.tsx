import Link from "next/link";

import { InstrumentSignature } from "@/components/instrument-art";
import { getInstruments } from "@/lib/api";
import { faNumber } from "@/lib/format";

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
 * صفحه‌ی اصلی — کاتالوگ سازها قهرمان است، نه یک شعار.
 *
 * گزینه‌ی دیگر «ساعت‌های آزادِ این هفته» بود که کنار گذاشته شد: صفحه
 * ساعتی یک بار ساخته می‌شود و اندپوینتِ دسترس‌پذیری هم فقط به ازای
 * استاد و سرویس جواب می‌دهد، پس هر عددی اینجا تا یک ساعت کهنه است.
 * ساز چیزی است که همیشه راست می‌ماند. تخته‌ی هفته جایی رفته که
 * داده‌اش زنده است: صفحه‌ی استاد و مرحله‌ی انتخاب ساعت.
 */
export default async function HomePage() {
  const instruments = await getInstruments();

  return (
    <>
      <section className="mx-auto max-w-5xl px-5 pt-14 pb-12 sm:pt-20">
        <p className="text-sm font-medium text-accent">خصوصی · زنده · یک‌به‌یک</p>

        <h1 className="mt-4 font-display text-4xl leading-[1.5] sm:text-5xl sm:leading-[1.45]">
          {instruments.length > 0 ? `${faNumber(instruments.length)} ساز، ` : null}
          استاد خصوصی، کلاس زنده
        </h1>

        <p className="mt-5 max-w-xl text-lg leading-9 text-ink-soft">
          ساز و استادت را انتخاب کن، ساعت آزادش را بردار، و کلاس را زنده و
          یک‌به‌یک برگزار کن. جلسه‌ی معارفه بیست دقیقه است و رایگان — یک بار،
          برای آشنایی با استاد و سبک کارش.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/teachers" className="btn-primary">
            دیدن استادها
          </Link>
          <Link href="/rules" className="btn-secondary">
            قوانین و سیاست لغو
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-16">
        <h2 className="text-xl font-bold">با کدام ساز شروع می‌کنی؟</h2>

        {instruments.length === 0 ? (
          <p className="mt-6 text-ink-muted">هنوز سازی ثبت نشده است.</p>
        ) : (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {instruments.map((instrument) => (
              <li key={instrument.id}>
                <Link
                  href={`/instruments/${instrument.slug}`}
                  className="card group flex flex-col"
                >
                  {/**
                   * امضای خطی — تعداد و گروه‌بندی خط‌ها از سیم‌های
                   * واقعیِ همین ساز می‌آید، پس هر کارت اثر انگشت
                   * خودش را دارد.
                   */}
                  <div className="flex h-12 items-start">
                    <InstrumentSignature
                      slug={instrument.slug}
                      className="w-28 text-accent-dim transition-colors group-hover:text-accent"
                    />
                  </div>

                  <h3 className="mt-3 font-display text-2xl leading-tight">
                    {instrument.nameFa}
                  </h3>

                  {instrument.descriptionFa ? (
                    <p className="mt-2 line-clamp-3 text-sm leading-7 text-ink-muted">
                      {instrument.descriptionFa}
                    </p>
                  ) : null}

                  <span className="mt-4 text-sm text-accent">
                    کلاس آنلاین {instrument.nameFa}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <SessionTypes />
    </>
  );
}

/**
 * سه نوع جلسه — با خط مویی جدا می‌شوند، نه با کارت.
 *
 * کارت‌های شناور زیرِ هیرو دقیقاً همان شکلی است که این بازطراحی از آن
 * فرار می‌کند؛ اینجا اطلاعات جدولی است و مثل جدول نوشته می‌شود.
 * قیمت نمی‌آید چون قیمت به استاد بند است، نه به نوع جلسه.
 */
function SessionTypes() {
  const types = [
    {
      name: "جلسه‌ی معارفه",
      meta: "۲۰ دقیقه · رایگان",
      note: "یک بار برای هر کاربر، نه یکی به ازای هر استاد.",
    },
    {
      name: "جلسه‌ی تکی",
      meta: "طول و قیمتش را استاد تعیین می‌کند",
      note: "یک ساعتِ آزاد را برمی‌داری و همان یک جلسه را پرداخت می‌کنی.",
    },
    {
      name: "پکیج ماهانه",
      meta: "۴ جلسه · یک‌جا",
      note: "روی یک روز و ساعت ثابت هفتگی، چهار هفته‌ی پشت‌سرهم.",
    },
  ];

  return (
    <section className="mx-auto max-w-5xl px-5 pb-4">
      <h2 className="text-xl font-bold">سه جور می‌شود کلاس گرفت</h2>

      <dl className="mt-6 grid border-t border-border sm:grid-cols-3">
        {types.map((type) => (
          <div
            key={type.name}
            className="border-b border-border py-5 sm:border-b-0 sm:px-5 sm:first:pr-0 sm:last:pl-0 sm:[&+div]:border-r sm:[&+div]:border-border"
          >
            <dt className="font-bold">{type.name}</dt>
            <dd className="tnum mt-1 text-sm text-accent">{type.meta}</dd>
            <dd className="mt-2 text-sm leading-7 text-ink-muted">{type.note}</dd>
          </div>
        ))}
      </dl>

      {/**
       * محدودیتِ تأخیر شبکه از سند معماری آمده و عمداً روی صفحه‌ی
       * عمومی نوشته می‌شود: هنرجویی که انتظار هم‌نوازی دارد، سرِ
       * جلسه‌ی اول ناامید می‌شود و آن انتظار را همین‌جا باید اصلاح کرد.
       */}
      <p className="mt-8 max-w-2xl text-sm leading-8 text-ink-muted">
        کلاس نوبتی است: به‌خاطر تأخیر اینترنت، استاد و هنرجو نمی‌توانند
        هم‌زمان بنوازند — یکی می‌نوازد و دیگری گوش می‌دهد و اصلاح می‌کند.
        برای همین هدفون سیمی لازم است؛ با بلندگوی باز، صدای ساز اکو می‌گیرد.
      </p>
    </section>
  );
}
