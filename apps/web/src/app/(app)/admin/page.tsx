"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { errorMessage } from "@/lib/api-client";
import { getAdminOverview, type AdminOverview } from "@/lib/app-api";
import { faNumber, formatToman } from "@/lib/format";

/**
 * صفحه‌ی اول پنل ادمین.
 *
 * «استاد در انتظار تأیید» اول می‌آید و لینک است، چون تنها کاری است که
 * اگر انجام نشود کسی نمی‌تواند چیزی بفروشد. بقیه گزارش‌اند.
 */
export default function AdminHomePage() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAdminOverview()
      .then(setOverview)
      .catch((caught: unknown) => setError(errorMessage(caught)));
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <h1 className="text-2xl font-bold">نمای کلی</h1>

      {error ? <p className="alert-error mt-6">{error}</p> : null}

      {overview === null ? (
        <p className="mt-8 text-sm text-ink-muted">در حال بارگذاری…</p>
      ) : (
        <>
          {overview.pendingTeachers > 0 ? (
            <Link href="/admin/teachers?status=PENDING" className="alert-info mt-6 block">
              {faNumber(overview.pendingTeachers)} درخواست استاد در انتظار بررسی است.
            </Link>
          ) : null}

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Stat label="استاد در انتظار" value={faNumber(overview.pendingTeachers)} />
            <Stat label="استاد تأییدشده" value={faNumber(overview.approvedTeachers)} />
            <Stat label="ساز فعال" value={faNumber(overview.activeInstruments)} />
            <Stat label="کلاس پیشِ رو" value={faNumber(overview.upcomingBookings)} />
            <Stat label="تسویه‌ی در انتظار" value={faNumber(overview.pendingPayouts)} />
            <Stat
              label="بدهی به استادها"
              value={`${formatToman(overview.outstandingTotal)} تومان`}
              hint="جمع مانده‌ی همه‌ی استادها پس از کسر تسویه‌های پرداخت‌شده"
            />
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="card">
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="mt-2 text-xl font-bold">{value}</p>
      {hint ? <p className="mt-2 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}
