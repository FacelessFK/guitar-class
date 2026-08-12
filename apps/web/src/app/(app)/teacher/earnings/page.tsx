"use client";

import { useEffect, useState } from "react";

import { errorMessage } from "@/lib/api-client";
import { getEarnings, type Earnings } from "@/lib/app-api";
import { formatJalaliDate, formatToman } from "@/lib/format";

/**
 * درآمد استاد.
 *
 * `net` همان چیزی است که در تسویه پرداخت می‌شود و از پیش خالص است:
 * بازپرداخت در دفتر کل سطر **منفی** است، نه ویرایش سطر درآمد، پس جمع
 * ساده‌ی ستون خالص عدد درست را می‌دهد و هیچ‌جا «منهای بازپرداخت‌ها»
 * حساب نمی‌شود.
 *
 * تسویه در این فاز دستی و ماهانه است (سند معماری، بخش ۴.۵)، پس این
 * صفحه فقط گزارش است و هیچ دکمه‌ی «درخواست تسویه» ندارد که به جایی
 * وصل نباشد.
 */
export default function EarningsPage() {
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getEarnings()
      .then(setEarnings)
      .catch((caught: unknown) => setError(errorMessage(caught)));
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-2xl font-bold">درآمد</h1>

      {error ? <p className="alert-error mt-6">{error}</p> : null}

      {earnings === null ? (
        <p className="mt-8 text-sm text-ink-muted">در حال بارگذاری…</p>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <Total label="ناخالص" amount={earnings.gross} />
            <Total label="سهم پلتفرم" amount={earnings.commission} />
            <Total label="سهم شما" amount={earnings.net} emphasis />
          </div>

          <p className="alert-info mt-6">
            تسویه در حال حاضر ماهانه و دستی انجام می‌شود. «سهم شما» همان مبلغی
            است که پرداخت می‌شود.
          </p>

          <section className="mt-10">
            <h2 className="text-lg font-bold">گردش حساب</h2>

            {earnings.entries.length === 0 ? (
              <p className="mt-4 text-sm text-ink-muted">
                هنوز تراکنشی ثبت نشده است.
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {earnings.entries.map((entry, index) => (
                  <li
                    key={`${entry.createdAt}-${index}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-sm"
                  >
                    {/*
                      نوع سطر جدا نوشته نمی‌شود.
                      شرحی که دفتر کل ذخیره می‌کند خودش نوعش را می‌گوید
                      («درآمد جلسه»، «بازپرداخت لغو جلسه»)، و کنار هم
                      گذاشتنشان یعنی هر سطر یک کلمه را دو بار تکرار کند.
                    */}
                    <div>
                      <p>{entry.description}</p>
                      <p className="text-ink-muted">
                        {formatJalaliDate(entry.createdAt.slice(0, 10))}
                      </p>
                    </div>

                    {/*
                      مبلغ منفی با یک منهای صریح نشان داده می‌شود، نه
                      فقط با رنگ: سطر بازپرداخت باید در نگاه اول از سطر
                      درآمد قابل تشخیص باشد، حتی چاپ‌شده یا سیاه‌وسفید.
                    */}
                    <span
                      className={
                        entry.net.startsWith("-") ? "text-ink-muted" : "font-medium"
                      }
                    >
                      {signedToman(entry.net)} تومان
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Total({
  label,
  amount,
  emphasis = false,
}: {
  label: string;
  amount: string;
  emphasis?: boolean;
}) {
  return (
    <div className="card">
      <p className="text-sm text-ink-muted">{label}</p>
      <p className={`mt-2 ${emphasis ? "text-xl font-bold" : "text-lg"}`}>
        {signedToman(amount)} <span className="text-sm font-normal">تومان</span>
      </p>
    </div>
  );
}

/**
 * مبلغ علامت‌دار.
 *
 * `formatToman` روی `bigint` منفی هم کار می‌کند، ولی `Intl` علامت را
 * سمت درست RTL نمی‌گذارد و «−۱۲۳» گاهی «۱۲۳−» دیده می‌شود. علامت
 * دستی و جدا از عدد نوشته می‌شود.
 */
function signedToman(rial: string): string {
  return rial.startsWith("-")
    ? `${formatToman(rial.slice(1))}−`
    : formatToman(rial);
}
