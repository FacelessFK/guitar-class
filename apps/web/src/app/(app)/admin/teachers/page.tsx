"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import { TeacherStatusBadge } from "@/components/teacher-status-badge";
import { errorMessage } from "@/lib/api-client";
import { getAdminTeachers, type AdminTeacher, type TeacherStatus } from "@/lib/app-api";
import { faNumber, formatJalaliDate } from "@/lib/format";

const FILTERS = [
  { value: undefined, label: "همه" },
  { value: "PENDING", label: "در انتظار" },
  { value: "APPROVED", label: "تأییدشده" },
  { value: "SUSPENDED", label: "معلق" },
] as const;

/**
 * `useSearchParams` باید داخل `<Suspense>` باشد وگرنه بیلد ایستا رد
 * می‌شود — کل صفحه به یک مرز تعلیق نیاز دارد، نه فقط خواننده‌ی پارامتر.
 */
export default function AdminTeachersPage() {
  return (
    <Suspense
      fallback={<p className="mx-auto max-w-5xl px-5 py-12 text-sm text-ink-muted">در حال بارگذاری…</p>}
    >
      <TeacherList />
    </Suspense>
  );
}

function TeacherList() {
  const searchParams = useSearchParams();
  const initial = searchParams.get("status");

  const [status, setStatus] = useState<TeacherStatus | undefined>(
    initial === "PENDING" || initial === "APPROVED" || initial === "SUSPENDED"
      ? initial
      : undefined,
  );
  const [teachers, setTeachers] = useState<AdminTeacher[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setTeachers(null);
    try {
      setTeachers(await getAdminTeachers(status));
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
      setTeachers([]);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <h1 className="text-2xl font-bold">استادها</h1>

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

      {teachers === null ? (
        <p className="mt-8 text-sm text-ink-muted">در حال بارگذاری…</p>
      ) : teachers.length === 0 ? (
        <p className="alert-info mt-8">استادی با این فیلتر پیدا نشد.</p>
      ) : (
        <ul className="mt-8 space-y-3">
          {teachers.map((teacher) => (
            <li key={teacher.profileId}>
              <Link href={`/admin/teachers/${teacher.profileId}`} className="card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">{teacher.fullName}</p>
                    <p className="mt-1 text-sm text-ink-muted">{teacher.headline}</p>
                  </div>
                  <TeacherStatusBadge status={teacher.status} />
                </div>

                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-muted">
                  <span dir="ltr">{teacher.phone}</span>
                  <span>کمیسیون {faNumber(Number(teacher.commissionRate))}٪</span>
                  <span>{faNumber(teacher.offeringCount)} سرویس</span>
                  <span>{formatJalaliDate(teacher.createdAt.slice(0, 10))}</span>
                </div>

                {/*
                  استادِ تأییدشده‌ی بدون سرویس در فهرست عمومی نمی‌آید و
                  هیچ‌جای دیگری این را نمی‌گوید. بدون این هشدار، تأیید
                  انجام می‌شود و همه منتظر می‌مانند چرا خبری نیست.
                */}
                {teacher.status === "APPROVED" && teacher.offeringCount === 0 ? (
                  <p className="mt-3 text-sm text-warning">
                    تأیید شده ولی سرویسی ندارد — هنوز در فهرست عمومی نمی‌آید.
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
