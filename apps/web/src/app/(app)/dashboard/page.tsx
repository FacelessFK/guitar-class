"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { BookingCard } from "@/components/booking-card";
import { errorMessage } from "@/lib/api-client";
import { getCredit, getMyBookings, type BookingDetail } from "@/lib/app-api";
import { formatToman } from "@/lib/format";
import { LIVE_STATUSES } from "@/lib/booking-display";
import { buildPaymentPlans, type PaymentPlan } from "@/lib/payment-plan";
import { useSession } from "@/lib/session";

/**
 * کلاس‌های من.
 *
 * `GET /bookings/me` برای حساب دو‌نقشی هر دو جهت را برمی‌گرداند، اما
 * این مسیر دنیای هنرجوست و فقط رزروهای نقش `STUDENT` را نمایش می‌دهد.
 * پنل استاد بعداً همان قرارداد را با نقش `TEACHER` مصرف می‌کند.
 */
export default function DashboardPage() {
  const { user, reload } = useSession();
  const [bookings, setBookings] = useState<BookingDetail[] | null>(null);
  const [credit, setCredit] = useState<bigint | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      /**
       * موجودی اعتبار کنار فهرست خوانده می‌شود، نه داخل هر کارت.
       *
       * چند کارتِ در انتظار پرداخت یعنی چند بار پرسیدنِ همان عدد. خطای
       * خواندن اعتبار هم فهرست را نمی‌خواباند: بدون آن هنوز می‌شود
       * پرداخت کرد، فقط تیک استفاده از اعتبار نمی‌آید.
       */
      const [loaded, balance] = await Promise.all([
        getMyBookings(),
        getCredit().catch(() => null),
      ]);

      setBookings(loaded.filter((booking) => booking.role === "STUDENT"));
      setCredit(balance ? BigInt(balance.balance) : null);
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

      {/*
        موجودی اعتبار فقط وقتی گفته می‌شود که وجود دارد.

        «اعتبار شما: ۰ تومان» برای کسی که هیچ‌وقت لغوی نداشته، سؤال
        می‌سازد نه اطلاعات.
      */}
      {credit !== null && credit > 0n ? (
        <p className="alert-info mt-6">
          {formatToman(credit.toString())} تومان اعتبار دارید. در پرداخت کلاس
          بعدی می‌توانید خرجش کنید.
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
            credit={credit}
            onChange={refresh}
          />
          <Section
            title="گذشته"
            bookings={past}
            plans={paymentPlans}
            credit={credit}
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
  credit,
  onChange,
}: {
  title: string;
  bookings: BookingDetail[];
  plans: Map<string, PaymentPlan>;
  credit: bigint | null;
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
            creditBalance={credit}
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
