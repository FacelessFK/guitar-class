"use client";

import { useCallback, useEffect, useState } from "react";

import { Pager } from "@/components/pager";
import { errorMessage } from "@/lib/api-client";
import {
  ADMIN_PAGE_SIZE,
  getAdminReviews,
  resolveReview,
  type AdminPage,
  type AdminReview,
  type SessionReviewStatus,
} from "@/lib/app-api";
import { formatJalaliDayMonth, formatTehranTime, formatToman } from "@/lib/format";

/**
 * صف بررسی جلسه‌های برگزارنشده.
 *
 * تا پیش از این، «بررسی ادمین» یعنی فیلتر کردن `NO_SHOW_TEACHER` در
 * صفحه‌ی رزروها — فهرستی که هیچ‌وقت کوتاه نمی‌شد چون راهی برای گفتن
 * «این یکی رسیدگی شد» نداشت. اینجا هر سطر یک کارِ مانده است و بستنش
 * از فهرست بیرونش می‌برد.
 *
 * قدیمی‌ترین اول می‌آید، برعکس بقیه‌ی فهرست‌های پنل: در صف، آنچه بیشتر
 * منتظر مانده مهم‌تر است، نه تازه‌ترین.
 */

const REASON_LABEL: Record<AdminReview["reason"], string> = {
  NO_SHOW_TEACHER: "استاد حاضر نشد",
  NO_SHOW: "هیچ‌کدام حاضر نشدند",
  ATTENDANCE_UNVERIFIED: "حضور تأیید نشد — بازپرداخت نشده",
};

/**
 * سه دلیل، دو معنی متفاوت برای کسی که رسیدگی می‌کند.
 *
 * دو تای اول یعنی «تصمیم گرفته شده، پیگیری کن». سومی یعنی «تصمیمی
 * گرفته نشده و پول دست‌نخورده مانده تا تو تصمیم بگیری» — و چون تنها
 * حالتی است که هنوز کاری با پول نشده، باید در فهرست هم متفاوت دیده
 * شود.
 */
const REASON_BADGE: Record<AdminReview["reason"], string> = {
  NO_SHOW_TEACHER: "badge badge-off",
  NO_SHOW: "badge badge-wait",
  ATTENDANCE_UNVERIFIED: "badge badge-wait",
};

const TABS: Array<{ label: string; value: SessionReviewStatus }> = [
  { label: "در انتظار رسیدگی", value: "OPEN" },
  { label: "رسیدگی‌شده", value: "RESOLVED" },
];

export default function AdminReviewsPage() {
  const [status, setStatus] = useState<SessionReviewStatus>("OPEN");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<AdminPage<AdminReview> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPage(null);
    try {
      setPage(await getAdminReviews({ status, offset, limit: ADMIN_PAGE_SIZE }));
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
      setPage({ rows: [], total: 0, limit: ADMIN_PAGE_SIZE, offset: 0 });
    }
  }, [status, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  /** جابه‌جایی بین «مانده» و «رسیدگی‌شده» صفحه را به اول برمی‌گرداند. */
  function changeStatus(value: SessionReviewStatus) {
    setStatus(value);
    setOffset(0);
  }

  const reviews = page?.rows ?? null;

  async function resolve(review: AdminReview) {
    const note = window.prompt(
      `چه کاری برای این جلسه انجام شد؟ (اختیاری)\n${review.instrumentName} — ${review.teacherName} ← ${review.studentName}`,
      "",
    );

    // انصراف از پنجره یعنی هیچ، ولی خالی گذاشتنش یعنی «رسیدگی شد،
    // حرفی برای نوشتن نبود» — این دو یکی نیستند
    if (note === null) return;

    setBusyId(review.id);
    setError(null);
    try {
      await resolveReview(review.id, note.trim() || undefined);
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-12">
      <h1 className="font-display text-2xl leading-snug">صف بررسی</h1>
      <p className="mt-3 text-sm text-ink-muted">
        جلسه‌هایی که برگزار نشدند. هزینه‌ی «استاد حاضر نشد» خودکار به هنرجو
        برگشته است؛ آنچه اینجا می‌ماند تصمیم درباره‌ی خودِ استاد است.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => changeStatus(tab.value)}
            className={
              status === tab.value
                ? "rounded-full bg-accent px-4 py-1.5 text-sm text-accent-ink"
                : "rounded-full border border-border px-4 py-1.5 text-sm text-ink-muted"
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error ? <p className="alert-error mt-6">{error}</p> : null}

      {reviews === null ? (
        <p className="mt-8 text-sm text-ink-muted">در حال بارگذاری…</p>
      ) : reviews.length === 0 ? (
        <p className="alert-info mt-8">
          {status === "OPEN"
            ? "چیزی برای رسیدگی نمانده است."
            : "هنوز پرونده‌ای رسیدگی نشده است."}
        </p>
      ) : (
        <ul className="mt-8 space-y-3">
          {reviews.map((review) => (
            <li key={review.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {formatJalaliDayMonth(review.scheduledAt.slice(0, 10))} ساعت{" "}
                    {formatTehranTime(review.scheduledAt)}
                  </p>
                  <p className="mt-1 text-sm text-ink-muted">
                    {review.instrumentName} · {review.teacherName} ←{" "}
                    {review.studentName}
                  </p>
                </div>
                <span className={REASON_BADGE[review.reason]}>
                  {REASON_LABEL[review.reason]}
                </span>
              </div>

              {/*
                شماره‌ی هر دو طرف اینجاست چون رسیدگی در عمل یک تماس
                تلفنی است، و رفتن به پرونده‌ی استاد برای برداشتن شماره،
                همان کاری است که این صفحه قرار بود حذفش کند.
              */}
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-muted">
                <span>{formatToman(review.price)} تومان</span>
                <span dir="ltr">استاد: {review.teacherPhone}</span>
                <span dir="ltr">هنرجو: {review.studentPhone}</span>
              </div>

              {review.status === "OPEN" ? (
                <button
                  type="button"
                  onClick={() => void resolve(review)}
                  disabled={busyId === review.id}
                  className="btn-primary mt-4"
                >
                  {busyId === review.id ? "در حال ثبت…" : "رسیدگی شد"}
                </button>
              ) : (
                <p className="mt-4 text-sm text-ink-muted">
                  {review.resolvedByName ? `${review.resolvedByName}: ` : null}
                  {review.resolution ?? "بدون یادداشت"}
                  {review.resolvedAt ? (
                    <span className="text-xs">
                      {" "}
                      ({formatJalaliDayMonth(review.resolvedAt.slice(0, 10))})
                    </span>
                  ) : null}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {page ? (
        <Pager
          total={page.total}
          limit={page.limit}
          offset={page.offset}
          busy={busyId !== null}
          onChange={setOffset}
        />
      ) : null}
    </div>
  );
}
