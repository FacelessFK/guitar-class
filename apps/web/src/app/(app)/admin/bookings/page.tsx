"use client";

import { useCallback, useEffect, useState } from "react";

import { errorMessage } from "@/lib/api-client";
import { getAdminBookings, type AdminBooking } from "@/lib/app-api";
import { statusLabel } from "@/lib/booking-display";
import { formatJalaliDayMonth, formatTehranTime, formatToman } from "@/lib/format";

/**
 * رزروها.
 *
 * فیلترها گروهی‌اند نه تک‌وضعیتی: ادمین معمولاً «همه‌ی حالت‌های عدم
 * حضور» یا «همه‌ی لغوها» را با هم می‌خواهد، و سه بار عوض کردن فیلتر
 * برای چیزی که یک نگاه است، همان کاری است که `db:studio` می‌کرد.
 */
const FILTERS = [
  { label: "همه", value: undefined },
  { label: "پیشِ رو", value: "CONFIRMED" },
  { label: "در انتظار پرداخت", value: "PENDING_PAYMENT" },
  { label: "برگزارشده", value: "COMPLETED" },
  { label: "عدم حضور", value: "NO_SHOW,NO_SHOW_STUDENT,NO_SHOW_TEACHER" },
  { label: "لغوشده", value: "CANCELLED_BY_STUDENT,CANCELLED_BY_TEACHER" },
] as const;

export default function AdminBookingsPage() {
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [bookings, setBookings] = useState<AdminBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBookings(null);
    try {
      setBookings(await getAdminBookings({ status }));
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
      setBookings([]);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <h1 className="text-2xl font-bold">رزروها</h1>

      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <button
            key={filter.label}
            type="button"
            onClick={() => setStatus(filter.value)}
            className={
              status === filter.value
                ? "rounded-full bg-accent px-4 py-1.5 text-sm text-accent-ink"
                : "rounded-full border border-border px-4 py-1.5 text-sm text-ink-muted"
            }
          >
            {filter.label}
          </button>
        ))}
      </div>

      {error ? <p className="alert-error mt-6">{error}</p> : null}

      {bookings === null ? (
        <p className="mt-8 text-sm text-ink-muted">در حال بارگذاری…</p>
      ) : bookings.length === 0 ? (
        <p className="alert-info mt-8">رزروی با این فیلتر پیدا نشد.</p>
      ) : (
        <ul className="mt-8 space-y-3">
          {bookings.map((booking) => (
            <li key={booking.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {formatJalaliDayMonth(booking.scheduledAt.slice(0, 10))} ساعت{" "}
                    {formatTehranTime(booking.scheduledAt)}
                  </p>
                  <p className="mt-1 text-sm text-ink-muted">
                    {booking.instrumentName} · {booking.teacherName} ←{" "}
                    {booking.studentName}
                  </p>
                </div>
                <span className="badge badge-neutral">{statusLabel(booking.status)}</span>
              </div>

              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-muted">
                <span>{formatToman(booking.price)} تومان</span>
                <span dir="ltr">{booking.studentPhone}</span>
                {booking.sessionIndex ? (
                  <span>جلسه‌ی {booking.sessionIndex} از پکیج</span>
                ) : null}

                {/*
                  حضور هر طرف جدا نشان داده می‌شود چون سه حالت از چهار
                  حالتِ عدم حضور دقیقاً به همین تفکیک بند است، و رسیدگی
                  به اختلاف بدون آن ممکن نیست.
                */}
                <span>
                  ورود استاد: {booking.teacherJoinedAt ? "✓" : "—"} · ورود هنرجو:{" "}
                  {booking.studentJoinedAt ? "✓" : "—"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
