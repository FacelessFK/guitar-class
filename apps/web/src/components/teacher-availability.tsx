"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { addDaysToDateKey, tehranDateKey } from "@music/shared";

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

export function TeacherAvailability({ offeringId, teacherProfileId, bookHref }: Props) {
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
    <div className="mt-6 border-t border-border pt-6">
      <h3 className="flex items-center gap-2 font-medium">
        <ClockIcon />
        زمان‌های در دسترس
      </h3>

      {slots === null ? (
        <p className="mt-3 text-sm text-ink-muted">در حال خواندن…</p>
      ) : error ? (
        <p className="mt-3 text-sm text-ink-muted">
          فهرست ساعت‌ها الان در دسترس نیست. از دکمه‌ی رزرو وارد شوید.
        </p>
      ) : slots.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">
          در دو هفته‌ی آینده ساعت آزادی ندارد.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {slots.slice(0, MAX_SHOWN).map((slot) => (
            <li
              key={slot.startAt}
              className="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
            >
              <span className="flex items-center gap-2">
                <CalendarIcon />
                {slot.weekdayName}
                <span className="text-ink-muted">{formatJalaliShort(slot.date)}</span>
              </span>
              <span className="font-medium">{faDigits(slot.startTime)}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-center text-sm text-ink-muted">
        <Link href={bookHref} className="underline">
          برای دیدن همه‌ی زمان‌ها وارد شوید
        </Link>
      </p>
    </div>
  );
}

function ClockIcon() {
  return (
    <svg
      className="size-4 text-accent-strong"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      className="size-4 text-ink-muted"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
    </svg>
  );
}
