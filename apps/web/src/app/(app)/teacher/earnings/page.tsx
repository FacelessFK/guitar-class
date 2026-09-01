"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  ChevronDownIcon,
  EmptyState,
  InlineNotice,
  SectionMark,
  Skeleton,
} from "@/components/ui";
import { errorMessage } from "@/lib/api-client";
import { getEarnings, type Earnings } from "@/lib/app-api";
import { formatLedgerToman, ledgerTypeLabel } from "@/lib/earnings-presentation";
import { formatTehranJalaliDate } from "@/lib/format";

export default function EarningsPage() {
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setEarnings(await getEarnings());
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const hasAccountActivity = earnings
    ? earnings.entries.length > 0 ||
      [earnings.gross, earnings.commission, earnings.paidOut, earnings.outstanding].some(
        (amount) => BigInt(amount) !== 0n,
      )
    : false;

  return (
    <div className="mx-auto max-w-[1000px] px-4.5 pt-6 pb-19 md:px-6 md:pt-9 md:pb-26">
      <div className="flex items-center gap-2 text-[13px] text-meta">
        <Link href="/teacher" className="text-meta hover:text-ink">پنل استاد</Link>
        <span>←</span>
        <span className="text-ink-2">درآمدها</span>
      </div>

      <header className="mt-4.5">
        <h1 className="text-[clamp(25px,3vw,32px)] font-semibold tracking-[-0.02em] text-ink">
          درآمدها
        </h1>
        <p className="mt-2.5 max-w-[52ch] text-[15.5px] leading-[1.95] text-ink-2 text-pretty">
          درآمد کلاس‌ها و وضعیت تسویه‌های ثبت‌شده را اینجا ببین.
        </p>
      </header>

      {error ? (
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <p className="alert-error flex-1">{error}</p>
          <button type="button" className="btn-quiet" onClick={() => void load()}>
            تلاش دوباره
          </button>
        </div>
      ) : null}

      {!earnings && !error ? (
        <EarningsSkeleton />
      ) : earnings && !hasAccountActivity ? (
        <section className="rule-top mt-10 pt-9 md:mt-13 md:pt-10">
          <EmptyState
            title="هنوز درآمدی ثبت نشده است."
            action={<Link href="/teacher" className="btn-ghost">دیدن کلاس‌ها ←</Link>}
          >
            بعد از نخستین کلاس پرداخت‌شده، جمع‌ها و ریز دفتر کل اینجا نمایش داده
            می‌شوند.
          </EmptyState>
        </section>
      ) : earnings ? (
        <>
          <EarningsSummary earnings={earnings} />

          <InlineNotice tone="wood" className="mt-7 max-w-[74ch]">
            تسویه در حال حاضر ماهانه و دستی است. «مانده قابل تسویه» همان عددی
            است که سرور برای پرداخت بعدی نگه می‌دارد.
          </InlineNotice>

          <Ledger entries={earnings.entries} />
        </>
      ) : null}
    </div>
  );
}

function EarningsSummary({ earnings }: { earnings: Earnings }) {
  return (
    <section className="mt-8 grid items-start gap-5 border-t border-divider pt-7 md:mt-10 md:grid-cols-[1.4fr_1fr_1fr] md:gap-0 md:pt-8">
      <div className="md:pe-8">
        <p className="text-[13.5px] text-meta">درآمد ناخالص ثبت‌شده</p>
        <p className="mt-2 flex flex-wrap items-baseline gap-2">
          <bdi dir="ltr" className="text-[clamp(30px,4.4vw,40px)] font-semibold tracking-[-0.02em] text-ink">
            {formatLedgerToman(earnings.gross)}
          </bdi>
          <span className="text-[15px] text-ink-2">تومان</span>
        </p>
        <p className="mt-2 text-[13.5px] text-meta">
          سهم پلتفرم: <bdi dir="ltr">{formatLedgerToman(earnings.commission)}</bdi> تومان
        </p>
      </div>
      <SummaryCell label="مانده قابل تسویه" amount={earnings.outstanding} dot="bg-wood-light" />
      <SummaryCell label="تسویه‌شده" amount={earnings.paidOut} dot="bg-violet" />
    </section>
  );
}

function SummaryCell({ label, amount, dot }: { label: string; amount: string; dot: string }) {
  return (
    <div className="border-t border-divider pt-5 md:border-t-0 md:border-s md:ps-8 md:pt-0">
      <p className="flex items-center gap-2 text-[13.5px] text-meta">
        <span className={`size-1.5 rounded-full ${dot}`} />
        {label}
      </p>
      <p className="mt-2 text-[19px] text-ink">
        <bdi dir="ltr">{formatLedgerToman(amount)}</bdi>{" "}
        <span className="text-[13.5px] text-ink-2">تومان</span>
      </p>
    </div>
  );
}

function Ledger({ entries }: { entries: Earnings["entries"] }) {
  return (
    <section className="mt-9 md:mt-10">
      <SectionMark tone="wood">ریز درآمد</SectionMark>

      {entries.length === 0 ? (
        <div className="mt-7 border-t border-divider pt-7">
          <EmptyState quiet title="دفتر کل هنوز سطری ندارد.">
            درآمد، بازپرداخت، تعدیل و تسویه‌ها بعد از ثبت واقعی اینجا دیده
            می‌شوند.
          </EmptyState>
        </div>
      ) : (
        <div className="mt-5">
          <div className="hidden grid-cols-[1.6fr_1fr_1fr_1fr_24px] gap-4 px-1 pb-2.5 text-[12.5px] text-meta min-[861px]:grid">
            <span>شرح</span>
            <span>تاریخ</span>
            <span>نوع سطر</span>
            <span>مبلغ خالص</span>
            <span />
          </div>
          {entries.map((entry, index) => {
            const negative = entry.net.startsWith("-");
            return (
              <details key={`${entry.createdAt}-${index}`} className="group border-t border-divider">
                <summary className="grid min-h-11 cursor-pointer grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 px-1 py-4 transition-colors hover:bg-surface-2 min-[861px]:grid-cols-[1.6fr_1fr_1fr_1fr_24px] min-[861px]:gap-4">
                  <span className="min-w-0 text-[14.5px] text-ink">{entry.description}</span>
                  <span className="text-end text-[13px] text-ink-2 min-[861px]:text-start">
                    {formatTehranJalaliDate(entry.createdAt)}
                  </span>
                  <span className="col-span-2 text-[13px] text-meta min-[861px]:col-span-1">
                    {ledgerTypeLabel(entry.type)}
                  </span>
                  <span className={`text-[14.5px] min-[861px]:text-start ${negative ? "text-wood-light" : "text-ink"}`}>
                    <bdi dir="ltr">{formatLedgerToman(entry.net)}</bdi>{" "}تومان
                  </span>
                  <ChevronDownIcon className="mx-auto text-meta transition-transform group-open:rotate-180" />
                </summary>
                <div className="pb-5">
                  <div className="grid gap-4 rounded-panel bg-surface-2 p-4.5 shadow-[inset_0_0_0_1px_var(--color-divider)] sm:grid-cols-3 md:p-5">
                    <LedgerAmount label="مبلغ ناخالص" amount={entry.gross} />
                    <LedgerAmount label="سهم پلتفرم" amount={entry.commission} />
                    <LedgerAmount label="خالص سطر" amount={entry.net} />
                    <p className="sm:col-span-3 text-[13px] leading-[1.9] text-meta">
                      این ارقام عیناً از دفتر کل سرور نمایش داده می‌شوند؛ سطرهای
                      بازپرداخت یا تعدیل می‌توانند منفی باشند.
                    </p>
                  </div>
                </div>
              </details>
            );
          })}
          <div className="border-t border-divider" />
        </div>
      )}
    </section>
  );
}

function LedgerAmount({ label, amount }: { label: string; amount: string }) {
  return (
    <div>
      <p className="text-[12.5px] text-meta">{label}</p>
      <p className="mt-1 text-sm text-ink"><bdi dir="ltr">{formatLedgerToman(amount)}</bdi> تومان</p>
    </div>
  );
}

function EarningsSkeleton() {
  return (
    <div className="mt-10" aria-label="در حال بارگذاری درآمدها">
      <div className="grid gap-5 border-t border-divider pt-8 md:grid-cols-[1.4fr_1fr_1fr] md:gap-8">
        <div><Skeleton className="h-4 w-36" /><Skeleton className="mt-3 h-11 w-52 max-w-full" delay={1} /><Skeleton className="mt-3 h-3.5 w-44" delay={2} /></div>
        <div><Skeleton className="h-4 w-32" delay={1} /><Skeleton className="mt-3 h-7 w-36" delay={2} /></div>
        <div><Skeleton className="h-4 w-28" delay={2} /><Skeleton className="mt-3 h-7 w-36" /></div>
      </div>
      <Skeleton className="mt-9 h-4 w-24" />
      <div className="mt-5 space-y-px bg-divider">
        <Skeleton className="h-16 w-full rounded-none" delay={1} />
        <Skeleton className="h-16 w-full rounded-none" delay={2} />
        <Skeleton className="h-16 w-full rounded-none" />
      </div>
    </div>
  );
}
