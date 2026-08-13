import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "قوانین و سیاست لغو",
  description:
    "شرایط رزرو، لغو، بازپرداخت و عدم حضور در کلاس‌های آنلاین موسیقی.",
  alternates: { canonical: "/rules" },
};

/**
 * ⚠️ این جدول باید پیش از اولین فروش واقعی تأیید و منتشر شود.
 *
 * سطرها دقیقاً همان رفتاری هستند که **همین حالا در کد اجرا می‌شود**
 * (`cancelBooking` در `booking.service.ts` و جاروی `close-sessions`)،
 * نه یک متن آرزویی. هر تغییری در این جدول باید هم‌زمان در آن دو جا
 * انجام شود، وگرنه صفحه‌ی قوانین چیزی می‌گوید که سیستم انجام نمی‌دهد —
 * و در اختلاف، همین صفحه است که سند محسوب می‌شود.
 */
const CANCELLATION_POLICY: readonly { situation: string; outcome: string }[] = [
  {
    situation: "هنرجو بیش از ۲۴ ساعت پیش از کلاس لغو کند",
    outcome: "کل مبلغ به اعتبار شما برمی‌گردد و در رزرو بعدی خرج می‌شود.",
  },
  {
    situation: "هنرجو کمتر از ۲۴ ساعت پیش از کلاس لغو کند",
    outcome: "جلسه می‌سوزد و مبلغ برنمی‌گردد.",
  },
  {
    situation: "استاد لغو کند — در هر زمان",
    outcome: "کل مبلغ به اعتبار شما برمی‌گردد.",
  },
  {
    situation: "استاد در کلاس حاضر نشود",
    outcome: "کل مبلغ به اعتبار شما برمی‌گردد و موضوع بررسی می‌شود.",
  },
  {
    situation: "هنرجو در کلاس حاضر نشود",
    outcome: "جلسه می‌سوزد.",
  },
];

export default function RulesPage() {
  return (
    <article className="mx-auto max-w-3xl px-5 py-16">
      <h1 className="text-3xl font-bold sm:text-4xl">قوانین و سیاست لغو</h1>

      <section className="mt-12">
        <h2 className="text-2xl font-bold">رزرو و پرداخت</h2>
        <ul className="mt-4 list-disc space-y-2 pr-5">
          <li>
            جلسه‌ی معارفه بیست دقیقه است، رایگان، و برای هر کاربر فقط یک بار.
          </li>
          <li>
            رزرو تا زمان پرداخت نگه داشته می‌شود؛ اگر پرداخت انجام نشود، ساعت
            دوباره آزاد می‌شود.
          </li>
          <li>
            پکیج ماهانه چهار جلسه است روی یک روز و ساعت ثابت هفتگی و یک‌جا
            پرداخت می‌شود.
          </li>
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-bold">لغو و عدم حضور</h2>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-collapse text-right text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="py-3 pl-4 font-bold">وضعیت</th>
                <th className="py-3 font-bold">نتیجه</th>
              </tr>
            </thead>
            <tbody>
              {CANCELLATION_POLICY.map((rule) => (
                <tr
                  key={rule.situation}
                  className="border-b border-border"
                >
                  <td className="py-3 pl-4 align-top">{rule.situation}</td>
                  <td className="py-3 align-top text-ink-muted">
                    {rule.outcome}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/*
          «اعتبار» در جدول بالا بارها تکرار می‌شود و باید یک جا معنا
          داشته باشد. مهم‌ترین جمله‌اش همان است که می‌گوید نقدی برنمی‌گردد
          — چیزی که اگر فقط بعد از لغو کشف شود، به شکایت تبدیل می‌شود.
        */}
        <div className="mt-6 space-y-2 text-sm text-ink-muted">
          <p>
            <strong className="text-ink">اعتبار چیست؟</strong> مبلغی که نزد
            پلتفرم برای شما می‌ماند و در رزروهای بعدی — چه تک‌جلسه و چه پکیج —
            به‌جای پرداخت با کارت خرج می‌شود. اعتبار تاریخ انقضا ندارد و اگر
            کل مبلغ کلاس را بپوشاند، پرداخت اصلاً به درگاه نمی‌رود.
          </p>
          <p>
            بازگرداندن نقدی به کارت در این مرحله انجام نمی‌شود. اگر موردی خارج
            از این جدول پیش آمد، از راه پشتیبانی پیگیری می‌شود.
          </p>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-bold">شرایط فنی کلاس</h2>
        <ul className="mt-4 list-disc space-y-2 pr-5">
          <li>
            کلاس در مرورگر برگزار می‌شود و نصب هیچ برنامه‌ای لازم نیست.
          </li>
          <li>
            <strong>هدفون سیمی الزامی است.</strong> بدون آن، صدای بلندگو دوباره
            وارد میکروفن می‌شود و پژواک می‌سازد.
          </li>
          <li>
            به دلیل تأخیر ذاتی اینترنت، استاد و هنرجو نمی‌توانند دقیقاً هم‌زمان
            بنوازند؛ کلاس‌ها نوبتی طراحی شده‌اند.
          </li>
          <li>اتاق کلاس از ده دقیقه پیش از شروع جلسه باز می‌شود.</li>
        </ul>
      </section>
    </article>
  );
}
