"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { BookingCard } from "@/components/booking-card";
import { EmptyState, InlineNotice, SectionMark, Skeleton } from "@/components/ui";
import { errorMessage } from "@/lib/api-client";
import {
  getMyBookings,
  getTeacherProfile,
  type BookingDetail,
  type TeacherProfile,
} from "@/lib/app-api";
import { faNumber, formatDuration, formatToman } from "@/lib/format";
import { useSession } from "@/lib/session";
import { splitTeacherBookings } from "@/lib/teacher-dashboard";

/** داشبورد دنیای استاد؛ نقش هر رزرو در مرز همین صفحه بررسی می‌شود. */
export default function TeacherHomePage() {
  const { user } = useSession();
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
      setBookings(allBookings);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const teacherBookings = useMemo(
    () => splitTeacherBookings(bookings ?? []),
    [bookings],
  );
  const nextBooking = teacherBookings.upcoming[0] ?? null;
  const laterBookings = teacherBookings.upcoming.slice(1);
  const teacherBookingCount =
    teacherBookings.upcoming.length + teacherBookings.past.length;
  const firstName = user?.fullName.trim().split(/\s+/)[0];

  return (
    <div className="mx-auto max-w-[1080px] px-4.5 pt-7 pb-19 md:px-6 md:pt-11 md:pb-24">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <SectionMark tone="wood">{firstName ? `سلام ${firstName}` : "پنل استاد"}</SectionMark>
          <h1 className="mt-3.5 text-[clamp(26px,3vw,34px)] font-semibold tracking-[-0.02em] text-ink">
            پنل استاد
          </h1>
          <p className="mt-2 text-[15px] text-ink-2">
            کلاس‌ها و کارهای تدریست را اینجا ببین.
          </p>
          {bookings ? (
            <p className="mt-2 text-[13.5px] text-meta">
              {teacherBookings.upcoming.length > 0
                ? `${faNumber(teacherBookings.upcoming.length)} کلاس پیشِ رو داری.`
                : teacherBookingCount > 0
                  ? "فعلاً کلاس پیشِ رویی نداری."
                  : "هنوز کلاسی برای تدریس ثبت نشده است."}
            </p>
          ) : null}
        </div>
        <Link href="/teacher/availability" className="btn-quiet w-full sm:w-auto">
          مدیریت زمان‌های تدریس
        </Link>
      </header>

      {error ? (
        <div className="mt-7 flex flex-wrap items-center gap-4">
          <p className="alert-error flex-1">{error}</p>
          <button type="button" className="btn-quiet" onClick={() => void load()}>
            تلاش دوباره
          </button>
        </div>
      ) : null}

      {(!profile || !bookings) && !error ? (
        <TeacherDashboardSkeleton />
      ) : profile && bookings ? (
        <>
          <ProfileStatus profile={profile} />

          {nextBooking ? (
            <section className="mt-8 md:mt-10">
              <SectionMark tone="violet" className="mb-3.5">
                کلاس بعدی
              </SectionMark>
              <ul>
                <BookingCard booking={nextBooking} onChange={load} />
              </ul>
            </section>
          ) : teacherBookingCount === 0 ? (
            <section className="mt-10 py-6 md:mt-12 md:py-10">
              <EmptyState
                title="هنوز کلاسی برای تدریس نداری."
                action={
                  <Link href="/teacher/availability" className="btn-outline">
                    تنظیم برنامه هفتگی
                  </Link>
                }
              >
                تا زمانی که ساعت تدریس تعریف نکنی، هنرجوها زمانی برای رزرو
                نمی‌بینند.
              </EmptyState>
            </section>
          ) : (
            <section className="mt-9">
              <EmptyState
                quiet
                title="فعلاً کلاس پیشِ رویی نداری."
                action={
                  <Link href="/teacher/availability" className="btn-ghost">
                    برنامه زمان‌های تدریس را بررسی کن ←
                  </Link>
                }
              />
            </section>
          )}

          {laterBookings.length > 0 ? (
            <BookingSection
              title="پیشِ رو"
              bookings={laterBookings}
              onChange={load}
            />
          ) : null}

          {teacherBookings.past.length > 0 ? (
            <BookingSection
              title="گذشته"
              bookings={teacherBookings.past}
              onChange={load}
              compact
            />
          ) : null}

          <OfferingsSummary profile={profile} />
        </>
      ) : null}
    </div>
  );
}

function ProfileStatus({ profile }: { profile: TeacherProfile }) {
  const activeOfferings = profile.offerings.filter((offering) => offering.isActive);
  const status = {
    APPROVED: {
      title:
        activeOfferings.length > 0
          ? "پروفایل مدرس فعال است"
          : "پروفایل تأیید شده، اما سرویس فعالی ندارد",
      body:
        activeOfferings.length > 0
          ? "هنرجوها می‌توانند پروفایل تو را ببینند و کلاس رزرو کنند."
          : "تا زمانی که ادمین سرویسی فعال نکند، زمان‌های تو برای رزرو عمومی نمایش داده نمی‌شوند.",
      edge: "border-ok",
      dot: "bg-ok",
      text: "text-ok",
    },
    PENDING: {
      title: "پروفایل در انتظار تأیید است",
      body: "تا پایان بررسی، پروفایل تو در فهرست عمومی نیست و هنرجوها نمی‌توانند رزرو کنند.",
      edge: "border-wood",
      dot: "bg-wood-light",
      text: "text-wood-light",
    },
    SUSPENDED: {
      title: "پروفایل مدرس معلق است",
      body: "پروفایل عمومی و رزروهای تازه متوقف شده‌اند. برای پیگیری با پشتیبانی تماس بگیر.",
      edge: "border-error",
      dot: "bg-error",
      text: "text-error",
    },
  }[profile.status];

  return (
    <section className={`mt-7 border-s ${status.edge} ps-3.5 md:mt-9`}>
      <div className="flex items-center gap-2.5 text-[15px] text-ink">
        <span className={`size-1.75 rounded-full ${status.dot}`} />
        <span>{status.title}</span>
      </div>
      <p className="mt-1.5 max-w-[72ch] text-[13.5px] leading-[1.9] text-meta">
        {status.body}
      </p>
      <Link href="/teacher/profile" className={`mt-1 inline-flex min-h-11 items-center text-[13.5px] ${status.text}`}>
        دیدن جزئیات پروفایل ←
      </Link>
    </section>
  );
}

function BookingSection({
  title,
  bookings,
  onChange,
  compact = false,
}: {
  title: string;
  bookings: BookingDetail[];
  onChange: () => void;
  compact?: boolean;
}) {
  return (
    <section className="mt-10 md:mt-12">
      <SectionMark tone={compact ? "divider" : "wood"} className="mb-3.5">
        {title}
      </SectionMark>
      <ul className="space-y-3">
        {bookings.map((booking) => (
          <BookingCard
            key={booking.id}
            booking={booking}
            onChange={onChange}
            compact={compact}
          />
        ))}
      </ul>
    </section>
  );
}

function OfferingsSummary({ profile }: { profile: TeacherProfile }) {
  return (
    <section className="rule-top mt-11 pt-7 md:mt-13 md:pt-8">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <h2 className="text-[15px] text-ink">سرویس‌های تدریس</h2>
          <p className="mt-1 text-[13.5px] text-meta">
            قیمت و مدت را ادمین تنظیم می‌کند.
          </p>
        </div>
        <Link href="/teacher/profile" className="inline-flex min-h-11 items-center text-[13.5px]">
          مدیریت پروفایل ←
        </Link>
      </div>
      {profile.offerings.length === 0 ? (
        <InlineNotice tone="wood" className="mt-4 max-w-[64ch]">
          هنوز سرویسی برایت تعریف نشده است؛ حتی با پروفایل تأییدشده، بدون
          سرویس فعال در فهرست عمومی دیده نمی‌شوی.
        </InlineNotice>
      ) : (
        <ul className="mt-3">
          {profile.offerings.map((offering) => (
            <li
              key={offering.id}
              className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1 border-b border-divider/70 px-1 py-3.5 text-sm"
            >
              <span className="text-ink-2">{offering.instrumentName}</span>
              <span className="text-meta">
                {formatToman(offering.price)} تومان · {formatDuration(offering.durationMinutes)}
                {offering.isActive ? "" : " · غیرفعال"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TeacherDashboardSkeleton() {
  return (
    <div className="mt-9" aria-label="در حال بارگذاری پنل استاد">
      <div className="border-s border-divider ps-3.5">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-2.5 h-3.5 w-full max-w-md" delay={1} />
      </div>
      <div className="mt-9">
        <Skeleton className="mb-4 h-3.5 w-24" />
        <div className="card-app overflow-hidden">
          <div className="flex flex-wrap">
            <div className="min-w-0 flex-[3_1_300px] p-5.5">
              <Skeleton className="h-6 w-52" />
              <Skeleton className="mt-4 h-4 w-full max-w-sm" delay={1} />
            </div>
            <div className="min-h-32 flex-[1_1_236px] border-t border-divider bg-surface-2/70 p-5 md:border-t-0">
              <Skeleton className="h-4 w-28" delay={2} />
              <Skeleton className="mt-5 h-11 w-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
