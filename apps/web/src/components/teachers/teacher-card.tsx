import Link from "next/link";

import { Photo } from "@/components/ui";
import type { Teacher } from "@/lib/api";
import { faNumber, formatToman, lowestPrice } from "@/lib/format";

/**
 * کارت استاد در شبکه‌های عمومی.
 *
 * یک کارت و سه مصرف‌کننده: فهرست استادها، صفحه‌ی ساز، و بخش «همراهی»
 * پای مقاله. در دیزاین هر سه **دقیقاً یکی‌اند**، پس اینجا هم یکی است.
 *
 * ⚠️ **هیچ عددِ بی‌پشتوانه‌ای روی این کارت نمی‌آید.**
 *
 * نسخه‌ی قبلی دیزاین «+۴۲۰ کلاس برگزارشده» و «۱۲۸ نظر» داشت و بازبینی
 * (بند A-10 و A-11) هر دو را حذف کرد: بازارگاهی که هنوز کلاسی برگزار
 * نکرده با نمایش این اعداد اعتماد را می‌سوزاند، و شماری که بین کارت و
 * صفحه‌ی خودِ استاد فرق کند حتی در دمو هم «دادهٔ خراب» خوانده می‌شود.
 *
 * پس فقط سه چیز از دامنه می‌آید:
 *
 * - **امتیاز** فقط وقتی `rating.count > 0` باشد. حالت پیش‌فرضِ محصولِ
 *   امروز «هنوز نظری ثبت نشده» است و همان چیزی است که رندر می‌شود.
 * - **سابقه** از `yearsExperience`، و وقتی صفر باشد هیچ.
 * - **قیمت** ارزان‌ترین `offerings[].price` — قیمت **مالِ استاد** است،
 *   نه پلتفرم. استادِ بی‌سرویس قیمت نمی‌گیرد.
 *
 * `classesTaught` هم در API هست ولی روی کارتِ تأییدشده جایی ندارد؛
 * اضافه‌کردنش همان چیزی است که بازبینی حذفش کرده بود.
 */
export function TeacherCard({ teacher }: { teacher: Teacher }) {
  const instruments = [
    ...new Set(teacher.offerings.map((offering) => offering.instrumentName)),
  ];
  const cheapest = lowestPrice(teacher.offerings.map((o) => o.price));
  const hasRating = teacher.rating.count > 0 && teacher.rating.average !== null;

  return (
    <Link
      href={`/teachers/${teacher.slug}`}
      className="group flex flex-col overflow-hidden rounded-card bg-surface text-ink shadow-[inset_0_0_0_1px_var(--color-divider)] transition-[background-color,box-shadow] duration-200 hover:bg-surface-2 hover:text-ink hover:shadow-[inset_0_0_0_1px_var(--color-divider-strong)]"
    >
      <Photo
        src={teacher.avatarUrl}
        alt={teacher.fullName}
        focus="55% 36%"
        rounded="none"
        ratio="6 / 5"
        fallback={
          // حرف‌نگار در ۲۲٪ عاجی — همان حالتِ «بی‌عکسِ» دیزاین
          <span
            aria-hidden="true"
            className="text-[44px] font-semibold text-[color-mix(in_srgb,var(--color-ivory)_22%,transparent)]"
          >
            {initials(teacher.fullName)}
          </span>
        }
      />

      <div className="flex flex-1 flex-col p-5 pb-5 md:px-6.5 md:pt-6.5 md:pb-6">
        <p className="text-2xl leading-[1.45] font-semibold tracking-[-0.02em] text-ink">
          {teacher.fullName}
        </p>

        <p className="mt-2.5 text-base leading-[1.9] text-ink-2">
          {teacher.headline}
        </p>

        {instruments.length > 0 ? (
          <p className="mt-4.5 text-sm text-meta">{instruments.join(" · ")}</p>
        ) : null}

        <div className="rule-plain mt-5.5 flex flex-wrap items-center gap-x-4 gap-y-2 pt-4.5 text-[13.5px] md:text-sm">
          {hasRating ? (
            <span className="flex items-center gap-1.75 text-ink-2">
              <span aria-hidden="true" className="text-wood-light">
                ★
              </span>
              <span className="text-ink">{faNumber(teacher.rating.average!)}</span>
              <span className="text-meta">
                {faNumber(teacher.rating.count)} نظر
              </span>
            </span>
          ) : (
            <span className="text-meta">هنوز نظری ثبت نشده</span>
          )}

          {teacher.yearsExperience > 0 ? (
            <span className="text-meta">
              {faNumber(teacher.yearsExperience)} سال سابقه
            </span>
          ) : null}
        </div>

        <div className="mt-5 flex items-baseline justify-between gap-3">
          {cheapest ? (
            <span className="text-base text-ink">
              از {formatToman(cheapest)} تومان
            </span>
          ) : (
            <span />
          )}
          <span className="shrink-0 text-sm text-violet-strong">
            دیدن پروفایل ←
          </span>
        </div>
      </div>
    </Link>
  );
}

/**
 * حرف اول نام و نام خانوادگی، با نیم‌فاصله.
 *
 * نیم‌فاصله لازم است و تزئینی نیست: حرف‌های فارسی به هم می‌چسبند و «ن»
 * و «ف» کنار هم یک کلمه‌ی سرهم می‌شوند، نه دو حرفِ جدا.
 */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const first = [...words[0]!][0] ?? "";
  if (words.length === 1) return first;
  return `${first}‌${[...words[words.length - 1]!][0] ?? ""}`;
}
