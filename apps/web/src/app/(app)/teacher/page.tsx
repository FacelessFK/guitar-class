"use client";

import { useCallback, useEffect, useState } from "react";

import { BookingCard } from "@/components/booking-card";
import { errorMessage } from "@/lib/api-client";
import {
  getMyBookings,
  getTeacherProfile,
  type BookingDetail,
  type TeacherProfile,
} from "@/lib/app-api";
import { LIVE_STATUSES } from "@/lib/booking-display";
import { formatDuration, formatToman } from "@/lib/format";

/**
 * صفحه‌ی اصلی پنل استاد: کلاس‌هایی که قرار است تدریس کند.
 *
 * از همان `GET /bookings/me` می‌آید و با `role` فیلتر می‌شود. اندپوینت
 * جدا برای «رزروهای من به عنوان استاد» ساخته نشد چون همان داده است و
 * همان دسترسی؛ تفاوت فقط در این است که کدام طرفش را نشان می‌دهیم.
 */
export default function TeacherHomePage() {
  const [profile, setProfile] = useState<TeacherProfile | null>(null);
  const [bookings, setBookings] = useState<BookingDetail[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [nextProfile, allBookings] = await Promise.all([
        getTeacherProfile(),
        getMyBookings(),
      ]);
      setProfile(nextProfile);
      setBookings(allBookings.filter((booking) => booking.role === "TEACHER"));
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const upcoming = (bookings ?? [])
    .filter((booking) => LIVE_STATUSES.includes(booking.status))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  const past = (bookings ?? []).filter(
    (booking) => !LIVE_STATUSES.includes(booking.status),
  );

  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="font-display text-2xl leading-snug">پنل استاد</h1>

      {error ? <p className="alert-error mt-6">{error}</p> : null}

      {profile ? <ProfileSummary profile={profile} /> : null}

      {bookings === null ? (
        <p className="mt-8 text-sm text-ink-muted">در حال بارگذاری…</p>
      ) : bookings.length === 0 ? (
        <p className="alert-info mt-8">
          هنوز کسی کلاسی با شما رزرو نکرده است. مطمئن شوید در «برنامه‌ی من»
          ساعت‌های آزادتان را تعریف کرده‌اید — بدون آن هیچ ساعتی برای رزرو
          نمایش داده نمی‌شود.
        </p>
      ) : (
        <>
          <Section title="پیشِ رو" bookings={upcoming} onChange={load} />
          <Section title="گذشته" bookings={past} onChange={load} />
        </>
      )}
    </div>
  );
}

function ProfileSummary({ profile }: { profile: TeacherProfile }) {
  return (
    <section className="card mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="font-bold">{profile.headline}</h2>
        <StatusBadge status={profile.status} />
      </div>

      {profile.offerings.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">
          هنوز سرویسی برایتان تعریف نشده. قیمت و مدت کلاس را ادمین تنظیم می‌کند.
        </p>
      ) : (
        <ul className="mt-4 space-y-1 text-sm">
          {profile.offerings.map((offering) => (
            <li key={offering.id} className="flex justify-between gap-4">
              <span>{offering.instrumentName}</span>
              <span className="text-ink-muted">
                {formatToman(offering.price)} تومان ·{" "}
                {formatDuration(offering.durationMinutes)}
                {offering.isActive ? "" : " · غیرفعال"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * وضعیت تأیید.
 *
 * استادِ `PENDING` در فهرست عمومی نمی‌آید، پس هرچقدر هم برنامه تعریف
 * کند کسی نمی‌تواند رزرو کند. اگر این را نگوییم، استاد ساعت‌هایش را
 * پر می‌کند و منتظر می‌ماند تا بفهمد چرا خبری نیست.
 */
function StatusBadge({ status }: { status: TeacherProfile["status"] }) {
  switch (status) {
    case "APPROVED":
      return <span className="badge badge-ok">تأییدشده</span>;
    case "PENDING":
      return (
        <span className="badge badge-wait">
          در انتظار تأیید — تا تأیید نشوید در فهرست عمومی نمی‌آیید
        </span>
      );
    case "SUSPENDED":
      return <span className="badge badge-off">معلق</span>;
  }
}

function Section({
  title,
  bookings,
  onChange,
}: {
  title: string;
  bookings: BookingDetail[];
  onChange: () => void;
}) {
  if (bookings.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="text-lg font-bold">{title}</h2>
      <ul className="mt-4 space-y-4">
        {bookings.map((booking) => (
          <BookingCard key={booking.id} booking={booking} onChange={onChange} />
        ))}
      </ul>
    </section>
  );
}
