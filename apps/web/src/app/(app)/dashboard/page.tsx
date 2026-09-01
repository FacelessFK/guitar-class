"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { BookingCard } from "@/components/booking-card";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api-client";
import { getCredit, getMyBookings, type BookingDetail } from "@/lib/app-api";
import { LIVE_STATUSES } from "@/lib/booking-display";
import { formatToman } from "@/lib/format";
import { buildPaymentPlans, type PaymentPlan } from "@/lib/payment-plan";
import { useSession } from "@/lib/session";

/** Student dashboard. Dual-role teacher bookings are excluded at the boundary. */
export default function DashboardPage() {
  const { user, reload } = useSession();
  const [bookings, setBookings] = useState<BookingDetail[] | null>(null);
  const [credit, setCredit] = useState<bigint | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
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

  const refresh = useCallback(() => {
    void load();
    void reload();
  }, [load, reload]);

  const upcoming = useMemo(
    () =>
      (bookings ?? [])
        .filter((booking) => LIVE_STATUSES.includes(booking.status))
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
    [bookings],
  );
  const past = useMemo(
    () =>
      (bookings ?? [])
        .filter((booking) => !LIVE_STATUSES.includes(booking.status))
        .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt)),
    [bookings],
  );
  const paymentPlans = useMemo(() => buildPaymentPlans(bookings ?? []), [bookings]);
  const firstName = user?.fullName.trim().split(/\s+/)[0];
  const showAside = Boolean((user && !user.trialUsed) || (credit !== null && credit > 0n));

  return (
    <div className="mx-auto max-w-[1080px] px-4.5 pt-7 pb-19 md:px-6 md:pt-11 md:pb-24">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-5 md:mb-11">
        <div>
          <h1 className="text-[clamp(26px,3vw,34px)] font-semibold tracking-[-0.02em] text-ink">
            کلاس‌های من
          </h1>
          <p className="mt-2 text-[15px] text-ink-2">
            {firstName
              ? `سلام ${firstName}، اینجا برنامه کلاس‌ها و تمرین‌های توست.`
              : "اینجا برنامه کلاس‌ها و تمرین‌های توست."}
          </p>
        </div>
        <Link href="/dashboard/book" className="btn-primary w-full sm:w-auto">
          رزرو کلاس تازه
        </Link>
      </header>

      {error ? (
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <p className="alert-error flex-1">{error}</p>
          <button type="button" className="btn-quiet" onClick={() => void load()}>
            تلاش دوباره
          </button>
        </div>
      ) : null}

      {bookings === null && !error ? (
        <DashboardSkeleton showAside={showAside} />
      ) : bookings?.length === 0 ? (
        <div className="flex flex-wrap items-start gap-7 md:gap-9">
          <EmptyState />
          {showAside ? <DashboardAside userTrialUsed={user?.trialUsed} credit={credit} /> : null}
        </div>
      ) : bookings ? (
        <div className="flex flex-wrap items-start gap-7 md:gap-9">
          <main className="min-w-0 flex-[3_1_380px]">
            <BookingSection
              title="پیشِ رو"
              bookings={upcoming}
              plans={paymentPlans}
              credit={credit}
              onChange={refresh}
            />
            <BookingSection
              title="گذشته"
              bookings={past}
              plans={paymentPlans}
              credit={credit}
              onChange={refresh}
              compact
            />
          </main>
          {showAside ? <DashboardAside userTrialUsed={user?.trialUsed} credit={credit} /> : null}
        </div>
      ) : null}
    </div>
  );
}

type BookingEntry =
  | { kind: "BOOKING"; booking: BookingDetail }
  | { kind: "PACKAGE"; key: string; bookings: BookingDetail[] };

function groupPackageBookings(bookings: BookingDetail[]): BookingEntry[] {
  const result: BookingEntry[] = [];
  const seen = new Set<string>();

  for (const booking of bookings) {
    if (!booking.enrollmentId) {
      result.push({ kind: "BOOKING", booking });
      continue;
    }
    if (seen.has(booking.enrollmentId)) continue;
    seen.add(booking.enrollmentId);
    result.push({
      kind: "PACKAGE",
      key: booking.enrollmentId,
      bookings: bookings.filter((item) => item.enrollmentId === booking.enrollmentId),
    });
  }

  return result;
}

function BookingSection({
  title,
  bookings,
  plans,
  credit,
  onChange,
  compact = false,
}: {
  title: string;
  bookings: BookingDetail[];
  plans: Map<string, PaymentPlan>;
  credit: bigint | null;
  onChange: () => void;
  compact?: boolean;
}) {
  if (bookings.length === 0) return null;
  const entries = groupPackageBookings(bookings);

  return (
    <section className={title === "گذشته" ? "mt-10 md:mt-13" : ""}>
      <h2 className="mb-4 flex items-center gap-2.5 text-[13px] tracking-[0.08em] text-meta">
        <span className={`h-px w-5 ${title === "گذشته" ? "bg-divider" : "bg-violet"}`} />
        {title}
      </h2>
      <ul className="space-y-3">
        {entries.map((entry) =>
          entry.kind === "BOOKING" ? (
            <BookingCard
              key={entry.booking.id}
              booking={entry.booking}
              paymentPlan={plans.get(entry.booking.id)}
              creditBalance={credit}
              onChange={onChange}
              compact={compact}
            />
          ) : (
            <li
              key={entry.key}
              className="overflow-hidden rounded-panel shadow-[inset_0_0_0_1px_var(--color-divider)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 bg-surface-2 px-4 py-3 text-[13px] md:px-5">
                <span className="font-medium text-ink-2">بسته ماهانه · ۴ جلسه</span>
                <span className="text-meta">
                  {entry.bookings[0]?.instrumentName} با {entry.bookings[0]?.counterpartName}
                </span>
              </div>
              <ul className="space-y-px bg-divider">
                {entry.bookings.map((booking) => (
                  <BookingCard
                    key={booking.id}
                    booking={booking}
                    paymentPlan={plans.get(booking.id)}
                    creditBalance={credit}
                    onChange={onChange}
                    compact={compact}
                    grouped
                  />
                ))}
              </ul>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

function DashboardAside({
  userTrialUsed,
  credit,
}: {
  userTrialUsed?: boolean;
  credit: bigint | null;
}) {
  return (
    <aside className="flex min-w-0 flex-[1_1_100%] flex-col gap-3 min-[881px]:max-w-72 min-[881px]:flex-[0_1_288px]">
      {userTrialUsed === false ? (
        <div className="rounded-panel bg-violet-surface p-5 shadow-[inset_0_0_0_1px_var(--color-violet-border)]">
          <h2 className="text-[15px] font-semibold text-ink">جلسه معارفه رایگان</h2>
          <p className="mt-2.5 text-[13.5px] leading-[1.9] text-ink-2">
            هنوز از جلسه معارفه رایگان استفاده نکرده‌ای. ۲۰ دقیقه، بدون هزینه، برای آشنایی با استاد و سبک کارش.
          </p>
          <Link
            href="/dashboard/book?type=trial"
            className="btn-outline mt-4 w-full text-sm"
          >
            رزرو جلسه معارفه رایگان
          </Link>
        </div>
      ) : null}
      {credit !== null && credit > 0n ? (
        <div className="rounded-panel p-5 shadow-[inset_0_0_0_1px_var(--color-divider)]">
          <h2 className="flex items-center gap-2.5 text-[13px] text-meta">
            <span className="h-px w-4 bg-wood" />
            اعتبار حساب
          </h2>
          <p className="mt-2.5 text-xl font-semibold text-ink">{formatToman(credit)} تومان</p>
          <p className="mt-2 text-[13.5px] leading-[1.85] text-ink-2">
            در پرداخت کلاس بعدی می‌توانی از آن استفاده کنی.
          </p>
        </div>
      ) : null}
    </aside>
  );
}

function EmptyState() {
  return (
    <main className="min-w-0 flex-[3_1_380px] py-10 md:py-16">
      <div className="max-w-[44ch]">
        <span className="mb-5 block h-px w-11 bg-wood" />
        <h2 className="text-xl font-semibold text-ink">هنوز کلاسی رزرو نکرده‌ای.</h2>
        <p className="mt-3 text-[15px] leading-[1.9] text-ink-2">
          ساز و استادت را انتخاب کن و یک ساعت آزاد از برنامه‌اش بردار.
        </p>
        <Link href="/dashboard/book" className="btn-primary mt-5">
          شروع رزرو
        </Link>
      </div>
    </main>
  );
}

function DashboardSkeleton({ showAside }: { showAside: boolean }) {
  return (
    <div className="flex flex-wrap items-start gap-7 md:gap-9" aria-label="در حال بارگذاری کلاس‌ها">
      <main className="min-w-0 flex-[3_1_380px]">
        <Skeleton className="h-4 w-20" />
        <div className="mt-4 space-y-3">
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" delay={1} />
          <Skeleton className="h-44 w-full" delay={2} />
        </div>
      </main>
      {showAside ? (
        <aside className="min-w-0 flex-[1_1_100%] min-[881px]:max-w-72 min-[881px]:flex-[0_1_288px]">
          <Skeleton className="h-48 w-full" delay={1} />
        </aside>
      ) : null}
    </div>
  );
}
