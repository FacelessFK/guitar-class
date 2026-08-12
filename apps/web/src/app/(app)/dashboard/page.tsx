"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { BookingCard } from "@/components/booking-card";
import { errorMessage } from "@/lib/api-client";
import { getMyBookings, type BookingDetail } from "@/lib/app-api";
import { LIVE_STATUSES } from "@/lib/booking-display";
import { buildPaymentPlans, type PaymentPlan } from "@/lib/payment-plan";
import { useSession } from "@/lib/session";

/**
 * کلاس‌های من.
 *
 * یک فهرست برای هر دو نقش است: `GET /bookings/me` هم رزروهایی را
 * می‌دهد که کاربر هنرجویشان است و هم آن‌هایی که استادشان است، و هر
 * کارت خودش می‌گوید کدام است. کسی که هم استاد است و هم هنرجو، همه‌ی
 * کلاس‌هایش را یک‌جا می‌بیند به‌جای اینکه بین دو صفحه بگردد.
 */
export default function DashboardPage() {
  const { user, reload } = useSession();
  const [bookings, setBookings] = useState<BookingDetail[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setBookings(await getMyBookings());
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * بعد از هر تغییر، هم فهرست و هم پروفایل تازه می‌شوند.
   *
   * پروفایل هم لازم است چون رزرو جلسه‌ی معارفه `trialUsed` را عوض
   * می‌کند و بدون تازه‌سازی، صفحه‌ی رزرو باز هم «معارفه‌ی رایگان» را
   * پیشنهاد می‌دهد و کاربر خطای ۴۰۹ می‌گیرد.
   */
  const refresh = useCallback(() => {
    void load();
    void reload();
  }, [load, reload]);

  const upcoming = (bookings ?? [])
    .filter((booking) => LIVE_STATUSES.includes(booking.status))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  const past = (bookings ?? []).filter(
    (booking) => !LIVE_STATUSES.includes(booking.status),
  );

  // پکیج چهار رزرو است ولی یک پرداخت؛ تصمیمِ «کدام کارت دکمه دارد» یک
  // جا گرفته می‌شود، نه داخل تک‌تک کارت‌ها
  const paymentPlans = buildPaymentPlans(bookings ?? []);

  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">کلاس‌های من</h1>
        <Link href="/dashboard/book" className="btn-primary">
          رزرو کلاس تازه
        </Link>
      </div>

      {user && !user.trialUsed ? (
        <p className="alert-info mt-6">
          هنوز از جلسه‌ی معارفه‌ی رایگان استفاده نکرده‌اید. بیست دقیقه، بدون
          هزینه، برای آشنایی با استاد و سبک کارش.
        </p>
      ) : null}

      {error ? <p className="alert-error mt-6">{error}</p> : null}

      {bookings === null ? (
        <p className="mt-8 text-sm text-ink-muted">در حال بارگذاری…</p>
      ) : bookings.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <Section
            title="پیشِ رو"
            bookings={upcoming}
            plans={paymentPlans}
            onChange={refresh}
          />
          <Section
            title="گذشته"
            bookings={past}
            plans={paymentPlans}
            onChange={refresh}
          />
        </>
      )}
    </div>
  );
}

function Section({
  title,
  bookings,
  plans,
  onChange,
}: {
  title: string;
  bookings: BookingDetail[];
  plans: Map<string, PaymentPlan>;
  onChange: () => void;
}) {
  if (bookings.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="text-lg font-bold">{title}</h2>
      <ul className="mt-4 space-y-4">
        {bookings.map((booking) => (
          <BookingCard
            key={booking.id}
            booking={booking}
            paymentPlan={plans.get(booking.id)}
            onChange={onChange}
          />
        ))}
      </ul>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="card mt-8 text-center">
      <p>هنوز کلاسی رزرو نکرده‌اید.</p>
      <p className="mt-2 text-sm text-ink-muted">
        ساز و استادتان را انتخاب کنید و یک ساعت آزاد از برنامه‌اش بردارید.
      </p>
      <Link href="/dashboard/book" className="btn-primary mt-6">
        شروع رزرو
      </Link>
    </div>
  );
}
