"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Avatar } from "@/components/avatar";
import { ReviewForm } from "@/components/review-form";
import { SessionLearning } from "@/components/session-learning";
import { CalendarIcon, ClockIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api-client";
import { getBooking, type BookingDetail } from "@/lib/app-api";
import { statusDisplay, typeLabel } from "@/lib/booking-display";
import { faDigits, faNumber, formatJalaliDayMonth } from "@/lib/format";

/** Shared Session File shell; role and learning permissions remain server-derived. */
export default function SessionPage() {
  const params = useParams<{ bookingId: string }>();
  const bookingId = params.bookingId;
  const [booking, setBooking] = useState<BookingDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBooking(bookingId)
      .then((loaded) => {
        setBooking(loaded);
        setError(loaded ? null : "این جلسه پیدا نشد.");
      })
      .catch((caught: unknown) => setError(errorMessage(caught)));
  }, [bookingId]);

  return (
    <div className="mx-auto max-w-[960px] px-4.5 pt-6 pb-19 md:px-6 md:pt-9 md:pb-26">
      <div className="flex flex-wrap items-center gap-2 text-[13.5px] text-meta">
        <Link href="/dashboard" className="min-h-11 py-2 text-ink-2">
          کلاس‌های من
        </Link>
        <span>←</span>
        {booking ? (
          <span className="min-w-0 truncate">
            {booking.instrumentName} با {booking.counterpartName}
          </span>
        ) : null}
      </div>

      {error ? <p className="alert-error mt-5">{error}</p> : null}

      {booking === undefined && !error ? (
        <SessionHeaderSkeleton />
      ) : booking ? (
        <SessionHeader booking={booking} />
      ) : null}

      {booking ? (
        <>
          <SessionLearning bookingId={bookingId} />
          {booking.canReview ? (
            <div className="mt-12 border-t border-divider pt-8 md:mt-16 md:pt-10">
              <ReviewForm bookingId={bookingId} teacherName={booking.counterpartName} />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function SessionHeader({ booking }: { booking: BookingDetail }) {
  const status = statusDisplay(booking.status, booking.role);
  const dot =
    status.tone === "badge-ok"
      ? "bg-ok"
      : status.tone === "badge-wait"
        ? "bg-wood-light"
        : status.tone === "badge-neutral"
          ? "bg-violet"
          : "bg-meta";

  return (
    <header className="mt-2.5 flex flex-wrap items-start gap-4 border-b border-divider pb-8 md:mt-3 md:gap-5 md:pb-10">
      <Avatar
        name={booking.counterpartName}
        className="size-[54px] shrink-0 rounded-full shadow-[inset_0_0_0_1px_var(--color-divider)]"
        textClassName="text-base"
        alt=""
      />
      <div className="min-w-0 flex-[1_1_320px]">
        <h1 className="text-[clamp(23px,2.6vw,29px)] font-semibold tracking-[-0.02em] text-ink">
          جلسه {booking.instrumentName} با {booking.counterpartName}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4.5 gap-y-2 text-sm text-ink-2">
          <span className="flex items-center gap-1.5">
            <CalendarIcon className="text-meta" />
            {formatJalaliDayMonth(booking.date)}
          </span>
          <span className="flex items-center gap-1.5">
            <ClockIcon className="text-meta" />
            {faDigits(booking.startTime)} تا {faDigits(booking.endTime)}
          </span>
          <span className="text-meta">
            {booking.type === "PACKAGE" ? "بسته ماهانه · ۴ جلسه" : typeLabel(booking.type)}
            {booking.sessionIndex ? ` · جلسه ${faNumber(booking.sessionIndex)} از ۴` : ""}
          </span>
          <span className="flex items-center gap-2 text-meta">
            <span className={`size-[5px] rounded-full ${dot}`} />
            {status.label}
          </span>
        </div>
      </div>
    </header>
  );
}

function SessionHeaderSkeleton() {
  return (
    <div className="mt-3 flex gap-5 border-b border-divider pb-10" aria-label="در حال بارگذاری پرونده جلسه">
      <Skeleton className="size-[54px] shrink-0 rounded-full" />
      <div className="flex-1">
        <Skeleton className="h-9 w-96 max-w-full" delay={1} />
        <div className="mt-3 flex gap-4">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-5 w-24" delay={1} />
          <Skeleton className="h-5 w-20" delay={2} />
        </div>
      </div>
    </div>
  );
}
