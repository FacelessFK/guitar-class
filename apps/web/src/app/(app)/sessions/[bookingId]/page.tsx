"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { SessionLearning } from "@/components/session-learning";
import { errorMessage } from "@/lib/api-client";
import { getBooking, type BookingDetail } from "@/lib/app-api";
import { statusDisplay, typeLabel } from "@/lib/booking-display";
import {
  formatJalaliDayMonth,
  formatTehranTime,
} from "@/lib/format";

/**
 * پرونده‌ی یک جلسه — همان جایی که حلقه‌ی یادگیری زندگی می‌کند.
 *
 * جدا از `/room/[bookingId]` است و باید هم باشد: آن یکی لایوت خودش را
 * دارد و کل صفحه را به تماس ویدیویی می‌دهد. این یکی بعد از کلاس باز
 * می‌شود و هفته‌ها بعد هم مرجع می‌ماند.
 *
 * شناسه‌ی جلسه در آدرس است تا استاد و هنرجو بتوانند بوکمارکش کنند؛
 * دسترسی را API از روی خود رزرو بررسی می‌کند و کسی که طرف جلسه نیست
 * ۴۰۳ می‌گیرد.
 */
export default function SessionPage() {
  const params = useParams<{ bookingId: string }>();
  const bookingId = params.bookingId;

  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBooking(bookingId)
      .then(setBooking)
      .catch((caught: unknown) => setError(errorMessage(caught)));
  }, [bookingId]);

  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <Link href="/dashboard" className="text-sm text-ink-muted">
        ← کلاس‌های من
      </Link>

      {error ? <p className="alert-error mt-6">{error}</p> : null}

      {booking ? (
        <header className="mt-4">
          <h1 className="font-display text-2xl leading-snug">
            {booking.instrumentName} با {booking.counterpartName}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            {typeLabel(booking.type)} ·{" "}
            {formatJalaliDayMonth(booking.date)} ساعت{" "}
            {formatTehranTime(booking.scheduledAt)}
          </p>
          <span
            className={`badge ${statusDisplay(booking.status, booking.role).tone} mt-3 inline-block`}
          >
            {statusDisplay(booking.status, booking.role).label}
          </span>
        </header>
      ) : null}

      <div className="mt-10">
        <SessionLearning bookingId={bookingId} />
      </div>
    </div>
  );
}
