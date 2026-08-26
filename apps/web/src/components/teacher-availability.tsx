"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { addDaysToDateKey, tehranDateKey } from "@music/shared";

import { SectionMark, Skeleton } from "@/components/ui";
import { errorMessage } from "@/lib/api-client";
import { getSlots, type Slot } from "@/lib/app-api";
import { faDigits, formatJalaliShort } from "@/lib/format";

/**
 * چند اسلات آزادِ نزدیک، در کارت کناری صفحه‌ی استاد.
 *
 * ⚠️ **کلاینتی است و عمداً هم باید باشد.** صفحه‌ی استاد ISR با
 * `revalidate = 3600` است؛ اسلات آزاد اگر سمت سرور رندر شود، تا یک ساعت
 * از نسخه‌ی کش‌شده خوانده می‌شود و ساعتی را نشان می‌دهد که همین حالا
 * رزرو شده است. بدترین حالتِ ممکن برای این کارت: کاربر روی ساعتی کلیک
 * کند که دیگر وجود ندارد.
 *
 * فقط `@Public()` صدا زده می‌شود (`anonymous: true`) — این صفحه را
 * بازدیدکننده‌ی واردنشده هم می‌بیند و هیچ توکنی در کار نیست.
 *
 * دیزاین این بخش را سه ردیفِ «روز / ساعت» با خط جداکننده و یک لینک
 * «دیدن همه‌ی زمان‌ها ←» می‌کشد. حالتِ بارگذاری اسکلتون است، نه متنِ
 * «در حال خواندن…»: بازبینی (بند B-13) الگوی اسکلتونِ صفحه‌ی رزرو را
 * الگوی مشترکِ همه‌ی انتظارها کرده.
 */

/** پنجره‌ی جست‌وجو. کوتاه است چون این کارت خلاصه است نه تقویم کامل. */
const WINDOW_DAYS = 14;

/** بیش از این تعداد، کارت کناری را به یک فهرست بلند تبدیل می‌کند. */
const MAX_SHOWN = 3;

interface Props {
  offeringId: string;
  teacherProfileId: string;
  /** برای دکمه‌ی «دیدن همه‌ی زمان‌ها» که به جریان رزرو می‌رود */
  bookHref: React.ComponentProps<typeof Link>["href"];
}

export function TeacherAvailability({
  offeringId,
  teacherProfileId,
  bookHref,
}: Props) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const from = tehranDateKey(new Date());
    const to = addDaysToDateKey(from, WINDOW_DAYS - 1);

    try {
      setSlots(await getSlots({ offeringId, teacherProfileId, from, to }));
      setError(null);
    } catch (caught) {
      setSlots([]);
      setError(errorMessage(caught));
    }
  }, [offeringId, teacherProfileId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="rule-plain mt-7 pt-5.5">
      <SectionMark tone="violet" width="sm" className="mb-1.5">
        زمان‌های در دسترس
      </SectionMark>

      {slots === null ? (
        <div className="mt-3.5 flex flex-col gap-2">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-4/5" delay={1} />
          <Skeleton className="h-5 w-3/5" delay={2} />
        </div>
      ) : error ? (
        <p className="mt-3.5 text-[13.5px] leading-[1.85] text-meta">
          فهرست ساعت‌ها الان در دسترس نیست. از دکمه‌ی رزرو ادامه بده.
        </p>
      ) : slots.length === 0 ? (
        <p className="mt-3.5 text-[13.5px] leading-[1.85] text-meta">
          در دو هفته‌ی آینده ساعت آزادی ندارد.
        </p>
      ) : (
        <div className="flex flex-col">
          {slots.slice(0, MAX_SHOWN).map((slot) => (
            <div
              key={slot.startAt}
              className="flex items-center justify-between gap-4 py-3.5"
            >
              <span className="text-[15px] text-ink">
                {slot.weekdayName}{" "}
                <span className="text-ink-2">{formatJalaliShort(slot.date)}</span>
              </span>
              <span dir="ltr" className="text-[15px] text-ink-2">
                {faDigits(slot.startTime)}
              </span>
            </div>
          ))}
        </div>
      )}

      <Link href={bookHref} className="mt-4 inline-block text-[14.5px]">
        دیدن همه‌ی زمان‌ها ←
      </Link>
    </div>
  );
}
