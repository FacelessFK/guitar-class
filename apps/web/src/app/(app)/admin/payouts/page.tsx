"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { errorMessage } from "@/lib/api-client";
import { getAdminPayouts, markPayoutPaid, type AdminPayout } from "@/lib/app-api";
import { formatJalaliDate, formatToman } from "@/lib/format";

/**
 * تسویه‌ها.
 *
 * ثبت تسویه اینجا نیست بلکه در پرونده‌ی هر استاد است، چون بدون دیدنِ
 * مانده‌ی همان استاد، عددی که وارد می‌شود از هوا می‌آید. اینجا فهرست و
 * قطعی کردن است.
 *
 * «پرداخت شد» برگشت‌ناپذیر است: همان لحظه یک سطر منفی در دفتر کل
 * می‌نشیند و دفتر کل هرگز ویرایش نمی‌شود. برای همین تأیید می‌گیرد.
 */
export default function AdminPayoutsPage() {
  const [payouts, setPayouts] = useState<AdminPayout[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setPayouts(await getAdminPayouts());
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
      setPayouts([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirmPaid(payout: AdminPayout) {
    const tracking = window.prompt(
      `کد رهگیری انتقال وجه به ${payout.teacherName} (اختیاری).\n` +
        "با تأیید، این مبلغ به‌عنوان پرداخت‌شده در دفتر کل ثبت می‌شود و برگشت‌پذیر نیست.",
      "",
    );

    if (tracking === null) return;

    setBusy(true);
    setError(null);
    try {
      await markPayoutPaid(payout.id, tracking.trim() || undefined);
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-12">
      <h1 className="text-2xl font-bold">تسویه</h1>
      <p className="mt-3 text-sm text-ink-muted">
        تسویه در این فاز دستی است. مبلغ را بیرون از سیستم منتقل کنید و بعد
        اینجا «پرداخت شد» بزنید. ثبت تسویه‌ی تازه از{" "}
        <Link href="/admin/teachers" className="text-accent underline">
          پرونده‌ی استاد
        </Link>{" "}
        انجام می‌شود، جایی که مانده‌اش دیده می‌شود.
      </p>

      {error ? <p className="alert-error mt-6">{error}</p> : null}

      {payouts === null ? (
        <p className="mt-8 text-sm text-ink-muted">در حال بارگذاری…</p>
      ) : payouts.length === 0 ? (
        <p className="alert-info mt-8">هنوز تسویه‌ای ثبت نشده است.</p>
      ) : (
        <ul className="mt-8 space-y-2">
          {payouts.map((payout) => (
            <li
              key={payout.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium">
                  {formatToman(payout.amount)} تومان · {payout.teacherName}
                </p>
                <p className="mt-1 text-ink-muted">
                  {formatJalaliDate(payout.periodStart)} تا{" "}
                  {formatJalaliDate(payout.periodEnd)}
                  {payout.trackingCode ? (
                    <>
                      {" · کد رهگیری "}
                      <span dir="ltr">{payout.trackingCode}</span>
                    </>
                  ) : null}
                </p>
                {payout.note ? (
                  <p className="mt-1 text-ink-muted">{payout.note}</p>
                ) : null}
              </div>

              {payout.status === "PAID" ? (
                <span className="badge badge-ok">
                  پرداخت شد
                  {payout.paidAt
                    ? ` · ${formatJalaliDate(payout.paidAt.slice(0, 10))}`
                    : ""}
                </span>
              ) : (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy}
                  onClick={() => void confirmPaid(payout)}
                >
                  پرداخت شد
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
